import * as XLSX from "xlsx";

import {
  effectiveLessonCountForPlacement,
  effectiveLessonsInPlacement,
  effectiveSpecLessonCount,
} from "./depth";
import type {
  HalfTerm,
  PlacedBlock,
  Spec,
  SubTopic,
  Subject,
  Topic,
  YearId,
} from "./types";

export interface ExportOptions {
  readonly now?: Date;
}

export interface CoverageStats {
  readonly totalSpecLessons: number;
  readonly placedLessons: number;
  readonly coveragePercent: number;
  readonly perYear: ReadonlyMap<YearId, { placed: number; budget: number }>;
}

export function exportSubjectToXlsx(
  subject: Subject,
  options: ExportOptions = {}
): ArrayBuffer {
  const now = options.now ?? new Date();
  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(buildCoverSheet(subject, now)),
    "Cover"
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(buildTopicSheet(subject)),
    "Topic view"
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(buildSubTopicSheet(subject)),
    "Sub-topic view"
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(buildLessonSheet(subject)),
    "Lesson view"
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(buildObjectiveSheet(subject)),
    "Objective view"
  );

  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

export interface CoverageStatsOptions {
  /**
   * If true, placements in years the user has hidden via
   * `subject.config.hiddenYears` are excluded from `placedLessons`,
   * `coveragePercent`, and `perYear`. The Cover sheet defaults to this so
   * exports honour the user's visible-years filter (see DEC-036).
   */
  readonly respectHiddenYears?: boolean;
  /**
   * When true, custom-block placements (tests, retrieval blocks, bespoke
   * lessons …) count toward `perYear.placed`. They do NOT contribute to
   * `placedLessons` / `coveragePercent` — those measure *spec coverage*,
   * which by definition excludes off-spec items. Defaults to true so the
   * per-year header is honest about the actual lesson load in the cell
   * (DEC-053). The StatusBar toggle drives this; the export Cover sheet
   * passes false so coverage stays a sub-topic-only measure.
   */
  readonly includeCustomBlocksInPerYearPlaced?: boolean;
}

export function computeCoverageStats(
  subject: Subject,
  options: CoverageStatsOptions = {}
): CoverageStats {
  // Numerator + denominator both honour the depth toggle (DEC-040). When
  // `includeDepth=false`, "coverage" describes how much of the FOUNDATION
  // syllabus is placed — depth lessons are out of scope on both sides.
  const totalSpecLessons = effectiveSpecLessonCount(subject);

  const hidden = options.respectHiddenYears
    ? new Set(subject.config.hiddenYears ?? [])
    : new Set<YearId>();

  const includeCustoms = options.includeCustomBlocksInPerYearPlaced ?? true;

  let placedLessons = 0;
  const perYear = new Map<YearId, { placed: number; budget: number }>();
  for (const ht of subject.timeline.halfTerms) {
    if (hidden.has(ht.year)) continue;
    const slot = perYear.get(ht.year) ?? { placed: 0, budget: 0 };
    slot.budget += ht.budget;
    for (const pb of ht.placedBlocks) {
      if (pb.source.kind === "sub-topic") {
        const effective = effectiveLessonCountForPlacement(subject, pb);
        slot.placed += effective;
        placedLessons += effective; // spec-coverage counter
      } else if (includeCustoms) {
        // Customs (tests, retrieval, bespoke lessons) consume cell budget
        // but never count toward spec coverage. Add to perYear.placed only.
        slot.placed += pb.lessonsClaimed;
      }
    }
    perYear.set(ht.year, slot);
  }

  const coveragePercent =
    totalSpecLessons === 0
      ? 0
      : Math.round((placedLessons / totalSpecLessons) * 1000) / 10;

  return { totalSpecLessons, placedLessons, coveragePercent, perYear };
}

/**
 * Half-terms the export should include — skips any year the user has hidden.
 * All sheet builders use this so a single source of truth controls which
 * placements end up in the exported workbook.
 */
function visibleHalfTerms(subject: Subject): readonly HalfTerm[] {
  const hidden = new Set(subject.config.hiddenYears ?? []);
  return subject.timeline.halfTerms.filter((ht) => !hidden.has(ht.year));
}

function buildCoverSheet(subject: Subject, now: Date): unknown[][] {
  const stats = computeCoverageStats(subject, { respectHiddenYears: true });
  const rows: unknown[][] = [
    ["Curriculum plan export"],
    [],
    ["Subject name", subject.meta.name],
    ["Source spec file", subject.meta.sourceFilename ?? ""],
    ["Exported", now.toISOString()],
    [],
    ["Summary"],
    ["Total spec lessons", stats.totalSpecLessons],
    ["Lessons placed", stats.placedLessons],
    ["Coverage", `${stats.coveragePercent}%`],
    [],
    ["Per-year placement"],
    ["Year", "Lessons placed", "Total budget"],
  ];
  // Iterate years actually present in the subject's timeline, not a fixed
  // Y9/Y10/Y11 trio — supports schools that teach KS3, KS5, etc.
  for (const [year, slot] of stats.perYear) {
    rows.push([year, slot.placed, slot.budget]);
  }
  return rows;
}

function buildTopicSheet(subject: Subject): unknown[][] {
  const rows: unknown[][] = [
    ["Year", "Half-term", "Topic code", "Topic name", "Lessons claimed", "Sub-topics included"],
  ];
  for (const ht of visibleHalfTerms(subject)) {
    const byTopic = groupByTopic(ht, subject.workingSpec);
    for (const { topic, blocks } of byTopic) {
      // Effective lesson counts honour the depth toggle (DEC-040). Drop
      // topic rows whose every block was depth-only.
      const totalLessons = blocks.reduce(
        (s, b) => s + effectiveLessonCountForPlacement(subject, b),
        0
      );
      if (totalLessons === 0) continue;
      const subCodes = uniqueSubTopicCodes(blocks).join(", ");
      rows.push([
        ht.year,
        ht.label,
        topic.code,
        topic.name,
        totalLessons,
        subCodes,
      ]);
    }
  }
  return rows;
}

function buildSubTopicSheet(subject: Subject): unknown[][] {
  const rows: unknown[][] = [
    [
      "Year",
      "Half-term",
      "Topic code",
      "Sub-topic code",
      "Sub-topic name",
      "Lessons claimed",
      "Difficulty",
      "Depth?",
      "Practical(s)",
    ],
  ];
  for (const ht of visibleHalfTerms(subject)) {
    for (const pb of ht.placedBlocks) {
      if (pb.source.kind !== "sub-topic") continue;
      const found = findTopicAndSubTopic(subject.workingSpec, pb.source.subTopicCode);
      if (!found) continue;
      const { topic, subTopic } = found;
      // Effective slice — honours `includeDepth=false` by hiding depth lessons.
      const sliced = effectiveLessonsInPlacement(subject, pb);
      if (sliced.length === 0) continue; // Entire placement was depth — hide the row.
      const practicals = uniquePracticals(sliced);
      rows.push([
        ht.year,
        ht.label,
        topic.code,
        subTopic.code,
        subTopic.name,
        sliced.length,
        subTopic.difficulty,
        subTopic.isDepth ? "Yes" : "",
        practicals.join("; "),
      ]);
    }
  }
  return rows;
}

function buildLessonSheet(subject: Subject): unknown[][] {
  const rows: unknown[][] = [
    [
      "Year",
      "Half-term",
      "Topic",
      "Sub-topic",
      "Lesson No.",
      "Lesson Title",
      "Practical",
      "Depth?",
      "Separate only?",
    ],
  ];
  for (const ht of visibleHalfTerms(subject)) {
    for (const pb of ht.placedBlocks) {
      if (pb.source.kind !== "sub-topic") continue;
      const found = findTopicAndSubTopic(subject.workingSpec, pb.source.subTopicCode);
      if (!found) continue;
      const { topic, subTopic } = found;
      // Effective slice — depth lessons disappear from the row stream when
      // `includeDepth=false` (DEC-040).
      for (const lesson of effectiveLessonsInPlacement(subject, pb)) {
        rows.push([
          ht.year,
          ht.label,
          topic.code,
          subTopic.code,
          lesson.number,
          lesson.title,
          lesson.practical ?? "",
          lesson.isDepth ? "Yes" : "",
          lesson.separateOnly ? "Yes" : "",
        ]);
      }
    }
  }
  return rows;
}

function buildObjectiveSheet(subject: Subject): unknown[][] {
  const rows: unknown[][] = [
    [
      "Year",
      "Half-term",
      "Topic",
      "Sub-topic",
      "Lesson No.",
      "Lesson Title",
      "Objective text",
      "Depth?",
    ],
  ];
  for (const ht of visibleHalfTerms(subject)) {
    for (const pb of ht.placedBlocks) {
      if (pb.source.kind !== "sub-topic") continue;
      const found = findTopicAndSubTopic(subject.workingSpec, pb.source.subTopicCode);
      if (!found) continue;
      const { topic, subTopic } = found;
      for (const lesson of effectiveLessonsInPlacement(subject, pb)) {
        for (const obj of lesson.objectives) {
          rows.push([
            ht.year,
            ht.label,
            topic.code,
            subTopic.code,
            lesson.number,
            lesson.title,
            obj.text,
            obj.isDepth ? "Yes" : "",
          ]);
        }
      }
    }
  }
  return rows;
}

interface TopicGroup {
  readonly topic: Topic;
  readonly blocks: readonly PlacedBlock[];
}

function groupByTopic(halfTerm: HalfTerm, spec: Spec): TopicGroup[] {
  const map = new Map<string, { topic: Topic; blocks: PlacedBlock[] }>();
  for (const pb of halfTerm.placedBlocks) {
    if (pb.source.kind !== "sub-topic") continue;
    const found = findTopicAndSubTopic(spec, pb.source.subTopicCode);
    if (!found) continue;
    const entry = map.get(found.topic.code);
    if (entry) {
      entry.blocks.push(pb);
    } else {
      map.set(found.topic.code, { topic: found.topic, blocks: [pb] });
    }
  }
  return [...map.values()];
}

function uniqueSubTopicCodes(blocks: readonly PlacedBlock[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const b of blocks) {
    if (b.source.kind !== "sub-topic") continue;
    if (seen.has(b.source.subTopicCode)) continue;
    seen.add(b.source.subTopicCode);
    out.push(b.source.subTopicCode);
  }
  return out;
}

function uniquePracticals(lessons: readonly { practical: string | null }[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const l of lessons) {
    if (l.practical && !seen.has(l.practical)) {
      seen.add(l.practical);
      out.push(l.practical);
    }
  }
  return out;
}

function findTopicAndSubTopic(
  spec: Spec,
  subTopicCode: string
): { topic: Topic; subTopic: SubTopic } | null {
  for (const topic of spec.topics) {
    const subTopic = topic.subTopics.find((st) => st.code === subTopicCode);
    if (subTopic) return { topic, subTopic };
  }
  return null;
}
