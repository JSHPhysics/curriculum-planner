import * as XLSX from "xlsx";

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

export function computeCoverageStats(subject: Subject): CoverageStats {
  let totalSpecLessons = 0;
  for (const t of subject.workingSpec.topics) {
    for (const st of t.subTopics) totalSpecLessons += st.lessons.length;
  }

  let placedLessons = 0;
  const perYear = new Map<YearId, { placed: number; budget: number }>();
  for (const ht of subject.timeline.halfTerms) {
    const slot = perYear.get(ht.year) ?? { placed: 0, budget: 0 };
    slot.budget += ht.budget;
    for (const pb of ht.placedBlocks) {
      if (pb.source.kind !== "sub-topic") continue;
      slot.placed += pb.lessonsClaimed;
      placedLessons += pb.lessonsClaimed;
    }
    perYear.set(ht.year, slot);
  }

  const coveragePercent =
    totalSpecLessons === 0
      ? 0
      : Math.round((placedLessons / totalSpecLessons) * 1000) / 10;

  return { totalSpecLessons, placedLessons, coveragePercent, perYear };
}

function buildCoverSheet(subject: Subject, now: Date): unknown[][] {
  const stats = computeCoverageStats(subject);
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
  for (const year of ["Y9", "Y10", "Y11"] as const) {
    const slot = stats.perYear.get(year) ?? { placed: 0, budget: 0 };
    rows.push([year, slot.placed, slot.budget]);
  }
  return rows;
}

function buildTopicSheet(subject: Subject): unknown[][] {
  const rows: unknown[][] = [
    ["Year", "Half-term", "Topic code", "Topic name", "Lessons claimed", "Sub-topics included"],
  ];
  for (const ht of subject.timeline.halfTerms) {
    const byTopic = groupByTopic(ht, subject.workingSpec);
    for (const { topic, blocks } of byTopic) {
      const totalLessons = blocks.reduce((s, b) => s + b.lessonsClaimed, 0);
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
  for (const ht of subject.timeline.halfTerms) {
    for (const pb of ht.placedBlocks) {
      if (pb.source.kind !== "sub-topic") continue;
      const found = findTopicAndSubTopic(subject.workingSpec, pb.source.subTopicCode);
      if (!found) continue;
      const { topic, subTopic } = found;
      const sliced = sliceLessons(subTopic, pb);
      const practicals = uniquePracticals(sliced);
      rows.push([
        ht.year,
        ht.label,
        topic.code,
        subTopic.code,
        subTopic.name,
        pb.lessonsClaimed,
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
  for (const ht of subject.timeline.halfTerms) {
    for (const pb of ht.placedBlocks) {
      if (pb.source.kind !== "sub-topic") continue;
      const found = findTopicAndSubTopic(subject.workingSpec, pb.source.subTopicCode);
      if (!found) continue;
      const { topic, subTopic } = found;
      for (const lesson of sliceLessons(subTopic, pb)) {
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
  for (const ht of subject.timeline.halfTerms) {
    for (const pb of ht.placedBlocks) {
      if (pb.source.kind !== "sub-topic") continue;
      const found = findTopicAndSubTopic(subject.workingSpec, pb.source.subTopicCode);
      if (!found) continue;
      const { topic, subTopic } = found;
      for (const lesson of sliceLessons(subTopic, pb)) {
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

function sliceLessons(subTopic: SubTopic, placed: PlacedBlock) {
  const [start, end] = placed.lessonRange;
  const clampedStart = Math.max(0, Math.min(start, subTopic.lessons.length));
  const clampedEnd = Math.max(clampedStart, Math.min(end, subTopic.lessons.length));
  return subTopic.lessons.slice(clampedStart, clampedEnd);
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
