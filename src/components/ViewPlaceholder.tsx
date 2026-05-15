import { useState } from "react";

import { importSpec } from "@/model/import";
import { createDefaultTimeline, createEoHTBlocks } from "@/model/timeline";
import { useWorkspaceStore } from "@/store/useWorkspaceStore";
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
    return <EmptyWorkspace />;
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

function EmptyWorkspace(): JSX.Element {
  const addSubject = useWorkspaceStore((s) => s.addSubject);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadExample(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const url = new URL("./example_physics_spec.xlsx", document.baseURI).toString();
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);
      const buf = await response.arrayBuffer();
      const result = importSpec(buf, {
        sourceFilename: "example_physics_spec.xlsx",
        subjectName: "GCSE Physics 1PH0 (example)",
      });
      if (!result.ok) {
        throw new Error(
          result.errors.map((e) => `${e.code}: ${e.message}`).join("\n")
        );
      }
      const timeline = createEoHTBlocks(createDefaultTimeline());
      addSubject({ ...result.subject, timeline });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const inElectron = typeof window !== "undefined" && typeof window.api !== "undefined";

  return (
    <div className="flex-1 flex items-center justify-center text-center px-8">
      <div className="max-w-md">
        <h2 className="font-display text-2xl text-navy mb-2">No subject loaded</h2>
        <p className="text-ink-dim text-sm mb-6">
          Load the bundled example to try the prototype, or import your own spec.
        </p>
        <div className="flex flex-col items-center gap-3">
          <button
            onClick={() => void loadExample()}
            disabled={busy}
            className="px-4 py-2 bg-navy text-bg rounded-card hover:bg-navy-dim transition disabled:opacity-50"
          >
            {busy ? "Loading…" : "Load example file"}
          </button>
          {!inElectron && (
            <p className="text-[11px] text-ink-fade max-w-xs">
              Running in a browser — file dialogs, Save, Open, and Export are disabled.
              The Electron build exposes those via the OS.
            </p>
          )}
          {error && (
            <pre className="text-xs text-warn bg-warn/10 border border-warn/30 rounded p-2 whitespace-pre-wrap max-w-md text-left">
              {error}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
