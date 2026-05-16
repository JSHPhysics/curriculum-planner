import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useMemo, useState } from "react";

import {
  computeObjectiveCoverage,
  findObjectiveLocation,
  getObjectiveRows,
} from "@/model/objectives";
import type { Subject } from "@/model/types";
import { useWorkspaceStore } from "@/store/useWorkspaceStore";

import { CoverageIndicator } from "./CoverageIndicator";
import { ObjectiveEditModal } from "./ObjectiveEditModal";
import { ObjectiveRow } from "./ObjectiveRow";
import { UnmappedPanel } from "./UnmappedPanel";
import type { ObjectiveChipDragPayload } from "./ObjectiveChip";

export interface ObjectiveViewProps {
  readonly subject: Subject;
}

type DropTargetData =
  | { kind: "lesson"; subTopicCode: string; lessonId: string }
  | { kind: "unmapped" };

export function ObjectiveView({ subject }: ObjectiveViewProps): JSX.Element {
  const placeObjectiveInLesson = useWorkspaceStore((s) => s.placeObjectiveInLesson);
  const removeObjective = useWorkspaceStore((s) => s.removeObjective);
  const updateObjective = useWorkspaceStore((s) => s.updateObjective);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  );

  const [activeDrag, setActiveDrag] = useState<ObjectiveChipDragPayload | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showUnmappedOnly, setShowUnmappedOnly] = useState(false);

  const rows = useMemo(() => getObjectiveRows(subject), [subject]);
  const coverage = useMemo(() => computeObjectiveCoverage(subject), [subject]);

  const filteredRows = showUnmappedOnly
    ? rows.filter((r) => r.lesson.objectives.length === 0)
    : rows;

  function handleDragStart(e: DragStartEvent): void {
    const data = e.active.data.current as ObjectiveChipDragPayload | undefined;
    if (data) setActiveDrag(data);
  }

  function handleDragEnd(e: DragEndEvent): void {
    setActiveDrag(null);
    const drag = e.active.data.current as ObjectiveChipDragPayload | undefined;
    const drop = e.over?.data.current as DropTargetData | undefined;
    if (!drag || !drop) return;
    if (drop.kind === "lesson") {
      placeObjectiveInLesson(drag.objectiveId, drop.subTopicCode, drop.lessonId);
    } else if (drop.kind === "unmapped") {
      // Only meaningful for chips dragged out of a lesson; unmapped→unmapped is a no-op.
      if (drag.fromLessonId !== null) {
        removeObjective(drag.objectiveId);
      }
    }
  }

  const activeObjective = activeDrag
    ? findObjectiveLocation(subject.workingSpec, activeDrag.objectiveId) ??
      findObjectiveLocation(subject.importedSpec, activeDrag.objectiveId)
    : null;

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex-1 flex flex-col overflow-hidden">
        <CoverageIndicator
          coverage={coverage}
          showUnmappedOnly={showUnmappedOnly}
          onToggleUnmappedOnly={() => setShowUnmappedOnly((v) => !v)}
        />
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 overflow-auto">
            <div className="grid grid-cols-[140px_180px_1fr] gap-3 px-3 py-1 border-b border-line bg-surface-2 text-[10px] uppercase tracking-wider text-ink-fade font-mono">
              <div>Half-term</div>
              <div>Lesson</div>
              <div>Objectives</div>
            </div>
            {filteredRows.length === 0 ? (
              <div className="p-6 text-center text-sm text-ink-fade">
                {rows.length === 0 ? (
                  <>No sub-topic lessons have been placed yet. Place blocks in the Sub-topic view first.</>
                ) : (
                  <>All visible rows already have objectives. Clear the unmapped filter to see everything.</>
                )}
              </div>
            ) : (
              filteredRows.map((row) => (
                <ObjectiveRow
                  key={row.key}
                  row={row}
                  workingSpec={subject.workingSpec}
                  onEditObjective={setEditingId}
                />
              ))
            )}
          </div>
          <UnmappedPanel
            unmapped={coverage.unmapped}
            onEditObjective={setEditingId}
          />
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {activeObjective ? (
          <div
            className="px-2 py-1 rounded border bg-surface text-[12px] shadow-md max-w-xs"
          >
            {activeObjective.objective.text || "(empty objective)"}
          </div>
        ) : null}
      </DragOverlay>

      {editingId && (
        <ObjectiveEditModal
          subject={subject}
          objectiveId={editingId}
          onClose={() => setEditingId(null)}
          onSave={(patch) => updateObjective(editingId, patch)}
          onRemove={() => removeObjective(editingId)}
        />
      )}
    </DndContext>
  );
}
