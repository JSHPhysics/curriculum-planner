import { describe, expect, it } from "vitest";

import { placeBlock } from "@/model/placement";
import {
  getInterleavingScore,
  getInterleavingScoresAll,
  getPlacementHistory,
  getSpacingFlags,
  getSpacingProfile,
  getSpacingProfilesAll,
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
            lessons: makeLessons("T1a", 3, false),
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
});
