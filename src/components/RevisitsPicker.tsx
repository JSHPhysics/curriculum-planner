import type { Subject, Topic } from "@/model/types";

export interface RevisitsPickerProps {
  readonly subject: Subject | null;
  readonly selected: readonly string[];
  readonly onToggle: (code: string) => void;
}

/**
 * Sub-topic multi-select used by retrieval-block authoring. Sub-topics
 * already placed in the timeline are emphasised — revisiting placed content
 * is the common case; revisiting un-yet-placed content is unusual but
 * permitted (e.g. you've decided to defer a topic but want a recall slot
 * for it anyway).
 */
export function RevisitsPicker({ subject, selected, onToggle }: RevisitsPickerProps): JSX.Element {
  if (!subject) {
    return (
      <p className="text-[11px] text-ink-fade italic">
        No subject loaded — can't pick sub-topics to revisit.
      </p>
    );
  }

  const placedCodes = new Set<string>();
  for (const ht of subject.timeline.halfTerms) {
    for (const pb of ht.placedBlocks) {
      if (pb.source.kind === "sub-topic") placedCodes.add(pb.source.subTopicCode);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs text-ink-dim">
          Revisits ({selected.length} selected)
        </label>
        <span className="text-[10px] text-ink-fade">
          Highlighted sub-topics are already placed in the calendar.
        </span>
      </div>
      <div className="max-h-48 overflow-y-auto border border-line rounded p-2 flex flex-col gap-2">
        {subject.workingSpec.topics.map((topic) => (
          <TopicRevisits
            key={topic.code}
            topic={topic}
            placedCodes={placedCodes}
            selected={selected}
            onToggle={onToggle}
          />
        ))}
      </div>
    </div>
  );
}

interface TopicRevisitsProps {
  readonly topic: Topic;
  readonly placedCodes: ReadonlySet<string>;
  readonly selected: readonly string[];
  readonly onToggle: (code: string) => void;
}

function TopicRevisits({ topic, placedCodes, selected, onToggle }: TopicRevisitsProps): JSX.Element {
  return (
    <fieldset className="flex flex-col gap-0.5">
      <legend className="font-mono text-[10px] text-ink-fade px-1 uppercase tracking-wider">
        {topic.code} · {topic.name}
      </legend>
      {topic.subTopics.map((st) => {
        const isSelected = selected.includes(st.code);
        const isPlaced = placedCodes.has(st.code);
        return (
          <label
            key={st.code}
            className={
              "flex items-center gap-2 px-2 py-1 text-[11px] rounded cursor-pointer hover:bg-surface-2 " +
              (isPlaced ? "text-ink" : "text-ink-fade")
            }
            title={isPlaced ? "Placed in the calendar" : "Not yet placed — revisiting an unplaced sub-topic is unusual"}
          >
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => onToggle(st.code)}
              className="accent-navy"
            />
            <span className="font-mono w-12">{st.code}</span>
            <span className="flex-1 truncate">{st.name}</span>
            {!isPlaced && <span className="text-[9px] text-ink-fade">(unplaced)</span>}
          </label>
        );
      })}
    </fieldset>
  );
}
