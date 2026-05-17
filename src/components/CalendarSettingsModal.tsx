import { useMemo, useState } from "react";

import {
  applyCalendarTemplate,
  DEFAULT_CALENDAR_TEMPLATE,
} from "@/model/timeline";
import type {
  CalendarHalfTerm,
  CalendarTemplate,
  YearId,
} from "@/model/types";
import { ALL_YEAR_IDS } from "@/model/types";

export type CalendarSettingsScope =
  | { readonly kind: "workspace" }
  | { readonly kind: "subject"; readonly subjectName: string };

export interface CalendarSettingsModalProps {
  readonly current: CalendarTemplate | undefined;
  readonly scope: CalendarSettingsScope;
  readonly onCancel: () => void;
  readonly onSave: (template: CalendarTemplate | null) => void;
}

/**
 * Edit a calendar template — either the workspace-level template (inherited
 * by new subjects) or a specific subject's per-subject override. The scope
 * prop drives the title, footer copy, and the meaning of "Reset to default".
 */
export function CalendarSettingsModal({
  current,
  scope,
  onCancel,
  onSave,
}: CalendarSettingsModalProps): JSX.Element {
  const seed = current ?? DEFAULT_CALENDAR_TEMPLATE;

  const [cycleLengthInWeeks, setCycleLength] = useState(seed.cycleLengthInWeeks);
  const [lessonsPerCycle, setLessonsPerCycle] = useState<Partial<Record<YearId, number>>>(
    () => ({ ...seed.lessonsPerCyclePerYear })
  );
  const [halfTerms, setHalfTerms] = useState<readonly CalendarHalfTerm[]>(seed.halfTerms);

  const enabledYears = useMemo<readonly YearId[]>(
    () =>
      ALL_YEAR_IDS.filter((y) => {
        const v = lessonsPerCycle[y];
        return typeof v === "number" && v > 0;
      }),
    [lessonsPerCycle]
  );

  const halfTermsByYear = useMemo(() => {
    const map = new Map<YearId, CalendarHalfTerm[]>();
    for (const ht of halfTerms) {
      const arr = map.get(ht.year) ?? [];
      arr.push(ht);
      map.set(ht.year, arr);
    }
    return map;
  }, [halfTerms]);

  function toggleYear(year: YearId): void {
    if (enabledYears.includes(year)) {
      // Removing a year: drop its lessons-per-cycle AND its half-terms
      setLessonsPerCycle((prev) => {
        const { [year]: _drop, ...rest } = prev;
        void _drop;
        return rest;
      });
      setHalfTerms((prev) => prev.filter((ht) => ht.year !== year));
    } else {
      // Adding a year: default to 4 lessons per cycle + 6 boilerplate half-terms
      setLessonsPerCycle((prev) => ({ ...prev, [year]: 4 }));
      setHalfTerms((prev) => [...prev, ...freshHalfTermsFor(year)]);
    }
  }

  function setLessons(year: YearId, n: number): void {
    setLessonsPerCycle((prev) => ({ ...prev, [year]: Math.max(0, n) }));
  }

  // `exactOptionalPropertyTypes` won't let us assign `undefined` to an optional
  // string field via spread, so date-clearing flows through these sentinel keys
  // and we rebuild the object explicitly when they're set.
  type HalfTermPatch =
    | Partial<CalendarHalfTerm>
    | { readonly startDateCleared: true }
    | { readonly endDateCleared: true };

  function updateHalfTerm(id: string, patch: HalfTermPatch): void {
    setHalfTerms((prev) =>
      prev.map((ht) => {
        if (ht.id !== id) return ht;
        if ("startDateCleared" in patch) {
          const { startDate: _drop, ...rest } = ht;
          void _drop;
          return rest;
        }
        if ("endDateCleared" in patch) {
          const { endDate: _drop, ...rest } = ht;
          void _drop;
          return rest;
        }
        return { ...ht, ...patch };
      })
    );
  }

  function removeHalfTerm(id: string): void {
    setHalfTerms((prev) => prev.filter((ht) => ht.id !== id));
  }

  function addHalfTermFor(year: YearId): void {
    const existing = halfTerms.filter((ht) => ht.year === year);
    const nextIndex = existing.length + 1;
    setHalfTerms((prev) => [
      ...prev,
      {
        id: nextUniqueId(`${year}-HT${nextIndex}`, prev),
        name: `HT ${nextIndex}`,
        year,
        weeks: 6,
      },
    ]);
  }

  function save(): void {
    if (enabledYears.length === 0) {
      alert("Pick at least one year group to teach.");
      return;
    }
    if (halfTerms.length === 0) {
      alert("Add at least one half-term.");
      return;
    }
    const trimmedLessons: Partial<Record<YearId, number>> = {};
    for (const y of enabledYears) {
      const v = lessonsPerCycle[y];
      if (typeof v === "number" && v > 0) trimmedLessons[y] = v;
    }
    const template: CalendarTemplate = {
      cycleLengthInWeeks: Math.max(1, cycleLengthInWeeks),
      lessonsPerCyclePerYear: trimmedLessons,
      halfTerms,
    };
    onSave(template);
  }

  function resetToDefault(): void {
    const msg =
      scope.kind === "subject"
        ? `Reset ${scope.subjectName}'s calendar to match the workspace template? Placements in cells the workspace template doesn't have will be flagged as orphans.`
        : "Replace your current workspace template with the LEHS default? Existing subjects keep their current timelines.";
    if (!confirm(msg)) return;
    onSave(null); // caller decides what reset means in this scope
  }

  // Preview the derived budget for each half-term so the user can sanity-check
  // their settings before saving.
  const previewTimeline = useMemo(
    () =>
      applyCalendarTemplate({
        cycleLengthInWeeks: Math.max(1, cycleLengthInWeeks),
        lessonsPerCyclePerYear: lessonsPerCycle,
        halfTerms,
      }),
    [cycleLengthInWeeks, lessonsPerCycle, halfTerms]
  );
  const previewByYear = useMemo(() => {
    const map = new Map<YearId, number>();
    for (const ht of previewTimeline.halfTerms) {
      map.set(ht.year, (map.get(ht.year) ?? 0) + ht.budget);
    }
    return map;
  }, [previewTimeline]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Calendar settings"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={onCancel}
    >
      <div
        className="bg-bg rounded-card border border-line w-[760px] max-w-[95vw] max-h-[90vh] overflow-hidden flex flex-col shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-3 border-b border-line">
          <h2 className="font-display text-lg text-ink">
            {scope.kind === "subject"
              ? `Calendar for ${scope.subjectName}`
              : "Workspace calendar"}
          </h2>
          <p className="text-[11px] text-ink-fade mt-1">
            {scope.kind === "subject" ? (
              <>
                Edits this subject's timeline. Placements in cells whose ids
                survive the change are preserved; placements in cells that
                disappear become orphans you'll be warned about before saving.
              </>
            ) : (
              <>
                New subjects added after Save will use this calendar. Existing subjects keep their
                current timelines unchanged. Per-half-term budget is calculated from lessons-per-cycle
                × weeks ÷ cycle length.
              </>
            )}
          </p>
        </header>

        <div className="px-5 py-4 space-y-5 overflow-y-auto flex-1">
          <section>
            <label htmlFor="cal-cycle" className="block text-xs text-ink-dim mb-1">
              Timetable cycle length
            </label>
            <div className="flex items-center gap-2">
              <input
                id="cal-cycle"
                type="number"
                min={1}
                max={4}
                value={cycleLengthInWeeks}
                onChange={(e) => setCycleLength(Math.max(1, Number(e.target.value) || 1))}
                className="w-16 px-2 py-1 border border-line rounded font-mono text-sm"
              />
              <span className="text-xs text-ink-dim">
                {cycleLengthInWeeks === 1
                  ? "1-week timetable"
                  : `${cycleLengthInWeeks}-week timetable`}
              </span>
            </div>
          </section>

          <section>
            <h3 className="text-xs text-ink-dim mb-1">Year groups taught + lessons per cycle</h3>
            <p className="text-[10px] text-ink-fade mb-2">
              Tick a year to include it. Set how many lessons you teach per timetable cycle.
              A cell's budget = lessons-per-cycle × weeks ÷ cycle length.
            </p>
            <div className="grid grid-cols-7 gap-2">
              {ALL_YEAR_IDS.map((year) => {
                const enabled = enabledYears.includes(year);
                return (
                  <label
                    key={year}
                    className={
                      "flex flex-col items-center gap-1 px-2 py-2 border rounded cursor-pointer transition " +
                      (enabled
                        ? "border-navy bg-navy/5 text-ink"
                        : "border-line text-ink-fade hover:border-line-2 hover:text-ink")
                    }
                  >
                    <span className="font-mono text-xs">{year}</span>
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={() => toggleYear(year)}
                      className="accent-navy"
                    />
                    {enabled && (
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={lessonsPerCycle[year] ?? 0}
                        onChange={(e) => setLessons(year, Number(e.target.value) || 0)}
                        className="w-12 px-1 py-0.5 border border-line rounded font-mono text-[11px] text-center"
                        title={`Lessons of ${year} per ${cycleLengthInWeeks}-week cycle`}
                        onClick={(e) => e.preventDefault()}
                      />
                    )}
                  </label>
                );
              })}
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-xs text-ink-dim">Half-terms</h3>
              <span className="text-[10px] text-ink-fade">
                Total derived budget: {[...previewByYear.entries()]
                  .map(([y, b]) => `${y} ${b}L`)
                  .join(" · ") || "—"}
              </span>
            </div>
            {enabledYears.length === 0 && (
              <p className="text-[11px] text-ink-fade italic">
                Enable at least one year group above to configure half-terms.
              </p>
            )}
            <div className="flex flex-col gap-3">
              {enabledYears.map((year) => {
                const yearHTs = halfTermsByYear.get(year) ?? [];
                return (
                  <fieldset key={year} className="border border-line rounded p-2">
                    <legend className="px-1 font-mono text-[11px] text-ink-dim">{year}</legend>
                    <div className="flex flex-col gap-1.5">
                      {yearHTs.map((ht) => {
                        const perCycle = lessonsPerCycle[year] ?? 0;
                        const derivedBudget = Math.ceil(
                          (perCycle * ht.weeks) / Math.max(1, cycleLengthInWeeks)
                        );
                        return (
                          <div key={ht.id} className="flex items-center gap-2 text-[11px]">
                            <input
                              type="text"
                              value={ht.name}
                              onChange={(e) => updateHalfTerm(ht.id, { name: e.target.value })}
                              className="flex-1 px-2 py-1 border border-line rounded"
                              placeholder="e.g. Aut 1"
                              aria-label={`${year} half-term name`}
                            />
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min={1}
                                max={20}
                                value={ht.weeks}
                                onChange={(e) =>
                                  updateHalfTerm(ht.id, {
                                    weeks: Math.max(1, Number(e.target.value) || 1),
                                  })
                                }
                                className="w-12 px-1 py-1 border border-line rounded font-mono text-center"
                                aria-label="Weeks"
                              />
                              <span className="text-ink-fade">weeks</span>
                            </div>
                            <input
                              type="date"
                              value={ht.startDate ?? ""}
                              onChange={(e) =>
                                updateHalfTerm(
                                  ht.id,
                                  e.target.value
                                    ? { startDate: e.target.value }
                                    : { startDateCleared: true }
                                )
                              }
                              className="px-1 py-1 border border-line rounded font-mono text-[11px]"
                              aria-label="Start date"
                              title="Start date (optional)"
                            />
                            <input
                              type="date"
                              value={ht.endDate ?? ""}
                              onChange={(e) =>
                                updateHalfTerm(
                                  ht.id,
                                  e.target.value
                                    ? { endDate: e.target.value }
                                    : { endDateCleared: true }
                                )
                              }
                              className="px-1 py-1 border border-line rounded font-mono text-[11px]"
                              aria-label="End date"
                              title="End date (optional)"
                            />
                            <span
                              className="font-mono text-[10px] text-ink-dim w-12 text-right"
                              title="Derived budget for this cell"
                            >
                              = {derivedBudget}L
                            </span>
                            <button
                              type="button"
                              onClick={() => removeHalfTerm(ht.id)}
                              className="text-warn text-sm px-1.5 leading-none hover:bg-warn/10 rounded"
                              title="Remove this half-term"
                              aria-label={`Remove ${ht.name}`}
                            >
                              ×
                            </button>
                          </div>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => addHalfTermFor(year)}
                        className="self-start text-[11px] px-2 py-1 text-navy border border-dashed border-line-2 rounded hover:border-navy hover:bg-navy/5"
                      >
                        + Add half-term to {year}
                      </button>
                    </div>
                  </fieldset>
                );
              })}
            </div>
          </section>
        </div>

        <footer className="px-5 py-3 border-t border-line flex items-center gap-2">
          <button
            onClick={resetToDefault}
            className="px-3 py-1.5 text-sm border border-line text-ink-dim rounded hover:bg-surface-2"
            title="Replace these settings with the built-in LEHS default"
          >
            {scope.kind === "subject" ? "Reset to workspace template" : "Reset to LEHS default"}
          </button>
          <div className="flex-1" />
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-sm border border-line rounded hover:bg-surface-2"
          >
            Cancel
          </button>
          <button
            onClick={save}
            className="px-3 py-1.5 text-sm bg-navy text-bg rounded hover:bg-navy-dim"
          >
            Save calendar
          </button>
        </footer>
      </div>
    </div>
  );
}

// Six labelled half-terms named in the UK-school convention. Years added via
// `toggleYear` get this skeleton — the user edits names/weeks/dates afterwards.
function freshHalfTermsFor(year: YearId): readonly CalendarHalfTerm[] {
  const names = ["Aut 1", "Aut 2", "Spr 1", "Spr 2", "Sum 1", "Sum 2"];
  return names.map((name, i) => ({
    id: `${year}-HT${i + 1}`,
    name,
    year,
    weeks: 6,
  }));
}

function nextUniqueId(base: string, existing: readonly CalendarHalfTerm[]): string {
  const taken = new Set(existing.map((ht) => ht.id));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
