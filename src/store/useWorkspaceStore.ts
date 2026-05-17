import { create } from "zustand";

import {
  editBlockLessons as plEditBlockLessons,
  extractAndMoveLesson as plExtractAndMoveLesson,
  moveBlock as plMoveBlock,
  placeBlock as plPlaceBlock,
  placeBlockWithSpillover as plPlaceBlockWithSpillover,
  recombineBlock as plRecombineBlock,
  removeBlock as plRemoveBlock,
  splitBlock as plSplitBlock,
} from "@/model/placement";
import { findObjectiveLocation } from "@/model/objectives";
import { getPlacedBlockIdsForTopicInCell } from "@/model/topics";
import {
  addObjectiveToLesson as specAddObjectiveToLesson,
  appendLesson as specAppendLesson,
  removeObjective as specRemoveObjective,
  setLessonObjectives as specSetLessonObjectives,
  updateLesson as specUpdateLesson,
  updateObjective as specUpdateObjective,
  type LessonEditableFields,
  type ObjectiveEditableFields,
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
  createWorkspace,
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
 */
export function loadAutosaved(): boolean {
  if (typeof localStorage === "undefined") return false;
  const raw = localStorage.getItem(AUTOSAVE_KEY);
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as Workspace;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !Array.isArray((parsed as Workspace).subjects)
    ) {
      return false;
    }
    useWorkspaceStore.getState().setWorkspace(parsed);
    return true;
  } catch (e) {
    console.warn("[autosave] restore failed", e);
    return false;
  }
}
