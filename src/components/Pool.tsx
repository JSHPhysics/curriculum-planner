import { useDraggable, useDroppable } from "@dnd-kit/core";
import { useState } from "react";

import { getPoolEntries, getTopicColour } from "@/model/queries";
import type { CustomBlock, Subject, Topic } from "@/model/types";

import { Block } from "./Block";

export interface PoolProps {
  readonly subject: Subject;
  readonly onAddCustomBlock: () => void;
}

export function Pool({ subject, onAddCustomBlock }: PoolProps): JSX.Element {
  const { setNodeRef, isOver } = useDroppable({
    id: "pool",
    data: { kind: "pool" },
  });

  const poolEntries = getPoolEntries(subject);
  const byTopic = new Map<string, { topic: Topic; entries: typeof poolEntries }>();
  for (const e of poolEntries) {
    const existing = byTopic.get(e.topic.code);
    if (existing) {
      existing.entries.push(e);
    } else {
      byTopic.set(e.topic.code, { topic: e.topic, entries: [e] });
    }
  }

  const customBlocks = subject.customBlocks;
  const totalUnplaced = poolEntries.reduce((s, e) => s + e.unplacedLessons, 0);

  return (
    <aside
      ref={setNodeRef}
      className={
        "w-64 shrink-0 border-r border-line bg-surface overflow-y-auto transition " +
        (isOver ? "bg-surface-2" : "")
      }
    >
      <div className="px-3 py-2 border-b border-line bg-surface-2 flex items-center justify-between">
        <h2 className="font-display text-sm text-navy">
          Pool · {totalUnplaced} unplaced
        </h2>
        <button
          onClick={onAddCustomBlock}
          className="text-xs px-2 py-0.5 border border-line rounded hover:bg-surface transition"
          title="Add a custom block"
        >
          + Custom
        </button>
      </div>

      {byTopic.size === 0 && customBlocks.length === 0 ? (
        <div className="p-4 text-xs text-ink-fade italic">
          Every sub-topic is placed. Nice.
        </div>
      ) : (
        <div className="p-2 flex flex-col gap-3">
          {[...byTopic.values()].map(({ topic, entries }) => (
            <TopicSection key={topic.code} topic={topic} entries={entries} subject={subject} />
          ))}
          {customBlocks.length > 0 && (
            <div>
              <h3 className="font-display text-xs text-ink-dim px-2 py-1 sticky top-0 bg-surface">
                Custom blocks
              </h3>
              <div className="flex flex-col gap-1">
                {customBlocks.map((cb) => (
                  <PoolCustomBlock key={cb.id} block={cb} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}

interface TopicSectionProps {
  readonly topic: Topic;
  readonly entries: ReturnType<typeof getPoolEntries>;
  readonly subject: Subject;
}

function TopicSection({ topic, entries, subject }: TopicSectionProps): JSX.Element {
  const [open, setOpen] = useState(true);
  const colour = getTopicColour(subject.workingSpec, topic.code);
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-2 py-1 hover:bg-surface-2 rounded text-left"
      >
        <span
          aria-hidden
          className="inline-block w-2 h-2 rounded-full"
          style={{ backgroundColor: colour }}
        />
        <span className="font-mono text-[10px] tracking-wider text-ink-fade">
          {topic.code}
        </span>
        <span className="text-xs flex-1 truncate" title={topic.name}>
          {topic.name}
        </span>
        <span className="text-[10px] text-ink-fade">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="flex flex-col gap-1 pl-2 mt-0.5">
          {entries.map((e) => (
            <PoolSubTopic
              key={e.subTopic.code}
              code={e.subTopic.code}
              name={e.subTopic.name}
              lessons={e.unplacedLessons}
              colour={colour}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface PoolSubTopicProps {
  readonly code: string;
  readonly name: string;
  readonly lessons: number;
  readonly colour: string;
}

function PoolSubTopic({ code, name, lessons, colour }: PoolSubTopicProps): JSX.Element {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `pool:${code}`,
    data: {
      kind: "pool",
      source: { kind: "sub-topic" as const, subTopicCode: code },
      lessons,
    },
  });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} className="touch-none">
      <Block
        code={code}
        name={name}
        lessons={lessons}
        colour={colour}
        variant="pool"
        dragging={isDragging}
      />
    </div>
  );
}

interface PoolCustomBlockProps {
  readonly block: CustomBlock;
}

function PoolCustomBlock({ block }: PoolCustomBlockProps): JSX.Element {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `pool:custom:${block.id}`,
    data: {
      kind: "pool",
      source: { kind: "custom" as const, customBlockId: block.id },
      lessons: block.lessons,
    },
  });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} className="touch-none">
      <Block
        code="CB"
        name={block.name}
        lessons={block.lessons}
        colour={block.colour ?? "#8A8478"}
        variant="custom"
        dragging={isDragging}
      />
    </div>
  );
}
