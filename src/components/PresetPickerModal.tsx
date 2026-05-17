import { useMemo, useState } from "react";

import {
  PRESET_DESCRIPTORS,
  summarisePreset,
  type PresetId,
} from "@/model/presets";
import type { Subject } from "@/model/types";

export interface PresetPickerModalProps {
  readonly subject: Subject;
  readonly onCancel: () => void;
  readonly onConfirm: (presetId: PresetId) => void;
}

/**
 * Modal that lets the teacher pick one of the three preset layouts to apply
 * to the active subject. Shows a per-preset preview (placement count, total
 * lessons, depth-skipped warnings) computed via `summarisePreset` so the user
 * can compare before committing.
 *
 * "Replace" semantics: confirming wipes the subject's existing sub-topic
 * placements and rebuilds from the preset. The modal makes this explicit in
 * the header.
 */
export function PresetPickerModal({
  subject,
  onCancel,
  onConfirm,
}: PresetPickerModalProps): JSX.Element {
  const [selected, setSelected] = useState<PresetId>(PRESET_DESCRIPTORS[0]!.id);
  const summaries = useMemo(
    () =>
      Object.fromEntries(
        PRESET_DESCRIPTORS.map((p) => [p.id, summarisePreset(subject, p.id)] as const)
      ),
    [subject]
  );

  const existingPlacementCount = useMemo(() => {
    let n = 0;
    for (const ht of subject.timeline.halfTerms) {
      for (const b of ht.placedBlocks) {
        if (b.source.kind === "sub-topic") n++;
      }
    }
    return n;
  }, [subject.timeline]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="preset-picker-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={onCancel}
    >
      <div
        className="bg-bg rounded-card border border-line w-[640px] max-w-full max-h-full overflow-hidden flex flex-col shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-3 border-b border-line">
          <div className="flex items-baseline gap-2">
            <span
              aria-hidden
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: subject.meta.colour }}
            />
            <h2 id="preset-picker-title" className="font-display text-lg text-ink">
              Apply a preset layout to "{subject.meta.name}"
            </h2>
          </div>
          <p className="text-xs text-ink-fade mt-1">
            Replaces all current sub-topic placements with a fresh layout from the
            chosen algorithm. End-of-half-term blocks and custom blocks are preserved.
            {existingPlacementCount > 0 && (
              <span className="text-warn">
                {" "}{existingPlacementCount} existing placement{existingPlacementCount === 1 ? "" : "s"} will be wiped.
              </span>
            )}
          </p>
        </header>

        <div
          className="px-5 py-4 space-y-3 overflow-y-auto"
          role="radiogroup"
          aria-label="Preset layout choices"
        >
          {PRESET_DESCRIPTORS.map((preset) => {
            const summary = summaries[preset.id];
            const active = selected === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setSelected(preset.id)}
                className={
                  "w-full text-left p-3 rounded border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy " +
                  (active
                    ? "border-navy bg-navy/5"
                    : "border-line hover:bg-surface-2")
                }
              >
                <div className="flex items-baseline gap-2">
                  <span
                    aria-hidden
                    className={
                      "inline-block w-3 h-3 rounded-full border-2 mt-1 shrink-0 " +
                      (active ? "border-navy bg-navy" : "border-line")
                    }
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="font-display text-base text-ink">{preset.name}</span>
                      <span className="text-[11px] text-ink-fade italic">
                        {preset.subtitle}
                      </span>
                    </div>
                    <p className="text-xs text-ink-dim mt-1 leading-relaxed">
                      {preset.description}
                    </p>
                    <p className="text-[11px] text-ink-fade mt-1.5">
                      <span className="font-semibold">Best for:</span> {preset.bestFor}
                    </p>
                    {summary && (
                      <div className="mt-2 flex items-center gap-3 text-[11px] text-ink-dim">
                        <span className="font-mono">
                          {summary.placementCount} placement{summary.placementCount === 1 ? "" : "s"}
                        </span>
                        <span className="text-ink-fade">·</span>
                        <span className="font-mono">
                          {summary.totalLessonsPlaced} lessons total
                        </span>
                        <span className="text-ink-fade">·</span>
                        <span className="font-mono">
                          {summary.distinctSubTopics} sub-topics
                        </span>
                        {summary.skippedDepthSubTopics.length > 0 && (
                          <>
                            <span className="text-ink-fade">·</span>
                            <span
                              className="text-warn"
                              title={`Skipped because "Show depth" is off: ${summary.skippedDepthSubTopics.join(", ")}`}
                            >
                              {summary.skippedDepthSubTopics.length} depth skipped
                            </span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <footer className="px-5 py-3 border-t border-line flex items-center gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-sm border border-line rounded hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(selected)}
            className="px-3 py-1.5 text-sm bg-navy text-bg rounded hover:bg-navy-dim focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy"
          >
            Apply {PRESET_DESCRIPTORS.find((p) => p.id === selected)?.name}
          </button>
        </footer>
      </div>
    </div>
  );
}
