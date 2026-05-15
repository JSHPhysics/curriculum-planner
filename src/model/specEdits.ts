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
