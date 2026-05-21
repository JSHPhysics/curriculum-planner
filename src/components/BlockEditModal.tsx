import { useEffect, useState } from "react";

import { findTopicAndSubTopic, getTopicColour } from "@/model/queries";
import { findPlacedBlock } from "@/model/placement";
import type { CustomBlock, Subject } from "@/model/types";

import { RevisitsPicker } from "./RevisitsPicker";

export interface BlockEditModalProps {
  readonly subject: Subject;
  readonly placedBlockId: string;
  readonly onClose: () => void;
  readonly onEditLessons: (lessons: number) => void;
  readonly onRemove: () => void;
  /**
   * Optional: only required when editing a retrieval custom block. If absent
   * and the block is a retrieval, the revisits picker is shown read-only.
   */
  readonly onUpdateRevisits?: (customBlockId: string, revisits: readonly string[]) => void;
  /**
   * DEC-050: per-placement display-title override. Falsy clears it.
   */
  readonly onSetTitle: (title: string) => void;
  /**
   * Open the underlying spec-entity edit modal (sub-topic for sub-topic
   * blocks; custom block for custom blocks). Lets the user cascade-rename
   * the source rather than just the per-placement label.
   */
  readonly onEditUnderlying?: () => void;
}

export function BlockEditModal(props: BlockEditModalProps): JSX.Element | null {
  const {
    subject,
    placedBlockId,
    onClose,
    onEditLessons,
    onRemove,
    onUpdateRevisits,
    onSetTitle,
    onEditUnderlying,
  } = props;

  const found = findPlacedBlock(subject.timeline, placedBlockId);
  const block = found?.block ?? null;

  const [lessons, setLessons] = useState<number>(block?.lessonsClaimed ?? 0);
  const [revisitsDraft, setRevisitsDraft] = useState<readonly string[]>([]);
  const [revisitsDirty, setRevisitsDirty] = useState(false);
  const [titleDraft, setTitleDraft] = useState<string>(block?.userEdits.title ?? "");
  const [titleDirty, setTitleDirty] = useState(false);

  // Resolve the underlying custom block (if any) for retrieval-kind editing.
  // TS can't see through the closure-narrowed source.kind narrative, so
  // alias the customBlockId before the lookup (same trick noted in sessions 8/9).
  const customBlockId =
    block && block.source.kind === "custom" ? block.source.customBlockId : null;
  const customBlock: CustomBlock | null = customBlockId
    ? subject.customBlocks.find((c) => c.id === customBlockId) ?? null
    : null;
  const isRetrieval = customBlock?.kind === "retrieval";

  useEffect(() => {
    setLessons(block?.lessonsClaimed ?? 0);
    setTitleDraft(block?.userEdits.title ?? "");
    setTitleDirty(false);
  }, [block?.lessonsClaimed, block?.userEdits.title, placedBlockId]);

  // Re-seed revisits draft whenever the underlying retrieval block changes.
  useEffect(() => {
    if (isRetrieval && customBlock?.revisits) {
      setRevisitsDraft(customBlock.revisits);
      setRevisitsDirty(false);
    } else {
      setRevisitsDraft([]);
      setRevisitsDirty(false);
    }
  }, [customBlock?.id, isRetrieval, customBlock?.revisits]);

  if (!block) return null;

  const description = describeForModal(block, subject);
  const term = subject.timeline.halfTerms.find((h) => h.id === found?.termId);
  const naturalLessons = naturalLessonCount(block, subject);

  function toggleRevisit(code: string): void {
    setRevisitsDirty(true);
    setRevisitsDraft((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  }

  function handleSave(): void {
    if (lessons !== block!.lessonsClaimed) onEditLessons(lessons);
    if (revisitsDirty && isRetrieval && customBlock && onUpdateRevisits) {
      onUpdateRevisits(customBlock.id, revisitsDraft);
    }
    if (titleDirty) onSetTitle(titleDraft);
    onClose();
  }

  function handleRemove(): void {
    if (confirm("Remove this block from the plan?")) {
      onRemove();
      onClose();
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40"
      onClick={onClose}
    >
      <div
        className="bg-bg rounded-card border border-line w-[460px] max-w-[90vw] max-h-[90vh] flex flex-col shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-3 border-b border-line">
          <div className="flex items-baseline gap-2">
            <span
              aria-hidden
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: description.colour }}
            />
            <span className="font-mono text-[11px] text-ink-fade uppercase tracking-wider">
              {description.code}
            </span>
            <h2 className="font-display text-lg text-ink flex-1 truncate" title={description.name}>
              {description.name}
            </h2>
          </div>
          {term && (
            <p className="text-[11px] text-ink-fade mt-1">
              Placed in {term.year} {term.label} · {term.dates ?? "no date set"}
            </p>
          )}
        </header>

        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          <div>
            <label htmlFor="block-display-title" className="block text-xs text-ink-dim mb-1">
              Display label <span className="text-ink-fade">(this placement only)</span>
            </label>
            <input
              id="block-display-title"
              type="text"
              value={titleDraft}
              onChange={(e) => {
                setTitleDraft(e.target.value);
                setTitleDirty(true);
              }}
              placeholder={description.name}
              className="w-full px-2 py-1 border border-line rounded text-sm"
            />
            <p className="text-[10px] text-ink-fade mt-1">
              Overrides the displayed text on this block. Leave blank to fall back
              to "{description.name}". Doesn't change the underlying{" "}
              {block.source.kind === "custom" ? "custom block" : "sub-topic"}.
            </p>
            {onEditUnderlying && block.source.kind !== "eoht" && (
              <button
                type="button"
                onClick={() => {
                  onEditUnderlying();
                  onClose();
                }}
                className="mt-2 text-[11px] text-navy underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy rounded"
              >
                Edit the underlying{" "}
                {block.source.kind === "custom" ? "custom block" : "sub-topic"} →
              </button>
            )}
          </div>

          <div>
            <label className="block text-xs text-ink-dim mb-1">Lessons claimed</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={50}
                value={lessons}
                onChange={(e) => setLessons(Math.max(0, Number(e.target.value) || 0))}
                className="w-24 px-2 py-1 border border-line rounded font-mono text-sm"
              />
              {naturalLessons.value !== null && lessons !== naturalLessons.value && (
                <button
                  type="button"
                  onClick={() => setLessons(naturalLessons.value!)}
                  className="text-[11px] px-2 py-1 border border-line rounded hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy"
                  title={`Reset to the count defined by the ${naturalLessons.label}`}
                >
                  Reset to {naturalLessons.value}
                </button>
              )}
            </div>
            {naturalLessons.value !== null && (
              <p className="text-[11px] mt-1">
                <span className="text-ink-dim">{naturalLessons.label} defines</span>{" "}
                <span className="font-mono text-ink">{naturalLessons.value} lesson{naturalLessons.value === 1 ? "" : "s"}</span>
                {lessons === naturalLessons.value && (
                  <span className="text-good ml-2">✓ matches</span>
                )}
                {lessons !== naturalLessons.value && (
                  <span className="text-ink-fade ml-2">
                    (you've set {lessons}{lessons < naturalLessons.value ? " — narrower than spec" : " — wider than spec"})
                  </span>
                )}
              </p>
            )}
            <p className="text-[11px] text-ink-fade mt-1">
              Range in source: lessons {block.lessonRange[0] + 1}–{block.lessonRange[1]}
            </p>
          </div>

          {description.note && (
            <div className="text-xs text-ink-dim bg-surface-2 p-2 rounded border border-line">
              {description.note}
            </div>
          )}

          {isRetrieval && customBlock && (
            <div className="border-t border-line pt-4">
              {onUpdateRevisits ? (
                <RevisitsPicker
                  subject={subject}
                  selected={revisitsDraft}
                  onToggle={toggleRevisit}
                />
              ) : (
                <p className="text-[11px] text-ink-fade italic">
                  Revisits: {customBlock.revisits?.join(", ") || "none"} (read-only)
                </p>
              )}
            </div>
          )}
        </div>

        <footer className="px-5 py-3 border-t border-line flex items-center gap-2">
          <button
            onClick={handleRemove}
            className="px-3 py-1.5 text-sm border border-warn text-warn rounded hover:bg-warn/10"
          >
            Remove
          </button>
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm border border-line rounded hover:bg-surface-2"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-3 py-1.5 text-sm bg-navy text-bg rounded hover:bg-navy-dim"
          >
            Save
          </button>
        </footer>
      </div>
    </div>
  );
}

/**
 * The "natural" lesson count for a placement — i.e. the count it would have if
 * the user weren't deliberately narrowing or widening it from the spec source.
 * - Sub-topic placement → total lessons in the spec sub-topic
 * - Custom block      → the lesson count the user defined on the custom block
 * - EoHT              → no natural count (returns null)
 */
function naturalLessonCount(
  block: NonNullable<ReturnType<typeof findPlacedBlock>>["block"],
  subject: Subject
): { value: number | null; label: string } {
  if (block.source.kind === "sub-topic") {
    const found = findTopicAndSubTopic(subject.workingSpec, block.source.subTopicCode);
    if (!found) return { value: null, label: "Spec" };
    return { value: found.subTopic.lessons.length, label: "Spec" };
  }
  if (block.source.kind === "custom") {
    const customBlockId = block.source.customBlockId;
    const cb = subject.customBlocks.find((c) => c.id === customBlockId);
    if (!cb) return { value: null, label: "Custom block" };
    return { value: cb.lessons, label: "Custom block" };
  }
  return { value: null, label: "EoHT" };
}

function describeForModal(
  block: NonNullable<ReturnType<typeof findPlacedBlock>>["block"],
  subject: Subject
) {
  if (block.source.kind === "sub-topic") {
    const found = findTopicAndSubTopic(subject.workingSpec, block.source.subTopicCode);
    if (!found) {
      return {
        code: block.source.subTopicCode,
        name: "(missing sub-topic)",
        colour: "#8A8478",
        note: null as string | null,
      };
    }
    return {
      code: found.subTopic.code,
      name: found.subTopic.name,
      colour: getTopicColour(subject.workingSpec, found.topic.code),
      note: found.subTopic.notes,
    };
  }
  if (block.source.kind === "custom") {
    const customBlockId = block.source.customBlockId;
    const cb = subject.customBlocks.find((c) => c.id === customBlockId);
    const isRetrieval = cb?.kind === "retrieval";
    const revisitsNote =
      isRetrieval && cb?.revisits && cb.revisits.length > 0
        ? `Revisits: ${cb.revisits.join(", ")}`
        : null;
    return {
      code: isRetrieval ? "↺" : "CB",
      name: cb?.name ?? "Custom block",
      colour: cb?.colour ?? "#8A8478",
      note: revisitsNote,
    };
  }
  return {
    code: "EoHT",
    name: "End-of-half-term test",
    colour: "#8A8478",
    note: null as string | null,
  };
}
