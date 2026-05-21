export type ViewType = "topic" | "sub-topic" | "lesson" | "objective";

/**
 * UK secondary year groups, in sequential order. Year labels are stable IDs
 * used as the canonical key for grouping placements by year. Schools that
 * teach only a subset (e.g. KS3 = Y7–Y9, KS4 = Y10–Y11) populate only those
 * subsets in their calendar template — unused years simply don't appear in
 * the timeline.
 */
export type YearId = "Y7" | "Y8" | "Y9" | "Y10" | "Y11" | "Y12" | "Y13";

export const ALL_YEAR_IDS: readonly YearId[] = ["Y7", "Y8", "Y9", "Y10", "Y11", "Y12", "Y13"];

export interface Objective {
  readonly id: string;
  readonly text: string;
  readonly isDepth: boolean;
}

export interface Lesson {
  readonly id: string;
  readonly number: number;
  readonly title: string;
  readonly practical: string | null;
  readonly isDepth: boolean;
  readonly separateOnly: boolean;
  readonly objectives: readonly Objective[];
}

export interface SubTopic {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly difficulty: 1 | 2 | 3;
  readonly isDepth: boolean;
  readonly separateOnly: boolean;
  readonly notes: string | null;
  readonly lessons: readonly Lesson[];
}

export interface Topic {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly paper: string | null;
  readonly subTopics: readonly SubTopic[];
}

export interface Spec {
  readonly topics: readonly Topic[];
}

export type PlacedBlockSource =
  | { readonly kind: "sub-topic"; readonly subTopicCode: string }
  | { readonly kind: "custom"; readonly customBlockId: string }
  | { readonly kind: "eoht" };

export interface PlacedBlock {
  readonly id: string;
  readonly source: PlacedBlockSource;
  readonly lessonsClaimed: number;
  readonly lessonRange: readonly [number, number];
  readonly userEdits: PlacedBlockEdits;
}

export interface PlacedBlockEdits {
  readonly title?: string;
  readonly note?: string;
}

export interface HalfTerm {
  readonly id: string;
  readonly year: YearId;
  readonly label: string;
  readonly dates: string | null;
  readonly budget: number;
  readonly placedBlocks: readonly PlacedBlock[];
}

export interface Timeline {
  readonly halfTerms: readonly HalfTerm[];
}

/**
 * Per DEC-044, all non-spec blocks are CustomBlocks with an explicit category.
 * Replaces the v1 dual-system (`PlacedBlockSource.eoht` + `CustomBlockKind`).
 *
 *   - "test"        — end-of-half-term test, mid-topic check, formative quiz
 *   - "lesson"      — bespoke lesson that isn't in the imported spec
 *   - "unit"        — multi-lesson block representing a teacher-defined unit
 *   - "assessment"  — summative assessment (mock, end-of-year exam)
 *   - "retrieval"   — block referencing earlier sub-topics for spaced retrieval
 *                     (paired with the `revisits` field; see DEC-031)
 *   - "other"       — catch-all for anything that doesn't fit
 *
 * Each block can also carry an optional free-text `label` for a more specific
 * descriptor (e.g. category="test", label="Practical assessment"). The
 * existing `name` field is the headline ("Y9 end-of-Aut1 test"); the `label`
 * is a secondary tag used for filtering / display nuance.
 */
export type CustomBlockCategory =
  | "test"
  | "lesson"
  | "unit"
  | "assessment"
  | "retrieval"
  | "other";

/** @deprecated v1.x type — superseded by CustomBlockCategory per DEC-044. */
export type CustomBlockKind = "standard" | "retrieval";

export interface CustomBlock {
  readonly id: string;
  readonly name: string;
  readonly lessons: number;
  readonly colour: string | null;
  /** @deprecated v1.x flag — auto-seeded EoHT tests now use category="test". */
  readonly isEoHT: boolean;
  /**
   * Block category (DEC-044). Optional only for backwards compat with v1.x
   * `.curriculum` files; the deserializer normalises every loaded block to
   * have one. New code should always set it.
   */
  readonly category?: CustomBlockCategory;
  /** @deprecated v1.x field — preserved for parsing legacy files. Use `category`. */
  readonly kind?: CustomBlockKind;
  /** Optional per-block descriptor; sits alongside the headline `name`. */
  readonly label?: string;
  /** Sub-topic codes this block revisits; only meaningful when category="retrieval". */
  readonly revisits?: readonly string[];
}

/**
 * UK key-stage classification for a subject (see DEC-036). Optional;
 * auto-detected from the timeline's year groups at import where unambiguous,
 * and can be overridden via the subject tab menu.
 */
export type KeyStage = "KS3" | "KS4" | "KS5";

export interface SubjectMeta {
  readonly name: string;
  readonly colour: string;
  readonly sourceFilename: string | null;
  readonly keyStage?: KeyStage;
}

/**
 * Per-subject overrides for the retrieval-suggestion scoring algorithm
 * (see DEC-031). All four fields are optional; missing fields fall back to
 * `DEFAULT_RETRIEVAL_WEIGHTS` in `src/model/retrievalSuggestions.ts`. The
 * shape is documented in `docs/PEDAGOGY.md` so the teacher can reason about
 * which knob to turn for which classroom outcome.
 */
export interface RetrievalWeights {
  readonly peakGapHalfTerms?: number;
  readonly depthBonus?: number;
  readonly difficultyBonusPerLevel?: number;
  readonly repeatedPlacementPenalty?: number;
}

/**
 * Per-subject overrides for the Spacing-panel flag thresholds (see DEC-033).
 * Missing fields fall back to `DEFAULT_SPACING_THRESHOLDS` in
 * `src/model/spacing.ts`. Rationale for each default lives in `docs/PEDAGOGY.md`.
 */
export interface SpacingThresholds {
  readonly blockedCellMinLessons?: number;
  readonly blockedCellDominantShare?: number; // 0..1
  readonly wellSpacedMinPlacements?: number;
  readonly wellSpacedMinMeanGap?: number;
}

/**
 * Granularity for spacing / retrieval analytics (see DEC-042). "topic" is the
 * default — most planning thinking happens at the topic level. "sub-topic" is
 * the deep-dive view. Optional so legacy `.curriculum` files default to topic
 * on load without rewriting the saved blob.
 */
export type SpacingGranularity = "topic" | "sub-topic";

export interface SubjectConfig {
  readonly includeDepth: boolean;
  readonly lostLessonBuffer: boolean;
  /**
   * @deprecated DEC-056: auto-spillover removed entirely. Field kept
   * optional only so legacy `.curriculum` files load without
   * deserialization errors; no code reads it any more.
   */
  readonly autoSpillover?: boolean;
  /**
   * DEC-053: when true (default), custom-block lesson counts (tests,
   * retrieval blocks, bespoke lessons, anything not from the spec) are
   * included in the per-year "placed / budget" header counts. Sub-topic
   * coverage stats (`placedLessons`, `coveragePercent`) are unaffected —
   * those measure spec coverage, which by definition excludes off-spec
   * items. Optional for legacy `.curriculum` files; deserializer treats
   * missing as `true` so existing plans get the honest count immediately.
   */
  readonly includeCustomBlocksInCounts?: boolean;
  readonly retrievalWeights?: RetrievalWeights;
  readonly spacingThresholds?: SpacingThresholds;
  /**
   * Year groups the user has hidden from this subject's views and exports
   * (see DEC-036). All views derive their year list from the timeline minus
   * this set; export functions skip placements in hidden years.
   * Missing = nothing hidden.
   */
  readonly hiddenYears?: readonly YearId[];
  /**
   * Analytics granularity preference for this subject's SpacingPanel +
   * RetrievalSuggestionPopover (DEC-043). Missing = default "topic". Stored
   * per-subject so a planner's preference travels with the `.curriculum` file.
   */
  readonly spacingGranularity?: SpacingGranularity;
}

export interface Subject {
  readonly id: string;
  readonly meta: SubjectMeta;
  readonly importedSpec: Spec;
  readonly workingSpec: Spec;
  readonly timeline: Timeline;
  readonly customBlocks: readonly CustomBlock[];
  readonly config: SubjectConfig;
  /**
   * Per-subject calendar override (see DEC-035). When unset, the subject
   * inherits the workspace-level template at creation time; later workspace
   * template edits don't retroactively change this subject unless the user
   * explicitly re-applies. When set, this subject's timeline is regenerated
   * from THIS template whenever it's edited via the calendar settings modal.
   */
  readonly calendarTemplate?: CalendarTemplate;
  /**
   * User-authored saved layouts (DEC-045). Each preset captures a snapshot of
   * the timeline's sub-topic placements AND the custom blocks the layout
   * depended on, so applying a preset later restores a recognisable plan even
   * if the live state has drifted. Optional only for backwards-compat with
   * pre-v1.5 `.curriculum` files; the deserializer normalises this to `[]`.
   * The JSON shape is documented in docs/PRESET_FORMAT.md so users can author
   * presets by hand or with an LLM.
   */
  readonly presets?: readonly SavedPreset[];
}

/**
 * A user-authored saved layout (DEC-045). Lives on the Subject so it travels
 * with the `.curriculum` file. Applying a preset replaces the subject's
 * sub-topic placements + custom blocks with the preset's contents. Sub-topic
 * references use the importer's stable code (T1, T1a, …) so the preset still
 * applies after spec-edits as long as the code survives.
 *
 * Custom blocks inside a preset use a preset-local `ref` (e.g. "cb1") rather
 * than the subject's CustomBlock IDs — applying a preset always creates fresh
 * CustomBlock IDs in the subject, so refs are only meaningful WITHIN a single
 * preset.
 */
export interface SavedPreset {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly createdAt: string;
  readonly customBlocks: readonly SavedPresetCustomBlock[];
  readonly placements: readonly SavedPresetPlacement[];
}

export interface SavedPresetCustomBlock {
  /** Stable within this preset only; used by SavedPresetPlacement.source. */
  readonly ref: string;
  readonly name: string;
  readonly lessons: number;
  readonly colour: string | null;
  readonly category: CustomBlockCategory;
  readonly label?: string;
  /** Sub-topic codes (T1a, T1b, …) this block revisits — retrieval blocks only. */
  readonly revisits?: readonly string[];
  /** Mirror of CustomBlock.isEoHT so auto-seeded test blocks round-trip cleanly. */
  readonly isEoHT?: boolean;
}

export type SavedPresetSource =
  | { readonly kind: "sub-topic"; readonly subTopicCode: string }
  | { readonly kind: "custom"; readonly customBlockRef: string };

export interface SavedPresetPlacement {
  /** Half-term id (e.g. "Y9-A1") — matched against the subject's timeline. */
  readonly halfTermId: string;
  readonly source: SavedPresetSource;
  readonly lessonsClaimed: number;
  readonly lessonRange: readonly [number, number];
}

/**
 * One half-term entry in a workspace-level calendar template (see DEC-034).
 * `weeks` × (lessons/cycle for this year) ÷ `cycleLengthInWeeks` = the
 * derived budget when the template is applied to a fresh Timeline.
 * `id` is stable across templates so existing placements that reference an
 * id (e.g. `Y9-A1`) keep working after a template edit.
 */
export interface CalendarHalfTerm {
  readonly id: string;
  readonly name: string;
  readonly year: YearId;
  readonly weeks: number;
  readonly startDate?: string;
  readonly endDate?: string;
  /**
   * If set, this lesson count is used as the cell's budget verbatim instead
   * of the derived `lessons-per-cycle × weeks ÷ cycle-length` calculation.
   * Use when a half-term has a known irregularity (bank holiday, INSET day,
   * exam week) that the formula can't capture.
   */
  readonly budgetOverride?: number;
}

/**
 * Workspace-level calendar configuration. New subjects added via `+ Add
 * subject` use `applyCalendarTemplate` to produce their Timeline. Existing
 * subjects retain their per-Subject timelines unchanged (no auto-migration).
 *
 * `lessonsPerCyclePerYear` is partial — only years the school actually
 * teaches need an entry. Years with no entry contribute zero lessons (i.e.
 * the year is effectively absent from the timeline).
 */
export interface CalendarTemplate {
  readonly cycleLengthInWeeks: number;
  readonly lessonsPerCyclePerYear: Partial<Record<YearId, number>>;
  readonly halfTerms: readonly CalendarHalfTerm[];
  /**
   * Whether to auto-seed an end-of-half-term test custom block into every
   * cell when a new subject is added (DEC-044). Default is `true` for
   * backwards-compatible UX with v1.x — undo by unchecking in the calendar
   * settings modal. Existing subjects aren't retroactively changed when the
   * flag flips; this only affects subjects added after the flag is set.
   */
  readonly autoSeedEoHTTest?: boolean;
}

export interface Workspace {
  readonly activeSubjectId: string | null;
  readonly subjects: readonly Subject[];
  readonly calendarTemplate?: CalendarTemplate;
}

export interface ValidationError {
  readonly code: string;
  readonly message: string;
  readonly row?: number;
}

export interface ValidationWarning {
  readonly code: string;
  readonly message: string;
  readonly row?: number;
}

export type ImportResult =
  | { readonly ok: true; readonly subject: Subject; readonly warnings: readonly ValidationWarning[] }
  | { readonly ok: false; readonly errors: readonly ValidationError[]; readonly warnings: readonly ValidationWarning[] };
