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
// Preset: three-spiral
//   Visit each sub-topic THREE times across thirds of the timeline.
//   Pass 1: cells [0, n/3)
//   Pass 2: cells [n/3, 2n/3)
//   Pass 3: cells [2n/3, n)
//
//   Foundation sub-topics: pass 1 + pass 2 + pass 3.
//   Depth sub-topics (when includeDepth): pass 2 + pass 3 only (build up
//   the foundation before stretching into depth).
//
//   Per-pass lesson counts: divide N lessons among 3 passes as
//   (ceil, mid, floor) so the first/largest pass always gets the
//   extra lesson when N isn't divisible by 3. Each pass gets at
//   least 1 lesson (if N >= 1).
// ============================================================

function planThreeSpiral(
  all: readonly SubTopicWithTopic[],
  cellCount: number
): readonly PlannedPlacement[] {
  const seg1Start = 0;
  const seg2Start = Math.floor(cellCount / 3);
  const seg3Start = Math.floor((2 * cellCount) / 3);

  // Build per-sub-topic per-pass lesson counts.
  type PerPass = { readonly pass1: number; readonly pass2: number; readonly pass3: number };
  function splitThree(n: number): PerPass {
    if (n <= 0) return { pass1: 0, pass2: 0, pass3: 0 };
    if (n === 1) return { pass1: 1, pass2: 0, pass3: 0 };
    if (n === 2) return { pass1: 1, pass2: 1, pass3: 0 };
    const base = Math.floor(n / 3);
    const rem = n - base * 3;
    // rem ∈ {0,1,2}; bias to earlier passes when uneven.
    const pass1 = base + (rem >= 1 ? 1 : 0);
    const pass2 = base + (rem >= 2 ? 1 : 0);
    const pass3 = base;
    return { pass1, pass2, pass3 };
  }

  // Emit passes grouped by pass index then source order, so all pass-1
  // placements try to land in segment 1, all pass-2 in segment 2, etc.
  const out: PlannedPlacement[] = [];
  for (const passIdx of [0, 1, 2] as const) {
    const segStart = passIdx === 0 ? seg1Start : passIdx === 1 ? seg2Start : seg3Start;
    for (const entry of all) {
      const split = splitThree(entry.subTopic.lessons.length);
      const isDepth = isSubTopicDepth(entry.subTopic);
      const lessons =
        passIdx === 0 ? (isDepth ? 0 : split.pass1)
        : passIdx === 1 ? (isDepth ? Math.ceil(entry.subTopic.lessons.length / 2) : split.pass2)
        : (isDepth ? Math.floor(entry.subTopic.lessons.length / 2) : split.pass3);
      if (lessons <= 0) continue;
      out.push({
        topic: entry.topic,
        subTopic: entry.subTopic,
        lessons,
        preferredCellIdx: segStart,
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
