import { useEffect, useState } from "react";

import exampleUrl from "../../examples/example_physics_spec.xlsx?url";
import { importSpec } from "@/model/import";
import { createDefaultTimeline, createEoHTBlocks } from "@/model/timeline";
import { serializeWorkspace } from "@/model/workspace";
import {
  AUTOSAVE_KEY,
  useWorkspaceStore,
} from "@/store/useWorkspaceStore";

export function DebugPanel(): JSX.Element {
  const workspace = useWorkspaceStore((s) => s.workspace);
  const dirty = useWorkspaceStore((s) => s.dirty);
  const addSubject = useWorkspaceStore((s) => s.addSubject);
  const clearWorkspace = useWorkspaceStore((s) => s.clearWorkspace);
  const markClean = useWorkspaceStore((s) => s.markClean);

  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    if (!status) return;
    const t = setTimeout(() => setStatus(""), 4000);
    return () => clearTimeout(t);
  }, [status]);

  async function importExample(): Promise<void> {
    setStatus("Importing example…");
    try {
      const response = await fetch(exampleUrl);
      const buf = await response.arrayBuffer();
      const result = importSpec(buf, {
        sourceFilename: "example_physics_spec.xlsx",
        subjectName: "GCSE Physics 1PH0",
      });
      if (!result.ok) {
        const errMsg = result.errors
          .map((e) => `${e.code}: ${e.message}`)
          .join("\n");
        setStatus(`Import failed:\n${errMsg}`);
        return;
      }
      const timeline = createEoHTBlocks(createDefaultTimeline());
      addSubject({ ...result.subject, timeline });
      const warnText = result.warnings.length
        ? ` (${result.warnings.length} warning${result.warnings.length === 1 ? "" : "s"})`
        : "";
      setStatus(`Imported "${result.subject.meta.name}"${warnText}.`);
    } catch (e) {
      setStatus(`Import threw: ${(e as Error).message}`);
    }
  }

  function forceSave(): void {
    try {
      const ws = useWorkspaceStore.getState().workspace;
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(ws));
      markClean();
      setStatus(`Saved ${ws.subjects.length} subject(s) to localStorage.`);
    } catch (e) {
      setStatus(`Save failed: ${(e as Error).message}`);
    }
  }

  function copyJson(): void {
    const json = serializeWorkspace(workspace, { now: new Date() });
    void navigator.clipboard.writeText(json).then(
      () => setStatus("Workspace JSON copied to clipboard."),
      (err) => setStatus(`Copy failed: ${err.message}`)
    );
  }

  function clearAll(): void {
    if (!confirm("Clear the workspace and localStorage autosave?")) return;
    clearWorkspace();
    try {
      localStorage.removeItem(AUTOSAVE_KEY);
    } catch {
      /* ignore */
    }
    setStatus("Cleared.");
  }

  const subjectsSummary = workspace.subjects.map((s) => {
    const placed = s.timeline.halfTerms.reduce(
      (acc, ht) => acc + ht.placedBlocks.length,
      0
    );
    const topics = s.workingSpec.topics.length;
    return { id: s.id, name: s.meta.name, topics, placed };
  });

  return (
    <div className="min-h-screen bg-bg text-ink p-8 font-mono text-sm overflow-auto">
      <header className="mb-6">
        <h1 className="font-display text-2xl text-navy mb-1">
          Curriculum Planner — Debug
        </h1>
        <p className="text-ink-dim">
          Pre-UI. This panel exists to drive the store and verify autosave.{" "}
          {dirty && (
            <span className="text-warn font-semibold">● Unsaved changes</span>
          )}
        </p>
      </header>

      <section className="mb-6 flex gap-2 flex-wrap">
        <button
          onClick={importExample}
          className="px-3 py-2 bg-navy text-bg rounded hover:bg-navy-dim transition"
        >
          Import example file
        </button>
        <button
          onClick={forceSave}
          className="px-3 py-2 border border-line rounded hover:bg-surface-2 transition"
        >
          Force save (localStorage)
        </button>
        <button
          onClick={copyJson}
          className="px-3 py-2 border border-line rounded hover:bg-surface-2 transition"
        >
          Copy workspace JSON
        </button>
        <button
          onClick={clearAll}
          className="px-3 py-2 border border-warn text-warn rounded hover:bg-warn/10 transition"
        >
          Clear workspace
        </button>
      </section>

      {status && (
        <pre className="mb-6 p-3 bg-surface-2 border border-line rounded whitespace-pre-wrap text-xs">
          {status}
        </pre>
      )}

      <section className="mb-6">
        <h2 className="font-display text-base text-navy mb-2">Workspace summary</h2>
        <table className="text-xs border border-line">
          <thead className="bg-surface-2">
            <tr>
              <th className="border-b border-line px-3 py-1 text-left">id</th>
              <th className="border-b border-line px-3 py-1 text-left">name</th>
              <th className="border-b border-line px-3 py-1 text-right">topics</th>
              <th className="border-b border-line px-3 py-1 text-right">placed blocks</th>
            </tr>
          </thead>
          <tbody>
            {subjectsSummary.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-2 text-ink-fade italic">
                  (no subjects — import the example file to start)
                </td>
              </tr>
            ) : (
              subjectsSummary.map((s) => (
                <tr key={s.id}>
                  <td className="border-b border-line px-3 py-1">{s.id}</td>
                  <td className="border-b border-line px-3 py-1">{s.name}</td>
                  <td className="border-b border-line px-3 py-1 text-right">
                    {s.topics}
                  </td>
                  <td className="border-b border-line px-3 py-1 text-right">
                    {s.placed}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="font-display text-base text-navy mb-2">
          Raw workspace JSON ({Math.round(JSON.stringify(workspace).length / 1024)} KB)
        </h2>
        <pre className="p-3 bg-surface-2 border border-line rounded text-xs overflow-auto max-h-96">
          {JSON.stringify(workspace, null, 2)}
        </pre>
      </section>
    </div>
  );
}
