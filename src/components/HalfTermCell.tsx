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
import { InsertionSlot } from "./InsertionSlot";
import { RetrievalSuggestionPopover } from "./RetrievalSuggestionPopover";

export interface HalfTermCellProps {
  readonly subject: Subject;
  readonly halfTerm: HalfTerm;
  readonly onBlockClick: (placedBlockId: string) => void;
  /** DEC-052: right-click on a placed block opens a context menu. */
  readonly onBlockContextMenu?: (
    placedBlockId: string,
    coords: { readonly x: number; readonly y: number }
  ) => void;
}

export function HalfTermCell({
  subject,
  halfTerm,
  onBlockClick,
  onBlockContextMenu,
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
      <div className="flex flex-col p-1.5 flex-1">
        {(() => {
          const ordered = sortedBlocksForCell(halfTerm.placedBlocks, subject.customBlocks);
          // Interleave: slot, block, slot, block, …, slot (filling). The last
          // slot grows to absorb empty cell space so the user can drop into
          // the bottom area and have it count as "append" (DEC-048).
          return (
            <>
              {ordered.length === 0 && (
                <div className="text-[10px] text-ink-fade italic text-center mt-2 mb-1 pointer-events-none">
                  Drop a block here
                </div>
              )}
              {ordered.map((pb, idx) => (
                <div key={pb.id} className="contents">
                  <InsertionSlot
                    id={`slot:${halfTerm.id}:${idx}`}
                    data={{ kind: "slot", termId: halfTerm.id, index: idx }}
                  />
                  <PlacedBlockCard
                    placed={pb}
                    subject={subject}
                    onClick={() => onBlockClick(pb.id)}
                    {...(onBlockContextMenu
                      ? {
                          onContextMenu: (e: React.MouseEvent) => {
                            e.preventDefault();
                            onBlockContextMenu(pb.id, { x: e.clientX, y: e.clientY });
                          },
                        }
                      : {})}
                  />
                </div>
              ))}
              <InsertionSlot
                id={`slot:${halfTerm.id}:${ordered.length}`}
                data={{ kind: "slot", termId: halfTerm.id, index: ordered.length }}
                fillRemaining
              />
            </>
          );
        })()}
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
  readonly onContextMenu?: (e: React.MouseEvent) => void;
}

function PlacedBlockCard({
  placed,
  subject,
  onClick,
  onContextMenu,
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
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className="touch-none"
      onContextMenu={onContextMenu}
    >
      <Block
        code={display.code}
        name={display.name}
        lessons={placed.lessonsClaimed}
        colour={display.colour}
        variant={display.variant}
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
    const baseName = placed.userEdits.title ?? found.subTopic.name;
    // DEC-046: when a sub-topic appears in multiple cells, suffix every cell
    // after the first with its 1-based occurrence index ("Forces and motion",
    // "Forces and motion 2", "Forces and motion 3" …). User edits override
    // suffixing — if the planner has typed a custom title, respect it.
    const name =
      placed.userEdits.title !== undefined
        ? baseName
        : decorateWithOccurrence(baseName, placed, subject);
    return {
      code: found.subTopic.code,
      name,
      colour: getTopicColour(subject.workingSpec, found.topic.code),
      variant: "placed" as const,
    };
  }
  if (placed.source.kind === "custom") {
    const cb = findCustomBlock(subject, placed.source.customBlockId);
    // DEC-044: prefer `category` (new), fall back to legacy `kind` for mid-
    // migration files. EoHT-tagged customs use the dashed legacy variant so
    // the renderer styling preserves v1 UX.
    const category = cb?.category ?? (cb?.kind === "retrieval" ? "retrieval" : "other");
    const isRetrieval = category === "retrieval";
    const isEoHTish = cb?.isEoHT === true;
    const revisitsList =
      isRetrieval && cb?.revisits && cb.revisits.length > 0
        ? ` — revisits ${cb.revisits.join(", ")}`
        : "";
    const baseName = placed.userEdits.title ?? cb?.name ?? "(missing custom block)";
    const labelSuffix = cb?.label ? ` · ${cb.label}` : "";
    return {
      code: BLOCK_CODE_FOR_CATEGORY[category] ?? "CB",
      name: baseName + labelSuffix + revisitsList,
      colour: cb?.colour ?? "#8A8478",
      variant: (isEoHTish ? "eoht" : "custom") as "eoht" | "custom",
    };
  }
  // Legacy source.kind === "eoht" — deserializer rejects these per DEC-044,
  // but the renderer stays defensive.
  const ht = subject.timeline.halfTerms.find((h) =>
    h.placedBlocks.some((p) => p.id === placed.id)
  );
  return {
    code: "EoHT",
    name: placed.userEdits.title ?? (ht ? `${ht.year} ${ht.label} test (legacy)` : "End-of-half-term test"),
    colour: "#8A8478",
    variant: "eoht" as const,
  };
}

/**
 * Suffix a sub-topic name with " 2", " 3", … when this placement is not the
 * first occurrence of the sub-topic across the timeline. Returns the base
 * name unchanged for the first (or only) occurrence.
 *
 * Order is by half-term position then by index within the cell. Same-cell
 * blocks of the same sub-topic shouldn't co-exist after DEC-046 consolidation
 * but we walk defensively in case a legacy timeline slips through unrenormed.
 */
function decorateWithOccurrence(
  baseName: string,
  placed: PlacedBlock,
  subject: Subject
): string {
  if (placed.source.kind !== "sub-topic") return baseName;
  const code = placed.source.subTopicCode;
  let occurrence = 0;
  let total = 0;
  for (const ht of subject.timeline.halfTerms) {
    for (const b of ht.placedBlocks) {
      if (b.source.kind !== "sub-topic" || b.source.subTopicCode !== code) continue;
      total++;
      if (b.id === placed.id) occurrence = total;
    }
  }
  if (total <= 1 || occurrence <= 1) return baseName;
  return `${baseName} ${occurrence}`;
}

const BLOCK_CODE_FOR_CATEGORY: Record<string, string> = {
  test: "TST",
  lesson: "LSN",
  unit: "UNT",
  assessment: "ASM",
  retrieval: "↺",
  other: "CB",
};
