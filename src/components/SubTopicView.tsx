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
import type { CustomBlock, PlacedBlockSource, Subject } from "@/model/types";
import { useWorkspaceStore } from "@/store/useWorkspaceStore";

import { Block } from "./Block";
import { BlockEditModal } from "./BlockEditModal";
import { CustomBlockModal } from "./CustomBlockModal";
import { Pool } from "./Pool";
import { SubTopicEditModal } from "./SubTopicEditModal";
import { TimelineGrid } from "./TimelineGrid";
import { TopicEditModal } from "./TopicEditModal";

interface DragPoolPayload {
  readonly kind: "pool";
  readonly source: PlacedBlockSource;
  readonly lessons: number;
}

interface DragPlacedPayload {
  readonly kind: "placed";
  readonly placedBlockId: string;
}

type DragPayload = DragPoolPayload | DragPlacedPayload;

export interface SubTopicViewProps {
  readonly subject: Subject;
}

export function SubTopicView({ subject }: SubTopicViewProps): JSX.Element {
  const placeBlock = useWorkspaceStore((s) => s.placeBlock);
  const placeBlockWithSpillover = useWorkspaceStore((s) => s.placeBlockWithSpillover);
  const moveBlock = useWorkspaceStore((s) => s.moveBlock);
  const removeBlock = useWorkspaceStore((s) => s.removeBlock);
  const splitBlock = useWorkspaceStore((s) => s.splitBlock);
  const recombineBlock = useWorkspaceStore((s) => s.recombineBlock);
  const editBlockLessons = useWorkspaceStore((s) => s.editBlockLessons);
  const addCustomBlock = useWorkspaceStore((s) => s.addCustomBlock);
  const updateCustomBlock = useWorkspaceStore((s) => s.updateCustomBlock);
  const renameTopic = useWorkspaceStore((s) => s.renameTopic);
  const renameSubTopic = useWorkspaceStore((s) => s.renameSubTopic);

  const [activeDrag, setActiveDrag] = useState<DragPayload | null>(null);
  const [openModal, setOpenModal] = useState<
    | { kind: "edit"; placedBlockId: string }
    | { kind: "custom" }
    | { kind: "edit-topic"; topicCode: string }
    | { kind: "edit-subtopic"; subTopicCode: string }
    | null
  >(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  );

  function handleDragStart(e: DragStartEvent): void {
    const data = e.active.data.current as DragPayload | undefined;
    if (data) setActiveDrag(data);
  }

  function handleDragEnd(e: DragEndEvent): void {
    setActiveDrag(null);
    const drag = e.active.data.current as DragPayload | undefined;
    const drop = e.over?.data.current as
      | { kind: "term"; termId: string }
      | { kind: "pool" }
      | undefined;
    if (!drag || !drop) return;

    if (drag.kind === "pool" && drop.kind === "term") {
      if (subject.config.autoSpillover) {
        placeBlockWithSpillover(drag.source, drag.lessons, drop.termId);
      } else {
        placeBlock(drag.source, drop.termId, drag.lessons);
      }
      return;
    }

    if (drag.kind === "placed" && drop.kind === "term") {
      moveBlock(drag.placedBlockId, drop.termId);
      return;
    }

    if (drag.kind === "placed" && drop.kind === "pool") {
      removeBlock(drag.placedBlockId);
      return;
    }
  }

  function handleCustomCreate(block: CustomBlock): void {
    addCustomBlock(block);
    setOpenModal(null);
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <Pool
        subject={subject}
        onAddCustomBlock={() => setOpenModal({ kind: "custom" })}
        onEditTopic={(topicCode) => setOpenModal({ kind: "edit-topic", topicCode })}
        onEditSubTopic={(subTopicCode) =>
          setOpenModal({ kind: "edit-subtopic", subTopicCode })
        }
      />
      <TimelineGrid
        subject={subject}
        onBlockClick={(id) => setOpenModal({ kind: "edit", placedBlockId: id })}
      />
      <DragOverlay dropAnimation={null}>
        {activeDrag ? <DragPreview drag={activeDrag} subject={subject} /> : null}
      </DragOverlay>

      {openModal?.kind === "edit" && (
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
      {openModal?.kind === "custom" && (
        <CustomBlockModal
          subject={subject}
          onCancel={() => setOpenModal(null)}
          onCreate={handleCustomCreate}
        />
      )}
      {openModal?.kind === "edit-topic" &&
        (() => {
          const topic = subject.workingSpec.topics.find(
            (t) => t.code === openModal.topicCode
          );
          if (!topic) return null;
          return (
            <TopicEditModal
              topic={topic}
              onCancel={() => setOpenModal(null)}
              onSave={(patch) => {
                renameTopic(topic.code, patch);
                setOpenModal(null);
              }}
            />
          );
        })()}
      {openModal?.kind === "edit-subtopic" &&
        (() => {
          let found: import("@/model/types").SubTopic | null = null;
          for (const t of subject.workingSpec.topics) {
            for (const st of t.subTopics) {
              if (st.code === openModal.subTopicCode) {
                found = st;
                break;
              }
            }
            if (found) break;
          }
          if (!found) return null;
          return (
            <SubTopicEditModal
              subTopic={found}
              onCancel={() => setOpenModal(null)}
              onSave={(patch) => {
                renameSubTopic(found!.code, patch);
                setOpenModal(null);
              }}
            />
          );
        })()}
    </DndContext>
  );
}

interface DragPreviewProps {
  readonly drag: DragPayload;
  readonly subject: Subject;
}

function DragPreview({ drag, subject }: DragPreviewProps): JSX.Element {
  if (drag.kind === "pool") {
    if (drag.source.kind === "sub-topic") {
      const found = findTopicAndSubTopic(subject.workingSpec, drag.source.subTopicCode);
      return (
        <Block
          code={found?.subTopic.code ?? drag.source.subTopicCode}
          name={found?.subTopic.name ?? "(missing)"}
          lessons={drag.lessons}
          colour={
            found ? getTopicColour(subject.workingSpec, found.topic.code) : "#8A8478"
          }
          variant="pool"
        />
      );
    }
    if (drag.source.kind === "custom") {
      const customBlockId = drag.source.customBlockId;
      const cb = subject.customBlocks.find((c) => c.id === customBlockId);
      return (
        <Block
          code="CB"
          name={cb?.name ?? "Custom block"}
          lessons={drag.lessons}
          colour={cb?.colour ?? "#8A8478"}
          variant="custom"
        />
      );
    }
  }
  // placed: just show a generic preview
  return (
    <Block code="·" name="Moving…" lessons={0} colour="#8A8478" variant="placed" />
  );
}
