import type { ViewType } from "@/model/types";

const VIEWS: readonly { id: ViewType; label: string }[] = [
  { id: "topic", label: "Topic" },
  { id: "sub-topic", label: "Sub-topic" },
  { id: "lesson", label: "Lesson" },
  { id: "objective", label: "Objective" },
];

export interface ViewSelectorProps {
  readonly value: ViewType;
  readonly onChange: (view: ViewType) => void;
}

export function ViewSelector({ value, onChange }: ViewSelectorProps): JSX.Element {
  return (
    <div
      role="tablist"
      aria-label="View"
      className="inline-flex rounded border border-line bg-surface overflow-hidden"
    >
      {VIEWS.map((view) => {
        const active = view.id === value;
        return (
          <button
            key={view.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(view.id)}
            className={
              "px-3 py-1.5 text-sm transition border-l border-line first:border-l-0 " +
              (active
                ? "bg-navy text-bg"
                : "text-ink hover:bg-surface-2")
            }
          >
            {view.label}
          </button>
        );
      })}
    </div>
  );
}
