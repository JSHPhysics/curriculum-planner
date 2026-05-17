import { describe, expect, it } from "vitest";

import { placeBlock } from "@/model/placement";
import {
  DEFAULT_SPACING_THRESHOLDS,
  getInterleavingScore,
  getInterleavingScoresAll,
  getPlacementHistory,
  getSpacingFlags,
  getSpacingFlagsByKeyStage,
  getSpacingProfile,
  getSpacingProfilesAll,
  getTopicPlacementHistory,
  getTopicSpacingFlags,
  getTopicSpacingFlagsByKeyStage,
  getTopicSpacingProfile,
  getTopicSpacingProfilesAll,
  resolveSpacingThresholds,
} from "@/model/spacing";
import { createDefaultTimeline, createEoHTBlocks } from "@/model/timeline";
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
            // 5 lessons so the "T1a placed with 5 lessons → blocked cell"
            // test still triggers the blockedCellMinLessons=4 threshold.
            // Pre-DEC-040 the analytics used raw lessonsClaimed=5 even when
            // the spec only defined 3; now the effective count is clamped to
            // the slice, so the fixture has to provide the full set.
            lessons: makeLessons("T1a", 5, false),
          },
          {
            id: "st-t1b",
            code: "T1b",
            name: "Newton",
            difficulty: 3,
            isDepth: true,
            separateOnly: false,
            notes: null,
            lessons: makeLessons("T1b", 2, false),
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
            difficulty: 1,
            isDepth: false,
            separateOnly: false,
            notes: null,
            lessons: makeLessons("T2a", 2, false),
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
    config: { includeDepth: false, lostLessonBuffer: false, autoSpillover: true },
  };
}

function makeLessons(prefix: string, n: number, depth: boolean) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({
      id: `${prefix}-L${i + 1}`,
      number: i + 1,
      title: `${prefix} lesson ${i + 1}`,
      practical: null,
      isDepth: depth,
      separateOnly: false,
      objectives: [],
    });
  }
  return out;
}

describe("getPlacementHistory", () => {
  it("returns empty array for an unplaced sub-topic", () => {
    const subject = makeSubject();
    expect(getPlacementHistory(subject, "T1a")).toEqual([]);
  });

  it("returns one entry per placement, in calendar order across half-terms", () => {
    const subject = makeSubject();
    // Place T1a in Y9-S1 (index 2) then again in Y10-A1 (index 6) and Y11-A1 (index 12).
    let tl = placeBlock(subject.timeline, { kind: "sub-topic", subTopicCode: "T1a" }, "Y10-A1", 1);
    tl = placeBlock(tl, { kind: "sub-topic", subTopicCode: "T1a" }, "Y9-S1", 1);
    tl = placeBlock(tl, { kind: "sub-topic", subTopicCode: "T1a" }, "Y11-A1", 1);
    const subjectAfter: Subject = { ...subject, timeline: tl };

    const history = getPlacementHistory(subjectAfter, "T1a");
    expect(history.map((p) => p.halfTerm.id)).toEqual(["Y9-S1", "Y10-A1", "Y11-A1"]);
    expect(history.map((p) => p.halfTermIdx)).toEqual([2, 6, 12]);
  });

  it("includes multiple placements in the same half-term in cell order", () => {
    const subject = makeSubject();
    let tl = placeBlock(subject.timeline, { kind: "sub-topic", subTopicCode: "T1a" }, "Y9-A1", 1);
    tl = placeBlock(tl, { kind: "sub-topic", subTopicCode: "T1a" }, "Y9-A1", 2);
    const subjectAfter: Subject = { ...subject, timeline: tl };

    const history = getPlacementHistory(subjectAfter, "T1a");
    expect(history.length).toBe(2);
    expect(history[0]?.lessonsClaimed).toBe(1);
    expect(history[1]?.lessonsClaimed).toBe(2);
  });
});

describe("getSpacingProfile", () => {
  it("reports isUnplaced for a sub-topic never placed", () => {
    const subject = makeSubject();
    const profile = getSpacingProfile(subject, "T1a");
    expect(profile.isUnplaced).toBe(true);
    expect(profile.isSingleTouch).toBe(false);
    expect(profile.gapsInHalfTerms).toEqual([]);
    expect(profile.maxGap).toBeNull();
    expect(profile.meanGap).toBeNull();
    expect(profile.lastPlacementHalfTermIdx).toBeNull();
  });

  it("reports isSingleTouch for a sub-topic placed exactly once", () => {
    const subject = makeSubject();
    const tl = placeBlock(subject.timeline, { kind: "sub-topic", subTopicCode: "T1a" }, "Y9-A1", 3);
    const subjectAfter: Subject = { ...subject, timeline: tl };
    const profile = getSpacingProfile(subjectAfter, "T1a");
    expect(profile.isUnplaced).toBe(false);
    expect(profile.isSingleTouch).toBe(true);
    expect(profile.lastPlacementHalfTermIdx).toBe(0);
    expect(profile.gapsInHalfTerms).toEqual([]);
  });

  it("computes correct gaps + max + mean for 3 placements", () => {
    const subject = makeSubject();
    // Y9-A1 (0) -> Y9-S1 (2): gap 2; Y9-S1 (2) -> Y10-A2 (7): gap 5
    let tl = placeBlock(subject.timeline, { kind: "sub-topic", subTopicCode: "T1a" }, "Y9-A1", 1);
    tl = placeBlock(tl, { kind: "sub-topic", subTopicCode: "T1a" }, "Y9-S1", 1);
    tl = placeBlock(tl, { kind: "sub-topic", subTopicCode: "T1a" }, "Y10-A2", 1);
    const subjectAfter: Subject = { ...subject, timeline: tl };
    const profile = getSpacingProfile(subjectAfter, "T1a");
    expect(profile.gapsInHalfTerms).toEqual([2, 5]);
    expect(profile.maxGap).toBe(5);
    expect(profile.meanGap).toBe(3.5);
    expect(profile.lastPlacementHalfTermIdx).toBe(7);
  });
});

describe("getSpacingProfilesAll", () => {
  it("returns one profile per sub-topic in spec order, including unplaced", () => {
    const subject = makeSubject();
    const profiles = getSpacingProfilesAll(subject);
    expect(profiles.map((p) => p.subTopicCode)).toEqual(["T1a", "T1b", "T2a"]);
    expect(profiles.every((p) => p.isUnplaced)).toBe(true);
  });
});

describe("getInterleavingScore", () => {
  it("returns zeros for an empty cell", () => {
    const subject = makeSubject();
    const ht = subject.timeline.halfTerms[0]!;
    const score = getInterleavingScore(subject, ht);
    expect(score.distinctTopicCount).toBe(0);
    expect(score.totalLessons).toBe(0);
    expect(score.dominantTopicCode).toBeNull();
    expect(score.dominantTopicShare).toBe(0);
  });

  it("reports dominant topic share when one topic dominates", () => {
    const subject = makeSubject();
    // Place 3 lessons of T1a + 1 lesson of T2a in Y9-A1 → T1 dominates 3/4 = 0.75
    let tl = placeBlock(subject.timeline, { kind: "sub-topic", subTopicCode: "T1a" }, "Y9-A1", 3);
    tl = placeBlock(tl, { kind: "sub-topic", subTopicCode: "T2a" }, "Y9-A1", 1);
    const subjectAfter: Subject = { ...subject, timeline: tl };
    const score = getInterleavingScore(subjectAfter, subjectAfter.timeline.halfTerms[0]!);
    expect(score.distinctTopicCount).toBe(2);
    expect(score.distinctSubTopicCount).toBe(2);
    expect(score.totalLessons).toBe(4);
    expect(score.dominantTopicCode).toBe("T1");
    expect(score.dominantTopicShare).toBeCloseTo(0.75, 5);
  });

  it("excludes EoHT and custom-block placements from the score", () => {
    const subject = makeSubject();
    const withEoHT: Subject = { ...subject, timeline: createEoHTBlocks(subject.timeline) };
    const ht = withEoHT.timeline.halfTerms[0]!;
    const score = getInterleavingScore(withEoHT, ht);
    expect(score.totalLessons).toBe(0); // EoHT lessons are not counted
    expect(score.distinctTopicCount).toBe(0);
  });
});

describe("getInterleavingScoresAll", () => {
  it("returns one score per half-term in timeline order", () => {
    const subject = makeSubject();
    const scores = getInterleavingScoresAll(subject);
    expect(scores.length).toBe(17);
    expect(scores[0]?.halfTermId).toBe("Y9-A1");
    expect(scores[16]?.halfTermId).toBe("Y11-U1");
  });
});

describe("getSpacingFlags", () => {
  it("flags unplaced, single-touch, well-spaced, and blocked cells correctly", () => {
    const subject = makeSubject();
    // T1a: blocked into Y9-A1 with 5 lessons → that cell is "blocked"
    let tl = placeBlock(subject.timeline, { kind: "sub-topic", subTopicCode: "T1a" }, "Y9-A1", 5);
    // T1b: placed three times across the year — well spaced
    tl = placeBlock(tl, { kind: "sub-topic", subTopicCode: "T1b" }, "Y9-A2", 1);
    tl = placeBlock(tl, { kind: "sub-topic", subTopicCode: "T1b" }, "Y10-A2", 1);
    tl = placeBlock(tl, { kind: "sub-topic", subTopicCode: "T1b" }, "Y11-A1", 1);
    // T2a: never placed → unplaced
    const subjectAfter: Subject = { ...subject, timeline: tl };

    const flags = getSpacingFlags(subjectAfter);
    expect(flags.singleTouch).toEqual(["T1a"]);
    expect(flags.unplaced).toEqual(["T2a"]);
    expect(flags.wellSpaced).toEqual(["T1b"]);
    expect(flags.blockedCells.length).toBe(1);
    expect(flags.blockedCells[0]?.halfTermId).toBe("Y9-A1");
    expect(flags.blockedCells[0]?.dominantTopicCode).toBe("T1");
    expect(flags.blockedCells[0]?.lessons).toBe(5);
  });

  it("respects subject.config.spacingThresholds overrides", () => {
    const subject = makeSubject();
    // Place 3 lessons of T1a in Y9-A1 — under the default threshold (4) so NOT blocked
    const tl = placeBlock(subject.timeline, { kind: "sub-topic", subTopicCode: "T1a" }, "Y9-A1", 3);
    const placed: Subject = { ...subject, timeline: tl };

    // With defaults: not blocked (only 3 lessons, threshold is 4)
    expect(getSpacingFlags(placed).blockedCells.length).toBe(0);

    // Lower the threshold to 2 — now 3 lessons IS blocked
    const subjectWithLowerThreshold: Subject = {
      ...placed,
      config: {
        ...placed.config,
        spacingThresholds: { blockedCellMinLessons: 2 },
      },
    };
    expect(getSpacingFlags(subjectWithLowerThreshold).blockedCells.length).toBe(1);
  });

  it("respects wellSpacedMinPlacements override", () => {
    const subject = makeSubject();
    // T1a placed twice — under default threshold (3) so NOT well-spaced
    let tl = placeBlock(subject.timeline, { kind: "sub-topic", subTopicCode: "T1a" }, "Y9-A1", 1);
    tl = placeBlock(tl, { kind: "sub-topic", subTopicCode: "T1a" }, "Y10-S1", 1);
    const placed: Subject = { ...subject, timeline: tl };

    expect(getSpacingFlags(placed).wellSpaced).toEqual([]);

    // Lower the threshold to 2 — now T1a IS well-spaced (mean gap = 8 > 4)
    const subjectWithLowerThreshold: Subject = {
      ...placed,
      config: {
        ...placed.config,
        spacingThresholds: { wellSpacedMinPlacements: 2 },
      },
    };
    expect(getSpacingFlags(subjectWithLowerThreshold).wellSpaced).toEqual(["T1a"]);
  });
});

describe("resolveSpacingThresholds", () => {
  it("returns DEFAULT_SPACING_THRESHOLDS when no overrides are set", () => {
    const subject = makeSubject();
    expect(resolveSpacingThresholds(subject)).toEqual(DEFAULT_SPACING_THRESHOLDS);
  });

  it("layers subject.config.spacingThresholds over defaults, field-by-field", () => {
    const subject: Subject = {
      ...makeSubject(),
      config: {
        includeDepth: false,
        lostLessonBuffer: false,
        autoSpillover: true,
        spacingThresholds: {
          blockedCellMinLessons: 6,
          wellSpacedMinMeanGap: 2,
        },
      },
    };
    const resolved = resolveSpacingThresholds(subject);
    expect(resolved).toEqual({
      blockedCellMinLessons: 6, // from config
      blockedCellDominantShare: DEFAULT_SPACING_THRESHOLDS.blockedCellDominantShare,
      wellSpacedMinPlacements: DEFAULT_SPACING_THRESHOLDS.wellSpacedMinPlacements,
      wellSpacedMinMeanGap: 2, // from config
    });
  });
});

describe("hidden years filtering in spacing analytics", () => {
  it("excludes hidden-year placements from getPlacementHistory", () => {
    const subject = makeSubject();
    let tl = placeBlock(subject.timeline, { kind: "sub-topic", subTopicCode: "T1a" }, "Y9-A1", 1);
    tl = placeBlock(tl, { kind: "sub-topic", subTopicCode: "T1a" }, "Y10-A2", 1);
    const placed: Subject = { ...subject, timeline: tl };

    expect(getPlacementHistory(placed, "T1a")).toHaveLength(2);

    const withHidden: Subject = {
      ...placed,
      config: { ...placed.config, hiddenYears: ["Y9"] },
    };
    const history = getPlacementHistory(withHidden, "T1a");
    expect(history.map((p) => p.halfTerm.id)).toEqual(["Y10-A2"]);
  });

  it("hidden-only placements appear as 'unplaced' in spacing flags", () => {
    const subject = makeSubject();
    const tl = placeBlock(subject.timeline, { kind: "sub-topic", subTopicCode: "T1a" }, "Y9-A1", 3);
    const withHidden: Subject = {
      ...subject,
      timeline: tl,
      config: { ...subject.config, hiddenYears: ["Y9"] },
    };
    // From the visible-scope perspective, T1a is unplaced
    expect(getSpacingFlags(withHidden).unplaced).toContain("T1a");
  });
});

describe("getSpacingFlagsByKeyStage", () => {
  it("buckets single-touch by KS — a KS3+KS4 placed sub-topic is single-touch in both", () => {
    const subject = makeSubject();
    // T1a placed once in Y9 (KS3 default) and once in Y10 (KS4)
    let tl = placeBlock(subject.timeline, { kind: "sub-topic", subTopicCode: "T1a" }, "Y9-A1", 1);
    tl = placeBlock(tl, { kind: "sub-topic", subTopicCode: "T1a" }, "Y10-A1", 1);
    const placed: Subject = { ...subject, timeline: tl };

    const byKs = getSpacingFlagsByKeyStage(placed);
    expect(byKs.get("KS3")?.singleTouch).toContain("T1a");
    expect(byKs.get("KS4")?.singleTouch).toContain("T1a");
  });

  it("returns a single KS entry for a single-KS subject", () => {
    const subject = makeSubject();
    // Default Y9-Y11 timeline with subject keyStage unset → Y9 defaults to KS3,
    // Y10/Y11 are KS4. So actually this subject spans KS3 (Y9) + KS4 (Y10/Y11).
    // To get a single-KS, tag the subject as KS4:
    const ks4Subject: Subject = {
      ...subject,
      meta: { ...subject.meta, keyStage: "KS4" },
    };
    const byKs = getSpacingFlagsByKeyStage(ks4Subject);
    expect([...byKs.keys()]).toEqual(["KS4"]);
  });
});

// ============================================================
// Topic-level analytics (DEC-042)
// ============================================================

describe("getTopicPlacementHistory", () => {
  it("aggregates placements across every sub-topic of the topic", () => {
    const subject = makeSubject();
    // T1 has T1a + T1b. Place T1a in Y9-A1 and T1b in Y10-A2 — two distinct
    // sub-topics, two distinct touches of topic T1.
    let tl = placeBlock(subject.timeline, { kind: "sub-topic", subTopicCode: "T1a" }, "Y9-A1", 2);
    tl = placeBlock(tl, { kind: "sub-topic", subTopicCode: "T1b" }, "Y10-A2", 1);
    const placed: Subject = { ...subject, timeline: tl };

    const history = getTopicPlacementHistory(placed, "T1");
    expect(history.length).toBe(2);
    expect(history[0]?.subTopicCode).toBe("T1a");
    expect(history[1]?.subTopicCode).toBe("T1b");
    expect(history[0]?.halfTerm.id).toBe("Y9-A1");
    expect(history[1]?.halfTerm.id).toBe("Y10-A2");
  });

  it("returns empty for a topic with no placements", () => {
    const subject = makeSubject();
    expect(getTopicPlacementHistory(subject, "T2")).toEqual([]);
  });

  it("ignores placements in hidden years", () => {
    const subject = makeSubject();
    const tl = placeBlock(subject.timeline, { kind: "sub-topic", subTopicCode: "T1a" }, "Y9-A1", 2);
    const hidden: Subject = {
      ...subject,
      timeline: tl,
      config: { ...subject.config, hiddenYears: ["Y9"] },
    };
    expect(getTopicPlacementHistory(hidden, "T1")).toEqual([]);
  });
});

describe("getTopicSpacingProfile", () => {
  it("counts DISTINCT half-terms as touches, not raw placement count", () => {
    // Two sub-topics of T1 placed in the same half-term = one topic touch.
    const subject = makeSubject();
    let tl = placeBlock(subject.timeline, { kind: "sub-topic", subTopicCode: "T1a" }, "Y9-A1", 2);
    tl = placeBlock(tl, { kind: "sub-topic", subTopicCode: "T1b" }, "Y9-A1", 1);
    const placed: Subject = { ...subject, timeline: tl };

    const profile = getTopicSpacingProfile(placed, "T1");
    expect(profile.placements.length).toBe(2); // two sub-topic placements
    expect(profile.distinctHalfTermsCount).toBe(1); // one topic touch
    expect(profile.isSingleTouch).toBe(true);
    expect(profile.distinctSubTopicsPlaced).toBe(2);
    expect(profile.totalSubTopicsInSpec).toBe(2);
  });

  it("computes gaps between distinct half-terms (not between every placement pair)", () => {
    const subject = makeSubject();
    let tl = placeBlock(subject.timeline, { kind: "sub-topic", subTopicCode: "T1a" }, "Y9-A1", 1);
    tl = placeBlock(tl, { kind: "sub-topic", subTopicCode: "T1a" }, "Y9-A1", 1); // same HT
    tl = placeBlock(tl, { kind: "sub-topic", subTopicCode: "T1b" }, "Y10-A1", 1); // gap = 6 from Y9-A1
    const placed: Subject = { ...subject, timeline: tl };

    const profile = getTopicSpacingProfile(placed, "T1");
    expect(profile.distinctHalfTermsCount).toBe(2);
    expect(profile.gapsInHalfTerms).toEqual([6]);
    expect(profile.meanGap).toBe(6);
    expect(profile.isSingleTouch).toBe(false);
  });

  it("reports unplaced when nothing was placed", () => {
    const subject = makeSubject();
    const profile = getTopicSpacingProfile(subject, "T2");
    expect(profile.isUnplaced).toBe(true);
    expect(profile.isSingleTouch).toBe(false);
    expect(profile.distinctHalfTermsCount).toBe(0);
    expect(profile.lastPlacementHalfTermIdx).toBe(null);
  });
});

describe("getTopicSpacingProfilesAll", () => {
  it("returns one profile per topic in spec order", () => {
    const subject = makeSubject();
    const profiles = getTopicSpacingProfilesAll(subject);
    expect(profiles.map((p) => p.topicCode)).toEqual(["T1", "T2"]);
  });
});

describe("getTopicSpacingFlags", () => {
  it("flags a topic as single-touch when all sub-topics are in one half-term", () => {
    const subject = makeSubject();
    let tl = placeBlock(subject.timeline, { kind: "sub-topic", subTopicCode: "T1a" }, "Y9-A1", 2);
    tl = placeBlock(tl, { kind: "sub-topic", subTopicCode: "T1b" }, "Y9-A1", 1);
    const placed: Subject = { ...subject, timeline: tl };

    const flags = getTopicSpacingFlags(placed);
    expect(flags.singleTouch).toContain("T1");
    expect(flags.unplaced).toContain("T2");
  });

  it("flags a topic as well-spaced when distinct halfterms ≥ threshold and mean gap ≥ threshold", () => {
    // 3+ distinct half-terms with mean gap >= 4 (default thresholds).
    // Default Y9-Y11 timeline: Y9-A1 (idx 0), Y10-A1 (idx 6), Y11-A1 (idx 12).
    // Gaps = [6, 6] → mean 6 ≥ 4. distinctHts = 3 ≥ wellSpacedMinPlacements.
    const subject = makeSubject();
    let tl = placeBlock(subject.timeline, { kind: "sub-topic", subTopicCode: "T1a" }, "Y9-A1", 1);
    tl = placeBlock(tl, { kind: "sub-topic", subTopicCode: "T1b" }, "Y10-A1", 1);
    // We need a third distinct half-term for T1 — but the fixture only has 2 sub-topics.
    // Place T1a again in Y11-A1 (same sub-topic, different half-term).
    tl = placeBlock(tl, { kind: "sub-topic", subTopicCode: "T1a" }, "Y11-A1", 1);
    const placed: Subject = { ...subject, timeline: tl };

    const flags = getTopicSpacingFlags(placed);
    expect(flags.wellSpaced).toContain("T1");
  });

  it("flags a topic as 'clustered' when every gap is 0 or 1", () => {
    // Two sub-topics in adjacent half-terms — clustered, not well-spaced.
    const subject = makeSubject();
    let tl = placeBlock(subject.timeline, { kind: "sub-topic", subTopicCode: "T1a" }, "Y9-A1", 1);
    tl = placeBlock(tl, { kind: "sub-topic", subTopicCode: "T1b" }, "Y9-A2", 1);
    const placed: Subject = { ...subject, timeline: tl };

    const flags = getTopicSpacingFlags(placed);
    expect(flags.clustered).toContain("T1");
    expect(flags.singleTouch).not.toContain("T1");
    expect(flags.wellSpaced).not.toContain("T1");
  });
});

describe("getTopicSpacingFlagsByKeyStage", () => {
  it("buckets per-KS and reports the topic separately in each KS", () => {
    const subject = makeSubject();
    let tl = placeBlock(subject.timeline, { kind: "sub-topic", subTopicCode: "T1a" }, "Y9-A1", 1);
    tl = placeBlock(tl, { kind: "sub-topic", subTopicCode: "T1a" }, "Y10-A1", 1);
    const placed: Subject = { ...subject, timeline: tl };

    const byKs = getTopicSpacingFlagsByKeyStage(placed);
    // Default subject (no keyStage tag) → Y9 is KS3, Y10/Y11 are KS4.
    // T1 is single-touch in each KS (one half-term per KS).
    expect(byKs.get("KS3")?.singleTouch).toContain("T1");
    expect(byKs.get("KS4")?.singleTouch).toContain("T1");
  });
});
