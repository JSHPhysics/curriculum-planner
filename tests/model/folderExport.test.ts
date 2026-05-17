import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import {
  exportByHalfTermFolder,
  exportByTopicFolder,
  packBundleAsZip,
} from "@/model/folderExport";
import { importSpec } from "@/model/import";
import { placeBlock } from "@/model/placement";
import { applyPreset } from "@/model/presets";
import { createDefaultTimeline } from "@/model/timeline";
import type { PlacedBlockSource, Subject } from "@/model/types";

function counterIdGen(): () => string {
  let n = 0;
  return () => `id-${++n}`;
}

function loadExample(): Subject {
  const path = resolve(__dirname, "../../examples/example_physics_spec.xlsx");
  const buf = readFileSync(path);
  const ab = new Uint8Array(buf).buffer;
  const r = importSpec(ab, {
    sourceFilename: "example_physics_spec.xlsx",
    subjectName: "GCSE Physics 1PH0",
    idGen: counterIdGen(),
  });
  if (!r.ok) throw new Error("import failed");
  return { ...r.subject, timeline: createDefaultTimeline() };
}

function readBack(buf: Uint8Array): XLSX.WorkBook {
  return XLSX.read(buf, { type: "array" });
}

function rows(wb: XLSX.WorkBook, sheet: string): unknown[][] {
  const ws = wb.Sheets[sheet];
  if (!ws) throw new Error(`Sheet "${sheet}" missing — have: ${wb.SheetNames.join(", ")}`);
  return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "", blankrows: true });
}

// ============================================================
// exportByHalfTermFolder
// ============================================================

describe("exportByHalfTermFolder", () => {
  it("produces one file per visible half-term, ids becoming filenames", () => {
    const subject = loadExample();
    const result = exportByHalfTermFolder(subject);
    // Default LEHS template = 17 half-terms (Y9-A1..Y11-U1)
    expect(result.files).toHaveLength(17);
    expect(result.files.map((f) => f.name)).toEqual([
      "Y9-A1.xlsx", "Y9-A2.xlsx", "Y9-S1.xlsx", "Y9-S2.xlsx", "Y9-U1.xlsx", "Y9-U2.xlsx",
      "Y10-A1.xlsx", "Y10-A2.xlsx", "Y10-S1.xlsx", "Y10-S2.xlsx", "Y10-U1.xlsx", "Y10-U2.xlsx",
      "Y11-A1.xlsx", "Y11-A2.xlsx", "Y11-S1.xlsx", "Y11-S2.xlsx", "Y11-U1.xlsx",
    ]);
  });

  it("suggested folder name includes subject name + 'by half-term'", () => {
    const subject = loadExample();
    const result = exportByHalfTermFolder(subject);
    expect(result.suggestedFolderName).toContain("GCSE Physics 1PH0");
    expect(result.suggestedFolderName).toContain("by half-term");
  });

  it("each workbook has 'Weekly schedule' and 'Lesson list' sheets", () => {
    const subject = loadExample();
    const result = exportByHalfTermFolder(subject);
    const first = result.files[0]!;
    const wb = readBack(first.buffer);
    expect(wb.SheetNames).toContain("Weekly schedule");
    expect(wb.SheetNames).toContain("Lesson list");
  });

  it("respects hidden years — files for hidden years are NOT emitted", () => {
    const subject: Subject = {
      ...loadExample(),
      config: {
        includeDepth: true,
        lostLessonBuffer: false,
        autoSpillover: true,
        hiddenYears: ["Y10"],
      },
    };
    const result = exportByHalfTermFolder(subject);
    const names = result.files.map((f) => f.name);
    // No Y10-* files
    expect(names.every((n) => !n.startsWith("Y10-"))).toBe(true);
    // Y9 and Y11 still emitted
    expect(names.some((n) => n.startsWith("Y9-"))).toBe(true);
    expect(names.some((n) => n.startsWith("Y11-"))).toBe(true);
  });

  it("Weekly schedule contains a row per week + placeholders for empty weeks", () => {
    const subject = loadExample();
    // Place T2a (3 lessons) into Y9-A1 (6-week half-term, budget 12)
    const placed: Subject = {
      ...subject,
      timeline: placeBlock(
        subject.timeline,
        { kind: "sub-topic", subTopicCode: "T2a" } as PlacedBlockSource,
        "Y9-A1",
        3,
        { idGen: counterIdGen() }
      ),
    };
    const result = exportByHalfTermFolder(placed);
    const y9a1 = result.files.find((f) => f.name === "Y9-A1.xlsx");
    expect(y9a1).toBeDefined();
    const weekly = rows(readBack(y9a1!.buffer), "Weekly schedule");
    // Header rows + 6 weeks (one row per week if no lessons, more if multiple lessons)
    const weekLabels = weekly
      .map((r) => String(r[0] ?? ""))
      .filter((s) => /^Week \d+/.test(s));
    expect(weekLabels.length).toBeGreaterThanOrEqual(6);
    expect(weekLabels[0]).toBe("Week 1");
  });

  it("Lesson list includes one row per placed lesson with week# + topic + objectives", () => {
    const subject = loadExample();
    // Apply a preset so the timeline has meaningful content
    const placed: Subject = { ...subject, timeline: applyPreset(subject, "frontloaded") };
    const result = exportByHalfTermFolder(placed);
    // Find a half-term that has placements
    const y9a1 = result.files.find((f) => f.name === "Y9-A1.xlsx");
    expect(y9a1).toBeDefined();
    const lessonList = rows(readBack(y9a1!.buffer), "Lesson list");
    // Header row + at least 1 lesson row
    expect(lessonList.length).toBeGreaterThan(1);
    // Header columns (paranoid: verify the schema didn't drift)
    expect(lessonList[0]).toEqual([
      "Week", "Lesson #", "Topic code", "Topic name", "Sub-topic code",
      "Sub-topic name", "Lesson title", "Practical", "Depth?", "Separate only?", "Objectives",
    ]);
    // First data row should have a valid week number (1..N) in column 0
    const firstWeek = Number(lessonList[1]![0]);
    expect(firstWeek).toBeGreaterThanOrEqual(1);
  });

  it("Weekly schedule header row 0 contains 'subject name — YearId Label'", () => {
    const subject = loadExample();
    const result = exportByHalfTermFolder(subject);
    const weekly = rows(readBack(result.files[0]!.buffer), "Weekly schedule");
    expect(String(weekly[0]![0])).toContain("GCSE Physics 1PH0");
    expect(String(weekly[0]![0])).toContain("Y9");
  });

  it("EoHT placements are excluded (scaffolding, not spec content)", () => {
    const subject = loadExample();
    // No need to add EoHTs explicitly; if any are seeded by other code, the
    // lesson list should still only contain sub-topic lessons.
    const placed: Subject = {
      ...subject,
      timeline: placeBlock(
        subject.timeline,
        { kind: "eoht" } as PlacedBlockSource,
        "Y9-A1",
        1,
        { idGen: () => "eoht-1" }
      ),
    };
    const result = exportByHalfTermFolder(placed);
    const lessonList = rows(readBack(result.files[0]!.buffer), "Lesson list");
    // Header only — no eoht rows
    expect(lessonList.length).toBe(1);
  });
});

// ============================================================
// exportByTopicFolder
// ============================================================

describe("exportByTopicFolder", () => {
  it("produces zero files when nothing has been placed", () => {
    const subject = loadExample();
    const result = exportByTopicFolder(subject);
    expect(result.files).toHaveLength(0);
  });

  it("produces one file per topic that has at least one placement (includeDepth=false default)", () => {
    // DEC-040: a sub-topic is "depth" only when EVERY lesson is depth. The
    // demo spec's T11a "Electrostatics" and T15a "Elastic behaviour" mix
    // foundation + depth lessons; they're now treated as foundation, so
    // frontloaded places them and we get all 15 topic files.
    // (Pre-DEC-040, T11 and T15 were skipped entirely because the importer
    // bubbled any-depth → sub-topic-isDepth; bug fixed in this session.)
    const subject = loadExample();
    const placed: Subject = { ...subject, timeline: applyPreset(subject, "frontloaded") };
    const result = exportByTopicFolder(placed);
    expect(result.files).toHaveLength(15);
  });

  it("produces one file per topic for all 15 when includeDepth is true", () => {
    const subject = loadExample();
    const withDepth: Subject = {
      ...subject,
      config: { ...subject.config, includeDepth: true },
    };
    const placed: Subject = {
      ...withDepth,
      timeline: applyPreset(withDepth, "frontloaded"),
    };
    const result = exportByTopicFolder(placed);
    expect(result.files).toHaveLength(15);
  });

  it("filenames are prefixed with sortable order numbers + topic code + name", () => {
    const subject = loadExample();
    const placed: Subject = { ...subject, timeline: applyPreset(subject, "frontloaded") };
    const result = exportByTopicFolder(placed);
    // First file should be "01 — T1 — Key concepts of physics.xlsx" (or similar)
    const first = result.files[0]!;
    expect(first.name).toMatch(/^01 — T1 — /);
    expect(first.name).toContain("Key concepts");
    expect(first.name.endsWith(".xlsx")).toBe(true);
  });

  it("suggested folder name includes subject name + 'by topic'", () => {
    const subject = loadExample();
    const placed: Subject = { ...subject, timeline: applyPreset(subject, "frontloaded") };
    const result = exportByTopicFolder(placed);
    expect(result.suggestedFolderName).toContain("GCSE Physics 1PH0");
    expect(result.suggestedFolderName).toContain("by topic");
  });

  it("workbook has a single sheet named '<code> lessons'", () => {
    const subject = loadExample();
    const placed: Subject = { ...subject, timeline: applyPreset(subject, "frontloaded") };
    const result = exportByTopicFolder(placed);
    const wb = readBack(result.files[0]!.buffer);
    expect(wb.SheetNames).toEqual(["T1 lessons"]);
  });

  it("lesson rows are calendar-ordered (Y9-A1 before Y9-A2 before Y10-A1)", () => {
    const subject = loadExample();
    const placed: Subject = { ...subject, timeline: applyPreset(subject, "frontloaded") };
    const result = exportByTopicFolder(placed);
    const wb = readBack(result.files[0]!.buffer);
    const sheetRows = rows(wb, wb.SheetNames[0]!);
    // Skip title/meta + header (first 4 rows) — data starts at index 4
    const dataRows = sheetRows.slice(4).filter((r) => String(r[0] ?? "").trim().length > 0);
    // Each row's columns: Year, Half-term, Dates, ...
    // Verify Year column is monotonically non-decreasing (Y9 → Y10 → Y11)
    const yearOrder = ["Y9", "Y10", "Y11"];
    let cursor = 0;
    for (const r of dataRows) {
      const y = String(r[0] ?? "");
      const idx = yearOrder.indexOf(y);
      expect(idx).toBeGreaterThanOrEqual(cursor);
      cursor = idx;
    }
  });

  it("respects hidden years — placements in Y10 don't appear when Y10 hidden", () => {
    const subject = loadExample();
    const subjectWithPreset: Subject = {
      ...subject,
      timeline: applyPreset(subject, "frontloaded"),
    };
    const hidden: Subject = {
      ...subjectWithPreset,
      config: {
        ...subjectWithPreset.config,
        hiddenYears: ["Y10"],
      },
    };
    const result = exportByTopicFolder(hidden);
    for (const file of result.files) {
      const wb = readBack(file.buffer);
      const sheetRows = rows(wb, wb.SheetNames[0]!);
      const dataRows = sheetRows.slice(4).filter((r) => String(r[0] ?? "").trim().length > 0);
      for (const r of dataRows) {
        expect(r[0]).not.toBe("Y10");
      }
    }
  });
});

// ============================================================
// Cross-cutting
// ============================================================

describe("folder export — filename safety", () => {
  it("strips path-reserved characters from topic names", () => {
    // The demo spec doesn't have weird topic names, but a hand-built fixture
    // confirms the safety pass. Construct one inline.
    const subject = loadExample();
    const weird: Subject = {
      ...subject,
      meta: { ...subject.meta, name: 'Forces / Motion: "the basics"' },
      workingSpec: {
        topics: [
          {
            id: "t-weird",
            code: "T1",
            name: 'A topic with <reserved>/"chars"',
            paper: null,
            subTopics: subject.workingSpec.topics[0]!.subTopics,
          },
        ],
      },
      timeline: applyPreset(
        {
          ...subject,
          workingSpec: {
            topics: [
              {
                id: "t-weird",
                code: "T1",
                name: 'A topic with <reserved>/"chars"',
                paper: null,
                subTopics: subject.workingSpec.topics[0]!.subTopics,
              },
            ],
          },
        },
        "frontloaded"
      ),
    };
    const result = exportByTopicFolder(weird);
    expect(result.files.length).toBeGreaterThan(0);
    for (const file of result.files) {
      expect(file.name).not.toContain("/");
      expect(file.name).not.toContain("\\");
      expect(file.name).not.toContain(":");
      expect(file.name).not.toContain("*");
      expect(file.name).not.toContain("?");
      expect(file.name).not.toContain('"');
      expect(file.name).not.toContain("<");
      expect(file.name).not.toContain(">");
      expect(file.name).not.toContain("|");
    }
    expect(result.suggestedFolderName).not.toContain("/");
    expect(result.suggestedFolderName).not.toContain('"');
  });
});

// ============================================================
// packBundleAsZip
// ============================================================

describe("packBundleAsZip", () => {
  it("returns a single zip buffer named after the suggested folder + .zip", async () => {
    const subject = loadExample();
    const bundle = exportByHalfTermFolder(subject);
    const zipped = await packBundleAsZip(bundle);
    expect(zipped.suggestedFilename).toBe(`${bundle.suggestedFolderName}.zip`);
    expect(zipped.buffer.byteLength).toBeGreaterThan(0);
  });

  it("contains every file from the bundle at the archive root", async () => {
    const subject = loadExample();
    const bundle = exportByHalfTermFolder(subject);
    const zipped = await packBundleAsZip(bundle);
    const reopened = await JSZip.loadAsync(zipped.buffer);
    const filenames = Object.keys(reopened.files).sort();
    const expected = bundle.files.map((f) => f.name).sort();
    expect(filenames).toEqual(expected);
  });

  it("preserves file content byte-for-byte through the round trip", async () => {
    const subject = loadExample();
    const bundle = exportByHalfTermFolder(subject);
    const zipped = await packBundleAsZip(bundle);
    const reopened = await JSZip.loadAsync(zipped.buffer);
    const firstName = bundle.files[0]!.name;
    const fromZip = await reopened.files[firstName]!.async("uint8array");
    // Convert both to plain byte arrays for comparison (XLSX.write returns an
    // ArrayBuffer that we cast to Uint8Array; the cast isn't physical so
    // structural equality fails. Compare byte content explicitly).
    const orig = new Uint8Array(bundle.files[0]!.buffer);
    expect(fromZip.byteLength).toBe(orig.byteLength);
    expect(Array.from(fromZip)).toEqual(Array.from(orig));
  });

  it("compresses (zip < total raw byte count)", async () => {
    const subject = loadExample();
    const bundle = exportByHalfTermFolder(subject);
    const rawTotal = bundle.files.reduce((s, f) => s + f.buffer.byteLength, 0);
    const zipped = await packBundleAsZip(bundle);
    // .xlsx files are already deflate-compressed internally, so re-zipping
    // only saves a few percent. Asserting strictly < raw is enough to confirm
    // we're actually compressing rather than storing.
    expect(zipped.buffer.byteLength).toBeLessThan(rawTotal);
  });

  it("works with the per-topic bundle too", async () => {
    const subject = loadExample();
    // Need placements for per-topic to emit any files. Build the seeded
    // timeline first, then construct the Subject (Subject.timeline is readonly
    // so we can't mutate in place).
    const seededTimeline = placeBlock(
      createDefaultTimeline(),
      { kind: "sub-topic", subTopicCode: "T1a" } as PlacedBlockSource,
      "Y9-A1",
      2,
      { idGen: counterIdGen() }
    );
    const placed: Subject = {
      ...subject,
      timeline: seededTimeline,
      config: { ...subject.config, includeDepth: true },
    };
    const bundle = exportByTopicFolder(placed);
    const zipped = await packBundleAsZip(bundle);
    expect(zipped.suggestedFilename).toContain("by topic");
    expect(zipped.suggestedFilename.endsWith(".zip")).toBe(true);
    expect(zipped.buffer.byteLength).toBeGreaterThan(0);
  });
});
