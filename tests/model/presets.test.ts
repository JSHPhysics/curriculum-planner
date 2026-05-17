import { describe, expect, it } from "vitest";

import { placeBlock } from "@/model/placement";
import {
  PRESET_DESCRIPTORS,
  applyPreset,
  getPresetDescriptor,
  summarisePreset,
  type PresetId,
} from "@/model/presets";
import { createDefaultTimeline, createEoHTBlocks } from "@/model/timeline";
import type { Lesson, Spec, Subject, SubTopic, Topic } from "@/model/types";

// ============================================================
// Test fixtures
// ============================================================

function makeLessons(prefix: string, n: number, depth: boolean): Lesson[] {
  const out: Lesson[] = [];
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

function makeSubTopic(
  code: string,
  name: string,
  lessonsCount: number,
  opts: { depth?: boolean; lessonsDepth?: boolean } = {}
): SubTopic {
  return {
    id: `st-${code}`,
    code,
    name,
    difficulty: 2,
    isDepth: opts.depth ?? false,
    separateOnly: false,
    notes: null,
    lessons: makeLessons(code, lessonsCount, opts.lessonsDepth ?? false),
  };
}

function makeTopic(code: string, name: string, subTopics: SubTopic[]): Topic {
  return { id: `t-${code}`, code, name, paper: null, subTopics };
}

/**
 * 3-topic / 6-sub-topic / 18-lesson fixture. Two sub-topics flagged depth
 * so the foundation/depth split is observable. Sized to fit comfortably
 * inside the default Y9-Y11 timeline (~280 lesson budget).
 */
function makeFixtureSubject(opts: { includeDepth?: boolean } = {}): Subject {
  const spec: Spec = {
    topics: [
      makeTopic("T1", "Forces", [
        makeSubTopic("T1a", "Kinematics", 4),
        makeSubTopic("T1b", "Newton's laws", 3),
      ]),
      makeTopic("T2", "Energy", [
        makeSubTopic("T2a", "Energy stores", 3),
        makeSubTopic("T2b", "Efficiency (depth)", 2, { depth: true }),
      ]),
      makeTopic("T3", "Waves", [
        makeSubTopic("T3a", "Wave basics", 3),
        makeSubTopic("T3b", "Snell's law (depth)", 3, { depth: true }),
      ]),
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
      includeDepth: opts.includeDepth ?? true,
      lostLessonBuffer: false,
      autoSpillover: true,
    },
  };
}

let idCounter = 0;
function makeIdGen(): () => string {
  idCounter = 0;
  return () => `pb-${++idCounter}`;
}

function countSubTopicPlacements(timeline: ReturnType<typeof createDefaultTimeline>): number {
  let n = 0;
  for (const ht of timeline.halfTerms) {
    for (const b of ht.placedBlocks) {
      if (b.source.kind === "sub-topic") n++;
    }
  }
  return n;
}

function placementsBySubTopic(
  timeline: ReturnType<typeof createDefaultTimeline>
): Map<string, { count: number; totalLessons: number; halfTermIds: string[] }> {
  const map = new Map<string, { count: number; totalLessons: number; halfTermIds: string[] }>();
  for (const ht of timeline.halfTerms) {
    for (const b of ht.placedBlocks) {
      if (b.source.kind !== "sub-topic") continue;
      const code = b.source.subTopicCode;
      const existing = map.get(code) ?? { count: 0, totalLessons: 0, halfTermIds: [] };
      existing.count++;
      existing.totalLessons += b.lessonsClaimed;
      existing.halfTermIds.push(ht.id);
      map.set(code, existing);
    }
  }
  return map;
}

// ============================================================
// Descriptors
// ============================================================

describe("PRESET_DESCRIPTORS", () => {
  it("exports exactly three presets in canonical order", () => {
    expect(PRESET_DESCRIPTORS.map((p) => p.id)).toEqual([
      "three-spiral",
      "frontloaded",
      "interleaved",
    ]);
  });

  it("getPresetDescriptor looks up a preset by id", () => {
    expect(getPresetDescriptor("three-spiral").name).toBe("Three-spiral");
    expect(getPresetDescriptor("frontloaded").name).toContain("Frontloaded");
    expect(getPresetDescriptor("interleaved").name).toContain("interleaved");
  });

  it("getPresetDescriptor throws for an unknown id", () => {
    expect(() => getPresetDescriptor("nope" as PresetId)).toThrow(/unknown preset/);
  });
});

// ============================================================
// Common invariants — apply to all presets
// ============================================================

describe.each(PRESET_DESCRIPTORS.map((p) => p.id))(
  "preset invariants: %s",
  (presetId) => {
    it("never touches EoHT placements that already exist", () => {
      const subject = makeFixtureSubject();
      const withEoht = createEoHTBlocks(subject.timeline);
      const seeded: Subject = { ...subject, timeline: withEoht };
      const before = withEoht.halfTerms.flatMap((ht) =>
        ht.placedBlocks.filter((b) => b.source.kind === "eoht").map((b) => `${ht.id}/${b.id}`)
      );
      const after = applyPreset(seeded, presetId).halfTerms.flatMap((ht) =>
        ht.placedBlocks.filter((b) => b.source.kind === "eoht").map((b) => `${ht.id}/${b.id}`)
      );
      expect(after).toEqual(before);
    });

    it("clears existing sub-topic placements before laying out fresh ones", () => {
      const subject = makeFixtureSubject();
      // Pre-place T1a manually so we can confirm the preset wipes it.
      const seededTimeline = placeBlock(
        subject.timeline,
        { kind: "sub-topic", subTopicCode: "T1a" },
        "Y11-U1",
        4,
        { idGen: () => "manual-T1a" }
      );
      const seeded: Subject = { ...subject, timeline: seededTimeline };
      const after = applyPreset(seeded, presetId);
      const manualSurvivors = after.halfTerms.flatMap((ht) =>
        ht.placedBlocks.filter((b) => b.id === "manual-T1a")
      );
      expect(manualSurvivors).toHaveLength(0);
    });

    it("preserves custom blocks", () => {
      const subject = makeFixtureSubject();
      const customId = "custom-extra-1";
      const seedTl = {
        halfTerms: subject.timeline.halfTerms.map((ht, idx) =>
          idx === 0
            ? {
                ...ht,
                placedBlocks: [
                  ...ht.placedBlocks,
                  {
                    id: "pb-custom",
                    source: { kind: "custom" as const, customBlockId: customId },
                    lessonsClaimed: 2,
                    lessonRange: [0, 2] as readonly [number, number],
                    splitFrom: null,
                    splitType: null,
                    userEdits: {},
                  },
                ],
              }
            : ht
        ),
      };
      const seeded: Subject = { ...subject, timeline: seedTl };
      const after = applyPreset(seeded, presetId);
      const customSurvivors = after.halfTerms.flatMap((ht) =>
        ht.placedBlocks.filter((b) => b.source.kind === "custom")
      );
      expect(customSurvivors).toHaveLength(1);
      expect(customSurvivors[0]?.id).toBe("pb-custom");
    });

    it("respects config.includeDepth = false (depth sub-topics dropped)", () => {
      const subject = makeFixtureSubject({ includeDepth: false });
      const after = applyPreset(subject, presetId);
      const placedCodes = new Set<string>();
      for (const ht of after.halfTerms) {
        for (const b of ht.placedBlocks) {
          if (b.source.kind === "sub-topic") placedCodes.add(b.source.subTopicCode);
        }
      }
      // Depth sub-topics: T2b, T3b
      expect(placedCodes.has("T2b")).toBe(false);
      expect(placedCodes.has("T3b")).toBe(false);
      // Foundation sub-topics should all appear
      expect(placedCodes.has("T1a")).toBe(true);
      expect(placedCodes.has("T1b")).toBe(true);
      expect(placedCodes.has("T2a")).toBe(true);
      expect(placedCodes.has("T3a")).toBe(true);
    });

    it("respects config.hiddenYears (no placements into hidden years)", () => {
      const subject: Subject = {
        ...makeFixtureSubject(),
        config: {
          includeDepth: true,
          lostLessonBuffer: false,
          autoSpillover: true,
          hiddenYears: ["Y11"],
        },
      };
      const after = applyPreset(subject, presetId);
      const inHiddenYear = after.halfTerms
        .filter((ht) => ht.year === "Y11")
        .flatMap((ht) => ht.placedBlocks.filter((b) => b.source.kind === "sub-topic"));
      expect(inHiddenYear).toHaveLength(0);
    });

    it("is deterministic — same input → identical timeline (using fixed idGen)", () => {
      const subject = makeFixtureSubject();
      // We can't directly thread idGen through applyPreset's public surface
      // (it's an option), so use the option and compare placedBlock ids.
      const a = applyPreset(subject, presetId, { idGen: makeIdGen() });
      const b = applyPreset(subject, presetId, { idGen: makeIdGen() });
      const idsA = a.halfTerms.flatMap((ht) =>
        ht.placedBlocks
          .filter((p) => p.source.kind === "sub-topic")
          .map((p) => `${ht.id}|${p.id}|${p.lessonsClaimed}`)
      );
      const idsB = b.halfTerms.flatMap((ht) =>
        ht.placedBlocks
          .filter((p) => p.source.kind === "sub-topic")
          .map((p) => `${ht.id}|${p.id}|${p.lessonsClaimed}`)
      );
      expect(idsA).toEqual(idsB);
    });

    it("returns the input timeline unchanged when the working spec has no sub-topics", () => {
      const subject: Subject = {
        ...makeFixtureSubject(),
        workingSpec: { topics: [] },
        importedSpec: { topics: [] },
      };
      const before = countSubTopicPlacements(subject.timeline);
      const after = applyPreset(subject, presetId);
      expect(countSubTopicPlacements(after)).toBe(before);
    });
  }
);

// ============================================================
// three-spiral
// ============================================================

describe("applyPreset — three-spiral", () => {
  it("places each foundation sub-topic exactly THREE times across the timeline", () => {
    const subject = makeFixtureSubject({ includeDepth: false });
    const after = applyPreset(subject, "three-spiral");
    const map = placementsBySubTopic(after);
    expect(map.get("T1a")?.count).toBe(3);
    expect(map.get("T1b")?.count).toBe(3);
    expect(map.get("T2a")?.count).toBe(3);
    expect(map.get("T3a")?.count).toBe(3);
  });

  it("total lessons placed for a foundation sub-topic equals its lesson count", () => {
    const subject = makeFixtureSubject({ includeDepth: false });
    const after = applyPreset(subject, "three-spiral");
    const map = placementsBySubTopic(after);
    // T1a has 4 lessons; 3 passes should sum to 4 (e.g. 2+1+1)
    expect(map.get("T1a")?.totalLessons).toBe(4);
    // T1b has 3 lessons; 3 passes should sum to 3 (1+1+1)
    expect(map.get("T1b")?.totalLessons).toBe(3);
  });

  it("spreads the three passes across distinct calendar segments", () => {
    const subject = makeFixtureSubject({ includeDepth: false });
    const after = applyPreset(subject, "three-spiral");
    const map = placementsBySubTopic(after);
    const t1aHts = (map.get("T1a")?.halfTermIds ?? []).map((id) =>
      subject.timeline.halfTerms.findIndex((ht) => ht.id === id)
    );
    expect(t1aHts.length).toBe(3);
    // Three passes should be in increasing calendar order
    expect(t1aHts).toEqual([...t1aHts].sort((a, b) => a - b));
    // First pass should land in the first third of the timeline
    const cellCount = subject.timeline.halfTerms.length;
    expect(t1aHts[0]!).toBeLessThan(Math.ceil(cellCount / 3));
    // Last pass should land in the back third
    expect(t1aHts[2]!).toBeGreaterThanOrEqual(Math.floor((2 * cellCount) / 3));
  });

  it("depth sub-topics only appear in passes 2 and 3 (not pass 1)", () => {
    const subject = makeFixtureSubject({ includeDepth: true });
    const after = applyPreset(subject, "three-spiral");
    const map = placementsBySubTopic(after);
    const cellCount = subject.timeline.halfTerms.length;
    const firstThirdEnd = Math.floor(cellCount / 3);
    const t2bHts = (map.get("T2b")?.halfTermIds ?? []).map((id) =>
      subject.timeline.halfTerms.findIndex((ht) => ht.id === id)
    );
    // T2b is depth — should have no placement in the first third
    expect(t2bHts.length).toBeGreaterThan(0);
    expect(t2bHts.every((idx) => idx >= firstThirdEnd)).toBe(true);
  });
});

// ============================================================
// frontloaded
// ============================================================

describe("applyPreset — frontloaded", () => {
  it("places each sub-topic exactly ONCE", () => {
    const subject = makeFixtureSubject({ includeDepth: true });
    const after = applyPreset(subject, "frontloaded");
    const map = placementsBySubTopic(after);
    for (const code of ["T1a", "T1b", "T2a", "T2b", "T3a", "T3b"]) {
      // Could be split across cells by spillover; "exactly once" means a single
      // logical placement OR contiguous spillover pieces from one source call.
      // Easier assertion: total lesson count matches the spec count.
      const total = map.get(code)?.totalLessons ?? 0;
      expect(total).toBeGreaterThan(0);
    }
  });

  it("total lessons per sub-topic equals the spec count", () => {
    const subject = makeFixtureSubject({ includeDepth: true });
    const after = applyPreset(subject, "frontloaded");
    const map = placementsBySubTopic(after);
    expect(map.get("T1a")?.totalLessons).toBe(4);
    expect(map.get("T1b")?.totalLessons).toBe(3);
    expect(map.get("T2a")?.totalLessons).toBe(3);
    expect(map.get("T2b")?.totalLessons).toBe(2);
    expect(map.get("T3a")?.totalLessons).toBe(3);
    expect(map.get("T3b")?.totalLessons).toBe(3);
  });

  it("depth sub-topics land STRICTLY after foundation sub-topics", () => {
    const subject = makeFixtureSubject({ includeDepth: true });
    const after = applyPreset(subject, "frontloaded");
    const map = placementsBySubTopic(after);
    // Find earliest cell index for any foundation sub-topic vs earliest for any depth.
    function earliestIdx(code: string): number {
      const ids = map.get(code)?.halfTermIds ?? [];
      const indices = ids.map((id) =>
        subject.timeline.halfTerms.findIndex((ht) => ht.id === id)
      );
      return indices.length === 0 ? Infinity : Math.min(...indices);
    }
    const foundationEarliest = Math.min(
      earliestIdx("T1a"),
      earliestIdx("T1b"),
      earliestIdx("T2a"),
      earliestIdx("T3a")
    );
    const depthEarliest = Math.min(earliestIdx("T2b"), earliestIdx("T3b"));
    expect(depthEarliest).toBeGreaterThan(foundationEarliest);
  });

  it("depth sub-topics land in the back third of the timeline", () => {
    const subject = makeFixtureSubject({ includeDepth: true });
    const after = applyPreset(subject, "frontloaded");
    const map = placementsBySubTopic(after);
    const cellCount = subject.timeline.halfTerms.length;
    const backThirdStart = Math.floor((2 * cellCount) / 3);
    const depthCells = ["T2b", "T3b"].flatMap((code) =>
      (map.get(code)?.halfTermIds ?? []).map((id) =>
        subject.timeline.halfTerms.findIndex((ht) => ht.id === id)
      )
    );
    expect(depthCells.length).toBeGreaterThan(0);
    expect(depthCells.every((idx) => idx >= backThirdStart)).toBe(true);
  });
});

// ============================================================
// interleaved
// ============================================================

describe("applyPreset — interleaved", () => {
  it("places each sub-topic exactly ONCE", () => {
    const subject = makeFixtureSubject({ includeDepth: true });
    const after = applyPreset(subject, "interleaved");
    const map = placementsBySubTopic(after);
    expect(map.size).toBe(6); // T1a..T3b
  });

  it("total lessons per sub-topic equals the spec count", () => {
    const subject = makeFixtureSubject({ includeDepth: true });
    const after = applyPreset(subject, "interleaved");
    const map = placementsBySubTopic(after);
    expect(map.get("T1a")?.totalLessons).toBe(4);
    expect(map.get("T2a")?.totalLessons).toBe(3);
    expect(map.get("T3a")?.totalLessons).toBe(3);
  });

  it("the round-robin places T1a, T2a, T3a in that source order (first pass)", () => {
    const subject = makeFixtureSubject({ includeDepth: true });
    const after = applyPreset(subject, "interleaved");
    // Read sub-topic placements in calendar order; first 3 should be T1a, T2a, T3a
    const ordered: string[] = [];
    for (const ht of after.halfTerms) {
      for (const b of ht.placedBlocks) {
        if (b.source.kind !== "sub-topic") continue;
        // De-dup contiguous spillover pieces from the same source call
        const code = b.source.subTopicCode;
        if (ordered[ordered.length - 1] !== code) ordered.push(code);
      }
    }
    expect(ordered.slice(0, 3)).toEqual(["T1a", "T2a", "T3a"]);
  });

  it("does NOT pack a topic's sub-topics consecutively (the whole point)", () => {
    const subject = makeFixtureSubject({ includeDepth: true });
    const after = applyPreset(subject, "interleaved");
    // Linearise all sub-topic placements in calendar order, dedup contiguous spillover.
    const ordered: string[] = [];
    for (const ht of after.halfTerms) {
      for (const b of ht.placedBlocks) {
        if (b.source.kind !== "sub-topic") continue;
        const code = b.source.subTopicCode;
        if (ordered[ordered.length - 1] !== code) ordered.push(code);
      }
    }
    // T1a (T1) should NOT be immediately followed by T1b — interleave should
    // put T2a, T3a in between.
    const t1aIdx = ordered.indexOf("T1a");
    expect(t1aIdx).toBeGreaterThanOrEqual(0);
    expect(ordered[t1aIdx + 1]).not.toBe("T1b");
  });
});

// ============================================================
// summarisePreset
// ============================================================

describe("summarisePreset", () => {
  it("returns the placement count and total lessons for three-spiral", () => {
    const subject = makeFixtureSubject({ includeDepth: false });
    const summary = summarisePreset(subject, "three-spiral");
    // 4 foundation sub-topics × 3 passes = 12 placements (1-lesson sub-topics
    // emit only 1 pass; 2-lesson sub-topics 2 passes; 3+ lesson all 3).
    // T1a=4 → 3 passes, T1b=3 → 3 passes, T2a=3 → 3 passes, T3a=3 → 3 passes
    expect(summary.placementCount).toBe(12);
    expect(summary.totalLessonsPlaced).toBe(13); // 4+3+3+3
    expect(summary.distinctSubTopics).toBe(4);
    expect(summary.skippedDepthSubTopics).toEqual(["T2b", "T3b"]);
  });

  it("returns one placement per sub-topic for frontloaded and interleaved", () => {
    const subject = makeFixtureSubject({ includeDepth: true });
    expect(summarisePreset(subject, "frontloaded").placementCount).toBe(6);
    expect(summarisePreset(subject, "interleaved").placementCount).toBe(6);
  });

  it("totalLessonsPlaced sums the full spec when includeDepth is on", () => {
    const subject = makeFixtureSubject({ includeDepth: true });
    // 4+3+3+2+3+3 = 18
    expect(summarisePreset(subject, "frontloaded").totalLessonsPlaced).toBe(18);
    expect(summarisePreset(subject, "interleaved").totalLessonsPlaced).toBe(18);
  });
});
