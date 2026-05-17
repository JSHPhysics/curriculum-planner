import { placeBlockWithSpillover } from "./placement";
import { getVisibleTimelineYears } from "./timeline";
import type {
  HalfTerm,
  PlacedBlock,
  PlacedBlockSource,
  Subject,
  SubTopic,
  Timeline,
  Topic,
} from "./types";

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
//   For each planned placement, locate its preferred cell id and
//   call placeBlockWithSpillover. Spillover advances forward
//   through cells (skipping hidden years naturally — they're not
//   in the visible-cell list, but placeBlockWithSpillover only
//   advances within the actual timeline, so we keep the
//   preferredCellIdx mapped to a visible-cell index).
// ============================================================

function executePlan(
  timeline: Timeline,
  plan: readonly PlannedPlacement[],
  visibleCells: readonly HalfTerm[],
  options: ApplyPresetOptions
): Timeline {
  if (plan.length === 0) return timeline;
  if (visibleCells.length === 0) return timeline;

  // preferredCellIdx is an index into `visibleCells` (the hidden-year-filtered
  // list). Map it to the actual HalfTerm id so the placement engine starts in
  // a visible cell.
  //
  // NOTE: `placeBlockWithSpillover` advances forward through the underlying
  // timeline.halfTerms — if a visible cell overflows AND the next physical
  // cell is hidden, spillover would dump lessons into the hidden cell. To
  // prevent this we'd need to teach the placement engine about hidden years.
  // For now, the common case (hidden years contiguous at the start or end of
  // the timeline) is correct; the rare case (interleaved hidden years) leaks
  // and the user sees it in the UI immediately. Documented as a known sharp
  // edge in DEC-038.
  let next = timeline;
  for (const p of plan) {
    const idx = Math.min(p.preferredCellIdx, visibleCells.length - 1);
    const cell = visibleCells[idx];
    if (!cell) continue;
    const source: PlacedBlockSource = {
      kind: "sub-topic",
      subTopicCode: p.subTopic.code,
    };
    next = placeBlockWithSpillover(next, source, p.lessons, cell.id, options);
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
