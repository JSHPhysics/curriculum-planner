import { useDraggable } from "@dnd-kit/core";

import { getTopicColour } from "@/model/queries";
import type { TopicBlockSummary } from "@/model/topics";
import type { Spec } from "@/model/types";

export interface TopicBlockDragPayload {
  readonly kind: "topic-in-cell";
  readonly topicCode: string;
  readonly fromTermId: string;
}

export interface TopicBlockProps {
  readonly summary: TopicBlockSummary;
  readonly halfTermId: string;
  readonly workingSpec: Spec;
}

export function TopicBlock({
  summary,
  halfTermId,
  workingSpec,
}: TopicBlockProps): JSX.Element {
  const draggableId = `topic:${halfTermId}:${summary.topicCode}`;
  const payload: TopicBlockDragPayload = {
    kind: "topic-in-cell",
    topicCode: summary.topicCode,
    fromTermId: halfTermId,
  };
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: draggableId,
    data: payload,
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={
        "touch-none flex flex-col gap-1 px-2 py-1.5 rounded-card border bg-surface " +
        "cursor-grab active:cursor-grabbing transition " +
        (isDragging ? "opacity-40 ring-2 ring-navy" : "hover:bg-surface-2 border-line")
      }
      style={{ borderLeft: `4px solid ${summary.colour}` }}
      title={`${summary.topicCode} ${summary.topicName} — ${summary.totalLessons} lessons across ${summary.subTopics.length} sub-topic${summary.subTopics.length === 1 ? "" : "s"}`}
    >
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-[10px] tracking-wider text-ink-fade uppercase">
          {summary.topicCode}
        </span>
        <span className="flex-1 text-xs leading-tight truncate text-ink">
          {summary.topicName}
        </span>
        <span className="text-[10px] text-ink-dim font-mono tabular-nums">
          {summary.totalLessons}L
        </span>
      </div>
      <BreakdownBar summary={summary} workingSpec={workingSpec} />
      <div className="text-[10px] font-mono text-ink-fade truncate">
        {summary.subTopics.map((s) => `${s.subTopicCode}·${s.lessons}`).join("  ")}
      </div>
    </div>
  );
}

interface BreakdownBarProps {
  readonly summary: TopicBlockSummary;
  readonly workingSpec: Spec;
}

function BreakdownBar({ summary, workingSpec }: BreakdownBarProps): JSX.Element {
  if (summary.totalLessons === 0) {
    return <div className="h-1.5 rounded-full bg-line-2" />;
  }
  const base = getTopicColour(workingSpec, summary.topicCode);
  return (
    <div className="flex h-1.5 rounded-full overflow-hidden bg-line-2">
      {summary.subTopics.map((st, i) => {
        const pct = (st.lessons / summary.totalLessons) * 100;
        const shade = mixWithWhite(base, i % 2 === 0 ? 0 : 0.25);
        return (
          <div
            key={st.subTopicCode}
            className="h-full"
            style={{ width: `${pct}%`, backgroundColor: shade }}
            title={`${st.subTopicCode} ${st.subTopicName} — ${st.lessons}L`}
          />
        );
      })}
    </div>
  );
}

function mixWithWhite(hex: string, amount: number): string {
  // amount = 0 → original; amount = 1 → white. Forgiving on bad input: returns hex unchanged.
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const mix = (c: number): number => Math.round(c + (255 - c) * amount);
  return (
    "#" +
    [mix(r), mix(g), mix(b)]
      .map((c) => c.toString(16).padStart(2, "0"))
      .join("")
  );
}
