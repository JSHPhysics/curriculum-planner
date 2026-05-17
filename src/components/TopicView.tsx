import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useState } from "react";

import { getTopicColour } from "@/model/queries";
import { getVisibleTimelineYears } from "@/model/timeline";
import { getTopicBlocksForCell } from "@/model/topics";
import type { HalfTerm, Subject, YearId } from "@/model/types";
import { useWorkspaceStore } from "@/store/useWorkspaceStore";

import { TopicBlock } from "./TopicBlock";
import { TopicHalfTermCell } from "./TopicHalfTermCell";
import type { TopicBlockDragPayload } from "./TopicBlock";

export interface TopicViewProps {
  readonly subject: Subject;
}

export function TopicView({ subject }: TopicViewProps): JSX.Element {
  const moveTopicInHalfTerm = useWorkspaceStore((s) => s.moveTopicInHalfTerm);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  );

  const [activeDrag, setActiveDrag] = useState<TopicBlockDragPayload | null>(null);

  function handleDragStart(e: DragStartEvent): void {
    const data = e.active.data.current as TopicBlockDragPayload | undefined;
    if (data) setActiveDrag(data);
  }

  function handleDragEnd(e: DragEndEvent): void {
    setActiveDrag(null);
    const drag = e.active.data.current as TopicBlockDragPayload | undefined;
    const drop = e.over?.data.current as
      | { kind: "term"; termId: string }
      | undefined;
    if (!drag || !drop || drop.kind !== "term") return;
    moveTopicInHalfTerm(drag.topicCode, drag.fromTermId, drop.termId);
  }

  const years = getVisibleTimelineYears(subject);
  const byYear = new Map<YearId, HalfTerm[]>();
  for (const ht of subject.timeline.halfTerms) {
    const arr = byYear.get(ht.year) ?? [];
    arr.push(ht);
    byYear.set(ht.year, arr);
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex-1 overflow-auto p-4">
        <div className="flex flex-col gap-6 min-w-[1100px]">
          {years.map((year) => {
            const terms = byYear.get(year) ?? [];
            return (
              <section key={year}>
                <header className="flex items-baseline gap-3 mb-2 px-1">
                  <h2 className="font-display text-base text-navy">{year}</h2>
                  <span className="text-xs text-ink-fade">
                    Drag a topic block to move all its sub-topic placements in this half-term together.
                  </span>
                </header>
                <div
                  className="grid gap-3"
                  style={{
                    gridTemplateColumns: `repeat(${terms.length}, minmax(180px, 1fr))`,
                  }}
                >
                  {terms.map((ht) => (
                    <TopicHalfTermCell key={ht.id} subject={subject} halfTerm={ht} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {activeDrag ? <DragPreview drag={activeDrag} subject={subject} /> : null}
      </DragOverlay>
    </DndContext>
  );
}

interface DragPreviewProps {
  readonly drag: TopicBlockDragPayload;
  readonly subject: Subject;
}

function DragPreview({ drag, subject }: DragPreviewProps): JSX.Element {
  const halfTerm = subject.timeline.halfTerms.find((h) => h.id === drag.fromTermId);
  if (!halfTerm) return <div />;
  const summary = getTopicBlocksForCell(subject, halfTerm).find(
    (s) => s.topicCode === drag.topicCode
  );
  if (!summary) {
    return (
      <div
        className="px-2 py-1 rounded border bg-surface text-[11px] shadow-md"
        style={{
          borderLeft: `4px solid ${getTopicColour(subject.workingSpec, drag.topicCode)}`,
        }}
      >
        {drag.topicCode}
      </div>
    );
  }
  return (
    <div className="shadow-xl">
      <TopicBlock
        summary={summary}
        halfTermId={drag.fromTermId}
        workingSpec={subject.workingSpec}
      />
    </div>
  );
}
