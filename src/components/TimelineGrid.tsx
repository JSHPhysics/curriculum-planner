import { getVisibleTimelineYears, halfTermUsed } from "@/model/timeline";
import type { HalfTerm, Subject, YearId } from "@/model/types";

import { HalfTermCell } from "./HalfTermCell";

export interface TimelineGridProps {
  readonly subject: Subject;
  readonly onBlockClick: (placedBlockId: string) => void;
}

export function TimelineGrid({ subject, onBlockClick }: TimelineGridProps): JSX.Element {
  const years = getVisibleTimelineYears(subject);
  const byYear = new Map<YearId, HalfTerm[]>();
  for (const ht of subject.timeline.halfTerms) {
    const arr = byYear.get(ht.year) ?? [];
    arr.push(ht);
    byYear.set(ht.year, arr);
  }

  return (
    <div className="flex-1 overflow-auto p-4">
      <div className="flex flex-col gap-6 min-w-[1100px]">
        {years.map((year) => {
          const terms = byYear.get(year) ?? [];
          const placed = terms.reduce((s, t) => s + halfTermUsed(t), 0);
          const budget = terms.reduce((s, t) => s + t.budget, 0);
          const over = placed > budget;
          return (
            <section key={year}>
              <header className="flex items-baseline gap-3 mb-2 px-1">
                <h2 className="font-display text-base text-navy">{year}</h2>
                <span
                  className={
                    "font-mono text-xs tabular-nums " +
                    (over ? "text-warn font-semibold" : "text-ink-dim")
                  }
                >
                  {placed} / {budget} lessons
                </span>
              </header>
              <div
                className="grid gap-3"
                style={{
                  gridTemplateColumns: `repeat(${terms.length}, minmax(160px, 1fr))`,
                }}
              >
                {terms.map((ht) => (
                  <HalfTermCell
                    key={ht.id}
                    subject={subject}
                    halfTerm={ht}
                    onBlockClick={onBlockClick}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
