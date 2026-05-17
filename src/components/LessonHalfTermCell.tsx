import { useDroppable } from "@dnd-kit/core";
import { useState } from "react";

import {
  findTopicAndSubTopic,
  getTopicColour,
  sortedBlocksForCell,
} from "@/model/queries";
import { halfTermUsed } from "@/model/timeline";
import type { HalfTerm, PlacedBlock, Subject } from "@/model/types";

import { LessonCard } from "./LessonCard";
import { RetrievalSuggestionPopover } from "./RetrievalSuggestionPopover";

export interface LessonHalfTermCellProps {
  readonly subject: Subject;
  readonly halfTerm: HalfTerm;
  readonly onOpenBlockModal: (placedBlockId: string) => void;
  readonly onOpenLessonModal: (subTopicCode: string, lessonId: string) => void;
}

export function LessonHalfTermCell({
  subject,
  halfTerm,
  onOpenBlockModal,
  onOpenLessonModal,
}: LessonHalfTermCellProps): JSX.Element {
  const { setNodeRef, isOver } = useDroppable({
    id: `term:${halfTerm.id}`,
    data: { kind: "term", termId: halfTerm.id },
  });

  const [suggestOpen, setSuggestOpen] = useState(false);
  const used = halfTermUsed(halfTerm);
  const over = used > halfTerm.budget;

  return (
    <div
      ref={setNodeRef}
      data-testid={`lesson-halfterm-cell-${halfTerm.id}`}
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
      <div className="flex flex-col gap-1.5 p-1.5 flex-1">
        {sortedBlocksForCell(halfTerm.placedBlocks).map((pb) => (
          <PlacedBlockGroup
            key={pb.id}
            placed={pb}
            subject={subject}
            onOpenBlockModal={onOpenBlockModal}
            onOpenLessonModal={onOpenLessonModal}
          />
        ))}
        {halfTerm.placedBlocks.length === 0 && (
          <div className="text-[10px] text-ink-fade italic text-center mt-4">
            Drop a lesson here
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => setSuggestOpen(true)}
        className="w-full px-2 py-1 text-[10px] text-ink-fade hover:text-gold hover:bg-gold/5 border-t border-line transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-inset"
        aria-label={`Suggest sub-topics worth revisiting in ${halfTerm.year} ${halfTerm.label}`}
        title={`Suggest sub-topics worth revisiting in ${halfTerm.year} ${halfTerm.label}`}
      >
        ↺ Suggest revisits
      </button>
      {suggestOpen && (
        <RetrievalSuggestionPopover
          subject={subject}
          halfTerm={halfTerm}
          onClose={() => setSuggestOpen(false)}
        />
      )}
    </div>
  );
}

interface PlacedBlockGroupProps {
  readonly placed: PlacedBlock;
  readonly subject: Subject;
  readonly onOpenBlockModal: (placedBlockId: string) => void;
  readonly onOpenLessonModal: (subTopicCode: string, lessonId: string) => void;
}

function PlacedBlockGroup({
  placed,
  subject,
  onOpenBlockModal,
  onOpenLessonModal,
}: PlacedBlockGroupProps): JSX.Element {
  if (placed.source.kind !== "sub-topic") {
    return <NonSubTopicGroup placed={placed} subject={subject} onOpen={onOpenBlockModal} />;
  }
  const found = findTopicAndSubTopic(subject.workingSpec, placed.source.subTopicCode);
  if (!found) {
    return (
      <div className="text-[10px] text-warn italic">
        (missing sub-topic {placed.source.subTopicCode})
      </div>
    );
  }
  const { topic, subTopic } = found;
  const colour = getTopicColour(subject.workingSpec, topic.code);
  const [start, end] = placed.lessonRange;
  const lessons = subTopic.lessons.slice(start, Math.min(end, subTopic.lessons.length));

  return (
    <div
      className="rounded border border-dashed p-1 flex flex-col gap-1"
      style={{ borderColor: colour + "55" }}
      title={`${subTopic.code} · ${subTopic.name}`}
    >
      <div className="flex items-baseline justify-between text-[9px] font-mono uppercase text-ink-fade px-0.5">
        <span>{subTopic.code}</span>
        {placed.splitType && (
          <span className="text-gold normal-case">
            {placed.splitType === "auto" ? "auto" : "split"}
          </span>
        )}
      </div>
      {lessons.map((lesson, localIdx) => (
        <LessonCard
          key={lesson.id}
          placedBlockId={placed.id}
          localLessonIdx={localIdx}
          subTopic={subTopic}
          lesson={lesson}
          colour={colour}
          onClick={() => onOpenLessonModal(subTopic.code, lesson.id)}
        />
      ))}
    </div>
  );
}

interface NonSubTopicGroupProps {
  readonly placed: PlacedBlock;
  readonly subject: Subject;
  readonly onOpen: (placedBlockId: string) => void;
}

function NonSubTopicGroup({ placed, subject, onOpen }: NonSubTopicGroupProps): JSX.Element {
  if (placed.source.kind === "eoht") {
    return (
      <button
        onClick={() => onOpen(placed.id)}
        className="text-left text-[11px] italic text-ink-dim px-1.5 py-1 border border-dashed border-line-2 rounded bg-surface-2/40 hover:bg-surface-2"
      >
        End-of-half-term test
      </button>
    );
  }
  const cb = subject.customBlocks.find(
    (c) => placed.source.kind === "custom" && c.id === placed.source.customBlockId
  );
  const isRetrieval = cb?.kind === "retrieval";
  const revisitsText =
    isRetrieval && cb?.revisits && cb.revisits.length > 0
      ? ` — revisits ${cb.revisits.join(", ")}`
      : "";
  return (
    <button
      onClick={() => onOpen(placed.id)}
      className="text-left text-[11px] px-1.5 py-1 rounded border border-line bg-surface hover:bg-surface-2"
      style={{ borderLeft: `3px solid ${cb?.colour ?? "#8A8478"}` }}
      title={(cb?.name ?? "Custom block") + revisitsText}
    >
      <span className="font-mono text-[9px] text-ink-fade uppercase mr-1">
        {isRetrieval ? "↺" : "CB"}
      </span>
      {cb?.name ?? "Custom block"}
      <span className="ml-2 text-ink-dim">{placed.lessonsClaimed}L</span>
    </button>
  );
}
