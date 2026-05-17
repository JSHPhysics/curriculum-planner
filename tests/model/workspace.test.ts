import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { importSpec } from "@/model/import";
import { placeBlock, placeBlockWithSpillover } from "@/model/placement";
import { createDefaultTimeline } from "@/model/timeline";
import type { Subject } from "@/model/types";
import {
  APP_VERSION,
  DeserializationError,
  FILE_VERSION,
  LegacyEoHTFileError,
  addSubject,
  applyTemplateToSubject,
  createWorkspace,
  deserializeWorkspace,
  detectLegacyEoHTPlacements,
  getActiveSubject,
  migrateLegacyEoHTPlacements,
  previewApplyTemplateToSubject,
  previewRestoreSubjectToImport,
  removeSubject,
  replaceSubject,
  restoreSubjectToImport,
  serializeWorkspace,
  setActiveSubject,
} from "@/model/workspace";

function counterIdGen(): () => string {
  let n = 0;
  return () => `id-${++n}`;
}

function loadExampleSubject(id: string): Subject {
  const path = resolve(__dirname, "../../examples/example_physics_spec.xlsx");
  const buf = readFileSync(path);
  const ab = new Uint8Array(buf).buffer;
  const r = importSpec(ab, {
    sourceFilename: "example_physics_spec.xlsx",
    subjectName: "Physics",
    idGen: counterIdGen(),
  });
  if (!r.ok) throw new Error("import failed");
  return {
    ...r.subject,
    id,
    timeline: createDefaultTimeline(),
  };
}

describe("createWorkspace", () => {
  it("returns an empty workspace", () => {
    const ws = createWorkspace();
    expect(ws.subjects).toEqual([]);
    expect(ws.activeSubjectId).toBeNull();
  });
});

describe("addSubject", () => {
  it("appends the subject and sets it active when the workspace was empty", () => {
    let ws = createWorkspace();
    const s = loadExampleSubject("subj-1");
    ws = addSubject(ws, s);
    expect(ws.subjects).toHaveLength(1);
    expect(ws.activeSubjectId).toBe("subj-1");
  });

  it("leaves activeSubjectId untouched when adding a second subject", () => {
    let ws = createWorkspace();
    ws = addSubject(ws, loadExampleSubject("subj-1"));
    ws = addSubject(ws, { ...loadExampleSubject("subj-2"), id: "subj-2" });
    expect(ws.activeSubjectId).toBe("subj-1");
    expect(ws.subjects).toHaveLength(2);
  });

  it("throws on duplicate id", () => {
    let ws = createWorkspace();
    ws = addSubject(ws, loadExampleSubject("subj-1"));
    expect(() => addSubject(ws, loadExampleSubject("subj-1"))).toThrow();
  });
});

describe("removeSubject", () => {
  it("removes the subject and clears activeSubjectId when removing the active one", () => {
    let ws = createWorkspace();
    ws = addSubject(ws, loadExampleSubject("subj-1"));
    ws = removeSubject(ws, "subj-1");
    expect(ws.subjects).toHaveLength(0);
    expect(ws.activeSubjectId).toBeNull();
  });

  it("falls back to the first remaining subject when the active one is removed", () => {
    let ws = createWorkspace();
    ws = addSubject(ws, loadExampleSubject("subj-1"));
    ws = addSubject(ws, { ...loadExampleSubject("subj-2"), id: "subj-2" });
    ws = setActiveSubject(ws, "subj-2");
    ws = removeSubject(ws, "subj-2");
    expect(ws.activeSubjectId).toBe("subj-1");
  });

  it("is a no-op when the id is not present", () => {
    let ws = createWorkspace();
    ws = addSubject(ws, loadExampleSubject("subj-1"));
    const before = ws;
    ws = removeSubject(ws, "ghost");
    expect(ws).toBe(before);
  });
});

describe("replaceSubject", () => {
  it("replaces the subject in place", () => {
    let ws = createWorkspace();
    const s1 = loadExampleSubject("subj-1");
    ws = addSubject(ws, s1);
    const renamed: Subject = { ...s1, meta: { ...s1.meta, name: "Renamed" } };
    ws = replaceSubject(ws, "subj-1", renamed);
    expect(ws.subjects[0]?.meta.name).toBe("Renamed");
  });

  it("throws on unknown id", () => {
    let ws = createWorkspace();
    ws = addSubject(ws, loadExampleSubject("subj-1"));
    expect(() =>
      replaceSubject(ws, "ghost", loadExampleSubject("subj-1"))
    ).toThrow();
  });

  it("throws when the new subject's id does not match", () => {
    let ws = createWorkspace();
    ws = addSubject(ws, loadExampleSubject("subj-1"));
    const wrongId = { ...loadExampleSubject("subj-1"), id: "subj-2" };
    expect(() => replaceSubject(ws, "subj-1", wrongId)).toThrow();
  });
});

describe("setActiveSubject and getActiveSubject", () => {
  it("switches the active subject and reads it back", () => {
    let ws = createWorkspace();
    ws = addSubject(ws, loadExampleSubject("subj-1"));
    ws = addSubject(ws, { ...loadExampleSubject("subj-2"), id: "subj-2" });
    ws = setActiveSubject(ws, "subj-2");
    expect(getActiveSubject(ws)?.id).toBe("subj-2");
  });

  it("can clear the active subject with null", () => {
    let ws = createWorkspace();
    ws = addSubject(ws, loadExampleSubject("subj-1"));
    ws = setActiveSubject(ws, null);
    expect(getActiveSubject(ws)).toBeNull();
  });

  it("throws on unknown subject id", () => {
    let ws = createWorkspace();
    ws = addSubject(ws, loadExampleSubject("subj-1"));
    expect(() => setActiveSubject(ws, "ghost")).toThrow();
  });
});

describe("restoreSubjectToImport", () => {
  it("resets workingSpec to a clone of importedSpec (independent object)", () => {
    let ws = createWorkspace();
    const s = loadExampleSubject("subj-1");
    ws = addSubject(ws, s);
    const result = restoreSubjectToImport(ws, "subj-1");
    const after = result.workspace.subjects[0]!;
    expect(after.workingSpec).toEqual(after.importedSpec);
    expect(after.workingSpec).not.toBe(after.importedSpec);
  });

  it("preserves placements whose sub-topic still exists", () => {
    let ws = createWorkspace();
    let s = loadExampleSubject("subj-1");
    let tl = s.timeline;
    tl = placeBlock(tl, { kind: "sub-topic", subTopicCode: "T1a" }, "Y9-A1", 2, { idGen: counterIdGen() });
    s = { ...s, timeline: tl };
    ws = addSubject(ws, s);
    const result = restoreSubjectToImport(ws, "subj-1");
    const placed = result.workspace.subjects[0]?.timeline.halfTerms.find((h) => h.id === "Y9-A1")?.placedBlocks ?? [];
    expect(placed).toHaveLength(1);
    expect(result.orphans).toHaveLength(0);
  });

  it("removes placements whose sub-topic no longer exists in importedSpec and reports them as orphans", () => {
    let ws = createWorkspace();
    let s = loadExampleSubject("subj-1");
    let tl = s.timeline;
    tl = placeBlock(tl, { kind: "sub-topic", subTopicCode: "T99z" }, "Y9-A1", 3, { idGen: counterIdGen() });
    s = { ...s, timeline: tl };
    ws = addSubject(ws, s);
    const result = restoreSubjectToImport(ws, "subj-1");
    expect(result.orphans).toHaveLength(1);
    expect(result.orphans[0]?.source).toEqual({ kind: "sub-topic", subTopicCode: "T99z" });
    const placed = result.workspace.subjects[0]?.timeline.halfTerms.find((h) => h.id === "Y9-A1")?.placedBlocks ?? [];
    expect(placed).toHaveLength(0);
  });

  it("preserves EoHT placements as always valid", () => {
    let ws = createWorkspace();
    let s = loadExampleSubject("subj-1");
    let tl = s.timeline;
    tl = placeBlock(tl, { kind: "eoht" }, "Y9-A1", 1, { idGen: counterIdGen() });
    s = { ...s, timeline: tl };
    ws = addSubject(ws, s);
    const result = restoreSubjectToImport(ws, "subj-1");
    const eohtPlacements = result.workspace.subjects[0]?.timeline.halfTerms
      .flatMap((h) => h.placedBlocks)
      .filter((p) => p.source.kind === "eoht");
    expect(eohtPlacements).toHaveLength(1);
    expect(result.orphans).toHaveLength(0);
  });

  it("orphans custom-block placements whose customBlockId is missing", () => {
    let ws = createWorkspace();
    let s = loadExampleSubject("subj-1");
    let tl = s.timeline;
    tl = placeBlock(tl, { kind: "custom", customBlockId: "missing-cb" }, "Y9-A1", 1, { idGen: counterIdGen() });
    s = { ...s, timeline: tl };
    ws = addSubject(ws, s);
    const result = restoreSubjectToImport(ws, "subj-1");
    expect(result.orphans).toHaveLength(1);
    expect(result.orphans[0]?.source).toEqual({ kind: "custom", customBlockId: "missing-cb" });
  });

  it("preserves placements with split pieces when their sub-topic still exists", () => {
    let ws = createWorkspace();
    let s = loadExampleSubject("subj-1");
    let tl = s.timeline;
    tl = placeBlock(tl, { kind: "sub-topic", subTopicCode: "T2a" }, "Y9-A1", 10, { idGen: counterIdGen() });
    tl = placeBlockWithSpillover(tl, { kind: "sub-topic", subTopicCode: "T2b" }, 5, "Y9-A1", { idGen: counterIdGen() });
    s = { ...s, timeline: tl };
    ws = addSubject(ws, s);
    const result = restoreSubjectToImport(ws, "subj-1");
    const t2bPieces = result.workspace.subjects[0]?.timeline.halfTerms
      .flatMap((h) => h.placedBlocks)
      .filter((p) => p.source.kind === "sub-topic" && p.source.subTopicCode === "T2b");
    expect(t2bPieces).toHaveLength(2);
    expect(result.orphans).toHaveLength(0);
  });

  it("throws on unknown subject id", () => {
    let ws = createWorkspace();
    ws = addSubject(ws, loadExampleSubject("subj-1"));
    expect(() => restoreSubjectToImport(ws, "ghost")).toThrow();
  });
});

describe("previewRestoreSubjectToImport", () => {
  it("returns orphans without mutating the workspace", () => {
    let ws = createWorkspace();
    ws = addSubject(ws, loadExampleSubject("subj-1"));
    // Place an orphan referencing a non-existent sub-topic
    const subj = ws.subjects[0]!;
    const tl = placeBlock(
      subj.timeline,
      { kind: "sub-topic", subTopicCode: "T99z" },
      "Y9-A1",
      3,
      { idGen: counterIdGen() }
    );
    ws = replaceSubject(ws, "subj-1", { ...subj, timeline: tl });
    const wsBefore = ws;
    const preview = previewRestoreSubjectToImport(ws, "subj-1");
    expect(preview.orphans).toHaveLength(1);
    expect(preview.subject.id).toBe("subj-1");
    // Workspace is the same reference — function is pure
    expect(ws).toBe(wsBefore);
    expect(ws.subjects[0]?.timeline.halfTerms[0]?.placedBlocks).toHaveLength(1);
  });

  it("returns an empty orphan list when nothing would be dropped", () => {
    let ws = createWorkspace();
    ws = addSubject(ws, loadExampleSubject("subj-1"));
    const subj = ws.subjects[0]!;
    const tl = placeBlock(
      subj.timeline,
      { kind: "sub-topic", subTopicCode: "T2a" },
      "Y9-A1",
      2,
      { idGen: counterIdGen() }
    );
    ws = replaceSubject(ws, "subj-1", { ...subj, timeline: tl });
    expect(previewRestoreSubjectToImport(ws, "subj-1").orphans).toEqual([]);
  });

  it("throws on unknown subject id", () => {
    let ws = createWorkspace();
    ws = addSubject(ws, loadExampleSubject("subj-1"));
    expect(() => previewRestoreSubjectToImport(ws, "ghost")).toThrow();
  });
});

describe("applyTemplateToSubject", () => {
  it("preserves placements whose half-term ids exist in the new template", () => {
    let s = loadExampleSubject("subj-1");
    s = {
      ...s,
      timeline: placeBlock(
        s.timeline,
        { kind: "sub-topic", subTopicCode: "T1a" },
        "Y9-A1",
        2,
        { idGen: counterIdGen() }
      ),
    };
    // New template still has Y9-A1 (same id, different name + weeks)
    const template = {
      cycleLengthInWeeks: 1 as const,
      lessonsPerCyclePerYear: { Y9: 5 } as const,
      halfTerms: [
        { id: "Y9-A1", name: "Autumn first half", year: "Y9" as const, weeks: 7 },
      ],
    };
    const result = applyTemplateToSubject(s, template);
    expect(result.orphans).toHaveLength(0);
    expect(result.timeline.halfTerms[0]?.placedBlocks).toHaveLength(1);
    expect(result.timeline.halfTerms[0]?.label).toBe("Autumn first half");
    expect(result.timeline.halfTerms[0]?.budget).toBe(35); // 5 * 7 / 1 = 35
  });

  it("returns orphans for placements in cells the new template doesn't have", () => {
    let s = loadExampleSubject("subj-1");
    s = {
      ...s,
      timeline: placeBlock(
        s.timeline,
        { kind: "sub-topic", subTopicCode: "T1a" },
        "Y9-A1", // will be missing from the new template
        2,
        { idGen: counterIdGen() }
      ),
    };
    const template = {
      cycleLengthInWeeks: 1 as const,
      lessonsPerCyclePerYear: { Y10: 5 } as const,
      halfTerms: [
        { id: "Y10-HT1", name: "Aut 1", year: "Y10" as const, weeks: 6 },
      ],
    };
    const result = applyTemplateToSubject(s, template);
    expect(result.orphans).toHaveLength(1);
    expect(result.orphans[0]?.lessonsClaimed).toBe(2);
    expect(result.timeline.halfTerms[0]?.placedBlocks).toHaveLength(0);
  });

  it("previewApplyTemplateToSubject returns the same orphans without committing", () => {
    let s = loadExampleSubject("subj-1");
    s = {
      ...s,
      timeline: placeBlock(
        s.timeline,
        { kind: "sub-topic", subTopicCode: "T1a" },
        "Y9-A1",
        2,
        { idGen: counterIdGen() }
      ),
    };
    const template = {
      cycleLengthInWeeks: 1 as const,
      lessonsPerCyclePerYear: { Y10: 5 } as const,
      halfTerms: [
        { id: "Y10-HT1", name: "Aut 1", year: "Y10" as const, weeks: 6 },
      ],
    };
    const orphans = previewApplyTemplateToSubject(s, template);
    expect(orphans).toHaveLength(1);
    // Original subject is unchanged
    const y9a1 = s.timeline.halfTerms.find((h) => h.id === "Y9-A1");
    expect(y9a1?.placedBlocks.length).toBeGreaterThan(0);
  });
});

describe("serializeWorkspace / deserializeWorkspace", () => {
  it("round-trips a workspace with a populated subject", () => {
    let ws = createWorkspace();
    let s = loadExampleSubject("subj-1");
    let tl = s.timeline;
    tl = placeBlock(tl, { kind: "sub-topic", subTopicCode: "T1a" }, "Y9-A1", 2, { idGen: counterIdGen() });
    s = { ...s, timeline: tl };
    ws = addSubject(ws, s);
    const json = serializeWorkspace(ws, {
      now: new Date("2026-05-15T10:00:00Z"),
      appVersion: "1.0.0",
    });
    const parsed = JSON.parse(json);
    expect(parsed.fileVersion).toBe(FILE_VERSION);
    expect(parsed.savedAt).toBe("2026-05-15T10:00:00.000Z");
    expect(parsed.appVersion).toBe("1.0.0");
    const restored = deserializeWorkspace(json);
    expect(restored).toEqual(ws);
  });

  it("uses the current date and APP_VERSION by default", () => {
    const ws = createWorkspace();
    const before = Date.now();
    const json = serializeWorkspace(ws);
    const parsed = JSON.parse(json);
    const savedTime = Date.parse(parsed.savedAt);
    expect(savedTime).toBeGreaterThanOrEqual(before);
    expect(savedTime).toBeLessThanOrEqual(Date.now());
    expect(parsed.appVersion).toBe(APP_VERSION);
  });

  it("rejects invalid JSON", () => {
    expect(() => deserializeWorkspace("not json")).toThrow(DeserializationError);
  });

  it("rejects non-object roots", () => {
    expect(() => deserializeWorkspace("[]")).toThrow(/not a JSON object/);
    expect(() => deserializeWorkspace("42")).toThrow();
  });

  it("rejects files missing fileVersion", () => {
    const json = JSON.stringify({ savedAt: "x", workspace: { activeSubjectId: null, subjects: [] } });
    expect(() => deserializeWorkspace(json)).toThrow(/MISSING_VERSION|fileVersion/);
  });

  it("rejects newer file versions clearly", () => {
    const json = JSON.stringify({
      fileVersion: FILE_VERSION + 1,
      savedAt: "x",
      appVersion: "x",
      workspace: { activeSubjectId: null, subjects: [] },
    });
    expect(() => deserializeWorkspace(json)).toThrow(/newer than this app supports/);
  });

  it("rejects older file versions with a migration message", () => {
    const json = JSON.stringify({
      fileVersion: 0,
      workspace: { activeSubjectId: null, subjects: [] },
    });
    expect(() => deserializeWorkspace(json)).toThrow(/older than this app supports/);
  });

  it("rejects files missing workspace.subjects array", () => {
    const json = JSON.stringify({
      fileVersion: FILE_VERSION,
      workspace: { activeSubjectId: null },
    });
    expect(() => deserializeWorkspace(json)).toThrow(/INVALID_WORKSPACE|subjects/);
  });

  it("rejects invalid activeSubjectId types", () => {
    const json = JSON.stringify({
      fileVersion: FILE_VERSION,
      workspace: { activeSubjectId: 42, subjects: [] },
    });
    expect(() => deserializeWorkspace(json)).toThrow();
  });

  it("round-trips a workspace with a calendarTemplate", () => {
    const ws = addSubject(createWorkspace(), loadExampleSubject("subj-1"));
    const withTemplate = {
      ...ws,
      calendarTemplate: {
        cycleLengthInWeeks: 2 as const,
        lessonsPerCyclePerYear: { Y9: 5, Y10: 6 } as const,
        halfTerms: [
          { id: "Y9-HT1", name: "Aut 1", year: "Y9" as const, weeks: 6 },
          { id: "Y10-HT1", name: "Aut 1", year: "Y10" as const, weeks: 6 },
        ],
      },
    };
    const json = serializeWorkspace(withTemplate);
    const restored = deserializeWorkspace(json);
    expect(restored.calendarTemplate?.cycleLengthInWeeks).toBe(2);
    expect(restored.calendarTemplate?.halfTerms.length).toBe(2);
  });

  it("round-trips a workspace without a calendarTemplate (legacy file)", () => {
    const ws = addSubject(createWorkspace(), loadExampleSubject("subj-1"));
    const json = serializeWorkspace(ws);
    const restored = deserializeWorkspace(json);
    expect(restored.calendarTemplate).toBeUndefined();
  });

  it("round-trips a CustomBlock with no `kind` field (pre-Session-15 .curriculum)", () => {
    // Simulates a `.curriculum` file saved before the CustomBlock kind +
    // revisits fields were added. The deserialiser must preserve the absence
    // of those fields — normalising to `kind: "standard"` would create a
    // dirty diff on every load of a legacy file.
    const json = JSON.stringify({
      fileVersion: FILE_VERSION,
      appVersion: "1.0.0",
      savedAt: "2026-05-16T00:00:00Z",
      workspace: {
        activeSubjectId: null,
        subjects: [
          {
            id: "subj-legacy",
            meta: { name: "Legacy", colour: "#1F3A5F", sourceFilename: null },
            importedSpec: { topics: [] },
            workingSpec: { topics: [] },
            timeline: { halfTerms: [] },
            customBlocks: [
              { id: "cb-1", name: "Mock exam", lessons: 2, colour: "#B85C5C", isEoHT: false },
            ],
            config: { includeDepth: false, lostLessonBuffer: false, autoSpillover: true },
          },
        ],
      },
    });
    const restored = deserializeWorkspace(json);
    const block = restored.subjects[0]?.customBlocks[0];
    expect(block).toBeDefined();
    expect(block!.id).toBe("cb-1");
    // The new fields are absent — not normalised to defaults
    expect("kind" in block!).toBe(false);
    expect("revisits" in block!).toBe(false);
  });
});

// ============================================================
// Legacy EoHT migration (DEC-044)
// ============================================================

function legacyEoHTWorkspaceJson(): string {
  return JSON.stringify({
    fileVersion: FILE_VERSION,
    appVersion: "1.0.0",
    savedAt: "2026-05-15T00:00:00Z",
    workspace: {
      activeSubjectId: "subj-1",
      subjects: [
        {
          id: "subj-1",
          meta: { name: "Physics", colour: "#1F3A5F", sourceFilename: null },
          importedSpec: { topics: [] },
          workingSpec: { topics: [] },
          timeline: {
            halfTerms: [
              {
                id: "Y9-A1",
                year: "Y9",
                label: "Aut 1",
                dates: null,
                budget: 12,
                placedBlocks: [
                  {
                    id: "pb-eoht-1",
                    source: { kind: "eoht" },
                    lessonsClaimed: 1,
                    lessonRange: [0, 1],
                    splitFrom: null,
                    splitType: null,
                    userEdits: {},
                  },
                  {
                    id: "pb-st-1",
                    source: { kind: "sub-topic", subTopicCode: "T1a" },
                    lessonsClaimed: 3,
                    lessonRange: [0, 3],
                    splitFrom: null,
                    splitType: null,
                    userEdits: {},
                  },
                ],
              },
              {
                id: "Y9-A2",
                year: "Y9",
                label: "Aut 2",
                dates: null,
                budget: 12,
                placedBlocks: [
                  {
                    id: "pb-eoht-2",
                    source: { kind: "eoht" },
                    lessonsClaimed: 2,
                    lessonRange: [0, 2],
                    splitFrom: null,
                    splitType: null,
                    userEdits: {},
                  },
                ],
              },
            ],
          },
          customBlocks: [],
          config: { includeDepth: false, lostLessonBuffer: false, autoSpillover: true },
        },
      ],
    },
  });
}

describe("DEC-044 — legacy EoHT migration", () => {
  it("detectLegacyEoHTPlacements returns true for legacy files", () => {
    expect(detectLegacyEoHTPlacements(legacyEoHTWorkspaceJson())).toBe(true);
  });

  it("detectLegacyEoHTPlacements returns false for clean files", () => {
    const clean = JSON.stringify({
      fileVersion: FILE_VERSION,
      appVersion: APP_VERSION,
      savedAt: "2026-05-17T00:00:00Z",
      workspace: { activeSubjectId: null, subjects: [] },
    });
    expect(detectLegacyEoHTPlacements(clean)).toBe(false);
  });

  it("detectLegacyEoHTPlacements tolerates malformed JSON without throwing", () => {
    expect(detectLegacyEoHTPlacements("not json")).toBe(false);
    expect(detectLegacyEoHTPlacements("{}")).toBe(false);
  });

  it("deserializeWorkspace throws LegacyEoHTFileError on legacy files", () => {
    expect(() => deserializeWorkspace(legacyEoHTWorkspaceJson())).toThrow(
      LegacyEoHTFileError
    );
  });

  it("migrateLegacyEoHTPlacements converts EoHTs to custom-block placements", () => {
    let n = 0;
    const idGen = (): string => `migrated-${++n}`;
    const migrated = migrateLegacyEoHTPlacements(legacyEoHTWorkspaceJson(), { idGen });
    const ws = deserializeWorkspace(migrated);
    const subj = ws.subjects[0]!;
    // ONE new custom block per subject (not one per cell)
    const newCustoms = subj.customBlocks.filter((c) => c.isEoHT === true);
    expect(newCustoms).toHaveLength(1);
    expect(newCustoms[0]?.category).toBe("test");
    expect(newCustoms[0]?.name).toBe("End of half-term test");
    // Both EoHT placements rewritten to custom-kind referencing that block
    const customId = newCustoms[0]!.id;
    const placements = subj.timeline.halfTerms.flatMap((ht) =>
      ht.placedBlocks.filter(
        (pb) => pb.source.kind === "custom" && pb.source.customBlockId === customId
      )
    );
    expect(placements).toHaveLength(2);
    // Lesson counts preserved per-placement
    expect(placements.map((p) => p.lessonsClaimed).sort()).toEqual([1, 2]);
  });

  it("migrateLegacyEoHTPlacements is idempotent on already-migrated files", () => {
    let n = 0;
    const idGen = (): string => `id-${++n}`;
    const once = migrateLegacyEoHTPlacements(legacyEoHTWorkspaceJson(), { idGen });
    const twice = migrateLegacyEoHTPlacements(once, { idGen });
    expect(JSON.parse(once)).toEqual(JSON.parse(twice));
  });

  it("non-EoHT placements (sub-topic, existing customs) survive migration unchanged", () => {
    const migrated = migrateLegacyEoHTPlacements(legacyEoHTWorkspaceJson());
    const ws = deserializeWorkspace(migrated);
    const a1 = ws.subjects[0]!.timeline.halfTerms[0]!;
    const subTopicPlacement = a1.placedBlocks.find((pb) => pb.id === "pb-st-1");
    expect(subTopicPlacement).toBeDefined();
    expect(subTopicPlacement!.source.kind).toBe("sub-topic");
  });
});
