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

import { findTopicAndSubTopic, getTopicColour } from "@/model/queries";
import { getTimelineYears } from "@/model/timeline";
import type { HalfTerm, Subject, YearId } from "@/model/types";
import { useWorkspaceStore } from "@/store/useWorkspaceStore";

import { BlockEditModal } from "./BlockEditModal";
import { LessonEditModal } from "./LessonEditModal";
import { LessonHalfTermCell } from "./LessonHalfTermCell";

interface DragLessonPayload {
  readonly kind: "lesson";
  readonly placedBlockId: string;
  readonly localLessonIdx: number;
  readonly subTopicCode: string;
}

export interface LessonViewProps {
  readonly subject: Subject;
}

export function LessonView({ subject }: LessonViewProps): JSX.Element {
  const extractAndMoveLesson = useWorkspaceStore((s) => s.extractAndMoveLesson);
  const splitBlock = useWorkspaceStore((s) => s.splitBlock);
  const recombineBlock = useWorkspaceStore((s) => s.recombineBlock);
  const removeBlock = useWorkspaceStore((s) => s.removeBlock);
  const editBlockLessons = useWorkspaceStore((s) => s.editBlockLessons);
  const editLesson = useWorkspaceStore((s) => s.editLesson);
  const setLessonObjectives = useWorkspaceStore((s) => s.setLessonObjectives);
  const updateCustomBlock = useWorkspaceStore((s) => s.updateCustomBlock);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  );

  const [activeDrag, setActiveDrag] = useState<DragLessonPayload | null>(null);
  const [openModal, setOpenModal] = useState<
    | { kind: "block"; placedBlockId: string }
    | { kind: "lesson"; subTopicCode: string; lessonId: string }
    | null
  >(null);

  function handleDragStart(e: DragStartEvent): void {
    const data = e.active.data.current as DragLessonPayload | undefined;
    if (data) setActiveDrag(data);
  }

  function handleDragEnd(e: DragEndEvent): void {
    setActiveDrag(null);
    const drag = e.active.data.current as DragLessonPayload | undefined;
    const drop = e.over?.data.current as
      | { kind: "term"; termId: string }
      | undefined;
    if (!drag || !drop || drop.kind !== "term") return;
    extractAndMoveLesson(drag.placedBlockId, drag.localLessonIdx, drop.termId);
  }

  const years = getTimelineYears(subject.timeline);
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
                    Drag lessons between cells to split a placed block.
                  </span>
                </header>
                <div
                  className="grid gap-3"
                  style={{
                    gridTemplateColumns: `repeat(${terms.length}, minmax(180px, 1fr))`,
                  }}
                >
                  {terms.map((ht) => (
                    <LessonHalfTermCell
                      key={ht.id}
                      subject={subject}
                      halfTerm={ht}
                      onOpenBlockModal={(id) =>
                        setOpenModal({ kind: "block", placedBlockId: id })
                      }
                      onOpenLessonModal={(stCode, lessonId) =>
                        setOpenModal({ kind: "lesson", subTopicCode: stCode, lessonId })
                      }
                    />
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

      {openModal?.kind === "block" && (
        <BlockEditModal
          subject={subject}
          placedBlockId={openModal.placedBlockId}
          onClose={() => setOpenModal(null)}
          onEditLessons={(n) => editBlockLessons(openModal.placedBlockId, n)}
          onSplit={(at) => splitBlock(openModal.placedBlockId, at)}
          onRecombine={() => recombineBlock(openModal.placedBlockId)}
          onRemove={() => removeBlock(openModal.placedBlockId)}
          onUpdateRevisits={(cbId, revisits) => updateCustomBlock(cbId, { revisits })}
        />
      )}
      {openModal?.kind === "lesson" && (
        <LessonEditModal
          subject={subject}
          subTopicCode={openModal.subTopicCode}
          lessonId={openModal.lessonId}
          onClose={() => setOpenModal(null)}
          onSave={(patch) => {
            const { objectives, ...rest } = patch;
            editLesson(openModal.subTopicCode, openModal.lessonId, rest);
            setLessonObjectives(openModal.subTopicCode, openModal.lessonId, objectives);
          }}
        />
      )}
    </DndContext>
  );
}

interface DragPreviewProps {
  readonly drag: DragLessonPayload;
  readonly subject: Subject;
}

function DragPreview({ drag, subject }: DragPreviewProps): JSX.Element {
  const found = findTopicAndSubTopic(subject.workingSpec, drag.subTopicCode);
  if (!found) return <div />;
  const lesson = found.subTopic.lessons[drag.localLessonIdx + 0];
  const colour = getTopicColour(subject.workingSpec, found.topic.code);
  return (
    <div
      className="px-2 py-1 rounded border bg-surface text-[11px] shadow-md"
      style={{ borderLeft: `3px solid ${colour}` }}
    >
      <span className="font-mono text-[9px] text-ink-fade mr-1">
        {found.subTopic.code} · L{lesson?.number ?? "?"}
      </span>
      {lesson?.title ?? "Moving lesson…"}
    </div>
  );
}
