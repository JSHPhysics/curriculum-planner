import { describe, expect, it } from "vitest";

import {
  applyCalendarTemplate,
  createDefaultTimeline,
  createEoHTBlocks,
  DEFAULT_CALENDAR_TEMPLATE,
  getTimelineYears,
  getVisibleTimelineYears,
  halfTermRoom,
  halfTermUsed,
  inferKeyStage,
} from "@/model/timeline";
import type { CalendarTemplate, Subject } from "@/model/types";

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
    const baseHt = tl.halfTerms[3]!;
    const ht = {
      ...baseHt,
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

describe("applyCalendarTemplate", () => {
  it("derives per-cell budgets from lessons-per-cycle × weeks ÷ cycle-length", () => {
    const template: CalendarTemplate = {
      cycleLengthInWeeks: 2,
      lessonsPerCyclePerYear: { Y9: 4 },
      halfTerms: [
        { id: "Y9-HT1", name: "Aut 1", year: "Y9", weeks: 6 }, // 4*6/2 = 12
        { id: "Y9-HT2", name: "Aut 2", year: "Y9", weeks: 5 }, // 4*5/2 = 10
        { id: "Y9-HT3", name: "Spr 1", year: "Y9", weeks: 4 }, // 4*4/2 = 8
      ],
    };
    const tl = applyCalendarTemplate(template);
    expect(tl.halfTerms.map((h) => h.budget)).toEqual([12, 10, 8]);
  });

  it("honours budgetOverride when present", () => {
    const template: CalendarTemplate = {
      cycleLengthInWeeks: 2,
      lessonsPerCyclePerYear: { Y9: 4 },
      halfTerms: [
        { id: "Y9-HT1", name: "Aut 1", year: "Y9", weeks: 6, budgetOverride: 11 },
      ],
    };
    const tl = applyCalendarTemplate(template);
    expect(tl.halfTerms[0]?.budget).toBe(11); // overrides derived 12
  });

  it("treats years with no lessons-per-cycle entry as 0-budget cells", () => {
    const template: CalendarTemplate = {
      cycleLengthInWeeks: 2,
      lessonsPerCyclePerYear: {}, // none configured
      halfTerms: [{ id: "Y9-HT1", name: "Aut 1", year: "Y9", weeks: 6 }],
    };
    const tl = applyCalendarTemplate(template);
    expect(tl.halfTerms[0]?.budget).toBe(0);
  });

  it("formats date ranges into a human-readable display string", () => {
    const template: CalendarTemplate = {
      cycleLengthInWeeks: 2,
      lessonsPerCyclePerYear: { Y9: 4 },
      halfTerms: [
        {
          id: "Y9-HT1",
          name: "Aut 1",
          year: "Y9",
          weeks: 6,
          startDate: "2025-09-04",
          endDate: "2025-10-16",
        },
      ],
    };
    const tl = applyCalendarTemplate(template);
    expect(tl.halfTerms[0]?.dates).toBe("4 Sep – 16 Oct");
  });

  it("creates Timeline whose budgets reproduce the LEHS hand-tuned defaults", () => {
    const tl = applyCalendarTemplate(DEFAULT_CALENDAR_TEMPLATE);
    const y9Budgets = tl.halfTerms.filter((h) => h.year === "Y9").map((h) => h.budget);
    expect(y9Budgets).toEqual([12, 12, 11, 9, 13, 9]); // matches the original LEHS values
    const y10Total = tl.halfTerms.filter((h) => h.year === "Y10").reduce((s, h) => s + h.budget, 0);
    expect(y10Total).toBe(105);
  });
});

describe("getTimelineYears", () => {
  it("returns years present in canonical Y7→Y13 order", () => {
    const tl = createDefaultTimeline();
    expect(getTimelineYears(tl)).toEqual(["Y9", "Y10", "Y11"]);
  });

  it("supports KS3 (Y7–Y9) and KS5 (Y12–Y13) timelines", () => {
    const ks3: CalendarTemplate = {
      cycleLengthInWeeks: 1,
      lessonsPerCyclePerYear: { Y7: 3, Y8: 3, Y9: 3 },
      halfTerms: [
        { id: "Y8-HT1", name: "HT1", year: "Y8", weeks: 6 },
        { id: "Y7-HT1", name: "HT1", year: "Y7", weeks: 6 },
        { id: "Y9-HT1", name: "HT1", year: "Y9", weeks: 6 },
      ],
    };
    // Output ignores insertion order — always canonical
    expect(getTimelineYears(applyCalendarTemplate(ks3))).toEqual(["Y7", "Y8", "Y9"]);
  });
});

describe("getVisibleTimelineYears", () => {
  function fakeSubject(hidden: readonly ("Y9" | "Y10" | "Y11")[] | undefined): Subject {
    return {
      id: "subj",
      meta: { name: "Test", colour: "#1F3A5F", sourceFilename: null },
      importedSpec: { topics: [] },
      workingSpec: { topics: [] },
      timeline: createDefaultTimeline(),
      customBlocks: [],
      config: {
        includeDepth: false,
        lostLessonBuffer: false,
        autoSpillover: true,
        ...(hidden !== undefined ? { hiddenYears: hidden } : {}),
      },
    };
  }

  it("returns all timeline years when no hidden years are set", () => {
    expect(getVisibleTimelineYears(fakeSubject(undefined))).toEqual(["Y9", "Y10", "Y11"]);
  });

  it("filters out hidden years from the result", () => {
    expect(getVisibleTimelineYears(fakeSubject(["Y9"]))).toEqual(["Y10", "Y11"]);
    expect(getVisibleTimelineYears(fakeSubject(["Y9", "Y11"]))).toEqual(["Y10"]);
  });

  it("returns empty list when all timeline years are hidden", () => {
    expect(getVisibleTimelineYears(fakeSubject(["Y9", "Y10", "Y11"]))).toEqual([]);
  });
});

describe("inferKeyStage", () => {
  it("returns KS4 for the default LEHS timeline (Y9-Y11 only)", () => {
    expect(inferKeyStage(createDefaultTimeline())).toBe("KS4");
  });

  it("returns KS3 for a Y7-Y9 timeline", () => {
    const ks3: CalendarTemplate = {
      cycleLengthInWeeks: 1,
      lessonsPerCyclePerYear: { Y7: 3, Y8: 3, Y9: 3 },
      halfTerms: [
        { id: "Y7-HT1", name: "HT1", year: "Y7", weeks: 6 },
        { id: "Y8-HT1", name: "HT1", year: "Y8", weeks: 6 },
      ],
    };
    expect(inferKeyStage(applyCalendarTemplate(ks3))).toBe("KS3");
  });

  it("returns KS5 for a Y12-Y13 timeline", () => {
    const ks5: CalendarTemplate = {
      cycleLengthInWeeks: 1,
      lessonsPerCyclePerYear: { Y12: 9, Y13: 9 },
      halfTerms: [{ id: "Y12-HT1", name: "HT1", year: "Y12", weeks: 6 }],
    };
    expect(inferKeyStage(applyCalendarTemplate(ks5))).toBe("KS5");
  });

  it("returns null for a timeline that straddles key stages", () => {
    const mixed: CalendarTemplate = {
      cycleLengthInWeeks: 1,
      lessonsPerCyclePerYear: { Y10: 4, Y12: 4 },
      halfTerms: [
        { id: "Y10-HT1", name: "HT1", year: "Y10", weeks: 6 },
        { id: "Y12-HT1", name: "HT1", year: "Y12", weeks: 6 },
      ],
    };
    expect(inferKeyStage(applyCalendarTemplate(mixed))).toBeNull();
  });

  it("returns null for an empty timeline", () => {
    expect(inferKeyStage({ halfTerms: [] })).toBeNull();
  });
});
