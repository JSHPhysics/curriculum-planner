import { findCustomBlock, findTopicAndSubTopic } from "@/model/queries";
import type { PlacedBlock, Subject } from "@/model/types";

export interface RestoreToImportModalProps {
  readonly subject: Subject;
  readonly orphans: readonly PlacedBlock[];
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}

export function RestoreToImportModal({
  subject,
  orphans,
  onCancel,
  onConfirm,
}: RestoreToImportModalProps): JSX.Element {
  const colour = subject.meta.colour;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="restore-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={onCancel}
    >
      <div
        className="bg-bg rounded-card border border-line w-[560px] max-w-full max-h-full overflow-hidden flex flex-col shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-3 border-b border-line">
          <div className="flex items-baseline gap-2">
            <span
              aria-hidden
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: colour }}
            />
            <h2 id="restore-modal-title" className="font-display text-lg text-ink">
              Restore "{subject.meta.name}" to imported spec
            </h2>
          </div>
          <p className="text-xs text-ink-fade mt-1">
            This discards every working-spec edit (lesson titles, objectives, sub-topic
            names) and resets the spec to what was imported.
          </p>
        </header>

        <div className="px-5 py-4 space-y-3 overflow-y-auto">
          {orphans.length === 0 ? (
            <p className="text-sm text-ink-dim">
              All current placements reference sub-topics or custom blocks that survive
              the restore. Nothing will be dropped.
            </p>
          ) : (
            <>
              <p className="text-sm text-warn font-semibold">
                {orphans.length} placement{orphans.length === 1 ? "" : "s"} will be
                dropped because {orphans.length === 1 ? "its source" : "their sources"} no longer
                exist in the imported spec:
              </p>
              <ul className="border border-line rounded divide-y divide-line max-h-64 overflow-y-auto">
                {orphans.map((pb) => (
                  <li
                    key={pb.id}
                    className="px-3 py-1.5 text-xs flex items-baseline gap-2"
                  >
                    <span className="font-mono text-[10px] text-ink-fade">
                      {describeOrphanSource(pb, subject)}
                    </span>
                    <span className="text-ink-dim">
                      {pb.lessonsClaimed}L · range [{pb.lessonRange[0]}, {pb.lessonRange[1]})
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-ink-fade">
                Placements that reference surviving sub-topics or custom blocks will be
                preserved at their current locations.
              </p>
            </>
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
            onClick={onConfirm}
            className="px-3 py-1.5 text-sm bg-warn text-bg rounded hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warn"
          >
            {orphans.length === 0 ? "Restore" : `Restore (drop ${orphans.length})`}
          </button>
        </footer>
      </div>
    </div>
  );
}

function describeOrphanSource(pb: PlacedBlock, subject: Subject): string {
  if (pb.source.kind === "sub-topic") {
    const found = findTopicAndSubTopic(subject.workingSpec, pb.source.subTopicCode);
    if (found) {
      return `${found.subTopic.code} ${found.subTopic.name}`;
    }
    return `${pb.source.subTopicCode} (missing in imported spec)`;
  }
  if (pb.source.kind === "custom") {
    const cb = findCustomBlock(subject, pb.source.customBlockId);
    if (cb) return `Custom: ${cb.name}`;
    return `Custom block (missing — id ${pb.source.customBlockId.slice(0, 8)}…)`;
  }
  return "EoHT (preserved)";
}
