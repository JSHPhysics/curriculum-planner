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
import { getVisibleTimelineYears } from "@/model/timeline";
import type { HalfTerm, Subject, YearId } from "@/model/types";
import { useWorkspaceStore } from "@/store/useWorkspaceStore";

import { BlockEditModal } from "./BlockEditModal";
import { ContextMenu, type ContextMenuItem } from "./ContextMenu";
import { LessonEditModal } from "./LessonEditModal";
import { LessonHalfTermCell } from "./LessonHalfTermCell";
import { LessonPool } from "./LessonPool";

interface DragLessonPayload {
  readonly kind: "lesson";
  readonly placedBlockId: string;
  readonly localLessonIdx: number;
  readonly subTopicCode: string;
}

interface DragLessonPoolPayload {
  readonly kind: "lesson-pool";
  readonly subTopicCode: string;
  readonly lessonId: string;
  readonly absIndex: number;
}

type DragPayload = DragLessonPayload | DragLessonPoolPayload;

export interface LessonViewProps {
  readonly subject: Subject;
}

export function LessonView({ subject }: LessonViewProps): JSX.Element {
  const extractAndMoveLesson = useWorkspaceStore((s) => s.extractAndMoveLesson);
  const extractAndMoveLessonToIndex = useWorkspaceStore(
    (s) => s.extractAndMoveLessonToIndex
  );
  const placeLessonAtIndex = useWorkspaceStore((s) => s.placeLessonAtIndex);
  const removePlacedLesson = useWorkspaceStore((s) => s.removePlacedLesson);
  const setPlacedBlockTitle = useWorkspaceStore((s) => s.setPlacedBlockTitle);
  const reorderLessonInSubTopic = useWorkspaceStore((s) => s.reorderLessonInSubTopic);
  const moveLessonBetweenSubTopics = useWorkspaceStore(
    (s) => s.moveLessonBetweenSubTopics
  );
  const duplicateLesson = useWorkspaceStore((s) => s.duplicateLesson);
  const deleteLesson = useWorkspaceStore((s) => s.deleteLesson);
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

  const [activeDrag, setActiveDrag] = useState<DragPayload | null>(null);
  const [openModal, setOpenModal] = useState<
    | { kind: "block"; placedBlockId: string }
    | { kind: "lesson"; subTopicCode: string; lessonId: string }
    | null
  >(null);
  const [contextMenu, setContextMenu] = useState<
    | { readonly x: number; readonly y: number; readonly items: readonly ContextMenuItem[] }
    | null
  >(null);

  function showLessonContextMenu(
    args: {
      readonly subTopicCode: string;
      readonly lessonId: string;
      readonly placedBlockId: string;
      readonly localLessonIdx: number;
    },
    coords: { readonly x: number; readonly y: number }
  ): void {
    const items: ContextMenuItem[] = [
      {
        label: "Return to pool",
        onClick: () =>
          removePlacedLesson(args.placedBlockId, args.localLessonIdx),
      },
      {
        label: "Rename / edit lesson…",
        onClick: () =>
          setOpenModal({
            kind: "lesson",
            subTopicCode: args.subTopicCode,
            lessonId: args.lessonId,
          }),
      },
      {
        label: "Duplicate lesson",
        onClick: () => duplicateLesson(args.subTopicCode, args.lessonId),
        separatorBefore: true,
      },
      {
        label: "Delete lesson from spec",
        destructive: true,
        onClick: () => {
          if (
            confirm(
              "Delete this lesson? The lesson is removed from the sub-topic " +
                "entirely; placements covering it shrink. Cannot be undone."
            )
          ) {
            deleteLesson(args.subTopicCode, args.lessonId);
          }
        },
      },
    ];
    setContextMenu({ x: coords.x, y: coords.y, items });
  }

  function handleDragStart(e: DragStartEvent): void {
    const data = e.active.data.current as DragPayload | undefined;
    if (data) setActiveDrag(data);
  }

  function handleDragEnd(e: DragEndEvent): void {
    setActiveDrag(null);
    const drag = e.active.data.current as DragPayload | undefined;
    const drop = e.over?.data.current as
      | { kind: "term"; termId: string }
      | { kind: "slot"; termId: string; index: number }
      | { kind: "lesson-slot"; termId: string; subTopicCode: string; lessonIdx: number; cellIndex: number }
      | { kind: "lesson-pool-bin" }
      | undefined;
    if (!drag || !drop) return;

    // DEC-049: pool-card drag → cell drop. Single specific lesson lands at
    // chosen slot (or appended). Pool itself acts as a bin: dragging a
    // PLACED lesson onto the pool removes that lesson's placement.
    if (drag.kind === "lesson-pool") {
      if (drop.kind === "slot") {
        placeLessonAtIndex(
          drag.subTopicCode,
          drag.absIndex,
          drop.termId,
          drop.index
        );
        return;
      }
      if (drop.kind === "term") {
        placeLessonAtIndex(drag.subTopicCode, drag.absIndex, drop.termId, -1);
        return;
      }
      // pool→pool and pool→lesson-slot: ignore (no meaningful action).
      return;
    }

    // Placed-lesson drag → pool bin: discard, releasing the lesson back into
    // the unplaced pool (DEC-049). Source block is shrunk or split around
    // the removed lesson.
    if (drop.kind === "lesson-pool-bin") {
      removePlacedLesson(drag.placedBlockId, drag.localLessonIdx);
      return;
    }

    // DEC-048: same-sub-topic, same-cell reorder via lesson-slot.
    // DEC-055: cross-sub-topic lesson-slot drop now actually RE-PARENTS
    // the lesson — moves it from the source sub-topic's lessons[] into
    // the target sub-topic's lessons[] at the requested index. The
    // target cell's existing PB extends to include the new lesson, so
    // the moved card lands at the intended position inside the target
    // sub-topic's group (the prior implementation created a phantom
    // source-sub-topic block at the wrong spot).
    if (drop.kind === "lesson-slot") {
      // Resolve the lesson id from drag payload (source PB + local idx →
      // absolute index in source sub-topic's lessons array).
      let lessonId: string | null = null;
      for (const ht of subject.timeline.halfTerms) {
        const pb = ht.placedBlocks.find((b) => b.id === drag.placedBlockId);
        if (!pb || pb.source.kind !== "sub-topic") continue;
        const found = findTopicAndSubTopic(
          subject.workingSpec,
          pb.source.subTopicCode
        );
        if (!found) break;
        const absIdx = pb.lessonRange[0] + drag.localLessonIdx;
        lessonId = found.subTopic.lessons[absIdx]?.id ?? null;
        break;
      }
      if (!lessonId) return;

      if (drag.subTopicCode === drop.subTopicCode) {
        reorderLessonInSubTopic(drop.subTopicCode, lessonId, drop.lessonIdx);
      } else {
        moveLessonBetweenSubTopics(
          drag.subTopicCode,
          lessonId,
          drop.subTopicCode,
          drop.lessonIdx,
          drop.termId
        );
      }
      return;
    }

    if (drop.kind === "slot") {
      extractAndMoveLessonToIndex(
        drag.placedBlockId,
        drag.localLessonIdx,
        drop.termId,
        drop.index
      );
      return;
    }
    if (drop.kind === "term") {
      extractAndMoveLesson(drag.placedBlockId, drag.localLessonIdx, drop.termId);
      return;
    }
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
      <LessonPool subject={subject} />
      <div className="flex-1 overflow-auto p-4">
        <div className="flex flex-col gap-6 min-w-[900px]">
          {years.map((year) => {
            const terms = byYear.get(year) ?? [];
            return (
              <section key={year}>
                <header className="flex items-baseline gap-3 mb-2 px-1">
                  <h2 className="font-display text-base text-navy">{year}</h2>
                  <span className="text-xs text-ink-fade">
                    Drag from the pool to place; drag between cells to move.
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
                      onLessonContextMenu={showLessonContextMenu}
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

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}

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
          onSetTitle={(title) => setPlacedBlockTitle(openModal.placedBlockId, title)}
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
            // DEC-055: when the modal re-parents the lesson via
            // onMoveToSubTopic below, the moveLessonBetweenSubTopics call
            // fires before this onSave, so by the time editLesson runs we
            // need to address the lesson by its NEW subTopicCode. The
            // modal's local state holds the new target; the openModal still
            // points at the old code. So fall back to walking the spec by
            // lessonId rather than trusting openModal.subTopicCode.
            const stCode = openModal.subTopicCode;
            editLesson(stCode, openModal.lessonId, rest);
            setLessonObjectives(stCode, openModal.lessonId, objectives);
          }}
          onMoveToSubTopic={(toCode) => {
            // No specific target placement: insert at end of target
            // sub-topic's lessons array, with no cell to extend. The
            // lesson lands in the pool; user can drag it from there.
            moveLessonBetweenSubTopics(
              openModal.subTopicCode,
              openModal.lessonId,
              toCode,
              Number.MAX_SAFE_INTEGER,
              ""
            );
            // Update the open-modal state to the new subTopicCode so any
            // subsequent edits within this same modal session (before
            // close) address the right entity.
            setOpenModal({ kind: "lesson", subTopicCode: toCode, lessonId: openModal.lessonId });
          }}
        />
      )}
    </DndContext>
  );
}

interface DragPreviewProps {
  readonly drag: DragPayload;
  readonly subject: Subject;
}

function DragPreview({ drag, subject }: DragPreviewProps): JSX.Element {
  const found = findTopicAndSubTopic(subject.workingSpec, drag.subTopicCode);
  if (!found) return <div />;
  // Resolve the absolute lesson index. For pool drags it's given directly;
  // for placed-lesson drags it's lessonRange[0] of the source block plus the
  // local idx. The display number uses the same 1-based sub-topic index as
  // LessonCard (DEC-048).
  let lessonIdx: number;
  if (drag.kind === "lesson-pool") {
    lessonIdx = drag.absIndex;
  } else {
    lessonIdx = drag.localLessonIdx;
    for (const ht of subject.timeline.halfTerms) {
      const pb = ht.placedBlocks.find((b) => b.id === drag.placedBlockId);
      if (pb && pb.source.kind === "sub-topic") {
        lessonIdx = pb.lessonRange[0] + drag.localLessonIdx;
        break;
      }
    }
  }
  const lesson = found.subTopic.lessons[lessonIdx];
  const displayNumber = lessonIdx + 1;
  const colour = getTopicColour(subject.workingSpec, found.topic.code);
  return (
    <div
      className="px-2 py-1 rounded border bg-surface text-[11px] shadow-md"
      style={{ borderLeft: `3px solid ${colour}` }}
    >
      <span className="font-mono text-[9px] text-ink-fade mr-1">
        {found.subTopic.code} · L{displayNumber}
      </span>
      {lesson?.title ?? "Moving lesson…"}
    </div>
  );
}
