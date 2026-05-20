import { describe, expect, it } from "vitest";

import {
  CodeConflictError,
  addObjectiveToLesson,
  appendLesson,
  removeObjective,
  renameSubTopic,
  renameTopic,
  reorderLessonInSubTopic,
  setLessonObjectives,
  updateLesson,
  updateObjective,
} from "@/model/specEdits";
import type { CustomBlock, Lesson, Objective, SavedPreset, Spec, Subject } from "@/model/types";

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

describe("updateObjective", () => {
  it("patches text/isDepth on the matching objective", () => {
    const before = makeSpec();
    const after = updateObjective(before, "o1", { text: "renamed", isDepth: true });
    const o1 = after.topics[0]?.subTopics[0]?.lessons[0]?.objectives[0];
    expect(o1?.text).toBe("renamed");
    expect(o1?.isDepth).toBe(true);
    // input untouched
    expect(before.topics[0]?.subTopics[0]?.lessons[0]?.objectives[0]?.text).toBe("obj one");
  });

  it("is a no-op for an unknown objective id", () => {
    const before = makeSpec();
    expect(updateObjective(before, "ghost", { text: "x" })).toEqual(before);
  });
});

describe("removeObjective", () => {
  it("removes the matching objective from whichever lesson holds it", () => {
    const before = makeSpec();
    const after = removeObjective(before, "o1");
    const ids = after.topics[0]?.subTopics[0]?.lessons[0]?.objectives.map((o) => o.id);
    expect(ids).toEqual(["o2"]);
  });

  it("is a no-op for an unknown objective id", () => {
    const before = makeSpec();
    expect(removeObjective(before, "ghost")).toEqual(before);
  });
});

describe("addObjectiveToLesson", () => {
  it("appends an objective at the end of the named lesson", () => {
    const before = makeSpec();
    const obj: Objective = { id: "o-x", text: "new", isDepth: false };
    const after = addObjectiveToLesson(before, "T1a", "L2", obj);
    expect(after.topics[0]?.subTopics[0]?.lessons[1]?.objectives).toEqual([obj]);
  });

  it("is a no-op when the lesson already contains an objective with the same id", () => {
    const before = makeSpec();
    const dup: Objective = { id: "o1", text: "duplicate text", isDepth: false };
    const after = addObjectiveToLesson(before, "T1a", "L1", dup);
    expect(after).toEqual(before);
  });

  it("is a no-op for an unknown sub-topic or lesson", () => {
    const before = makeSpec();
    const obj: Objective = { id: "o-x", text: "x", isDepth: false };
    expect(addObjectiveToLesson(before, "T99z", "L1", obj)).toEqual(before);
    expect(addObjectiveToLesson(before, "T1a", "ghost", obj)).toEqual(before);
  });
});

// ============================================================
// Topic / sub-topic renames with code cascade (DEC-047)
// ============================================================

function makeSubject(): Subject {
  const spec = makeSpec();
  // Add a second topic so the conflict-check has something to clash against.
  const spec2: Spec = {
    topics: [
      ...spec.topics,
      {
        id: "t2",
        code: "T2",
        name: "Topic 2",
        paper: null,
        subTopics: [
          {
            id: "st-t2a",
            code: "T2a",
            name: "Sub-topic 2A",
            difficulty: 1,
            isDepth: false,
            separateOnly: false,
            notes: null,
            lessons: [
              {
                id: "L-2a-1",
                number: 1,
                title: "T2a L1",
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
  const customBlock: CustomBlock = {
    id: "cb-1",
    name: "Retrieval block",
    lessons: 1,
    colour: "#B98D2C",
    isEoHT: false,
    category: "retrieval",
    revisits: ["T1a", "T2a"],
  };
  const preset: SavedPreset = {
    id: "p1",
    name: "Saved",
    createdAt: "2026-01-01T00:00:00.000Z",
    customBlocks: [
      {
        ref: "cb1",
        name: "Retrieval ref",
        lessons: 1,
        colour: null,
        category: "retrieval",
        revisits: ["T1a"],
      },
    ],
    placements: [
      {
        halfTermId: "Y9-A1",
        source: { kind: "sub-topic", subTopicCode: "T1a" },
        lessonsClaimed: 2,
        lessonRange: [0, 2],
      },
      {
        halfTermId: "Y9-A2",
        source: { kind: "sub-topic", subTopicCode: "T2a" },
        lessonsClaimed: 1,
        lessonRange: [0, 1],
      },
    ],
  };
  return {
    id: "subj",
    meta: { name: "T", colour: "#1F3A5F", sourceFilename: null },
    importedSpec: spec2,
    workingSpec: spec2,
    timeline: {
      halfTerms: [
        {
          id: "Y9-A1",
          year: "Y9",
          label: "Aut 1",
          dates: null,
          budget: 12,
          placedBlocks: [
            {
              id: "pb-1",
              source: { kind: "sub-topic", subTopicCode: "T1a" },
              lessonsClaimed: 2,
              lessonRange: [0, 2],
              splitFrom: null,
              splitType: null,
              userEdits: {},
            },
          ],
        },
      ],
    },
    customBlocks: [customBlock],
    config: { includeDepth: true, lostLessonBuffer: false, autoSpillover: true },
    presets: [preset],
  };
}

describe("renameTopic with code cascade", () => {
  it("renames just the name when newCode is not provided", () => {
    const before = makeSubject();
    const after = renameTopic(before, "T1", { name: "Renamed" });
    expect(after.workingSpec.topics[0]?.name).toBe("Renamed");
    expect(after.workingSpec.topics[0]?.code).toBe("T1");
    // No cascade.
    expect(after.timeline).toBe(before.timeline);
  });

  it("cascades a code change through sub-topics, placements, customs, presets", () => {
    const before = makeSubject();
    const after = renameTopic(before, "T1", { newCode: "T9" });
    // Topic code.
    expect(after.workingSpec.topics[0]?.code).toBe("T9");
    // Sub-topic code rewritten with new prefix.
    expect(after.workingSpec.topics[0]?.subTopics[0]?.code).toBe("T9a");
    // Placement updated.
    expect(after.timeline.halfTerms[0]?.placedBlocks[0]?.source).toEqual({
      kind: "sub-topic",
      subTopicCode: "T9a",
    });
    // Custom block revisits updated.
    expect(after.customBlocks[0]?.revisits).toEqual(["T9a", "T2a"]);
    // Saved preset placement + custom revisit updated.
    const preset = after.presets?.[0]!;
    expect(preset.placements[0]?.source).toEqual({
      kind: "sub-topic",
      subTopicCode: "T9a",
    });
    expect(preset.placements[1]?.source).toEqual({
      kind: "sub-topic",
      subTopicCode: "T2a",
    });
    expect(preset.customBlocks[0]?.revisits).toEqual(["T9a"]);
  });

  it("throws CodeConflictError when the new topic code is already taken", () => {
    const before = makeSubject();
    expect(() => renameTopic(before, "T1", { newCode: "T2" })).toThrow(CodeConflictError);
  });

  it("leaves importedSpec untouched", () => {
    const before = makeSubject();
    const after = renameTopic(before, "T1", { newCode: "T9" });
    expect(after.importedSpec).toBe(before.importedSpec);
  });
});

describe("renameSubTopic with code cascade", () => {
  it("renames the sub-topic name + cascades a code change to placements", () => {
    const before = makeSubject();
    const after = renameSubTopic(before, "T1a", { name: "Kinematics", newCode: "T1Z" });
    expect(after.workingSpec.topics[0]?.subTopics[0]?.name).toBe("Kinematics");
    expect(after.workingSpec.topics[0]?.subTopics[0]?.code).toBe("T1Z");
    expect(after.timeline.halfTerms[0]?.placedBlocks[0]?.source).toEqual({
      kind: "sub-topic",
      subTopicCode: "T1Z",
    });
    expect(after.customBlocks[0]?.revisits).toEqual(["T1Z", "T2a"]);
    expect(after.presets?.[0]?.placements[0]?.source).toEqual({
      kind: "sub-topic",
      subTopicCode: "T1Z",
    });
  });

  it("throws when the new code is already taken", () => {
    const before = makeSubject();
    expect(() =>
      renameSubTopic(before, "T1a", { newCode: "T2a" })
    ).toThrow(CodeConflictError);
  });

  it("name-only edit doesn't rewrite references (timeline reference preserved)", () => {
    const before = makeSubject();
    const after = renameSubTopic(before, "T1a", { name: "Better name" });
    expect(after.workingSpec.topics[0]?.subTopics[0]?.name).toBe("Better name");
    expect(after.timeline).toBe(before.timeline);
    expect(after.customBlocks).toBe(before.customBlocks);
  });

  it("rejects empty new code", () => {
    const before = makeSubject();
    expect(() => renameSubTopic(before, "T1a", { newCode: "  " })).not.toThrow();
    // Whitespace-only is normalised to "no change" by trimming.
    const r = renameSubTopic(before, "T1a", { newCode: "  " });
    expect(r.workingSpec.topics[0]?.subTopics[0]?.code).toBe("T1a");
  });
});

describe("reorderLessonInSubTopic (DEC-048)", () => {
  it("moves a lesson up within its sub-topic's array", () => {
    const before = makeSpec();
    const after = reorderLessonInSubTopic(before, "T1a", "L2", 0);
    const ids = after.topics[0]?.subTopics[0]?.lessons.map((l) => l.id) ?? [];
    expect(ids).toEqual(["L2", "L1"]);
  });

  it("moves a lesson down within its sub-topic's array", () => {
    const before = makeSpec();
    const after = reorderLessonInSubTopic(before, "T1a", "L1", 2);
    // Move L1 to index 2 (past end of 2-element array, clamps to end).
    const ids = after.topics[0]?.subTopics[0]?.lessons.map((l) => l.id) ?? [];
    expect(ids).toEqual(["L2", "L1"]);
  });

  it("is a no-op when the lesson doesn't exist", () => {
    const before = makeSpec();
    const after = reorderLessonInSubTopic(before, "T1a", "ghost", 0);
    expect(after).toEqual(before);
  });

  it("clamps a negative toIndex to 0", () => {
    const before = makeSpec();
    const after = reorderLessonInSubTopic(before, "T1a", "L2", -5);
    const ids = after.topics[0]?.subTopics[0]?.lessons.map((l) => l.id) ?? [];
    expect(ids).toEqual(["L2", "L1"]);
  });
});
