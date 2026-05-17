import { useMemo, useState } from "react";

import {
  DEFAULT_RETRIEVAL_WEIGHTS,
  resolveRetrievalWeights,
  suggestRetrievalCandidates,
  type RetrievalCandidate,
} from "@/model/retrievalSuggestions";
import { getKeyStageForYear, getVisibleKeyStages } from "@/model/timeline";
import type {
  CustomBlock,
  HalfTerm,
  RetrievalWeights,
  Subject,
} from "@/model/types";
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
 *
 * The "Tune scoring" section lets the user adjust the engine's weights for
 * this subject. See docs/PEDAGOGY.md for the rationale behind each knob.
 */
export function RetrievalSuggestionPopover({
  subject,
  halfTerm,
  onClose,
}: RetrievalSuggestionPopoverProps): JSX.Element {
  const addCustomBlock = useWorkspaceStore((s) => s.addCustomBlock);
  const placeBlock = useWorkspaceStore((s) => s.placeBlock);
  const updateActiveSubjectConfig = useWorkspaceStore((s) => s.updateActiveSubjectConfig);

  const effectiveWeights = useMemo(() => resolveRetrievalWeights(subject), [subject]);
  // Only show the cross-KS toggle when the subject's visible timeline actually
  // spans multiple key stages — otherwise it has no effect and would just be
  // noise (e.g. a KS4-only subject has nothing to revisit from KS3).
  const visibleKs = useMemo(() => getVisibleKeyStages(subject), [subject]);
  const contextKs = getKeyStageForYear(halfTerm.year, subject.meta.keyStage);
  const offerCrossKsToggle = visibleKs.length > 1;

  const [selected, setSelected] = useState<readonly string[]>([]);
  const [lessons, setLessons] = useState(DEFAULT_LESSONS);
  const [tuneOpen, setTuneOpen] = useState(false);
  const [includeCrossKs, setIncludeCrossKs] = useState(false);

  const candidates = useMemo(
    () =>
      suggestRetrievalCandidates(subject, halfTerm.id, {
        maxCandidates: MAX_CANDIDATES,
        restrictToContextKeyStage: !includeCrossKs,
      }),
    [subject, halfTerm.id, includeCrossKs]
  );

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

  function patchWeights(patch: Partial<RetrievalWeights>): void {
    updateActiveSubjectConfig({
      retrievalWeights: { ...(subject.config.retrievalWeights ?? {}), ...patch },
    });
  }

  function resetWeights(): void {
    updateActiveSubjectConfig({ retrievalWeights: {} });
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
        className="bg-bg rounded-card border border-line w-[640px] max-w-[95vw] max-h-[90vh] overflow-hidden flex flex-col shadow-xl"
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
          {offerCrossKsToggle && (
            <div className="flex items-center gap-2 mt-2 text-[11px]">
              <label className="flex items-center gap-1.5 text-ink-dim cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeCrossKs}
                  onChange={(e) => setIncludeCrossKs(e.target.checked)}
                  className="accent-gold"
                />
                Include cross-KS revisits
              </label>
              <span className="text-ink-fade">
                (context is {contextKs}; off = only suggest {contextKs} content)
              </span>
            </div>
          )}
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

          <details
            className="mt-5 border-t border-line pt-3"
            open={tuneOpen}
            onToggle={(e) => setTuneOpen((e.target as HTMLDetailsElement).open)}
          >
            <summary className="cursor-pointer text-xs text-ink-dim hover:text-ink select-none">
              ⚙ Tune scoring for this subject
            </summary>
            <WeightsEditor
              weights={effectiveWeights}
              onChange={patchWeights}
              onReset={resetWeights}
              hasOverrides={
                subject.config.retrievalWeights !== undefined &&
                Object.keys(subject.config.retrievalWeights).length > 0
              }
            />
          </details>
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

interface WeightsEditorProps {
  readonly weights: Required<RetrievalWeights>;
  readonly onChange: (patch: Partial<RetrievalWeights>) => void;
  readonly onReset: () => void;
  readonly hasOverrides: boolean;
}

function WeightsEditor({
  weights,
  onChange,
  onReset,
  hasOverrides,
}: WeightsEditorProps): JSX.Element {
  return (
    <div className="mt-3 space-y-3 bg-surface-2/40 p-3 rounded border border-line text-xs">
      <p className="text-ink-dim text-[11px] leading-snug">
        Changes here apply only to this subject and re-rank the candidate list above immediately.
        See <code className="font-mono">docs/PEDAGOGY.md</code> for the full rationale behind each
        weight.
      </p>
      <WeightRow
        label="Peak gap (half-terms)"
        value={weights.peakGapHalfTerms}
        defaultValue={DEFAULT_RETRIEVAL_WEIGHTS.peakGapHalfTerms}
        min={1}
        max={20}
        step={1}
        onChange={(v) => onChange({ peakGapHalfTerms: v })}
        rationale="Half-terms-since-last-touch that maps to a peak gapScore of 1. The dominant signal in the formula. Lower = the engine prioritises recently-taught content; higher = only flag genuinely earlier-in-the-year content. Default 12 (~one school year) sits inside Cepeda et al.'s optimal ISI window for year-end retention."
      />
      <WeightRow
        label="Depth bonus"
        value={weights.depthBonus}
        defaultValue={DEFAULT_RETRIEVAL_WEIGHTS.depthBonus}
        min={0}
        max={0.5}
        step={0.05}
        onChange={(v) => onChange({ depthBonus: v })}
        rationale="Flat bonus when the sub-topic (or any of its lessons) carries the Extra-depth flag from import. Depth content tends to receive less implicit revisit through subsequent teaching, so spaced retrieval matters more for retention. Set to 0 if your import's depth flags aren't pedagogically meaningful."
      />
      <WeightRow
        label="Difficulty bonus per level"
        value={weights.difficultyBonusPerLevel}
        defaultValue={DEFAULT_RETRIEVAL_WEIGHTS.difficultyBonusPerLevel}
        min={0}
        max={0.3}
        step={0.05}
        onChange={(v) => onChange({ difficultyBonusPerLevel: v })}
        rationale="Multiplied by (difficulty - 1), so Difficulty=1 gets 0, =2 gets one bonus, =3 gets two. Harder content produces stronger encoding through effortful retrieval (Craik & Lockhart 1972; Bjork). Kept small relative to gapScore because difficulty is an authoring signal, not a student-performance signal."
      />
      <WeightRow
        label="Repeated placement penalty"
        value={weights.repeatedPlacementPenalty}
        defaultValue={DEFAULT_RETRIEVAL_WEIGHTS.repeatedPlacementPenalty}
        min={-0.5}
        max={0}
        step={0.05}
        onChange={(v) => onChange({ repeatedPlacementPenalty: v })}
        rationale="Applied (once) when the sub-topic has been taught more than once before this cell. Nudges the engine to surface neglected content first. The forgetting curve flattens with successive successful retrievals, so revisits beyond the third have diminishing returns. Adjust further negative to aggressively de-prioritise already-revisited content."
      />
      <div className="flex items-center justify-end pt-1">
        <button
          type="button"
          onClick={onReset}
          disabled={!hasOverrides}
          className="text-[11px] px-2 py-1 border border-line rounded hover:bg-surface disabled:opacity-40 disabled:cursor-not-allowed"
          title="Restore the four weights to their built-in defaults"
        >
          Reset to defaults
        </button>
      </div>
    </div>
  );
}

interface WeightRowProps {
  readonly label: string;
  readonly value: number;
  readonly defaultValue: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly onChange: (v: number) => void;
  readonly rationale: string;
}

function WeightRow({
  label,
  value,
  defaultValue,
  min,
  max,
  step,
  onChange,
  rationale,
}: WeightRowProps): JSX.Element {
  const isCustom = value !== defaultValue;
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-ink-dim flex-1">{label}</span>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-32 accent-gold"
          aria-label={label}
        />
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) onChange(n);
          }}
          className={
            "w-16 px-1.5 py-0.5 border rounded font-mono text-[11px] " +
            (isCustom ? "border-gold bg-gold/10" : "border-line")
          }
        />
        {isCustom && (
          <span className="text-[10px] text-gold font-mono" title={`Default: ${defaultValue}`}>
            edited
          </span>
        )}
      </div>
      <details className="ml-1">
        <summary className="cursor-pointer text-[10px] text-ink-fade hover:text-ink select-none">
          Why this weight?
        </summary>
        <p className="text-[11px] text-ink-dim mt-1 leading-snug pl-3 border-l-2 border-line-2">
          {rationale}
        </p>
      </details>
    </div>
  );
}

function makeId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `cb-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  }
}
