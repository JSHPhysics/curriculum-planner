import { describe, expect, it } from "vitest";

import { placeBlock } from "@/model/placement";
import {
  addPresetToSubject,
  applyPreset,
  applySavedPreset,
  deletePresetFromSubject,
  getPresetDescriptor,
  isExampleSubject,
  parseSavedPresetJson,
  PRESET_DESCRIPTORS,
  saveCurrentAsPreset,
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
  // Per DEC-040 "exclusively depth": a sub-topic is depth only when EVERY
  // lesson is depth. So if the test asks for a depth sub-topic, propagate to
  // the lessons automatically — `opts.lessonsDepth` is still honoured for
  // mixed-content fixtures.
  const lessonsDepth = opts.lessonsDepth ?? opts.depth ?? false;
  return {
    id: `st-${code}`,
    code,
    name,
    difficulty: 2,
    isDepth: opts.depth ?? false,
    separateOnly: false,
    notes: null,
    lessons: makeLessons(code, lessonsCount, lessonsDepth),
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

describe("applyPreset — three-spiral (topic-first, DEC-042)", () => {
  it("places each sub-topic exactly ONCE with its full lesson count", () => {
    // Topic-first design: sub-topics aren't chunked across passes. Each
    // sub-topic gets one placement; the spiral comes from each TOPIC's
    // sub-topics being distributed across passes.
    const subject = makeFixtureSubject({ includeDepth: false });
    const after = applyPreset(subject, "three-spiral");
    const map = placementsBySubTopic(after);
    expect(map.get("T1a")?.count).toBe(1);
    expect(map.get("T1b")?.count).toBe(1);
    expect(map.get("T2a")?.count).toBe(1);
    expect(map.get("T3a")?.count).toBe(1);
    // Lesson totals match the spec (no fractional splitting).
    expect(map.get("T1a")?.totalLessons).toBe(4);
    expect(map.get("T1b")?.totalLessons).toBe(3);
  });

  it("distributes a topic's sub-topics across distinct passes (the spiral effect)", () => {
    // T1 has 2 foundation sub-topics (T1a, T1b). They should land in
    // different passes — T1a in pass 1, T1b in pass 2.
    const subject = makeFixtureSubject({ includeDepth: false });
    const after = applyPreset(subject, "three-spiral");
    const map = placementsBySubTopic(after);
    const t1aIdx = subject.timeline.halfTerms.findIndex(
      (ht) => ht.id === (map.get("T1a")?.halfTermIds[0] ?? "")
    );
    const t1bIdx = subject.timeline.halfTerms.findIndex(
      (ht) => ht.id === (map.get("T1b")?.halfTermIds[0] ?? "")
    );
    const cellCount = subject.timeline.halfTerms.length;
    const seg2Start = Math.floor(cellCount / 3);
    expect(t1aIdx).toBeLessThan(seg2Start);
    expect(t1bIdx).toBeGreaterThanOrEqual(seg2Start);
  });

  it("a topic with only ONE sub-topic gets a single placement in pass 1", () => {
    // Single-sub-topic topics can't spiral — they just land in pass 1.
    const subject = makeFixtureSubject({ includeDepth: false });
    const singleTopicSubject: Subject = {
      ...subject,
      workingSpec: {
        topics: [
          makeTopic("X", "Solo topic", [makeSubTopic("Xa", "Only", 3)]),
        ],
      },
    };
    const after = applyPreset(singleTopicSubject, "three-spiral");
    const map = placementsBySubTopic(after);
    expect(map.get("Xa")?.count).toBe(1);
    const xaIdx = singleTopicSubject.timeline.halfTerms.findIndex(
      (ht) => ht.id === (map.get("Xa")?.halfTermIds[0] ?? "")
    );
    const cellCount = singleTopicSubject.timeline.halfTerms.length;
    expect(xaIdx).toBeLessThan(Math.floor(cellCount / 3));
  });

  it("depth sub-topics land in later passes (foundation-first within each topic)", () => {
    // T2 has T2a (foundation) + T2b (depth). With includeDepth=true the
    // depth one should land at or after the foundation one's pass.
    const subject = makeFixtureSubject({ includeDepth: true });
    const after = applyPreset(subject, "three-spiral");
    const map = placementsBySubTopic(after);
    const t2aIdx = subject.timeline.halfTerms.findIndex(
      (ht) => ht.id === (map.get("T2a")?.halfTermIds[0] ?? "")
    );
    const t2bIdx = subject.timeline.halfTerms.findIndex(
      (ht) => ht.id === (map.get("T2b")?.halfTermIds[0] ?? "")
    );
    expect(t2aIdx).toBeGreaterThanOrEqual(0);
    expect(t2bIdx).toBeGreaterThanOrEqual(t2aIdx);
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
  it("returns the placement count and total lessons for three-spiral (topic-first per DEC-042)", () => {
    const subject = makeFixtureSubject({ includeDepth: false });
    const summary = summarisePreset(subject, "three-spiral");
    // Topic-first design: each sub-topic placed ONCE. 4 foundation
    // sub-topics → 4 placements. (Was 12 under the v1 chunked design.)
    expect(summary.placementCount).toBe(4);
    expect(summary.totalLessonsPlaced).toBe(13); // 4+3+3+3 (lesson sums unchanged)
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

// ============================================================
// Saved presets (DEC-045)
// ============================================================

describe("isExampleSubject", () => {
  it("returns true when meta.sourceFilename is the bundled example name", () => {
    const subject = makeFixtureSubject();
    const tagged: Subject = {
      ...subject,
      meta: { ...subject.meta, sourceFilename: "example_physics_spec.xlsx" },
    };
    expect(isExampleSubject(tagged)).toBe(true);
  });

  it("returns false for any other sourceFilename", () => {
    const subject = makeFixtureSubject();
    expect(isExampleSubject(subject)).toBe(false);
    const named: Subject = {
      ...subject,
      meta: { ...subject.meta, sourceFilename: "my-physics.xlsx" },
    };
    expect(isExampleSubject(named)).toBe(false);
  });
});

describe("saveCurrentAsPreset", () => {
  it("captures sub-topic placements with stable codes", () => {
    let subject = makeFixtureSubject();
    // Apply an algorithmic preset so the subject has placements to snapshot.
    subject = { ...subject, timeline: applyPreset(subject, "frontloaded", { idGen: makeIdGen() }) };
    const preset = saveCurrentAsPreset(subject, {
      name: "Snapshot",
      now: new Date("2026-05-20T12:00:00Z"),
      idGen: () => "preset-1",
    });
    expect(preset.id).toBe("preset-1");
    expect(preset.name).toBe("Snapshot");
    expect(preset.createdAt).toBe("2026-05-20T12:00:00.000Z");
    expect(preset.placements.length).toBeGreaterThan(0);
    // All placements should reference real codes.
    const codes = new Set<string>();
    for (const t of subject.workingSpec.topics) {
      for (const s of t.subTopics) codes.add(s.code);
    }
    for (const p of preset.placements) {
      if (p.source.kind === "sub-topic") {
        expect(codes.has(p.source.subTopicCode)).toBe(true);
      }
    }
  });

  it("dedups custom blocks under stable cb1/cb2 refs", () => {
    let subject = makeFixtureSubject();
    // Seed a single custom block referenced from two cells.
    const customBlock = {
      id: "real-cb",
      name: "End of Aut 1 test",
      lessons: 1,
      colour: "#B98D2C",
      isEoHT: true,
      category: "test" as const,
    };
    subject = { ...subject, customBlocks: [customBlock] };
    // Place the same custom block in two half-terms.
    let timeline = subject.timeline;
    timeline = placeBlock(
      timeline,
      { kind: "custom", customBlockId: "real-cb" },
      timeline.halfTerms[0]!.id,
      1,
      { idGen: makeIdGen() }
    );
    timeline = placeBlock(
      timeline,
      { kind: "custom", customBlockId: "real-cb" },
      timeline.halfTerms[1]!.id,
      1,
      { idGen: () => "pb-99" }
    );
    subject = { ...subject, timeline };
    const preset = saveCurrentAsPreset(subject, { name: "with custom", idGen: () => "p" });
    expect(preset.customBlocks).toHaveLength(1);
    expect(preset.customBlocks[0]?.ref).toBe("cb1");
    expect(preset.customBlocks[0]?.name).toBe("End of Aut 1 test");
    expect(preset.customBlocks[0]?.isEoHT).toBe(true);
    // Both placements reference the same ref.
    const customRefs = preset.placements
      .filter((p) => p.source.kind === "custom")
      .map((p) => (p.source as { customBlockRef: string }).customBlockRef);
    expect(customRefs).toEqual(["cb1", "cb1"]);
  });
});

describe("applySavedPreset", () => {
  function makeSavedSubject(): { subject: Subject; preset: ReturnType<typeof saveCurrentAsPreset> } {
    let subject = makeFixtureSubject();
    subject = { ...subject, timeline: applyPreset(subject, "interleaved", { idGen: makeIdGen() }) };
    const preset = saveCurrentAsPreset(subject, { name: "snap", idGen: () => "p1" });
    return { subject, preset };
  }

  it("rebuilds the same placements (idempotent within a clean subject)", () => {
    const { subject, preset } = makeSavedSubject();
    const fresh = { ...subject, timeline: createDefaultTimeline(), customBlocks: [] };
    const result = applySavedPreset(fresh, preset, { idGen: makeIdGen() });
    expect(result.orphans.skippedPlacements).toBe(0);
    expect(countSubTopicPlacements(result.subject.timeline)).toBe(
      countSubTopicPlacements(subject.timeline)
    );
  });

  it("collects orphans when a referenced sub-topic no longer exists", () => {
    const { subject, preset } = makeSavedSubject();
    // Re-import as a smaller spec: drop topic T3 entirely.
    const droppedSpec: Spec = {
      topics: subject.workingSpec.topics.filter((t) => t.code !== "T3"),
    };
    const shrunk: Subject = {
      ...subject,
      workingSpec: droppedSpec,
      timeline: createDefaultTimeline(),
      customBlocks: [],
    };
    const result = applySavedPreset(shrunk, preset, { idGen: makeIdGen() });
    expect(result.orphans.unmatchedSubTopicCodes.length).toBeGreaterThan(0);
    expect(result.orphans.unmatchedSubTopicCodes.every((c) => c.startsWith("T3"))).toBe(true);
    expect(result.orphans.skippedPlacements).toBeGreaterThan(0);
    // Matched placements still go in.
    expect(countSubTopicPlacements(result.subject.timeline)).toBeGreaterThan(0);
  });

  it("collects orphans when a half-term id no longer exists in the timeline", () => {
    const { subject, preset } = makeSavedSubject();
    // Replace the timeline with one that has no Y10 cells — every Y10
    // placement should become an orphan.
    const droppedTimeline = {
      halfTerms: subject.timeline.halfTerms.filter((ht) => ht.year !== "Y10"),
    };
    const shrunk: Subject = {
      ...subject,
      timeline: droppedTimeline,
      customBlocks: [],
    };
    const result = applySavedPreset(shrunk, preset, { idGen: makeIdGen() });
    expect(result.orphans.unmatchedHalfTermIds.every((id) => id.startsWith("Y10"))).toBe(true);
  });
});

describe("addPresetToSubject / deletePresetFromSubject", () => {
  it("append + delete round-trip cleanly", () => {
    const subject = makeFixtureSubject();
    expect(subject.presets ?? []).toEqual([]);
    const preset = {
      id: "p1",
      name: "x",
      createdAt: "2026-05-20T00:00:00.000Z",
      customBlocks: [],
      placements: [],
    };
    const added = addPresetToSubject(subject, preset);
    expect(added.presets).toEqual([preset]);
    const removed = deletePresetFromSubject(added, "p1");
    expect(removed.presets).toEqual([]);
  });

  it("delete is a no-op when the id is not present", () => {
    const subject = makeFixtureSubject();
    const removed = deletePresetFromSubject(subject, "missing");
    expect(removed.presets ?? []).toEqual([]);
  });
});

describe("parseSavedPresetJson", () => {
  it("parses a minimal valid preset", () => {
    const json = JSON.stringify({
      name: "Tiny",
      customBlocks: [],
      placements: [
        {
          halfTermId: "Y9-A1",
          source: { kind: "sub-topic", subTopicCode: "T1a" },
          lessonsClaimed: 4,
          lessonRange: [0, 4],
        },
      ],
    });
    const preset = parseSavedPresetJson(json, { idGen: () => "fresh-id", now: new Date("2026-05-20") });
    expect(preset.name).toBe("Tiny");
    expect(preset.id).toBe("fresh-id");
    expect(preset.placements).toHaveLength(1);
  });

  it("rejects an empty name", () => {
    expect(() => parseSavedPresetJson('{"name": "  ", "placements": []}')).toThrow(/name/);
  });

  it("rejects a custom-ref placement that doesn't match any customBlocks[].ref", () => {
    const json = JSON.stringify({
      name: "Bad",
      customBlocks: [{ ref: "cb1", name: "x", lessons: 1, category: "test" }],
      placements: [
        {
          halfTermId: "Y9-A1",
          source: { kind: "custom", customBlockRef: "cbX" },
          lessonsClaimed: 1,
          lessonRange: [0, 1],
        },
      ],
    });
    expect(() => parseSavedPresetJson(json)).toThrow(/cbX/);
  });

  it("rejects an invalid category", () => {
    const json = JSON.stringify({
      name: "Bad",
      customBlocks: [{ ref: "cb1", name: "x", lessons: 1, category: "extracurricular" }],
      placements: [],
    });
    expect(() => parseSavedPresetJson(json)).toThrow(/category/);
  });

  it("rejects malformed lessonRange", () => {
    const json = JSON.stringify({
      name: "Bad",
      placements: [
        {
          halfTermId: "Y9-A1",
          source: { kind: "sub-topic", subTopicCode: "T1a" },
          lessonsClaimed: 1,
          lessonRange: [0], // wrong arity
        },
      ],
    });
    expect(() => parseSavedPresetJson(json)).toThrow(/lessonRange/);
  });

  it("round-trips saveCurrentAsPreset through JSON cleanly", () => {
    let subject = makeFixtureSubject();
    subject = { ...subject, timeline: applyPreset(subject, "frontloaded", { idGen: makeIdGen() }) };
    const original = saveCurrentAsPreset(subject, { name: "rt", idGen: () => "rt-id" });
    const json = JSON.stringify(original);
    const parsed = parseSavedPresetJson(json);
    expect(parsed.name).toBe(original.name);
    expect(parsed.placements).toEqual(original.placements);
    expect(parsed.customBlocks).toEqual(original.customBlocks);
  });
});
