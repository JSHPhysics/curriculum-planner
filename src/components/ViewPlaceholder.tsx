import { useState } from "react";

import { importSpec } from "@/model/import";
import { generateImportTemplate } from "@/model/importTemplate";
import { createDefaultTimeline, inferKeyStage, seedEndOfHalfTermTests } from "@/model/timeline";
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
// Every ViewType now has a real implementation; SESSIONS is only consulted
// when no subject is loaded (in which case EmptyWorkspace runs instead).

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

  const inElectron = typeof window !== "undefined" && typeof window.api !== "undefined";

  async function commitImport(
    buf: ArrayBuffer,
    sourceFilename: string,
    subjectName: string
  ): Promise<void> {
    const result = importSpec(buf, { sourceFilename, subjectName });
    if (!result.ok) {
      throw new Error(result.errors.map((e) => `${e.code}: ${e.message}`).join("\n"));
    }
    const baseTimeline = createDefaultTimeline();
    // DEC-044: default-template subjects get the auto-seeded end-of-HT test
    // custom block (the default LEHS template has no autoSeedEoHTTest flag
    // set, so the default-true semantic applies).
    const seeded = seedEndOfHalfTermTests(baseTimeline);
    const detectedKs = inferKeyStage(baseTimeline);
    const meta = detectedKs
      ? { ...result.subject.meta, keyStage: detectedKs }
      : result.subject.meta;
    addSubject({
      ...result.subject,
      meta,
      timeline: seeded.timeline,
      customBlocks: [...result.subject.customBlocks, seeded.customBlock],
    });
    if (result.warnings.length > 0) {
      console.warn(`[import] ${result.warnings.length} warnings:`, result.warnings);
    }
  }

  async function importFromFile(): Promise<void> {
    if (!inElectron) return;
    setBusy(true);
    setError(null);
    try {
      const opened = await window.api.openSpreadsheetFile();
      if (!opened) return;
      const ab = opened.buffer.buffer.slice(
        opened.buffer.byteOffset,
        opened.buffer.byteOffset + opened.buffer.byteLength
      ) as ArrayBuffer;
      const name = opened.path.split(/[\\/]/).pop() ?? "Subject";
      await commitImport(ab, name, name.replace(/\.xlsx$/i, ""));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function loadExample(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const url = new URL("./example_physics_spec.xlsx", document.baseURI).toString();
      const response = await fetch(url);
      if (!response.ok)
        throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);
      const buf = await response.arrayBuffer();
      await commitImport(buf, "example_physics_spec.xlsx", "GCSE Physics 1PH0 (example)");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function downloadTemplate(): Promise<void> {
    setError(null);
    try {
      const buf = generateImportTemplate();
      if (inElectron) {
        const result = await window.api.saveSpreadsheetFile(new Uint8Array(buf), {
          defaultName: "curriculum-planner-template.xlsx",
        });
        if (result) console.info(`[template] wrote ${result.path}`);
        return;
      }
      // Browser fallback: trigger an anchor download.
      const blob = new Blob([buf], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "curriculum-planner-template.xlsx";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="flex-1 flex items-center justify-center text-center px-8">
      <div className="max-w-md">
        <h2 className="font-display text-2xl text-navy mb-2">
          Import a specification to begin
        </h2>
        <p className="text-ink-dim text-sm mb-6">
          Pick an `.xlsx` file matching the import format, download a template to
          start from scratch, or load the bundled example to explore the prototype.
        </p>
        <div className="flex flex-col items-center gap-3">
          {inElectron && (
            <button
              onClick={() => void importFromFile()}
              disabled={busy}
              className="px-4 py-2 bg-navy text-bg rounded-card hover:bg-navy-dim transition disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy"
            >
              {busy ? "Loading…" : "Import .xlsx file"}
            </button>
          )}
          <button
            onClick={() => void downloadTemplate()}
            className="px-4 py-2 border border-line rounded-card text-ink hover:bg-surface-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy"
          >
            Download import template
          </button>
          <button
            onClick={() => void loadExample()}
            disabled={busy}
            className="px-4 py-2 text-ink-dim text-sm underline-offset-2 hover:underline disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy rounded"
          >
            {busy ? "Loading…" : "Or load the bundled example"}
          </button>
          {!inElectron && (
            <p className="text-[11px] text-ink-fade max-w-xs mt-3">
              Running in a browser — direct file import, Save, Open, and Export are
              disabled. The Electron build exposes those via the OS. Template download
              still works as a normal browser download.
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
