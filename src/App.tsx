import { useCallback, useEffect, useState } from "react";

import { CalendarOverview } from "@/components/CalendarOverview";
import { CalendarSettingsModal } from "@/components/CalendarSettingsModal";
import { Header } from "@/components/Header";
import { LessonView } from "@/components/LessonView";
import { ObjectiveView } from "@/components/ObjectiveView";
import { PresetPickerModal } from "@/components/PresetPickerModal";
import { RestoreToImportModal } from "@/components/RestoreToImportModal";
import { SpacingPanel } from "@/components/SpacingPanel";
import { StatusBar } from "@/components/StatusBar";
import { SubTopicView } from "@/components/SubTopicView";
import { TopicView } from "@/components/TopicView";
import { ViewPlaceholder } from "@/components/ViewPlaceholder";
import { exportSubjectToXlsx } from "@/model/export";
import { importSpec } from "@/model/import";
import {
  applyCalendarTemplate,
  createDefaultTimeline,
  createEoHTBlocks,
  DEFAULT_CALENDAR_TEMPLATE,
  inferKeyStage,
} from "@/model/timeline";
import type { PlacedBlock, Subject } from "@/model/types";
import {
  deserializeWorkspace,
  previewRestoreSubjectToImport,
  serializeWorkspace,
} from "@/model/workspace";
import {
  enableAutosave,
  loadAutosaved,
  useWorkspaceStore,
} from "@/store/useWorkspaceStore";

export function App(): JSX.Element {
  const workspace = useWorkspaceStore((s) => s.workspace);
  const dirty = useWorkspaceStore((s) => s.dirty);
  const currentView = useWorkspaceStore((s) => s.currentView);
  const currentSavePath = useWorkspaceStore((s) => s.currentSavePath);
  const setActiveSubject = useWorkspaceStore((s) => s.setActiveSubject);
  const setCurrentView = useWorkspaceStore((s) => s.setCurrentView);
  const addSubject = useWorkspaceStore((s) => s.addSubject);
  const removeSubject = useWorkspaceStore((s) => s.removeSubject);
  const renameSubject = useWorkspaceStore((s) => s.renameSubject);
  const restoreSubjectToImport = useWorkspaceStore((s) => s.restoreSubjectToImport);
  const updateActiveSubjectConfig = useWorkspaceStore(
    (s) => s.updateActiveSubjectConfig
  );
  const setWorkspace = useWorkspaceStore((s) => s.setWorkspace);
  const setSavePath = useWorkspaceStore((s) => s.setSavePath);
  const markClean = useWorkspaceStore((s) => s.markClean);
  const setCalendarTemplate = useWorkspaceStore((s) => s.setCalendarTemplate);
  const setSubjectCalendarTemplate = useWorkspaceStore((s) => s.setSubjectCalendarTemplate);
  const reapplyWorkspaceTemplateToAllSubjects = useWorkspaceStore(
    (s) => s.reapplyWorkspaceTemplateToAllSubjects
  );
  const setSubjectKeyStage = useWorkspaceStore((s) => s.setSubjectKeyStage);
  const applyPresetLayout = useWorkspaceStore((s) => s.applyPresetLayout);
  /**
   * Calendar modal target: null = closed; { kind:"workspace" } = editing the
   * workspace template; { kind:"subject", subjectId } = editing one subject's
   * own template (its own override of the workspace template).
   */
  const [calendarTarget, setCalendarTarget] = useState<
    | { readonly kind: "workspace" }
    | { readonly kind: "subject"; readonly subjectId: string }
    | null
  >(null);
  const [presetPickerOpen, setPresetPickerOpen] = useState(false);

  useEffect(() => {
    loadAutosaved();
    return enableAutosave();
  }, []);

  // SPEC §9.3: prompt before closing when the workspace is dirty. Browsers and
  // Electron both honour beforeunload for in-window navigation; the Electron
  // window-close path also calls window.api.setDirty so main can intercept.
  useEffect(() => {
    if (typeof window === "undefined") return;
    function onBeforeUnload(e: BeforeUnloadEvent): void {
      if (!dirty) return;
      e.preventDefault();
      // Modern browsers ignore the custom message; setting returnValue is the
      // accepted way to trigger the native confirm prompt.
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    if (typeof window.api !== "undefined" && window.api.setDirty) {
      void window.api.setDirty(dirty);
    }
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const activeSubject =
    workspace.subjects.find((s) => s.id === workspace.activeSubjectId) ?? null;

  const handleAddSubject = useCallback(async () => {
    if (typeof window.api === "undefined") {
      alert("File dialogs require the Electron shell.");
      return;
    }
    const opened = await window.api.openSpreadsheetFile();
    if (!opened) return;
    const buf = opened.buffer.buffer.slice(
      opened.buffer.byteOffset,
      opened.buffer.byteOffset + opened.buffer.byteLength
    ) as ArrayBuffer;
    const name = opened.path.split(/[\\/]/).pop() ?? "Subject";
    const result = importSpec(buf, {
      sourceFilename: name,
      subjectName: name.replace(/\.xlsx$/i, ""),
    });
    if (!result.ok) {
      alert(
        "Import failed:\n" +
          result.errors.map((e) => `${e.code}: ${e.message}`).join("\n")
      );
      return;
    }
    // New subjects inherit the workspace calendar template if one is set;
    // otherwise fall back to the LEHS default. Existing subjects are
    // untouched.
    const baseTimeline = workspace.calendarTemplate
      ? applyCalendarTemplate(workspace.calendarTemplate)
      : createDefaultTimeline();
    const timeline = createEoHTBlocks(baseTimeline);
    // Auto-detect key stage from the years present in the timeline; user
    // can override via the subject tab menu.
    const detectedKs = inferKeyStage(baseTimeline);
    const meta = detectedKs
      ? { ...result.subject.meta, keyStage: detectedKs }
      : result.subject.meta;
    addSubject({ ...result.subject, meta, timeline });
    if (result.warnings.length > 0) {
      console.warn(`[import] ${result.warnings.length} warnings:`, result.warnings);
    }
  }, [addSubject, workspace.calendarTemplate]);

  const handleOpen = useCallback(async () => {
    if (typeof window.api === "undefined") {
      alert("File dialogs require the Electron shell.");
      return;
    }
    const opened = await window.api.openCurriculumFile();
    if (!opened) return;
    try {
      const ws = deserializeWorkspace(opened.json);
      setWorkspace(ws);
      setSavePath(opened.path);
    } catch (e) {
      alert(`Failed to load file: ${(e as Error).message}`);
    }
  }, [setWorkspace, setSavePath]);

  const handleSave = useCallback(async () => {
    if (typeof window.api === "undefined") return;
    const json = serializeWorkspace(workspace);
    const result = await window.api.saveCurriculumFile(json, {
      knownPath: currentSavePath,
    });
    if (result) {
      setSavePath(result.path);
      markClean();
    }
  }, [workspace, currentSavePath, setSavePath, markClean]);

  const handleSaveAs = useCallback(async () => {
    if (typeof window.api === "undefined") return;
    const json = serializeWorkspace(workspace);
    const result = await window.api.saveCurriculumFile(json);
    if (result) {
      setSavePath(result.path);
      markClean();
    }
  }, [workspace, setSavePath, markClean]);

  const handleExport = useCallback(async () => {
    if (typeof window.api === "undefined" || !activeSubject) return;
    const buf = exportSubjectToXlsx(activeSubject);
    const result = await window.api.saveSpreadsheetFile(new Uint8Array(buf), {
      defaultName: `${activeSubject.meta.name}.xlsx`,
    });
    if (result) {
      console.info(`[export] wrote ${result.path}`);
    }
  }, [activeSubject]);

  const handleClose = useCallback(
    (id: string) => {
      removeSubject(id);
    },
    [removeSubject]
  );

  const [restorePending, setRestorePending] = useState<
    | { subject: Subject; orphans: readonly PlacedBlock[] }
    | null
  >(null);

  const handleRestore = useCallback(
    (id: string) => {
      const preview = previewRestoreSubjectToImport(workspace, id);
      setRestorePending({ subject: preview.subject, orphans: preview.orphans });
    },
    [workspace]
  );

  const confirmRestore = useCallback(() => {
    if (!restorePending) return;
    restoreSubjectToImport(restorePending.subject.id);
    setRestorePending(null);
  }, [restorePending, restoreSubjectToImport]);

  return (
    <div className="h-full flex flex-col">
      <Header
        subjects={workspace.subjects}
        activeSubjectId={workspace.activeSubjectId}
        currentView={currentView}
        dirty={dirty}
        currentSavePath={currentSavePath}
        onSelectSubject={setActiveSubject}
        onAddSubject={() => void handleAddSubject()}
        onCloseSubject={handleClose}
        onRenameSubject={renameSubject}
        onRestoreSubject={handleRestore}
        onChangeView={setCurrentView}
        onOpen={() => void handleOpen()}
        onSave={() => void handleSave()}
        onSaveAs={() => void handleSaveAs()}
        onExport={() => void handleExport()}
        onOpenCalendarSettings={() => setCalendarTarget({ kind: "workspace" })}
        onEditSubjectCalendar={(id) => setCalendarTarget({ kind: "subject", subjectId: id })}
        onSetSubjectKeyStage={setSubjectKeyStage}
      />
      <StatusBar
        subject={activeSubject}
        onToggleConfig={updateActiveSubjectConfig}
        onOpenPresetPicker={() => setPresetPickerOpen(true)}
      />
      <CalendarOverview subject={activeSubject} />
      <SpacingPanel subject={activeSubject} />
      <main className="flex-1 flex overflow-hidden">
        {activeSubject && currentView === "topic" ? (
          <TopicView subject={activeSubject} />
        ) : activeSubject && currentView === "sub-topic" ? (
          <SubTopicView subject={activeSubject} />
        ) : activeSubject && currentView === "lesson" ? (
          <LessonView subject={activeSubject} />
        ) : activeSubject && currentView === "objective" ? (
          <ObjectiveView subject={activeSubject} />
        ) : (
          <ViewPlaceholder view={currentView} hasSubject={activeSubject !== null} />
        )}
      </main>
      {restorePending && (
        <RestoreToImportModal
          subject={restorePending.subject}
          orphans={restorePending.orphans}
          onCancel={() => setRestorePending(null)}
          onConfirm={confirmRestore}
        />
      )}
      {presetPickerOpen && activeSubject && (
        <PresetPickerModal
          subject={activeSubject}
          onCancel={() => setPresetPickerOpen(false)}
          onConfirm={(presetId) => {
            applyPresetLayout(presetId);
            setPresetPickerOpen(false);
          }}
        />
      )}
      {calendarTarget && (() => {
        if (calendarTarget.kind === "workspace") {
          return (
            <CalendarSettingsModal
              current={workspace.calendarTemplate}
              scope={{ kind: "workspace" }}
              onCancel={() => setCalendarTarget(null)}
              onSave={(template) => {
                setCalendarTemplate(template);
                // Offer to push the new template onto existing subjects too.
                if (template !== null && workspace.subjects.length > 0) {
                  const apply = confirm(
                    `Workspace template saved. Also re-apply it to all ${workspace.subjects.length} existing subject${workspace.subjects.length === 1 ? "" : "s"}? Placements in cells that the new template doesn't have will become orphans and be discarded.`
                  );
                  if (apply) {
                    const orphansBySubject = reapplyWorkspaceTemplateToAllSubjects();
                    const totalOrphans = [...orphansBySubject.values()].reduce(
                      (s, list) => s + list.length,
                      0
                    );
                    if (totalOrphans > 0) {
                      const breakdown = [...orphansBySubject.entries()]
                        .filter(([, list]) => list.length > 0)
                        .map(([sid, list]) => {
                          const subj = workspace.subjects.find((s) => s.id === sid);
                          return `  • ${subj?.meta.name ?? sid}: ${list.length}`;
                        })
                        .join("\n");
                      alert(
                        `Re-applied. ${totalOrphans} placement${totalOrphans === 1 ? " was" : "s were"} discarded:\n${breakdown}`
                      );
                    }
                  }
                }
                setCalendarTarget(null);
              }}
            />
          );
        }
        const targetSubject = workspace.subjects.find((s) => s.id === calendarTarget.subjectId);
        if (!targetSubject) {
          setCalendarTarget(null);
          return null;
        }
        return (
          <CalendarSettingsModal
            current={targetSubject.calendarTemplate ?? workspace.calendarTemplate}
            scope={{ kind: "subject", subjectName: targetSubject.meta.name }}
            onCancel={() => setCalendarTarget(null)}
            onSave={(template) => {
              // In subject mode the "Reset" button passes null; we resolve
              // that to the workspace template (if any) or the LEHS default.
              const resolved =
                template ?? workspace.calendarTemplate ?? DEFAULT_CALENDAR_TEMPLATE;
              const orphans = setSubjectCalendarTemplate(targetSubject.id, resolved);
              if (orphans.length > 0) {
                alert(
                  `Calendar applied. ${orphans.length} placement${orphans.length === 1 ? " was" : "s were"} discarded because their cells don't exist in the new template.`
                );
              }
              setCalendarTarget(null);
            }}
          />
        );
      })()}
    </div>
  );
}
