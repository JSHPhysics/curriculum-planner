import { useState } from "react";

import { CodeConflictError, type SubTopicRenamePatch } from "@/model/specEdits";
import type { SubTopic } from "@/model/types";

export interface SubTopicEditModalProps {
  readonly subTopic: SubTopic;
  readonly onCancel: () => void;
  readonly onSave: (patch: SubTopicRenamePatch) => void;
}

/**
 * Inspect + rename a sub-topic. Editable fields:
 *   - name (free text)
 *   - code (cascades to placements / custom-block revisits / saved presets)
 *   - difficulty (1–3)
 *   - depth flag, separate-only flag
 *   - notes (free text)
 *
 * Sub-topic codes carry placement references, so renaming the code is an
 * atomic data-model edit — the timeline, custom blocks, and saved presets
 * are rewritten in one store action.
 */
export function SubTopicEditModal({
  subTopic,
  onCancel,
  onSave,
}: SubTopicEditModalProps): JSX.Element {
  const [name, setName] = useState(subTopic.name);
  const [code, setCode] = useState(subTopic.code);
  const [difficulty, setDifficulty] = useState<1 | 2 | 3>(subTopic.difficulty);
  const [isDepth, setIsDepth] = useState(subTopic.isDepth);
  const [separateOnly, setSeparateOnly] = useState(subTopic.separateOnly);
  const [notes, setNotes] = useState(subTopic.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  function handleSave(): void {
    setError(null);
    const trimmedName = name.trim();
    const trimmedCode = code.trim();
    if (!trimmedName) {
      setError("Name cannot be empty.");
      return;
    }
    if (!trimmedCode) {
      setError("Code cannot be empty.");
      return;
    }
    const trimmedNotes = notes.trim();
    const patch: SubTopicRenamePatch = {
      ...(trimmedName !== subTopic.name ? { name: trimmedName } : {}),
      ...(trimmedCode !== subTopic.code ? { newCode: trimmedCode } : {}),
      ...(difficulty !== subTopic.difficulty ? { difficulty } : {}),
      ...(isDepth !== subTopic.isDepth ? { isDepth } : {}),
      ...(separateOnly !== subTopic.separateOnly ? { separateOnly } : {}),
      ...(trimmedNotes !== (subTopic.notes ?? "")
        ? { notes: trimmedNotes === "" ? null : trimmedNotes }
        : {}),
    };
    try {
      onSave(patch);
    } catch (e) {
      if (e instanceof CodeConflictError) {
        setError(e.message);
      } else {
        setError((e as Error).message);
      }
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="subtopic-edit-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={onCancel}
    >
      <div
        className="bg-bg rounded-card border border-line w-[520px] max-w-full overflow-hidden flex flex-col shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-3 border-b border-line">
          <h2 id="subtopic-edit-title" className="font-display text-lg text-navy">
            Edit sub-topic
          </h2>
          <p className="text-[11px] text-ink-fade mt-1">
            Renaming the code rewrites every placement and saved-preset
            reference that points at it. Lessons + objectives keep their ids.
          </p>
        </header>

        <div className="px-5 py-4 space-y-3">
          <div className="flex gap-3">
            <Field label="Name" htmlFor="subtopic-edit-name" wide>
              <input
                id="subtopic-edit-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                className="w-full px-2 py-1 border border-line rounded text-sm"
              />
            </Field>
            <Field label="Code" htmlFor="subtopic-edit-code">
              <input
                id="subtopic-edit-code"
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-24 px-2 py-1 border border-line rounded font-mono text-sm"
              />
            </Field>
          </div>
          <div className="flex gap-3 items-end">
            <Field label="Difficulty" htmlFor="subtopic-edit-difficulty">
              <select
                id="subtopic-edit-difficulty"
                value={difficulty}
                onChange={(e) => setDifficulty(Number(e.target.value) as 1 | 2 | 3)}
                className="w-20 px-2 py-1 border border-line rounded text-sm"
              >
                <option value={1}>1 (foundation)</option>
                <option value={2}>2 (standard)</option>
                <option value={3}>3 (challenging)</option>
              </select>
            </Field>
            <label className="flex items-center gap-2 text-xs text-ink-dim">
              <input
                type="checkbox"
                checked={isDepth}
                onChange={(e) => setIsDepth(e.target.checked)}
              />
              Depth-extension
            </label>
            <label className="flex items-center gap-2 text-xs text-ink-dim">
              <input
                type="checkbox"
                checked={separateOnly}
                onChange={(e) => setSeparateOnly(e.target.checked)}
              />
              Triple-only
            </label>
          </div>
          <Field label="Notes" htmlFor="subtopic-edit-notes" wide>
            <textarea
              id="subtopic-edit-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full px-2 py-1 border border-line rounded text-xs"
            />
          </Field>
          {error && (
            <p className="text-xs text-warn bg-warn/10 border border-warn/30 rounded p-2">
              {error}
            </p>
          )}
        </div>

        <footer className="px-5 py-3 border-t border-line flex items-center gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-sm border border-line rounded hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-3 py-1.5 text-sm bg-navy text-bg rounded hover:bg-navy-dim focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy"
          >
            Save
          </button>
        </footer>
      </div>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  wide,
  children,
}: {
  readonly label: string;
  readonly htmlFor: string;
  readonly wide?: boolean;
  readonly children: React.ReactNode;
}): JSX.Element {
  return (
    <div className={wide ? "flex-1" : ""}>
      <label htmlFor={htmlFor} className="block text-xs text-ink-dim mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}
