import { getPlacementHistory } from "./spacing";
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
  const weights = resolveRetrievalWeights(subject, options.weights);

  const contextIdx = subject.timeline.halfTerms.findIndex((ht) => ht.id === contextHalfTermId);
  if (contextIdx === -1) return [];

  const candidates: RetrievalCandidate[] = [];
  let specOrder = 0; // monotonic counter for tie-breaks

  for (const topic of subject.workingSpec.topics) {
    for (const subTopic of topic.subTopics) {
      specOrder++;
      const history = getPlacementHistory(subject, subTopic.code);
      const before = history.filter((p) => p.halfTermIdx < contextIdx);

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
