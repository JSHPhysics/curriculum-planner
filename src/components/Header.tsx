import type { KeyStage, Subject, ViewType } from "@/model/types";

import { SubjectTabs } from "./SubjectTabs";
import { ViewSelector } from "./ViewSelector";

export interface HeaderProps {
  readonly subjects: readonly Subject[];
  readonly activeSubjectId: string | null;
  readonly currentView: ViewType;
  readonly dirty: boolean;
  readonly currentSavePath: string | null;
  readonly onSelectSubject: (id: string) => void;
  readonly onAddSubject: () => void;
  readonly onCloseSubject: (id: string) => void;
  readonly onRenameSubject: (id: string, name: string) => void;
  readonly onRestoreSubject: (id: string) => void;
  readonly onChangeView: (view: ViewType) => void;
  readonly onOpen: () => void;
  readonly onSave: () => void;
  readonly onSaveAs: () => void;
  readonly onExport: () => void;
  readonly onOpenCalendarSettings: () => void;
  readonly onEditSubjectCalendar: (id: string) => void;
  readonly onSetSubjectKeyStage: (id: string, keyStage: KeyStage | null) => void;
}

export function Header(props: HeaderProps): JSX.Element {
  const {
    subjects,
    activeSubjectId,
    currentView,
    dirty,
    currentSavePath,
    onSelectSubject,
    onAddSubject,
    onCloseSubject,
    onRenameSubject,
    onRestoreSubject,
    onChangeView,
    onOpen,
    onSave,
    onSaveAs,
    onExport,
    onOpenCalendarSettings,
    onEditSubjectCalendar,
    onSetSubjectKeyStage,
  } = props;

  const fileName = currentSavePath
    ? currentSavePath.split(/[\\/]/).pop()
    : "Untitled workspace";

  return (
    <header className="flex items-center gap-4 px-6 py-3 border-b border-line bg-bg">
      <div className="flex flex-col">
        <h1 className="font-display text-lg text-navy leading-none">Curriculum Planner</h1>
        <span className="text-[10px] tracking-wider uppercase text-ink-fade mt-0.5">
          {fileName}
          {dirty && <span className="ml-2 text-warn">● unsaved</span>}
        </span>
      </div>

      <div className="ml-6">
        <SubjectTabs
          subjects={subjects}
          activeSubjectId={activeSubjectId}
          onSelect={onSelectSubject}
          onAdd={onAddSubject}
          onClose={onCloseSubject}
          onRename={onRenameSubject}
          onRestore={onRestoreSubject}
          onEditCalendar={onEditSubjectCalendar}
          onSetKeyStage={onSetSubjectKeyStage}
        />
      </div>

      <div className="mx-auto">
        <ViewSelector value={currentView} onChange={onChangeView} />
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onOpenCalendarSettings}
          aria-label="Workspace calendar settings"
          title="Workspace calendar settings"
          className="px-2 py-1 text-base text-ink-dim hover:text-ink hover:bg-surface-2 rounded transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy"
        >
          📅
        </button>
        <ActionButton onClick={onOpen} label="Open" />
        <ActionButton onClick={onSave} label="Save" disabled={!dirty && !!currentSavePath} />
        <ActionButton onClick={onSaveAs} label="Save as…" />
        <ActionButton
          onClick={onExport}
          label="Export"
          disabled={activeSubjectId === null}
          variant="primary"
        />
      </div>
    </header>
  );
}

interface ActionButtonProps {
  readonly onClick: () => void;
  readonly label: string;
  readonly disabled?: boolean;
  readonly variant?: "default" | "primary";
}

function ActionButton({
  onClick,
  label,
  disabled,
  variant = "default",
}: ActionButtonProps): JSX.Element {
  const base = "px-3 py-1.5 text-sm rounded-card transition disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:ring-offset-1 focus-visible:ring-offset-bg";
  const styles =
    variant === "primary"
      ? "bg-navy text-bg hover:bg-navy-dim"
      : "border border-line text-ink hover:bg-surface-2";
  return (
    <button onClick={onClick} disabled={disabled} className={`${base} ${styles}`}>
      {label}
    </button>
  );
}
