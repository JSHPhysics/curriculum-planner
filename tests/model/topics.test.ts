import { describe, expect, it } from "vitest";

import { placeBlock } from "@/model/placement";
import { createDefaultTimeline, createEoHTBlocks } from "@/model/timeline";
import {
  getNonContentLessonsInCell,
  getPlacedBlockIdsForTopicInCell,
  getTopicBlocksForCell,
  getTotalLessonsForTopic,
} from "@/model/topics";
import type { Spec, Subject } from "@/model/types";

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
            lessons: makeLessons("T1a", 3),
          },
          {
            id: "st-t1b",
            code: "T1b",
            name: "Newton",
            difficulty: 2,
            isDepth: false,
            separateOnly: false,
            notes: null,
            lessons: makeLessons("T1b", 2),
          },
        ],
      },
      {
        id: "t2",
        code: "T2",
        name: "Energy",
        paper: null,
        subTopics: [
          {
            id: "st-t2a",
            code: "T2a",
            name: "KE",
            difficulty: 2,
            isDepth: false,
            separateOnly: false,
            notes: null,
            lessons: makeLessons("T2a", 2),
          },
        ],
      },
    ],
  };
  return {
    id: "subj",
    meta: { name: "Test", colour: "#1F3A5F", sourceFilename: null },
    importedSpec: spec,
    workingSpec: spec,
    timeline: createDefaultTimeline(),
    customBlocks: [],
    config: {
      includeDepth: false,
      lostLessonBuffer: false,
      autoSpillover: true,
    },
  };
}

function makeLessons(prefix: string, n: number) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({
      id: `${prefix}-L${i + 1}`,
      number: i + 1,
      title: `${prefix} lesson ${i + 1}`,
      practical: null,
      isDepth: false,
      separateOnly: false,
      objectives: [],
    });
  }
  return out;
}

describe("getTopicBlocksForCell", () => {
  it("returns an empty array when no sub-topic placements exist", () => {
    const subject = makeSubject();
    const ht = subject.timeline.halfTerms[0]!;
    expect(getTopicBlocksForCell(subject, ht)).toEqual([]);
  });

  it("aggregates two sub-topics of the same topic into one summary", () => {
    const subject = makeSubject();
    const ht = subject.timeline.halfTerms[0]!;
    let tl = placeBlock(
      subject.timeline,
      { kind: "sub-topic", subTopicCode: "T1a" },
      ht.id,
      3
    );
    tl = placeBlock(tl, { kind: "sub-topic", subTopicCode: "T1b" }, ht.id, 2);
    const placed: Subject = { ...subject, timeline: tl };
    const fresh = placed.timeline.halfTerms[0]!;
    const summaries = getTopicBlocksForCell(placed, fresh);
    expect(summaries.length).toBe(1);
    expect(summaries[0]?.topicCode).toBe("T1");
    expect(summaries[0]?.totalLessons).toBe(5);
    expect(summaries[0]?.subTopics.map((s) => s.subTopicCode)).toEqual(["T1a", "T1b"]);
    expect(summaries[0]?.subTopics[0]?.lessons).toBe(3);
    expect(summaries[0]?.subTopics[1]?.lessons).toBe(2);
  });

  it("returns one summary per topic when multiple topics are placed in the same cell", () => {
    const subject = makeSubject();
    const ht = subject.timeline.halfTerms[0]!;
    let tl = placeBlock(
      subject.timeline,
      { kind: "sub-topic", subTopicCode: "T2a" },
      ht.id,
      2
    );
    tl = placeBlock(tl, { kind: "sub-topic", subTopicCode: "T1a" }, ht.id, 1);
    const placed: Subject = { ...subject, timeline: tl };
    const fresh = placed.timeline.halfTerms[0]!;
    const summaries = getTopicBlocksForCell(placed, fresh);
    // Spec order: T1 before T2, regardless of placement order
    expect(summaries.map((s) => s.topicCode)).toEqual(["T1", "T2"]);
  });

  it("excludes EoHT and custom-block placements", () => {
    const subject = makeSubject();
    const withEoHT: Subject = { ...subject, timeline: createEoHTBlocks(subject.timeline) };
    const ht = withEoHT.timeline.halfTerms[0]!;
    expect(getTopicBlocksForCell(withEoHT, ht)).toEqual([]);
  });

  it("merges two PlacedBlocks of the same sub-topic (e.g. a split) into one contribution", () => {
    const subject = makeSubject();
    const ht = subject.timeline.halfTerms[0]!;
    // Place T1a twice in the same cell — simulates a manual recombine target
    let tl = placeBlock(
      subject.timeline,
      { kind: "sub-topic", subTopicCode: "T1a" },
      ht.id,
      1
    );
    tl = placeBlock(tl, { kind: "sub-topic", subTopicCode: "T1a" }, ht.id, 2);
    const placed: Subject = { ...subject, timeline: tl };
    const fresh = placed.timeline.halfTerms[0]!;
    const summaries = getTopicBlocksForCell(placed, fresh);
    expect(summaries[0]?.subTopics.length).toBe(1);
    expect(summaries[0]?.subTopics[0]?.lessons).toBe(3);
    expect(summaries[0]?.subTopics[0]?.placedBlockIds.length).toBe(2);
    expect(summaries[0]?.placedBlockIds.length).toBe(2);
  });
});

describe("getPlacedBlockIdsForTopicInCell", () => {
  it("returns ids of every sub-topic placement of a topic in a cell, in placedBlocks order", () => {
    const subject = makeSubject();
    const ht = subject.timeline.halfTerms[0]!;
    let tl = placeBlock(
      subject.timeline,
      { kind: "sub-topic", subTopicCode: "T1a" },
      ht.id,
      1
    );
    tl = placeBlock(tl, { kind: "sub-topic", subTopicCode: "T2a" }, ht.id, 1);
    tl = placeBlock(tl, { kind: "sub-topic", subTopicCode: "T1b" }, ht.id, 1);
    const placed: Subject = { ...subject, timeline: tl };
    const fresh = placed.timeline.halfTerms[0]!;
    const t1Ids = getPlacedBlockIdsForTopicInCell(placed, fresh, "T1");
    // Two T1 placements (T1a, T1b) returned in cell order (T1a first, then T1b after T2a)
    expect(t1Ids.length).toBe(2);
    expect(fresh.placedBlocks[0]?.id).toBe(t1Ids[0]);
    expect(fresh.placedBlocks[2]?.id).toBe(t1Ids[1]);
  });

  it("returns empty array when the topic has no placements in the cell", () => {
    const subject = makeSubject();
    const ht = subject.timeline.halfTerms[0]!;
    expect(getPlacedBlockIdsForTopicInCell(subject, ht, "T1")).toEqual([]);
  });
});

describe("getTotalLessonsForTopic", () => {
  it("sums lessons across every half-term", () => {
    const subject = makeSubject();
    const t1 = subject.timeline.halfTerms[0]!;
    const t2 = subject.timeline.halfTerms[1]!;
    let tl = placeBlock(
      subject.timeline,
      { kind: "sub-topic", subTopicCode: "T1a" },
      t1.id,
      2
    );
    tl = placeBlock(tl, { kind: "sub-topic", subTopicCode: "T1b" }, t2.id, 2);
    const placed: Subject = { ...subject, timeline: tl };
    expect(getTotalLessonsForTopic(placed, "T1")).toBe(4);
    expect(getTotalLessonsForTopic(placed, "T2")).toBe(0);
  });
});

describe("getNonContentLessonsInCell", () => {
  it("sums EoHT + custom lessons, ignoring sub-topic placements", () => {
    const subject = makeSubject();
    const withEoHT: Subject = { ...subject, timeline: createEoHTBlocks(subject.timeline) };
    const ht = withEoHT.timeline.halfTerms[0]!;
    expect(getNonContentLessonsInCell(ht)).toBe(1);
  });
});
