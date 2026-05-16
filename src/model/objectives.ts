import type {
  HalfTerm,
  Lesson,
  Objective,
  PlacedBlock,
  Spec,
  SubTopic,
  Subject,
  Topic,
} from "./types";

/**
 * One row of the Objective view: a single placed lesson with enough context
 * to render its half-term, sub-topic, lesson title, and objectives. Ordered
 * by calendar (half-term index, then placed-block order within the cell, then
 * lesson index within the block's lessonRange).
 */
export interface ObjectiveRow {
  readonly key: string;
  readonly halfTerm: HalfTerm;
  readonly topic: Topic;
  readonly subTopic: SubTopic;
  readonly lesson: Lesson;
  readonly placedBlock: PlacedBlock;
  readonly localLessonIdx: number;
}

/**
 * Walk the timeline in calendar order and emit one row per (placed sub-topic
 * lesson). EoHT and custom placements are skipped — the Objective view's
 * subject is the spec content, not the test calendar (per DEC-011).
 */
export function getObjectiveRows(subject: Subject): readonly ObjectiveRow[] {
  const rows: ObjectiveRow[] = [];
  for (const halfTerm of subject.timeline.halfTerms) {
    for (const placedBlock of halfTerm.placedBlocks) {
      if (placedBlock.source.kind !== "sub-topic") continue;
      const found = findTopicAndSubTopicLocal(
        subject.workingSpec,
        placedBlock.source.subTopicCode
      );
      if (!found) continue;
      const [start, end] = placedBlock.lessonRange;
      const safeStart = Math.max(0, start);
      const safeEnd = Math.min(found.subTopic.lessons.length, end);
      for (let i = safeStart; i < safeEnd; i++) {
        const lesson = found.subTopic.lessons[i];
        if (!lesson) continue;
        rows.push({
          key: `${placedBlock.id}:${i}`,
          halfTerm,
          topic: found.topic,
          subTopic: found.subTopic,
          lesson,
          placedBlock,
          localLessonIdx: i - safeStart,
        });
      }
    }
  }
  return rows;
}

export interface ObjectiveCoverage {
  readonly importedCount: number;
  readonly mappedCount: number;
  readonly workingTotal: number;
  readonly unmapped: readonly UnmappedObjective[];
}

/**
 * An imported-spec objective that no longer appears in the working spec.
 * Carries enough context to render in the side panel ("from L3 Acceleration").
 */
export interface UnmappedObjective {
  readonly objective: Objective;
  readonly originSubTopicCode: string;
  readonly originSubTopicName: string;
  readonly originLessonNumber: number;
  readonly originLessonTitle: string;
}

/**
 * Coverage = imported objectives still present (by id) in the working spec.
 *
 * - `importedCount`: total objectives in `importedSpec`.
 * - `mappedCount`: imported objectives whose id is still in some working
 *   lesson's objectives array.
 * - `workingTotal`: all objectives in workingSpec (includes user-added ones
 *   whose id isn't in importedSpec). Useful for the secondary "X total" number.
 * - `unmapped`: imported objectives not currently mapped, in their original
 *   spec order, with breadcrumb context.
 */
export function computeObjectiveCoverage(subject: Subject): ObjectiveCoverage {
  const workingIds = collectObjectiveIds(subject.workingSpec);
  const unmapped: UnmappedObjective[] = [];
  let importedCount = 0;
  let mappedCount = 0;

  for (const topic of subject.importedSpec.topics) {
    for (const subTopic of topic.subTopics) {
      for (const lesson of subTopic.lessons) {
        for (const objective of lesson.objectives) {
          importedCount++;
          if (workingIds.has(objective.id)) {
            mappedCount++;
          } else {
            unmapped.push({
              objective,
              originSubTopicCode: subTopic.code,
              originSubTopicName: subTopic.name,
              originLessonNumber: lesson.number,
              originLessonTitle: lesson.title,
            });
          }
        }
      }
    }
  }

  return {
    importedCount,
    mappedCount,
    workingTotal: workingIds.size,
    unmapped,
  };
}

function collectObjectiveIds(spec: Spec): Set<string> {
  const ids = new Set<string>();
  for (const topic of spec.topics) {
    for (const subTopic of topic.subTopics) {
      for (const lesson of subTopic.lessons) {
        for (const objective of lesson.objectives) {
          ids.add(objective.id);
        }
      }
    }
  }
  return ids;
}

/**
 * Locate an objective by id within a spec; returns the surrounding lesson and
 * sub-topic so the UI can show "currently in L3 Acceleration".
 */
export interface ObjectiveLocation {
  readonly topic: Topic;
  readonly subTopic: SubTopic;
  readonly lesson: Lesson;
  readonly objective: Objective;
}

export function findObjectiveLocation(
  spec: Spec,
  objectiveId: string
): ObjectiveLocation | null {
  for (const topic of spec.topics) {
    for (const subTopic of topic.subTopics) {
      for (const lesson of subTopic.lessons) {
        for (const objective of lesson.objectives) {
          if (objective.id === objectiveId) {
            return { topic, subTopic, lesson, objective };
          }
        }
      }
    }
  }
  return null;
}

function findTopicAndSubTopicLocal(
  spec: Spec,
  subTopicCode: string
): { topic: Topic; subTopic: SubTopic } | null {
  for (const topic of spec.topics) {
    const subTopic = topic.subTopics.find((st) => st.code === subTopicCode);
    if (subTopic) return { topic, subTopic };
  }
  return null;
}
