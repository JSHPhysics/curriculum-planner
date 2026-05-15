import { describe, expect, it } from "vitest";

import { createDefaultTimeline, createEoHTBlocks, halfTermRoom, halfTermUsed } from "@/model/timeline";

function counterIdGen(): () => string {
  let n = 0;
  return () => `id-${++n}`;
}

describe("createDefaultTimeline", () => {
  const tl = createDefaultTimeline();

  it("produces 17 half-terms total (Y9: 6, Y10: 6, Y11: 5)", () => {
    expect(tl.halfTerms).toHaveLength(17);
    expect(tl.halfTerms.filter((h) => h.year === "Y9")).toHaveLength(6);
    expect(tl.halfTerms.filter((h) => h.year === "Y10")).toHaveLength(6);
    expect(tl.halfTerms.filter((h) => h.year === "Y11")).toHaveLength(5);
  });

  it("orders half-terms Y9 → Y10 → Y11, each in Aut→Spr→Sum order", () => {
    const ids = tl.halfTerms.map((h) => h.id);
    expect(ids).toEqual([
      "Y9-A1", "Y9-A2", "Y9-S1", "Y9-S2", "Y9-U1", "Y9-U2",
      "Y10-A1", "Y10-A2", "Y10-S1", "Y10-S2", "Y10-U1", "Y10-U2",
      "Y11-A1", "Y11-A2", "Y11-S1", "Y11-S2", "Y11-U1",
    ]);
  });

  it("uses prototype budget values (Y9-A1: 12, Y10-A1: 21, Y11-U1: 12)", () => {
    expect(tl.halfTerms.find((h) => h.id === "Y9-A1")?.budget).toBe(12);
    expect(tl.halfTerms.find((h) => h.id === "Y10-A1")?.budget).toBe(21);
    expect(tl.halfTerms.find((h) => h.id === "Y11-U1")?.budget).toBe(12);
  });

  it("starts every half-term with an empty placedBlocks array", () => {
    for (const ht of tl.halfTerms) {
      expect(ht.placedBlocks).toEqual([]);
    }
  });

  it("Y11 has no Sum 2 half-term (exams begin late May)", () => {
    expect(tl.halfTerms.find((h) => h.id === "Y11-U2")).toBeUndefined();
  });
});

describe("createEoHTBlocks", () => {
  it("adds one EoHT placement to every half-term", () => {
    const tl = createEoHTBlocks(createDefaultTimeline(), { idGen: counterIdGen() });
    for (const ht of tl.halfTerms) {
      expect(ht.placedBlocks).toHaveLength(1);
      const block = ht.placedBlocks[0];
      expect(block?.source.kind).toBe("eoht");
      expect(block?.lessonsClaimed).toBe(1);
      expect(block?.splitFrom).toBeNull();
      expect(block?.splitType).toBeNull();
    }
  });

  it("respects a custom lessonsPerEoHT", () => {
    const tl = createEoHTBlocks(createDefaultTimeline(), {
      lessonsPerEoHT: 3,
      idGen: counterIdGen(),
    });
    expect(tl.halfTerms[0]?.placedBlocks[0]?.lessonsClaimed).toBe(3);
  });

  it("preserves existing placed blocks rather than replacing them", () => {
    const base = createDefaultTimeline();
    const withFake = {
      halfTerms: base.halfTerms.map((ht, i) => {
        if (i !== 0) return ht;
        return {
          ...ht,
          placedBlocks: [{
            id: "pre-existing",
            source: { kind: "sub-topic" as const, subTopicCode: "T1a" },
            lessonsClaimed: 4,
            lessonRange: [0, 4] as const,
            splitFrom: null,
            splitType: null,
            userEdits: {},
          }],
        };
      }),
    };
    const result = createEoHTBlocks(withFake, { idGen: counterIdGen() });
    expect(result.halfTerms[0]?.placedBlocks).toHaveLength(2);
    expect(result.halfTerms[0]?.placedBlocks[0]?.id).toBe("pre-existing");
    expect(result.halfTerms[0]?.placedBlocks[1]?.source.kind).toBe("eoht");
  });
});

describe("halfTermUsed and halfTermRoom", () => {
  it("treat an empty half-term as fully open", () => {
    const tl = createDefaultTimeline();
    const ht = tl.halfTerms[0]!;
    expect(halfTermUsed(ht)).toBe(0);
    expect(halfTermRoom(ht)).toBe(ht.budget);
  });

  it("sum lessonsClaimed across placed blocks", () => {
    const tl = createDefaultTimeline();
    const ht = {
      ...tl.halfTerms[0]!,
      placedBlocks: [
        {
          id: "a",
          source: { kind: "sub-topic" as const, subTopicCode: "T1a" },
          lessonsClaimed: 5,
          lessonRange: [0, 5] as const,
          splitFrom: null,
          splitType: null,
          userEdits: {},
        },
        {
          id: "b",
          source: { kind: "sub-topic" as const, subTopicCode: "T1b" },
          lessonsClaimed: 3,
          lessonRange: [0, 3] as const,
          splitFrom: null,
          splitType: null,
          userEdits: {},
        },
      ],
    };
    expect(halfTermUsed(ht)).toBe(8);
    expect(halfTermRoom(ht)).toBe(ht.budget - 8);
  });

  it("clamps halfTermRoom to 0 when over-budget", () => {
    const tl = createDefaultTimeline();
    const ht = {
      ...tl.halfTerms[3]!,
      placedBlocks: [
        {
          id: "a",
          source: { kind: "sub-topic" as const, subTopicCode: "T1a" },
          lessonsClaimed: 100,
          lessonRange: [0, 100] as const,
          splitFrom: null,
          splitType: null,
          userEdits: {},
        },
      ],
    };
    expect(halfTermRoom(ht)).toBe(0);
  });
});
