import { useMemo, useState } from "react";

import { findTopicAndSubTopic } from "@/model/queries";
import { getSpacingFlags } from "@/model/spacing";
import type { Subject } from "@/model/types";
import { useWorkspaceStore } from "@/store/useWorkspaceStore";

export interface SpacingPanelProps {
  readonly subject: Subject | null;
}

/**
 * Collapsible diagnostic panel showing rolled-up spacing/interleaving health.
 * Reads pure analytics from `getSpacingFlags` — no store mutations, just
 * surfacing what's already there. Click a sub-topic chip to nothing (yet);
 * click a blocked-cell chip to focus that half-term via `setCurrentTermId`.
 */
export function SpacingPanel({ subject }: SpacingPanelProps): JSX.Element | null {
  const setCurrentTermId = useWorkspaceStore((s) => s.setCurrentTermId);
  const [expanded, setExpanded] = useState(false);

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
            empty="None"
          >
            {flags.singleTouch.map((code) => (
              <SubTopicChip key={code} code={code} subject={subject} />
            ))}
          </Section>

          <Section
            title="Unplaced"
            description="Not yet anywhere in the calendar."
            empty="Everything is placed"
          >
            {flags.unplaced.map((code) => (
              <SubTopicChip key={code} code={code} subject={subject} />
            ))}
          </Section>

          <Section
            title="Blocked cells"
            description="One topic dominates ≥80% of the lessons in the cell."
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
  readonly empty: string;
  readonly children: React.ReactNode;
}

function Section({ title, description, empty, children }: SectionProps): JSX.Element {
  const isEmpty = Array.isArray(children) ? children.length === 0 : !children;
  return (
    <div>
      <div className="font-display text-ink text-[12px] mb-0.5">{title}</div>
      <div className="text-ink-fade text-[10px] mb-1.5 leading-snug">{description}</div>
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
