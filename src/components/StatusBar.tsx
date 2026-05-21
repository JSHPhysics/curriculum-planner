import { computeCoverageStats } from "@/model/export";
import { getVisibleTimelineYears } from "@/model/timeline";
import type { Subject, SubjectConfig } from "@/model/types";

export interface StatusBarProps {
  readonly subject: Subject | null;
  readonly onToggleConfig: (partial: Partial<SubjectConfig>) => void;
  readonly onOpenPresetPicker: () => void;
}

export function StatusBar({
  subject,
  onToggleConfig,
  onOpenPresetPicker,
}: StatusBarProps): JSX.Element {
  if (!subject) {
    return (
      <div className="px-6 py-2 text-xs text-ink-fade border-b border-line bg-surface-2">
        No subject loaded. Click + in the header to import a spec.
      </div>
    );
  }

  const cfg = subject.config;
  // DEC-053: respect the per-subject "include custom blocks in counts"
  // preference. Default to true when the field is undefined (legacy files +
  // freshly imported subjects), so the per-year header tells the truth
  // about cell load instead of silently undercounting tests / retrievals.
  const includeCustomsInCounts = cfg.includeCustomBlocksInCounts ?? true;
  const stats = computeCoverageStats(subject, {
    includeCustomBlocksInPerYearPlaced: includeCustomsInCounts,
  });
  const unplaced = stats.totalSpecLessons - stats.placedLessons;
  const years = getVisibleTimelineYears(subject);

  return (
    <div className="px-6 py-2 flex items-center gap-6 border-b border-line bg-surface-2 text-xs">
      <div className="flex items-center gap-4">
        {years.map((year) => {
          const slot = stats.perYear.get(year) ?? { placed: 0, budget: 0 };
          const pct = slot.budget === 0 ? 0 : Math.min(100, (slot.placed / slot.budget) * 100);
          const over = slot.placed > slot.budget;
          return (
            <div key={year} className="flex items-center gap-2">
              <span className="font-mono text-ink-dim w-7">{year}</span>
              <div className="relative w-32 h-2 bg-line rounded overflow-hidden">
                <div
                  className={"absolute inset-y-0 left-0 " + (over ? "bg-warn" : "bg-navy")}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className={"font-mono " + (over ? "text-warn font-semibold" : "text-ink-dim")}>
                {slot.placed} / {slot.budget}
              </span>
            </div>
          );
        })}
      </div>

      <div className="text-ink-dim">
        <span className="font-mono">{unplaced}</span> unplaced lesson{unplaced === 1 ? "" : "s"}
      </div>

      <div className="ml-auto flex items-center gap-3">
        <button
          type="button"
          onClick={onOpenPresetPicker}
          title="Apply a preset layout (spiral / frontloaded / interleaved) to this subject"
          className="px-2 py-1 text-ink-dim hover:text-ink hover:bg-surface rounded border border-line transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy text-[11px] font-medium"
        >
          📐 Preset layout…
        </button>
        <span className="text-line">|</span>
        <ConfigToggle
          label="Show depth"
          title="Include the ★ depth-extension lessons in placement counts"
          checked={cfg.includeDepth}
          onChange={(v) => onToggleConfig({ includeDepth: v })}
        />
        <ConfigToggle
          label="Include customs"
          title="Custom blocks include tests, review lessons, and anything not defined in your specification or marked as a lesson"
          checked={includeCustomsInCounts}
          onChange={(v) => onToggleConfig({ includeCustomBlocksInCounts: v })}
        />
        <ConfigToggle
          label="Buffer"
          title="Apply a 10% lost-lesson buffer to half-term capacities"
          checked={cfg.lostLessonBuffer}
          onChange={(v) => onToggleConfig({ lostLessonBuffer: v })}
        />
      </div>
    </div>
  );
}

interface ConfigToggleProps {
  readonly label: string;
  readonly title: string;
  readonly checked: boolean;
  readonly onChange: (next: boolean) => void;
}

function ConfigToggle({ label, title, checked, onChange }: ConfigToggleProps): JSX.Element {
  return (
    <label className="flex items-center gap-1.5 cursor-pointer" title={title}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-navy"
      />
      <span className="text-ink-dim">{label}</span>
    </label>
  );
}
