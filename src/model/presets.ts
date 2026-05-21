import { placeBlock } from "./placement";
import { getVisibleTimelineYears } from "./timeline";
import type {
  CustomBlock,
  HalfTerm,
  PlacedBlock,
  PlacedBlockSource,
  SavedPreset,
  SavedPresetCustomBlock,
  SavedPresetPlacement,
  Subject,
  SubTopic,
  Timeline,
  Topic,
} from "./types";

/**
 * The bundled example physics spec ships with the algorithmic presets pre-
 * tuned. For any imported subject, those algorithms haven't been calibrated,
 * so we hide them — the user authors saved presets instead (DEC-045). Detect
 * via the canonical example filename set in ViewPlaceholder.loadExample.
 */
export const EXAMPLE_SUBJECT_FILENAME = "example_physics_spec.xlsx";

export function isExampleSubject(subject: Subject): boolean {
  return subject.meta.sourceFilename === EXAMPLE_SUBJECT_FILENAME;
}

/**
 * Preset layout algorithms. Each one takes a Subject (with its working spec
 * and timeline) and produces a fresh Timeline with sub-topic placements laid
 * out according to a different pedagogical strategy:
 *
 *   - "three-spiral":   each sub-topic touched THREE times across the timeline.
 *                       Foundation passes first (segments 1+2); depth + the
 *                       third revisit pass in segment 3. Strong spacing.
 *
 *   - "frontloaded":    every sub-topic placed ONCE. Foundation content in
 *                       source order across the front of the timeline; depth
 *                       content (config.includeDepth required) across the
 *                       back. "Distributed-depth" — depth distributed evenly
 *                       across the final segment rather than mixed in early.
 *
 *   - "interleaved":    every sub-topic placed ONCE. Round-robin across
 *                       topics so neighbouring placements are from DIFFERENT
 *                       topics, encouraging discrimination practice within
 *                       each half-term.
 *
 * All algorithms:
 *   - Honour `subject.config.includeDepth` — depth sub-topics are skipped
 *     when this is off, regardless of preset.
 *   - Honour `subject.config.hiddenYears` — hidden years receive no placements.
 *   - Preserve EoHT placements and custom blocks already in the timeline.
 *   - Are deterministic (no RNG); same input → same output.
 *
 * The presets are intentionally simple and tunable in this one file. They're
 * pedagogical starting points the teacher refines via drag-and-drop, not a
 * "best plan" — there is no such thing for a given spec, only a plan for a
 * given learning theory.
 */

export type PresetId = "three-spiral" | "frontloaded" | "interleaved";

export interface PresetDescriptor {
  readonly id: PresetId;
  readonly name: string;
  readonly subtitle: string;
  readonly description: string;
  readonly bestFor: string;
}

export const PRESET_DESCRIPTORS: readonly PresetDescriptor[] = [
  {
    id: "three-spiral",
    name: "Three-spiral",
    subtitle: "Each sub-topic touched three times across the timeline",
    description:
      "Splits every sub-topic into three passes spread across thirds of the visible " +
      "timeline. Foundation content drives passes 1 and 2; depth content joins the " +
      "third revisit. Strong spacing — content comes back several times before exam " +
      "season. Trades depth-per-pass for retention.",
    bestFor:
      "Long-haul KS3-KS4 specs where you want material to come back multiple times " +
      "before exams.",
  },
  {
    id: "frontloaded",
    name: "Frontloaded · distributed depth",
    subtitle: "Foundation early, depth content saved for the back half",
    description:
      "Single linear pass per sub-topic. Foundation (non-depth) sub-topics are placed " +
      "in source order across the front two-thirds of the timeline; depth sub-topics " +
      "are distributed across the final third. Maximises depth-of-treatment per topic " +
      "at the cost of weaker spacing.",
    bestFor:
      "Specs where exam timing is fixed and you want the hardest content delivered " +
      "while it's freshest. Good fit for one-year GCSE intensives.",
  },
  {
    id: "interleaved",
    name: "Single-pass interleaved",
    subtitle: "One pass through every sub-topic, mixed across topics",
    description:
      "Visits sub-topics in a round-robin across topics so neighbouring placements " +
      "are from DIFFERENT topics whenever possible. Encourages discrimination " +
      "practice within each half-term (e.g. forces next to energy next to waves) " +
      "rather than topic blocks.",
    bestFor:
      "Cohorts that need variety to stay engaged — natural cross-topic linking, " +
      "stronger conceptual contrast.",
  },
];

export function getPresetDescriptor(id: PresetId): PresetDescriptor {
  const found = PRESET_DESCRIPTORS.find((p) => p.id === id);
  if (!found) {
    throw new Error(`getPresetDescriptor: unknown preset "${id}"`);
  }
  return found;
}

// ============================================================
// Internal: a "planned placement" describes one block we'll drop
// into the timeline. preferredCellIdx is an index into the visible-cells
// list — spillover may push the block forward from there.
// ============================================================

interface PlannedPlacement {
  readonly subTopic: SubTopic;
  readonly topic: Topic;
  readonly lessons: number;
  /** Index into `visibleCells`; the placement starts here unless it's full. */
  readonly preferredCellIdx: number;
}

export interface ApplyPresetOptions {
  /** Deterministic id generator for placed blocks (tests). */
  readonly idGen?: () => string;
}

/**
 * Apply a preset layout to a subject, returning a NEW Timeline. The subject
 * itself is not mutated. Existing EoHT placements and custom blocks are
 * preserved; existing sub-topic placements are dropped before the preset
 * lays out its own.
 *
 * Callers (the store action) decide whether to confirm with the user first;
 * this function is pure and returns the new Timeline unconditionally.
 */
export function applyPreset(
  subject: Subject,
  presetId: PresetId,
  options: ApplyPresetOptions = {}
): Timeline {
  const cleared = clearSubTopicPlacements(subject.timeline);
  const visibleCells = getVisibleCells(subject);
  const plan = buildPlan(subject, presetId, visibleCells.length);
  return executePlan(cleared, plan, visibleCells, options);
}

// ============================================================
// Step 1: Clear sub-topic placements while preserving EoHTs and customs.
// ============================================================

function clearSubTopicPlacements(timeline: Timeline): Timeline {
  return {
    halfTerms: timeline.halfTerms.map(
      (ht): HalfTerm => ({
        ...ht,
        placedBlocks: ht.placedBlocks.filter(
          (b) => b.source.kind !== "sub-topic"
        ),
      })
    ),
  };
}

// ============================================================
// Step 2: Build the plan for the chosen preset.
//   - Compute `visibleCells` once (skip hidden years).
//   - Build a per-subTopic list filtered by config.includeDepth.
//   - Dispatch to the preset-specific builder.
// ============================================================

interface SubTopicWithTopic {
  readonly topic: Topic;
  readonly subTopic: SubTopic;
}

function buildPlan(
  subject: Subject,
  presetId: PresetId,
  visibleCellCount: number
): readonly PlannedPlacement[] {
  if (visibleCellCount === 0) return [];

  const all: SubTopicWithTopic[] = [];
  for (const topic of subject.workingSpec.topics) {
    for (const subTopic of topic.subTopics) {
      const isDepth = isSubTopicDepth(subTopic);
      if (isDepth && !subject.config.includeDepth) continue;
      if (subTopic.lessons.length === 0) continue;
      all.push({ topic, subTopic });
    }
  }
  if (all.length === 0) return [];

  switch (presetId) {
    case "three-spiral":
      return planThreeSpiral(all, visibleCellCount);
    case "frontloaded":
      return planFrontloaded(all, visibleCellCount);
    case "interleaved":
      return planInterleaved(all);
    default:
      throw new Error(`buildPlan: unknown preset "${presetId as string}"`);
  }
}

function getVisibleCells(subject: Subject): readonly HalfTerm[] {
  const visible = new Set(getVisibleTimelineYears(subject));
  return subject.timeline.halfTerms.filter((ht) => visible.has(ht.year));
}

/**
 * A sub-topic is "exclusively depth" only when EVERY lesson inside it is
 * flagged depth (DEC-040). Mixed sub-topics (some foundation + some depth
 * lessons) are treated as foundation — they still get placed by presets,
 * and the `includeDepth=false` toggle filters individual depth lessons at
 * the consumer level (analytics, exports, renderer).
 *
 * Relies on the importer setting `subTopic.isDepth` correctly (every lesson
 * is depth) — see `import.ts` `subIsDepth` aggregation.
 */
function isSubTopicDepth(subTopic: SubTopic): boolean {
  if (subTopic.lessons.length === 0) return false;
  return subTopic.lessons.every((l) => l.isDepth);
}

// ============================================================
// Preset: three-spiral (topic-first, DEC-042)
//
// Each sub-topic is placed ONCE with its full lesson count. The "spiral"
// comes from each TOPIC's sub-topics being distributed across three
// segments of the timeline — so a teacher revisits a topic via DIFFERENT
// sub-topics across the year, building on prior knowledge.
//
// Algorithm per topic:
//   1. Order the topic's sub-topics: foundation first (source order), then
//      depth (source order). Skip depth entries entirely when
//      `config.includeDepth=false`.
//   2. Distribute them across 3 passes as evenly as possible. A topic with
//      N sub-topics produces:
//        - N=1 → pass 1 only (single placement, no spiral possible)
//        - N=2 → passes 1, 2
//        - N=3 → passes 1, 2, 3
//        - N>3 → ceil(N/3), N-2*floor(N/3), floor(N/3) (front-weighted)
//      Depth sub-topics get pushed towards pass 3 within their bucket.
//   3. Each placement consumes the sub-topic's FULL lesson count — no
//      fractional pass-splitting (that was the v1 bug — DEC-038).
//
// Emit order: all pass-1 placements first (in topic source order, so
// foundation sub-topics from every topic land in segment 1), then pass-2,
// then pass-3. The placement engine packs each pass into its segment via
// spillover. Result: each segment becomes a topic-interleaved block of
// foundation content, with the third segment also picking up depth.
// ============================================================

function planThreeSpiral(
  all: readonly SubTopicWithTopic[],
  cellCount: number
): readonly PlannedPlacement[] {
  const seg1Start = 0;
  const seg2Start = Math.floor(cellCount / 3);
  const seg3Start = Math.floor((2 * cellCount) / 3);
  const segStarts = [seg1Start, seg2Start, seg3Start] as const;

  // Group by topic, preserving spec source order.
  const byTopic = new Map<string, SubTopicWithTopic[]>();
  const topicOrder: Topic[] = [];
  for (const entry of all) {
    const existing = byTopic.get(entry.topic.id);
    if (existing) {
      existing.push(entry);
    } else {
      byTopic.set(entry.topic.id, [entry]);
      topicOrder.push(entry.topic);
    }
  }

  // For each topic, decide which pass each sub-topic lands in.
  // Returns Map<subTopicId, passIdx (0|1|2)>.
  const passAssignment = new Map<string, 0 | 1 | 2>();
  for (const topic of topicOrder) {
    const subs = byTopic.get(topic.id) ?? [];
    // Within a topic: foundation sub-topics first (preserve source order),
    // then depth sub-topics (also source order). Pushes depth content
    // towards later passes naturally.
    const ordered = [
      ...subs.filter((s) => !isSubTopicDepth(s.subTopic)),
      ...subs.filter((s) => isSubTopicDepth(s.subTopic)),
    ];
    const n = ordered.length;
    if (n === 0) continue;

    // Distribute n items across 3 passes (1 | 2 | 3-or-more cases).
    // For n>3, front-weight: ceil(n/3) in pass 1, then ceil((n - p1) / 2),
    // remainder in pass 3. This keeps the foundation-heavy early passes.
    let p1: number, p2: number;
    if (n === 1) {
      p1 = 1; p2 = 0;
    } else if (n === 2) {
      p1 = 1; p2 = 1;
    } else if (n === 3) {
      p1 = 1; p2 = 1;
    } else {
      p1 = Math.ceil(n / 3);
      p2 = Math.ceil((n - p1) / 2);
    }
    const p3 = n - p1 - p2;

    let idx = 0;
    for (let k = 0; k < p1; k++) {
      const entry = ordered[idx++];
      if (entry) passAssignment.set(entry.subTopic.id, 0);
    }
    for (let k = 0; k < p2; k++) {
      const entry = ordered[idx++];
      if (entry) passAssignment.set(entry.subTopic.id, 1);
    }
    for (let k = 0; k < p3; k++) {
      const entry = ordered[idx++];
      if (entry) passAssignment.set(entry.subTopic.id, 2);
    }
  }

  // Emit pass-by-pass in topic source order — this interleaves topics
  // within each pass's segment (T1.sub from pass1 → T2.sub from pass1 →
  // T3.sub from pass1 → … → T1.sub from pass2 → T2.sub from pass2 → …).
  const out: PlannedPlacement[] = [];
  for (const passIdx of [0, 1, 2] as const) {
    for (const entry of all) {
      const assigned = passAssignment.get(entry.subTopic.id);
      if (assigned !== passIdx) continue;
      out.push({
        topic: entry.topic,
        subTopic: entry.subTopic,
        lessons: entry.subTopic.lessons.length,
        preferredCellIdx: segStarts[passIdx]!,
      });
    }
  }
  return out;
}

// ============================================================
// Preset: frontloaded
//   Foundation sub-topics in source order across the front ~2/3 of
//   the timeline. Depth sub-topics across the final ~1/3.
//   Each sub-topic placed ONCE with its full lesson count.
// ============================================================

function planFrontloaded(
  all: readonly SubTopicWithTopic[],
  cellCount: number
): readonly PlannedPlacement[] {
  const foundation = all.filter((e) => !isSubTopicDepth(e.subTopic));
  const depth = all.filter((e) => isSubTopicDepth(e.subTopic));
  const depthStart = Math.floor((2 * cellCount) / 3);

  const out: PlannedPlacement[] = [];
  // Foundation: start at cell 0; spillover handles distribution forward.
  // The placement engine packs sequentially, so all foundation sub-topics
  // land in source order.
  for (const entry of foundation) {
    out.push({
      topic: entry.topic,
      subTopic: entry.subTopic,
      lessons: entry.subTopic.lessons.length,
      preferredCellIdx: 0,
    });
  }
  // Depth: start at the 2/3 mark.
  for (const entry of depth) {
    out.push({
      topic: entry.topic,
      subTopic: entry.subTopic,
      lessons: entry.subTopic.lessons.length,
      preferredCellIdx: depthStart,
    });
  }
  return out;
}

// ============================================================
// Preset: interleaved
//   Round-robin across topics. We collect each topic's sub-topics
//   as a queue, then repeatedly take the FIRST sub-topic from each
//   non-empty topic queue in source order, advancing through the
//   timeline as we go.
//
//   The result: T1.a, T2.a, T3.a, …, T15.a, T1.b, T2.b, T3.b, …
//   With 15 topics and 33 sub-topics, that's ~3 round-robin rounds.
// ============================================================

function planInterleaved(
  all: readonly SubTopicWithTopic[]
  // cellCount unused: single linear pass, start at 0
): readonly PlannedPlacement[] {
  // Bucket sub-topics by topic id, preserving source order within each topic.
  const byTopic = new Map<string, SubTopicWithTopic[]>();
  const topicOrder: Topic[] = [];
  for (const entry of all) {
    const existing = byTopic.get(entry.topic.id);
    if (existing) {
      existing.push(entry);
    } else {
      byTopic.set(entry.topic.id, [entry]);
      topicOrder.push(entry.topic);
    }
  }

  // Round-robin: each round takes the first sub-topic from every non-empty
  // queue, in topic source order. Continue until all queues are empty.
  const out: PlannedPlacement[] = [];
  let anyLeft = true;
  while (anyLeft) {
    anyLeft = false;
    for (const topic of topicOrder) {
      const queue = byTopic.get(topic.id);
      if (!queue || queue.length === 0) continue;
      const next = queue.shift();
      if (!next) continue;
      out.push({
        topic: next.topic,
        subTopic: next.subTopic,
        lessons: next.subTopic.lessons.length,
        preferredCellIdx: 0,
      });
      if (queue.length > 0) anyLeft = true;
    }
  }
  return out;
}

// ============================================================
// Step 3: Execute the plan against the cleared timeline.
//   For each planned placement, drop the whole block into its preferred
//   cell with placeBlock — no auto-spillover (removed per DEC-056). If
//   the cell ends up over-budget, the UI flags it and the teacher
//   reshuffles by hand. The presets are meant as a rough starting point,
//   not a final layout.
// ============================================================

function executePlan(
  timeline: Timeline,
  plan: readonly PlannedPlacement[],
  visibleCells: readonly HalfTerm[],
  options: ApplyPresetOptions
): Timeline {
  if (plan.length === 0) return timeline;
  if (visibleCells.length === 0) return timeline;

  let next = timeline;
  for (const p of plan) {
    const idx = Math.min(p.preferredCellIdx, visibleCells.length - 1);
    const cell = visibleCells[idx];
    if (!cell) continue;
    const source: PlacedBlockSource = {
      kind: "sub-topic",
      subTopicCode: p.subTopic.code,
    };
    next = placeBlock(next, source, cell.id, p.lessons, options);
  }
  return next;
}

// ============================================================
// Public helper: which sub-topics will receive placements under a given
// preset? Useful for the preview-before-apply UI flow.
// ============================================================

export interface PresetSummary {
  readonly presetId: PresetId;
  readonly placementCount: number;
  readonly totalLessonsPlaced: number;
  readonly distinctSubTopics: number;
  readonly skippedDepthSubTopics: readonly string[];
}

export function summarisePreset(subject: Subject, presetId: PresetId): PresetSummary {
  const visibleCellCount = getVisibleCells(subject).length;
  const plan = buildPlan(subject, presetId, visibleCellCount);
  const total = plan.reduce((s, p) => s + p.lessons, 0);
  const distinct = new Set(plan.map((p) => p.subTopic.code)).size;
  const skipped: string[] = [];
  if (!subject.config.includeDepth) {
    for (const topic of subject.workingSpec.topics) {
      for (const subTopic of topic.subTopics) {
        if (isSubTopicDepth(subTopic)) skipped.push(subTopic.code);
      }
    }
  }
  return {
    presetId,
    placementCount: plan.length,
    totalLessonsPlaced: total,
    distinctSubTopics: distinct,
    skippedDepthSubTopics: skipped,
  };
}

// ============================================================
// Re-exports for tests that want to inspect intermediates.
// (Not part of the public surface — kept here so the store doesn't have
// access to internals it shouldn't depend on.)
// ============================================================

/** @internal */
export function __clearSubTopicPlacements(timeline: Timeline): Timeline {
  return clearSubTopicPlacements(timeline);
}

/** @internal */
export function __isSubTopicDepth(subTopic: SubTopic): boolean {
  return isSubTopicDepth(subTopic);
}

// Re-export for use in surrounding code that wants to filter placed blocks
// before/after applying a preset.
export type { PlacedBlock };

// ============================================================
// Saved presets (DEC-045)
//
// Capture the current sub-topic placements + custom blocks (with their
// placements) into a portable structure that lives on the Subject. Applying
// a saved preset later restores both layers atomically.
//
// References:
//   - Sub-topic placements use the importer's stable code (T1, T1a, …) so the
//     preset survives spec-edits as long as the code does.
//   - Custom blocks use a preset-local `ref` ("cb1", "cb2", …). Applying a
//     preset always mints fresh CustomBlock IDs in the target subject.
// ============================================================

export interface SaveCurrentPresetOptions {
  readonly name: string;
  readonly description?: string;
  readonly now?: Date;
  readonly idGen?: () => string;
}

/**
 * Snapshot a subject's current timeline + custom blocks as a SavedPreset.
 * Walks the timeline once, dedups custom blocks that contributed any
 * placement, and emits stable preset-local refs (cb1, cb2, …) in first-seen
 * order. The Subject itself is not mutated.
 */
export function saveCurrentAsPreset(
  subject: Subject,
  options: SaveCurrentPresetOptions
): SavedPreset {
  const idGen = options.idGen ?? (() => crypto.randomUUID());
  const now = options.now ?? new Date();

  // Walk in timeline order so the preset's "natural" emit order matches what
  // the user sees on screen. Half-term ordering follows the Timeline; within
  // each half-term we preserve the placedBlocks order.
  const customRefByBlockId = new Map<string, string>();
  const usedCustomBlocks: CustomBlock[] = [];
  const placements: SavedPresetPlacement[] = [];

  for (const ht of subject.timeline.halfTerms) {
    for (const pb of ht.placedBlocks) {
      if (pb.source.kind === "sub-topic") {
        placements.push({
          halfTermId: ht.id,
          source: { kind: "sub-topic", subTopicCode: pb.source.subTopicCode },
          lessonsClaimed: pb.lessonsClaimed,
          lessonRange: [pb.lessonRange[0], pb.lessonRange[1]],
        });
      } else if (pb.source.kind === "custom") {
        const customBlockId = pb.source.customBlockId;
        let ref = customRefByBlockId.get(customBlockId);
        if (!ref) {
          const cb = subject.customBlocks.find((c) => c.id === customBlockId);
          if (!cb) continue; // dangling placement; skip
          ref = `cb${usedCustomBlocks.length + 1}`;
          customRefByBlockId.set(customBlockId, ref);
          usedCustomBlocks.push(cb);
        }
        placements.push({
          halfTermId: ht.id,
          source: { kind: "custom", customBlockRef: ref },
          lessonsClaimed: pb.lessonsClaimed,
          lessonRange: [pb.lessonRange[0], pb.lessonRange[1]],
        });
      }
      // eoht placements are legacy v1.x; v2 files have already been migrated
      // (DEC-044) so we don't need to handle them here.
    }
  }

  const customBlocks: SavedPresetCustomBlock[] = usedCustomBlocks.map((cb, i) => {
    const ref = `cb${i + 1}`;
    const out: SavedPresetCustomBlock = {
      ref,
      name: cb.name,
      lessons: cb.lessons,
      colour: cb.colour ?? null,
      category: cb.category ?? "other",
      ...(cb.label ? { label: cb.label } : {}),
      ...(cb.revisits && cb.revisits.length > 0 ? { revisits: [...cb.revisits] } : {}),
      ...(cb.isEoHT ? { isEoHT: true } : {}),
    };
    return out;
  });

  const result: SavedPreset = {
    id: idGen(),
    name: options.name,
    ...(options.description ? { description: options.description } : {}),
    createdAt: now.toISOString(),
    customBlocks,
    placements,
  };
  return result;
}

export interface ApplySavedPresetResult {
  readonly subject: Subject;
  readonly orphans: SavedPresetOrphans;
}

export interface SavedPresetOrphans {
  /** Sub-topic codes in the preset that don't exist in the subject's working spec. */
  readonly unmatchedSubTopicCodes: readonly string[];
  /** Custom-block refs that the preset placements named but no matching
   *  SavedPresetCustomBlock entry exists for. */
  readonly unmatchedCustomRefs: readonly string[];
  /** Half-term ids in the preset that aren't in the subject's timeline. */
  readonly unmatchedHalfTermIds: readonly string[];
  /** Total placements skipped because of any of the above. */
  readonly skippedPlacements: number;
}

export interface ApplySavedPresetOptions {
  readonly idGen?: () => string;
}

/**
 * Apply a saved preset to a subject. Returns a new Subject with:
 *   - All sub-topic placements cleared and rebuilt from the preset.
 *   - All custom blocks cleared and rebuilt from the preset's custom blocks
 *     (each one given a fresh id; the preset-local `ref` survives only inside
 *     this function as a placement lookup key).
 *   - Custom-kind placements pointing at the freshly-minted custom-block ids.
 *
 * Anything in the preset that can't be matched (unknown sub-topic code,
 * unknown ref, missing half-term) is collected into `orphans` so the caller
 * can show a "{N} placements were skipped" notice.
 */
export function applySavedPreset(
  subject: Subject,
  preset: SavedPreset,
  options: ApplySavedPresetOptions = {}
): ApplySavedPresetResult {
  const idGen = options.idGen ?? (() => crypto.randomUUID());

  const validSubTopicCodes = new Set<string>();
  for (const t of subject.workingSpec.topics) {
    for (const s of t.subTopics) validSubTopicCodes.add(s.code);
  }
  const halfTermIndex = new Map<string, number>();
  subject.timeline.halfTerms.forEach((ht, i) => halfTermIndex.set(ht.id, i));

  // Mint fresh custom blocks from the preset.
  const refToCustomId = new Map<string, string>();
  const customBlocks: CustomBlock[] = preset.customBlocks.map((pcb) => {
    const id = idGen();
    refToCustomId.set(pcb.ref, id);
    const out: CustomBlock = {
      id,
      name: pcb.name,
      lessons: pcb.lessons,
      colour: pcb.colour,
      isEoHT: pcb.isEoHT === true,
      category: pcb.category,
      ...(pcb.label ? { label: pcb.label } : {}),
      ...(pcb.revisits ? { revisits: [...pcb.revisits] } : {}),
    };
    return out;
  });

  // Build a fresh half-terms array with all sub-topic + custom placements
  // wiped, ready to accept the preset's placements.
  const wipedHalfTerms: HalfTerm[] = subject.timeline.halfTerms.map((ht) => ({
    ...ht,
    placedBlocks: ht.placedBlocks.filter(
      (b) => b.source.kind !== "sub-topic" && b.source.kind !== "custom"
    ),
  }));

  const orphans = {
    unmatchedSubTopicCodes: new Set<string>(),
    unmatchedCustomRefs: new Set<string>(),
    unmatchedHalfTermIds: new Set<string>(),
  };
  let skipped = 0;

  for (const p of preset.placements) {
    const htIdx = halfTermIndex.get(p.halfTermId);
    if (htIdx === undefined) {
      orphans.unmatchedHalfTermIds.add(p.halfTermId);
      skipped++;
      continue;
    }
    let source: PlacedBlockSource;
    if (p.source.kind === "sub-topic") {
      if (!validSubTopicCodes.has(p.source.subTopicCode)) {
        orphans.unmatchedSubTopicCodes.add(p.source.subTopicCode);
        skipped++;
        continue;
      }
      source = { kind: "sub-topic", subTopicCode: p.source.subTopicCode };
    } else {
      const customId = refToCustomId.get(p.source.customBlockRef);
      if (!customId) {
        orphans.unmatchedCustomRefs.add(p.source.customBlockRef);
        skipped++;
        continue;
      }
      source = { kind: "custom", customBlockId: customId };
    }
    const pb: PlacedBlock = {
      id: idGen(),
      source,
      lessonsClaimed: p.lessonsClaimed,
      lessonRange: [p.lessonRange[0], p.lessonRange[1]],
      userEdits: {},
    };
    const ht = wipedHalfTerms[htIdx];
    if (!ht) continue; // index guarded above
    wipedHalfTerms[htIdx] = {
      ...ht,
      placedBlocks: [...ht.placedBlocks, pb],
    };
  }

  const nextSubject: Subject = {
    ...subject,
    timeline: { halfTerms: wipedHalfTerms },
    customBlocks,
  };

  return {
    subject: nextSubject,
    orphans: {
      unmatchedSubTopicCodes: [...orphans.unmatchedSubTopicCodes],
      unmatchedCustomRefs: [...orphans.unmatchedCustomRefs],
      unmatchedHalfTermIds: [...orphans.unmatchedHalfTermIds],
      skippedPlacements: skipped,
    },
  };
}

/** Add a preset to a subject's saved list. Returns a new Subject. */
export function addPresetToSubject(subject: Subject, preset: SavedPreset): Subject {
  const presets = [...(subject.presets ?? []), preset];
  return { ...subject, presets };
}

/** Remove a preset by id. Returns a new Subject. No-op if id not present. */
export function deletePresetFromSubject(subject: Subject, presetId: string): Subject {
  const presets = (subject.presets ?? []).filter((p) => p.id !== presetId);
  return { ...subject, presets };
}

/**
 * Parse + validate a JSON blob as a SavedPreset. Used by the "paste preset"
 * import path so the UI can show a friendly error before adding the preset
 * to the subject. Returns the preset on success; throws with a descriptive
 * message on failure (caller renders the message in a toast).
 */
export function parseSavedPresetJson(
  json: string,
  options: { idGen?: () => string; now?: Date } = {}
): SavedPreset {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    throw new Error(`Not valid JSON: ${(e as Error).message}`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Preset must be a JSON object");
  }
  const o = parsed as Record<string, unknown>;
  const name = typeof o["name"] === "string" ? (o["name"] as string).trim() : "";
  if (!name) throw new Error('Missing or empty "name" field');

  const placementsRaw = o["placements"];
  if (!Array.isArray(placementsRaw)) {
    throw new Error('"placements" must be an array');
  }
  const customBlocksRaw = o["customBlocks"];
  if (customBlocksRaw !== undefined && !Array.isArray(customBlocksRaw)) {
    throw new Error('"customBlocks" must be an array when present');
  }

  const customBlocks: SavedPresetCustomBlock[] = (customBlocksRaw ?? []).map(
    (raw: unknown, i: number): SavedPresetCustomBlock => {
      if (typeof raw !== "object" || raw === null) {
        throw new Error(`customBlocks[${i}] must be an object`);
      }
      const cb = raw as Record<string, unknown>;
      const ref = typeof cb["ref"] === "string" ? (cb["ref"] as string) : "";
      if (!ref) throw new Error(`customBlocks[${i}].ref is missing`);
      const cbName = typeof cb["name"] === "string" ? (cb["name"] as string) : "";
      if (!cbName) throw new Error(`customBlocks[${i}].name is missing`);
      const lessons = typeof cb["lessons"] === "number" ? (cb["lessons"] as number) : NaN;
      if (!Number.isFinite(lessons) || lessons < 1) {
        throw new Error(`customBlocks[${i}].lessons must be a positive number`);
      }
      const category = typeof cb["category"] === "string" ? cb["category"] : "other";
      const validCategories = ["test", "lesson", "unit", "assessment", "retrieval", "other"];
      if (!validCategories.includes(category)) {
        throw new Error(
          `customBlocks[${i}].category must be one of ${validCategories.join(", ")}`
        );
      }
      const out: SavedPresetCustomBlock = {
        ref,
        name: cbName,
        lessons,
        colour: typeof cb["colour"] === "string" ? (cb["colour"] as string) : null,
        category: category as SavedPresetCustomBlock["category"],
      };
      if (typeof cb["label"] === "string" && cb["label"]) {
        (out as { label?: string }).label = cb["label"] as string;
      }
      if (Array.isArray(cb["revisits"])) {
        const revisits = (cb["revisits"] as unknown[]).filter(
          (x): x is string => typeof x === "string"
        );
        if (revisits.length > 0) {
          (out as { revisits?: readonly string[] }).revisits = revisits;
        }
      }
      if (cb["isEoHT"] === true) {
        (out as { isEoHT?: boolean }).isEoHT = true;
      }
      return out;
    }
  );

  const validRefs = new Set(customBlocks.map((c) => c.ref));

  const placements: SavedPresetPlacement[] = placementsRaw.map(
    (raw: unknown, i: number): SavedPresetPlacement => {
      if (typeof raw !== "object" || raw === null) {
        throw new Error(`placements[${i}] must be an object`);
      }
      const p = raw as Record<string, unknown>;
      const halfTermId = typeof p["halfTermId"] === "string" ? (p["halfTermId"] as string) : "";
      if (!halfTermId) throw new Error(`placements[${i}].halfTermId is missing`);
      const lessonsClaimed =
        typeof p["lessonsClaimed"] === "number" ? (p["lessonsClaimed"] as number) : NaN;
      if (!Number.isFinite(lessonsClaimed) || lessonsClaimed < 1) {
        throw new Error(`placements[${i}].lessonsClaimed must be a positive number`);
      }
      const lessonRangeRaw = p["lessonRange"];
      if (
        !Array.isArray(lessonRangeRaw) ||
        lessonRangeRaw.length !== 2 ||
        typeof lessonRangeRaw[0] !== "number" ||
        typeof lessonRangeRaw[1] !== "number"
      ) {
        throw new Error(`placements[${i}].lessonRange must be [number, number]`);
      }
      const srcRaw = p["source"];
      if (typeof srcRaw !== "object" || srcRaw === null) {
        throw new Error(`placements[${i}].source must be an object`);
      }
      const s = srcRaw as Record<string, unknown>;
      let source: SavedPresetPlacement["source"];
      if (s["kind"] === "sub-topic") {
        const code = typeof s["subTopicCode"] === "string" ? (s["subTopicCode"] as string) : "";
        if (!code) throw new Error(`placements[${i}].source.subTopicCode is missing`);
        source = { kind: "sub-topic", subTopicCode: code };
      } else if (s["kind"] === "custom") {
        const ref = typeof s["customBlockRef"] === "string" ? (s["customBlockRef"] as string) : "";
        if (!ref) throw new Error(`placements[${i}].source.customBlockRef is missing`);
        if (!validRefs.has(ref)) {
          throw new Error(
            `placements[${i}].source.customBlockRef "${ref}" doesn't match any customBlocks[].ref`
          );
        }
        source = { kind: "custom", customBlockRef: ref };
      } else {
        throw new Error(`placements[${i}].source.kind must be "sub-topic" or "custom"`);
      }
      const out: SavedPresetPlacement = {
        halfTermId,
        source,
        lessonsClaimed,
        lessonRange: [lessonRangeRaw[0] as number, lessonRangeRaw[1] as number],
      };
      return out;
    }
  );

  const idGen = options.idGen ?? (() => crypto.randomUUID());
  const now = options.now ?? new Date();
  const id = typeof o["id"] === "string" && (o["id"] as string).length > 0 ? (o["id"] as string) : idGen();
  const createdAt =
    typeof o["createdAt"] === "string" && (o["createdAt"] as string).length > 0
      ? (o["createdAt"] as string)
      : now.toISOString();
  const description = typeof o["description"] === "string" ? (o["description"] as string) : undefined;

  return {
    id,
    name,
    ...(description ? { description } : {}),
    createdAt,
    customBlocks,
    placements,
  };
}
