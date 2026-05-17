import { useState } from "react";

import type { Subject } from "@/model/types";

export interface SubjectTabsProps {
  readonly subjects: readonly Subject[];
  readonly activeSubjectId: string | null;
  readonly onSelect: (subjectId: string) => void;
  readonly onAdd: () => void;
  readonly onClose: (subjectId: string) => void;
  readonly onRename: (subjectId: string, newName: string) => void;
  readonly onRestore: (subjectId: string) => void;
  readonly onEditCalendar: (subjectId: string) => void;
}

export function SubjectTabs({
  subjects,
  activeSubjectId,
  onSelect,
  onAdd,
  onClose,
  onRename,
  onRestore,
  onEditCalendar,
}: SubjectTabsProps): JSX.Element {
  const [menuFor, setMenuFor] = useState<string | null>(null);

  function handleContextMenu(e: React.MouseEvent, subjectId: string): void {
    e.preventDefault();
    setMenuFor(subjectId === menuFor ? null : subjectId);
  }

  function handleRename(subjectId: string, currentName: string): void {
    const next = prompt("New subject name", currentName);
    if (next && next.trim() && next.trim() !== currentName) {
      onRename(subjectId, next.trim());
    }
    setMenuFor(null);
  }

  function handleRestore(subjectId: string): void {
    if (
      confirm(
        "Restore this subject's working spec to its imported state? Edits will be lost; placements survive where possible."
      )
    ) {
      onRestore(subjectId);
    }
    setMenuFor(null);
  }

  function handleClose(subjectId: string, name: string): void {
    if (confirm(`Close "${name}"? Unsaved changes will be lost unless you've saved.`)) {
      onClose(subjectId);
    }
    setMenuFor(null);
  }

  return (
    <div className="flex items-center gap-1">
      {subjects.map((s) => {
        const active = s.id === activeSubjectId;
        return (
          <div key={s.id} className="relative">
            <button
              onClick={() => onSelect(s.id)}
              onContextMenu={(e) => handleContextMenu(e, s.id)}
              className={
                "flex items-center gap-2 px-3 py-1.5 text-sm rounded-card border transition " +
                (active
                  ? "bg-surface border-line-2 text-ink"
                  : "border-transparent text-ink-dim hover:bg-surface-2 hover:text-ink")
              }
            >
              <span
                aria-hidden
                className="inline-block w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: s.meta.colour }}
              />
              <span className="font-medium">{s.meta.name}</span>
              <span
                aria-hidden
                role="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.stopPropagation();
                  handleContextMenu(e, s.id);
                }}
                className="text-ink-fade hover:text-ink ml-1"
                title="Subject menu"
              >
                ⋯
              </span>
            </button>
            {menuFor === s.id && (
              <div
                className="absolute right-0 top-full mt-1 z-10 bg-surface border border-line rounded-card shadow-md py-1 min-w-[180px] text-sm"
                onMouseLeave={() => setMenuFor(null)}
              >
                <button
                  onClick={() => handleRename(s.id, s.meta.name)}
                  className="w-full text-left px-3 py-1.5 hover:bg-surface-2"
                >
                  Rename…
                </button>
                <button
                  onClick={() => handleRestore(s.id)}
                  className="w-full text-left px-3 py-1.5 hover:bg-surface-2"
                >
                  Restore to imported spec…
                </button>
                <button
                  onClick={() => {
                    onEditCalendar(s.id);
                    setMenuFor(null);
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-surface-2"
                >
                  📅 Edit calendar for this subject…
                </button>
                <div className="border-t border-line my-1" />
                <button
                  onClick={() => handleClose(s.id, s.meta.name)}
                  className="w-full text-left px-3 py-1.5 hover:bg-surface-2 text-warn"
                >
                  Close subject
                </button>
              </div>
            )}
          </div>
        );
      })}
      <button
        onClick={onAdd}
        className="px-2 py-1 text-ink-fade hover:text-navy hover:bg-surface-2 rounded-card text-lg leading-none transition"
        title="Add subject from spreadsheet"
        aria-label="Add subject"
      >
        +
      </button>
    </div>
  );
}
