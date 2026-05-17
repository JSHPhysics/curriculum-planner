import { useEffect, useMemo, useState } from "react";

import { findTopicAndSubTopic } from "@/model/queries";
import { getSpacingFlags } from "@/model/spacing";
import type { Subject } from "@/model/types";
import { useWorkspaceStore } from "@/store/useWorkspaceStore";

export interface SpacingPanelProps {
  readonly subject: Subject | null;
}

const EXPANDED_STORAGE_KEY = "curriculum-planner-spacing-panel-expanded-v1";

function readExpandedFromStorage(): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem(EXPANDED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Collapsible diagnostic panel showing rolled-up spacing/interleaving health.
 * Reads pure analytics from `getSpacingFlags` — no store mutations, just
 * surfacing what's already there. Click a sub-topic chip to nothing (yet);
 * click a blocked-cell chip to focus that half-term via `setCurrentTermId`.
 *
 * Expanded state is persisted to localStorage so the user's preference
 * survives reloads.
 */
export function SpacingPanel({ subject }: SpacingPanelProps): JSX.Element | null {
  const setCurrentTermId = useWorkspaceStore((s) => s.setCurrentTermId);
  const [expanded, setExpanded] = useState<boolean>(readExpandedFromStorage);

  useEffect(() => {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(EXPANDED_STORAGE_KEY, expanded ? "1" : "0");
    } catch {
      /* localStorage full / disabled — ignore */
    }
  }, [expanded]);

  const flags = useMemo(() => (subject ? getSpacingFlags(subject) : null), [subject]);

  if (!subject || !flags) return null;

  const total =
    flags.singleTouch.length +
    flags.unplaced.length +
    flags.blockedCells.length +
    flags.wellSpaced.length;
  const allGood =
    flags.singleTouch.length === 0 &&
    flags.unplaced.length === 0 &&
    flags.blockedCells.length === 0;

  return (
    <div className="border-b border-line bg-surface text-xs">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-6 py-1.5 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:ring-inset"
        aria-expanded={expanded}
        aria-controls="spacing-panel-details"
      >
        <span aria-hidden className="text-ink-fade">
          {expanded ? "▾" : "▸"}
        </span>
        <span className="font-display text-ink">Plan health</span>
        {total === 0 ? (
          <span className="text-ink-fade italic">
            No placements yet — drop blocks into the calendar to see spacing analysis.
          </span>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            <Pill
              label={`${flags.singleTouch.length} single-touch`}
              tone={flags.singleTouch.length > 0 ? "warn" : "muted"}
              title="Sub-topics placed exactly once across the year — no spaced retrieval"
            />
            <Pill
              label={`${flags.unplaced.length} unplaced`}
              tone={flags.unplaced.length > 0 ? "warn" : "muted"}
              title="Sub-topics with no placements anywhere in the timeline"
            />
            <Pill
              label={`${flags.blockedCells.length} blocked cells`}
              tone={flags.blockedCells.length > 0 ? "warn" : "muted"}
              title="Half-terms dominated by a single topic — consider interleaving"
            />
            <Pill
              label={`${flags.wellSpaced.length} well-spaced`}
              tone={flags.wellSpaced.length > 0 ? "good" : "muted"}
              title="Sub-topics with 3+ placements and mean gap ≥ 4 half-terms"
            />
            {allGood && (
              <span className="text-good text-[11px]">✓ no spacing warnings</span>
            )}
          </div>
        )}
        <span className="ml-auto text-ink-fade text-[10px]">
          {expanded ? "Click to collapse" : "Click for details"}
        </span>
      </button>

      {expanded && (
        <div
          id="spacing-panel-details"
          className="px-6 py-3 border-t border-line grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
        >
          <Section
            title="Single-touch"
            description="Placed once — consider scheduling a retrieval pass."
            rationale={
              <>
                <p>
                  Sub-topics placed exactly once get no spaced retrieval — the only practice
                  happens within the original teaching block. By exam time that's months or
                  years of forgetting with no reinforcement.
                </p>
                <p>
                  Foundational content that subsequent topics depend on is usually fine
                  (it gets revisited <em>implicitly</em> when applied). Depth-extension or
                  higher-difficulty content that doesn't get implicit revisit is the
                  bigger concern — these are the items worth wrapping in a later retrieval
                  block.
                </p>
                <p className="text-[10px] text-ink-fade">
                  Reference: Cepeda et al. 2006 (spaced practice meta-analysis); Roediger &
                  Karpicke 2006 (testing effect). Full rationale in <code>docs/PEDAGOGY.md</code> §3.
                </p>
              </>
            }
            empty="None"
          >
            {flags.singleTouch.map((code) => (
              <SubTopicChip key={code} code={code} subject={subject} />
            ))}
          </Section>

          <Section
            title="Unplaced"
            description="Not yet anywhere in the calendar."
            rationale={
              <>
                <p>
                  Spec content with no calendar slot is content not taught — a coverage
                  gap rather than a spacing one. The panel surfaces it here because it
                  shares the same "is this on the plan?" question.
                </p>
                <p>
                  If the omission is deliberate (e.g. an optional triple-only topic for a
                  foundation cohort, or content you've decided to skip), the warning is
                  informational and safe to leave.
                </p>
              </>
            }
            empty="Everything is placed"
          >
            {flags.unplaced.map((code) => (
              <SubTopicChip key={code} code={code} subject={subject} />
            ))}
          </Section>

          <Section
            title="Blocked cells"
            description="One topic dominates ≥80% of the lessons in the cell."
            rationale={
              <>
                <p>
                  Cells dominated by a single topic give students extended <em>blocked</em>
                  practice — they build in-session fluency but lose the within-session
                  opportunity to contrast with neighbouring topics, which is the
                  discriminating skill exam questions test.
                </p>
                <p>
                  Rohrer's lab work consistently shows <em>interleaved</em> practice produces
                  stronger transfer for mathematics-like material; the effect generalises
                  to most subjects with discriminable categories. Click any flagged cell
                  to focus it; consider splitting the dominant sub-topic across two
                  half-terms with another topic interleaved between.
                </p>
                <p className="text-[10px] text-ink-fade">
                  Reference: Rohrer & Taylor 2007; Bjork's "desirable difficulties" (1994).
                  Full rationale in <code>docs/PEDAGOGY.md</code> §3.
                </p>
              </>
            }
            empty="No cells dominated by a single topic"
          >
            {flags.blockedCells.map((cell) => (
              <button
                key={cell.halfTermId}
                onClick={() => setCurrentTermId(cell.halfTermId)}
                className="text-[11px] px-2 py-0.5 border border-warn/40 text-warn rounded hover:bg-warn/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warn"
                title={`${cell.lessons} lessons, ${Math.round(cell.dominantShare * 100)}% from ${cell.dominantTopicCode}`}
              >
                {cell.halfTermId} · {cell.dominantTopicCode} {Math.round(cell.dominantShare * 100)}%
              </button>
            ))}
          </Section>

          <Section
            title="Well-spaced"
            description="3+ placements with mean gap ≥4 half-terms."
            rationale={
              <>
                <p>
                  A positive flag. This configuration approximates spaced practice: the
                  sub-topic is encountered repeatedly at intervals long enough for
                  forgetting to begin, which is when retrieval payoff is highest
                  (Bjork's "desirable difficulties").
                </p>
                <p>
                  Use these as templates for other high-priority sub-topics — if a
                  pattern of "Y9 introduction → Y10 deepening → Y11 retrieval" works for
                  one topic, it likely works for similar ones.
                </p>
              </>
            }
            empty="Nothing well-spaced yet"
          >
            {flags.wellSpaced.map((code) => (
              <SubTopicChip key={code} code={code} subject={subject} tone="good" />
            ))}
          </Section>
        </div>
      )}
    </div>
  );
}

interface PillProps {
  readonly label: string;
  readonly tone: "warn" | "good" | "muted";
  readonly title?: string;
}

function Pill({ label, tone, title }: PillProps): JSX.Element {
  const tonalClass =
    tone === "warn"
      ? "bg-warn/10 text-warn border-warn/30"
      : tone === "good"
        ? "bg-good/10 text-good border-good/30"
        : "bg-surface-2 text-ink-fade border-line";
  return (
    <span
      title={title}
      className={"text-[10px] font-mono px-1.5 py-0.5 rounded border " + tonalClass}
    >
      {label}
    </span>
  );
}

interface SectionProps {
  readonly title: string;
  readonly description: string;
  readonly rationale?: React.ReactNode;
  readonly empty: string;
  readonly children: React.ReactNode;
}

function Section({ title, description, rationale, empty, children }: SectionProps): JSX.Element {
  const isEmpty = Array.isArray(children) ? children.length === 0 : !children;
  return (
    <div>
      <div className="font-display text-ink text-[12px] mb-0.5">{title}</div>
      <div className="text-ink-fade text-[10px] mb-1 leading-snug">{description}</div>
      {rationale && (
        <details className="mb-1.5 group">
          <summary className="cursor-pointer text-[10px] text-ink-fade hover:text-ink select-none">
            Why this matters →
          </summary>
          <div className="text-[11px] text-ink-dim mt-1 leading-snug pl-2 border-l-2 border-line-2 space-y-1.5">
            {rationale}
          </div>
        </details>
      )}
      <div className="flex flex-wrap gap-1">
        {isEmpty ? (
          <span className="text-[11px] text-ink-fade italic">{empty}</span>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

interface SubTopicChipProps {
  readonly code: string;
  readonly subject: Subject;
  readonly tone?: "warn" | "good";
}

function SubTopicChip({ code, subject, tone = "warn" }: SubTopicChipProps): JSX.Element {
  const found = findTopicAndSubTopic(subject.workingSpec, code);
  const tonal =
    tone === "good"
      ? "border-good/30 text-good bg-good/5"
      : "border-line text-ink-dim bg-bg";
  return (
    <span
      title={found ? `${found.subTopic.name} (in ${found.topic.name})` : code}
      className={"text-[11px] font-mono px-1.5 py-0.5 rounded border " + tonal}
    >
      {code}
    </span>
  );
}
