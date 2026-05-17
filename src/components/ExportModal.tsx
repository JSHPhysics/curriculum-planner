import { useMemo, useState } from "react";

import {
  exportFolderStructure,
  type FolderRootBy,
} from "@/model/folderExport";
import { getVisibleTimelineYears } from "@/model/timeline";
import type { Subject } from "@/model/types";

/**
 * Two export modes (DEC-045):
 *   - "workbook"     — single .xlsx with the 5 sheets (Cover / Topic /
 *                       Sub-topic / Lesson / Objective views)
 *   - "folder-tree"  — nested folder structure mirroring the curriculum
 *                       hierarchy (subject / HT or topic / sub-topic / lesson),
 *                       with a `_lesson-info.txt` in each leaf so teachers can
 *                       drop resources into pre-built slots
 */
export type ExportMode = "workbook" | "folder-tree";

/** Folder-tree output: loose folder on disk vs zipped archive. */
export type ExportOutput = "folder" | "zip";

export interface ExportModalProps {
  readonly subject: Subject;
  readonly onCancel: () => void;
  readonly onConfirm: (
    mode: ExportMode,
    output: ExportOutput,
    rootBy: FolderRootBy
  ) => void;
}

interface ChoiceDescriptor {
  readonly id: ExportMode;
  readonly name: string;
  readonly subtitle: string;
  readonly description: string;
}

const CHOICES: readonly ChoiceDescriptor[] = [
  {
    id: "workbook",
    name: "Single workbook",
    subtitle: "One .xlsx with five sheets",
    description:
      "The complete plan as one spreadsheet: Cover, Topic view, Sub-topic view, " +
      "Lesson view, Objective view. Best for archiving a snapshot or printing.",
  },
  {
    id: "folder-tree",
    name: "Folder structure",
    subtitle: "Nested folders mirroring the curriculum hierarchy",
    description:
      "Builds a folder tree (subject → HT or topic → sub-topic → lesson) " +
      "with a _lesson-info.txt in each leaf folder describing the lesson. " +
      "Best for setting up a resource library: drop your worksheets / slides / " +
      "videos into the right pre-built slot.",
  },
];

/**
 * Export-mode picker (DEC-045). User chooses between the single-workbook
 * xlsx and the folder-structure tree. For folder-structure, sub-options
 * appear: top-level grouping (by half-term or by topic) and output format
 * (zip archive or loose folder).
 */
export function ExportModal({ subject, onCancel, onConfirm }: ExportModalProps): JSX.Element {
  const [selected, setSelected] = useState<ExportMode>("workbook");
  const [rootBy, setRootBy] = useState<FolderRootBy>("half-term");
  const [output, setOutput] = useState<ExportOutput>("zip");
  const isFolderMode = selected === "folder-tree";

  // Live preview of the folder tree so the user can sanity-check their
  // choice before saving. Cheap — same engine the actual export uses.
  const treePreview = useMemo(
    () => (isFolderMode ? exportFolderStructure(subject, rootBy) : null),
    [subject, isFolderMode, rootBy]
  );

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
            Choose how you want the plan packaged. All formats respect hidden years
            (currently visible: {visibleYears.join(", ") || "none"}) and the
            <span className="font-mono text-[10px]"> Show depth </span>
            toggle.
          </p>
        </header>

        <div
          className="px-5 py-4 space-y-3 overflow-y-auto"
          role="radiogroup"
          aria-label="Export format choices"
        >
          {CHOICES.map((choice) => {
            const active = selected === choice.id;
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
                  </div>
                </div>
              </button>
            );
          })}

          {isFolderMode && treePreview && (
            <div className="border border-line rounded p-3 space-y-3 bg-surface-2/30">
              <div>
                <div className="text-xs text-ink-dim mb-1.5 font-semibold">Top-level grouping</div>
                <div
                  role="radiogroup"
                  aria-label="Folder tree grouping"
                  className="inline-flex border border-line rounded overflow-hidden"
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={rootBy === "half-term"}
                    onClick={() => setRootBy("half-term")}
                    className={
                      "px-3 py-1 text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:ring-inset " +
                      (rootBy === "half-term" ? "bg-navy text-bg" : "text-ink-dim hover:bg-surface")
                    }
                    title="Tree rooted at each half-term: HT → Topic → Sub-topic → Lesson"
                  >
                    By half-term
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={rootBy === "topic"}
                    onClick={() => setRootBy("topic")}
                    className={
                      "px-3 py-1 text-xs transition border-l border-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:ring-inset " +
                      (rootBy === "topic" ? "bg-navy text-bg" : "text-ink-dim hover:bg-surface")
                    }
                    title="Tree rooted at each topic: Topic → Sub-topic → Lesson (calendar order)"
                  >
                    By topic
                  </button>
                </div>
              </div>

              <div>
                <div className="text-xs text-ink-dim mb-1.5 font-semibold">Output as</div>
                <div className="flex items-center gap-3 text-xs text-ink-dim">
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
                  <label className="flex items-center gap-1.5 cursor-pointer" title="Loose folder on disk — ready to receive your resource files.">
                    <input
                      type="radio"
                      name="export-output"
                      value="folder"
                      checked={output === "folder"}
                      onChange={() => setOutput("folder")}
                      className="accent-navy"
                    />
                    <span>Folder on disk</span>
                  </label>
                </div>
              </div>

              <PreviewTree tree={treePreview} />
            </div>
          )}
        </div>

        <footer className="px-5 py-3 border-t border-line flex items-center gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-sm border border-line rounded hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(selected, output, rootBy)}
            className="px-3 py-1.5 text-sm bg-navy text-bg rounded hover:bg-navy-dim focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy"
          >
            {selected === "workbook"
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

interface PreviewTreeProps {
  readonly tree: { readonly suggestedRootName: string; readonly entries: readonly { readonly path: string; readonly content?: Uint8Array }[] };
}

/**
 * Compact preview of the first few folders + file count. Helps the user
 * confirm grouping choice without actually saving. Caps at ~6 paths.
 */
function PreviewTree({ tree }: PreviewTreeProps): JSX.Element {
  const folderCount = tree.entries.filter((e) => e.content === undefined).length;
  const fileCount = tree.entries.filter((e) => e.content !== undefined).length;
  // Show the first 6 folder paths (skipping root), to give a flavour of depth.
  const samplePaths = tree.entries
    .filter((e) => e.content === undefined && e.path !== "")
    .slice(0, 6)
    .map((e) => e.path);
  return (
    <div className="text-[11px] text-ink-fade font-mono leading-tight">
      <div className="text-ink-dim mb-1">
        Preview: <span className="text-ink">{folderCount}</span> folders,{" "}
        <span className="text-ink">{fileCount}</span> info files
      </div>
      <div className="bg-bg/60 border border-line/60 rounded p-2 space-y-0.5">
        <div className="text-ink-dim">{tree.suggestedRootName}/</div>
        {samplePaths.map((p) => (
          <div key={p} className="pl-3">
            {p}/
          </div>
        ))}
        {tree.entries.length > 8 && (
          <div className="pl-3 italic text-ink-fade">… and more</div>
        )}
      </div>
    </div>
  );
}
