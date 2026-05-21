import { generateSubTopicCode } from "./codes";
import type {
  CustomBlock,
  HalfTerm,
  Lesson,
  Objective,
  PlacedBlock,
  SavedPreset,
  SavedPresetPlacement,
  Spec,
  Subject,
  SubTopic,
  Timeline,
  Topic,
} from "./types";

export type LessonEditableFields = Pick<
  Lesson,
  "title" | "practical" | "isDepth" | "separateOnly"
>;

/**
 * Apply a shallow merge to a specific lesson identified by sub-topic code and
 * lesson id. Returns a new Spec with only the affected branch rebuilt.
 */
export function updateLesson(
  spec: Spec,
  subTopicCode: string,
  lessonId: string,
  patch: Partial<LessonEditableFields>
): Spec {
  return mapLesson(spec, subTopicCode, lessonId, (l) => ({ ...l, ...patch }));
}

/**
 * Replace the objectives array of a specific lesson.
 */
export function setLessonObjectives(
  spec: Spec,
  subTopicCode: string,
  lessonId: string,
  objectives: readonly Objective[]
): Spec {
  return mapLesson(spec, subTopicCode, lessonId, (l) => ({ ...l, objectives }));
}

/**
 * Append a new lesson to the named sub-topic. The lesson lands at the end of
 * the sub-topic's `lessons` array — no existing `lessonRange` index needs to
 * shift, so existing placements stay valid.
 */
export function appendLesson(
  spec: Spec,
  subTopicCode: string,
  lesson: Lesson
): Spec {
  return mapSubTopic(spec, subTopicCode, (st) => ({
    ...st,
    lessons: [...st.lessons, lesson],
  }));
}

/**
 * Reorder a lesson within its sub-topic's `lessons` array (DEC-048). Used by
 * lesson-view between-drops within the same sub-topic. The lesson's stored
 * `number` is preserved, but the rendered ordinal position reflects the new
 * array index — see LessonHalfTermCell.tsx for the display logic.
 *
 * NOTE: this only reorders the spec; PlacedBlock.lessonRange values point at
 * indices that match the OLD order. Callers that care about placement-vs-
 * lesson alignment must take care; for the user-facing lesson-view scenario,
 * this is fine because the spec-level rename is what changes the visible
 * numbering.
 */
export function reorderLessonInSubTopic(
  spec: Spec,
  subTopicCode: string,
  lessonId: string,
  toIndex: number
): Spec {
  return mapSubTopic(spec, subTopicCode, (st) => {
    const fromIdx = st.lessons.findIndex((l) => l.id === lessonId);
    if (fromIdx < 0) return st;
    const next = [...st.lessons];
    const [moved] = next.splice(fromIdx, 1);
    if (!moved) return st;
    const clamped = Math.max(0, Math.min(toIndex, next.length));
    next.splice(clamped, 0, moved);
    return { ...st, lessons: next };
  });
}

export type ObjectiveEditableFields = Pick<Objective, "text" | "isDepth">;

/**
 * Edit a single objective in-place by id. Lesson identity is unused —
 * objective ids are spec-wide unique (generated at import / when user adds).
 * Walks every lesson; the cost is fine for v1 spec sizes.
 */
export function updateObjective(
  spec: Spec,
  objectiveId: string,
  patch: Partial<ObjectiveEditableFields>
): Spec {
  return mapEveryLesson(spec, (l) => {
    if (!l.objectives.some((o) => o.id === objectiveId)) return l;
    return {
      ...l,
      objectives: l.objectives.map((o) =>
        o.id === objectiveId ? { ...o, ...patch } : o
      ),
    };
  });
}

/**
 * Remove an objective from whichever lesson currently holds it. Becomes
 * "unmapped" automatically if the objective id exists in importedSpec.
 */
export function removeObjective(spec: Spec, objectiveId: string): Spec {
  return mapEveryLesson(spec, (l) => {
    if (!l.objectives.some((o) => o.id === objectiveId)) return l;
    return { ...l, objectives: l.objectives.filter((o) => o.id !== objectiveId) };
  });
}

/**
 * Append an objective to the named lesson (at end of the list).
 * No-op if the lesson already contains an objective with the same id —
 * caller may safely use this for "drag from unmapped panel to lesson"
 * without an explicit pre-check.
 */
export function addObjectiveToLesson(
  spec: Spec,
  subTopicCode: string,
  lessonId: string,
  objective: Objective
): Spec {
  return mapLesson(spec, subTopicCode, lessonId, (l) => {
    if (l.objectives.some((o) => o.id === objective.id)) return l;
    return { ...l, objectives: [...l.objectives, objective] };
  });
}

function mapEveryLesson(spec: Spec, update: (l: Lesson) => Lesson): Spec {
  return {
    topics: spec.topics.map((topic) => ({
      ...topic,
      subTopics: topic.subTopics.map((st) => ({
        ...st,
        lessons: st.lessons.map(update),
      })),
    })),
  };
}

function mapSubTopic(
  spec: Spec,
  subTopicCode: string,
  update: (st: SubTopic) => SubTopic
): Spec {
  return {
    topics: spec.topics.map((topic) => mapSubTopicInTopic(topic, subTopicCode, update)),
  };
}

function mapSubTopicInTopic(
  topic: Topic,
  subTopicCode: string,
  update: (st: SubTopic) => SubTopic
): Topic {
  if (!topic.subTopics.some((st) => st.code === subTopicCode)) return topic;
  return {
    ...topic,
    subTopics: topic.subTopics.map((st) =>
      st.code === subTopicCode ? update(st) : st
    ),
  };
}

function mapLesson(
  spec: Spec,
  subTopicCode: string,
  lessonId: string,
  update: (l: Lesson) => Lesson
): Spec {
  return mapSubTopic(spec, subTopicCode, (st) => {
    if (!st.lessons.some((l) => l.id === lessonId)) return st;
    return {
      ...st,
      lessons: st.lessons.map((l) => (l.id === lessonId ? update(l) : l)),
    };
  });
}

// ============================================================
// Topic / sub-topic renames with code cascade (DEC-047)
//
// Renaming a sub-topic code or topic code cascades to every place that
// references it: placed blocks in the timeline, custom-block `revisits`
// arrays, and any saved-preset placements / revisits on the subject. The
// rename only touches `workingSpec` — `importedSpec` is preserved per
// SPEC.md §3.2, so "restore to import" still produces the original codes
// (at the cost of orphaning placements that pointed at renamed codes).
// ============================================================

export interface TopicRenamePatch {
  readonly name?: string;
  readonly newCode?: string;
  readonly paper?: string | null;
}

export interface SubTopicRenamePatch {
  readonly name?: string;
  readonly newCode?: string;
  readonly notes?: string | null;
  readonly difficulty?: 1 | 2 | 3;
  readonly isDepth?: boolean;
  readonly separateOnly?: boolean;
}

export class CodeConflictError extends Error {
  public readonly code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
    this.name = "CodeConflictError";
  }
}

/**
 * Rename a topic in the working spec. If `newCode` is provided and differs
 * from the current code, the change cascades:
 *   - Every sub-topic's `code` whose old code starts with the topic's old
 *     code is rewritten with the new topic-code prefix (T1a → T9a when
 *     T1 → T9). User-edited sub-topic codes that don't follow the prefix
 *     convention are left untouched and warned about by the caller.
 *   - Every PlacedBlock that references a renamed sub-topic code is updated.
 *   - Every CustomBlock.revisits and SavedPreset entry is updated.
 *
 * Throws CodeConflictError if `newCode` collides with another topic's code.
 */
export function renameTopic(
  subject: Subject,
  topicCode: string,
  patch: TopicRenamePatch
): Subject {
  const topic = subject.workingSpec.topics.find((t) => t.code === topicCode);
  if (!topic) {
    throw new Error(`renameTopic: no topic with code "${topicCode}"`);
  }
  const trimmedCode = patch.newCode?.trim();
  const newCode = trimmedCode && trimmedCode !== topicCode ? trimmedCode : null;
  if (newCode !== null) {
    if (newCode === "") {
      throw new CodeConflictError(`Topic code must not be empty`, "EMPTY_CODE");
    }
    if (subject.workingSpec.topics.some((t) => t.code === newCode)) {
      throw new CodeConflictError(
        `Topic code "${newCode}" is already used`,
        "TOPIC_CODE_TAKEN"
      );
    }
  }

  // Build the code-remap: old sub-topic code → new sub-topic code.
  const subTopicRemap = new Map<string, string>();
  if (newCode !== null) {
    for (const st of topic.subTopics) {
      // Convention: a sub-topic code is the topic code + a letter suffix.
      // If the existing code starts with the topic's old code, rewrite the
      // prefix to the new code. User-renamed sub-topic codes that don't
      // follow the convention are NOT touched — the user can rename them
      // individually if they want to.
      if (st.code.startsWith(topicCode)) {
        const suffix = st.code.slice(topicCode.length);
        const newSubTopicCode = newCode + suffix;
        if (newSubTopicCode !== st.code) {
          subTopicRemap.set(st.code, newSubTopicCode);
        }
      }
    }
    // Validate no clash with sub-topics in OTHER topics.
    for (const t of subject.workingSpec.topics) {
      if (t.code === topicCode) continue;
      for (const st of t.subTopics) {
        if (subTopicRemap.has(st.code)) continue;
        if ([...subTopicRemap.values()].includes(st.code)) {
          throw new CodeConflictError(
            `Sub-topic code "${st.code}" already exists; topic-code rename would clash`,
            "SUBTOPIC_CODE_CLASH"
          );
        }
      }
    }
  }

  const updatedSpec: Spec = {
    topics: subject.workingSpec.topics.map((t) => {
      if (t.code !== topicCode) return t;
      const renamedSubTopics: SubTopic[] = t.subTopics.map((st) => {
        const mapped = subTopicRemap.get(st.code);
        return mapped ? { ...st, code: mapped } : st;
      });
      return {
        ...t,
        ...(newCode !== null ? { code: newCode } : {}),
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.paper !== undefined ? { paper: patch.paper } : {}),
        subTopics: renamedSubTopics,
      };
    }),
  };

  return cascadeCodeChange({ ...subject, workingSpec: updatedSpec }, subTopicRemap);
}

/**
 * Rename a single sub-topic. If `newCode` is provided and differs from the
 * current code, every reference (timeline, custom-block revisits, saved
 * presets) is rewritten. The topic code itself is unaffected.
 */
export function renameSubTopic(
  subject: Subject,
  subTopicCode: string,
  patch: SubTopicRenamePatch
): Subject {
  let foundTopic: Topic | null = null;
  let foundSubTopic: SubTopic | null = null;
  for (const t of subject.workingSpec.topics) {
    for (const st of t.subTopics) {
      if (st.code === subTopicCode) {
        foundTopic = t;
        foundSubTopic = st;
        break;
      }
    }
    if (foundSubTopic) break;
  }
  if (!foundTopic || !foundSubTopic) {
    throw new Error(`renameSubTopic: no sub-topic with code "${subTopicCode}"`);
  }
  const trimmedCode = patch.newCode?.trim();
  const newCode = trimmedCode && trimmedCode !== subTopicCode ? trimmedCode : null;
  if (newCode !== null) {
    if (newCode === "") {
      throw new CodeConflictError(`Sub-topic code must not be empty`, "EMPTY_CODE");
    }
    for (const t of subject.workingSpec.topics) {
      for (const st of t.subTopics) {
        if (st.code === newCode) {
          throw new CodeConflictError(
            `Sub-topic code "${newCode}" is already used`,
            "SUBTOPIC_CODE_TAKEN"
          );
        }
      }
    }
  }

  const updatedSpec: Spec = {
    topics: subject.workingSpec.topics.map((t) => ({
      ...t,
      subTopics: t.subTopics.map((st) => {
        if (st.code !== subTopicCode) return st;
        return {
          ...st,
          ...(newCode !== null ? { code: newCode } : {}),
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
          ...(patch.difficulty !== undefined ? { difficulty: patch.difficulty } : {}),
          ...(patch.isDepth !== undefined ? { isDepth: patch.isDepth } : {}),
          ...(patch.separateOnly !== undefined ? { separateOnly: patch.separateOnly } : {}),
        };
      }),
    })),
  };

  const remap = new Map<string, string>();
  if (newCode !== null) remap.set(subTopicCode, newCode);
  return cascadeCodeChange({ ...subject, workingSpec: updatedSpec }, remap);
}

/**
 * Apply a sub-topic code remap to every place outside the spec that references
 * a sub-topic code: placed blocks, custom-block revisits, saved-preset
 * placements + custom-block revisits. Returns the subject unchanged when the
 * remap is empty (common case: only name was edited).
 */
function cascadeCodeChange(
  subject: Subject,
  remap: ReadonlyMap<string, string>
): Subject {
  if (remap.size === 0) return subject;

  const remapCode = (code: string): string => remap.get(code) ?? code;

  const nextTimeline: Timeline = {
    halfTerms: subject.timeline.halfTerms.map(
      (ht): HalfTerm => ({
        ...ht,
        placedBlocks: ht.placedBlocks.map((pb): PlacedBlock => {
          if (pb.source.kind !== "sub-topic") return pb;
          const remapped = remap.get(pb.source.subTopicCode);
          if (!remapped) return pb;
          return {
            ...pb,
            source: { kind: "sub-topic", subTopicCode: remapped },
          };
        }),
      })
    ),
  };

  const nextCustomBlocks: readonly CustomBlock[] = subject.customBlocks.map(
    (cb): CustomBlock => {
      if (!cb.revisits || cb.revisits.length === 0) return cb;
      const mapped = cb.revisits.map(remapCode);
      return mapped.every((m, i) => m === cb.revisits![i])
        ? cb
        : { ...cb, revisits: mapped };
    }
  );

  const nextPresets: readonly SavedPreset[] | undefined = subject.presets
    ? subject.presets.map((p): SavedPreset => {
        const placements: SavedPresetPlacement[] = p.placements.map((pl) => {
          if (pl.source.kind !== "sub-topic") return pl;
          const remapped = remap.get(pl.source.subTopicCode);
          if (!remapped) return pl;
          return {
            ...pl,
            source: { kind: "sub-topic", subTopicCode: remapped },
          };
        });
        const customBlocks = p.customBlocks.map((cb) => {
          if (!cb.revisits || cb.revisits.length === 0) return cb;
          const mapped = cb.revisits.map(remapCode);
          return mapped.every((m, i) => m === cb.revisits![i])
            ? cb
            : { ...cb, revisits: mapped };
        });
        return { ...p, placements, customBlocks };
      })
    : subject.presets;

  return {
    ...subject,
    timeline: nextTimeline,
    customBlocks: nextCustomBlocks,
    ...(nextPresets ? { presets: nextPresets } : {}),
  };
}

// ============================================================
// Duplicate / delete for lessons + sub-topics (DEC-052)
//
// Powers the right-click context menu. All operations are spec-edits that
// operate on `workingSpec`; cascades for delete reach into the live timeline,
// custom blocks, and saved presets so referential integrity is preserved.
// ============================================================

export interface DuplicateOptions {
  readonly idGen?: () => string;
  readonly titleSuffix?: string;
}

/**
 * Append a copy of a lesson to its sub-topic (DEC-052). The new lesson has
 * a fresh id and its title is the original + " (copy)" (configurable). It's
 * appended at the end of the sub-topic's lessons array, so it lands unplaced
 * in the lesson pool until the user drags it somewhere. Objectives are
 * cloned with fresh ids too.
 */
export function duplicateLesson(
  spec: Spec,
  subTopicCode: string,
  lessonId: string,
  options: DuplicateOptions = {}
): Spec {
  const idGen = options.idGen ?? (() => crypto.randomUUID());
  const suffix = options.titleSuffix ?? " (copy)";
  return mapSubTopic(spec, subTopicCode, (st) => {
    const source = st.lessons.find((l) => l.id === lessonId);
    if (!source) return st;
    const copy: Lesson = {
      id: idGen(),
      number: st.lessons.length + 1,
      title: source.title + suffix,
      practical: source.practical,
      isDepth: source.isDepth,
      separateOnly: source.separateOnly,
      objectives: source.objectives.map((o) => ({
        id: idGen(),
        text: o.text,
        isDepth: o.isDepth,
      })),
    };
    return { ...st, lessons: [...st.lessons, copy] };
  });
}

/**
 * Delete a lesson from its sub-topic (DEC-052). Cascades into live
 * placements: PlacedBlocks whose lessonRange covers the deleted lesson's
 * index are shrunk by one (and removed if they become empty); blocks whose
 * lessonRange starts after the deleted index are shifted down by one so
 * they keep pointing at the same logical lessons.
 *
 * Does NOT touch saved presets — those reference sub-topic codes, not
 * lesson ids, and their lessonRange numbers stay aligned with whatever the
 * subject's spec looked like when the preset was authored. (If the user
 * deletes lessons and then re-applies a preset, placements past the deleted
 * range may end up oversized; the apply-preset orphan report already
 * surfaces that case.)
 */
export function deleteLessonFromSubTopic(
  subject: Subject,
  subTopicCode: string,
  lessonId: string
): Subject {
  let deletedIndex = -1;
  const spec: Spec = {
    topics: subject.workingSpec.topics.map((t) => ({
      ...t,
      subTopics: t.subTopics.map((st) => {
        if (st.code !== subTopicCode) return st;
        const idx = st.lessons.findIndex((l) => l.id === lessonId);
        if (idx < 0) return st;
        deletedIndex = idx;
        return { ...st, lessons: st.lessons.filter((l) => l.id !== lessonId) };
      }),
    })),
  };
  if (deletedIndex < 0) return subject;

  const nextHalfTerms: HalfTerm[] = subject.timeline.halfTerms.map((ht) => {
    const nextPlacedBlocks: PlacedBlock[] = [];
    for (const pb of ht.placedBlocks) {
      if (pb.source.kind !== "sub-topic" || pb.source.subTopicCode !== subTopicCode) {
        nextPlacedBlocks.push(pb);
        continue;
      }
      const [start, end] = pb.lessonRange;
      // Block lies entirely before the deleted index — no change.
      if (end <= deletedIndex) {
        nextPlacedBlocks.push(pb);
        continue;
      }
      // Block lies entirely after the deleted index — shift both bounds.
      if (start > deletedIndex) {
        nextPlacedBlocks.push({
          ...pb,
          lessonRange: [start - 1, end - 1],
        });
        continue;
      }
      // Block straddles or starts AT the deleted index — shrink end.
      const newEnd = end - 1;
      const newClaimed = newEnd - start;
      if (newClaimed <= 0) continue; // drop the now-empty block
      nextPlacedBlocks.push({
        ...pb,
        lessonsClaimed: newClaimed,
        lessonRange: [start, newEnd],
      });
    }
    return { ...ht, placedBlocks: nextPlacedBlocks };
  });

  return {
    ...subject,
    workingSpec: spec,
    timeline: { halfTerms: nextHalfTerms },
  };
}

/**
 * Append a copy of a sub-topic to its topic (DEC-052). The new sub-topic
 * gets a fresh id, a freshly-generated code (next available letter within
 * the topic), name "<original> (copy)", and clone all lessons with new ids.
 * It's appended unplaced; the user drags it from the pool to place it.
 */
export function duplicateSubTopic(
  subject: Subject,
  subTopicCode: string,
  options: DuplicateOptions = {}
): Subject {
  const idGen = options.idGen ?? (() => crypto.randomUUID());
  const suffix = options.titleSuffix ?? " (copy)";

  let foundTopic: Topic | null = null;
  let source: SubTopic | null = null;
  for (const t of subject.workingSpec.topics) {
    const st = t.subTopics.find((s) => s.code === subTopicCode);
    if (st) {
      foundTopic = t;
      source = st;
      break;
    }
  }
  if (!foundTopic || !source) return subject;

  const existingCodesInTopic = foundTopic.subTopics.map((s) => s.code);
  const newCode = generateSubTopicCode(foundTopic.code, existingCodesInTopic);

  const copy: SubTopic = {
    id: idGen(),
    code: newCode,
    name: source.name + suffix,
    difficulty: source.difficulty,
    isDepth: source.isDepth,
    separateOnly: source.separateOnly,
    notes: source.notes,
    lessons: source.lessons.map((l) => ({
      id: idGen(),
      number: l.number,
      title: l.title,
      practical: l.practical,
      isDepth: l.isDepth,
      separateOnly: l.separateOnly,
      objectives: l.objectives.map((o) => ({
        id: idGen(),
        text: o.text,
        isDepth: o.isDepth,
      })),
    })),
  };

  const spec: Spec = {
    topics: subject.workingSpec.topics.map((t) =>
      t.id !== foundTopic!.id ? t : { ...t, subTopics: [...t.subTopics, copy] }
    ),
  };
  return { ...subject, workingSpec: spec };
}

/**
 * Delete a sub-topic from its topic, cascading through placements, custom-
 * block revisits, and saved presets (DEC-052). All placements that
 * reference the sub-topic are removed from the timeline. CustomBlock and
 * SavedPreset revisits lose the dead code. Saved-preset placements pointing
 * at this sub-topic are dropped from each preset's placement list.
 */
export function deleteSubTopicFromSubject(
  subject: Subject,
  subTopicCode: string
): Subject {
  const spec: Spec = {
    topics: subject.workingSpec.topics.map((t) => ({
      ...t,
      subTopics: t.subTopics.filter((s) => s.code !== subTopicCode),
    })),
  };
  const timeline: Timeline = {
    halfTerms: subject.timeline.halfTerms.map((ht) => ({
      ...ht,
      placedBlocks: ht.placedBlocks.filter(
        (pb) =>
          !(pb.source.kind === "sub-topic" && pb.source.subTopicCode === subTopicCode)
      ),
    })),
  };
  const customBlocks: readonly CustomBlock[] = subject.customBlocks.map((cb) => {
    if (!cb.revisits || !cb.revisits.includes(subTopicCode)) return cb;
    return { ...cb, revisits: cb.revisits.filter((c) => c !== subTopicCode) };
  });
  const presets: readonly SavedPreset[] | undefined = subject.presets
    ? subject.presets.map((p) => {
        const placements: SavedPresetPlacement[] = p.placements.filter(
          (pl) =>
            !(pl.source.kind === "sub-topic" && pl.source.subTopicCode === subTopicCode)
        );
        const presetCustomBlocks = p.customBlocks.map((cb) => {
          if (!cb.revisits || !cb.revisits.includes(subTopicCode)) return cb;
          return {
            ...cb,
            revisits: cb.revisits.filter((c) => c !== subTopicCode),
          };
        });
        return { ...p, placements, customBlocks: presetCustomBlocks };
      })
    : subject.presets;

  return {
    ...subject,
    workingSpec: spec,
    timeline,
    customBlocks,
    ...(presets ? { presets } : {}),
  };
}
