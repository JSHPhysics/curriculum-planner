import { useMemo, useState } from "react";

import { getTimelineYears } from "@/model/timeline";
import type { HalfTerm, Subject, YearId } from "@/model/types";
import { useWorkspaceStore } from "@/store/useWorkspaceStore";

export interface CalendarOverviewProps {
  readonly subject: Subject | null;
}

const YEAR_BAND_COLOURS: Record<YearId, string> = {
  Y7: "#A65454",
  Y8: "#947A3D",
  Y9: "#1F3A5F",
  Y10: "#3F7494",
  Y11: "#6E5097",
  Y12: "#5F8554",
  Y13: "#4E7A4E",
};

/**
 * Read-only horizontal strip showing the current subject's calendar
 * structure at a glance. Each cell's width is proportional to its `weeks`,
 * coloured by year. Click a cell to focus its half-term via setCurrentTermId
 * (which other views consult). The strip is collapsible to stay out of the
 * way once the user understands the structure.
 */
export function CalendarOverview({ subject }: CalendarOverviewProps): JSX.Element | null {
  const setCurrentTermId = useWorkspaceStore((s) => s.setCurrentTermId);
  const currentTermId = useWorkspaceStore((s) => s.currentTermId);
  const [expanded, setExpanded] = useState(true);

  interface OverviewData {
    readonly years: readonly YearId[];
    readonly totalWeeks: number;
    readonly byYear: ReadonlyMap<YearId, readonly HalfTerm[]>;
  }
  const { years, totalWeeks, byYear } = useMemo<OverviewData>(() => {
    if (!subject) {
      return { years: [], totalWeeks: 0, byYear: new Map<YearId, readonly HalfTerm[]>() };
    }
    const yrs = getTimelineYears(subject.timeline);
    const grouped = new Map<YearId, HalfTerm[]>();
    let total = 0;
    for (const ht of subject.timeline.halfTerms) {
      const arr = grouped.get(ht.year) ?? [];
      arr.push(ht);
      grouped.set(ht.year, arr);
      // Weeks aren't stored on HalfTerm — derive from budget if we needed
      // an exact figure. For the strip we use a uniform cell width per HT;
      // it's a structural overview, not a calendar map.
      total += 1;
    }
    return { years: yrs, totalWeeks: total, byYear: grouped };
  }, [subject]);

  if (!subject) return null;
  if (subject.timeline.halfTerms.length === 0) return null;

  return (
    <div className="border-b border-line bg-surface-2/40 text-xs">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-6 py-1 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:ring-inset"
        aria-expanded={expanded}
        aria-controls="calendar-overview-strip"
      >
        <span aria-hidden className="text-ink-fade">{expanded ? "▾" : "▸"}</span>
        <span className="font-display text-ink">Calendar overview</span>
        <span className="text-[10px] text-ink-fade">
          {subject.timeline.halfTerms.length} half-terms across {years.join(", ") || "—"}
        </span>
        <span className="ml-auto text-ink-fade text-[10px]">
          {expanded ? "click to collapse" : "click to expand"}
        </span>
      </button>

      {expanded && totalWeeks > 0 && (
        <div id="calendar-overview-strip" className="px-6 pb-2">
          <div className="flex flex-col gap-1">
            {years.map((year) => {
              const cells = byYear.get(year) ?? [];
              return (
                <div key={year} className="flex items-center gap-2">
                  <span
                    className="font-mono text-[10px] w-7 text-ink-dim"
                    style={{ color: YEAR_BAND_COLOURS[year] }}
                  >
                    {year}
                  </span>
                  <div className="flex-1 flex gap-[2px]">
                    {cells.map((ht) => {
                      const focused = ht.id === currentTermId;
                      return (
                        <button
                          key={ht.id}
                          onClick={() => setCurrentTermId(ht.id)}
                          className={
                            "flex-1 min-w-[24px] px-1 py-0.5 text-[9px] font-mono rounded transition truncate " +
                            (focused
                              ? "bg-navy text-bg ring-1 ring-navy"
                              : "bg-bg text-ink-dim hover:bg-surface")
                          }
                          style={{
                            borderLeft: `3px solid ${YEAR_BAND_COLOURS[year]}`,
                          }}
                          title={`${year} ${ht.label}${ht.dates ? " · " + ht.dates : ""} · budget ${ht.budget}`}
                        >
                          {ht.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
