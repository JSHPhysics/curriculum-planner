import { useEffect, useMemo, useState } from "react";

import { findTopicAndSubTopic } from "@/model/queries";
import {
  DEFAULT_SPACING_THRESHOLDS,
  getSpacingFlags,
  getSpacingFlagsByKeyStage,
  getTopicSpacingFlags,
  getTopicSpacingFlagsByKeyStage,
  resolveSpacingThresholds,
  type SpacingFlags,
  type TopicSpacingFlags,
} from "@/model/spacing";
import { getVisibleKeyStages } from "@/model/timeline";
import type { KeyStage, SpacingThresholds, Subject } from "@/model/types";
import { useWorkspaceStore } from "@/store/useWorkspaceStore";

export interface SpacingPanelProps {
  readonly subject: Subject | null;
}

const EXPANDED_STORAGE_KEY = "curriculum-planner-spacing-panel-expanded-v1";
const GRANULARITY_STORAGE_KEY = "curriculum-planner-spacing-panel-granularity-v1";

type Granularity = "topic" | "sub-topic";

function readExpandedFromStorage(): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem(EXPANDED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function readGranularityFromStorage(): Granularity {
  if (typeof localStorage === "undefined") return "topic";
  try {
    return localStorage.getItem(GRANULARITY_STORAGE_KEY) === "sub-topic"
      ? "sub-topic"
      : "topic";
  } catch {
    return "topic";
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
  const updateActiveSubjectConfig = useWorkspaceStore((s) => s.updateActiveSubjectConfig);
  const [expanded, setExpanded] = useState<boolean>(readExpandedFromStorage);
  // When a subject spans multiple key stages, we default to per-KS analytics
  // (DEC-037). This toggle lets the user collapse to a single combined view
  // for cross-KS spacing analysis when they actively want it.
  const [combineKS, setCombineKS] = useState(false);
  // Granularity toggle (DEC-042): default "topic" since most planning thinking
  // happens at the topic level. "sub-topic" reveals the more granular flags
  // for users who want to drill into specific sub-topics.
  const [granularity, setGranularity] = useState<Granularity>(readGranularityFromStorage);

  useEffect(() => {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(EXPANDED_STORAGE_KEY, expanded ? "1" : "0");
    } catch {
      /* localStorage full / disabled — ignore */
    }
  }, [expanded]);

  useEffect(() => {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(GRANULARITY_STORAGE_KEY, granularity);
    } catch {
      /* ignore */
    }
  }, [granularity]);

  const subFlagsByKs = useMemo(
    () => (subject ? getSpacingFlagsByKeyStage(subject) : null),
    [subject]
  );
  const subCombinedFlags = useMemo(
    () => (subject ? getSpacingFlags(subject) : null),
    [subject]
  );
  const topicFlagsByKs = useMemo(
    () => (subject ? getTopicSpacingFlagsByKeyStage(subject) : null),
    [subject]
  );
  const topicCombinedFlags = useMemo(
    () => (subject ? getTopicSpacingFlags(subject) : null),
    [subject]
  );
  const visibleKs = useMemo(
    () => (subject ? getVisibleKeyStages(subject) : []),
    [subject]
  );
  const thresholds = useMemo(
    () => (subject ? resolveSpacingThresholds(subject) : null),
    [subject]
  );

  if (
    !subject ||
    !subCombinedFlags ||
    !subFlagsByKs ||
    !topicCombinedFlags ||
    !topicFlagsByKs ||
    !thresholds
  ) {
    return null;
  }

  const showPerKs = visibleKs.length > 1 && !combineKS;
  // For the collapsed-row summary: show the granularity-selected totals so
  // the user sees the headline at the level they're currently thinking in.
  const isSubTopicGranularity = granularity === "sub-topic";
  const flags = isSubTopicGranularity ? subCombinedFlags : null;
  const topicFlags = isSubTopicGranularity ? null : topicCombinedFlags;

  function patchThresholds(patch: Partial<SpacingThresholds>): void {
    updateActiveSubjectConfig({
      spacingThresholds: { ...(subject!.config.spacingThresholds ?? {}), ...patch },
    });
  }

  function resetThresholds(): void {
    updateActiveSubjectConfig({ spacingThresholds: {} });
  }

  const hasThresholdOverrides =
    subject.config.spacingThresholds !== undefined &&
    Object.keys(subject.config.spacingThresholds).length > 0;

  // Summary counts — use the granularity-selected flags. Topic-level
  // exposes a "clustered" flag (every gap ≤ 1, indicating one-block teaching)
  // instead of "blocked cells".
  const summary = isSubTopicGranularity
    ? {
        singleTouch: flags!.singleTouch.length,
        unplaced: flags!.unplaced.length,
        blockedOrClustered: flags!.blockedCells.length,
        wellSpaced: flags!.wellSpaced.length,
        blockedLabel: "blocked cells",
        blockedTitle: "Half-terms dominated by a single topic — consider interleaving",
        singleTouchTitle: "Sub-topics placed exactly once — no spaced retrieval",
        unplacedTitle: "Sub-topics with no placements anywhere in the timeline",
        wellSpacedTitle: "Sub-topics with 3+ placements and mean gap ≥ 4 half-terms",
      }
    : {
        singleTouch: topicFlags!.singleTouch.length,
        unplaced: topicFlags!.unplaced.length,
        blockedOrClustered: topicFlags!.clustered.length,
        wellSpaced: topicFlags!.wellSpaced.length,
        blockedLabel: "clustered topics",
        blockedTitle:
          "Topics whose every placement is in consecutive half-terms — taught in one block, not spaced",
        singleTouchTitle:
          "Topics touched in exactly one half-term — no spacing benefit at topic level",
        unplacedTitle: "Topics with no placements anywhere in the timeline",
        wellSpacedTitle: "Topics touched in 3+ half-terms with mean gap ≥ 4 half-terms",
      };
  const total =
    summary.singleTouch + summary.unplaced + summary.blockedOrClustered + summary.wellSpaced;
  const allGood =
    summary.singleTouch === 0 && summary.unplaced === 0 && summary.blockedOrClustered === 0;

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
        <span
          className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-line text-ink-fade"
          title={
            isSubTopicGranularity
              ? "Reading flags at sub-topic granularity"
              : "Reading flags at topic granularity (DEC-042). Toggle in the expanded panel."
          }
        >
          {isSubTopicGranularity ? "sub-topic" : "topic"}
        </span>
        {total === 0 ? (
          <span className="text-ink-fade italic">
            No placements yet — drop blocks into the calendar to see spacing analysis.
          </span>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            <Pill
              label={`${summary.singleTouch} single-touch`}
              tone={summary.singleTouch > 0 ? "warn" : "muted"}
              title={summary.singleTouchTitle}
            />
            <Pill
              label={`${summary.unplaced} unplaced`}
              tone={summary.unplaced > 0 ? "warn" : "muted"}
              title={summary.unplacedTitle}
            />
            <Pill
              label={`${summary.blockedOrClustered} ${summary.blockedLabel}`}
              tone={summary.blockedOrClustered > 0 ? "warn" : "muted"}
              title={summary.blockedTitle}
            />
            <Pill
              label={`${summary.wellSpaced} well-spaced`}
              tone={summary.wellSpaced > 0 ? "good" : "muted"}
              title={summary.wellSpacedTitle}
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
        <div id="spacing-panel-details" className="px-6 py-3 border-t border-line space-y-3">
          <div className="flex items-center justify-end gap-4 text-[11px]">
            <div
              role="radiogroup"
              aria-label="Analysis granularity"
              className="inline-flex border border-line rounded overflow-hidden text-[10px] font-mono uppercase tracking-wider"
            >
              <button
                type="button"
                role="radio"
                aria-checked={!isSubTopicGranularity}
                onClick={() => setGranularity("topic")}
                title="Analyse spacing at topic level (default per DEC-042): two sub-topics of the same topic in different half-terms count as one well-spaced topic"
                className={
                  "px-2 py-1 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:ring-inset " +
                  (!isSubTopicGranularity ? "bg-navy text-bg" : "text-ink-dim hover:bg-surface-2")
                }
              >
                Topic
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={isSubTopicGranularity}
                onClick={() => setGranularity("sub-topic")}
                title="Analyse spacing at sub-topic level: each sub-topic evaluated independently"
                className={
                  "px-2 py-1 transition border-l border-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:ring-inset " +
                  (isSubTopicGranularity ? "bg-navy text-bg" : "text-ink-dim hover:bg-surface-2")
                }
              >
                Sub-topic
              </button>
            </div>
            {visibleKs.length > 1 && (
              <>
                <label className="flex items-center gap-1.5 text-ink-dim cursor-pointer">
                  <input
                    type="checkbox"
                    checked={combineKS}
                    onChange={(e) => setCombineKS(e.target.checked)}
                    className="accent-navy"
                  />
                  Combine across key stages
                </label>
                <details className="text-ink-fade">
                  <summary className="cursor-pointer hover:text-ink">why?</summary>
                  <p className="mt-1 max-w-md text-right leading-snug">
                    Key stages are treated as separate learning contexts by default — a
                    topic taught once in KS3 and once in KS4 is single-touch in BOTH,
                    not a 2-touch spread. Tick this box if you want spacing computed
                    across the whole timeline regardless of KS.
                  </p>
                </details>
              </>
            )}
          </div>

          {showPerKs
            ? visibleKs.map((ks) =>
                isSubTopicGranularity ? (
                  <KeyStageGroup
                    key={ks}
                    keyStage={ks}
                    flags={subFlagsByKs.get(ks) ?? EMPTY_FLAGS}
                    subject={subject}
                    onCellClick={setCurrentTermId}
                  />
                ) : (
                  <TopicKeyStageGroup
                    key={ks}
                    keyStage={ks}
                    flags={topicFlagsByKs.get(ks) ?? EMPTY_TOPIC_FLAGS}
                    subject={subject}
                  />
                )
              )
            : isSubTopicGranularity ? (
                <SectionsGrid
                  flags={subCombinedFlags}
                  subject={subject}
                  onCellClick={setCurrentTermId}
                />
              ) : (
                <TopicSectionsGrid flags={topicCombinedFlags} subject={subject} />
              )}

          <details className="border-t border-line pt-2 mt-1">
            <summary className="cursor-pointer text-xs text-ink-dim hover:text-ink select-none">
              ⚙ Tune thresholds for this subject
            </summary>
            <ThresholdsEditor
              thresholds={thresholds}
              onChange={patchThresholds}
              onReset={resetThresholds}
              hasOverrides={hasThresholdOverrides}
            />
          </details>
        </div>
      )}
    </div>
  );
}

const EMPTY_FLAGS: SpacingFlags = {
  singleTouch: [],
  unplaced: [],
  blockedCells: [],
  wellSpaced: [],
};

const EMPTY_TOPIC_FLAGS: TopicSpacingFlags = {
  singleTouch: [],
  unplaced: [],
  wellSpaced: [],
  clustered: [],
};

interface KeyStageGroupProps {
  readonly keyStage: KeyStage;
  readonly flags: SpacingFlags;
  readonly subject: Subject;
  readonly onCellClick: (halfTermId: string) => void;
}

function KeyStageGroup({ keyStage, flags, subject, onCellClick }: KeyStageGroupProps): JSX.Element {
  return (
    <fieldset className="border border-line rounded p-3">
      <legend className="px-1.5 font-mono text-[10px] tracking-wider uppercase text-ink-dim">
        {keyStage}
      </legend>
      <SectionsGrid flags={flags} subject={subject} onCellClick={onCellClick} />
    </fieldset>
  );
}

interface TopicKeyStageGroupProps {
  readonly keyStage: KeyStage;
  readonly flags: TopicSpacingFlags;
  readonly subject: Subject;
}

function TopicKeyStageGroup({ keyStage, flags, subject }: TopicKeyStageGroupProps): JSX.Element {
  return (
    <fieldset className="border border-line rounded p-3">
      <legend className="px-1.5 font-mono text-[10px] tracking-wider uppercase text-ink-dim">
        {keyStage}
      </legend>
      <TopicSectionsGrid flags={flags} subject={subject} />
    </fieldset>
  );
}

interface TopicSectionsGridProps {
  readonly flags: TopicSpacingFlags;
  readonly subject: Subject;
}

function TopicSectionsGrid({ flags, subject }: TopicSectionsGridProps): JSX.Element {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <Section
        title="Single-touch"
        description="Topics appearing in only one half-term — no topic-level spacing."
        rationale={
          <>
            <p>
              A topic touched in exactly one half-term has no spacing benefit at the
              topic level, even if it consists of multiple sub-topics taught back-to-back.
              The whole topic is a single teaching block; students get no opportunity
              to forget and re-retrieve before exams.
            </p>
            <p>
              This is the most important spacing signal for most planners — at sub-topic
              granularity, every sub-topic-placed-once looks single-touch; at topic
              granularity you see which TOPICS have been compressed into one window.
            </p>
            <p className="text-[10px] text-ink-fade">
              See <code>docs/PEDAGOGY.md</code> §3 and DEC-042 for rationale.
            </p>
          </>
        }
        empty="None"
      >
        {flags.singleTouch.map((code) => (
          <TopicChip key={code} code={code} subject={subject} />
        ))}
      </Section>

      <Section
        title="Unplaced"
        description="Topics with no placements anywhere in the calendar."
        rationale={
          <>
            <p>
              No sub-topic of this topic has been placed. Could be deliberate (you're
              skipping the topic for this cohort) or an oversight. Topic-level lets you
              spot whole-topic gaps quickly, where sub-topic level would surface one
              chip per missing sub-topic.
            </p>
          </>
        }
        empty="Every topic is placed"
      >
        {flags.unplaced.map((code) => (
          <TopicChip key={code} code={code} subject={subject} />
        ))}
      </Section>

      <Section
        title="Clustered topics"
        description="Topics whose every placement sits in consecutive half-terms."
        rationale={
          <>
            <p>
              Every placement of the topic is in immediately-adjacent half-terms (gap ≤ 1),
              meaning even though the topic has multiple sub-topics they're all taught
              in one tight block. No spacing benefit — the topic is taught and then
              never revisited. Consider moving one sub-topic to a later position to
              break the cluster.
            </p>
          </>
        }
        empty="No clustered topics"
      >
        {flags.clustered.map((code) => (
          <TopicChip key={code} code={code} subject={subject} />
        ))}
      </Section>

      <Section
        title="Well-spaced"
        description="3+ distinct half-terms with mean gap ≥4 half-terms."
        rationale={
          <>
            <p>
              A positive flag: this topic appears in multiple half-terms with enough
              gap between them to read as intentional spaced retrieval. Multiple
              sub-topics of the same topic spread across the year is exactly the
              "revisit via a different angle" pattern Bjork and Rohrer describe.
            </p>
          </>
        }
        empty="No well-spaced topics yet"
      >
        {flags.wellSpaced.map((code) => (
          <TopicChip key={code} code={code} subject={subject} tone="good" />
        ))}
      </Section>
    </div>
  );
}

interface TopicChipProps {
  readonly code: string;
  readonly subject: Subject;
  readonly tone?: "warn" | "good";
}

function TopicChip({ code, subject, tone = "warn" }: TopicChipProps): JSX.Element {
  const topic = subject.workingSpec.topics.find((t) => t.code === code);
  const tonal =
    tone === "good"
      ? "border-good/30 text-good bg-good/5"
      : "border-line text-ink-dim bg-bg";
  return (
    <span
      title={topic ? `${topic.name} (${topic.subTopics.length} sub-topics)` : code}
      className={"text-[11px] font-mono px-1.5 py-0.5 rounded border " + tonal}
    >
      {code}
    </span>
  );
}

interface SectionsGridProps {
  readonly flags: SpacingFlags;
  readonly subject: Subject;
  readonly onCellClick: (halfTermId: string) => void;
}

function SectionsGrid({ flags, subject, onCellClick }: SectionsGridProps): JSX.Element {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
        description="Not yet anywhere in the (visible) calendar."
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
            onClick={() => onCellClick(cell.halfTermId)}
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

interface ThresholdsEditorProps {
  readonly thresholds: Required<SpacingThresholds>;
  readonly onChange: (patch: Partial<SpacingThresholds>) => void;
  readonly onReset: () => void;
  readonly hasOverrides: boolean;
}

function ThresholdsEditor({
  thresholds,
  onChange,
  onReset,
  hasOverrides,
}: ThresholdsEditorProps): JSX.Element {
  return (
    <div className="mt-3 space-y-3 bg-surface-2/40 p-3 rounded border border-line">
      <p className="text-[11px] text-ink-dim leading-snug">
        Changes here apply only to this subject and re-evaluate the four flags above immediately.
        Pedagogically defensible defaults are explained beneath each control. Full rationale in{" "}
        <code className="font-mono">docs/PEDAGOGY.md</code> §3 and §5.
      </p>

      <ThresholdRow
        label="Blocked-cell minimum lessons"
        value={thresholds.blockedCellMinLessons}
        defaultValue={DEFAULT_SPACING_THRESHOLDS.blockedCellMinLessons}
        min={1}
        max={20}
        step={1}
        format={(n) => `${n} lessons`}
        onChange={(v) => onChange({ blockedCellMinLessons: v })}
        rationale="A cell with fewer than 4 lessons isn't 'blocked' — it's just a focused mini-block (a couple of sessions). 4+ lessons on a single topic is approximately a teaching week at most lesson cadences; that's where the absence of interleaving starts producing the fluency illusion Rohrer warns about. Raise this if your cells are typically very long and you only want to flag genuinely heavy blocks; lower it if you teach in short cycles and even 2–3 consecutive sessions on one topic concern you."
      />

      <ThresholdRow
        label="Blocked-cell dominant share"
        value={thresholds.blockedCellDominantShare}
        defaultValue={DEFAULT_SPACING_THRESHOLDS.blockedCellDominantShare}
        min={0.5}
        max={1}
        step={0.05}
        format={(n) => `${Math.round(n * 100)}%`}
        onChange={(v) => onChange({ blockedCellDominantShare: v })}
        rationale="At 80%+ one topic is essentially the whole cell — the rest is noise. Drop this to 60% if you also want to flag cells with mild dominance (one topic + two interleaved); push to 90% if you only care about extreme cases. Note that going below ~55% starts flagging healthy interleaving as 'blocked', which inverts the meaning."
      />

      <ThresholdRow
        label="Well-spaced minimum placements"
        value={thresholds.wellSpacedMinPlacements}
        defaultValue={DEFAULT_SPACING_THRESHOLDS.wellSpacedMinPlacements}
        min={2}
        max={6}
        step={1}
        format={(n) => `${n} placements`}
        onChange={(v) => onChange({ wellSpacedMinPlacements: v })}
        rationale="Two placements give you one inter-placement gap (a single revisit); three give you two — enough to read as intentional spacing rather than coincidence. Drop to 2 if you consider any revisit as worthy of the positive flag; raise to 4+ if you reserve 'well-spaced' for truly repeated retrieval."
      />

      <ThresholdRow
        label="Well-spaced minimum mean gap"
        value={thresholds.wellSpacedMinMeanGap}
        defaultValue={DEFAULT_SPACING_THRESHOLDS.wellSpacedMinMeanGap}
        min={1}
        max={12}
        step={1}
        format={(n) => `${n} half-terms`}
        onChange={(v) => onChange({ wellSpacedMinMeanGap: v })}
        rationale="4 half-terms ≈ 24 weeks — comfortably inside Cepeda et al.'s optimal ISI window for year-end retention. Shorter gaps (≤2 HT ≈ 12 weeks) are massed-practice territory and don't earn the label. Higher thresholds (e.g. 6+) are even better for retention but rarely achievable inside a single school year."
      />

      <div className="flex items-center justify-end pt-1">
        <button
          type="button"
          onClick={onReset}
          disabled={!hasOverrides}
          className="text-[11px] px-2 py-1 border border-line rounded hover:bg-surface disabled:opacity-40 disabled:cursor-not-allowed"
          title="Restore the four thresholds to their built-in defaults"
        >
          Reset to defaults
        </button>
      </div>
    </div>
  );
}

interface ThresholdRowProps {
  readonly label: string;
  readonly value: number;
  readonly defaultValue: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly format: (n: number) => string;
  readonly onChange: (v: number) => void;
  readonly rationale: string;
}

function ThresholdRow({
  label,
  value,
  defaultValue,
  min,
  max,
  step,
  format,
  onChange,
  rationale,
}: ThresholdRowProps): JSX.Element {
  const isCustom = value !== defaultValue;
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-ink-dim text-xs flex-1">{label}</span>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-32 accent-navy"
          aria-label={label}
        />
        <span
          className={
            "w-24 text-right font-mono text-[11px] px-1.5 py-0.5 rounded border " +
            (isCustom ? "border-navy bg-navy/10 text-navy" : "border-line text-ink-dim")
          }
          title={isCustom ? `Default: ${format(defaultValue)}` : "Default value"}
        >
          {format(value)}
        </span>
        {isCustom && (
          <span className="text-[10px] text-navy font-mono" title={`Default: ${format(defaultValue)}`}>
            edited
          </span>
        )}
      </div>
      <details className="ml-1">
        <summary className="cursor-pointer text-[10px] text-ink-fade hover:text-ink select-none">
          Why this default?
        </summary>
        <p className="text-[11px] text-ink-dim mt-1 leading-snug pl-3 border-l-2 border-line-2">
          {rationale}
        </p>
      </details>
    </div>
  );
}
