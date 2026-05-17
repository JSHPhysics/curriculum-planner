import JSZip from "jszip";

import { effectiveLessonsInPlacement } from "./depth";
import { findTopicAndSubTopic } from "./queries";
import type {
  HalfTerm,
  Lesson,
  PlacedBlock,
  SubTopic,
  Subject,
  Topic,
  YearId,
} from "./types";

/**
 * Folder-structure export (DEC-045). Produces a nested folder tree mirroring
 * the curriculum hierarchy so teachers have pre-built slots for their
 * lesson resources (worksheets, slides, video links, etc.). Two top-level
 * groupings:
 *
 *   - by half-term: `<subject>/<HT>/<topic>/<sub-topic>/<lesson>/_lesson-info.txt`
 *   - by topic:     `<subject>/<topic>/<sub-topic>/<lesson>/_lesson-info.txt`
 *
 * Per DEC-045, every leaf-level lesson folder contains a `_lesson-info.txt`
 * with the lesson's metadata (title, week, sub-topic, topic, objectives,
 * practical, depth/separate flags). Naming uses the spec's human-readable
 * names with only path-safety scrubbing — no code or numerical prefixes.
 *
 * The `xlsx` single-workbook export (in `./export.ts`) is the right tool for
 * "a snapshot of the curriculum in one file"; this folder structure is the
 * right tool for "set up the resource library for next year's teaching".
 *
 * Both formats honour `subject.config.hiddenYears` (skip placements in hidden
 * years) and the includeDepth toggle (depth-only placements drop out when
 * toggle is off). Custom blocks (tests/assessments/retrieval/etc.) are
 * included alongside sub-topic placements at the leaf level when they fall
 * in the relevant half-term/topic — each gets its own folder + info file.
 */

// ============================================================
// Public types
// ============================================================

/**
 * One entry in the export tree. `path` is relative to the suggested root
 * (forward slashes; the IPC layer translates to OS separators). `content`
 * absent = folder marker; present = a file with that content.
 */
export interface FolderTreeEntry {
  readonly path: string;
  /** Absent → folder marker. Present → text/binary file content. */
  readonly content?: Uint8Array;
}

export interface FolderTreeExport {
  /** Suggested name of the root folder (the user can override at save time). */
  readonly suggestedRootName: string;
  readonly entries: readonly FolderTreeEntry[];
}

export interface ZipBundleResult {
  readonly suggestedFilename: string;
  readonly buffer: Uint8Array;
}

export type FolderRootBy = "half-term" | "topic";

export interface FolderExportOptions {
  readonly now?: Date;
}

// ============================================================
// Public API
// ============================================================

/**
 * Build a folder-tree export of the subject's placed curriculum. The tree
 * structure depends on `rootBy`:
 *
 *   - "half-term": `<subject>/<Y9 Aut 1>/<Forces>/<Kinematics>/<Distance>/...`
 *     Each HT folder contains the topics taught in that HT (only topics with
 *     placements appear). Sub-topics in turn contain the lessons placed in
 *     THAT HT (not all of the sub-topic's lessons — only what's scheduled).
 *
 *   - "topic": `<subject>/<Forces>/<Kinematics>/<Distance>/...`
 *     Topic-rooted; lessons appear under their sub-topic regardless of when
 *     they're scheduled. Calendar position is captured in the leaf info file.
 *
 * Custom blocks (tests, assessments, retrieval blocks, etc.) appear at the
 * leaf level alongside lesson folders, with their `name` as the folder name
 * and an info file noting the category + label + revisits.
 */
export function exportFolderStructure(
  subject: Subject,
  rootBy: FolderRootBy,
  options: FolderExportOptions = {}
): FolderTreeExport {
  const now = options.now ?? new Date();
  const subjectName = safe(subject.meta.name);
  const suggestedRootName = `${subjectName} — by ${rootBy === "half-term" ? "half-term" : "topic"}`;
  const entries: FolderTreeEntry[] = [];

  // Always emit the root folder itself as a marker so the tree exists even
  // when nothing's placed.
  entries.push({ path: "" });

  if (rootBy === "half-term") {
    buildByHalfTerm(subject, entries, now);
  } else {
    buildByTopic(subject, entries, now);
  }

  return { suggestedRootName, entries };
}

/**
 * Pack a folder tree into a single .zip. Each entry's `path` becomes its
 * archive entry path; entries with no `content` are added as empty
 * directories.
 */
export async function packTreeAsZip(tree: FolderTreeExport): Promise<ZipBundleResult> {
  const zip = new JSZip();
  for (const entry of tree.entries) {
    if (entry.path === "") continue; // root marker — not needed inside the zip
    if (entry.content === undefined) {
      // Folder marker — JSZip's folder() registers an empty directory.
      zip.folder(entry.path);
    } else {
      zip.file(entry.path, entry.content);
    }
  }
  const buffer = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  return {
    suggestedFilename: `${tree.suggestedRootName}.zip`,
    buffer,
  };
}

// ============================================================
// by-half-term builder
// ============================================================

function buildByHalfTerm(subject: Subject, out: FolderTreeEntry[], now: Date): void {
  const visibleCells = visibleHalfTerms(subject);
  for (const ht of visibleCells) {
    const htFolder = `${ht.year} ${ht.label}`;
    out.push({ path: safe(htFolder) });

    // Group placements in this HT by topic so we get a topic folder per HT.
    const topicGroups = new Map<string, { topic: Topic; placements: PlacedBlock[] }>();
    const customsInHt: PlacedBlock[] = [];
    for (const pb of ht.placedBlocks) {
      if (pb.source.kind === "sub-topic") {
        const found = findTopicAndSubTopic(subject.workingSpec, pb.source.subTopicCode);
        if (!found) continue;
        const eff = effectiveLessonsInPlacement(subject, pb);
        if (eff.length === 0) continue; // depth-only placement, toggle off
        const entry = topicGroups.get(found.topic.code) ?? {
          topic: found.topic,
          placements: [],
        };
        entry.placements.push(pb);
        topicGroups.set(found.topic.code, entry);
      } else if (pb.source.kind === "custom") {
        customsInHt.push(pb);
      }
      // legacy eoht source skipped (DEC-044)
    }

    for (const { topic, placements } of topicGroups.values()) {
      const topicPath = `${safe(htFolder)}/${safe(topic.name)}`;
      out.push({ path: topicPath });
      buildSubTopicFolders(subject, ht, placements, topicPath, out);
    }

    // Custom blocks as leaf folders directly under the HT
    for (const pb of customsInHt) {
      buildCustomFolder(subject, ht, pb, safe(htFolder), out, now);
    }
  }
}

function buildSubTopicFolders(
  subject: Subject,
  ht: HalfTerm,
  placements: readonly PlacedBlock[],
  parentPath: string,
  out: FolderTreeEntry[]
): void {
  const subTopicGroups = new Map<string, { subTopic: SubTopic; topic: Topic; placements: PlacedBlock[] }>();
  for (const pb of placements) {
    if (pb.source.kind !== "sub-topic") continue;
    const found = findTopicAndSubTopic(subject.workingSpec, pb.source.subTopicCode);
    if (!found) continue;
    const entry = subTopicGroups.get(found.subTopic.code) ?? {
      subTopic: found.subTopic,
      topic: found.topic,
      placements: [],
    };
    entry.placements.push(pb);
    subTopicGroups.set(found.subTopic.code, entry);
  }
  for (const { subTopic, topic, placements: subPlacements } of subTopicGroups.values()) {
    const subPath = `${parentPath}/${safe(subTopic.name)}`;
    out.push({ path: subPath });

    // For each placement of this sub-topic in this HT, emit a folder per
    // effective lesson (depth-filtered per DEC-040).
    for (const pb of subPlacements) {
      const lessons = effectiveLessonsInPlacement(subject, pb);
      for (const lesson of lessons) {
        const lessonPath = `${subPath}/${safe(lesson.title || `Lesson ${lesson.number}`)}`;
        out.push({ path: lessonPath });
        out.push({
          path: `${lessonPath}/_lesson-info.txt`,
          content: textBytes(
            renderLessonInfo({
              lesson,
              subTopic,
              topic,
              halfTerm: ht,
            })
          ),
        });
      }
    }
  }
}

function buildCustomFolder(
  subject: Subject,
  ht: HalfTerm,
  pb: PlacedBlock,
  parentPath: string,
  out: FolderTreeEntry[],
  now: Date
): void {
  if (pb.source.kind !== "custom") return;
  const customId = pb.source.customBlockId;
  const cb = subject.customBlocks.find((c) => c.id === customId);
  if (!cb) return;
  const folder = `${parentPath}/${safe(cb.name || "Custom block")}`;
  out.push({ path: folder });
  out.push({
    path: `${folder}/_lesson-info.txt`,
    content: textBytes(renderCustomInfo({ customBlock: cb, halfTerm: ht, placement: pb, now })),
  });
}

// ============================================================
// by-topic builder
// ============================================================

function buildByTopic(subject: Subject, out: FolderTreeEntry[], now: Date): void {
  // Collect, in spec topic order, only topics that have placements.
  const placementsByTopic = new Map<string, { topic: Topic; entries: TopicPlacement[] }>();
  for (const ht of visibleHalfTerms(subject)) {
    for (const pb of ht.placedBlocks) {
      if (pb.source.kind !== "sub-topic") continue;
      const found = findTopicAndSubTopic(subject.workingSpec, pb.source.subTopicCode);
      if (!found) continue;
      const eff = effectiveLessonsInPlacement(subject, pb);
      if (eff.length === 0) continue;
      const entry = placementsByTopic.get(found.topic.code) ?? {
        topic: found.topic,
        entries: [],
      };
      entry.entries.push({ ht, placement: pb, subTopic: found.subTopic });
      placementsByTopic.set(found.topic.code, entry);
    }
  }

  // Emit in spec topic order (not insertion order).
  for (const topic of subject.workingSpec.topics) {
    const entry = placementsByTopic.get(topic.code);
    if (!entry || entry.entries.length === 0) continue;
    const topicPath = safe(topic.name);
    out.push({ path: topicPath });

    // Group by sub-topic within this topic; sub-topics in spec order.
    const subTopicGroups = new Map<string, TopicPlacement[]>();
    for (const e of entry.entries) {
      const arr = subTopicGroups.get(e.subTopic.code) ?? [];
      arr.push(e);
      subTopicGroups.set(e.subTopic.code, arr);
    }
    for (const subTopic of topic.subTopics) {
      const subEntries = subTopicGroups.get(subTopic.code);
      if (!subEntries || subEntries.length === 0) continue;
      const subPath = `${topicPath}/${safe(subTopic.name)}`;
      out.push({ path: subPath });

      // Emit one folder per effective lesson per placement, in calendar order.
      const ordered = [...subEntries].sort((a, b) => {
        const aIdx = subject.timeline.halfTerms.findIndex((h) => h.id === a.ht.id);
        const bIdx = subject.timeline.halfTerms.findIndex((h) => h.id === b.ht.id);
        return aIdx - bIdx;
      });
      for (const e of ordered) {
        const lessons = effectiveLessonsInPlacement(subject, e.placement);
        for (const lesson of lessons) {
          const lessonPath = `${subPath}/${safe(lesson.title || `Lesson ${lesson.number}`)}`;
          out.push({ path: lessonPath });
          out.push({
            path: `${lessonPath}/_lesson-info.txt`,
            content: textBytes(
              renderLessonInfo({ lesson, subTopic, topic, halfTerm: e.ht })
            ),
          });
        }
      }
    }
  }

  // Custom blocks — by-topic mode collects all of them under a single
  // "Other blocks" folder at the root, since they don't belong to a topic.
  // Avoids littering the topic-rooted tree with non-spec content.
  const allCustoms: { ht: HalfTerm; pb: PlacedBlock }[] = [];
  for (const ht of visibleHalfTerms(subject)) {
    for (const pb of ht.placedBlocks) {
      if (pb.source.kind === "custom") allCustoms.push({ ht, pb });
    }
  }
  if (allCustoms.length > 0) {
    const customRoot = "Other blocks";
    out.push({ path: customRoot });
    for (const { ht, pb } of allCustoms) {
      buildCustomFolder(subject, ht, pb, customRoot, out, now);
    }
  }
}

interface TopicPlacement {
  readonly ht: HalfTerm;
  readonly placement: PlacedBlock;
  readonly subTopic: SubTopic;
}

// ============================================================
// _lesson-info.txt rendering
// ============================================================

interface LessonInfoArgs {
  readonly lesson: Lesson;
  readonly subTopic: SubTopic;
  readonly topic: Topic;
  readonly halfTerm: HalfTerm;
}

function renderLessonInfo({ lesson, subTopic, topic, halfTerm }: LessonInfoArgs): string {
  const lines: string[] = [];
  lines.push(`Lesson:       ${lesson.title || `Lesson ${lesson.number}`}`);
  lines.push(`Lesson No.:   ${lesson.number}`);
  lines.push(`Topic:        ${topic.code} · ${topic.name}`);
  lines.push(`Sub-topic:    ${subTopic.code} · ${subTopic.name}`);
  lines.push(`Half-term:    ${halfTerm.year} ${halfTerm.label}`);
  if (halfTerm.dates) lines.push(`Dates:        ${halfTerm.dates}`);
  if (lesson.practical) lines.push(`Practical:    ${lesson.practical}`);
  if (lesson.isDepth) lines.push(`Depth:        yes`);
  if (lesson.separateOnly) lines.push(`Triple-only:  yes`);
  if (lesson.objectives.length > 0) {
    lines.push("");
    lines.push("Objectives:");
    for (const obj of lesson.objectives) {
      const prefix = obj.isDepth ? "  • [depth] " : "  • ";
      lines.push(`${prefix}${obj.text}`);
    }
  }
  lines.push("");
  lines.push("---");
  lines.push("Drop your resources for this lesson into this folder.");
  lines.push("Generated by Curriculum Planner; safe to delete this file.");
  lines.push("");
  return lines.join("\n");
}

interface CustomInfoArgs {
  readonly customBlock: import("./types").CustomBlock;
  readonly halfTerm: HalfTerm;
  readonly placement: PlacedBlock;
  readonly now: Date;
}

function renderCustomInfo({
  customBlock,
  halfTerm,
  placement,
}: CustomInfoArgs): string {
  const category = customBlock.category ?? (customBlock.kind === "retrieval" ? "retrieval" : "other");
  const lines: string[] = [];
  lines.push(`Custom block: ${customBlock.name}`);
  if (customBlock.label) lines.push(`Label:        ${customBlock.label}`);
  lines.push(`Category:     ${category}`);
  lines.push(`Half-term:    ${halfTerm.year} ${halfTerm.label}`);
  if (halfTerm.dates) lines.push(`Dates:        ${halfTerm.dates}`);
  lines.push(`Lessons:      ${placement.lessonsClaimed}`);
  if (customBlock.isEoHT) lines.push(`End-of-HT:    yes (auto-seeded test block)`);
  if (customBlock.revisits && customBlock.revisits.length > 0) {
    lines.push("");
    lines.push(`Revisits:`);
    for (const code of customBlock.revisits) lines.push(`  • ${code}`);
  }
  lines.push("");
  lines.push("---");
  lines.push("Drop your resources for this block into this folder.");
  lines.push("Generated by Curriculum Planner; safe to delete this file.");
  lines.push("");
  return lines.join("\n");
}

// ============================================================
// Helpers
// ============================================================

function visibleHalfTerms(subject: Subject): readonly HalfTerm[] {
  const hidden = new Set<YearId>(subject.config.hiddenYears ?? []);
  return subject.timeline.halfTerms.filter((ht) => !hidden.has(ht.year));
}

/**
 * Strip path-reserved characters per DEC-045 + DEC-039. Allows colons and
 * slashes to be replaced with spaces (so "Forces / Motion" doesn't become
 * "ForcesMotion" but rather "Forces  Motion"). Trims trailing dots
 * (Windows-hostile) and collapses runs of whitespace.
 */
function safe(s: string): string {
  return s
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\.+$/, "")
    .trim();
}

function textBytes(s: string): Uint8Array {
  // UTF-8 encoding; consistent across platforms.
  return new TextEncoder().encode(s);
}

/** @internal — exposed for tests that want to verify safe-naming directly. */
export const __internal = { safe };
