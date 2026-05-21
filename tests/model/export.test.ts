import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import {
  computeCoverageStats,
  exportSubjectToXlsx,
} from "@/model/export";
import { importSpec } from "@/model/import";
import { placeBlock } from "@/model/placement";
import { createDefaultTimeline, createEoHTBlocks } from "@/model/timeline";
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
  return {
    ...r.subject,
    timeline: createDefaultTimeline(),
  };
}

function readBack(buf: ArrayBuffer): XLSX.WorkBook {
  return XLSX.read(buf, { type: "array" });
}

function rows(wb: XLSX.WorkBook, sheet: string): unknown[][] {
  const ws = wb.Sheets[sheet];
  if (!ws) throw new Error(`Sheet "${sheet}" missing`);
  return XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: "",
    blankrows: true,
  });
}

const T1a: PlacedBlockSource = { kind: "sub-topic", subTopicCode: "T1a" };
const T2a: PlacedBlockSource = { kind: "sub-topic", subTopicCode: "T2a" };
const T2b: PlacedBlockSource = { kind: "sub-topic", subTopicCode: "T2b" };

function placeSomeBlocks(subject: Subject): Subject {
  let tl = subject.timeline;
  // T1a (Units and measurement, 2 lessons) → Y9-A1
  tl = placeBlock(tl, T1a, "Y9-A1", 2, { idGen: counterIdGen() });
  // T2a (Kinematics, 2 lessons) → Y9-A1
  tl = placeBlock(tl, T2a, "Y9-A1", 2, { idGen: counterIdGen() });
  // T2b (Acceleration etc, 5 lessons) → Y9-A2 — fits
  tl = placeBlock(tl, T2b, "Y9-A2", 5, { idGen: counterIdGen() });
  return { ...subject, timeline: tl };
}

describe("exportSubjectToXlsx — workbook shape", () => {
  it("produces an .xlsx readable by SheetJS with the 5 expected sheets", () => {
    const subj = placeSomeBlocks(loadExample());
    const buf = exportSubjectToXlsx(subj, { now: new Date("2026-05-15T10:00:00Z") });
    const wb = readBack(buf);
    expect(wb.SheetNames).toEqual([
      "Cover",
      "Topic view",
      "Sub-topic view",
      "Lesson view",
      "Objective view",
    ]);
  });
});

describe("Cover sheet", () => {
  it("includes subject name, source file, export date, and summary stats", () => {
    const subj = placeSomeBlocks(loadExample());
    const buf = exportSubjectToXlsx(subj, { now: new Date("2026-05-15T10:00:00Z") });
    const cover = rows(readBack(buf), "Cover");
    // Find rows by their first cell
    const find = (label: string) => cover.find((r) => r[0] === label);
    expect(find("Subject name")?.[1]).toBe("GCSE Physics 1PH0");
    expect(find("Source spec file")?.[1]).toBe("example_physics_spec.xlsx");
    expect(find("Exported")?.[1]).toBe("2026-05-15T10:00:00.000Z");
    // DEC-040: coverage stats honour the depth toggle. Default includeDepth=false
    // means depth lessons drop out of both numerator and denominator. Demo has
    // 66 lessons total but 13 are depth-flagged → 53 foundation lessons.
    expect(find("Total spec lessons")?.[1]).toBe(53);
    // Of 9 raw placed lessons (T1a 2L + T2a 2L + T2b 5L), T2b's last lesson
    // is "Terminal velocity (depth)" → effective placed = 8.
    expect(find("Lessons placed")?.[1]).toBe(8);
  });

  it("emits per-year placement rows for Y9, Y10, Y11 in order", () => {
    const subj = placeSomeBlocks(loadExample());
    const buf = exportSubjectToXlsx(subj, { now: new Date("2026-05-15T10:00:00Z") });
    const cover = rows(readBack(buf), "Cover");
    const yearRows = cover.filter((r) => r[0] === "Y9" || r[0] === "Y10" || r[0] === "Y11");
    expect(yearRows.map((r) => r[0])).toEqual(["Y9", "Y10", "Y11"]);
    // Y9 placed = 8 effective (2 + 2 + 4, depth-filtered per DEC-040)
    expect(yearRows[0]?.[1]).toBe(8);
    // Y9 budget = 12 + 12 + 11 + 9 + 13 + 9 = 66 (budget is unaffected by depth toggle)
    expect(yearRows[0]?.[2]).toBe(66);
    // Y10 and Y11 had no placement
    expect(yearRows[1]?.[1]).toBe(0);
    expect(yearRows[2]?.[1]).toBe(0);
  });
});

describe("computeCoverageStats", () => {
  it("computes coverage % as effective-placed / effective-total when includeDepth=false (DEC-040)", () => {
    const subj = placeSomeBlocks(loadExample());
    const stats = computeCoverageStats(subj);
    expect(stats.totalSpecLessons).toBe(53);
    expect(stats.placedLessons).toBe(8);
    // 8 / 53 ≈ 15.094… → 15.1 (1 dp)
    expect(stats.coveragePercent).toBe(15.1);
  });

  it("includes depth lessons in both numerator and denominator when includeDepth=true", () => {
    const subj: Subject = {
      ...placeSomeBlocks(loadExample()),
      config: {
        includeDepth: true,
        lostLessonBuffer: false,
        autoSpillover: true,
      },
    };
    const stats = computeCoverageStats(subj);
    expect(stats.totalSpecLessons).toBe(66);
    expect(stats.placedLessons).toBe(9);
  });

  it("returns 0% when there are no spec lessons", () => {
    const empty: Subject = {
      id: "x",
      meta: { name: "", colour: "#000", sourceFilename: null },
      importedSpec: { topics: [] },
      workingSpec: { topics: [] },
      timeline: createDefaultTimeline(),
      customBlocks: [],
      config: { includeDepth: false, lostLessonBuffer: false, autoSpillover: true },
    };
    expect(computeCoverageStats(empty).coveragePercent).toBe(0);
  });

  it("excludes EoHT and custom placements from placed-lessons count", () => {
    let subj = placeSomeBlocks(loadExample());
    subj = { ...subj, timeline: createEoHTBlocks(subj.timeline, { idGen: counterIdGen() }) };
    const stats = computeCoverageStats(subj);
    // EoHT adds 17 lessons of placement, but shouldn't count.
    // Effective placed = 8 (per DEC-040; T2b's last lesson is depth and filtered).
    expect(stats.placedLessons).toBe(8);
  });

  it("respectHiddenYears excludes placements + budget for hidden years", () => {
    const subj = placeSomeBlocks(loadExample());
    const allStats = computeCoverageStats(subj);
    // Hide Y9 — placements in Y9 should drop out of placed + budget
    const hidden: Subject = {
      ...subj,
      config: { ...subj.config, hiddenYears: ["Y9"] },
    };
    const filteredStats = computeCoverageStats(hidden, { respectHiddenYears: true });
    // Y9 is the only year with placements in the fixture, so visible total = 0
    expect(filteredStats.placedLessons).toBe(0);
    expect(filteredStats.perYear.has("Y9")).toBe(false);
    // Without the option, behaviour is unchanged
    const stillSeen = computeCoverageStats(hidden);
    expect(stillSeen.placedLessons).toBe(allStats.placedLessons);
  });

  it("export sheets skip hidden-year placements", () => {
    let subj = placeSomeBlocks(loadExample());
    subj = { ...subj, config: { ...subj.config, hiddenYears: ["Y9"] } };
    const buf = exportSubjectToXlsx(subj, { now: new Date("2026-05-15T10:00:00Z") });
    const subTopicSheet = rows(readBack(buf), "Sub-topic view");
    // No Y9 rows in the sub-topic sheet
    const y9Rows = subTopicSheet.slice(1).filter((r) => r[0] === "Y9");
    expect(y9Rows).toHaveLength(0);
  });
});

describe("Topic view sheet", () => {
  it("has the expected header row", () => {
    const subj = placeSomeBlocks(loadExample());
    const buf = exportSubjectToXlsx(subj, { now: new Date("2026-05-15T10:00:00Z") });
    const data = rows(readBack(buf), "Topic view");
    expect(data[0]).toEqual([
      "Year",
      "Half-term",
      "Topic code",
      "Topic name",
      "Lessons claimed",
      "Sub-topics included",
    ]);
  });

  it("aggregates by (half-term, topic) and lists included sub-topics", () => {
    const subj = placeSomeBlocks(loadExample());
    const buf = exportSubjectToXlsx(subj, { now: new Date("2026-05-15T10:00:00Z") });
    const data = rows(readBack(buf), "Topic view");
    const dataRows = data.slice(1);
    // Y9-A1: T1 (2 lessons) + T2 (2 lessons)
    const a1Rows = dataRows.filter((r) => r[1] === "Aut 1" && r[0] === "Y9");
    expect(a1Rows).toHaveLength(2);
    const t1Row = a1Rows.find((r) => r[2] === "T1");
    expect(t1Row?.[4]).toBe(2);
    expect(t1Row?.[5]).toBe("T1a");
    const t2Row = a1Rows.find((r) => r[2] === "T2");
    expect(t2Row?.[4]).toBe(2);
    expect(t2Row?.[5]).toBe("T2a");
    // Y9-A2: T2 (5 lessons claimed, but 1 is depth-flagged "Terminal velocity"
    // → effective = 4 under default includeDepth=false per DEC-040)
    const a2 = dataRows.find((r) => r[0] === "Y9" && r[1] === "Aut 2");
    expect(a2?.[4]).toBe(4);
    expect(a2?.[5]).toBe("T2b");
  });
});

describe("Sub-topic view sheet", () => {
  it("has the expected header row", () => {
    const subj = placeSomeBlocks(loadExample());
    const buf = exportSubjectToXlsx(subj, { now: new Date("2026-05-15T10:00:00Z") });
    const data = rows(readBack(buf), "Sub-topic view");
    expect(data[0]).toEqual([
      "Year",
      "Half-term",
      "Topic code",
      "Sub-topic code",
      "Sub-topic name",
      "Lessons claimed",
      "Difficulty",
      "Depth?",
      "Practical(s)",
    ]);
  });

  it("emits one row per placement when a sub-topic is placed in multiple cells", () => {
    let subj = placeSomeBlocks(loadExample());
    let tl = subj.timeline;
    // Place T3b in two cells manually — checks the export emits one row per
    // placement rather than collapsing.
    tl = placeBlock(tl, { kind: "sub-topic", subTopicCode: "T3b" }, "Y9-S1", 3, { idGen: counterIdGen() });
    tl = placeBlock(tl, { kind: "sub-topic", subTopicCode: "T3b" }, "Y9-S2", 2, { idGen: counterIdGen() });
    subj = { ...subj, timeline: tl };

    const buf = exportSubjectToXlsx(subj, { now: new Date("2026-05-15T10:00:00Z") });
    const data = rows(readBack(buf), "Sub-topic view");
    const t3bRows = data.slice(1).filter((r) => r[3] === "T3b");
    expect(t3bRows).toHaveLength(2);
    expect(t3bRows[0]?.[1]).toBe("Spr 1");
    expect(t3bRows[1]?.[1]).toBe("Spr 2");
  });

  it("flags difficulty, depth, and practicals at the sub-topic level", () => {
    const subj = placeSomeBlocks(loadExample());
    const buf = exportSubjectToXlsx(subj, { now: new Date("2026-05-15T10:00:00Z") });
    const data = rows(readBack(buf), "Sub-topic view");
    const t1aRow = data.slice(1).find((r) => r[3] === "T1a");
    expect(t1aRow?.[6]).toBe(2);
    expect(t1aRow?.[7]).toBe("");
  });

  it("excludes EoHT placements", () => {
    let subj = placeSomeBlocks(loadExample());
    subj = { ...subj, timeline: createEoHTBlocks(subj.timeline, { idGen: counterIdGen() }) };
    const buf = exportSubjectToXlsx(subj, { now: new Date("2026-05-15T10:00:00Z") });
    const data = rows(readBack(buf), "Sub-topic view");
    const dataRows = data.slice(1);
    // No row should reference EoHT (every row has a real sub-topic code)
    expect(dataRows.every((r) => typeof r[3] === "string" && /^T\d+[a-z]+$/.test(r[3] as string))).toBe(true);
  });
});

describe("Lesson view sheet", () => {
  it("has the expected header row", () => {
    const subj = placeSomeBlocks(loadExample());
    const buf = exportSubjectToXlsx(subj, { now: new Date("2026-05-15T10:00:00Z") });
    const data = rows(readBack(buf), "Lesson view");
    expect(data[0]).toEqual([
      "Year",
      "Half-term",
      "Topic",
      "Sub-topic",
      "Lesson No.",
      "Lesson Title",
      "Practical",
      "Depth?",
      "Separate only?",
    ]);
  });

  it("emits one row per lesson within the placed range (depth-filtered per DEC-040)", () => {
    const subj = placeSomeBlocks(loadExample());
    const buf = exportSubjectToXlsx(subj, { now: new Date("2026-05-15T10:00:00Z") });
    const data = rows(readBack(buf), "Lesson view");
    // T1a has 2 lessons, T2a has 2, T2b has 5 (1 depth) → 8 rows under
    // the default includeDepth=false.
    expect(data.slice(1)).toHaveLength(8);
    const t1aLessons = data.slice(1).filter((r) => r[3] === "T1a");
    expect(t1aLessons.map((r) => r[5])).toEqual([
      "SI units and prefixes",
      "Scalars and vectors",
    ]);
  });

  it("respects lessonRange and the depth toggle when slicing (DEC-040)", () => {
    let subj = placeSomeBlocks(loadExample());
    // Place T2b separately and split it manually mid-way
    let tl = createDefaultTimeline();
    tl = placeBlock(tl, T2b, "Y9-S1", 5, { idGen: counterIdGen() });
    subj = { ...subj, timeline: tl };
    const buf = exportSubjectToXlsx(subj, { now: new Date("2026-05-15T10:00:00Z") });
    const data = rows(readBack(buf), "Lesson view");
    const t2bLessons = data.slice(1).filter((r) => r[3] === "T2b");
    // Lesson No. = lesson.number; T2b is lessons 3..7 in spec. With
    // includeDepth=false (default), lesson 7 "Terminal velocity (depth)" is
    // filtered → expect 3..6 only.
    expect(t2bLessons.map((r) => r[4])).toEqual([3, 4, 5, 6]);
  });

  it("emits all lessons (incl. depth) when includeDepth=true", () => {
    let subj = placeSomeBlocks(loadExample());
    subj = {
      ...subj,
      config: { ...subj.config, includeDepth: true },
    };
    const buf = exportSubjectToXlsx(subj, { now: new Date("2026-05-15T10:00:00Z") });
    const data = rows(readBack(buf), "Lesson view");
    expect(data.slice(1)).toHaveLength(9);
  });
});

describe("Objective view sheet", () => {
  it("has the expected header row", () => {
    const subj = placeSomeBlocks(loadExample());
    const buf = exportSubjectToXlsx(subj, { now: new Date("2026-05-15T10:00:00Z") });
    const data = rows(readBack(buf), "Objective view");
    expect(data[0]).toEqual([
      "Year",
      "Half-term",
      "Topic",
      "Sub-topic",
      "Lesson No.",
      "Lesson Title",
      "Objective text",
      "Depth?",
    ]);
  });

  it("emits one row per objective per lesson", () => {
    const subj = placeSomeBlocks(loadExample());
    const buf = exportSubjectToXlsx(subj, { now: new Date("2026-05-15T10:00:00Z") });
    const data = rows(readBack(buf), "Objective view");
    // T1a L1 has 3 objectives, T1a L2 has 3, T2a L1 has 3, T2a L2 has 3
    // T2b lessons 3-7 each have varying objectives — count from example_physics_spec
    const t1aObjs = data.slice(1).filter((r) => r[3] === "T1a");
    expect(t1aObjs).toHaveLength(6);
    expect(t1aObjs[0]?.[6]).toContain("SI base units");
  });
});

describe("round-trip", () => {
  it("an export of an empty timeline produces only header rows in content sheets", () => {
    const subj = loadExample();
    const buf = exportSubjectToXlsx(subj, { now: new Date("2026-05-15T10:00:00Z") });
    const wb = readBack(buf);
    expect(rows(wb, "Topic view")).toHaveLength(1);
    expect(rows(wb, "Sub-topic view")).toHaveLength(1);
    expect(rows(wb, "Lesson view")).toHaveLength(1);
    expect(rows(wb, "Objective view")).toHaveLength(1);
  });

  it("preserves placement order across half-terms", () => {
    const subj = placeSomeBlocks(loadExample());
    const buf = exportSubjectToXlsx(subj, { now: new Date("2026-05-15T10:00:00Z") });
    const lessonRows = rows(readBack(buf), "Lesson view").slice(1);
    // Y9-A1 rows come before Y9-A2 rows
    const a1Indices = lessonRows
      .map((r, i) => (r[1] === "Aut 1" ? i : -1))
      .filter((i) => i >= 0);
    const a2Indices = lessonRows
      .map((r, i) => (r[1] === "Aut 2" ? i : -1))
      .filter((i) => i >= 0);
    expect(Math.max(...a1Indices)).toBeLessThan(Math.min(...a2Indices));
  });
});
