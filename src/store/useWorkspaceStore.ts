import { create } from "zustand";

import {
  editBlockLessons as plEditBlockLessons,
  extractAndMoveLesson as plExtractAndMoveLesson,
  extractAndMoveLessonToIndex as plExtractAndMoveLessonToIndex,
  moveBlock as plMoveBlock,
  moveBlockToIndex as plMoveBlockToIndex,
  placeBlock as plPlaceBlock,
  placeBlockAtIndex as plPlaceBlockAtIndex,
  placeBlockWithSpillover as plPlaceBlockWithSpillover,
  placeLessonAtIndex as plPlaceLessonAtIndex,
  recombineBlock as plRecombineBlock,
  removeBlock as plRemoveBlock,
  removePlacedLesson as plRemovePlacedLesson,
  setPlacedBlockTitle as plSetPlacedBlockTitle,
  splitBlock as plSplitBlock,
} from "@/model/placement";
import {
  addPresetToSubject,
  applyPreset,
  applySavedPreset,
  deletePresetFromSubject,
  saveCurrentAsPreset,
  type ApplySavedPresetResult,
  type PresetId,
} from "@/model/presets";
import type { SavedPreset } from "@/model/types";
import { findObjectiveLocation } from "@/model/objectives";
import { getPlacedBlockIdsForTopicInCell } from "@/model/topics";
import {
  addObjectiveToLesson as specAddObjectiveToLesson,
  appendLesson as specAppendLesson,
  deleteLessonFromSubTopic as specDeleteLessonFromSubTopic,
  deleteSubTopicFromSubject as specDeleteSubTopicFromSubject,
  duplicateLesson as specDuplicateLesson,
  duplicateSubTopic as specDuplicateSubTopic,
  moveLessonBetweenSubTopics as specMoveLessonBetweenSubTopics,
  removeObjective as specRemoveObjective,
  renameSubTopic as specRenameSubTopic,
  renameTopic as specRenameTopic,
  reorderLessonInSubTopic as specReorderLessonInSubTopic,
  setLessonObjectives as specSetLessonObjectives,
  updateLesson as specUpdateLesson,
  updateObjective as specUpdateObjective,
  type LessonEditableFields,
  type ObjectiveEditableFields,
  type SubTopicRenamePatch,
  type TopicRenamePatch,
} from "@/model/specEdits";
import type {
  CustomBlock,
  Lesson,
  Objective,
  PlacedBlock,
  PlacedBlockSource,
  Subject,
  Timeline,
  ViewType,
  Workspace,
} from "@/model/types";
import {
  addSubject as wsAddSubject,
  applyTemplateToSubject,
  createWorkspace,
  detectLegacyEoHTPlacements,
  migrateLegacyEoHTPlacements,
  removeSubject as wsRemoveSubject,
  replaceSubject,
  restoreSubjectToImport as wsRestoreSubjectToImport,
  setActiveSubject as wsSetActiveSubject,
} from "@/model/workspace";

export const AUTOSAVE_KEY = "curriculum-planner-autosave-v1";
export const AUTOSAVE_DEBOUNCE_MS = 500;

export interface WorkspaceStoreState {
  readonly workspace: Workspace;
  readonly dirty: boolean;
  readonly currentView: ViewType;
  readonly currentTermId: string | null;
  readonly currentSavePath: string | null;
}

export interface WorkspaceStoreActions {
  // Workspace
  readonly addSubject: (subject: Subject) => void;
  readonly removeSubject: (subjectId: string) => void;
  readonly setActiveSubject: (subjectId: string | null) => void;
  readonly restoreSubjectToImport: (subjectId: string) => readonly PlacedBlock[];
  readonly renameSubject: (subjectId: string, newName: string) => void;
  readonly updateActiveSubjectConfig: (
    partial: Partial<Subject["config"]>
  ) => void;
  readonly addCustomBlock: (block: CustomBlock) => void;
  readonly removeCustomBlock: (customBlockId: string) => void;
  readonly updateCustomBlock: (
    customBlockId: string,
    patch: Partial<Omit<CustomBlock, "id">>
  ) => void;
  // Placement (operates on the active subject)
  readonly placeBlock: (
    source: PlacedBlockSource,
    termId: string,
    lessonsClaimed: number
  ) => void;
  readonly placeBlockWithSpillover: (
    source: PlacedBlockSource,
    lessonsClaimed: number,
    termId: string
  ) => void;
  readonly splitBlock: (placedBlockId: string, atLessonIdx: number) => void;
  readonly recombineBlock: (placedBlockId: string) => void;
  readonly removeBlock: (placedBlockId: string) => void;
  readonly moveBlock: (placedBlockId: string, toTermId: string) => void;
  readonly moveTopicInHalfTerm: (
    topicCode: string,
    fromTermId: string,
    toTermId: string
  ) => void;
  readonly editBlockLessons: (placedBlockId: string, newLessons: number) => void;
  readonly extractAndMoveLesson: (
    placedBlockId: string,
    localLessonIdx: number,
    toTermId: string
  ) => void;
  // Between-drops (DEC-048): index-aware variants of place + move.
  readonly placeBlockAtIndex: (
    source: PlacedBlockSource,
    termId: string,
    lessonsClaimed: number,
    atIndex: number
  ) => void;
  readonly moveBlockToIndex: (
    placedBlockId: string,
    toTermId: string,
    atIndex: number
  ) => void;
  readonly extractAndMoveLessonToIndex: (
    placedBlockId: string,
    localLessonIdx: number,
    toTermId: string,
    atIndex: number
  ) => void;
  /**
   * Place a single specific lesson (by sub-topic code + absolute index) into
   * a cell at a chosen slot index (DEC-049). Lesson-view pool drops.
   */
  readonly placeLessonAtIndex: (
    subTopicCode: string,
    absLessonIdx: number,
    termId: string,
    atIndex: number
  ) => void;
  /** Release a single placed lesson back into the unplaced pool (DEC-049). */
  readonly removePlacedLesson: (
    placedBlockId: string,
    localLessonIdx: number
  ) => void;
  /**
   * Override the display title of a specific placement (DEC-050). Empty /
   * whitespace-only `title` clears the override so the displayed name falls
   * back to the underlying sub-topic / custom-block name.
   */
  readonly setPlacedBlockTitle: (placedBlockId: string, title: string) => void;
  /** Reorder a lesson within its sub-topic's lessons array. */
  readonly reorderLessonInSubTopic: (
    subTopicCode: string,
    lessonId: string,
    toIndex: number
  ) => void;
  // Working spec edits
  readonly editLesson: (
    subTopicCode: string,
    lessonId: string,
    patch: Partial<LessonEditableFields>
  ) => void;
  readonly setLessonObjectives: (
    subTopicCode: string,
    lessonId: string,
    objectives: readonly Objective[]
  ) => void;
  readonly addLesson: (subTopicCode: string, lesson: Lesson) => void;
  readonly placeObjectiveInLesson: (
    objectiveId: string,
    toSubTopicCode: string,
    toLessonId: string
  ) => void;
  readonly removeObjective: (objectiveId: string) => void;
  readonly updateObjective: (
    objectiveId: string,
    patch: Partial<ObjectiveEditableFields>
  ) => void;
  readonly addObjectiveToLesson: (
    subTopicCode: string,
    lessonId: string,
    objective: Objective
  ) => void;
  // View
  readonly setCurrentView: (view: ViewType) => void;
  readonly setCurrentTermId: (termId: string | null) => void;
  // Persistence wiring
  readonly setWorkspace: (workspace: Workspace) => void;
  readonly setSavePath: (path: string | null) => void;
  readonly markClean: () => void;
  readonly clearWorkspace: () => void;
  /**
   * Replace the workspace-level calendar template that new subjects inherit
   * from. Passing `null` clears it (subjects fall back to the LEHS default).
   * Existing subjects' timelines are unchanged — this only affects subjects
   * added after the template is set.
   */
  readonly setCalendarTemplate: (template: import("@/model/types").CalendarTemplate | null) => void;
  /**
   * Apply a CalendarTemplate to one specific subject. Regenerates the
   * subject's timeline preserving placements whose half-term ids match;
   * returns any orphaned placements so the caller can surface them.
   * Persists the template on Subject.calendarTemplate for future edits.
   */
  readonly setSubjectCalendarTemplate: (
    subjectId: string,
    template: import("@/model/types").CalendarTemplate
  ) => readonly import("@/model/types").PlacedBlock[];
  /**
   * Apply the workspace calendar template to every existing subject. Returns
   * a map of subjectId → orphans so the UI can show a per-subject breakdown
   * before/after the user confirms.
   */
  readonly reapplyWorkspaceTemplateToAllSubjects: () => ReadonlyMap<
    string,
    readonly import("@/model/types").PlacedBlock[]
  >;
  /**
   * Toggle a year group's visibility for a given subject. Hidden years are
   * filtered from views and exports but remain in the underlying timeline
   * (placements aren't deleted; unhiding restores them immediately).
   */
  readonly toggleYearVisibility: (
    subjectId: string,
    year: import("@/model/types").YearId
  ) => void;
  /**
   * Replace the hidden-years list for a subject wholesale. Empty array =
   * everything visible. Used by the "Show all years" reset action and any
   * future bulk-hide UI.
   */
  readonly setSubjectHiddenYears: (
    subjectId: string,
    hidden: readonly import("@/model/types").YearId[]
  ) => void;
  /**
   * Set or clear a subject's key-stage classification. `null` removes the
   * field entirely (no `undefined` in serialised output).
   */
  readonly setSubjectKeyStage: (
    subjectId: string,
    keyStage: import("@/model/types").KeyStage | null
  ) => void;
  /**
   * Apply a preset layout to the active subject. Wipes existing sub-topic
   * placements (EoHTs and custom blocks are preserved) and rebuilds the
   * timeline from the preset algorithm. The UI is expected to confirm
   * with the user BEFORE invoking this — there is no built-in undo for
   * the wipe (save the workspace first if you want a checkpoint).
   * No-op when no subject is active.
   */
  readonly applyPresetLayout: (presetId: PresetId) => void;
  /**
   * Snapshot the active subject's current sub-topic placements + custom
   * blocks as a SavedPreset, append it to the subject's `presets` list.
   * No-op when no subject is active. Returns the new preset's id (or null).
   */
  readonly saveCurrentLayoutAsPreset: (name: string, description?: string) => string | null;
  /**
   * Apply a saved preset by id to the active subject. Returns the orphan
   * report so the UI can surface skipped placements. No-op + null when the
   * preset id isn't found on the active subject.
   */
  readonly applySavedPresetById: (presetId: string) => ApplySavedPresetResult["orphans"] | null;
  /** Remove a preset from the active subject. No-op when not found. */
  readonly deleteSavedPreset: (presetId: string) => void;
  /** Append a pre-built SavedPreset (e.g. from paste-JSON import) to the active subject. */
  readonly addSavedPreset: (preset: SavedPreset) => void;
  /**
   * Rename a topic in the active subject's working spec. If `patch.newCode`
   * differs from the topic's current code, the change cascades to sub-topic
   * codes (T1a → T9a), placed blocks, custom-block revisits, and saved
   * presets. Throws CodeConflictError if the new code clashes.
   */
  readonly renameTopic: (topicCode: string, patch: TopicRenamePatch) => void;
  /** Rename a single sub-topic with cascade — same semantics as renameTopic. */
  readonly renameSubTopic: (
    subTopicCode: string,
    patch: SubTopicRenamePatch
  ) => void;
  /** Append a copy of a lesson at the end of its sub-topic (DEC-052). */
  readonly duplicateLesson: (subTopicCode: string, lessonId: string) => void;
  /** Delete a lesson from a sub-topic; shrinks/shifts placements (DEC-052). */
  readonly deleteLesson: (subTopicCode: string, lessonId: string) => void;
  /** Append a copy of a sub-topic to its topic; new code, new ids (DEC-052). */
  readonly duplicateSubTopic: (subTopicCode: string) => void;
  /** Delete a sub-topic with full cascade (placements + revisits + presets). */
  readonly deleteSubTopic: (subTopicCode: string) => void;
  /**
   * Re-parent a lesson: remove it from `fromSubTopicCode`, insert at
   * `toIndexInTarget` in `toSubTopicCode`, and reshape every PlacedBlock
   * lessonRange accordingly. The target cell's existing PB of the target
   * sub-topic (if any) extends to include the new lesson (DEC-055).
   */
  readonly moveLessonBetweenSubTopics: (
    fromSubTopicCode: string,
    lessonId: string,
    toSubTopicCode: string,
    toIndexInTarget: number,
    toTermId: string
  ) => void;
}

export type WorkspaceStore = WorkspaceStoreState & WorkspaceStoreActions;

const initialState: WorkspaceStoreState = {
  workspace: createWorkspace(),
  dirty: false,
  currentView: "sub-topic",
  currentTermId: null,
  currentSavePath: null,
};

function updateActiveTimeline(
  workspace: Workspace,
  update: (timeline: Timeline) => Timeline
): Workspace {
  const id = workspace.activeSubjectId;
  if (!id) return workspace;
  const subject = workspace.subjects.find((s) => s.id === id);
  if (!subject) return workspace;
  return replaceSubject(workspace, id, {
    ...subject,
    timeline: update(subject.timeline),
  });
}

export const useWorkspaceStore = create<WorkspaceStore>()((set) => ({
  ...initialState,

  addSubject: (subject) =>
    set((state) => ({
      workspace: wsAddSubject(state.workspace, subject),
      dirty: true,
    })),

  removeSubject: (subjectId) =>
    set((state) => ({
      workspace: wsRemoveSubject(state.workspace, subjectId),
      dirty: true,
    })),

  setActiveSubject: (subjectId) =>
    set((state) => ({
      workspace: wsSetActiveSubject(state.workspace, subjectId),
    })),

  restoreSubjectToImport: (subjectId) => {
    let orphans: readonly PlacedBlock[] = [];
    set((state) => {
      const result = wsRestoreSubjectToImport(state.workspace, subjectId);
      orphans = result.orphans;
      return { workspace: result.workspace, dirty: true };
    });
    return orphans;
  },

  renameSubject: (subjectId, newName) =>
    set((state) => {
      const subject = state.workspace.subjects.find((s) => s.id === subjectId);
      if (!subject) return {};
      const updated: Subject = {
        ...subject,
        meta: { ...subject.meta, name: newName },
      };
      return {
        workspace: replaceSubject(state.workspace, subjectId, updated),
        dirty: true,
      };
    }),

  updateActiveSubjectConfig: (partial) =>
    set((state) => {
      const id = state.workspace.activeSubjectId;
      if (!id) return {};
      const subject = state.workspace.subjects.find((s) => s.id === id);
      if (!subject) return {};
      const updated: Subject = {
        ...subject,
        config: { ...subject.config, ...partial },
      };
      return {
        workspace: replaceSubject(state.workspace, id, updated),
        dirty: true,
      };
    }),

  addCustomBlock: (block) =>
    set((state) => {
      const id = state.workspace.activeSubjectId;
      if (!id) return {};
      const subject = state.workspace.subjects.find((s) => s.id === id);
      if (!subject) return {};
      const updated: Subject = {
        ...subject,
        customBlocks: [...subject.customBlocks, block],
      };
      return {
        workspace: replaceSubject(state.workspace, id, updated),
        dirty: true,
      };
    }),

  updateCustomBlock: (customBlockId, patch) =>
    set((state) => {
      const id = state.workspace.activeSubjectId;
      if (!id) return {};
      const subject = state.workspace.subjects.find((s) => s.id === id);
      if (!subject) return {};
      const existing = subject.customBlocks.find((c) => c.id === customBlockId);
      if (!existing) return {};
      const updated: Subject = {
        ...subject,
        customBlocks: subject.customBlocks.map((c) =>
          c.id === customBlockId ? { ...c, ...patch, id: c.id } : c
        ),
      };
      return {
        workspace: replaceSubject(state.workspace, id, updated),
        dirty: true,
      };
    }),

  removeCustomBlock: (customBlockId) =>
    set((state) => {
      const id = state.workspace.activeSubjectId;
      if (!id) return {};
      const subject = state.workspace.subjects.find((s) => s.id === id);
      if (!subject) return {};
      const updated: Subject = {
        ...subject,
        customBlocks: subject.customBlocks.filter((c) => c.id !== customBlockId),
        timeline: {
          halfTerms: subject.timeline.halfTerms.map((ht) => ({
            ...ht,
            placedBlocks: ht.placedBlocks.filter(
              (p) =>
                !(
                  p.source.kind === "custom" &&
                  p.source.customBlockId === customBlockId
                )
            ),
          })),
        },
      };
      return {
        workspace: replaceSubject(state.workspace, id, updated),
        dirty: true,
      };
    }),

  placeBlock: (source, termId, lessonsClaimed) =>
    set((state) => ({
      workspace: updateActiveTimeline(state.workspace, (tl) =>
        plPlaceBlock(tl, source, termId, lessonsClaimed)
      ),
      dirty: true,
    })),

  placeBlockWithSpillover: (source, lessonsClaimed, termId) =>
    set((state) => ({
      workspace: updateActiveTimeline(state.workspace, (tl) =>
        plPlaceBlockWithSpillover(tl, source, lessonsClaimed, termId)
      ),
      dirty: true,
    })),

  splitBlock: (placedBlockId, atLessonIdx) =>
    set((state) => ({
      workspace: updateActiveTimeline(state.workspace, (tl) =>
        plSplitBlock(tl, placedBlockId, atLessonIdx)
      ),
      dirty: true,
    })),

  recombineBlock: (placedBlockId) =>
    set((state) => ({
      workspace: updateActiveTimeline(state.workspace, (tl) =>
        plRecombineBlock(tl, placedBlockId)
      ),
      dirty: true,
    })),

  removeBlock: (placedBlockId) =>
    set((state) => ({
      workspace: updateActiveTimeline(state.workspace, (tl) =>
        plRemoveBlock(tl, placedBlockId)
      ),
      dirty: true,
    })),

  moveBlock: (placedBlockId, toTermId) =>
    set((state) => ({
      workspace: updateActiveTimeline(state.workspace, (tl) =>
        plMoveBlock(tl, placedBlockId, toTermId)
      ),
      dirty: true,
    })),

  moveTopicInHalfTerm: (topicCode, fromTermId, toTermId) =>
    set((state) => {
      if (fromTermId === toTermId) return {};
      const id = state.workspace.activeSubjectId;
      if (!id) return {};
      const subject = state.workspace.subjects.find((s) => s.id === id);
      if (!subject) return {};
      const fromTerm = subject.timeline.halfTerms.find((h) => h.id === fromTermId);
      if (!fromTerm) return {};
      const ids = getPlacedBlockIdsForTopicInCell(subject, fromTerm, topicCode);
      if (ids.length === 0) return {};
      let timeline = subject.timeline;
      for (const pbId of ids) {
        timeline = plMoveBlock(timeline, pbId, toTermId);
      }
      return {
        workspace: replaceSubject(state.workspace, id, { ...subject, timeline }),
        dirty: true,
      };
    }),

  editBlockLessons: (placedBlockId, newLessons) =>
    set((state) => ({
      workspace: updateActiveTimeline(state.workspace, (tl) =>
        plEditBlockLessons(tl, placedBlockId, newLessons)
      ),
      dirty: true,
    })),

  extractAndMoveLesson: (placedBlockId, localLessonIdx, toTermId) =>
    set((state) => ({
      workspace: updateActiveTimeline(state.workspace, (tl) =>
        plExtractAndMoveLesson(tl, placedBlockId, localLessonIdx, toTermId)
      ),
      dirty: true,
    })),

  placeBlockAtIndex: (source, termId, lessonsClaimed, atIndex) =>
    set((state) => ({
      workspace: updateActiveTimeline(state.workspace, (tl) =>
        plPlaceBlockAtIndex(tl, source, termId, lessonsClaimed, atIndex)
      ),
      dirty: true,
    })),

  moveBlockToIndex: (placedBlockId, toTermId, atIndex) =>
    set((state) => ({
      workspace: updateActiveTimeline(state.workspace, (tl) =>
        plMoveBlockToIndex(tl, placedBlockId, toTermId, atIndex)
      ),
      dirty: true,
    })),

  extractAndMoveLessonToIndex: (placedBlockId, localLessonIdx, toTermId, atIndex) =>
    set((state) => ({
      workspace: updateActiveTimeline(state.workspace, (tl) =>
        plExtractAndMoveLessonToIndex(tl, placedBlockId, localLessonIdx, toTermId, atIndex)
      ),
      dirty: true,
    })),

  placeLessonAtIndex: (subTopicCode, absLessonIdx, termId, atIndex) =>
    set((state) => ({
      workspace: updateActiveTimeline(state.workspace, (tl) =>
        plPlaceLessonAtIndex(tl, subTopicCode, absLessonIdx, termId, atIndex)
      ),
      dirty: true,
    })),

  removePlacedLesson: (placedBlockId, localLessonIdx) =>
    set((state) => ({
      workspace: updateActiveTimeline(state.workspace, (tl) =>
        plRemovePlacedLesson(tl, placedBlockId, localLessonIdx)
      ),
      dirty: true,
    })),

  setPlacedBlockTitle: (placedBlockId, title) =>
    set((state) => ({
      workspace: updateActiveTimeline(state.workspace, (tl) =>
        plSetPlacedBlockTitle(tl, placedBlockId, title)
      ),
      dirty: true,
    })),

  reorderLessonInSubTopic: (subTopicCode, lessonId, toIndex) =>
    set((state) => {
      const id = state.workspace.activeSubjectId;
      if (!id) return {};
      const subject = state.workspace.subjects.find((s) => s.id === id);
      if (!subject) return {};
      const updated: Subject = {
        ...subject,
        workingSpec: specReorderLessonInSubTopic(
          subject.workingSpec,
          subTopicCode,
          lessonId,
          toIndex
        ),
      };
      return {
        workspace: replaceSubject(state.workspace, id, updated),
        dirty: true,
      };
    }),

  editLesson: (subTopicCode, lessonId, patch) =>
    set((state) => {
      const id = state.workspace.activeSubjectId;
      if (!id) return {};
      const subject = state.workspace.subjects.find((s) => s.id === id);
      if (!subject) return {};
      const updated: Subject = {
        ...subject,
        workingSpec: specUpdateLesson(subject.workingSpec, subTopicCode, lessonId, patch),
      };
      return {
        workspace: replaceSubject(state.workspace, id, updated),
        dirty: true,
      };
    }),

  setLessonObjectives: (subTopicCode, lessonId, objectives) =>
    set((state) => {
      const id = state.workspace.activeSubjectId;
      if (!id) return {};
      const subject = state.workspace.subjects.find((s) => s.id === id);
      if (!subject) return {};
      const updated: Subject = {
        ...subject,
        workingSpec: specSetLessonObjectives(
          subject.workingSpec,
          subTopicCode,
          lessonId,
          objectives
        ),
      };
      return {
        workspace: replaceSubject(state.workspace, id, updated),
        dirty: true,
      };
    }),

  addLesson: (subTopicCode, lesson) =>
    set((state) => {
      const id = state.workspace.activeSubjectId;
      if (!id) return {};
      const subject = state.workspace.subjects.find((s) => s.id === id);
      if (!subject) return {};
      const updated: Subject = {
        ...subject,
        workingSpec: specAppendLesson(subject.workingSpec, subTopicCode, lesson),
      };
      return {
        workspace: replaceSubject(state.workspace, id, updated),
        dirty: true,
      };
    }),

  placeObjectiveInLesson: (objectiveId, toSubTopicCode, toLessonId) =>
    set((state) => {
      const id = state.workspace.activeSubjectId;
      if (!id) return {};
      const subject = state.workspace.subjects.find((s) => s.id === id);
      if (!subject) return {};
      // Resolve the objective: prefer working spec (currently mapped) so any
      // user edits to its text/depth ride along; fall back to imported spec
      // (restoring an unmapped objective).
      const current =
        findObjectiveLocation(subject.workingSpec, objectiveId) ??
        findObjectiveLocation(subject.importedSpec, objectiveId);
      if (!current) return {};
      if (current.lesson.id === toLessonId) return {}; // no-op same-target
      const removed = specRemoveObjective(subject.workingSpec, objectiveId);
      const added = specAddObjectiveToLesson(
        removed,
        toSubTopicCode,
        toLessonId,
        current.objective
      );
      const updated: Subject = { ...subject, workingSpec: added };
      return {
        workspace: replaceSubject(state.workspace, id, updated),
        dirty: true,
      };
    }),

  removeObjective: (objectiveId) =>
    set((state) => {
      const id = state.workspace.activeSubjectId;
      if (!id) return {};
      const subject = state.workspace.subjects.find((s) => s.id === id);
      if (!subject) return {};
      const updated: Subject = {
        ...subject,
        workingSpec: specRemoveObjective(subject.workingSpec, objectiveId),
      };
      return {
        workspace: replaceSubject(state.workspace, id, updated),
        dirty: true,
      };
    }),

  updateObjective: (objectiveId, patch) =>
    set((state) => {
      const id = state.workspace.activeSubjectId;
      if (!id) return {};
      const subject = state.workspace.subjects.find((s) => s.id === id);
      if (!subject) return {};
      const updated: Subject = {
        ...subject,
        workingSpec: specUpdateObjective(subject.workingSpec, objectiveId, patch),
      };
      return {
        workspace: replaceSubject(state.workspace, id, updated),
        dirty: true,
      };
    }),

  addObjectiveToLesson: (subTopicCode, lessonId, objective) =>
    set((state) => {
      const id = state.workspace.activeSubjectId;
      if (!id) return {};
      const subject = state.workspace.subjects.find((s) => s.id === id);
      if (!subject) return {};
      const updated: Subject = {
        ...subject,
        workingSpec: specAddObjectiveToLesson(
          subject.workingSpec,
          subTopicCode,
          lessonId,
          objective
        ),
      };
      return {
        workspace: replaceSubject(state.workspace, id, updated),
        dirty: true,
      };
    }),

  setCurrentView: (view) => set({ currentView: view }),
  setCurrentTermId: (termId) => set({ currentTermId: termId }),

  setWorkspace: (workspace) => set({ workspace, dirty: false }),
  setSavePath: (path) => set({ currentSavePath: path }),
  markClean: () => set({ dirty: false }),
  clearWorkspace: () => set({ ...initialState }),

  setCalendarTemplate: (template) =>
    set((state) => {
      const ws = state.workspace;
      // When clearing, build a Workspace without the field at all — keeps
      // `null` out of serialised output and preserves the "no template
      // configured" semantics. `exactOptionalPropertyTypes` rejects
      // `{ ...ws, calendarTemplate: undefined }`.
      let next: Workspace;
      if (template === null) {
        next = { activeSubjectId: ws.activeSubjectId, subjects: ws.subjects };
      } else {
        next = { ...ws, calendarTemplate: template };
      }
      return { workspace: next, dirty: true };
    }),

  setSubjectCalendarTemplate: (subjectId, template) => {
    let orphans: readonly import("@/model/types").PlacedBlock[] = [];
    set((state) => {
      const subject = state.workspace.subjects.find((s) => s.id === subjectId);
      if (!subject) return {};
      const result = applyTemplateToSubject(subject, template);
      orphans = result.orphans;
      const updated: Subject = {
        ...subject,
        timeline: result.timeline,
        calendarTemplate: template,
      };
      return {
        workspace: replaceSubject(state.workspace, subjectId, updated),
        dirty: true,
      };
    });
    return orphans;
  },

  toggleYearVisibility: (subjectId, year) =>
    set((state) => {
      const subject = state.workspace.subjects.find((s) => s.id === subjectId);
      if (!subject) return {};
      const current = subject.config.hiddenYears ?? [];
      const next = current.includes(year)
        ? current.filter((y) => y !== year)
        : [...current, year];
      const updated: Subject = {
        ...subject,
        config: { ...subject.config, hiddenYears: next },
      };
      return {
        workspace: replaceSubject(state.workspace, subjectId, updated),
        dirty: true,
      };
    }),

  setSubjectHiddenYears: (subjectId, hidden) =>
    set((state) => {
      const subject = state.workspace.subjects.find((s) => s.id === subjectId);
      if (!subject) return {};
      const updated: Subject = {
        ...subject,
        config: { ...subject.config, hiddenYears: hidden },
      };
      return {
        workspace: replaceSubject(state.workspace, subjectId, updated),
        dirty: true,
      };
    }),

  setSubjectKeyStage: (subjectId, keyStage) =>
    set((state) => {
      const subject = state.workspace.subjects.find((s) => s.id === subjectId);
      if (!subject) return {};
      // `exactOptionalPropertyTypes` rejects `keyStage: undefined`; rebuild
      // the meta object without the field when clearing.
      let nextMeta: Subject["meta"];
      if (keyStage === null) {
        nextMeta = {
          name: subject.meta.name,
          colour: subject.meta.colour,
          sourceFilename: subject.meta.sourceFilename,
        };
      } else {
        nextMeta = { ...subject.meta, keyStage };
      }
      const updated: Subject = { ...subject, meta: nextMeta };
      return {
        workspace: replaceSubject(state.workspace, subjectId, updated),
        dirty: true,
      };
    }),

  applyPresetLayout: (presetId) =>
    set((state) => {
      const id = state.workspace.activeSubjectId;
      if (!id) return {};
      const subject = state.workspace.subjects.find((s) => s.id === id);
      if (!subject) return {};
      const nextTimeline = applyPreset(subject, presetId);
      const updated: Subject = { ...subject, timeline: nextTimeline };
      return {
        workspace: replaceSubject(state.workspace, id, updated),
        dirty: true,
      };
    }),

  saveCurrentLayoutAsPreset: (name, description) => {
    let newId: string | null = null;
    set((state) => {
      const id = state.workspace.activeSubjectId;
      if (!id) return {};
      const subject = state.workspace.subjects.find((s) => s.id === id);
      if (!subject) return {};
      const trimmed = name.trim();
      if (!trimmed) return {};
      const preset = saveCurrentAsPreset(subject, {
        name: trimmed,
        ...(description && description.trim() ? { description: description.trim() } : {}),
      });
      newId = preset.id;
      const updated = addPresetToSubject(subject, preset);
      return {
        workspace: replaceSubject(state.workspace, id, updated),
        dirty: true,
      };
    });
    return newId;
  },

  applySavedPresetById: (presetId) => {
    let orphans: ApplySavedPresetResult["orphans"] | null = null;
    set((state) => {
      const id = state.workspace.activeSubjectId;
      if (!id) return {};
      const subject = state.workspace.subjects.find((s) => s.id === id);
      if (!subject) return {};
      const preset = (subject.presets ?? []).find((p) => p.id === presetId);
      if (!preset) return {};
      const result = applySavedPreset(subject, preset);
      orphans = result.orphans;
      return {
        workspace: replaceSubject(state.workspace, id, result.subject),
        dirty: true,
      };
    });
    return orphans;
  },

  deleteSavedPreset: (presetId) =>
    set((state) => {
      const id = state.workspace.activeSubjectId;
      if (!id) return {};
      const subject = state.workspace.subjects.find((s) => s.id === id);
      if (!subject) return {};
      if (!(subject.presets ?? []).some((p) => p.id === presetId)) return {};
      const updated = deletePresetFromSubject(subject, presetId);
      return {
        workspace: replaceSubject(state.workspace, id, updated),
        dirty: true,
      };
    }),

  addSavedPreset: (preset) =>
    set((state) => {
      const id = state.workspace.activeSubjectId;
      if (!id) return {};
      const subject = state.workspace.subjects.find((s) => s.id === id);
      if (!subject) return {};
      const updated = addPresetToSubject(subject, preset);
      return {
        workspace: replaceSubject(state.workspace, id, updated),
        dirty: true,
      };
    }),

  renameTopic: (topicCode, patch) =>
    set((state) => {
      const id = state.workspace.activeSubjectId;
      if (!id) return {};
      const subject = state.workspace.subjects.find((s) => s.id === id);
      if (!subject) return {};
      const updated = specRenameTopic(subject, topicCode, patch);
      return {
        workspace: replaceSubject(state.workspace, id, updated),
        dirty: true,
      };
    }),

  renameSubTopic: (subTopicCode, patch) =>
    set((state) => {
      const id = state.workspace.activeSubjectId;
      if (!id) return {};
      const subject = state.workspace.subjects.find((s) => s.id === id);
      if (!subject) return {};
      const updated = specRenameSubTopic(subject, subTopicCode, patch);
      return {
        workspace: replaceSubject(state.workspace, id, updated),
        dirty: true,
      };
    }),

  duplicateLesson: (subTopicCode, lessonId) =>
    set((state) => {
      const id = state.workspace.activeSubjectId;
      if (!id) return {};
      const subject = state.workspace.subjects.find((s) => s.id === id);
      if (!subject) return {};
      const updated: Subject = {
        ...subject,
        workingSpec: specDuplicateLesson(subject.workingSpec, subTopicCode, lessonId),
      };
      return {
        workspace: replaceSubject(state.workspace, id, updated),
        dirty: true,
      };
    }),

  deleteLesson: (subTopicCode, lessonId) =>
    set((state) => {
      const id = state.workspace.activeSubjectId;
      if (!id) return {};
      const subject = state.workspace.subjects.find((s) => s.id === id);
      if (!subject) return {};
      const updated = specDeleteLessonFromSubTopic(subject, subTopicCode, lessonId);
      return {
        workspace: replaceSubject(state.workspace, id, updated),
        dirty: true,
      };
    }),

  duplicateSubTopic: (subTopicCode) =>
    set((state) => {
      const id = state.workspace.activeSubjectId;
      if (!id) return {};
      const subject = state.workspace.subjects.find((s) => s.id === id);
      if (!subject) return {};
      const updated = specDuplicateSubTopic(subject, subTopicCode);
      return {
        workspace: replaceSubject(state.workspace, id, updated),
        dirty: true,
      };
    }),

  deleteSubTopic: (subTopicCode) =>
    set((state) => {
      const id = state.workspace.activeSubjectId;
      if (!id) return {};
      const subject = state.workspace.subjects.find((s) => s.id === id);
      if (!subject) return {};
      const updated = specDeleteSubTopicFromSubject(subject, subTopicCode);
      return {
        workspace: replaceSubject(state.workspace, id, updated),
        dirty: true,
      };
    }),

  moveLessonBetweenSubTopics: (fromCode, lessonId, toCode, toIdx, toTermId) =>
    set((state) => {
      const id = state.workspace.activeSubjectId;
      if (!id) return {};
      const subject = state.workspace.subjects.find((s) => s.id === id);
      if (!subject) return {};
      const updated = specMoveLessonBetweenSubTopics(
        subject,
        fromCode,
        lessonId,
        toCode,
        toIdx,
        toTermId
      );
      return {
        workspace: replaceSubject(state.workspace, id, updated),
        dirty: true,
      };
    }),

  reapplyWorkspaceTemplateToAllSubjects: () => {
    const out = new Map<string, readonly import("@/model/types").PlacedBlock[]>();
    set((state) => {
      const ws = state.workspace;
      if (!ws.calendarTemplate) return {};
      const template = ws.calendarTemplate;
      const nextSubjects = ws.subjects.map((subject): Subject => {
        const result = applyTemplateToSubject(subject, template);
        out.set(subject.id, result.orphans);
        return {
          ...subject,
          timeline: result.timeline,
          calendarTemplate: template,
        };
      });
      return {
        workspace: { ...ws, subjects: nextSubjects },
        dirty: true,
      };
    });
    return out;
  },
}));

// ============================================================
// Autosave + restore wiring (localStorage)
// ============================================================

/**
 * Subscribe the store to localStorage autosave with a 500ms debounce
 * (per SPEC.md §9.2). Returns an unsubscribe function; in a React app, call
 * this once at startup and let it run for the app's lifetime.
 *
 * Safe to call before any actions: the first write only happens after the
 * first workspace mutation.
 */
export function enableAutosave(): () => void {
  if (typeof localStorage === "undefined") return () => {};
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastWorkspace = useWorkspaceStore.getState().workspace;
  const unsub = useWorkspaceStore.subscribe((state) => {
    if (state.workspace === lastWorkspace) return;
    lastWorkspace = state.workspace;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(state.workspace));
      } catch (e) {
        console.warn("[autosave] write failed", e);
      }
    }, AUTOSAVE_DEBOUNCE_MS);
  });
  return () => {
    if (timer) clearTimeout(timer);
    unsub();
  };
}

/**
 * Restore the workspace from localStorage if a saved copy is present.
 * Returns true if a workspace was loaded; false if none was found or the
 * stored data couldn't be parsed.
 *
 * DEC-044: legacy `source.kind === "eoht"` placements are silently migrated
 * to the new custom-block shape. Autosave is unattended recovery state, so
 * popping a migration confirmation dialog at app startup would be annoying.
 * File opens (which the user explicitly initiates) DO show the dialog.
 */
export function loadAutosaved(): boolean {
  if (typeof localStorage === "undefined") return false;
  const raw = localStorage.getItem(AUTOSAVE_KEY);
  if (!raw) return false;
  try {
    let parsed = JSON.parse(raw) as Workspace;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !Array.isArray((parsed as Workspace).subjects)
    ) {
      return false;
    }
    // Silent legacy-EoHT migration. The migrator works on the file-wrapper
    // shape; wrap, migrate, unwrap.
    const wrapped = JSON.stringify({ fileVersion: 1, workspace: parsed });
    if (detectLegacyEoHTPlacements(wrapped)) {
      const migrated = migrateLegacyEoHTPlacements(wrapped);
      parsed = (JSON.parse(migrated) as { workspace: Workspace }).workspace;
      console.info(
        "[autosave] silently migrated legacy EoHT placements to custom blocks (DEC-044)"
      );
    }
    useWorkspaceStore.getState().setWorkspace(parsed);
    return true;
  } catch (e) {
    console.warn("[autosave] restore failed", e);
    return false;
  }
}
