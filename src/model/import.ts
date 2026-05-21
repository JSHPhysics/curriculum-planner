import * as XLSX from "xlsx";

import type {
  ImportResult,
  Lesson,
  Objective,
  Spec,
  SubTopic,
  Subject,
  Topic,
  ValidationError,
  ValidationWarning,
} from "./types";
import { generateSubTopicCode, generateTopicCode } from "./codes";

const REQUIRED_HEADERS = ["topic", "lesson no.", "lesson title", "sub-topic"] as const;
type RequiredHeader = (typeof REQUIRED_HEADERS)[number];

const HEADER_OBJECTIVES = "objectives";
const HEADER_PRACTICAL = "practical";
const HEADER_DIFFICULTY = "difficulty";
const HEADER_DEPTH = "extra-depth";
const HEADER_SEPARATE = "separate science only?";
const HEADER_PAPER = "paper";
const HEADER_NOTES = "notes";

const DEFAULT_SUBJECT_NAME = "Imported Subject";
const DEFAULT_SUBJECT_COLOUR = "#1F3A5F";
const SUBTOPIC_LESSON_WARN_THRESHOLD = 50;

export interface ImportOptions {
  readonly sourceFilename?: string;
  readonly subjectName?: string;
  readonly subjectColour?: string;
  readonly idGen?: () => string;
}

export function importSpec(
  buffer: ArrayBuffer,
  options: ImportOptions = {}
): ImportResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  let wb: XLSX.WorkBook;
  try {
    wb = readWorkbook(buffer);
  } catch (e) {
    return {
      ok: false,
      errors: [
        {
          code: "PARSE_FAILED",
          message: `Could not parse workbook: ${(e as Error).message}`,
        },
      ],
      warnings: [],
    };
  }

  const sheetName = pickSheetName(wb.SheetNames);
  if (!sheetName) {
    return {
      ok: false,
      errors: [{ code: "NO_SHEETS", message: "Workbook has no sheets" }],
      warnings: [],
    };
  }
  const sheet = wb.Sheets[sheetName];
  if (!sheet) {
    return {
      ok: false,
      errors: [{ code: "NO_SHEET", message: `Sheet "${sheetName}" is missing` }],
      warnings: [],
    };
  }

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    blankrows: false,
    raw: true,
  });

  const headerRow = rows[0];
  if (!headerRow) {
    return {
      ok: false,
      errors: [{ code: "EMPTY_SHEET", message: "Sheet has no header row" }],
      warnings: [],
    };
  }

  const colIdx = new Map<string, number>();
  for (let i = 0; i < headerRow.length; i++) {
    const cell = headerRow[i];
    if (typeof cell === "string") {
      colIdx.set(cell.trim().toLowerCase(), i);
    }
  }

  for (const required of REQUIRED_HEADERS) {
    if (!colIdx.has(required)) {
      errors.push({
        code: "MISSING_COLUMN",
        message: `Missing required column "${prettyHeader(required)}"`,
      });
    }
  }
  if (errors.length > 0) {
    return { ok: false, errors, warnings };
  }

  const parsedRows = parseDataRows(rows, colIdx, errors, warnings);
  if (errors.length > 0) {
    return { ok: false, errors, warnings };
  }

  const grouped = groupRows(parsedRows);
  validateLessonTitleConsistency(grouped, errors);
  if (errors.length > 0) {
    return { ok: false, errors, warnings };
  }

  const idGen = options.idGen ?? defaultIdGen;
  const importedSpec = buildSpec(grouped, warnings, idGen);
  const workingSpec = cloneSpec(importedSpec);

  const subject: Subject = {
    id: idGen(),
    meta: {
      name: options.subjectName ?? DEFAULT_SUBJECT_NAME,
      colour: options.subjectColour ?? DEFAULT_SUBJECT_COLOUR,
      sourceFilename: options.sourceFilename ?? null,
    },
    importedSpec,
    workingSpec,
    timeline: { halfTerms: [] },
    customBlocks: [],
    config: {
      includeDepth: false,
      lostLessonBuffer: false,
    },
  };

  return { ok: true, subject, warnings };
}

// xlsx files are zip archives starting with PK\x03\x04. Anything else we treat
// as delimited text (TSV/CSV) and decode as UTF-8 so SheetJS can sniff the
// delimiter itself. Lets us accept .tsv / .csv without changing the downstream
// row-processing pipeline.
function readWorkbook(buffer: ArrayBuffer): XLSX.WorkBook {
  const bytes = new Uint8Array(buffer);
  const looksLikeZip =
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04;
  if (looksLikeZip) {
    return XLSX.read(buffer, { type: "array" });
  }
  const text = new TextDecoder("utf-8").decode(bytes);
  return XLSX.read(text, { type: "string" });
}

function pickSheetName(names: readonly string[]): string | null {
  if (names.includes("Spec")) return "Spec";
  return names[0] ?? null;
}

function prettyHeader(h: RequiredHeader): string {
  if (h === "lesson no.") return "Lesson No.";
  if (h === "sub-topic") return "Sub-topic";
  return h.charAt(0).toUpperCase() + h.slice(1);
}

interface RawRow {
  readonly topic: string;
  readonly subTopic: string;
  readonly lessonNo: number;
  readonly lessonTitle: string;
  readonly objectives: string;
  readonly practical: string;
  readonly difficulty: 1 | 2 | 3;
  readonly isDepth: boolean;
  readonly isSeparateOnly: boolean;
  readonly paper: string;
  readonly notes: string;
  readonly sheetRow: number;
}

function parseDataRows(
  rows: readonly unknown[][],
  colIdx: ReadonlyMap<string, number>,
  errors: ValidationError[],
  warnings: ValidationWarning[]
): RawRow[] {
  const out: RawRow[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const sheetRow = i + 1;

    const get = (col: string): unknown => {
      const idx = colIdx.get(col);
      if (idx === undefined) return null;
      const v = row[idx];
      return v === undefined ? null : v;
    };

    const topic = asString(get("topic"));
    const subTopic = asString(get("sub-topic"));
    const lessonTitle = asString(get("lesson title"));
    const lessonNoRaw = get("lesson no.");

    if (
      topic === "" &&
      subTopic === "" &&
      lessonTitle === "" &&
      (lessonNoRaw === null || lessonNoRaw === "")
    ) {
      continue;
    }

    let rowFailed = false;
    if (topic === "") {
      errors.push({
        code: "EMPTY_TOPIC",
        message: `Row ${sheetRow}: empty Topic`,
        row: sheetRow,
      });
      rowFailed = true;
    }
    if (subTopic === "") {
      errors.push({
        code: "EMPTY_SUBTOPIC",
        message: `Row ${sheetRow}: empty Sub-topic`,
        row: sheetRow,
      });
      rowFailed = true;
    }
    if (lessonTitle === "") {
      errors.push({
        code: "EMPTY_LESSON_TITLE",
        message: `Row ${sheetRow}: empty Lesson Title`,
        row: sheetRow,
      });
      rowFailed = true;
    }
    const lessonNo = parseLessonNo(lessonNoRaw);
    if (lessonNo === null) {
      errors.push({
        code: "BAD_LESSON_NO",
        message: `Row ${sheetRow}: Lesson No. is not a valid integer`,
        row: sheetRow,
      });
      rowFailed = true;
    }
    if (rowFailed || lessonNo === null) continue;

    const difficultyResult = parseDifficulty(get(HEADER_DIFFICULTY));
    if (!difficultyResult.valid) {
      warnings.push({
        code: "DIFFICULTY_OUT_OF_RANGE",
        message: `Row ${sheetRow}: Difficulty value outside 1–3 (treated as 2)`,
        row: sheetRow,
      });
    }

    out.push({
      topic,
      subTopic,
      lessonNo,
      lessonTitle,
      objectives: asString(get(HEADER_OBJECTIVES)),
      practical: asString(get(HEADER_PRACTICAL)),
      difficulty: difficultyResult.value,
      isDepth: parseFlag(get(HEADER_DEPTH)),
      isSeparateOnly: parseFlag(get(HEADER_SEPARATE)),
      paper: asString(get(HEADER_PAPER)),
      notes: asString(get(HEADER_NOTES)),
      sheetRow,
    });
  }

  return out;
}

interface LessonGroup {
  readonly rows: RawRow[];
}
interface SubTopicGroup {
  readonly rows: RawRow[];
  readonly lessons: Map<number, LessonGroup>;
}
interface TopicGroup {
  readonly rows: RawRow[];
  readonly subTopics: Map<string, SubTopicGroup>;
}

function groupRows(rows: readonly RawRow[]): Map<string, TopicGroup> {
  const topics = new Map<string, TopicGroup>();
  for (const r of rows) {
    let topicGroup = topics.get(r.topic);
    if (!topicGroup) {
      topicGroup = { rows: [], subTopics: new Map() };
      topics.set(r.topic, topicGroup);
    }
    topicGroup.rows.push(r);

    let subGroup = topicGroup.subTopics.get(r.subTopic);
    if (!subGroup) {
      subGroup = { rows: [], lessons: new Map() };
      topicGroup.subTopics.set(r.subTopic, subGroup);
    }
    subGroup.rows.push(r);

    let lessonGroup = subGroup.lessons.get(r.lessonNo);
    if (!lessonGroup) {
      lessonGroup = { rows: [] };
      subGroup.lessons.set(r.lessonNo, lessonGroup);
    }
    (lessonGroup.rows as RawRow[]).push(r);
  }
  return topics;
}

function validateLessonTitleConsistency(
  topics: ReadonlyMap<string, TopicGroup>,
  errors: ValidationError[]
): void {
  for (const [topicName, tg] of topics) {
    for (const [subTopicName, sg] of tg.subTopics) {
      for (const [lessonNo, lg] of sg.lessons) {
        if (lg.rows.length <= 1) continue;
        const distinct = new Set(
          lg.rows.map((r) => r.lessonTitle.trim().toLowerCase())
        );
        if (distinct.size > 1) {
          const rowList = lg.rows.map((r) => r.sheetRow).join(", ");
          errors.push({
            code: "DUPLICATE_LESSON_DIFFERENT_TITLES",
            message:
              `Topic "${topicName}", sub-topic "${subTopicName}", ` +
              `Lesson No. ${lessonNo}: multiple rows have different titles ` +
              `(rows ${rowList})`,
          });
        }
      }
    }
  }
}

function buildSpec(
  topicMap: ReadonlyMap<string, TopicGroup>,
  warnings: ValidationWarning[],
  idGen: () => string
): Spec {
  const topics: Topic[] = [];
  const usedTopicCodes: string[] = [];

  for (const [topicName, tg] of topicMap) {
    const topicCode = generateTopicCode(usedTopicCodes);
    usedTopicCodes.push(topicCode);

    const subTopics: SubTopic[] = [];
    const usedSubTopicCodes: string[] = [];

    for (const [subTopicName, sg] of tg.subTopics) {
      const subTopicCode = generateSubTopicCode(topicCode, usedSubTopicCodes);
      usedSubTopicCodes.push(subTopicCode);

      const lessons: Lesson[] = [];
      const subDifficulties = new Set<1 | 2 | 3>();
      // subIsDepth means "EVERY lesson in this sub-topic is a depth lesson"
      // (DEC-040). A sub-topic with even one foundation lesson is treated as
      // foundation; the `includeDepth=false` toggle filters individual depth
      // lessons (not whole sub-topics) at render/analytics/export time.
      // Start true and AND with each lesson — degenerates to true iff every
      // lesson is depth, false otherwise (incl. empty-lesson case below).
      let subIsDepth = sg.lessons.size > 0;
      let subIsSeparate = false;

      for (const [lessonNo, lg] of sg.lessons) {
        const merged = mergeLessonRows(lg.rows);
        for (const d of merged.difficulties) subDifficulties.add(d);
        subIsDepth = subIsDepth && merged.isDepth;
        subIsSeparate = subIsSeparate || merged.isSeparateOnly;

        const firstRow = lg.rows[0];
        const title = firstRow ? firstRow.lessonTitle : "";

        if (merged.objectives.length === 0) {
          warnings.push({
            code: "LESSON_NO_OBJECTIVES",
            message:
              `Topic "${topicName}", sub-topic "${subTopicName}", ` +
              `lesson ${lessonNo} ("${title}"): no objectives`,
          });
        }

        const objectives: Objective[] = merged.objectives.map((text) => ({
          id: idGen(),
          text,
          isDepth: merged.isDepth,
        }));

        lessons.push({
          id: idGen(),
          number: lessonNo,
          title,
          practical: merged.practical || null,
          isDepth: merged.isDepth,
          separateOnly: merged.isSeparateOnly,
          objectives,
        });
      }

      const subDifficulty = subDifficulties.size === 0
        ? 2
        : (Math.max(...subDifficulties) as 1 | 2 | 3);
      if (subDifficulties.size > 1) {
        const sorted = [...subDifficulties].sort();
        warnings.push({
          code: "SUBTOPIC_DIFFICULTY_VARIES",
          message:
            `Sub-topic "${subTopicName}" (in "${topicName}"): ` +
            `difficulty varies between rows (${sorted.join(", ")}); ` +
            `using max ${subDifficulty}`,
        });
      }

      const totalObjectives = lessons.reduce(
        (sum, l) => sum + l.objectives.length,
        0
      );
      if (totalObjectives === 0) {
        warnings.push({
          code: "SUBTOPIC_NO_OBJECTIVES",
          message:
            `Sub-topic "${subTopicName}" (in "${topicName}"): ` +
            `no objectives across any lesson`,
        });
      }

      if (lessons.length > SUBTOPIC_LESSON_WARN_THRESHOLD) {
        warnings.push({
          code: "SUBTOPIC_TOO_MANY_LESSONS",
          message:
            `Sub-topic "${subTopicName}" (in "${topicName}"): ` +
            `${lessons.length} lessons (more than ${SUBTOPIC_LESSON_WARN_THRESHOLD})`,
        });
      }

      const firstNotes = sg.rows.map((r) => r.notes).find((n) => n !== "") ?? "";

      subTopics.push({
        id: idGen(),
        code: subTopicCode,
        name: subTopicName,
        difficulty: subDifficulty,
        isDepth: subIsDepth,
        separateOnly: subIsSeparate,
        notes: firstNotes || null,
        lessons,
      });
    }

    const firstPaper = tg.rows.map((r) => r.paper).find((p) => p !== "") ?? "";

    topics.push({
      id: idGen(),
      code: topicCode,
      name: topicName,
      paper: firstPaper || null,
      subTopics,
    });
  }

  return { topics };
}

interface MergedLesson {
  readonly objectives: readonly string[];
  readonly practical: string;
  readonly isDepth: boolean;
  readonly isSeparateOnly: boolean;
  readonly difficulties: readonly (1 | 2 | 3)[];
}

function mergeLessonRows(rows: readonly RawRow[]): MergedLesson {
  const objectives: string[] = [];
  const practicalParts: string[] = [];
  const difficulties: (1 | 2 | 3)[] = [];
  let isDepth = false;
  let isSeparateOnly = false;

  for (const row of rows) {
    for (const obj of splitObjectives(row.objectives)) {
      objectives.push(obj);
    }
    if (row.practical !== "" && !practicalParts.includes(row.practical)) {
      practicalParts.push(row.practical);
    }
    if (!difficulties.includes(row.difficulty)) {
      difficulties.push(row.difficulty);
    }
    isDepth = isDepth || row.isDepth;
    isSeparateOnly = isSeparateOnly || row.isSeparateOnly;
  }

  return {
    objectives,
    practical: practicalParts.join("; "),
    isDepth,
    isSeparateOnly,
    difficulties,
  };
}

function splitObjectives(text: string): string[] {
  if (!text) return [];
  return text
    .split(/[\n;]+/)
    .map((o) => o.trim())
    .filter((o) => o.length > 0);
}

function asString(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "";
}

function parseLessonNo(v: unknown): number | null {
  if (typeof v === "number") {
    return Number.isInteger(v) ? v : null;
  }
  if (typeof v === "string") {
    const trimmed = v.trim();
    if (trimmed === "") return null;
    const n = Number(trimmed);
    return Number.isInteger(n) ? n : null;
  }
  return null;
}

function parseDifficulty(v: unknown): { value: 1 | 2 | 3; valid: boolean } {
  if (v === null || v === undefined || v === "") return { value: 2, valid: true };
  let n: number;
  if (typeof v === "number") n = v;
  else if (typeof v === "string") n = Number(v.trim());
  else n = Number.NaN;
  if (n === 1 || n === 2 || n === 3) return { value: n as 1 | 2 | 3, valid: true };
  return { value: 2, valid: false };
}

function parseFlag(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v === 1;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    return (
      s === "yes" ||
      s === "y" ||
      s === "1" ||
      s === "true" ||
      s === "✓" ||
      s === "★"
    );
  }
  return false;
}

function defaultIdGen(): string {
  return crypto.randomUUID();
}

function cloneSpec(spec: Spec): Spec {
  return JSON.parse(JSON.stringify(spec)) as Spec;
}
