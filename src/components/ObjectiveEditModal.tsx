import { useEffect, useState } from "react";

import { findObjectiveLocation } from "@/model/objectives";
import type { Subject } from "@/model/types";

export interface ObjectiveEditModalProps {
  readonly subject: Subject;
  readonly objectiveId: string;
  readonly onClose: () => void;
  readonly onSave: (patch: { text: string; isDepth: boolean }) => void;
  readonly onRemove: () => void;
}

export function ObjectiveEditModal({
  subject,
  objectiveId,
  onClose,
  onSave,
  onRemove,
}: ObjectiveEditModalProps): JSX.Element | null {
  const location =
    findObjectiveLocation(subject.workingSpec, objectiveId) ??
    findObjectiveLocation(subject.importedSpec, objectiveId);

  const [text, setText] = useState(location?.objective.text ?? "");
  const [isDepth, setIsDepth] = useState(location?.objective.isDepth ?? false);

  useEffect(() => {
    if (!location) return;
    setText(location.objective.text);
    setIsDepth(location.objective.isDepth);
  }, [location?.objective.id]);

  if (!location) return null;

  const inImported = findObjectiveLocation(subject.importedSpec, objectiveId) !== null;
  const inWorking = findObjectiveLocation(subject.workingSpec, objectiveId) !== null;
  const isUnmapped = inImported && !inWorking;

  function save(): void {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSave({ text: trimmed, isDepth });
    onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-bg rounded-card border border-line w-[480px] max-w-full overflow-hidden flex flex-col shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-3 border-b border-line">
          <h2 className="font-display text-lg text-ink">Edit objective</h2>
          <p className="text-[11px] text-ink-fade mt-1">
            {isUnmapped ? (
              <>Unmapped (originally from {location.subTopic.code} · L{location.lesson.number}).</>
            ) : (
              <>Currently in {location.subTopic.code} · L{location.lesson.number} — {location.lesson.title}.</>
            )}
            {" Edits modify the working spec."}
          </p>
        </header>

        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs text-ink-dim mb-1">Text</label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              className="w-full px-2 py-1.5 border border-line rounded text-sm resize-vertical"
            />
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={isDepth}
              onChange={(e) => setIsDepth(e.target.checked)}
              className="accent-gold"
            />
            Depth (★)
          </label>
        </div>

        <footer className="px-5 py-3 border-t border-line flex items-center gap-2">
          {!isUnmapped && (
            <button
              onClick={() => {
                if (window.confirm("Remove this objective from its lesson? It will become unmapped if it's a spec objective.")) {
                  onRemove();
                  onClose();
                }
              }}
              className="px-3 py-1.5 text-sm text-warn border border-warn/40 rounded hover:bg-warn/10"
            >
              Remove from lesson
            </button>
          )}
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm border border-line rounded hover:bg-surface-2"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!text.trim()}
            className="px-3 py-1.5 text-sm bg-navy text-bg rounded hover:bg-navy-dim disabled:opacity-50"
          >
            Save
          </button>
        </footer>
      </div>
    </div>
  );
}
