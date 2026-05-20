import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import { importSpec } from "@/model/import";

const FULL_HEADERS = [
  "Topic",
  "Lesson No.",
  "Lesson Title",
  "Sub-topic",
  "Objectives",
  "Practical",
  "Difficulty",
  "Extra-depth",
  "Separate science only?",
  "Paper",
  "Notes",
] as const;

function makeWorkbook(
  headers: readonly string[],
  rows: readonly (readonly unknown[])[],
  sheetName = "Spec"
): ArrayBuffer {
  const aoa: unknown[][] = [headers.slice(), ...rows.map((r) => r.slice())];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return out;
}

function rowOf(values: Partial<Record<(typeof FULL_HEADERS)[number], unknown>>): unknown[] {
  return FULL_HEADERS.map((h) => values[h] ?? "");
}

function loadExampleBuffer(): ArrayBuffer {
  const path = resolve(__dirname, "../../examples/example_physics_spec.xlsx");
  const buf = readFileSync(path);
  return new Uint8Array(buf).buffer;
}

function counterIdGen(): () => string {
  let n = 0;
  return () => `id-${++n}`;
}

describe("importSpec — happy path against example_physics_spec.xlsx", () => {
  const result = importSpec(loadExampleBuffer(), {
    sourceFilename: "example_physics_spec.xlsx",
    subjectName: "GCSE Physics 1PH0",
    idGen: counterIdGen(),
  });

  it("imports without errors", () => {
    expect(result.ok).toBe(true);
  });

  it("produces a Subject with the expected meta", () => {
    if (!result.ok) throw new Error("import failed");
    expect(result.subject.meta.name).toBe("GCSE Physics 1PH0");
    expect(result.subject.meta.sourceFilename).toBe("example_physics_spec.xlsx");
  });

  it("counts 15 topics, 33 sub-topics, 66 lessons", () => {
    if (!result.ok) throw new Error("import failed");
    const spec = result.subject.importedSpec;
    expect(spec.topics).toHaveLength(15);
    const subCount = spec.topics.reduce((s, t) => s + t.subTopics.length, 0);
    expect(subCount).toBe(33);
    const lessonCount = spec.topics.reduce(
      (s, t) => s + t.subTopics.reduce((ss, st) => ss + st.lessons.length, 0),
      0
    );
    expect(lessonCount).toBe(66);
  });

  it("assigns topic codes T1..T15 in import order", () => {
    if (!result.ok) throw new Error("import failed");
    const codes = result.subject.importedSpec.topics.map((t) => t.code);
    expect(codes).toEqual([
      "T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8",
      "T9", "T10", "T11", "T12", "T13", "T14", "T15",
    ]);
  });

  it("assigns sub-topic codes T2a..T2d in import order within Motion and forces", () => {
    if (!result.ok) throw new Error("import failed");
    const motion = result.subject.importedSpec.topics[1];
    expect(motion?.name).toBe("Motion and forces");
    expect(motion?.subTopics.map((st) => st.code)).toEqual([
      "T2a",
      "T2b",
      "T2c",
      "T2d",
    ]);
  });

  it("preserves lesson order and objectives within a sub-topic", () => {
    if (!result.ok) throw new Error("import failed");
    const t1 = result.subject.importedSpec.topics[0];
    const units = t1?.subTopics[0];
    expect(units?.name).toBe("Units and measurement");
    expect(units?.lessons.map((l) => l.title)).toEqual([
      "SI units and prefixes",
      "Scalars and vectors",
    ]);
    expect(units?.lessons[0]?.objectives[0]?.text).toContain("SI base units");
  });

  it("propagates the depth flag onto lesson + objectives; sub-topic depth means EVERY lesson depth (DEC-040)", () => {
    if (!result.ok) throw new Error("import failed");
    const motion = result.subject.importedSpec.topics[1];
    const accel = motion?.subTopics[1];
    expect(accel?.name).toBe("Acceleration and Newton's laws");
    // Sub-topic isDepth is now "every lesson is depth". Acceleration has
    // 5 foundation lessons + 1 depth lesson, so the sub-topic is NOT depth.
    expect(accel?.isDepth).toBe(false);
    const terminal = accel?.lessons.find(
      (l) => l.title === "Terminal velocity (depth)"
    );
    expect(terminal?.isDepth).toBe(true);
    expect(terminal?.objectives.every((o) => o.isDepth)).toBe(true);
    const newton1 = accel?.lessons.find(
      (l) => l.title === "Newton's first and second laws"
    );
    expect(newton1?.isDepth).toBe(false);
    // A sub-topic whose every lesson is depth-flagged DOES get isDepth=true.
    // Find one: "Pressure" in Forces-and-their-effects has only "Pressure in fluids (depth)".
    const forcesEffects = result.subject.importedSpec.topics.find(
      (t) => t.code === "T9"
    );
    const pressure = forcesEffects?.subTopics.find((st) => st.name === "Pressure");
    expect(pressure?.isDepth).toBe(true);
    expect(pressure?.lessons.every((l) => l.isDepth)).toBe(true);
  });

  it("propagates the separate-only flag onto sub-topic, lesson", () => {
    if (!result.ok) throw new Error("import failed");
    const motion = result.subject.importedSpec.topics[1];
    const momentum = motion?.subTopics.find((st) => st.name === "Momentum");
    expect(momentum?.separateOnly).toBe(true);
    expect(momentum?.lessons[0]?.separateOnly).toBe(true);
  });

  it("captures the practical reference on lessons that have one", () => {
    if (!result.ok) throw new Error("import failed");
    const motion = result.subject.importedSpec.topics[1];
    const newton2 = motion?.subTopics[1]?.lessons.find(
      (l) => l.title === "Newton's first and second laws"
    );
    expect(newton2?.practical).toBe("CP1 Force and acceleration");
  });

  it("resolves sub-topic difficulty as the max across rows", () => {
    if (!result.ok) throw new Error("import failed");
    const motion = result.subject.importedSpec.topics[1];
    const accel = motion?.subTopics[1];
    expect(accel?.difficulty).toBe(3);
  });

  it("deep-clones workingSpec from importedSpec", () => {
    if (!result.ok) throw new Error("import failed");
    expect(result.subject.workingSpec).toEqual(result.subject.importedSpec);
    expect(result.subject.workingSpec).not.toBe(result.subject.importedSpec);
    expect(result.subject.workingSpec.topics[0]).not.toBe(
      result.subject.importedSpec.topics[0]
    );
  });

  it("produces an empty timeline and customBlocks (filled in Session 3+)", () => {
    if (!result.ok) throw new Error("import failed");
    expect(result.subject.timeline.halfTerms).toEqual([]);
    expect(result.subject.customBlocks).toEqual([]);
  });

  it("produces a sub-topic-difficulty-varies warning where rows disagree", () => {
    if (!result.ok) throw new Error("import failed");
    const motionWarnings = result.warnings.filter((w) =>
      w.code === "SUBTOPIC_DIFFICULTY_VARIES" &&
      w.message.includes("Acceleration and Newton's laws")
    );
    expect(motionWarnings).toHaveLength(1);
  });
});

describe("importSpec — validation errors", () => {
  it("rejects a workbook with a missing required column", () => {
    const buf = makeWorkbook(
      ["Topic", "Lesson No.", "Lesson Title"],
      [["A", 1, "Intro"]]
    );
    const r = importSpec(buf);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => e.code === "MISSING_COLUMN" && e.message.includes("Sub-topic"))).toBe(true);
  });

  it("rejects rows with an empty required cell", () => {
    const buf = makeWorkbook(FULL_HEADERS, [
      rowOf({ Topic: "", "Lesson No.": 1, "Lesson Title": "X", "Sub-topic": "S" }),
      rowOf({ Topic: "T", "Lesson No.": 2, "Lesson Title": "", "Sub-topic": "S" }),
      rowOf({ Topic: "T", "Lesson No.": 3, "Lesson Title": "Y", "Sub-topic": "" }),
    ]);
    const r = importSpec(buf);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const codes = new Set(r.errors.map((e) => e.code));
    expect(codes.has("EMPTY_TOPIC")).toBe(true);
    expect(codes.has("EMPTY_LESSON_TITLE")).toBe(true);
    expect(codes.has("EMPTY_SUBTOPIC")).toBe(true);
  });

  it("rejects a non-integer Lesson No.", () => {
    const buf = makeWorkbook(FULL_HEADERS, [
      rowOf({ Topic: "T", "Lesson No.": "not a number", "Lesson Title": "X", "Sub-topic": "S" }),
      rowOf({ Topic: "T", "Lesson No.": 1.5, "Lesson Title": "Y", "Sub-topic": "S" }),
    ]);
    const r = importSpec(buf);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const badLessonNo = r.errors.filter((e) => e.code === "BAD_LESSON_NO");
    expect(badLessonNo).toHaveLength(2);
  });

  it("rejects duplicate Lesson No. with different titles within a sub-topic", () => {
    const buf = makeWorkbook(FULL_HEADERS, [
      rowOf({ Topic: "T", "Lesson No.": 1, "Lesson Title": "Title A", "Sub-topic": "S" }),
      rowOf({ Topic: "T", "Lesson No.": 1, "Lesson Title": "Title B", "Sub-topic": "S" }),
    ]);
    const r = importSpec(buf);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) => e.code === "DUPLICATE_LESSON_DIFFERENT_TITLES")
    ).toBe(true);
  });

});

describe("importSpec — warnings", () => {
  it("warns when a sub-topic has no objectives across any of its lessons", () => {
    const buf = makeWorkbook(FULL_HEADERS, [
      rowOf({ Topic: "T", "Lesson No.": 1, "Lesson Title": "L1", "Sub-topic": "S", Objectives: "" }),
      rowOf({ Topic: "T", "Lesson No.": 2, "Lesson Title": "L2", "Sub-topic": "S", Objectives: "   " }),
    ]);
    const r = importSpec(buf);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.warnings.some((w) => w.code === "SUBTOPIC_NO_OBJECTIVES")).toBe(true);
    const lessonWarnings = r.warnings.filter((w) => w.code === "LESSON_NO_OBJECTIVES");
    expect(lessonWarnings).toHaveLength(2);
  });

  it("warns and defaults to 2 when difficulty is out of range", () => {
    const buf = makeWorkbook(FULL_HEADERS, [
      rowOf({
        Topic: "T",
        "Lesson No.": 1,
        "Lesson Title": "L1",
        "Sub-topic": "S",
        Objectives: "do a thing",
        Difficulty: 5,
      }),
    ]);
    const r = importSpec(buf, { idGen: counterIdGen() });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.warnings.some((w) => w.code === "DIFFICULTY_OUT_OF_RANGE")).toBe(true);
    expect(r.subject.importedSpec.topics[0]?.subTopics[0]?.difficulty).toBe(2);
  });

  it("warns when a sub-topic has more than 50 lessons", () => {
    const rows: unknown[][] = [];
    for (let i = 1; i <= 51; i++) {
      rows.push(rowOf({
        Topic: "T",
        "Lesson No.": i,
        "Lesson Title": `L${i}`,
        "Sub-topic": "S",
        Objectives: "x",
      }));
    }
    const buf = makeWorkbook(FULL_HEADERS, rows);
    const r = importSpec(buf, { idGen: counterIdGen() });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.warnings.some((w) => w.code === "SUBTOPIC_TOO_MANY_LESSONS")).toBe(true);
  });
});

describe("importSpec — merge behaviour for multi-row lessons", () => {
  it("concatenates objectives and OR-s flags across rows of the same lesson", () => {
    const buf = makeWorkbook(FULL_HEADERS, [
      rowOf({
        Topic: "T",
        "Lesson No.": 1,
        "Lesson Title": "L1",
        "Sub-topic": "S",
        Objectives: "obj A",
        "Extra-depth": "",
        "Separate science only?": "",
        Practical: "",
        Difficulty: 1,
      }),
      rowOf({
        Topic: "T",
        "Lesson No.": 1,
        "Lesson Title": "L1",
        "Sub-topic": "S",
        Objectives: "obj B; obj C",
        "Extra-depth": "yes",
        "Separate science only?": "yes",
        Practical: "CP9 Investigation",
        Difficulty: 3,
      }),
    ]);
    const r = importSpec(buf, { idGen: counterIdGen() });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const lesson = r.subject.importedSpec.topics[0]?.subTopics[0]?.lessons[0];
    expect(lesson?.objectives.map((o) => o.text)).toEqual(["obj A", "obj B", "obj C"]);
    expect(lesson?.isDepth).toBe(true);
    expect(lesson?.separateOnly).toBe(true);
    expect(lesson?.practical).toBe("CP9 Investigation");
    expect(r.subject.importedSpec.topics[0]?.subTopics[0]?.difficulty).toBe(3);
  });
});

describe("importSpec — header parsing", () => {
  it("matches headers case-insensitively and trims whitespace", () => {
    const buf = makeWorkbook(
      ["  TOPIC ", "Lesson NO.", "lesson title", "Sub-Topic", "OBJECTIVES"],
      [["A", 1, "X", "B", "do the thing"]]
    );
    const r = importSpec(buf, { idGen: counterIdGen() });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.subject.importedSpec.topics[0]?.name).toBe("A");
    expect(r.subject.importedSpec.topics[0]?.subTopics[0]?.name).toBe("B");
  });

  it("uses the sheet named 'Spec' even when other sheets exist", () => {
    const otherWs = XLSX.utils.aoa_to_sheet([["nonsense"]]);
    const specWs = XLSX.utils.aoa_to_sheet([
      [...FULL_HEADERS],
      ["T", 1, "L1", "S", "obj", "", 1, "", "", "", ""],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, otherWs, "Other");
    XLSX.utils.book_append_sheet(wb, specWs, "Spec");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;

    const r = importSpec(buf);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.subject.importedSpec.topics).toHaveLength(1);
  });

  it("falls back to the first sheet when no sheet is named 'Spec'", () => {
    const ws = XLSX.utils.aoa_to_sheet([
      [...FULL_HEADERS],
      ["T", 1, "L1", "S", "obj", "", 1, "", "", "", ""],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "MyFirstSheet");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;

    const r = importSpec(buf);
    expect(r.ok).toBe(true);
  });

  it("accepts depth flag values yes/y/1/✓/★ but rejects empty/no", () => {
    const buf = makeWorkbook(FULL_HEADERS, [
      rowOf({ Topic: "T", "Lesson No.": 1, "Lesson Title": "L1", "Sub-topic": "S1", Objectives: "x", "Extra-depth": "yes" }),
      rowOf({ Topic: "T", "Lesson No.": 1, "Lesson Title": "L1", "Sub-topic": "S2", Objectives: "x", "Extra-depth": "Y" }),
      rowOf({ Topic: "T", "Lesson No.": 1, "Lesson Title": "L1", "Sub-topic": "S3", Objectives: "x", "Extra-depth": 1 }),
      rowOf({ Topic: "T", "Lesson No.": 1, "Lesson Title": "L1", "Sub-topic": "S4", Objectives: "x", "Extra-depth": "✓" }),
      rowOf({ Topic: "T", "Lesson No.": 1, "Lesson Title": "L1", "Sub-topic": "S5", Objectives: "x", "Extra-depth": "★" }),
      rowOf({ Topic: "T", "Lesson No.": 1, "Lesson Title": "L1", "Sub-topic": "S6", Objectives: "x", "Extra-depth": "" }),
      rowOf({ Topic: "T", "Lesson No.": 1, "Lesson Title": "L1", "Sub-topic": "S7", Objectives: "x", "Extra-depth": "no" }),
    ]);
    const r = importSpec(buf, { idGen: counterIdGen() });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const subs = r.subject.importedSpec.topics[0]?.subTopics ?? [];
    expect(subs.map((s) => s.isDepth)).toEqual([true, true, true, true, true, false, false]);
  });
});

describe("importSpec — delimited text input (TSV / CSV)", () => {
  function textBuffer(s: string): ArrayBuffer {
    return new TextEncoder().encode(s).buffer as ArrayBuffer;
  }

  function csvField(v: unknown): string {
    const s = v === null || v === undefined ? "" : String(v);
    // Quote whenever the field contains a comma, quote, or newline.
    if (/[",\n]/.test(s)) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }

  function toTsv(headers: readonly string[], rows: readonly (readonly unknown[])[]): string {
    const lines = [headers.join("\t")];
    for (const r of rows) {
      lines.push(r.map((v) => (v === null || v === undefined ? "" : String(v))).join("\t"));
    }
    return lines.join("\n");
  }

  function toCsv(headers: readonly string[], rows: readonly (readonly unknown[])[]): string {
    const lines = [headers.map(csvField).join(",")];
    for (const r of rows) {
      lines.push(r.map(csvField).join(","));
    }
    return lines.join("\n");
  }

  it("imports a minimal TSV the same way as xlsx", () => {
    const rows = [
      rowOf({
        Topic: "Forces",
        "Lesson No.": 1,
        "Lesson Title": "Vectors and scalars",
        "Sub-topic": "Kinematics",
        Objectives: "Distinguish vectors and scalars",
        Difficulty: 1,
      }),
      rowOf({
        Topic: "Forces",
        "Lesson No.": 2,
        "Lesson Title": "Speed and velocity",
        "Sub-topic": "Kinematics",
        Objectives: "Calculate speed; calculate velocity",
        Difficulty: 2,
      }),
    ];
    const tsv = toTsv(FULL_HEADERS, rows);
    const r = importSpec(textBuffer(tsv), { idGen: counterIdGen() });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const topic = r.subject.importedSpec.topics[0];
    expect(topic?.name).toBe("Forces");
    const sub = topic?.subTopics[0];
    expect(sub?.name).toBe("Kinematics");
    expect(sub?.lessons).toHaveLength(2);
    // "Calculate speed; calculate velocity" splits on semicolons.
    expect(sub?.lessons[1]?.objectives.map((o) => o.text)).toEqual([
      "Calculate speed",
      "calculate velocity",
    ]);
  });

  it("imports CSV with quoted fields containing commas", () => {
    const rows = [
      rowOf({
        Topic: "Forces",
        "Lesson No.": 1,
        "Lesson Title": "Newton's first law",
        "Sub-topic": "Dynamics",
        // Quote the field so the embedded comma is preserved.
        Objectives: "State Newton's first law, including examples",
        Difficulty: 2,
      }),
    ];
    const csv = toCsv(FULL_HEADERS, rows);
    const r = importSpec(textBuffer(csv), { idGen: counterIdGen() });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const lesson = r.subject.importedSpec.topics[0]?.subTopics[0]?.lessons[0];
    expect(lesson?.title).toBe("Newton's first law");
    expect(lesson?.objectives.map((o) => o.text)).toEqual([
      "State Newton's first law, including examples",
    ]);
  });

  it("merges multi-row lessons in TSV the same way as xlsx", () => {
    const rows = [
      rowOf({
        Topic: "T",
        "Lesson No.": 1,
        "Lesson Title": "L1",
        "Sub-topic": "S",
        Objectives: "obj A",
      }),
      rowOf({
        Topic: "T",
        "Lesson No.": 1,
        "Lesson Title": "L1",
        "Sub-topic": "S",
        Objectives: "obj B",
        "Extra-depth": "yes",
      }),
    ];
    const r = importSpec(textBuffer(toTsv(FULL_HEADERS, rows)), { idGen: counterIdGen() });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const lesson = r.subject.importedSpec.topics[0]?.subTopics[0]?.lessons[0];
    expect(lesson?.objectives.map((o) => o.text)).toEqual(["obj A", "obj B"]);
    expect(lesson?.isDepth).toBe(true);
  });

  it("strips a leading UTF-8 BOM in TSV input", () => {
    const rows = [
      rowOf({
        Topic: "T",
        "Lesson No.": 1,
        "Lesson Title": "L1",
        "Sub-topic": "S",
        Objectives: "x",
      }),
    ];
    const tsvWithBom = "﻿" + toTsv(FULL_HEADERS, rows);
    const r = importSpec(textBuffer(tsvWithBom), { idGen: counterIdGen() });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.subject.importedSpec.topics[0]?.name).toBe("T");
  });

  it("rejects a TSV missing a required column", () => {
    // Drop "Sub-topic" from the header row.
    const partialHeaders = FULL_HEADERS.filter((h) => h !== "Sub-topic");
    const tsv = toTsv(partialHeaders, [
      partialHeaders.map((h) =>
        h === "Topic"
          ? "T"
          : h === "Lesson No."
          ? 1
          : h === "Lesson Title"
          ? "L1"
          : ""
      ),
    ]);
    const r = importSpec(textBuffer(tsv));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => e.code === "MISSING_COLUMN")).toBe(true);
  });
});
