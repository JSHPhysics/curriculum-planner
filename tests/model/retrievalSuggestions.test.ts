import { describe, expect, it } from "vitest";

import { placeBlock } from "@/model/placement";
import {
  DEFAULT_RETRIEVAL_WEIGHTS,
  resolveRetrievalWeights,
  suggestRetrievalCandidates,
} from "@/model/retrievalSuggestions";
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

  it("respects subject.config.retrievalWeights overrides", () => {
    const subject = makeSubject();
    let tl = placeBlock(subject.timeline, { kind: "sub-topic", subTopicCode: "T1a" }, "Y9-A1", 1);
    tl = placeBlock(tl, { kind: "sub-topic", subTopicCode: "T1b" }, "Y9-A1", 1);
    const baseSubject: Subject = { ...subject, timeline: tl };

    // With defaults: T1a (no depth, difficulty 2) vs T1b (depth + difficulty 3)
    // Both have the same gap (~9 HT to Y10-A1, idx 6 - 0 = 6). T1b should outscore T1a.
    const withDefaults = suggestRetrievalCandidates(baseSubject, "Y10-A1");
    const t1bDefault = withDefaults.find((c) => c.subTopicCode === "T1b")!;
    const t1aDefault = withDefaults.find((c) => c.subTopicCode === "T1a")!;
    expect(t1bDefault.score).toBeGreaterThan(t1aDefault.score);

    // Now zero out depth + difficulty bonuses via subject.config override.
    // Both candidates should now have identical scores (same gap).
    const subjectWithFlatScoring: Subject = {
      ...baseSubject,
      config: {
        ...baseSubject.config,
        retrievalWeights: { depthBonus: 0, difficultyBonusPerLevel: 0 },
      },
    };
    const flat = suggestRetrievalCandidates(subjectWithFlatScoring, "Y10-A1");
    const t1bFlat = flat.find((c) => c.subTopicCode === "T1b")!;
    const t1aFlat = flat.find((c) => c.subTopicCode === "T1a")!;
    expect(t1bFlat.score).toBe(t1aFlat.score);
  });

  it("per-call options.weights override subject config (UI preview path)", () => {
    const subject = makeSubject();
    const tl = placeBlock(subject.timeline, { kind: "sub-topic", subTopicCode: "T1b" }, "Y9-A1", 1);
    const subjectWithConfig: Subject = {
      ...subject,
      timeline: tl,
      config: {
        ...subject.config,
        retrievalWeights: { depthBonus: 0 }, // config says no depth bonus
      },
    };

    const fromConfig = suggestRetrievalCandidates(subjectWithConfig, "Y10-A1");
    const fromCallOverride = suggestRetrievalCandidates(subjectWithConfig, "Y10-A1", {
      weights: { depthBonus: 0.5 }, // UI preview: depth bonus restored at higher value
    });
    const t1bFromConfig = fromConfig.find((c) => c.subTopicCode === "T1b")!;
    const t1bFromOverride = fromCallOverride.find((c) => c.subTopicCode === "T1b")!;
    expect(t1bFromOverride.score).toBeGreaterThan(t1bFromConfig.score);
  });
});

describe("resolveRetrievalWeights", () => {
  it("returns DEFAULT_RETRIEVAL_WEIGHTS when no overrides are set", () => {
    const subject = makeSubject();
    expect(resolveRetrievalWeights(subject)).toEqual(DEFAULT_RETRIEVAL_WEIGHTS);
  });

  it("layers options over subject.config over defaults, field-by-field", () => {
    const subject: Subject = {
      ...makeSubject(),
      config: {
        includeDepth: false,
        lostLessonBuffer: false,
        autoSpillover: true,
        retrievalWeights: { peakGapHalfTerms: 6, depthBonus: 0.3 },
      },
    };
    const resolved = resolveRetrievalWeights(subject, { peakGapHalfTerms: 10 });
    expect(resolved).toEqual({
      peakGapHalfTerms: 10, // from options
      depthBonus: 0.3, // from config
      difficultyBonusPerLevel: DEFAULT_RETRIEVAL_WEIGHTS.difficultyBonusPerLevel,
      repeatedPlacementPenalty: DEFAULT_RETRIEVAL_WEIGHTS.repeatedPlacementPenalty,
    });
  });
});
