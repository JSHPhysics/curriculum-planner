import { describe, expect, it } from "vitest";

import {
  CodeConflictError,
  addObjectiveToLesson,
  appendLesson,
  deleteLessonFromSubTopic,
  deleteSubTopicFromSubject,
  duplicateLesson,
  duplicateSubTopic,
  moveLessonBetweenSubTopics,
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

describe("duplicateLesson / deleteLessonFromSubTopic / duplicateSubTopic / deleteSubTopicFromSubject (DEC-052)", () => {
  it("duplicateLesson appends a copy with new id + (copy) suffix", () => {
    const before = makeSpec();
    let i = 0;
    const after = duplicateLesson(before, "T1a", "L1", { idGen: () => `dup-${++i}` });
    const lessons = after.topics[0]?.subTopics[0]?.lessons ?? [];
    expect(lessons).toHaveLength(3);
    expect(lessons[2]?.id).toBe("dup-1");
    expect(lessons[2]?.title).toBe("Original L1 (copy)");
    // Objectives are cloned with fresh ids.
    expect(lessons[2]?.objectives[0]?.id).not.toBe("o1");
  });

  it("deleteLessonFromSubTopic shrinks placements covering the deleted lesson", () => {
    const before = makeSubject();
    // Add a placement that covers lessons [0, 2) of T1a — covers L1 and L2.
    const subjectWithPlacement: Subject = {
      ...before,
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
    };
    const after = deleteLessonFromSubTopic(subjectWithPlacement, "T1a", "L1");
    // L1 was at index 0; placement [0, 2) shrinks to [0, 1).
    const pb = after.timeline.halfTerms[0]?.placedBlocks[0];
    expect(pb?.lessonRange).toEqual([0, 1]);
    expect(pb?.lessonsClaimed).toBe(1);
    // Sub-topic now has only L2.
    expect(after.workingSpec.topics[0]?.subTopics[0]?.lessons).toHaveLength(1);
  });

  it("deleteLessonFromSubTopic shifts placements after the deleted lesson down by 1", () => {
    const before = makeSubject();
    // Append an extra lesson so we have 3.
    const withL3: Subject = {
      ...before,
      workingSpec: {
        topics: before.workingSpec.topics.map((t) => ({
          ...t,
          subTopics: t.subTopics.map((s) =>
            s.code === "T1a"
              ? {
                  ...s,
                  lessons: [
                    ...s.lessons,
                    {
                      id: "L3",
                      number: 3,
                      title: "L3",
                      practical: null,
                      isDepth: false,
                      separateOnly: false,
                      objectives: [],
                    },
                  ],
                }
              : s
          ),
        })),
      },
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
                id: "pb-late",
                source: { kind: "sub-topic", subTopicCode: "T1a" },
                lessonsClaimed: 1,
                lessonRange: [2, 3], // covers L3 only
                splitFrom: null,
                splitType: null,
                userEdits: {},
              },
            ],
          },
        ],
      },
    };
    // Delete L1 (index 0). [2, 3) should shift to [1, 2).
    const after = deleteLessonFromSubTopic(withL3, "T1a", "L1");
    expect(after.timeline.halfTerms[0]?.placedBlocks[0]?.lessonRange).toEqual([1, 2]);
  });

  it("duplicateSubTopic generates a fresh code and clones lessons with new ids", () => {
    const before = makeSubject();
    let i = 0;
    const after = duplicateSubTopic(before, "T1a", { idGen: () => `dup-${++i}` });
    const topic = after.workingSpec.topics[0]!;
    expect(topic.subTopics).toHaveLength(2); // original + copy
    const copy = topic.subTopics[1]!;
    expect(copy.code).toBe("T1b"); // next available letter
    expect(copy.name).toBe("Sub-topic A (copy)");
    expect(copy.lessons[0]?.id).toBe("dup-2"); // dup-1 is the sub-topic
  });

  it("deleteSubTopicFromSubject removes spec + placements + customs + presets references", () => {
    const before = makeSubject();
    const after = deleteSubTopicFromSubject(before, "T1a");
    // Sub-topic gone from spec.
    expect(after.workingSpec.topics[0]?.subTopics.find((s) => s.code === "T1a")).toBeUndefined();
    // Placement gone.
    expect(after.timeline.halfTerms[0]?.placedBlocks).toEqual([]);
    // Custom-block revisits no longer contain T1a.
    expect(after.customBlocks[0]?.revisits).toEqual(["T2a"]);
    // Saved-preset placement gone; the T2a placement remains.
    const preset = after.presets?.[0]!;
    expect(preset.placements).toHaveLength(1);
    expect(preset.placements[0]?.source).toEqual({
      kind: "sub-topic",
      subTopicCode: "T2a",
    });
    expect(preset.customBlocks[0]?.revisits).toEqual([]);
  });
});

describe("moveLessonBetweenSubTopics (DEC-055)", () => {
  function makeMoveSubject(): Subject {
    // T1a has L1, L2 (from makeSpec). Add a placement in Y9-A1 that covers
    // T1a's [0, 2). Also seed a T2a sub-topic with one lesson + a placement
    // in Y9-A1 covering [0, 1). So the drop cell Y9-A1 has BOTH source and
    // target PBs side by side.
    const base = makeSubject();
    const withT2aLesson: Spec = {
      topics: base.workingSpec.topics.map((t) =>
        t.code !== "T2"
          ? t
          : {
              ...t,
              subTopics: t.subTopics.map((st) =>
                st.code !== "T2a"
                  ? st
                  : {
                      ...st,
                      lessons: [
                        {
                          id: "T2a-L1",
                          number: 1,
                          title: "T2a lesson 1",
                          practical: null,
                          isDepth: false,
                          separateOnly: false,
                          objectives: [],
                        },
                      ],
                    }
              ),
            }
      ),
    };
    return {
      ...base,
      workingSpec: withT2aLesson,
      importedSpec: withT2aLesson,
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
                id: "pb-t1a",
                source: { kind: "sub-topic", subTopicCode: "T1a" },
                lessonsClaimed: 2,
                lessonRange: [0, 2],
                splitFrom: null,
                splitType: null,
                userEdits: {},
              },
              {
                id: "pb-t2a",
                source: { kind: "sub-topic", subTopicCode: "T2a" },
                lessonsClaimed: 1,
                lessonRange: [0, 1],
                splitFrom: null,
                splitType: null,
                userEdits: {},
              },
            ],
          },
        ],
      },
    };
  }

  it("re-parents a lesson and shrinks the source PB while extending the target PB", () => {
    const before = makeMoveSubject();
    // Move T1a's L1 (idx 0) into T2a at idx 0 (before T2a's existing lesson).
    const after = moveLessonBetweenSubTopics(before, "T1a", "L1", "T2a", 0, "Y9-A1");

    // T1a now has just L2.
    const t1a = after.workingSpec.topics[0]?.subTopics[0];
    expect(t1a?.lessons.map((l) => l.id)).toEqual(["L2"]);

    // T2a now has [L1, T2a-L1].
    const t2a = after.workingSpec.topics.find((t) => t.code === "T2")?.subTopics[0];
    expect(t2a?.lessons.map((l) => l.id)).toEqual(["L1", "T2a-L1"]);

    // Source PB shrunk from [0, 2) → [0, 1).
    const sourcePb = after.timeline.halfTerms[0]?.placedBlocks.find(
      (b) => b.id === "pb-t1a"
    );
    expect(sourcePb?.lessonRange).toEqual([0, 1]);
    expect(sourcePb?.lessonsClaimed).toBe(1);

    // Target PB extended from [0, 1) → [0, 2).
    const targetPb = after.timeline.halfTerms[0]?.placedBlocks.find(
      (b) => b.id === "pb-t2a"
    );
    expect(targetPb?.lessonRange).toEqual([0, 2]);
    expect(targetPb?.lessonsClaimed).toBe(2);
  });

  it("drops the source PB entirely when the moved lesson was its only lesson", () => {
    const before = makeMoveSubject();
    // First shrink the T1a PB to cover only L1.
    const subject: Subject = {
      ...before,
      timeline: {
        halfTerms: before.timeline.halfTerms.map((ht) => ({
          ...ht,
          placedBlocks: ht.placedBlocks.map((pb) =>
            pb.id !== "pb-t1a"
              ? pb
              : { ...pb, lessonsClaimed: 1, lessonRange: [0, 1] }
          ),
        })),
      },
    };
    const after = moveLessonBetweenSubTopics(subject, "T1a", "L1", "T2a", 0, "Y9-A1");
    const sourceSurvives = after.timeline.halfTerms[0]?.placedBlocks.find(
      (b) => b.id === "pb-t1a"
    );
    expect(sourceSurvives).toBeUndefined();
  });

  it("noop when fromSubTopicCode === toSubTopicCode (use reorderLessonInSubTopic)", () => {
    const before = makeMoveSubject();
    const after = moveLessonBetweenSubTopics(before, "T1a", "L1", "T1a", 1, "Y9-A1");
    expect(after).toBe(before);
  });

  it("clamps toIndexInTarget to the target sub-topic's lesson count", () => {
    const before = makeMoveSubject();
    const after = moveLessonBetweenSubTopics(
      before,
      "T1a",
      "L1",
      "T2a",
      9999,
      "Y9-A1"
    );
    const t2a = after.workingSpec.topics.find((t) => t.code === "T2")?.subTopics[0];
    // L1 lands at end (after T2a-L1).
    expect(t2a?.lessons.map((l) => l.id)).toEqual(["T2a-L1", "L1"]);
  });

  it("leaves the lesson unplaced when no target-sub-topic PB exists in the cell", () => {
    // toTermId = "" → no cell match → no PB extends.
    const before = makeMoveSubject();
    const after = moveLessonBetweenSubTopics(before, "T1a", "L1", "T2a", 1, "");
    // T1a PB shrunk.
    const sourcePb = after.timeline.halfTerms[0]?.placedBlocks.find(
      (b) => b.id === "pb-t1a"
    );
    expect(sourcePb?.lessonRange).toEqual([0, 1]);
    // T2a PB unchanged — no extension because toTermId didn't match.
    const targetPb = after.timeline.halfTerms[0]?.placedBlocks.find(
      (b) => b.id === "pb-t2a"
    );
    expect(targetPb?.lessonRange).toEqual([0, 1]);
    expect(targetPb?.lessonsClaimed).toBe(1);
  });
});
