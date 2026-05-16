import { useDroppable } from "@dnd-kit/core";

import type { UnmappedObjective } from "@/model/objectives";

import { ObjectiveChip } from "./ObjectiveChip";

export const UNMAPPED_DROPPABLE_ID = "unmapped-panel";

export interface UnmappedPanelProps {
  readonly unmapped: readonly UnmappedObjective[];
  readonly onEditObjective: (objectiveId: string) => void;
}

export function UnmappedPanel({
  unmapped,
  onEditObjective,
}: UnmappedPanelProps): JSX.Element {
  const { setNodeRef, isOver } = useDroppable({
    id: UNMAPPED_DROPPABLE_ID,
    data: { kind: "unmapped" },
  });

  return (
    <aside
      ref={setNodeRef}
      className={
        "w-72 shrink-0 border-l border-line bg-surface-2/60 overflow-y-auto " +
        (isOver ? "ring-2 ring-warn/40 bg-warn/5" : "")
      }
    >
      <header className="sticky top-0 bg-surface-2 border-b border-line px-3 py-2">
        <div className="font-display text-sm text-navy">Unmapped objectives</div>
        <div className="text-[11px] text-ink-fade">
          {unmapped.length === 0
            ? "All spec objectives are mapped."
            : `${unmapped.length} from the imported spec aren't in any lesson. Drag onto a row, or drop a chip here to remove from its lesson.`}
        </div>
      </header>
      <div className="p-2 flex flex-col gap-2">
        {unmapped.map((u) => (
          <div
            key={u.objective.id}
            className="bg-bg border border-line rounded p-2"
          >
            <div className="font-mono text-[10px] text-ink-fade mb-1">
              from {u.originSubTopicCode} · L{u.originLessonNumber}{" "}
              <span className="text-ink-fade/80">— {u.originSubTopicName}</span>
            </div>
            <ObjectiveChip
              objective={u.objective}
              draggableId={`obj-${u.objective.id}`}
              payload={{
                kind: "objective",
                objectiveId: u.objective.id,
                fromLessonId: null,
                fromSubTopicCode: null,
              }}
              onClick={() => onEditObjective(u.objective.id)}
              muted
            />
          </div>
        ))}
        {unmapped.length === 0 && (
          <p className="text-[11px] text-ink-fade italic p-2">
            Nothing here. Drop an objective chip onto this panel to unmap it.
          </p>
        )}
      </div>
    </aside>
  );
}
