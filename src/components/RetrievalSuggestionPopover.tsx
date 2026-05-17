import { useMemo, useState } from "react";

import {
  suggestRetrievalCandidates,
  type RetrievalCandidate,
} from "@/model/retrievalSuggestions";
import type { CustomBlock, HalfTerm, Subject } from "@/model/types";
import { useWorkspaceStore } from "@/store/useWorkspaceStore";

export interface RetrievalSuggestionPopoverProps {
  readonly subject: Subject;
  readonly halfTerm: HalfTerm;
  readonly onClose: () => void;
}

const MAX_CANDIDATES = 12;
const DEFAULT_LESSONS = 1;

/**
 * Modal-style popover that surfaces ranked retrieval candidates for a single
 * half-term. The user picks one or more sub-topics they want to revisit;
 * clicking "Create retrieval block" wraps the selection into a single
 * CustomBlock (kind: "retrieval") and places it in this cell.
 */
export function RetrievalSuggestionPopover({
  subject,
  halfTerm,
  onClose,
}: RetrievalSuggestionPopoverProps): JSX.Element {
  const addCustomBlock = useWorkspaceStore((s) => s.addCustomBlock);
  const placeBlock = useWorkspaceStore((s) => s.placeBlock);

  const candidates = useMemo(
    () => suggestRetrievalCandidates(subject, halfTerm.id, { maxCandidates: MAX_CANDIDATES }),
    [subject, halfTerm.id]
  );

  const [selected, setSelected] = useState<readonly string[]>([]);
  const [lessons, setLessons] = useState(DEFAULT_LESSONS);

  function toggle(code: string): void {
    setSelected((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  }

  function createBlock(): void {
    if (selected.length === 0) return;
    const codes = candidates
      .filter((c) => selected.includes(c.subTopicCode))
      .map((c) => c.subTopicCode);
    const labelPart = codes.length <= 3 ? codes.join(", ") : `${codes.slice(0, 2).join(", ")} +${codes.length - 2}`;
    const block: CustomBlock = {
      id: makeId(),
      name: `Recall: ${labelPart}`,
      lessons,
      colour: "#B98D2C", // gold — distinct from sub-topic colours, signals "revisit"
      isEoHT: false,
      kind: "retrieval",
      revisits: codes,
    };
    addCustomBlock(block);
    placeBlock({ kind: "custom", customBlockId: block.id }, halfTerm.id, lessons);
    onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Suggested revisits for ${halfTerm.year} ${halfTerm.label}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-bg rounded-card border border-line w-[600px] max-w-[95vw] max-h-[85vh] overflow-hidden flex flex-col shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-3 border-b border-line">
          <div className="flex items-baseline gap-2">
            <span className="text-gold text-base" aria-hidden>↺</span>
            <h2 className="font-display text-lg text-ink">
              Suggested revisits for {halfTerm.year} {halfTerm.label}
            </h2>
          </div>
          <p className="text-[11px] text-ink-fade mt-1">
            Ranked by spacing gap × depth × difficulty. Tick the sub-topics you'd cover in retrieval
            (tests, homework, lesson starters) and create a retrieval block in this cell.
          </p>
        </header>

        <div className="px-5 py-4 overflow-y-auto flex-1">
          {candidates.length === 0 ? (
            <p className="text-sm text-ink-fade italic">
              Nothing to revisit yet — no sub-topics have been placed before this half-term. Place
              earlier content first, then come back here.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {candidates.map((c) => (
                <li key={c.subTopicCode}>
                  <CandidateRow
                    candidate={c}
                    selected={selected.includes(c.subTopicCode)}
                    onToggle={() => toggle(c.subTopicCode)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className="px-5 py-3 border-t border-line flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-ink-dim">
            <span>Lessons</span>
            <input
              type="number"
              min={1}
              max={10}
              value={lessons}
              onChange={(e) => setLessons(Math.max(1, Number(e.target.value) || 1))}
              className="w-16 px-2 py-1 border border-line rounded font-mono text-sm"
            />
          </label>
          <span className="text-xs text-ink-fade">
            {selected.length === 0 ? "Pick at least one" : `${selected.length} selected`}
          </span>
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm border border-line rounded hover:bg-surface-2"
          >
            Cancel
          </button>
          <button
            onClick={createBlock}
            disabled={selected.length === 0}
            className="px-3 py-1.5 text-sm bg-gold text-ink rounded hover:bg-gold/80 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Create retrieval block
          </button>
        </footer>
      </div>
    </div>
  );
}

interface CandidateRowProps {
  readonly candidate: RetrievalCandidate;
  readonly selected: boolean;
  readonly onToggle: () => void;
}

function CandidateRow({ candidate, selected, onToggle }: CandidateRowProps): JSX.Element {
  const scorePct = Math.round(candidate.score * 100);
  return (
    <label
      className={
        "flex items-start gap-3 px-3 py-2 border rounded cursor-pointer transition " +
        (selected
          ? "border-gold bg-gold/10"
          : "border-line hover:border-line-2 hover:bg-surface-2")
      }
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        className="accent-gold mt-0.5"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[11px] text-ink-fade">{candidate.subTopicCode}</span>
          <span className="text-sm text-ink truncate">{candidate.subTopicName}</span>
          <span className="text-[10px] font-mono text-ink-fade ml-auto">
            score {scorePct}
          </span>
        </div>
        <div className="text-[11px] text-ink-dim mt-0.5">{candidate.reason}</div>
        <div className="mt-1 h-1 bg-line rounded overflow-hidden" aria-hidden>
          <div className="h-full bg-gold" style={{ width: `${scorePct}%` }} />
        </div>
      </div>
    </label>
  );
}

function makeId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `cb-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  }
}
