import { findTopicAndSubTopic, getTopicColour } from "./queries";
import type { HalfTerm, Subject, Topic } from "./types";

/**
 * One sub-topic's contribution to a per-half-term topic block. Carries the
 * underlying PlacedBlock ids so the UI can drive bulk operations (e.g.
 * "move all of T2 in Y9 Spr 1 to Y9 Spr 2").
 */
export interface SubTopicContribution {
  readonly subTopicCode: string;
  readonly subTopicName: string;
  readonly lessons: number;
  readonly placedBlockIds: readonly string[];
}

/**
 * Aggregation of every sub-topic placement for a single topic in a single
 * half-term. EoHT and custom placements are excluded (the Topic view shows
 * curriculum content only, mirroring DEC-011's export framing).
 */
export interface TopicBlockSummary {
  readonly topicCode: string;
  readonly topicName: string;
  readonly colour: string;
  readonly totalLessons: number;
  readonly subTopics: readonly SubTopicContribution[];
  readonly placedBlockIds: readonly string[];
}

/**
 * Topic blocks present in a half-term, in spec topic order. Returns an empty
 * array if the cell holds no sub-topic placements.
 */
export function getTopicBlocksForCell(
  subject: Subject,
  halfTerm: HalfTerm
): readonly TopicBlockSummary[] {
  type Accum = {
    topic: Topic;
    perSubTopic: Map<string, {
      name: string;
      lessons: number;
      placedBlockIds: string[];
    }>;
    placedBlockIds: string[];
  };
  const byTopicCode = new Map<string, Accum>();

  for (const pb of halfTerm.placedBlocks) {
    if (pb.source.kind !== "sub-topic") continue;
    const found = findTopicAndSubTopic(subject.workingSpec, pb.source.subTopicCode);
    if (!found) continue;
    let acc = byTopicCode.get(found.topic.code);
    if (!acc) {
      acc = {
        topic: found.topic,
        perSubTopic: new Map(),
        placedBlockIds: [],
      };
      byTopicCode.set(found.topic.code, acc);
    }
    acc.placedBlockIds.push(pb.id);
    const existing = acc.perSubTopic.get(found.subTopic.code);
    if (existing) {
      existing.lessons += pb.lessonsClaimed;
      existing.placedBlockIds.push(pb.id);
    } else {
      acc.perSubTopic.set(found.subTopic.code, {
        name: found.subTopic.name,
        lessons: pb.lessonsClaimed,
        placedBlockIds: [pb.id],
      });
    }
  }

  const summaries: TopicBlockSummary[] = [];
  for (const topic of subject.workingSpec.topics) {
    const acc = byTopicCode.get(topic.code);
    if (!acc) continue;
    const subTopics: SubTopicContribution[] = [];
    let total = 0;
    // Order sub-topics within the block by spec order (stable across edits)
    for (const st of topic.subTopics) {
      const contrib = acc.perSubTopic.get(st.code);
      if (!contrib) continue;
      subTopics.push({
        subTopicCode: st.code,
        subTopicName: st.name,
        lessons: contrib.lessons,
        placedBlockIds: contrib.placedBlockIds,
      });
      total += contrib.lessons;
    }
    summaries.push({
      topicCode: topic.code,
      topicName: topic.name,
      colour: getTopicColour(subject.workingSpec, topic.code),
      totalLessons: total,
      subTopics,
      placedBlockIds: acc.placedBlockIds,
    });
  }
  return summaries;
}

/**
 * Collect the PlacedBlock ids of every sub-topic placement belonging to a
 * topic in a single half-term, preserving placedBlocks-array order. Used by
 * the store's `moveTopicInHalfTerm` action.
 */
export function getPlacedBlockIdsForTopicInCell(
  subject: Subject,
  halfTerm: HalfTerm,
  topicCode: string
): readonly string[] {
  const ids: string[] = [];
  for (const pb of halfTerm.placedBlocks) {
    if (pb.source.kind !== "sub-topic") continue;
    const found = findTopicAndSubTopic(subject.workingSpec, pb.source.subTopicCode);
    if (found?.topic.code === topicCode) ids.push(pb.id);
  }
  return ids;
}

/**
 * Sum the lessons placed for a topic across the whole timeline. Useful for
 * a future "topic uses N lessons across the year" header; not yet displayed
 * but kept here to keep aggregation logic in one place.
 */
export function getTotalLessonsForTopic(
  subject: Subject,
  topicCode: string
): number {
  let total = 0;
  for (const ht of subject.timeline.halfTerms) {
    for (const pb of ht.placedBlocks) {
      if (pb.source.kind !== "sub-topic") continue;
      const found = findTopicAndSubTopic(subject.workingSpec, pb.source.subTopicCode);
      if (found?.topic.code === topicCode) total += pb.lessonsClaimed;
    }
  }
  return total;
}

/**
 * Sum the EoHT and custom-block lessons in a half-term. The Topic view shows
 * these as a single grey footer per cell so the user still sees overall load
 * without conflating it with curriculum content.
 */
export function getNonContentLessonsInCell(halfTerm: HalfTerm): number {
  let total = 0;
  for (const pb of halfTerm.placedBlocks) {
    if (pb.source.kind === "sub-topic") continue;
    total += pb.lessonsClaimed;
  }
  return total;
}

