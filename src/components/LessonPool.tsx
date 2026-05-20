import { useDraggable, useDroppable } from "@dnd-kit/core";
import { useState } from "react";

import { getLessonPoolEntries, getTopicColour } from "@/model/queries";
import type { Lesson, Subject, SubTopic } from "@/model/types";

export interface LessonPoolProps {
  readonly subject: Subject;
}

/**
 * Left-rail pool for the Lesson view (DEC-049). Lists every UNPLACED lesson,
 * grouped by sub-topic, draggable into any cell. Distinct from the sub-topic-
 * level Pool because here each lesson is its own draggable unit (so the
 * teacher can fan a sub-topic's lessons out across the calendar one at a
 * time, rather than dropping the whole sub-topic block and splitting later).
 *
 * Pool acts as a drop target too — dropping a placed lesson onto the pool
 * removes its placement, releasing the lesson back into the unplaced list.
 */
export function LessonPool({ subject }: LessonPoolProps): JSX.Element {
  const { setNodeRef, isOver } = useDroppable({
    id: "lesson-pool",
    data: { kind: "lesson-pool-bin" },
  });

  const groups = getLessonPoolEntries(subject);
  const totalUnplaced = groups.reduce((s, g) => s + g.lessons.length, 0);

  return (
    <aside
      ref={setNodeRef}
      className={
        "w-64 shrink-0 border-r border-line bg-surface overflow-y-auto transition " +
        (isOver ? "bg-surface-2" : "")
      }
    >
      <div className="px-3 py-2 border-b border-line bg-surface-2">
        <h2 className="font-display text-sm text-navy">
          Lesson pool · {totalUnplaced} unplaced
        </h2>
        <p className="text-[10px] text-ink-fade mt-0.5">
          Drag a single lesson onto a half-term. Drop a placed lesson here to
          remove it.
        </p>
      </div>
      {groups.length === 0 ? (
        <div className="p-4 text-xs text-ink-fade italic">
          Every lesson is placed. Nice.
        </div>
      ) : (
        <div className="p-2 flex flex-col gap-3">
          {groups.map((g) => (
            <LessonPoolGroup
              key={g.subTopic.code}
              subTopic={g.subTopic}
              lessons={g.lessons}
              colour={getTopicColour(subject.workingSpec, g.topic.code)}
            />
          ))}
        </div>
      )}
    </aside>
  );
}

interface LessonPoolGroupProps {
  readonly subTopic: SubTopic;
  readonly lessons: readonly { lesson: Lesson; absIndex: number }[];
  readonly colour: string;
}

function LessonPoolGroup({
  subTopic,
  lessons,
  colour,
}: LessonPoolGroupProps): JSX.Element {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-2 py-1 hover:bg-surface-2 rounded text-left"
      >
        <span
          aria-hidden
          className="inline-block w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: colour }}
        />
        <span className="font-mono text-[10px] tracking-wider text-ink-fade">
          {subTopic.code}
        </span>
        <span className="text-xs flex-1 truncate" title={subTopic.name}>
          {subTopic.name}
        </span>
        <span className="text-[10px] text-ink-fade font-mono">{lessons.length}</span>
        <span className="text-[10px] text-ink-fade">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="flex flex-col gap-0.5 pl-2 mt-0.5">
          {lessons.map(({ lesson, absIndex }) => (
            <LessonPoolCard
              key={lesson.id}
              subTopicCode={subTopic.code}
              lesson={lesson}
              absIndex={absIndex}
              displayNumber={absIndex + 1}
              colour={colour}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface LessonPoolCardProps {
  readonly subTopicCode: string;
  readonly lesson: Lesson;
  readonly absIndex: number;
  readonly displayNumber: number;
  readonly colour: string;
}

function LessonPoolCard({
  subTopicCode,
  lesson,
  absIndex,
  displayNumber,
  colour,
}: LessonPoolCardProps): JSX.Element {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `lesson-pool:${subTopicCode}:${lesson.id}`,
    data: {
      kind: "lesson-pool",
      subTopicCode,
      lessonId: lesson.id,
      absIndex,
    },
  });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={
        "touch-none flex items-start gap-1.5 px-1.5 py-1 rounded border bg-surface text-[11px] leading-tight " +
        "cursor-grab transition border-line hover:bg-surface-2 " +
        (isDragging ? "opacity-40 ring-2 ring-navy" : "")
      }
      style={{ borderLeft: `3px solid ${colour}` }}
      title={lesson.title}
    >
      <span className="font-mono text-[9px] text-ink-fade tabular-nums w-3 shrink-0">
        L{displayNumber}
      </span>
      <span className="flex-1 truncate">{lesson.title}</span>
      <span className="flex items-center gap-0.5 text-[9px]">
        {lesson.isDepth && <span title="Depth (★)" className="text-gold">★</span>}
        {lesson.practical && (
          <span title={`Practical: ${lesson.practical}`} className="text-navy">⚗</span>
        )}
        {lesson.separateOnly && (
          <span title="Separate science only" className="text-ink-dim">SS</span>
        )}
      </span>
    </div>
  );
}
