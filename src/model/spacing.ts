import { effectiveLessonCountForPlacement } from "./depth";
import { findTopicAndSubTopic } from "./queries";
import {
  getKeyStageForYear,
  getVisibleKeyStages,
  getVisibleTimelineYears,
} from "./timeline";
import type {
  HalfTerm,
  KeyStage,
  PlacedBlock,
  SpacingThresholds,
  Subject,
  YearId,
} from "./types";

/**
 * Half-terms the analytics should look at: skips any year the user has hidden.
 * Hiding a year is the user saying "this isn't part of my planning scope" —
 * spacing warnings about unplaced sub-topics in those years would be noise.
 * Shared with `src/model/export.ts` via duplicated logic (small enough to not
 * warrant a separate module); both must filter identically.
 */
function visibleHalfTerms(subject: Subject): readonly HalfTerm[] {
  const hidden = new Set(subject.config.hiddenYears ?? []);
  if (hidden.size === 0) return subject.timeline.halfTerms;
  return subject.timeline.halfTerms.filter((ht) => !hidden.has(ht.year));
}

// ============================================================
// Default thresholds. Per-subject overrides live in
// `subject.config.spacingThresholds`. Rationale for each default
// is in `docs/PEDAGOGY.md` §3 and §5.
// ============================================================

export const DEFAULT_SPACING_THRESHOLDS: Required<SpacingThresholds> = {
  /** A cell is "blocked" only if it has at least this many lessons. */
  blockedCellMinLessons: 4,
  /** AND the dominant topic accounts for at least this fraction of the cell's lessons. */
  blockedCellDominantShare: 0.8,
  /** A sub-topic is "well spaced" only if placed at least this many times. */
  wellSpacedMinPlacements: 3,
  /** AND the mean inter-placement gap is at least this many half-terms. */
  wellSpacedMinMeanGap: 4,
};

/**
 * Resolve the four thresholds by layering subject.config over the defaults.
 * Exported so the UI (ThresholdsEditor) can read the same effective values
 * the engine uses.
 */
export function resolveSpacingThresholds(subject: Subject): Required<SpacingThresholds> {
  const fromConfig = subject.config.spacingThresholds ?? {};
  return {
    blockedCellMinLessons:
      fromConfig.blockedCellMinLessons ?? DEFAULT_SPACING_THRESHOLDS.blockedCellMinLessons,
    blockedCellDominantShare:
      fromConfig.blockedCellDominantShare ?? DEFAULT_SPACING_THRESHOLDS.blockedCellDominantShare,
    wellSpacedMinPlacements:
      fromConfig.wellSpacedMinPlacements ?? DEFAULT_SPACING_THRESHOLDS.wellSpacedMinPlacements,
    wellSpacedMinMeanGap:
      fromConfig.wellSpacedMinMeanGap ?? DEFAULT_SPACING_THRESHOLDS.wellSpacedMinMeanGap,
  };
}

// ============================================================
// Per-sub-topic placement history + spacing profile
// ============================================================

export interface SubTopicPlacement {
  readonly halfTerm: HalfTerm;
  readonly halfTermIdx: number; // 0..16 in timeline.halfTerms order
  readonly placedBlock: PlacedBlock;
  readonly lessonsClaimed: number;
}

/**
 * Calendar-ordered placements of one sub-topic across the timeline.
 * Order matches `timeline.halfTerms` (which is itself calendar order).
 * Within a single half-term, placements appear in the order they sit in
 * that cell's `placedBlocks` array (matches the spec topic / placement
 * ordering used by SubTopicView).
 */
export function getPlacementHistory(
  subject: Subject,
  subTopicCode: string
): readonly SubTopicPlacement[] {
  const out: SubTopicPlacement[] = [];
  // Hidden years are excluded — a sub-topic placed only in a hidden year is
  // effectively "out of scope" for spacing/retrieval analytics.
  const hidden = new Set(subject.config.hiddenYears ?? []);
  subject.timeline.halfTerms.forEach((halfTerm, halfTermIdx) => {
    if (hidden.has(halfTerm.year)) return;
    for (const placedBlock of halfTerm.placedBlocks) {
      if (placedBlock.source.kind !== "sub-topic") continue;
      if (placedBlock.source.subTopicCode !== subTopicCode) continue;
      // Honour the depth toggle (DEC-040): a placement consisting entirely
      // of depth lessons is invisible to analytics when `includeDepth=false`,
      // so it shouldn't count as a "touch" for spacing/retrieval purposes.
      const effective = effectiveLessonCountForPlacement(subject, placedBlock);
      if (effective === 0) continue;
      out.push({
        halfTerm,
        halfTermIdx,
        placedBlock,
        lessonsClaimed: effective,
      });
    }
  });
  return out;
}

export interface SpacingProfile {
  readonly subTopicCode: string;
  readonly placements: readonly SubTopicPlacement[];
  /** Gaps in half-terms between consecutive placements (placements.length - 1 entries). */
  readonly gapsInHalfTerms: readonly number[];
  /** null when 0 or 1 placement. */
  readonly maxGap: number | null;
  /** null when 0 or 1 placement. */
  readonly meanGap: number | null;
  readonly isSingleTouch: boolean;
  readonly isUnplaced: boolean;
  readonly lastPlacementHalfTermIdx: number | null;
}

export function getSpacingProfile(
  subject: Subject,
  subTopicCode: string
): SpacingProfile {
  const placements = getPlacementHistory(subject, subTopicCode);
  const gaps: number[] = [];
  // Multiple placements in the same half-term contribute a gap of 0 — that's
  // fine; it accurately represents "no spacing between them".
  for (let i = 1; i < placements.length; i++) {
    const prev = placements[i - 1]!;
    const cur = placements[i]!;
    gaps.push(cur.halfTermIdx - prev.halfTermIdx);
  }
  const maxGap = gaps.length === 0 ? null : Math.max(...gaps);
  const meanGap = gaps.length === 0 ? null : gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const last = placements[placements.length - 1];
  return {
    subTopicCode,
    placements,
    gapsInHalfTerms: gaps,
    maxGap,
    meanGap,
    isSingleTouch: placements.length === 1,
    isUnplaced: placements.length === 0,
    lastPlacementHalfTermIdx: last ? last.halfTermIdx : null,
  };
}

/**
 * Spacing profile for every sub-topic in the working spec, in spec order.
 * Includes unplaced sub-topics (profile.isUnplaced === true) so a future
 * panel can surface "you haven't placed T3a anywhere yet".
 */
export function getSpacingProfilesAll(subject: Subject): readonly SpacingProfile[] {
  const out: SpacingProfile[] = [];
  for (const topic of subject.workingSpec.topics) {
    for (const subTopic of topic.subTopics) {
      out.push(getSpacingProfile(subject, subTopic.code));
    }
  }
  return out;
}

// ============================================================
// Per-cell interleaving score
// ============================================================

export interface InterleavingScore {
  readonly halfTermId: string;
  readonly distinctTopicCount: number;
  readonly distinctSubTopicCount: number;
  readonly totalLessons: number; // sub-topic placements only (per DEC-011)
  readonly dominantTopicCode: string | null;
  readonly dominantTopicShare: number; // 0..1
}

export function getInterleavingScore(
  subject: Subject,
  halfTerm: HalfTerm
): InterleavingScore {
  const lessonsPerTopic = new Map<string, number>();
  const subTopicCodes = new Set<string>();
  let totalLessons = 0;
  for (const placedBlock of halfTerm.placedBlocks) {
    if (placedBlock.source.kind !== "sub-topic") continue;
    const found = findTopicAndSubTopic(subject.workingSpec, placedBlock.source.subTopicCode);
    if (!found) continue;
    // Honour the depth toggle (DEC-040). When `includeDepth=false`, depth
    // lessons don't contribute to the cell's interleaving lesson totals or
    // its blocked-cell detection.
    const effective = effectiveLessonCountForPlacement(subject, placedBlock);
    if (effective === 0) continue;
    const prev = lessonsPerTopic.get(found.topic.code) ?? 0;
    lessonsPerTopic.set(found.topic.code, prev + effective);
    subTopicCodes.add(found.subTopic.code);
    totalLessons += effective;
  }
  let dominantTopicCode: string | null = null;
  let dominantLessons = 0;
  for (const [code, lessons] of lessonsPerTopic) {
    if (lessons > dominantLessons) {
      dominantLessons = lessons;
      dominantTopicCode = code;
    }
  }
  const dominantTopicShare = totalLessons === 0 ? 0 : dominantLessons / totalLessons;
  return {
    halfTermId: halfTerm.id,
    distinctTopicCount: lessonsPerTopic.size,
    distinctSubTopicCount: subTopicCodes.size,
    totalLessons,
    dominantTopicCode,
    dominantTopicShare,
  };
}

export function getInterleavingScoresAll(
  subject: Subject
): readonly InterleavingScore[] {
  // Hidden years are excluded from the rolled-up interleaving sweep — they
  // can't be "blocked cells" if the user doesn't even see them.
  return visibleHalfTerms(subject).map((ht) => getInterleavingScore(subject, ht));
}

// ============================================================
// Rolled-up health flags for the (eventual) diagnostic panel
// ============================================================

export interface BlockedCell {
  readonly halfTermId: string;
  readonly dominantTopicCode: string;
  readonly dominantShare: number;
  readonly lessons: number;
}

export interface SpacingFlags {
  readonly singleTouch: readonly string[];
  readonly unplaced: readonly string[];
  readonly blockedCells: readonly BlockedCell[];
  readonly wellSpaced: readonly string[];
}

export function getSpacingFlags(subject: Subject): SpacingFlags {
  const thresholds = resolveSpacingThresholds(subject);
  const profiles = getSpacingProfilesAll(subject);
  const singleTouch: string[] = [];
  const unplaced: string[] = [];
  const wellSpaced: string[] = [];
  for (const profile of profiles) {
    if (profile.isUnplaced) {
      unplaced.push(profile.subTopicCode);
      continue;
    }
    if (profile.isSingleTouch) {
      singleTouch.push(profile.subTopicCode);
      continue;
    }
    if (
      profile.placements.length >= thresholds.wellSpacedMinPlacements &&
      profile.meanGap !== null &&
      profile.meanGap >= thresholds.wellSpacedMinMeanGap
    ) {
      wellSpaced.push(profile.subTopicCode);
    }
  }

  const blockedCells: BlockedCell[] = [];
  for (const score of getInterleavingScoresAll(subject)) {
    if (
      score.totalLessons >= thresholds.blockedCellMinLessons &&
      score.dominantTopicCode !== null &&
      score.dominantTopicShare >= thresholds.blockedCellDominantShare
    ) {
      blockedCells.push({
        halfTermId: score.halfTermId,
        dominantTopicCode: score.dominantTopicCode,
        dominantShare: score.dominantTopicShare,
        lessons: score.totalLessons,
      });
    }
  }

  return { singleTouch, unplaced, blockedCells, wellSpaced };
}

// ============================================================
// TOPIC-level spacing analytics (DEC-042)
//
// Pedagogical motivation: a teacher revisiting a TOPIC (e.g. "Mechanics")
// via a DIFFERENT sub-topic months later IS retrieval at the topic level,
// even though it's a fresh sub-topic. Sub-topic-level spacing would call
// every mechanics sub-topic "single-touch" if each is placed once; topic-
// level spacing recognises that mechanics-the-topic was touched 4 times
// via 4 different sub-topics.
//
// The topic-level helpers mirror the sub-topic-level shapes but aggregate
// placements across every sub-topic of the given topic.
// ============================================================

export interface TopicPlacement {
  readonly halfTerm: HalfTerm;
  readonly halfTermIdx: number;
  readonly placedBlock: PlacedBlock;
  /** Effective lesson count for this placement (after depth filter). */
  readonly lessonsClaimed: number;
  /** Sub-topic code this placement belongs to, for traceability. */
  readonly subTopicCode: string;
}

/**
 * Calendar-ordered placements of any sub-topic of a topic, in calendar
 * order. Two sub-topics of the same topic placed in the same half-term
 * produce two entries with the same `halfTermIdx`.
 */
export function getTopicPlacementHistory(
  subject: Subject,
  topicCode: string
): readonly TopicPlacement[] {
  const out: TopicPlacement[] = [];
  const hidden = new Set(subject.config.hiddenYears ?? []);
  subject.timeline.halfTerms.forEach((halfTerm, halfTermIdx) => {
    if (hidden.has(halfTerm.year)) return;
    for (const placedBlock of halfTerm.placedBlocks) {
      if (placedBlock.source.kind !== "sub-topic") continue;
      const found = findTopicAndSubTopic(subject.workingSpec, placedBlock.source.subTopicCode);
      if (!found || found.topic.code !== topicCode) continue;
      const effective = effectiveLessonCountForPlacement(subject, placedBlock);
      if (effective === 0) continue;
      out.push({
        halfTerm,
        halfTermIdx,
        placedBlock,
        lessonsClaimed: effective,
        subTopicCode: placedBlock.source.subTopicCode,
      });
    }
  });
  return out;
}

export interface TopicSpacingProfile {
  readonly topicCode: string;
  readonly placements: readonly TopicPlacement[];
  /** Gaps in half-terms between consecutive distinct half-terms the topic appears in. */
  readonly gapsInHalfTerms: readonly number[];
  readonly maxGap: number | null;
  readonly meanGap: number | null;
  /** True if the topic appears in exactly ONE half-term (regardless of how many sub-topics there). */
  readonly isSingleTouch: boolean;
  readonly isUnplaced: boolean;
  /** Distinct half-term indices the topic was touched in. */
  readonly distinctHalfTermsCount: number;
  /** Number of distinct sub-topics of this topic that have been placed. */
  readonly distinctSubTopicsPlaced: number;
  /** Number of distinct sub-topics in the topic spec. */
  readonly totalSubTopicsInSpec: number;
  readonly lastPlacementHalfTermIdx: number | null;
}

export function getTopicSpacingProfile(
  subject: Subject,
  topicCode: string
): TopicSpacingProfile {
  const placements = getTopicPlacementHistory(subject, topicCode);
  // Spacing gaps for a TOPIC are between distinct half-terms (two sub-topics
  // of the same topic in the same cell don't count as "the topic was
  // touched twice with a gap of 0" — pedagogically that's one touch).
  const distinctHts = Array.from(
    new Set(placements.map((p) => p.halfTermIdx))
  ).sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < distinctHts.length; i++) {
    gaps.push(distinctHts[i]! - distinctHts[i - 1]!);
  }
  const maxGap = gaps.length === 0 ? null : Math.max(...gaps);
  const meanGap = gaps.length === 0 ? null : gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const topic = subject.workingSpec.topics.find((t) => t.code === topicCode);
  const totalSubTopicsInSpec = topic?.subTopics.length ?? 0;
  const distinctSubTopicsPlaced = new Set(placements.map((p) => p.subTopicCode)).size;
  return {
    topicCode,
    placements,
    gapsInHalfTerms: gaps,
    maxGap,
    meanGap,
    isSingleTouch: distinctHts.length === 1,
    isUnplaced: distinctHts.length === 0,
    distinctHalfTermsCount: distinctHts.length,
    distinctSubTopicsPlaced,
    totalSubTopicsInSpec,
    lastPlacementHalfTermIdx:
      distinctHts.length === 0 ? null : distinctHts[distinctHts.length - 1]!,
  };
}

/** Topic-level spacing profile for every topic in the working spec, in spec order. */
export function getTopicSpacingProfilesAll(subject: Subject): readonly TopicSpacingProfile[] {
  return subject.workingSpec.topics.map((t) => getTopicSpacingProfile(subject, t.code));
}

export interface TopicSpacingFlags {
  /** Topics appearing in exactly one half-term — no spacing benefit at topic level. */
  readonly singleTouch: readonly string[];
  /** Topics with no placements anywhere. */
  readonly unplaced: readonly string[];
  /** Topics touched ≥ wellSpacedMinPlacements times with mean gap ≥ wellSpacedMinMeanGap. */
  readonly wellSpaced: readonly string[];
  /** Topics whose every placed sub-topic is consecutive (no spread). */
  readonly clustered: readonly string[];
}

/**
 * Roll-up of topic-level flags. The same thresholds (`wellSpacedMinPlacements`
 * / `wellSpacedMinMeanGap`) are applied — pedagogically the bar for "well-
 * spaced topic" is the same as "well-spaced sub-topic", just at a coarser
 * grain. The "clustered" flag is a new topic-only signal: every placement
 * happens in immediately-consecutive half-terms (gap = 1 between every
 * pair), meaning the topic is taught in a single block even though it has
 * multiple sub-topics.
 */
export function getTopicSpacingFlags(subject: Subject): TopicSpacingFlags {
  const thresholds = resolveSpacingThresholds(subject);
  const profiles = getTopicSpacingProfilesAll(subject);
  const singleTouch: string[] = [];
  const unplaced: string[] = [];
  const wellSpaced: string[] = [];
  const clustered: string[] = [];
  for (const profile of profiles) {
    if (profile.isUnplaced) {
      unplaced.push(profile.topicCode);
      continue;
    }
    if (profile.isSingleTouch) {
      singleTouch.push(profile.topicCode);
      continue;
    }
    if (
      profile.distinctHalfTermsCount >= thresholds.wellSpacedMinPlacements &&
      profile.meanGap !== null &&
      profile.meanGap >= thresholds.wellSpacedMinMeanGap
    ) {
      wellSpaced.push(profile.topicCode);
    } else if (
      profile.gapsInHalfTerms.length > 0 &&
      profile.gapsInHalfTerms.every((g) => g <= 1)
    ) {
      // Every gap is 0 or 1 → topic taught in one continuous run despite
      // having multiple sub-topics. Flag for review.
      clustered.push(profile.topicCode);
    }
  }
  return { singleTouch, unplaced, wellSpaced, clustered };
}

/**
 * Per-key-stage spacing analytics (see DEC-037). Each key stage's flags are
 * computed independently — a sub-topic placed once in KS3 and once in KS4
 * counts as single-touch in BOTH buckets, not as a 2-placement spread.
 *
 * Reuses `getSpacingFlags` by synthesising a "this KS only" subject view
 * that hides every year not in the target KS. The user's actual hiddenYears
 * config is preserved (additional hides layered on top).
 *
 * Y9 is disambiguated by `subject.meta.keyStage` when set; defaults to KS3.
 */
export function getSpacingFlagsByKeyStage(
  subject: Subject
): ReadonlyMap<KeyStage, SpacingFlags> {
  const visibleKs = getVisibleKeyStages(subject);
  const visibleYears = getVisibleTimelineYears(subject);
  const out = new Map<KeyStage, SpacingFlags>();

  for (const ks of visibleKs) {
    const yearsInThisKs = new Set<YearId>(
      visibleYears.filter((y) => getKeyStageForYear(y, subject.meta.keyStage) === ks)
    );
    const extraHidden = visibleYears.filter((y) => !yearsInThisKs.has(y));
    const scopedSubject: Subject = {
      ...subject,
      config: {
        ...subject.config,
        hiddenYears: [
          ...(subject.config.hiddenYears ?? []),
          ...extraHidden,
        ],
      },
    };
    out.set(ks, getSpacingFlags(scopedSubject));
  }
  return out;
}

/**
 * Topic-level KS bucket analytics — same idea as `getSpacingFlagsByKeyStage`
 * but operating on topic-level flags. Used by SpacingPanel when the user
 * has both a multi-KS subject AND topic-level granularity active.
 */
export function getTopicSpacingFlagsByKeyStage(
  subject: Subject
): ReadonlyMap<KeyStage, TopicSpacingFlags> {
  const visibleKs = getVisibleKeyStages(subject);
  const visibleYears = getVisibleTimelineYears(subject);
  const out = new Map<KeyStage, TopicSpacingFlags>();
  for (const ks of visibleKs) {
    const yearsInThisKs = new Set<YearId>(
      visibleYears.filter((y) => getKeyStageForYear(y, subject.meta.keyStage) === ks)
    );
    const extraHidden = visibleYears.filter((y) => !yearsInThisKs.has(y));
    const scopedSubject: Subject = {
      ...subject,
      config: {
        ...subject.config,
        hiddenYears: [
          ...(subject.config.hiddenYears ?? []),
          ...extraHidden,
        ],
      },
    };
    out.set(ks, getTopicSpacingFlags(scopedSubject));
  }
  return out;
}
