import * as XLSX from "xlsx";

import { findTopicAndSubTopic } from "./queries";
import type {
  CalendarHalfTerm,
  HalfTerm,
  Lesson,
  PlacedBlock,
  SubTopic,
  Subject,
  Topic,
  YearId,
} from "./types";

/**
 * Two "folder export" formats that complement the existing single-workbook
 * `exportSubjectToXlsx` (in `./export.ts`). Both produce a MAP of filename →
 * `.xlsx` buffer; the IPC layer (`window.api.saveFolderOfXlsx`) takes the map
 * and writes every file into a folder the user picks.
 *
 *   - `exportByHalfTermFolder` — one workbook per visible half-term. Each
 *     workbook has TWO sheets: a compact "Weekly schedule" (row = week of
 *     the half-term, columns = lessons taught that week) and a long-form
 *     "Lesson list" (row = lesson, with week-number, sub-topic, objectives).
 *     Best for "hand this to a colleague covering the half-term".
 *
 *   - `exportByTopicFolder` — one workbook per topic. Each workbook has a
 *     single sheet listing every placed lesson for that topic in calendar
 *     order, with year/half-term/week, sub-topic, objectives, practical.
 *     Best for "show me the spread of the forces topic across the timeline".
 *
 * Both formats:
 *   - Honour `subject.config.hiddenYears` — placements in hidden years are
 *     skipped (consistent with the single-workbook exporter and DEC-036).
 *   - Skip EoHT and custom-block placements (these aren't part of the spec
 *     curriculum; they're scaffolding). Could be revisited if a teacher
 *     wants EoHTs in the weekly schedule.
 *   - Are pure functions; the IPC roundtrip is the responsibility of the
 *     caller. Tests don't touch Electron at all.
 *
 * Filenames are safe-cased to avoid OS pathing surprises: half-terms become
 * "Y9-A1.xlsx" / "Y10-S2.xlsx" (the canonical HalfTerm id); topics become
 * "T1 — Forces.xlsx" with any reserved characters replaced. The caller can
 * override the suggested folder name (passed to the IPC layer).
 */

export interface FolderExportFile {
  readonly name: string;
  readonly buffer: Uint8Array;
}

export interface FolderExportResult {
  readonly suggestedFolderName: string;
  readonly files: readonly FolderExportFile[];
}

export interface FolderExportOptions {
  /** Override the now-timestamp shown in workbook footers (tests). */
  readonly now?: Date;
}

// ============================================================
// Public surface
// ============================================================

export function exportByHalfTermFolder(
  subject: Subject,
  options: FolderExportOptions = {}
): FolderExportResult {
  const now = options.now ?? new Date();
  const cells = visibleHalfTerms(subject);
  const files: FolderExportFile[] = [];
  for (const ht of cells) {
    const buffer = buildHalfTermWorkbook(subject, ht, now);
    files.push({
      name: `${safeFileSegment(ht.id)}.xlsx`,
      buffer,
    });
  }
  return {
    suggestedFolderName: `${safeFolderSegment(subject.meta.name)} — by half-term`,
    files,
  };
}

export function exportByTopicFolder(
  subject: Subject,
  options: FolderExportOptions = {}
): FolderExportResult {
  const now = options.now ?? new Date();
  const grouped = groupPlacementsByTopic(subject);
  const files: FolderExportFile[] = [];
  let order = 1;
  // Emit in spec topic order so file names sort naturally in the OS file browser.
  for (const topic of subject.workingSpec.topics) {
    const placements = grouped.get(topic.code) ?? [];
    if (placements.length === 0) continue;
    const buffer = buildTopicWorkbook(subject, topic, placements, now);
    files.push({
      name: `${String(order).padStart(2, "0")} — ${safeFileSegment(topic.code)} — ${safeFileSegment(topic.name)}.xlsx`,
      buffer,
    });
    order++;
  }
  return {
    suggestedFolderName: `${safeFolderSegment(subject.meta.name)} — by topic`,
    files,
  };
}

// ============================================================
// Per-half-term workbook (2 sheets)
// ============================================================

function buildHalfTermWorkbook(subject: Subject, ht: HalfTerm, now: Date): Uint8Array {
  const wb = XLSX.utils.book_new();
  const weeks = halfTermWeeks(subject, ht);
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(buildWeeklyScheduleSheet(subject, ht, weeks, now)),
    "Weekly schedule"
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(buildLessonListSheet(subject, ht, weeks)),
    "Lesson list"
  );
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as Uint8Array;
}

/**
 * Resolve the number of weeks in a half-term by looking up its CalendarHalfTerm
 * entry on the subject's per-subject template (preferred) or the workspace
 * template (next), falling back to a reasonable default of 6 weeks. Used to
 * pace the weekly schedule.
 */
function halfTermWeeks(subject: Subject, ht: HalfTerm): number {
  const local = subject.calendarTemplate?.halfTerms.find((c) => c.id === ht.id);
  if (local) return local.weeks;
  // No workspace-template lookup here — the model layer shouldn't reach
  // across subjects. Calling code that wants workspace fallbacks can pass
  // an enriched Subject. 6 is a sane half-term default for UK schools.
  return 6;
}

interface LessonWithMeta {
  readonly subjectLessonNumber: number; // 1-indexed within the half-term
  readonly weekIndex: number; // 1-indexed week within the half-term
  readonly topic: Topic;
  readonly subTopic: SubTopic;
  readonly lesson: Lesson;
}

/**
 * Linearise the half-term's placed sub-topic lessons in cell-order, attaching
 * a week index. Strategy: walk each PlacedBlock in order; for each block,
 * walk its lesson slice; assign each lesson the next sequential
 * `subjectLessonNumber`, then map to a week via `ceil(N / lessonsPerWeek)`.
 */
function lessonsInHalfTerm(
  subject: Subject,
  ht: HalfTerm,
  weeks: number
): LessonWithMeta[] {
  const out: LessonWithMeta[] = [];
  // Sub-topic placements only; EoHTs and customs are scaffolding, not spec content.
  const placements = ht.placedBlocks.filter((pb) => pb.source.kind === "sub-topic");
  const totalLessons = placements.reduce((s, pb) => s + pb.lessonsClaimed, 0);
  // Lessons-per-week is fractional; rounding so an "8 lessons over 6 weeks" HT
  // distributes as 2/1/2/1/2/0 isn't useful. We use ceil so the early weeks fill
  // first; trailing weeks empty out gracefully.
  const lessonsPerWeek = weeks > 0 ? Math.max(1, Math.ceil(totalLessons / weeks)) : totalLessons;
  let lessonNo = 0;
  for (const pb of placements) {
    if (pb.source.kind !== "sub-topic") continue;
    const found = findTopicAndSubTopic(subject.workingSpec, pb.source.subTopicCode);
    if (!found) continue;
    const slice = sliceLessons(found.subTopic, pb);
    for (const lesson of slice) {
      lessonNo++;
      const weekIndex = Math.min(weeks, Math.ceil(lessonNo / lessonsPerWeek));
      out.push({
        subjectLessonNumber: lessonNo,
        weekIndex,
        topic: found.topic,
        subTopic: found.subTopic,
        lesson,
      });
    }
  }
  return out;
}

function buildWeeklyScheduleSheet(
  subject: Subject,
  ht: HalfTerm,
  weeks: number,
  now: Date
): unknown[][] {
  const rows: unknown[][] = [
    [`${subject.meta.name} — ${ht.year} ${ht.label}`],
    [
      ht.dates ?? "",
      `${weeks} week${weeks === 1 ? "" : "s"}`,
      `Exported ${now.toISOString()}`,
    ],
    [],
    ["Week", "Topic", "Sub-topic", "Lesson", "Practical", "Objectives"],
  ];
  const lessons = lessonsInHalfTerm(subject, ht, weeks);
  for (let w = 1; w <= weeks; w++) {
    const wlessons = lessons.filter((l) => l.weekIndex === w);
    if (wlessons.length === 0) {
      rows.push([`Week ${w}`, "", "", "(no lessons placed)", "", ""]);
      continue;
    }
    let first = true;
    for (const l of wlessons) {
      rows.push([
        first ? `Week ${w}` : "",
        first ? l.topic.code : l.topic.code,
        l.subTopic.code,
        l.lesson.title,
        l.lesson.practical ?? "",
        l.lesson.objectives.map((o) => `• ${o.text}`).join("\n"),
      ]);
      first = false;
    }
  }
  return rows;
}

function buildLessonListSheet(
  subject: Subject,
  ht: HalfTerm,
  weeks: number
): unknown[][] {
  const rows: unknown[][] = [
    [
      "Week",
      "Lesson #",
      "Topic code",
      "Topic name",
      "Sub-topic code",
      "Sub-topic name",
      "Lesson title",
      "Practical",
      "Depth?",
      "Separate only?",
      "Objectives",
    ],
  ];
  const lessons = lessonsInHalfTerm(subject, ht, weeks);
  for (const l of lessons) {
    rows.push([
      l.weekIndex,
      l.subjectLessonNumber,
      l.topic.code,
      l.topic.name,
      l.subTopic.code,
      l.subTopic.name,
      l.lesson.title,
      l.lesson.practical ?? "",
      l.lesson.isDepth ? "Yes" : "",
      l.lesson.separateOnly ? "Yes" : "",
      l.lesson.objectives.map((o) => o.text).join("\n"),
    ]);
  }
  return rows;
}

// ============================================================
// Per-topic workbook (1 sheet)
// ============================================================

interface TopicPlacement {
  readonly ht: HalfTerm;
  readonly htIndex: number;
  readonly pb: PlacedBlock;
}

function groupPlacementsByTopic(subject: Subject): Map<string, TopicPlacement[]> {
  const map = new Map<string, TopicPlacement[]>();
  let idx = 0;
  for (const ht of visibleHalfTerms(subject)) {
    for (const pb of ht.placedBlocks) {
      if (pb.source.kind !== "sub-topic") continue;
      const found = findTopicAndSubTopic(subject.workingSpec, pb.source.subTopicCode);
      if (!found) continue;
      const entry = map.get(found.topic.code) ?? [];
      entry.push({ ht, htIndex: idx, pb });
      map.set(found.topic.code, entry);
    }
    idx++;
  }
  return map;
}

function buildTopicWorkbook(
  subject: Subject,
  topic: Topic,
  placements: readonly TopicPlacement[],
  now: Date
): Uint8Array {
  const wb = XLSX.utils.book_new();
  const rows: unknown[][] = [
    [`${subject.meta.name} — ${topic.code} ${topic.name}`],
    [
      `${placements.length} placement${placements.length === 1 ? "" : "s"} across ${distinctHalfTerms(placements)} half-term${distinctHalfTerms(placements) === 1 ? "" : "s"}`,
      `Exported ${now.toISOString()}`,
    ],
    [],
    [
      "Year",
      "Half-term",
      "Dates",
      "Sub-topic code",
      "Sub-topic name",
      "Lesson title",
      "Practical",
      "Depth?",
      "Separate only?",
      "Objectives",
    ],
  ];
  for (const placement of placements) {
    const found = findTopicAndSubTopic(
      subject.workingSpec,
      placement.pb.source.kind === "sub-topic" ? placement.pb.source.subTopicCode : ""
    );
    if (!found) continue;
    const slice = sliceLessons(found.subTopic, placement.pb);
    for (const lesson of slice) {
      rows.push([
        placement.ht.year,
        placement.ht.label,
        placement.ht.dates ?? "",
        found.subTopic.code,
        found.subTopic.name,
        lesson.title,
        lesson.practical ?? "",
        lesson.isDepth ? "Yes" : "",
        lesson.separateOnly ? "Yes" : "",
        lesson.objectives.map((o) => o.text).join("\n"),
      ]);
    }
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), `${topic.code} lessons`);
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as Uint8Array;
}

function distinctHalfTerms(placements: readonly TopicPlacement[]): number {
  return new Set(placements.map((p) => p.ht.id)).size;
}

// ============================================================
// Helpers (mirror export.ts — kept private to avoid coupling)
// ============================================================

function visibleHalfTerms(subject: Subject): readonly HalfTerm[] {
  const hidden = new Set<YearId>(subject.config.hiddenYears ?? []);
  return subject.timeline.halfTerms.filter((ht) => !hidden.has(ht.year));
}

function sliceLessons(subTopic: SubTopic, placed: PlacedBlock): readonly Lesson[] {
  const [start, end] = placed.lessonRange;
  const clampedStart = Math.max(0, Math.min(start, subTopic.lessons.length));
  const clampedEnd = Math.max(clampedStart, Math.min(end, subTopic.lessons.length));
  return subTopic.lessons.slice(clampedStart, clampedEnd);
}

// Filename-safe: strip characters that Windows/macOS file systems object to,
// collapse whitespace, trim. Preserves leading "T1" style codes verbatim.
function safeFileSegment(s: string): string {
  return s
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Folder name — same rules but also trims trailing dots (Windows rejects those).
function safeFolderSegment(s: string): string {
  return safeFileSegment(s).replace(/\.+$/, "");
}

// Re-exports for test introspection.
/** @internal */
export const __internal = {
  lessonsInHalfTerm,
  halfTermWeeks,
  safeFileSegment,
  safeFolderSegment,
};

// Re-export CalendarHalfTerm shape for callers that want it (none currently).
export type { CalendarHalfTerm };
