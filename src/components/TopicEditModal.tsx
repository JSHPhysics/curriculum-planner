import { useState } from "react";

import { CodeConflictError, type TopicRenamePatch } from "@/model/specEdits";
import type { Topic } from "@/model/types";

export interface TopicEditModalProps {
  readonly topic: Topic;
  readonly onCancel: () => void;
  readonly onSave: (patch: TopicRenamePatch) => void;
}

/**
 * Inspect + rename a topic. Editable fields:
 *   - name (free text)
 *   - code (cascades to sub-topic codes that prefix with the old code, plus
 *     every placement / custom-block revisit / saved-preset reference)
 *   - paper (optional exam-paper label)
 *
 * Code rename is validated against the spec on save; if the store throws a
 * CodeConflictError we surface its message inline so the user can pick a
 * different code without losing their other edits.
 */
export function TopicEditModal({
  topic,
  onCancel,
  onSave,
}: TopicEditModalProps): JSX.Element {
  const [name, setName] = useState(topic.name);
  const [code, setCode] = useState(topic.code);
  const [paper, setPaper] = useState(topic.paper ?? "");
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
    const trimmedPaper = paper.trim();
    const patch: TopicRenamePatch = {
      ...(trimmedName !== topic.name ? { name: trimmedName } : {}),
      ...(trimmedCode !== topic.code ? { newCode: trimmedCode } : {}),
      ...(trimmedPaper !== (topic.paper ?? "")
        ? { paper: trimmedPaper === "" ? null : trimmedPaper }
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
      aria-labelledby="topic-edit-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={onCancel}
    >
      <div
        className="bg-bg rounded-card border border-line w-[480px] max-w-full overflow-hidden flex flex-col shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-3 border-b border-line">
          <h2 id="topic-edit-title" className="font-display text-lg text-navy">
            Edit topic
          </h2>
          <p className="text-[11px] text-ink-fade mt-1">
            Renaming the code cascades to its sub-topics (e.g.{" "}
            <code className="font-mono">T1a</code> → <code className="font-mono">T9a</code>),
            every placement that references them, and any saved presets.
          </p>
        </header>

        <div className="px-5 py-4 space-y-3">
          <Field label="Name" htmlFor="topic-edit-name">
            <input
              id="topic-edit-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              className="w-full px-2 py-1 border border-line rounded text-sm"
            />
          </Field>
          <Field
            label="Code"
            htmlFor="topic-edit-code"
            hint="Short identifier used as a chip on every block."
          >
            <input
              id="topic-edit-code"
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-32 px-2 py-1 border border-line rounded font-mono text-sm"
            />
          </Field>
          <Field
            label="Paper"
            htmlFor="topic-edit-paper"
            hint="Optional exam-paper label (blank to remove)."
          >
            <input
              id="topic-edit-paper"
              type="text"
              value={paper}
              onChange={(e) => setPaper(e.target.value)}
              placeholder="e.g. Paper 1"
              className="w-full px-2 py-1 border border-line rounded text-sm"
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
  hint,
  children,
}: {
  readonly label: string;
  readonly htmlFor: string;
  readonly hint?: string;
  readonly children: React.ReactNode;
}): JSX.Element {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-xs text-ink-dim mb-1">
        {label}
      </label>
      {children}
      {hint && <p className="text-[10px] text-ink-fade mt-1">{hint}</p>}
    </div>
  );
}
