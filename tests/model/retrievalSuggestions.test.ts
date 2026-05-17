import { describe, expect, it } from "vitest";

import { placeBlock } from "@/model/placement";
import { suggestRetrievalCandidates } from "@/model/retrievalSuggestions";
import { createDefaultTimeline } from "@/model/timeline";
import type { Spec, Subject } from "@/model/types";

function makeSubject(overrides?: Partial<Spec>): Subject {
  const spec: Spec = overrides
    ? ({ topics: overrides.topics ?? defaultTopics() } as Spec)
    : { topics: defaultTopics() };
  return {
    id: "subj",
    meta: { name: "Test", colour: "#1F3A5F", sourceFilename: null },
    importedSpec: spec,
    workingSpec: spec,
    timeline: createDefaultTimeline(),
    customBlocks: [],
    config: { includeDepth: false, lostLessonBuffer: false, autoSpillover: true },
  };
}

function defaultTopics() {
  return [
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
          difficulty: 2 as const,
          isDepth: false,
          separateOnly: false,
          notes: null,
          lessons: [
            { id: "T1a-L1", number: 1, title: "L1", practical: null, isDepth: false, separateOnly: false, objectives: [] },
            { id: "T1a-L2", number: 2, title: "L2", practical: null, isDepth: false, separateOnly: false, objectives: [] },
          ],
        },
        {
          id: "st-t1b",
          code: "T1b",
          name: "Newton",
          difficulty: 3 as const,
          isDepth: true, // depth content
          separateOnly: false,
          notes: null,
          lessons: [
            { id: "T1b-L1", number: 1, title: "L1", practical: null, isDepth: true, separateOnly: false, objectives: [] },
          ],
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
          difficulty: 1 as const,
          isDepth: false,
          separateOnly: false,
          notes: null,
          lessons: [
            { id: "T2a-L1", number: 1, title: "L1", practical: null, isDepth: false, separateOnly: false, objectives: [] },
          ],
        },
      ],
    },
  ];
}

describe("suggestRetrievalCandidates", () => {
  it("returns empty when nothing is placed", () => {
    const subject = makeSubject();
    expect(suggestRetrievalCandidates(subject, "Y10-A1")).toEqual([]);
  });

  it("returns empty when context half-term doesn't exist", () => {
    const subject = makeSubject();
    expect(suggestRetrievalCandidates(subject, "Y99-X1")).toEqual([]);
  });

  it("returns empty when context is the earliest half-term (nothing came before)", () => {
    const subject = makeSubject();
    const tl = placeBlock(subject.timeline, { kind: "sub-topic", subTopicCode: "T1a" }, "Y9-A1", 1);
    const placed: Subject = { ...subject, timeline: tl };
    expect(suggestRetrievalCandidates(placed, "Y9-A1")).toEqual([]);
  });

  it("returns only sub-topics placed before the context half-term", () => {
    const subject = makeSubject();
    let tl = placeBlock(subject.timeline, { kind: "sub-topic", subTopicCode: "T1a" }, "Y9-A1", 1); // before
    tl = placeBlock(tl, { kind: "sub-topic", subTopicCode: "T2a" }, "Y10-A2", 1); // after Y10-A1
    const placed: Subject = { ...subject, timeline: tl };
    const candidates = suggestRetrievalCandidates(placed, "Y10-A1");
    expect(candidates.map((c) => c.subTopicCode)).toEqual(["T1a"]);
  });

  it("scores a far-gap single-touch sub-topic higher than a recently-revisited one", () => {
    const subject = makeSubject();
    // T1a placed once in Y9-A1 (idx 0) — long gap, single-touch
    // T1b placed twice: Y9-A1 (0) and Y10-S2 (9) — recently revisited
    let tl = placeBlock(subject.timeline, { kind: "sub-topic", subTopicCode: "T1a" }, "Y9-A1", 1);
    tl = placeBlock(tl, { kind: "sub-topic", subTopicCode: "T1b" }, "Y9-A1", 1);
    tl = placeBlock(tl, { kind: "sub-topic", subTopicCode: "T1b" }, "Y10-S2", 1);
    const placed: Subject = { ...subject, timeline: tl };
    // Context: Y11-A1 (idx 12). T1a: 12HT gap, single-touch. T1b: 3HT gap, twice.
    const candidates = suggestRetrievalCandidates(placed, "Y11-A1");
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0]?.subTopicCode).toBe("T1a");
    // T1b still in the list but lower
    const t1bRank = candidates.findIndex((c) => c.subTopicCode === "T1b");
    expect(t1bRank).toBeGreaterThan(0);
  });

  it("respects maxCandidates", () => {
    const subject = makeSubject();
    let tl = placeBlock(subject.timeline, { kind: "sub-topic", subTopicCode: "T1a" }, "Y9-A1", 1);
    tl = placeBlock(tl, { kind: "sub-topic", subTopicCode: "T1b" }, "Y9-A1", 1);
    tl = placeBlock(tl, { kind: "sub-topic", subTopicCode: "T2a" }, "Y9-A1", 1);
    const placed: Subject = { ...subject, timeline: tl };
    const candidates = suggestRetrievalCandidates(placed, "Y10-A1", { maxCandidates: 1 });
    expect(candidates.length).toBe(1);
  });

  it("includes unplaced sub-topics when includeUnplaced is true", () => {
    const subject = makeSubject();
    const tl = placeBlock(subject.timeline, { kind: "sub-topic", subTopicCode: "T1a" }, "Y9-A1", 1);
    const placed: Subject = { ...subject, timeline: tl };

    const withoutUnplaced = suggestRetrievalCandidates(placed, "Y10-A1");
    const withUnplaced = suggestRetrievalCandidates(placed, "Y10-A1", { includeUnplaced: true });
    expect(withoutUnplaced.length).toBe(1);
    expect(withUnplaced.length).toBe(3);
    const unplacedEntry = withUnplaced.find((c) => c.subTopicCode === "T2a");
    expect(unplacedEntry?.totalPlacementsToDate).toBe(0);
    expect(unplacedEntry?.lastPlacementHalfTermId).toBe("—");
  });

  it("produces deterministic ordering and meaningful reason strings", () => {
    const subject = makeSubject();
    let tl = placeBlock(subject.timeline, { kind: "sub-topic", subTopicCode: "T1a" }, "Y9-A1", 1);
    tl = placeBlock(tl, { kind: "sub-topic", subTopicCode: "T1b" }, "Y9-A2", 1);
    const placed: Subject = { ...subject, timeline: tl };
    const first = suggestRetrievalCandidates(placed, "Y10-A1");
    const second = suggestRetrievalCandidates(placed, "Y10-A1");
    expect(first.map((c) => c.subTopicCode)).toEqual(second.map((c) => c.subTopicCode));
    // Reason contains the last-seen half-term id
    for (const c of first) {
      expect(c.reason).toContain(c.lastPlacementHalfTermId);
    }
    // T1b (isDepth + high difficulty) reason mentions both
    const t1b = first.find((c) => c.subTopicCode === "T1b");
    expect(t1b?.reason).toMatch(/depth/i);
    expect(t1b?.reason).toMatch(/high difficulty/i);
  });
});
