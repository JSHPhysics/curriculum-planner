import type { Lesson, Objective, Spec, SubTopic, Topic } from "./types";

export type LessonEditableFields = Pick<
  Lesson,
  "title" | "practical" | "isDepth" | "separateOnly"
>;

/**
 * Apply a shallow merge to a specific lesson identified by sub-topic code and
 * lesson id. Returns a new Spec with only the affected branch rebuilt.
 */
export function updateLesson(
  spec: Spec,
  subTopicCode: string,
  lessonId: string,
  patch: Partial<LessonEditableFields>
): Spec {
  return mapLesson(spec, subTopicCode, lessonId, (l) => ({ ...l, ...patch }));
}

/**
 * Replace the objectives array of a specific lesson.
 */
export function setLessonObjectives(
  spec: Spec,
  subTopicCode: string,
  lessonId: string,
  objectives: readonly Objective[]
): Spec {
  return mapLesson(spec, subTopicCode, lessonId, (l) => ({ ...l, objectives }));
}

/**
 * Append a new lesson to the named sub-topic. The lesson lands at the end of
 * the sub-topic's `lessons` array — no existing `lessonRange` index needs to
 * shift, so existing placements stay valid.
 */
export function appendLesson(
  spec: Spec,
  subTopicCode: string,
  lesson: Lesson
): Spec {
  return mapSubTopic(spec, subTopicCode, (st) => ({
    ...st,
    lessons: [...st.lessons, lesson],
  }));
}

export type ObjectiveEditableFields = Pick<Objective, "text" | "isDepth">;

/**
 * Edit a single objective in-place by id. Lesson identity is unused —
 * objective ids are spec-wide unique (generated at import / when user adds).
 * Walks every lesson; the cost is fine for v1 spec sizes.
 */
export function updateObjective(
  spec: Spec,
  objectiveId: string,
  patch: Partial<ObjectiveEditableFields>
): Spec {
  return mapEveryLesson(spec, (l) => {
    if (!l.objectives.some((o) => o.id === objectiveId)) return l;
    return {
      ...l,
      objectives: l.objectives.map((o) =>
        o.id === objectiveId ? { ...o, ...patch } : o
      ),
    };
  });
}

/**
 * Remove an objective from whichever lesson currently holds it. Becomes
 * "unmapped" automatically if the objective id exists in importedSpec.
 */
export function removeObjective(spec: Spec, objectiveId: string): Spec {
  return mapEveryLesson(spec, (l) => {
    if (!l.objectives.some((o) => o.id === objectiveId)) return l;
    return { ...l, objectives: l.objectives.filter((o) => o.id !== objectiveId) };
  });
}

/**
 * Append an objective to the named lesson (at end of the list).
 * No-op if the lesson already contains an objective with the same id —
 * caller may safely use this for "drag from unmapped panel to lesson"
 * without an explicit pre-check.
 */
export function addObjectiveToLesson(
  spec: Spec,
  subTopicCode: string,
  lessonId: string,
  objective: Objective
): Spec {
  return mapLesson(spec, subTopicCode, lessonId, (l) => {
    if (l.objectives.some((o) => o.id === objective.id)) return l;
    return { ...l, objectives: [...l.objectives, objective] };
  });
}

function mapEveryLesson(spec: Spec, update: (l: Lesson) => Lesson): Spec {
  return {
    topics: spec.topics.map((topic) => ({
      ...topic,
      subTopics: topic.subTopics.map((st) => ({
        ...st,
        lessons: st.lessons.map(update),
      })),
    })),
  };
}

function mapSubTopic(
  spec: Spec,
  subTopicCode: string,
  update: (st: SubTopic) => SubTopic
): Spec {
  return {
    topics: spec.topics.map((topic) => mapSubTopicInTopic(topic, subTopicCode, update)),
  };
}

function mapSubTopicInTopic(
  topic: Topic,
  subTopicCode: string,
  update: (st: SubTopic) => SubTopic
): Topic {
  if (!topic.subTopics.some((st) => st.code === subTopicCode)) return topic;
  return {
    ...topic,
    subTopics: topic.subTopics.map((st) =>
      st.code === subTopicCode ? update(st) : st
    ),
  };
}

function mapLesson(
  spec: Spec,
  subTopicCode: string,
  lessonId: string,
  update: (l: Lesson) => Lesson
): Spec {
  return mapSubTopic(spec, subTopicCode, (st) => {
    if (!st.lessons.some((l) => l.id === lessonId)) return st;
    return {
      ...st,
      lessons: st.lessons.map((l) => (l.id === lessonId ? update(l) : l)),
    };
  });
}
