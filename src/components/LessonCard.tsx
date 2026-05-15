import { useDraggable } from "@dnd-kit/core";

import type { Lesson, SubTopic } from "@/model/types";

export interface LessonCardProps {
  readonly placedBlockId: string;
  readonly localLessonIdx: number;
  readonly subTopic: SubTopic;
  readonly lesson: Lesson;
  readonly colour: string;
  readonly onClick: () => void;
}

export function LessonCard({
  placedBlockId,
  localLessonIdx,
  subTopic,
  lesson,
  colour,
  onClick,
}: LessonCardProps): JSX.Element {
  const dragId = `lesson:${placedBlockId}:${localLessonIdx}`;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: dragId,
    data: {
      kind: "lesson",
      placedBlockId,
      localLessonIdx,
      subTopicCode: subTopic.code,
    },
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={onClick}
      role="button"
      tabIndex={0}
      className={
        "touch-none flex items-start gap-1.5 px-1.5 py-1 rounded border bg-surface text-[11px] leading-tight " +
        "cursor-pointer transition border-line hover:bg-surface-2 " +
        (isDragging ? "opacity-40 ring-2 ring-navy" : "")
      }
      style={{ borderLeft: `3px solid ${colour}` }}
      title={lesson.title}
    >
      <span className="font-mono text-[9px] text-ink-fade tabular-nums w-3 shrink-0">
        L{lesson.number}
      </span>
      <span className="flex-1 truncate">{lesson.title}</span>
      <span className="flex items-center gap-0.5 text-[9px]">
        {lesson.isDepth && <span title="Depth (★)" className="text-gold">★</span>}
        {lesson.practical && (
          <span title={`Practical: ${lesson.practical}`} className="text-navy">⚗</span>
        )}
        {lesson.separateOnly && <span title="Separate science only" className="text-ink-dim">SS</span>}
      </span>
    </div>
  );
}
