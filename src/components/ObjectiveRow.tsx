import { useDroppable } from "@dnd-kit/core";

import type { ObjectiveRow as ObjectiveRowData } from "@/model/objectives";
import { getTopicColour } from "@/model/queries";
import type { Spec } from "@/model/types";

import { ObjectiveChip } from "./ObjectiveChip";

export interface ObjectiveRowProps {
  readonly row: ObjectiveRowData;
  readonly workingSpec: Spec;
  readonly onEditObjective: (objectiveId: string) => void;
}

export function ObjectiveRow({
  row,
  workingSpec,
  onEditObjective,
}: ObjectiveRowProps): JSX.Element {
  const colour = getTopicColour(workingSpec, row.topic.code);
  const droppableId = `lesson-row:${row.lesson.id}`;
  const { setNodeRef, isOver } = useDroppable({
    id: droppableId,
    data: { kind: "lesson", subTopicCode: row.subTopic.code, lessonId: row.lesson.id },
  });

  return (
    <article
      ref={setNodeRef}
      className={
        "grid grid-cols-[140px_180px_1fr] gap-3 px-3 py-2 border-b border-line " +
        (isOver ? "bg-navy/5 ring-1 ring-navy/30" : "hover:bg-surface-2/40")
      }
    >
      <div className="flex items-start gap-2 text-[11px] text-ink-dim pt-0.5">
        <span
          aria-hidden
          className="inline-block w-2 h-2 rounded-full mt-1"
          style={{ backgroundColor: colour }}
        />
        <div className="flex flex-col">
          <span className="font-mono text-[10px] text-ink-fade">{row.halfTerm.id}</span>
          <span>{row.halfTerm.year} · {row.halfTerm.label}</span>
        </div>
      </div>

      <div className="text-[12px]">
        <div className="font-mono text-[10px] text-ink-fade">
          {row.subTopic.code} · L{row.lesson.number}
        </div>
        <div className="text-ink leading-tight">{row.lesson.title}</div>
        <div className="text-[10px] text-ink-fade truncate">{row.subTopic.name}</div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {row.lesson.objectives.length === 0 && (
          <span className="text-[11px] text-ink-fade italic px-1">
            No objectives mapped — drag from the unmapped panel or another row.
          </span>
        )}
        {row.lesson.objectives.map((o) => (
          <ObjectiveChip
            key={o.id}
            objective={o}
            draggableId={`obj-${o.id}`}
            payload={{
              kind: "objective",
              objectiveId: o.id,
              fromLessonId: row.lesson.id,
              fromSubTopicCode: row.subTopic.code,
            }}
            onClick={() => onEditObjective(o.id)}
          />
        ))}
      </div>
    </article>
  );
}
