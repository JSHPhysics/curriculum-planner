import type { ViewType } from "@/model/types";

const LABELS: Record<ViewType, string> = {
  topic: "Topic view",
  "sub-topic": "Sub-topic view",
  lesson: "Lesson view",
  objective: "Objective view",
};

const SESSIONS: Record<ViewType, string> = {
  topic: "Session 11",
  "sub-topic": "Session 8",
  lesson: "Session 9",
  objective: "Session 10",
};

export interface ViewPlaceholderProps {
  readonly view: ViewType;
  readonly hasSubject: boolean;
}

export function ViewPlaceholder({ view, hasSubject }: ViewPlaceholderProps): JSX.Element {
  if (!hasSubject) {
    return (
      <div className="flex-1 flex items-center justify-center text-center">
        <div>
          <h2 className="font-display text-2xl text-navy mb-2">Import a spec to begin</h2>
          <p className="text-ink-dim text-sm max-w-md">
            Click the <span className="font-mono">+</span> button in the header to load a
            curriculum spec from an <code>.xlsx</code> file.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center text-center">
      <div>
        <h2 className="font-display text-2xl text-navy mb-1">{LABELS[view]}</h2>
        <p className="text-ink-dim text-sm">
          Implementation coming in {SESSIONS[view]}.
        </p>
      </div>
    </div>
  );
}
