import { useDroppable } from "@dnd-kit/core";

import { getNonContentLessonsInCell, getTopicBlocksForCell } from "@/model/topics";
import { halfTermUsed } from "@/model/timeline";
import type { HalfTerm, Subject } from "@/model/types";

import { TopicBlock } from "./TopicBlock";

export interface TopicHalfTermCellProps {
  readonly subject: Subject;
  readonly halfTerm: HalfTerm;
  readonly onEditTopic?: (topicCode: string) => void;
}

export function TopicHalfTermCell({
  subject,
  halfTerm,
  onEditTopic,
}: TopicHalfTermCellProps): JSX.Element {
  const { setNodeRef, isOver } = useDroppable({
    id: `topic-term:${halfTerm.id}`,
    data: { kind: "term", termId: halfTerm.id },
  });

  const used = halfTermUsed(halfTerm);
  const over = used > halfTerm.budget;
  const summaries = getTopicBlocksForCell(subject, halfTerm);
  const nonContent = getNonContentLessonsInCell(halfTerm);

  return (
    <div
      ref={setNodeRef}
      className={
        "flex flex-col rounded-card border bg-surface min-h-[140px] transition " +
        (isOver ? "ring-2 ring-navy bg-surface-2 border-navy" : "border-line")
      }
    >
      <header className="flex items-baseline justify-between px-2 py-1 border-b border-line text-xs">
        <span className="font-display text-ink">{halfTerm.label}</span>
        <span
          className={
            "font-mono tabular-nums text-[11px] " +
            (over ? "text-warn font-semibold" : "text-ink-dim")
          }
        >
          {used} / {halfTerm.budget}
        </span>
      </header>
      <div className="flex flex-col gap-1 p-1.5 flex-1">
        {summaries.map((s) => (
          <TopicBlock
            key={s.topicCode}
            summary={s}
            halfTermId={halfTerm.id}
            workingSpec={subject.workingSpec}
            {...(onEditTopic ? { onEdit: onEditTopic } : {})}
          />
        ))}
        {summaries.length === 0 && (
          <div className="text-[10px] text-ink-fade italic text-center mt-4">
            No topics placed
          </div>
        )}
        {nonContent > 0 && (
          <div
            className="mt-1 text-[10px] font-mono text-ink-fade px-2 py-1 border border-dashed border-line-2 rounded-card italic"
            title="Includes end-of-half-term tests and custom blocks (not draggable from the Topic view)"
          >
            +{nonContent}L EoHT / custom
          </div>
        )}
      </div>
    </div>
  );
}
