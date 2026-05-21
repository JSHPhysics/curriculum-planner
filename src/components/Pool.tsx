import { useDraggable, useDroppable } from "@dnd-kit/core";
import { useState } from "react";

import { getPoolEntries, getTopicColour } from "@/model/queries";
import type { CustomBlock, Subject, Topic } from "@/model/types";

import { Block } from "./Block";

export interface PoolProps {
  readonly subject: Subject;
  readonly onAddCustomBlock: () => void;
  readonly onEditTopic: (topicCode: string) => void;
  readonly onEditSubTopic: (subTopicCode: string) => void;
  /** DEC-052: right-click on a sub-topic block in the pool opens a menu. */
  readonly onContextSubTopic?: (
    subTopicCode: string,
    coords: { readonly x: number; readonly y: number }
  ) => void;
}

export function Pool({
  subject,
  onAddCustomBlock,
  onEditTopic,
  onEditSubTopic,
  onContextSubTopic,
}: PoolProps): JSX.Element {
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
            <TopicSection
              key={topic.code}
              topic={topic}
              entries={entries}
              subject={subject}
              onEditTopic={onEditTopic}
              onEditSubTopic={onEditSubTopic}
              {...(onContextSubTopic ? { onContextSubTopic } : {})}
            />
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
  readonly onEditTopic: (topicCode: string) => void;
  readonly onEditSubTopic: (subTopicCode: string) => void;
  readonly onContextSubTopic?: (
    subTopicCode: string,
    coords: { readonly x: number; readonly y: number }
  ) => void;
}

function TopicSection({
  topic,
  entries,
  subject,
  onEditTopic,
  onEditSubTopic,
  onContextSubTopic,
}: TopicSectionProps): JSX.Element {
  const [open, setOpen] = useState(true);
  const colour = getTopicColour(subject.workingSpec, topic.code);
  return (
    <div>
      <div className="w-full flex items-center gap-2 px-2 py-1 rounded hover:bg-surface-2">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex-1 flex items-center gap-2 text-left min-w-0"
        >
          <span
            aria-hidden
            className="inline-block w-2 h-2 rounded-full shrink-0"
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
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEditTopic(topic.code);
          }}
          aria-label={`Edit topic ${topic.name}`}
          title="Edit topic"
          className="text-[11px] text-ink-fade hover:text-ink px-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy"
        >
          ✎
        </button>
      </div>
      {open && (
        <div className="flex flex-col gap-1 pl-2 mt-0.5">
          {entries.map((e) => (
            <PoolSubTopic
              key={e.subTopic.code}
              code={e.subTopic.code}
              name={e.subTopic.name}
              lessons={e.unplacedLessons}
              colour={colour}
              onEdit={() => onEditSubTopic(e.subTopic.code)}
              {...(onContextSubTopic
                ? {
                    onContextMenu: (coords: { readonly x: number; readonly y: number }) =>
                      onContextSubTopic(e.subTopic.code, coords),
                  }
                : {})}
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
  readonly onEdit: () => void;
  readonly onContextMenu?: (coords: { readonly x: number; readonly y: number }) => void;
}

function PoolSubTopic({
  code,
  name,
  lessons,
  colour,
  onEdit,
  onContextMenu,
}: PoolSubTopicProps): JSX.Element {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `pool:${code}`,
    data: {
      kind: "pool",
      source: { kind: "sub-topic" as const, subTopicCode: code },
      lessons,
    },
  });
  return (
    <div
      className="relative group"
      onContextMenu={(e) => {
        if (!onContextMenu) return;
        e.preventDefault();
        onContextMenu({ x: e.clientX, y: e.clientY });
      }}
    >
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
      {/* DEC-047 + DEC-050: pencil button sits on top of the draggable block.
          stopPropagation prevents the click from initiating a drag. Always
          visible (not hover-gated) for discoverability — the user kept
          missing it. */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onEdit();
        }}
        onPointerDown={(e) => e.stopPropagation()}
        aria-label={`Edit sub-topic ${code}`}
        title="Edit sub-topic (name, code, difficulty, …)"
        className="absolute top-1 right-1 text-[11px] leading-none text-ink-dim hover:text-ink hover:bg-surface px-1 py-0.5 rounded bg-bg/90 border border-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy"
      >
        ✎
      </button>
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
