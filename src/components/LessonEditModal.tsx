import { useEffect, useState } from "react";

import { findTopicAndSubTopic, getTopicColour } from "@/model/queries";
import type { Objective, Subject } from "@/model/types";

export interface LessonEditModalProps {
  readonly subject: Subject;
  readonly subTopicCode: string;
  readonly lessonId: string;
  readonly onClose: () => void;
  readonly onSave: (patch: {
    title: string;
    practical: string | null;
    isDepth: boolean;
    separateOnly: boolean;
    objectives: readonly Objective[];
  }) => void;
}

export function LessonEditModal({
  subject,
  subTopicCode,
  lessonId,
  onClose,
  onSave,
}: LessonEditModalProps): JSX.Element | null {
  const found = findTopicAndSubTopic(subject.workingSpec, subTopicCode);
  const lesson = found?.subTopic.lessons.find((l) => l.id === lessonId) ?? null;

  const [title, setTitle] = useState(lesson?.title ?? "");
  const [practical, setPractical] = useState<string>(lesson?.practical ?? "");
  const [isDepth, setIsDepth] = useState(lesson?.isDepth ?? false);
  const [separateOnly, setSeparateOnly] = useState(lesson?.separateOnly ?? false);
  const [objectives, setObjectives] = useState<readonly Objective[]>(
    lesson?.objectives ?? []
  );

  useEffect(() => {
    if (!lesson) return;
    setTitle(lesson.title);
    setPractical(lesson.practical ?? "");
    setIsDepth(lesson.isDepth);
    setSeparateOnly(lesson.separateOnly);
    setObjectives(lesson.objectives);
  }, [lesson?.id]);

  if (!found || !lesson) return null;
  const safeLesson = lesson;
  const colour = getTopicColour(subject.workingSpec, found.topic.code);

  function moveObjective(idx: number, dir: -1 | 1): void {
    const next = [...objectives];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    const item = next[idx]!;
    next[idx] = next[target]!;
    next[target] = item;
    setObjectives(next);
  }

  function setObjectiveText(idx: number, text: string): void {
    setObjectives(objectives.map((o, i) => (i === idx ? { ...o, text } : o)));
  }

  function toggleObjectiveDepth(idx: number): void {
    setObjectives(
      objectives.map((o, i) => (i === idx ? { ...o, isDepth: !o.isDepth } : o))
    );
  }

  function deleteObjective(idx: number): void {
    setObjectives(objectives.filter((_, i) => i !== idx));
  }

  function addObjective(): void {
    setObjectives([
      ...objectives,
      { id: makeId(), text: "", isDepth: false },
    ]);
  }

  function save(): void {
    onSave({
      title: title.trim() || safeLesson.title,
      practical: practical.trim() ? practical.trim() : null,
      isDepth,
      separateOnly,
      objectives: objectives.filter((o) => o.text.trim()),
    });
    onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-bg rounded-card border border-line w-[560px] max-w-full max-h-full overflow-hidden flex flex-col shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-3 border-b border-line">
          <div className="flex items-baseline gap-2">
            <span
              aria-hidden
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: colour }}
            />
            <span className="font-mono text-[11px] text-ink-fade uppercase tracking-wider">
              {found.subTopic.code} · L{lesson.number}
            </span>
            <h2 className="font-display text-lg text-ink flex-1 truncate">
              Edit lesson
            </h2>
          </div>
          <p className="text-[11px] text-ink-fade mt-1">
            Editing lesson "{safeLesson.title}" — changes modify the working spec and reflect in every view.
          </p>
        </header>

        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          <div>
            <label className="block text-xs text-ink-dim mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-2 py-1 border border-line rounded text-sm"
            />
          </div>

          <div>
            <label className="block text-xs text-ink-dim mb-1">Practical</label>
            <input
              type="text"
              value={practical}
              placeholder="e.g. CP3 Waves investigation"
              onChange={(e) => setPractical(e.target.value)}
              className="w-full px-2 py-1 border border-line rounded text-sm"
            />
          </div>

          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={isDepth}
                onChange={(e) => setIsDepth(e.target.checked)}
                className="accent-gold"
              />
              Depth (★)
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={separateOnly}
                onChange={(e) => setSeparateOnly(e.target.checked)}
                className="accent-navy"
              />
              Separate science only
            </label>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-ink-dim">
                Objectives ({objectives.length})
              </label>
            </div>
            <div className="flex flex-col gap-1">
              {objectives.map((o, idx) => (
                <div key={o.id} className="flex items-center gap-1.5">
                  <div className="flex flex-col gap-0">
                    <button
                      onClick={() => moveObjective(idx, -1)}
                      disabled={idx === 0}
                      title="Move up"
                      aria-label="Move objective up"
                      className="text-[10px] leading-none px-1 text-ink-fade hover:text-ink disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-navy"
                    >
                      ▴
                    </button>
                    <button
                      onClick={() => moveObjective(idx, 1)}
                      disabled={idx === objectives.length - 1}
                      title="Move down"
                      aria-label="Move objective down"
                      className="text-[10px] leading-none px-1 text-ink-fade hover:text-ink disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-navy"
                    >
                      ▾
                    </button>
                  </div>
                  <input
                    type="text"
                    value={o.text}
                    onChange={(e) => setObjectiveText(idx, e.target.value)}
                    placeholder="Objective text…"
                    className="flex-1 px-2 py-1 border border-line rounded text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy"
                  />
                  <button
                    onClick={() => toggleObjectiveDepth(idx)}
                    title={o.isDepth ? "Depth-marked (click to unmark)" : "Mark as depth"}
                    aria-label={o.isDepth ? "Unmark as depth" : "Mark as depth"}
                    aria-pressed={o.isDepth}
                    className={
                      "text-base px-1.5 leading-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold rounded " +
                      (o.isDepth ? "text-gold" : "text-ink-fade hover:text-gold")
                    }
                  >
                    ★
                  </button>
                  <button
                    onClick={() => deleteObjective(idx)}
                    title="Remove this objective"
                    aria-label="Remove objective"
                    className="flex items-center gap-1 text-[11px] px-2 py-1 border border-line text-ink-dim rounded hover:border-warn hover:text-warn hover:bg-warn/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warn"
                  >
                    <span aria-hidden className="text-sm leading-none">×</span>
                    Remove
                  </button>
                </div>
              ))}
              {objectives.length === 0 && (
                <p className="text-[11px] text-ink-fade italic px-1 py-2">
                  No objectives yet. Use the button below to add one.
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={addObjective}
              className="mt-2 w-full px-3 py-2 text-sm text-navy border border-dashed border-line-2 rounded hover:border-navy hover:bg-navy/5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy"
            >
              + Add objective
            </button>
          </div>
        </div>

        <footer className="px-5 py-3 border-t border-line flex items-center gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm border border-line rounded hover:bg-surface-2"
          >
            Cancel
          </button>
          <button
            onClick={save}
            className="px-3 py-1.5 text-sm bg-navy text-bg rounded hover:bg-navy-dim"
          >
            Save
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
    return `obj-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  }
}
