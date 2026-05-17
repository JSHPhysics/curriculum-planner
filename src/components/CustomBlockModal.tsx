import { useState } from "react";

import type {
  CustomBlock,
  CustomBlockCategory,
  Subject,
} from "@/model/types";

import { RevisitsPicker } from "./RevisitsPicker";

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

// DEC-044: fixed category set (with per-block free-text `label` for nuance).
// Order matches the picker presentation; defaults to "other" for the
// "miscellaneous block" case (replaces v1.x kind="standard").
interface CategoryDescriptor {
  readonly id: CustomBlockCategory;
  readonly name: string;
  readonly icon: string;
  readonly description: string;
}

const CATEGORIES: readonly CategoryDescriptor[] = [
  { id: "test", name: "Test", icon: "TST", description: "Formative test, mid-topic check, end-of-HT quiz" },
  { id: "lesson", name: "Lesson", icon: "LSN", description: "Bespoke lesson outside the imported spec" },
  { id: "unit", name: "Unit", icon: "UNT", description: "Multi-lesson teacher-defined unit" },
  { id: "assessment", name: "Assessment", icon: "ASM", description: "Summative assessment (mock, exam, NEA)" },
  { id: "retrieval", name: "Retrieval", icon: "↺", description: "Revisits earlier sub-topics for spaced practice" },
  { id: "other", name: "Other", icon: "CB", description: "Trip, INSET cover, anything that doesn't fit" },
];

export function CustomBlockModal({ subject, onCancel, onCreate }: CustomBlockModalProps): JSX.Element {
  const [category, setCategory] = useState<CustomBlockCategory>("other");
  const [name, setName] = useState("");
  const [label, setLabel] = useState("");
  const [lessons, setLessons] = useState(1);
  const [colour, setColour] = useState<string>(PALETTE[0]!);
  const [revisits, setRevisits] = useState<readonly string[]>([]);

  function handleCreate(): void {
    const trimmedName = name.trim();
    const trimmedLabel = label.trim();
    if (!trimmedName) {
      alert("Custom block needs a name.");
      return;
    }
    if (lessons < 1) {
      alert("Custom block must claim at least 1 lesson.");
      return;
    }
    const block: CustomBlock = {
      id: makeId(),
      name: trimmedName,
      lessons,
      colour,
      isEoHT: false,
      category,
      ...(trimmedLabel ? { label: trimmedLabel } : {}),
      ...(category === "retrieval" ? { revisits } : {}),
    };
    onCreate(block);
  }

  function toggleRevisit(code: string): void {
    setRevisits((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  }

  const headlineByCategory: Record<CustomBlockCategory, string> = {
    test: "New test block",
    lesson: "New lesson block",
    unit: "New unit block",
    assessment: "New assessment block",
    retrieval: "New retrieval block",
    other: "New custom block",
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40"
      onClick={onCancel}
    >
      <div
        className="bg-bg rounded-card border border-line w-[520px] max-w-[92vw] max-h-[92vh] overflow-hidden flex flex-col shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-3 border-b border-line">
          <h2 className="font-display text-lg text-navy">
            {headlineByCategory[category]}
          </h2>
          <p className="text-[11px] text-ink-fade mt-1">
            {category === "retrieval"
              ? "Marks a half-term slot for revisiting earlier content. Pick which sub-topics it covers."
              : "Pick the block type that best fits — every custom block lives in the same place but each category gets its own visual cue."}
          </p>
        </header>

        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          <CategoryPicker category={category} onChange={setCategory} />

          <div>
            <label htmlFor="custom-block-name" className="block text-xs text-ink-dim mb-1">
              Name <span className="text-ink-fade">(headline)</span>
            </label>
            <input
              id="custom-block-name"
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={
                category === "retrieval"
                  ? "e.g. Recall: Forces & Motion"
                  : category === "test"
                  ? "e.g. End of Aut 1 test"
                  : category === "assessment"
                  ? "e.g. Y10 mock"
                  : "e.g. Trip to Science Museum"
              }
              className="w-full px-2 py-1 border border-line rounded text-sm"
            />
          </div>

          <div>
            <label htmlFor="custom-block-label" className="block text-xs text-ink-dim mb-1">
              Label <span className="text-ink-fade">(optional; secondary descriptor)</span>
            </label>
            <input
              id="custom-block-label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. practical, peer-marked, calculator"
              className="w-full px-2 py-1 border border-line rounded text-sm"
            />
            <p className="text-[10px] text-ink-fade mt-1">
              Sits alongside the headline name and shows in tooltips / chips.
            </p>
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

          {category === "retrieval" && (
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

interface CategoryPickerProps {
  readonly category: CustomBlockCategory;
  readonly onChange: (next: CustomBlockCategory) => void;
}

function CategoryPicker({ category, onChange }: CategoryPickerProps): JSX.Element {
  return (
    <div>
      <div className="block text-xs text-ink-dim mb-1.5">Category</div>
      <div role="radiogroup" className="grid grid-cols-3 gap-1.5">
        {CATEGORIES.map((c) => {
          const active = category === c.id;
          return (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={`${c.name} — ${c.description}`}
              onClick={() => onChange(c.id)}
              title={c.description}
              className={
                "flex items-center gap-2 px-2.5 py-2 border rounded text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:ring-inset " +
                (active
                  ? "border-navy bg-navy/5"
                  : "border-line hover:bg-surface-2")
              }
            >
              <span
                className={
                  "font-mono text-[10px] tracking-wider px-1 py-0.5 rounded " +
                  (active ? "bg-navy text-bg" : "bg-surface-2 text-ink-fade")
                }
              >
                {c.icon}
              </span>
              <span className="text-xs text-ink">{c.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function makeId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `cb-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  }
}
