import { describe, expect, it } from "vitest";

import {
  appendLesson,
  setLessonObjectives,
  updateLesson,
} from "@/model/specEdits";
import type { Lesson, Objective, Spec } from "@/model/types";

function makeSpec(): Spec {
  return {
    topics: [
      {
        id: "t1",
        code: "T1",
        name: "Topic 1",
        paper: null,
        subTopics: [
          {
            id: "st-t1a",
            code: "T1a",
            name: "Sub-topic A",
            difficulty: 2,
            isDepth: false,
            separateOnly: false,
            notes: null,
            lessons: [
              {
                id: "L1",
                number: 1,
                title: "Original L1",
                practical: null,
                isDepth: false,
                separateOnly: false,
                objectives: [
                  { id: "o1", text: "obj one", isDepth: false },
                  { id: "o2", text: "obj two", isDepth: false },
                ],
              },
              {
                id: "L2",
                number: 2,
                title: "Original L2",
                practical: null,
                isDepth: false,
                separateOnly: false,
                objectives: [],
              },
            ],
          },
        ],
      },
    ],
  };
}

describe("updateLesson", () => {
  it("applies a shallow patch to the named lesson and returns a new spec", () => {
    const before = makeSpec();
    const after = updateLesson(before, "T1a", "L1", { title: "Renamed", isDepth: true });
    const l1 = after.topics[0]?.subTopics[0]?.lessons[0];
    expect(l1?.title).toBe("Renamed");
    expect(l1?.isDepth).toBe(true);
    // L2 untouched
    expect(after.topics[0]?.subTopics[0]?.lessons[1]?.title).toBe("Original L2");
    // input not mutated
    expect(before.topics[0]?.subTopics[0]?.lessons[0]?.title).toBe("Original L1");
  });

  it("returns a spec with new array identities for the modified branch", () => {
    const before = makeSpec();
    const after = updateLesson(before, "T1a", "L1", { title: "X" });
    expect(after).not.toBe(before);
    expect(after.topics).not.toBe(before.topics);
    expect(after.topics[0]?.subTopics).not.toBe(before.topics[0]?.subTopics);
    expect(after.topics[0]?.subTopics[0]?.lessons).not.toBe(
      before.topics[0]?.subTopics[0]?.lessons
    );
  });

  it("is a no-op for an unknown sub-topic or lesson id", () => {
    const before = makeSpec();
    expect(updateLesson(before, "T99z", "L1", { title: "X" })).toEqual(before);
    expect(updateLesson(before, "T1a", "ghost", { title: "X" })).toEqual(before);
  });
});

describe("setLessonObjectives", () => {
  it("replaces the objectives array of the named lesson", () => {
    const before = makeSpec();
    const next: Objective[] = [
      { id: "o-new", text: "fresh objective", isDepth: false },
    ];
    const after = setLessonObjectives(before, "T1a", "L1", next);
    expect(after.topics[0]?.subTopics[0]?.lessons[0]?.objectives).toEqual(next);
  });
});

describe("appendLesson", () => {
  it("appends a new lesson at the end of the sub-topic", () => {
    const before = makeSpec();
    const newLesson: Lesson = {
      id: "L3",
      number: 3,
      title: "Added in UI",
      practical: null,
      isDepth: false,
      separateOnly: false,
      objectives: [],
    };
    const after = appendLesson(before, "T1a", newLesson);
    expect(after.topics[0]?.subTopics[0]?.lessons.map((l) => l.id)).toEqual([
      "L1",
      "L2",
      "L3",
    ]);
  });

  it("is a no-op for an unknown sub-topic", () => {
    const before = makeSpec();
    const newLesson: Lesson = {
      id: "L3",
      number: 3,
      title: "x",
      practical: null,
      isDepth: false,
      separateOnly: false,
      objectives: [],
    };
    expect(appendLesson(before, "T99z", newLesson)).toEqual(before);
  });
});
