import type {
  PlacedBlock,
  Spec,
  SubTopic,
  Subject,
  Topic,
} from "./types";

const TOPIC_COLOURS: readonly string[] = [
  "#1F3A5F", // navy
  "#B98D2C", // gold
  "#6FA068", // moss green
  "#B85C5C", // brick
  "#7E5A8C", // violet
  "#3F7494", // steel blue
  "#8B6F47", // earth
  "#4E7A4E", // forest
  "#A65454", // rust
  "#5C8A8A", // teal grey
  "#947A3D", // mustard
  "#6E5097", // mauve
  "#3D6B82", // slate blue
  "#7B5B83", // dusk purple
  "#5F8554", // sage
  "#9B7B3F", // tan
];

export function getTopicColour(spec: Spec, topicCode: string): string {
  const idx = spec.topics.findIndex((t) => t.code === topicCode);
  const safe = idx === -1 ? 0 : idx;
  return TOPIC_COLOURS[safe % TOPIC_COLOURS.length] ?? TOPIC_COLOURS[0]!;
}

export interface TopicAndSubTopic {
  readonly topic: Topic;
  readonly subTopic: SubTopic;
}

export function findTopicAndSubTopic(
  spec: Spec,
  subTopicCode: string
): TopicAndSubTopic | null {
  for (const topic of spec.topics) {
    const subTopic = topic.subTopics.find((st) => st.code === subTopicCode);
    if (subTopic) return { topic, subTopic };
  }
  return null;
}

export interface PoolEntry {
  readonly topic: Topic;
  readonly subTopic: SubTopic;
  readonly unplacedLessons: number;
}

/**
 * Compute the "pool" view: every sub-topic in the working spec, paired with
 * the number of lessons NOT yet placed in the timeline. Entries with
 * `unplacedLessons === 0` are omitted (fully placed). Order matches the spec
 * order: topics in spec order, sub-topics within each in spec order.
 */
export function getPoolEntries(subject: Subject): PoolEntry[] {
  const placedBySub = new Map<string, number>();
  for (const ht of subject.timeline.halfTerms) {
    for (const pb of ht.placedBlocks) {
      if (pb.source.kind !== "sub-topic") continue;
      const prev = placedBySub.get(pb.source.subTopicCode) ?? 0;
      placedBySub.set(pb.source.subTopicCode, prev + pb.lessonsClaimed);
    }
  }
  const out: PoolEntry[] = [];
  for (const topic of subject.workingSpec.topics) {
    for (const subTopic of topic.subTopics) {
      const placed = placedBySub.get(subTopic.code) ?? 0;
      const unplaced = subTopic.lessons.length - placed;
      if (unplaced > 0) out.push({ topic, subTopic, unplacedLessons: unplaced });
    }
  }
  return out;
}

/**
 * Compute the list of placed blocks grouped by half-term, with EoHT placements
 * sorted to the end of each cell's list (per BUILD_PLAN.md §8 step 3).
 */
export function sortedBlocksForCell(
  blocks: readonly PlacedBlock[]
): readonly PlacedBlock[] {
  return [...blocks].sort((a, b) => {
    const aEoht = a.source.kind === "eoht" ? 1 : 0;
    const bEoht = b.source.kind === "eoht" ? 1 : 0;
    return aEoht - bEoht;
  });
}

/**
 * Look up a custom block by id within a subject.
 */
export function findCustomBlock(subject: Subject, customBlockId: string) {
  return subject.customBlocks.find((c) => c.id === customBlockId) ?? null;
}
