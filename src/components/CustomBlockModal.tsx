import { useState } from "react";

import type { CustomBlock, CustomBlockKind, Subject, Topic } from "@/model/types";

export interface CustomBlockModalProps {
  readonly subject: Subject | null;
  readonly onCancel: () => void;
  readonly onCreate: (block: CustomBlock) => void;
}

const PALETTE: readonly string[] = [
  "#1F3A5F",
  "#B98D2C",
  "#6FA068",
  "#B85C5C",
  "#7E5A8C",
  "#3F7494",
];

export function CustomBlockModal({ subject, onCancel, onCreate }: CustomBlockModalProps): JSX.Element {
  const [kind, setKind] = useState<CustomBlockKind>("standard");
  const [name, setName] = useState("");
  const [lessons, setLessons] = useState(1);
  const [colour, setColour] = useState<string>(PALETTE[0]!);
  const [revisits, setRevisits] = useState<readonly string[]>([]);

  function handleCreate(): void {
    const trimmed = name.trim();
    if (!trimmed) {
      alert("Custom block needs a name.");
      return;
    }
    if (lessons < 1) {
      alert("Custom block must claim at least 1 lesson.");
      return;
    }
    const block: CustomBlock = {
      id: makeId(),
      name: trimmed,
      lessons,
      colour,
      isEoHT: false,
      ...(kind === "retrieval" ? { kind, revisits } : {}),
    };
    onCreate(block);
  }

  function toggleRevisit(code: string): void {
    setRevisits((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40"
      onClick={onCancel}
    >
      <div
        className="bg-bg rounded-card border border-line w-[460px] max-w-[90vw] max-h-[90vh] overflow-hidden flex flex-col shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-3 border-b border-line">
          <h2 className="font-display text-lg text-navy">
            {kind === "retrieval" ? "New retrieval block" : "New custom block"}
          </h2>
          <p className="text-[11px] text-ink-fade mt-1">
            {kind === "retrieval"
              ? "Marks a half-term slot for revisiting earlier content. Pick which sub-topics it covers."
              : "Trips, mocks, retrieval weeks, or anything else outside the spec content."}
          </p>
        </header>

        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          <KindToggle kind={kind} onChange={setKind} />

          <div>
            <label htmlFor="custom-block-name" className="block text-xs text-ink-dim mb-1">
              Name
            </label>
            <input
              id="custom-block-name"
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={kind === "retrieval" ? "e.g. Recall: Forces & Motion" : "e.g. Mid-year revision"}
              className="w-full px-2 py-1 border border-line rounded text-sm"
            />
          </div>

          <div>
            <label htmlFor="custom-block-lessons" className="block text-xs text-ink-dim mb-1">
              Lessons
            </label>
            <input
              id="custom-block-lessons"
              type="number"
              min={1}
              max={50}
              value={lessons}
              onChange={(e) => setLessons(Math.max(1, Number(e.target.value) || 1))}
              className="w-24 px-2 py-1 border border-line rounded font-mono text-sm"
            />
          </div>

          <div>
            <label className="block text-xs text-ink-dim mb-1">Colour</label>
            <div className="flex gap-2">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColour(c)}
                  aria-label={`Choose colour ${c}`}
                  className={
                    "w-7 h-7 rounded-full border-2 transition " +
                    (colour === c ? "border-ink" : "border-transparent hover:border-line-2")
                  }
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {kind === "retrieval" && (
            <RevisitsPicker
              subject={subject}
              selected={revisits}
              onToggle={toggleRevisit}
            />
          )}
        </div>

        <footer className="px-5 py-3 border-t border-line flex items-center gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-sm border border-line rounded hover:bg-surface-2"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            className="px-3 py-1.5 text-sm bg-navy text-bg rounded hover:bg-navy-dim"
          >
            Create
          </button>
        </footer>
      </div>
    </div>
  );
}

interface KindToggleProps {
  readonly kind: CustomBlockKind;
  readonly onChange: (next: CustomBlockKind) => void;
}

function KindToggle({ kind, onChange }: KindToggleProps): JSX.Element {
  return (
    <div>
      <div className="block text-xs text-ink-dim mb-1">Block type</div>
      <div role="radiogroup" className="inline-flex border border-line rounded overflow-hidden">
        <KindOption
          value="standard"
          label="Standard"
          description="Generic non-spec block (e.g. trip, mock)"
          active={kind === "standard"}
          onSelect={() => onChange("standard")}
        />
        <KindOption
          value="retrieval"
          label="↺ Retrieval"
          description="Revisits earlier sub-topics"
          active={kind === "retrieval"}
          onSelect={() => onChange("retrieval")}
        />
      </div>
    </div>
  );
}

interface KindOptionProps {
  readonly value: CustomBlockKind;
  readonly label: string;
  readonly description: string;
  readonly active: boolean;
  readonly onSelect: () => void;
}

function KindOption({ value, label, description, active, onSelect }: KindOptionProps): JSX.Element {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      aria-label={`${label} — ${description}`}
      onClick={onSelect}
      title={description}
      className={
        "px-3 py-1.5 text-sm transition border-l border-line first:border-l-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:ring-inset " +
        (active ? "bg-navy text-bg" : "text-ink hover:bg-surface-2")
      }
      data-value={value}
    >
      {label}
    </button>
  );
}

interface RevisitsPickerProps {
  readonly subject: Subject | null;
  readonly selected: readonly string[];
  readonly onToggle: (code: string) => void;
}

function RevisitsPicker({ subject, selected, onToggle }: RevisitsPickerProps): JSX.Element {
  if (!subject) {
    return (
      <p className="text-[11px] text-ink-fade italic">
        No subject loaded — can't pick sub-topics to revisit.
      </p>
    );
  }

  // Highlight already-placed sub-topics, since only those are meaningful to revisit.
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

function makeId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `cb-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  }
}
