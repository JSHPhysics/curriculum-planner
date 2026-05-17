import { getPlacementHistory, getTopicPlacementHistory } from "./spacing";
import { getKeyStageForYear } from "./timeline";
import type { RetrievalWeights, Subject } from "./types";

// ============================================================
// Tunable scoring weights — see DEC-031 for the rationale of the v1
// algorithm. Per-subject overrides land in `subject.config.retrievalWeights`;
// missing fields fall back to these defaults. See docs/PEDAGOGY.md for the
// pedagogical reasoning behind each knob.
// ============================================================

/**
 * Half-terms-since-last-touch that maps to a peak `gapScore` of 1.
 * 12 ≈ a full school year of HTs (we have 17 across Y9-Y11). At ~6-week HTs
 * that's ~72 weeks — comfortably inside Bjork's "desirable difficulty"
 * window for long-term retention practice.
 */
export const DEFAULT_RETRIEVAL_WEIGHTS: Required<RetrievalWeights> = {
  peakGapHalfTerms: 12,
  depthBonus: 0.15,
  difficultyBonusPerLevel: 0.1, // 0 for d=1, 0.1 for d=2, 0.2 for d=3
  repeatedPlacementPenalty: -0.1, // applied if totalPlacementsToDate > 1
};

const DEFAULT_MAX_CANDIDATES = 8;
const DEFAULT_MIN_HALF_TERMS_SINCE_TOUCH = 1;

/**
 * Resolve a complete `Required<RetrievalWeights>` by layering:
 *   options.weights → subject.config.retrievalWeights → DEFAULT_RETRIEVAL_WEIGHTS
 * Missing fields at each layer fall through to the next. Exposed so the
 * UI (weights editor) can read the same effective values the engine uses.
 */
export function resolveRetrievalWeights(
  subject: Subject,
  override?: RetrievalWeights
): Required<RetrievalWeights> {
  const fromConfig = subject.config.retrievalWeights ?? {};
  return {
    peakGapHalfTerms:
      override?.peakGapHalfTerms ??
      fromConfig.peakGapHalfTerms ??
      DEFAULT_RETRIEVAL_WEIGHTS.peakGapHalfTerms,
    depthBonus:
      override?.depthBonus ?? fromConfig.depthBonus ?? DEFAULT_RETRIEVAL_WEIGHTS.depthBonus,
    difficultyBonusPerLevel:
      override?.difficultyBonusPerLevel ??
      fromConfig.difficultyBonusPerLevel ??
      DEFAULT_RETRIEVAL_WEIGHTS.difficultyBonusPerLevel,
    repeatedPlacementPenalty:
      override?.repeatedPlacementPenalty ??
      fromConfig.repeatedPlacementPenalty ??
      DEFAULT_RETRIEVAL_WEIGHTS.repeatedPlacementPenalty,
  };
}

// ============================================================
// Types
// ============================================================

export interface RetrievalCandidate {
  readonly subTopicCode: string;
  readonly subTopicName: string;
  readonly topicCode: string;
  readonly topicName: string;
  readonly lastPlacementHalfTermId: string;
  /** ≥ minHalfTermsSinceTouch; primary spacing signal. */
  readonly halfTermsSinceLastTouch: number;
  /** Number of times this sub-topic was placed *before* the context half-term. */
  readonly totalPlacementsToDate: number;
  readonly hasDepthContent: boolean;
  readonly difficulty: 1 | 2 | 3;
  /** 0..1; higher = better retrieval candidate for the context cell. */
  readonly score: number;
  /** Short human-readable explanation suitable for a tooltip or chip. */
  readonly reason: string;
}

export interface SuggestRetrievalOptions {
  readonly maxCandidates?: number;
  /** If true, include sub-topics never placed before contextHalfTerm. Default false. */
  readonly includeUnplaced?: boolean;
  /** Minimum half-terms since last touch to include in suggestions. Default 1. */
  readonly minHalfTermsSinceTouch?: number;
  /**
   * Per-call weight overrides. Layered over `subject.config.retrievalWeights`
   * and then `DEFAULT_RETRIEVAL_WEIGHTS`. Useful for UI previews where the
   * user is dragging a slider before saving.
   */
  readonly weights?: RetrievalWeights;
  /**
   * Default true (DEC-037): only consider candidates whose previous placements
   * are in the same key stage as the context half-term. Set false to surface
   * cross-KS revisits — useful for the rare case where a teacher wants
   * spaced retrieval to span KS boundaries (Y9→Y10, etc.).
   */
  readonly restrictToContextKeyStage?: boolean;
}

// ============================================================
// Engine
// ============================================================

/**
 * Suggest sub-topics worth revisiting in `contextHalfTermId` based on their
 * placement history. Pure function: same inputs → same outputs, no
 * dependence on time-of-day, randomness, or any external state.
 *
 * Returns up to `maxCandidates` results sorted by score descending. Ties
 * resolved by spec topic-then-sub-topic order for determinism.
 *
 * Returns an empty array if:
 * - the context half-term id doesn't exist
 * - the context is the earliest half-term (nothing came before)
 * - no sub-topic was placed before the context half-term
 */
export function suggestRetrievalCandidates(
  subject: Subject,
  contextHalfTermId: string,
  options: SuggestRetrievalOptions = {}
): readonly RetrievalCandidate[] {
  const max = options.maxCandidates ?? DEFAULT_MAX_CANDIDATES;
  const minHTs = options.minHalfTermsSinceTouch ?? DEFAULT_MIN_HALF_TERMS_SINCE_TOUCH;
  const includeUnplaced = options.includeUnplaced ?? false;
  const restrictToKs = options.restrictToContextKeyStage ?? true;
  const weights = resolveRetrievalWeights(subject, options.weights);

  const contextIdx = subject.timeline.halfTerms.findIndex((ht) => ht.id === contextHalfTermId);
  if (contextIdx === -1) return [];
  const contextHalfTerm = subject.timeline.halfTerms[contextIdx]!;
  const contextKs = getKeyStageForYear(contextHalfTerm.year, subject.meta.keyStage);

  const candidates: RetrievalCandidate[] = [];
  let specOrder = 0; // monotonic counter for tie-breaks

  for (const topic of subject.workingSpec.topics) {
    for (const subTopic of topic.subTopics) {
      specOrder++;
      const history = getPlacementHistory(subject, subTopic.code);
      let before = history.filter((p) => p.halfTermIdx < contextIdx);
      // KS scope: when restricted, only count previous placements in the same
      // key stage as the context cell. A Y9 (KS3) placement isn't a valid
      // "earlier touch" of the same content for a Y11 (KS4) revisit unless
      // the user explicitly opts into cross-KS via the popover toggle.
      if (restrictToKs) {
        before = before.filter(
          (p) => getKeyStageForYear(p.halfTerm.year, subject.meta.keyStage) === contextKs
        );
      }

      if (before.length === 0) {
        if (!includeUnplaced) continue;
        // Unplaced-as-of-context: treat as max-spacing candidate.
        const candidate = buildCandidate({
          subTopic,
          topic,
          lastPlacementHalfTermId: "—",
          halfTermsSinceLastTouch: weights.peakGapHalfTerms,
          totalPlacementsToDate: 0,
          specOrder,
          weights,
        });
        candidates.push(candidate);
        continue;
      }

      const last = before[before.length - 1]!;
      const halfTermsSinceLastTouch = contextIdx - last.halfTermIdx;
      if (halfTermsSinceLastTouch < minHTs) continue;

      candidates.push(
        buildCandidate({
          subTopic,
          topic,
          lastPlacementHalfTermId: last.halfTerm.id,
          halfTermsSinceLastTouch,
          totalPlacementsToDate: before.length,
          specOrder,
          weights,
        })
      );
    }
  }

  // Sort by score desc; stable so equal-score items retain spec push order.
  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, max);
}

interface BuildCandidateArgs {
  readonly subTopic: { readonly code: string; readonly name: string; readonly difficulty: 1 | 2 | 3; readonly isDepth: boolean; readonly lessons: readonly { readonly isDepth: boolean }[] };
  readonly topic: { readonly code: string; readonly name: string };
  readonly lastPlacementHalfTermId: string;
  readonly halfTermsSinceLastTouch: number;
  readonly totalPlacementsToDate: number;
  readonly specOrder: number;
  readonly weights: Required<RetrievalWeights>;
}

function buildCandidate(args: BuildCandidateArgs): RetrievalCandidate {
  const { subTopic, topic, lastPlacementHalfTermId, halfTermsSinceLastTouch, totalPlacementsToDate, weights } = args;
  const hasDepthContent = subTopic.isDepth || subTopic.lessons.some((l) => l.isDepth);
  const gapScore = clamp(halfTermsSinceLastTouch / weights.peakGapHalfTerms, 0, 1);
  const depthBonus = hasDepthContent ? weights.depthBonus : 0;
  const difficultyBonus = (subTopic.difficulty - 1) * weights.difficultyBonusPerLevel;
  const recentnessPenalty = totalPlacementsToDate > 1 ? weights.repeatedPlacementPenalty : 0;
  const score = clamp(gapScore + depthBonus + difficultyBonus + recentnessPenalty, 0, 1);

  return {
    subTopicCode: subTopic.code,
    subTopicName: subTopic.name,
    topicCode: topic.code,
    topicName: topic.name,
    lastPlacementHalfTermId,
    halfTermsSinceLastTouch,
    totalPlacementsToDate,
    hasDepthContent,
    difficulty: subTopic.difficulty,
    score,
    reason: buildReason({
      lastPlacementHalfTermId,
      halfTermsSinceLastTouch,
      totalPlacementsToDate,
      hasDepthContent,
      difficulty: subTopic.difficulty,
    }),
  };
}

interface ReasonArgs {
  readonly lastPlacementHalfTermId: string;
  readonly halfTermsSinceLastTouch: number;
  readonly totalPlacementsToDate: number;
  readonly hasDepthContent: boolean;
  readonly difficulty: 1 | 2 | 3;
}

function buildReason(args: ReasonArgs): string {
  const parts: string[] = [];
  if (args.totalPlacementsToDate === 0) {
    parts.push("Not yet placed");
  } else {
    const htWord = args.halfTermsSinceLastTouch === 1 ? "half-term" : "half-terms";
    parts.push(`Last seen ${args.halfTermsSinceLastTouch} ${htWord} ago in ${args.lastPlacementHalfTermId}`);
  }
  if (args.totalPlacementsToDate === 1) {
    parts.push("never revisited");
  } else if (args.totalPlacementsToDate > 1) {
    parts.push(`taught ${args.totalPlacementsToDate} times so far`);
  }
  if (args.hasDepthContent) {
    parts.push("depth content");
  }
  if (args.difficulty === 3) {
    parts.push("high difficulty");
  } else if (args.difficulty === 1) {
    parts.push("foundational");
  }
  return parts.join("; ");
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

// ============================================================
// TOPIC-level retrieval suggestions (DEC-042)
//
// Same scoring philosophy as sub-topic candidates, but the unit of analysis
// is the TOPIC. A topic that was touched in Y9-A1 via T1a and Y10-A2 via
// T1c was "last seen" at Y10-A2; retrieval suggestions consider the gap
// from there.
//
// Difficulty / depth at the topic level: aggregate from the topic's
// sub-topics (max difficulty, any depth content).
// ============================================================

export interface TopicRetrievalCandidate {
  readonly topicCode: string;
  readonly topicName: string;
  readonly lastPlacementHalfTermId: string;
  readonly halfTermsSinceLastTouch: number;
  /** Distinct half-terms the topic was touched in before the context cell. */
  readonly totalDistinctTouchesToDate: number;
  /** Distinct sub-topics of this topic placed before the context cell. */
  readonly distinctSubTopicsPlacedToDate: number;
  /** Total sub-topics in the topic spec. */
  readonly totalSubTopicsInSpec: number;
  readonly hasDepthContent: boolean;
  /** Max difficulty across the topic's sub-topics. */
  readonly difficulty: 1 | 2 | 3;
  readonly score: number;
  readonly reason: string;
}

export function suggestTopicRetrievalCandidates(
  subject: Subject,
  contextHalfTermId: string,
  options: SuggestRetrievalOptions = {}
): readonly TopicRetrievalCandidate[] {
  const max = options.maxCandidates ?? DEFAULT_MAX_CANDIDATES;
  const minHTs = options.minHalfTermsSinceTouch ?? DEFAULT_MIN_HALF_TERMS_SINCE_TOUCH;
  const includeUnplaced = options.includeUnplaced ?? false;
  const restrictToKs = options.restrictToContextKeyStage ?? true;
  const weights = resolveRetrievalWeights(subject, options.weights);

  const contextIdx = subject.timeline.halfTerms.findIndex((ht) => ht.id === contextHalfTermId);
  if (contextIdx === -1) return [];
  const contextHalfTerm = subject.timeline.halfTerms[contextIdx]!;
  const contextKs = getKeyStageForYear(contextHalfTerm.year, subject.meta.keyStage);

  const candidates: TopicRetrievalCandidate[] = [];

  for (const topic of subject.workingSpec.topics) {
    const history = getTopicPlacementHistory(subject, topic.code);
    let before = history.filter((p) => p.halfTermIdx < contextIdx);
    if (restrictToKs) {
      before = before.filter(
        (p) => getKeyStageForYear(p.halfTerm.year, subject.meta.keyStage) === contextKs
      );
    }

    // Distinct half-terms (the "touches"); distinct sub-topics already placed.
    const distinctHts = Array.from(new Set(before.map((p) => p.halfTermIdx))).sort(
      (a, b) => a - b
    );
    const distinctSubs = new Set(before.map((p) => p.subTopicCode)).size;

    if (distinctHts.length === 0) {
      if (!includeUnplaced) continue;
      candidates.push(
        buildTopicCandidate({
          topic,
          lastPlacementHalfTermId: "—",
          halfTermsSinceLastTouch: weights.peakGapHalfTerms,
          totalDistinctTouchesToDate: 0,
          distinctSubTopicsPlacedToDate: 0,
          weights,
        })
      );
      continue;
    }

    const lastHtIdx = distinctHts[distinctHts.length - 1]!;
    const lastHt = subject.timeline.halfTerms[lastHtIdx]!;
    const halfTermsSinceLastTouch = contextIdx - lastHtIdx;
    if (halfTermsSinceLastTouch < minHTs) continue;

    candidates.push(
      buildTopicCandidate({
        topic,
        lastPlacementHalfTermId: lastHt.id,
        halfTermsSinceLastTouch,
        totalDistinctTouchesToDate: distinctHts.length,
        distinctSubTopicsPlacedToDate: distinctSubs,
        weights,
      })
    );
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, max);
}

interface BuildTopicCandidateArgs {
  readonly topic: {
    readonly code: string;
    readonly name: string;
    readonly subTopics: readonly {
      readonly difficulty: 1 | 2 | 3;
      readonly isDepth: boolean;
      readonly lessons: readonly { readonly isDepth: boolean }[];
    }[];
  };
  readonly lastPlacementHalfTermId: string;
  readonly halfTermsSinceLastTouch: number;
  readonly totalDistinctTouchesToDate: number;
  readonly distinctSubTopicsPlacedToDate: number;
  readonly weights: Required<RetrievalWeights>;
}

function buildTopicCandidate(args: BuildTopicCandidateArgs): TopicRetrievalCandidate {
  const { topic, halfTermsSinceLastTouch, totalDistinctTouchesToDate, weights } = args;
  // Aggregate difficulty + depth across the topic's sub-topics.
  const difficulty = (topic.subTopics.length === 0
    ? 2
    : Math.max(...topic.subTopics.map((st) => st.difficulty))) as 1 | 2 | 3;
  const hasDepthContent = topic.subTopics.some(
    (st) => st.isDepth || st.lessons.some((l) => l.isDepth)
  );
  const gapScore = clamp(halfTermsSinceLastTouch / weights.peakGapHalfTerms, 0, 1);
  const depthBonus = hasDepthContent ? weights.depthBonus : 0;
  const difficultyBonus = (difficulty - 1) * weights.difficultyBonusPerLevel;
  const recentnessPenalty =
    totalDistinctTouchesToDate > 1 ? weights.repeatedPlacementPenalty : 0;
  const score = clamp(gapScore + depthBonus + difficultyBonus + recentnessPenalty, 0, 1);

  return {
    topicCode: topic.code,
    topicName: topic.name,
    lastPlacementHalfTermId: args.lastPlacementHalfTermId,
    halfTermsSinceLastTouch,
    totalDistinctTouchesToDate,
    distinctSubTopicsPlacedToDate: args.distinctSubTopicsPlacedToDate,
    totalSubTopicsInSpec: topic.subTopics.length,
    hasDepthContent,
    difficulty,
    score,
    reason: buildTopicReason({
      lastPlacementHalfTermId: args.lastPlacementHalfTermId,
      halfTermsSinceLastTouch,
      totalDistinctTouchesToDate,
      distinctSubTopicsPlacedToDate: args.distinctSubTopicsPlacedToDate,
      totalSubTopicsInSpec: topic.subTopics.length,
      hasDepthContent,
      difficulty,
    }),
  };
}

interface TopicReasonArgs {
  readonly lastPlacementHalfTermId: string;
  readonly halfTermsSinceLastTouch: number;
  readonly totalDistinctTouchesToDate: number;
  readonly distinctSubTopicsPlacedToDate: number;
  readonly totalSubTopicsInSpec: number;
  readonly hasDepthContent: boolean;
  readonly difficulty: 1 | 2 | 3;
}

function buildTopicReason(args: TopicReasonArgs): string {
  const parts: string[] = [];
  if (args.totalDistinctTouchesToDate === 0) {
    parts.push("Topic not yet placed");
  } else {
    const htWord = args.halfTermsSinceLastTouch === 1 ? "half-term" : "half-terms";
    parts.push(
      `Topic last touched ${args.halfTermsSinceLastTouch} ${htWord} ago in ${args.lastPlacementHalfTermId}`
    );
  }
  if (args.totalDistinctTouchesToDate === 1) {
    parts.push("never revisited");
  } else if (args.totalDistinctTouchesToDate > 1) {
    parts.push(`touched in ${args.totalDistinctTouchesToDate} half-terms so far`);
  }
  if (args.totalSubTopicsInSpec > 0) {
    parts.push(
      `${args.distinctSubTopicsPlacedToDate}/${args.totalSubTopicsInSpec} sub-topics covered`
    );
  }
  if (args.hasDepthContent) {
    parts.push("includes depth content");
  }
  if (args.difficulty === 3) {
    parts.push("high difficulty");
  }
  return parts.join("; ");
}
