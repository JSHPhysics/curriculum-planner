import { useDraggable } from "@dnd-kit/core";

import type { Objective } from "@/model/types";

export interface ObjectiveChipDragPayload {
  readonly kind: "objective";
  readonly objectiveId: string;
  readonly fromLessonId: string | null;
  readonly fromSubTopicCode: string | null;
}

export interface ObjectiveChipProps {
  readonly objective: Objective;
  readonly draggableId: string;
  readonly payload: ObjectiveChipDragPayload;
  readonly onClick?: () => void;
  readonly muted?: boolean;
}

export function ObjectiveChip({
  objective,
  draggableId,
  payload,
  onClick,
  muted,
}: ObjectiveChipProps): JSX.Element {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: draggableId,
    data: payload,
  });

  return (
    <button
      ref={setNodeRef}
      onClick={onClick}
      {...listeners}
      {...attributes}
      className={
        "text-left text-[12px] leading-snug px-2 py-1 rounded border " +
        "flex items-start gap-1.5 cursor-grab active:cursor-grabbing " +
        (muted
          ? "bg-surface-2 border-line-2 text-ink-dim"
          : "bg-surface border-line hover:border-navy/40 hover:bg-bg") +
        (isDragging ? " opacity-40" : "") +
        (objective.isDepth ? " border-l-[3px] border-l-gold" : "")
      }
      title={objective.text}
    >
      {objective.isDepth && (
        <span aria-hidden className="text-gold text-xs leading-none mt-0.5">
          ★
        </span>
      )}
      <span className="flex-1">{objective.text || <em className="text-ink-fade">(empty objective)</em>}</span>
    </button>
  );
}
