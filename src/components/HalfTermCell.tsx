import { useDraggable, useDroppable } from "@dnd-kit/core";
import { useState } from "react";

import {
  findCustomBlock,
  findTopicAndSubTopic,
  getTopicColour,
  sortedBlocksForCell,
} from "@/model/queries";
import { halfTermUsed } from "@/model/timeline";
import type { HalfTerm, PlacedBlock, Subject } from "@/model/types";

import { Block } from "./Block";
import { RetrievalSuggestionPopover } from "./RetrievalSuggestionPopover";

export interface HalfTermCellProps {
  readonly subject: Subject;
  readonly halfTerm: HalfTerm;
  readonly onBlockClick: (placedBlockId: string) => void;
}

export function HalfTermCell({
  subject,
  halfTerm,
  onBlockClick,
}: HalfTermCellProps): JSX.Element {
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
      data-testid={`halfterm-cell-${halfTerm.id}`}
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
        {sortedBlocksForCell(halfTerm.placedBlocks).map((pb) => (
          <PlacedBlockCard
            key={pb.id}
            placed={pb}
            subject={subject}
            onClick={() => onBlockClick(pb.id)}
          />
        ))}
        {halfTerm.placedBlocks.length === 0 && (
          <div className="text-[10px] text-ink-fade italic text-center mt-4">
            Drop a block here
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

interface PlacedBlockCardProps {
  readonly placed: PlacedBlock;
  readonly subject: Subject;
  readonly onClick: () => void;
}

function PlacedBlockCard({
  placed,
  subject,
  onClick,
}: PlacedBlockCardProps): JSX.Element {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `placed:${placed.id}`,
    data: {
      kind: "placed",
      placedBlockId: placed.id,
    },
  });

  const display = describePlacement(placed, subject);

  return (
    <div ref={setNodeRef} {...listeners} {...attributes} className="touch-none">
      <Block
        code={display.code}
        name={display.name}
        lessons={placed.lessonsClaimed}
        colour={display.colour}
        variant={display.variant}
        splitBadge={placed.splitType}
        dragging={isDragging}
        onClick={onClick}
      />
    </div>
  );
}

function describePlacement(placed: PlacedBlock, subject: Subject) {
  if (placed.source.kind === "sub-topic") {
    const found = findTopicAndSubTopic(subject.workingSpec, placed.source.subTopicCode);
    if (!found) {
      return {
        code: placed.source.subTopicCode,
        name: "(missing sub-topic)",
        colour: "#8A8478",
        variant: "placed" as const,
      };
    }
    return {
      code: found.subTopic.code,
      name: placed.userEdits.title ?? found.subTopic.name,
      colour: getTopicColour(subject.workingSpec, found.topic.code),
      variant: "placed" as const,
    };
  }
  if (placed.source.kind === "custom") {
    const cb = findCustomBlock(subject, placed.source.customBlockId);
    const isRetrieval = cb?.kind === "retrieval";
    const revisitsList =
      isRetrieval && cb?.revisits && cb.revisits.length > 0
        ? ` — revisits ${cb.revisits.join(", ")}`
        : "";
    const baseName = placed.userEdits.title ?? cb?.name ?? "(missing custom block)";
    return {
      code: isRetrieval ? "↺" : "CB",
      name: baseName + revisitsList,
      colour: cb?.colour ?? "#8A8478",
      variant: "custom" as const,
    };
  }
  // eoht
  const ht = subject.timeline.halfTerms.find((h) =>
    h.placedBlocks.some((p) => p.id === placed.id)
  );
  return {
    code: "EoHT",
    name: placed.userEdits.title ?? (ht ? `${ht.year} ${ht.label} test` : "End-of-half-term test"),
    colour: "#8A8478",
    variant: "eoht" as const,
  };
}
