import type {
  CalendarHalfTerm,
  CalendarTemplate,
  HalfTerm,
  KeyStage,
  PlacedBlock,
  Subject,
  Timeline,
  YearId,
} from "./types";

/**
 * The default LEHS calendar template. Used as the fallback when a workspace
 * doesn't have its own `calendarTemplate` set. Kept here (rather than in a
 * data file) so the type-checker validates the year ids and lesson counts.
 *
 * Cycle length is 2 weeks (LEHS runs a fortnight timetable). Per-year
 * lessons-per-cycle: Y9=4, Y10=7, Y11=6 (preserves the original budgets
 * when multiplied by the half-term week counts below).
 */
export const DEFAULT_CALENDAR_TEMPLATE: CalendarTemplate = {
  cycleLengthInWeeks: 2,
  lessonsPerCyclePerYear: { Y9: 4, Y10: 7, Y11: 6 },
  halfTerms: [
    // Y9 budgets are LEHS-specific hand-tuned values (bank holidays, INSET);
    // the 4-per-fortnight formula would produce 12/12/10/8/12/8 instead.
    { id: "Y9-A1", name: "Aut 1", year: "Y9", weeks: 6, startDate: "2025-09-04", endDate: "2025-10-16", budgetOverride: 12 },
    { id: "Y9-A2", name: "Aut 2", year: "Y9", weeks: 6, startDate: "2025-11-02", endDate: "2025-12-11", budgetOverride: 12 },
    { id: "Y9-S1", name: "Spr 1", year: "Y9", weeks: 5, startDate: "2026-01-06", endDate: "2026-02-12", budgetOverride: 11 },
    { id: "Y9-S2", name: "Spr 2", year: "Y9", weeks: 4, startDate: "2026-02-22", endDate: "2026-03-24", budgetOverride: 9 },
    { id: "Y9-U1", name: "Sum 1", year: "Y9", weeks: 6, startDate: "2026-04-15", endDate: "2026-05-28", budgetOverride: 13 },
    { id: "Y9-U2", name: "Sum 2", year: "Y9", weeks: 4, startDate: "2026-06-07", endDate: "2026-07-07", budgetOverride: 9 },
    { id: "Y10-A1", name: "Aut 1", year: "Y10", weeks: 6, budgetOverride: 21 },
    { id: "Y10-A2", name: "Aut 2", year: "Y10", weeks: 6, budgetOverride: 21 },
    { id: "Y10-S1", name: "Spr 1", year: "Y10", weeks: 5, budgetOverride: 19 },
    { id: "Y10-S2", name: "Spr 2", year: "Y10", weeks: 4, budgetOverride: 16 },
    { id: "Y10-U1", name: "Sum 1", year: "Y10", weeks: 6, budgetOverride: 18 },
    { id: "Y10-U2", name: "Sum 2", year: "Y10", weeks: 4, budgetOverride: 10 },
    { id: "Y11-A1", name: "Aut 1", year: "Y11", weeks: 6, budgetOverride: 18 },
    { id: "Y11-A2", name: "Aut 2", year: "Y11", weeks: 6, budgetOverride: 18 },
    { id: "Y11-S1", name: "Spr 1", year: "Y11", weeks: 5, budgetOverride: 16 },
    { id: "Y11-S2", name: "Spr 2", year: "Y11", weeks: 4, budgetOverride: 14 },
    { id: "Y11-U1", name: "Sum 1", year: "Y11", weeks: 4, budgetOverride: 12 },
  ],
};

/**
 * Turn a CalendarTemplate into a fresh Timeline (no placements yet).
 * Budget per cell = ceil(lessons-per-cycle for this year × weeks ÷ cycle-length).
 * `ceil` rather than `round` to avoid silently capping below the user's
 * declared capacity for short half-terms.
 */
export function applyCalendarTemplate(template: CalendarTemplate): Timeline {
  return {
    halfTerms: template.halfTerms.map((ct): HalfTerm => {
      const perCycle = template.lessonsPerCyclePerYear[ct.year] ?? 0;
      const derived = Math.ceil((perCycle * ct.weeks) / template.cycleLengthInWeeks);
      const budget = ct.budgetOverride ?? derived;
      return {
        id: ct.id,
        year: ct.year,
        label: ct.name,
        dates: formatDateRange(ct.startDate, ct.endDate),
        budget,
        placedBlocks: [],
      };
    }),
  };
}

function formatDateRange(start?: string, end?: string): string | null {
  if (!start && !end) return null;
  if (start && end) return `${humaniseISODate(start)} – ${humaniseISODate(end)}`;
  return humaniseISODate(start ?? end ?? "");
}

function humaniseISODate(iso: string): string {
  // Best-effort: turn "2025-09-04" → "4 Sep". Leaves unparseable strings as-is.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const month = Number(m[2]);
  const day = Number(m[3]);
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthName = monthNames[month - 1] ?? "";
  return `${day} ${monthName}`;
}

export function createDefaultTimeline(): Timeline {
  return applyCalendarTemplate(DEFAULT_CALENDAR_TEMPLATE);
}

// Re-export the calendar half-term shape for convenience.
export type { CalendarHalfTerm };

export interface EoHTOptions {
  readonly lessonsPerEoHT?: number;
  readonly idGen?: () => string;
}

export function createEoHTBlocks(
  timeline: Timeline,
  options: EoHTOptions = {}
): Timeline {
  const lessons = options.lessonsPerEoHT ?? 1;
  const idGen = options.idGen ?? defaultIdGen;
  return {
    halfTerms: timeline.halfTerms.map(
      (ht): HalfTerm => ({
        ...ht,
        placedBlocks: [
          ...ht.placedBlocks,
          eoHTPlacement(idGen(), lessons),
        ],
      })
    ),
  };
}

function eoHTPlacement(id: string, lessons: number): PlacedBlock {
  return {
    id,
    source: { kind: "eoht" },
    lessonsClaimed: lessons,
    lessonRange: [0, lessons],
    splitFrom: null,
    splitType: null,
    userEdits: {},
  };
}

export function halfTermUsed(halfTerm: HalfTerm): number {
  return halfTermUsedFromBlocks(halfTerm.placedBlocks);
}

function halfTermUsedFromBlocks(blocks: readonly PlacedBlock[]): number {
  return blocks.reduce((s, b) => s + b.lessonsClaimed, 0);
}

export function halfTermRoom(halfTerm: HalfTerm): number {
  return Math.max(0, halfTerm.budget - halfTermUsed(halfTerm));
}

const YEAR_ORDER: readonly YearId[] = ["Y7", "Y8", "Y9", "Y10", "Y11", "Y12", "Y13"];

/**
 * Years that appear in this timeline, in canonical Y7→Y13 order. Used by
 * the calendar-aware views (Topic, Sub-topic, Lesson) so they only render
 * year rows the school actually teaches, not the hardcoded Y9–Y11 trio.
 */
export function getTimelineYears(timeline: Timeline): readonly YearId[] {
  const present = new Set<YearId>();
  for (const ht of timeline.halfTerms) present.add(ht.year);
  return YEAR_ORDER.filter((y) => present.has(y));
}

/**
 * Like `getTimelineYears`, minus any years the user has hidden via
 * `subject.config.hiddenYears`. This is the right helper for every render
 * path — views, status bar, exports — that should respect visibility. The
 * underlying timeline data is untouched; hiding is purely a render-time
 * filter, so unhiding restores everything immediately.
 */
export function getVisibleTimelineYears(subject: Subject): readonly YearId[] {
  const hidden = new Set(subject.config.hiddenYears ?? []);
  return getTimelineYears(subject.timeline).filter((y) => !hidden.has(y));
}

/**
 * Auto-detect a key stage from the years present in a timeline. Returns
 * `null` when the timeline straddles multiple key stages (mixed coverage
 * like Y9+Y12) — caller decides what to do.
 *   KS3 = Y7, Y8, Y9 only
 *   KS4 = Y9, Y10, Y11 only (GCSE)
 *   KS5 = Y12, Y13 only (A-Level)
 * Y9 belongs to both KS3 and KS4 in different schools' framings; we use
 * "exclusively in this range" as the test, so a Y7-Y9 spec is KS3 and a
 * Y9-Y11 spec is KS4 but a Y8-Y10 spec returns null.
 */
const KS_RANGES: Record<KeyStage, readonly YearId[]> = {
  KS3: ["Y7", "Y8", "Y9"],
  KS4: ["Y9", "Y10", "Y11"],
  KS5: ["Y12", "Y13"],
};

export function inferKeyStage(timeline: Timeline): KeyStage | null {
  const present = getTimelineYears(timeline);
  if (present.length === 0) return null;
  for (const ks of ["KS3", "KS4", "KS5"] as readonly KeyStage[]) {
    const allowed = new Set(KS_RANGES[ks]);
    if (present.every((y) => allowed.has(y))) return ks;
  }
  return null;
}

function defaultIdGen(): string {
  return crypto.randomUUID();
}
