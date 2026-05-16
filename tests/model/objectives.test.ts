import { describe, expect, it } from "vitest";

import {
  computeObjectiveCoverage,
  findObjectiveLocation,
  getObjectiveRows,
} from "@/model/objectives";
import { placeBlock } from "@/model/placement";
import { addObjectiveToLesson, removeObjective } from "@/model/specEdits";
import { createDefaultTimeline } from "@/model/timeline";
import type { Objective, Spec, Subject } from "@/model/types";

function makeSubject(): Subject {
  const spec: Spec = {
    topics: [
      {
        id: "t1",
        code: "T1",
        name: "Forces",
        paper: null,
        subTopics: [
          {
            id: "st-t1a",
            code: "T1a",
            name: "Motion",
            difficulty: 2,
            isDepth: false,
            separateOnly: false,
            notes: null,
            lessons: [
              {
                id: "L1",
                number: 1,
                title: "Speed",
                practical: null,
                isDepth: false,
                separateOnly: false,
                objectives: [
                  { id: "o1", text: "Define speed", isDepth: false },
                  { id: "o2", text: "Speed = distance / time", isDepth: false },
                ],
              },
              {
                id: "L2",
                number: 2,
                title: "Acceleration",
                practical: null,
                isDepth: false,
                separateOnly: false,
                objectives: [
                  { id: "o3", text: "Define acceleration", isDepth: false },
                ],
              },
            ],
          },
          {
            id: "st-t1b",
            code: "T1b",
            name: "Newton",
            difficulty: 2,
            isDepth: false,
            separateOnly: false,
            notes: null,
            lessons: [
              {
                id: "L3",
                number: 1,
                title: "F = ma",
                practical: null,
                isDepth: false,
                separateOnly: false,
                objectives: [
                  { id: "o4", text: "State F = ma", isDepth: false },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
  return {
    id: "subj",
    meta: { name: "Test", colour: "#1F3A5F", sourceFilename: null },
    importedSpec: spec,
    workingSpec: JSON.parse(JSON.stringify(spec)) as Spec,
    timeline: createDefaultTimeline(),
    customBlocks: [],
    config: {
      includeDepth: false,
      lostLessonBuffer: false,
      autoSpillover: true,
    },
  };
}

describe("getObjectiveRows", () => {
  it("returns an empty list when nothing is placed", () => {
    const subject = makeSubject();
    expect(getObjectiveRows(subject).length).toBe(0);
  });

  it("emits one row per lesson covered by sub-topic placements, in calendar order", () => {
    const subject = makeSubject();
    const firstTerm = subject.timeline.halfTerms[0]!;
    const secondTerm = subject.timeline.halfTerms[1]!;
    const timeline1 = placeBlock(
      subject.timeline,
      { kind: "sub-topic", subTopicCode: "T1b" },
      secondTerm.id,
      1
    );
    const timeline2 = placeBlock(
      timeline1,
      { kind: "sub-topic", subTopicCode: "T1a" },
      firstTerm.id,
      2
    );
    const placed: Subject = { ...subject, timeline: timeline2 };
    const rows = getObjectiveRows(placed);
    // Calendar order: term 0 first (T1a placement = L1, L2), then term 1 (T1b placement = L3)
    expect(rows.map((r) => r.lesson.id)).toEqual(["L1", "L2", "L3"]);
    expect(rows[0]?.halfTerm.id).toBe(firstTerm.id);
    expect(rows[2]?.halfTerm.id).toBe(secondTerm.id);
  });

  it("skips EoHT and custom placements", () => {
    const subject = makeSubject();
    const firstTerm = subject.timeline.halfTerms[0]!;
    const tl = placeBlock(
      subject.timeline,
      { kind: "eoht" },
      firstTerm.id,
      1
    );
    const placed: Subject = { ...subject, timeline: tl };
    expect(getObjectiveRows(placed).length).toBe(0);
  });

  it("respects lessonRange (only emits lessons within the placed slice)", () => {
    const subject = makeSubject();
    const firstTerm = subject.timeline.halfTerms[0]!;
    // Place only 1 of 2 lessons of T1a (i.e. just L1)
    const tl = placeBlock(
      subject.timeline,
      { kind: "sub-topic", subTopicCode: "T1a" },
      firstTerm.id,
      1
    );
    const placed: Subject = { ...subject, timeline: tl };
    const rows = getObjectiveRows(placed);
    expect(rows.map((r) => r.lesson.id)).toEqual(["L1"]);
  });
});

describe("computeObjectiveCoverage", () => {
  it("reports full coverage immediately after import", () => {
    const subject = makeSubject();
    const cov = computeObjectiveCoverage(subject);
    expect(cov.importedCount).toBe(4);
    expect(cov.mappedCount).toBe(4);
    expect(cov.workingTotal).toBe(4);
    expect(cov.unmapped).toEqual([]);
  });

  it("reports an unmapped objective when one is removed from the working spec", () => {
    const subject = makeSubject();
    const withRemoval: Subject = {
      ...subject,
      workingSpec: removeObjective(subject.workingSpec, "o2"),
    };
    const cov = computeObjectiveCoverage(withRemoval);
    expect(cov.importedCount).toBe(4);
    expect(cov.mappedCount).toBe(3);
    expect(cov.workingTotal).toBe(3);
    expect(cov.unmapped.length).toBe(1);
    expect(cov.unmapped[0]?.objective.id).toBe("o2");
    expect(cov.unmapped[0]?.originSubTopicCode).toBe("T1a");
    expect(cov.unmapped[0]?.originLessonNumber).toBe(1);
  });

  it("counts user-added objectives in workingTotal but not in mappedCount", () => {
    const subject = makeSubject();
    const userObj: Objective = { id: "user-x", text: "extra", isDepth: false };
    const withAdded: Subject = {
      ...subject,
      workingSpec: addObjectiveToLesson(subject.workingSpec, "T1a", "L1", userObj),
    };
    const cov = computeObjectiveCoverage(withAdded);
    expect(cov.importedCount).toBe(4);
    expect(cov.mappedCount).toBe(4);
    expect(cov.workingTotal).toBe(5);
  });
});

describe("findObjectiveLocation", () => {
  it("returns the surrounding lesson and sub-topic for a known objective", () => {
    const subject = makeSubject();
    const loc = findObjectiveLocation(subject.workingSpec, "o3");
    expect(loc?.lesson.id).toBe("L2");
    expect(loc?.subTopic.code).toBe("T1a");
  });

  it("returns null for an unknown id", () => {
    const subject = makeSubject();
    expect(findObjectiveLocation(subject.workingSpec, "ghost")).toBeNull();
  });
});
