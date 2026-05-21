import { useEffect, useRef, useState } from "react";

import type { KeyStage, Subject } from "@/model/types";

export interface SubjectTabsProps {
  readonly subjects: readonly Subject[];
  readonly activeSubjectId: string | null;
  readonly onSelect: (subjectId: string) => void;
  readonly onAdd: () => void;
  readonly onClose: (subjectId: string) => void;
  readonly onRename: (subjectId: string, newName: string) => void;
  readonly onRestore: (subjectId: string) => void;
  readonly onEditCalendar: (subjectId: string) => void;
  readonly onSetKeyStage: (subjectId: string, keyStage: KeyStage | null) => void;
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
  onSetKeyStage,
}: SubjectTabsProps): JSX.Element {
  const [menuFor, setMenuFor] = useState<string | null>(null);
  // DEC-054: native window.prompt() is a no-op in Electron with sandbox +
  // contextIsolation (the default since Electron 27+), so the old
  // prompt-based rename did literally nothing on click. Replaced with an
  // inline input rendered inside the subject's menu.
  const [renameFor, setRenameFor] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState<string>("");
  const renameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (renameFor && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renameFor]);

  function handleContextMenu(e: React.MouseEvent, subjectId: string): void {
    e.preventDefault();
    setMenuFor(subjectId === menuFor ? null : subjectId);
    setRenameFor(null);
  }

  function beginRename(subjectId: string, currentName: string): void {
    setRenameFor(subjectId);
    setRenameDraft(currentName);
  }

  function commitRename(subjectId: string, currentName: string): void {
    const trimmed = renameDraft.trim();
    if (trimmed && trimmed !== currentName) {
      onRename(subjectId, trimmed);
    }
    setRenameFor(null);
    setMenuFor(null);
  }

  function cancelRename(): void {
    setRenameFor(null);
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

  function applyKeyStage(subjectId: string, value: KeyStage | null): void {
    onSetKeyStage(subjectId, value);
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
              {s.meta.keyStage && (
                <span
                  className="font-mono text-[9px] px-1 py-0.5 rounded bg-surface-2 text-ink-dim border border-line"
                  title={`Key stage: ${s.meta.keyStage}`}
                >
                  {s.meta.keyStage}
                </span>
              )}
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
                className="absolute right-0 top-full mt-1 z-10 bg-surface border border-line rounded-card shadow-md py-1 min-w-[220px] text-sm"
                onMouseLeave={() => {
                  // Don't close the menu if the rename input is active —
                  // the user could be drifting toward the input mid-edit.
                  if (renameFor !== s.id) setMenuFor(null);
                }}
              >
                {renameFor === s.id ? (
                  <div className="px-3 py-2 flex flex-col gap-1.5">
                    <label
                      htmlFor={`rename-${s.id}`}
                      className="text-[10px] uppercase tracking-wider text-ink-fade"
                    >
                      New subject name
                    </label>
                    <input
                      id={`rename-${s.id}`}
                      ref={renameInputRef}
                      type="text"
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          commitRename(s.id, s.meta.name);
                        } else if (e.key === "Escape") {
                          e.preventDefault();
                          cancelRename();
                        }
                      }}
                      className="w-full px-2 py-1 border border-line rounded text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy"
                    />
                    <div className="flex items-center gap-1.5 justify-end">
                      <button
                        type="button"
                        onClick={cancelRename}
                        className="px-2 py-0.5 text-xs border border-line rounded hover:bg-surface-2"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => commitRename(s.id, s.meta.name)}
                        disabled={!renameDraft.trim() || renameDraft.trim() === s.meta.name}
                        className="px-2 py-0.5 text-xs bg-navy text-bg rounded hover:bg-navy-dim disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => beginRename(s.id, s.meta.name)}
                    className="w-full text-left px-3 py-1.5 hover:bg-surface-2"
                  >
                    Rename…
                  </button>
                )}
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
                <div className="px-3 py-1.5">
                  <div className="text-[10px] uppercase tracking-wider text-ink-fade mb-1">
                    Key stage
                  </div>
                  <div role="radiogroup" className="inline-flex border border-line rounded overflow-hidden">
                    {(["KS3", "KS4", "KS5"] as readonly KeyStage[]).map((ks) => {
                      const active = s.meta.keyStage === ks;
                      return (
                        <button
                          key={ks}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => applyKeyStage(s.id, ks)}
                          className={
                            "px-2 py-1 text-xs font-mono transition border-l border-line first:border-l-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:ring-inset " +
                            (active ? "bg-navy text-bg" : "text-ink hover:bg-surface-2")
                          }
                        >
                          {ks}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => applyKeyStage(s.id, null)}
                      className={
                        "px-2 py-1 text-xs italic transition border-l border-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:ring-inset " +
                        (s.meta.keyStage === undefined ? "bg-surface-2 text-ink-dim" : "text-ink-fade hover:bg-surface-2")
                      }
                      title="Unset key stage"
                    >
                      none
                    </button>
                  </div>
                </div>
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
