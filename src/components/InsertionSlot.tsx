import { useDroppable } from "@dnd-kit/core";

export type InsertionSlotData =
  | { readonly kind: "slot"; readonly termId: string; readonly index: number }
  | {
      readonly kind: "lesson-slot";
      readonly termId: string;
      readonly subTopicCode: string;
      readonly lessonIdx: number;
    };

export interface InsertionSlotProps {
  /** Stable id for this slot — pattern: `slot:${cellId}:${slotIndex}`. */
  readonly id: string;
  /** Drop data passed to the drag-end handler. */
  readonly data: InsertionSlotData;
  /**
   * When true, the slot fills any remaining vertical space in the cell so a
   * drop on the empty bottom of the cell still hits an indexed slot.
   */
  readonly fillRemaining?: boolean;
  /** "subtle" for nested lesson-slots, "bold" for between-block cell slots. */
  readonly emphasis?: "subtle" | "bold";
}

/**
 * Thin horizontal drop zone rendered between (and around) sibling drop
 * targets. When a drag hovers it, a coloured line appears showing exactly
 * where the dropped item will land. Underpins "drop between two items"
 * (DEC-048).
 *
 * Two variants:
 *   - "bold" (default) — between PlacedBlocks in a cell. Bigger visual
 *     indicator (3px tall navy bar).
 *   - "subtle" — between lesson cards inside a sub-topic group. Smaller
 *     indicator (2px bar) so it doesn't fight the parent group's borders.
 */
export function InsertionSlot({
  id,
  data,
  fillRemaining = false,
  emphasis = "bold",
}: InsertionSlotProps): JSX.Element {
  const { setNodeRef, isOver } = useDroppable({ id, data });
  return (
    <div
      ref={setNodeRef}
      aria-hidden="true"
      className={
        (fillRemaining ? "flex-1 min-h-[12px] " : "h-[6px] ") +
        "relative -my-[2px] flex items-center justify-center transition"
      }
    >
      {isOver && (
        <div
          className={
            "absolute inset-x-1 rounded shadow-sm " +
            (emphasis === "bold" ? "h-[3px] bg-navy" : "h-[2px] bg-gold")
          }
        />
      )}
    </div>
  );
}
