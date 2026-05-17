import { findTopicAndSubTopic } from "./queries";
import type {
  Lesson,
  PlacedBlock,
  Subject,
  SubTopic,
} from "./types";

/**
 * Helpers for the "Show depth" toggle (`subject.config.includeDepth`).
 * Per DEC-040:
 *   - Depth is a per-LESSON flag. A sub-topic is "exclusively depth" only when
 *     every lesson is depth; mixed sub-topics still appear in views.
 *   - The `includeDepth=false` toggle is a CONSUMER-side filter — placements
 *     never change. Renderer, analytics, and exports each ask
 *     `effectiveLessons*` for the lessons they should treat as "visible".
 *   - "Discounted from analytics": when toggle off, spacing/interleaving lesson
 *     totals exclude depth lessons; coverage stats use the foundation-only
 *     denominator.
 *
 * Implementation policy: these helpers always take `subject` so they can read
 * `subject.config.includeDepth` once and apply consistently. Callers that
 * have already resolved a `SubTopic` can use the `*ForSubTopic` variants.
 */

/**
 * Filter a sub-topic's lessons by the subject's depth toggle. When
 * `includeDepth=true`, returns the lessons array unchanged. When false,
 * filters out lessons with `isDepth=true`. Result preserves spec lesson
 * order.
 */
export function effectiveLessonsForSubTopic(
  subject: Subject,
  subTopic: SubTopic
): readonly Lesson[] {
  if (subject.config.includeDepth) return subTopic.lessons;
  return subTopic.lessons.filter((l) => !l.isDepth);
}

/**
 * Slice a sub-topic's lessons by a placed block's lessonRange, then apply
 * the depth filter. Returns the lessons actually "delivered" by this block
 * given the current toggle. Empty if the block doesn't reference a sub-topic
 * we can resolve in the working spec, or if every lesson in the slice was
 * depth-filtered out.
 */
export function effectiveLessonsInPlacement(
  subject: Subject,
  block: PlacedBlock
): readonly Lesson[] {
  if (block.source.kind !== "sub-topic") return [];
  const found = findTopicAndSubTopic(subject.workingSpec, block.source.subTopicCode);
  if (!found) return [];
  const [start, end] = block.lessonRange;
  const sliced = found.subTopic.lessons.slice(
    Math.max(0, Math.min(start, found.subTopic.lessons.length)),
    Math.max(start, Math.min(end, found.subTopic.lessons.length))
  );
  if (subject.config.includeDepth) return sliced;
  return sliced.filter((l) => !l.isDepth);
}

/**
 * Lesson count for a placed block, after applying the depth toggle. This is
 * the "effective" lessonsClaimed value — what views/analytics/exports should
 * use instead of `block.lessonsClaimed` when `includeDepth=false`.
 *
 * Note: the raw `block.lessonsClaimed` is preserved on the data structure;
 * placement engine math still uses it (so the block visually claims its
 * full footprint in cells). Only consumer-side counts (coverage %, weekly
 * schedule totals, single-touch flags) get the discount.
 */
export function effectiveLessonCountForPlacement(
  subject: Subject,
  block: PlacedBlock
): number {
  if (block.source.kind !== "sub-topic") return block.lessonsClaimed;
  if (subject.config.includeDepth) return block.lessonsClaimed;
  return effectiveLessonsInPlacement(subject, block).length;
}

/**
 * Total spec lesson count for a subject, honouring the depth toggle. Used by
 * coverage % so the denominator matches the numerator: when toggle is off,
 * "100% coverage" means every foundation lesson is placed.
 */
export function effectiveSpecLessonCount(subject: Subject): number {
  let total = 0;
  for (const t of subject.workingSpec.topics) {
    for (const st of t.subTopics) {
      total += effectiveLessonsForSubTopic(subject, st).length;
    }
  }
  return total;
}
