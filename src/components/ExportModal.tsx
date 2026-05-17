import { useMemo, useState } from "react";

import {
  exportByHalfTermFolder,
  exportByTopicFolder,
} from "@/model/folderExport";
import { getVisibleTimelineYears } from "@/model/timeline";
import type { Subject } from "@/model/types";

export type ExportMode = "single" | "by-half-term" | "by-topic";
/**
 * Whether folder-mode exports are delivered as a loose folder of .xlsx files
 * (chosen via the OS folder picker, written into a new sub-folder) or as a
 * single .zip archive (chosen via the OS save-file picker). The `single`
 * mode ignores this — always one .xlsx.
 */
export type ExportOutput = "folder" | "zip";

export interface ExportModalProps {
  readonly subject: Subject;
  readonly onCancel: () => void;
  readonly onConfirm: (mode: ExportMode, output: ExportOutput) => void;
}

interface ChoiceDescriptor {
  readonly id: ExportMode;
  readonly name: string;
  readonly subtitle: string;
  readonly description: string;
  readonly footnote?: string;
}

const CHOICES: readonly ChoiceDescriptor[] = [
  {
    id: "single",
    name: "Single workbook",
    subtitle: "One .xlsx with five sheets",
    description:
      "The original export: Cover, Topic view, Sub-topic view, Lesson view, Objective view. " +
      "Best for archiving a snapshot or printing a single sheet.",
  },
  {
    id: "by-half-term",
    name: "Folder by half-term",
    subtitle: "One .xlsx per half-term — weekly schedule + lesson list",
    description:
      "Writes one workbook per visible half-term into a folder you choose. Each workbook has " +
      "a compact \"Weekly schedule\" tab (row = week of the HT) and a long-form \"Lesson list\" tab. " +
      "Best for handing a colleague the term they're covering.",
  },
  {
    id: "by-topic",
    name: "Folder by topic",
    subtitle: "One .xlsx per topic — calendar-ordered lessons",
    description:
      "Writes one workbook per topic into a folder you choose. Each workbook lists every placed " +
      "lesson for that topic in calendar order with year/HT/dates and objectives. " +
      "Best for seeing how a topic spreads across the timeline.",
  },
];

/**
 * Export-mode picker. Replaces the bare Export button's direct save-dialog
 * with a radio picker so the user can choose between the original
 * single-workbook export and the two new folder formats. Renders a preview
 * (file count) for the folder modes so the user knows what they're about
 * to get.
 */
export function ExportModal({ subject, onCancel, onConfirm }: ExportModalProps): JSX.Element {
  const [selected, setSelected] = useState<ExportMode>("single");
  const [output, setOutput] = useState<ExportOutput>("zip");
  const isFolderMode = selected !== "single";

  // Lightweight previews — same engine as the actual exports, throw away the
  // workbook buffers (we only care about file counts and folder names for UI).
  const previews = useMemo(() => {
    return {
      byHalfTerm: exportByHalfTermFolder(subject),
      byTopic: exportByTopicFolder(subject),
    };
  }, [subject]);

  const visibleYears = getVisibleTimelineYears(subject);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-modal-title"
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
            <h2 id="export-modal-title" className="font-display text-lg text-ink">
              Export "{subject.meta.name}"
            </h2>
          </div>
          <p className="text-xs text-ink-fade mt-1">
            Choose how you want the plan packaged. All formats respect hidden years (currently
            visible: {visibleYears.join(", ") || "none"}).
          </p>
        </header>

        <div
          className="px-5 py-4 space-y-3 overflow-y-auto"
          role="radiogroup"
          aria-label="Export format choices"
        >
          {CHOICES.map((choice) => {
            const active = selected === choice.id;
            const preview =
              choice.id === "by-half-term"
                ? previews.byHalfTerm
                : choice.id === "by-topic"
                ? previews.byTopic
                : null;
            return (
              <button
                key={choice.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setSelected(choice.id)}
                className={
                  "w-full text-left p-3 rounded border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy " +
                  (active ? "border-navy bg-navy/5" : "border-line hover:bg-surface-2")
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
                      <span className="font-display text-base text-ink">{choice.name}</span>
                      <span className="text-[11px] text-ink-fade italic">{choice.subtitle}</span>
                    </div>
                    <p className="text-xs text-ink-dim mt-1 leading-relaxed">{choice.description}</p>
                    {preview && (
                      <p className="text-[11px] text-ink-fade mt-1.5 font-mono">
                        Will write {preview.files.length} file
                        {preview.files.length === 1 ? "" : "s"}
                        {output === "zip" ? " into " : " into "}
                        <span className="text-ink-dim">
                          {output === "zip"
                            ? `${preview.suggestedFolderName}.zip`
                            : `${preview.suggestedFolderName}/`}
                        </span>
                      </p>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {isFolderMode && (
          <div className="px-5 py-3 border-t border-line flex items-center gap-3 text-xs text-ink-dim">
            <span className="font-semibold">Output as:</span>
            <label className="flex items-center gap-1.5 cursor-pointer" title="A single .zip archive — easy to email or attach.">
              <input
                type="radio"
                name="export-output"
                value="zip"
                checked={output === "zip"}
                onChange={() => setOutput("zip")}
                className="accent-navy"
              />
              <span>Zip file</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer" title="A loose folder of .xlsx files — direct access on disk.">
              <input
                type="radio"
                name="export-output"
                value="folder"
                checked={output === "folder"}
                onChange={() => setOutput("folder")}
                className="accent-navy"
              />
              <span>Folder of .xlsx</span>
            </label>
          </div>
        )}
        <footer className="px-5 py-3 border-t border-line flex items-center gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-sm border border-line rounded hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(selected, output)}
            className="px-3 py-1.5 text-sm bg-navy text-bg rounded hover:bg-navy-dim focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy"
          >
            {selected === "single"
              ? "Export…"
              : output === "zip"
              ? "Save zip…"
              : "Choose folder…"}
          </button>
        </footer>
      </div>
    </div>
  );
}
