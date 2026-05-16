import { useState } from "react";

import type { CustomBlock } from "@/model/types";

export interface CustomBlockModalProps {
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

export function CustomBlockModal({ onCancel, onCreate }: CustomBlockModalProps): JSX.Element {
  const [name, setName] = useState("");
  const [lessons, setLessons] = useState(1);
  const [colour, setColour] = useState<string>(PALETTE[0]!);

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
    onCreate({
      id: makeId(),
      name: trimmed,
      lessons,
      colour,
      isEoHT: false,
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40"
      onClick={onCancel}
    >
      <div
        className="bg-bg rounded-card border border-line w-[400px] max-w-[90vw] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-3 border-b border-line">
          <h2 className="font-display text-lg text-navy">New custom block</h2>
        </header>

        <div className="px-5 py-4 space-y-4">
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
              placeholder="e.g. Mid-year revision"
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

function makeId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `cb-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  }
}
