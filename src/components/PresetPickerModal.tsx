import { useMemo, useState } from "react";

import {
  isExampleSubject,
  parseSavedPresetJson,
  PRESET_DESCRIPTORS,
  summarisePreset,
  type PresetId,
} from "@/model/presets";
import type { SavedPreset, Subject } from "@/model/types";

export interface PresetPickerModalProps {
  readonly subject: Subject;
  readonly onCancel: () => void;
  /** Apply a built-in algorithmic preset. */
  readonly onApplyAlgorithmic: (presetId: PresetId) => void;
  /** Apply a user-authored saved preset by id. */
  readonly onApplySaved: (presetId: string) => void;
  /** Save the subject's current layout as a new preset under this name. */
  readonly onSaveCurrent: (name: string, description?: string) => void;
  /** Delete a saved preset by id. */
  readonly onDeleteSaved: (presetId: string) => void;
  /** Append a paste-imported preset to the subject. */
  readonly onAddPreset: (preset: SavedPreset) => void;
}

/**
 * Layout-preset picker (DEC-045 rework).
 *
 *   1. User-authored saved presets (always shown — empty list if none).
 *   2. "Save current layout as preset" inline form (always available).
 *   3. "Paste preset JSON" inline form (always available).
 *   4. Built-in algorithmic presets — ONLY shown for the bundled example
 *      subject (`isExampleSubject`). For any other subject the algorithms
 *      haven't been calibrated, so they'd be misleading.
 *
 * Saved presets each have their own per-item Apply button (no radio
 * selection). Algorithmic presets use radio + footer Apply.
 */
export function PresetPickerModal({
  subject,
  onCancel,
  onApplyAlgorithmic,
  onApplySaved,
  onSaveCurrent,
  onDeleteSaved,
  onAddPreset,
}: PresetPickerModalProps): JSX.Element {
  const showAlgorithmic = isExampleSubject(subject);
  const savedPresets = subject.presets ?? [];

  const [selectedAlgo, setSelectedAlgo] = useState<PresetId>(PRESET_DESCRIPTORS[0]!.id);
  const [saveOpen, setSaveOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const algoSummaries = useMemo(
    () =>
      showAlgorithmic
        ? Object.fromEntries(
            PRESET_DESCRIPTORS.map(
              (p) => [p.id, summarisePreset(subject, p.id)] as const
            )
          )
        : {},
    [subject, showAlgorithmic]
  );

  const existingPlacementCount = useMemo(() => {
    let n = 0;
    for (const ht of subject.timeline.halfTerms) {
      for (const b of ht.placedBlocks) {
        if (b.source.kind === "sub-topic") n++;
      }
    }
    return n;
  }, [subject.timeline]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="preset-picker-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={onCancel}
    >
      <div
        className="bg-bg rounded-card border border-line w-[680px] max-w-full max-h-[92vh] overflow-hidden flex flex-col shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-3 border-b border-line">
          <div className="flex items-baseline gap-2">
            <span
              aria-hidden
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: subject.meta.colour }}
            />
            <h2 id="preset-picker-title" className="font-display text-lg text-ink">
              Layout presets for "{subject.meta.name}"
            </h2>
          </div>
          <p className="text-xs text-ink-fade mt-1">
            Applying any preset wipes the subject's current sub-topic placements
            and custom blocks, then rebuilds them from the preset.
            {existingPlacementCount > 0 && (
              <span className="text-warn">
                {" "}{existingPlacementCount} existing sub-topic placement
                {existingPlacementCount === 1 ? "" : "s"} will be replaced.
              </span>
            )}
          </p>
        </header>

        <div className="px-5 py-4 space-y-5 overflow-y-auto">
          <Section title="Saved presets">
            {savedPresets.length === 0 ? (
              <p className="text-xs text-ink-fade italic">
                No saved presets yet. Use{" "}
                <span className="text-ink-dim">Save current layout</span> below to
                snapshot the plan you have now, or{" "}
                <span className="text-ink-dim">Paste preset JSON</span> to add one
                authored elsewhere (e.g. by an AI assistant). The JSON shape is
                documented in <code className="font-mono text-[11px]">docs/PRESET_FORMAT.md</code>.
              </p>
            ) : (
              <ul className="space-y-2">
                {savedPresets.map((preset) => (
                  <li
                    key={preset.id}
                    className="border border-line rounded p-3 flex items-start gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-display text-base text-ink">{preset.name}</div>
                      {preset.description && (
                        <p className="text-xs text-ink-dim mt-1 leading-relaxed">
                          {preset.description}
                        </p>
                      )}
                      <p className="text-[11px] text-ink-fade mt-1.5 font-mono">
                        {preset.placements.length} placement{preset.placements.length === 1 ? "" : "s"}
                        {" · "}
                        {preset.customBlocks.length} custom block{preset.customBlocks.length === 1 ? "" : "s"}
                        {" · "}
                        saved {formatDate(preset.createdAt)}
                      </p>
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      <button
                        onClick={() => onApplySaved(preset.id)}
                        className="px-3 py-1 text-xs bg-navy text-bg rounded hover:bg-navy-dim focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy"
                      >
                        Apply
                      </button>
                      {pendingDeleteId === preset.id ? (
                        <div className="flex gap-1">
                          <button
                            onClick={() => {
                              onDeleteSaved(preset.id);
                              setPendingDeleteId(null);
                            }}
                            className="px-2 py-1 text-[11px] bg-warn text-bg rounded hover:opacity-90"
                          >
                            Delete?
                          </button>
                          <button
                            onClick={() => setPendingDeleteId(null)}
                            className="px-2 py-1 text-[11px] border border-line rounded hover:bg-surface-2"
                          >
                            ×
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setPendingDeleteId(preset.id)}
                          className="px-3 py-1 text-xs border border-line text-ink-dim rounded hover:bg-surface-2 hover:text-ink"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <DisclosureSection
            title="Save current layout as preset"
            open={saveOpen}
            onToggle={() => setSaveOpen((v) => !v)}
          >
            <SaveCurrentForm
              onSave={(name, description) => {
                onSaveCurrent(name, description);
                setSaveOpen(false);
              }}
            />
          </DisclosureSection>

          <DisclosureSection
            title="Paste preset JSON"
            open={pasteOpen}
            onToggle={() => setPasteOpen((v) => !v)}
          >
            <PasteJsonForm
              onAdd={(preset) => {
                onAddPreset(preset);
                setPasteOpen(false);
              }}
            />
          </DisclosureSection>

          {showAlgorithmic && (
            <Section title="Built-in algorithmic presets">
              <p className="text-[11px] text-ink-fade -mt-1 mb-2">
                Calibrated against the bundled example physics scheme. Hidden on
                other subjects because the algorithm parameters haven't been
                tuned for them.
              </p>
              <div
                className="space-y-2"
                role="radiogroup"
                aria-label="Algorithmic preset choices"
              >
                {PRESET_DESCRIPTORS.map((preset) => {
                  const summary = algoSummaries[preset.id];
                  const active = selectedAlgo === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setSelectedAlgo(preset.id)}
                      className={
                        "w-full text-left p-3 rounded border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy " +
                        (active
                          ? "border-navy bg-navy/5"
                          : "border-line hover:bg-surface-2")
                      }
                    >
                      <div className="flex items-baseline gap-2">
                        <span
                          aria-hidden
                          className={
                            "inline-block w-3 h-3 rounded-full border-2 mt-1 shrink-0 " +
                            (active ? "border-navy bg-navy" : "border-line")
                          }
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <span className="font-display text-base text-ink">{preset.name}</span>
                            <span className="text-[11px] text-ink-fade italic">
                              {preset.subtitle}
                            </span>
                          </div>
                          <p className="text-xs text-ink-dim mt-1 leading-relaxed">
                            {preset.description}
                          </p>
                          {summary && (
                            <div className="mt-2 flex items-center gap-3 text-[11px] text-ink-dim flex-wrap">
                              <span className="font-mono">
                                {summary.placementCount} placement{summary.placementCount === 1 ? "" : "s"}
                              </span>
                              <span className="text-ink-fade">·</span>
                              <span className="font-mono">
                                {summary.totalLessonsPlaced} lessons total
                              </span>
                              <span className="text-ink-fade">·</span>
                              <span className="font-mono">
                                {summary.distinctSubTopics} sub-topics
                              </span>
                              {summary.skippedDepthSubTopics.length > 0 && (
                                <>
                                  <span className="text-ink-fade">·</span>
                                  <span
                                    className="text-warn"
                                    title={`Skipped because "Show depth" is off: ${summary.skippedDepthSubTopics.join(", ")}`}
                                  >
                                    {summary.skippedDepthSubTopics.length} depth skipped
                                  </span>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="flex justify-end mt-3">
                <button
                  onClick={() => onApplyAlgorithmic(selectedAlgo)}
                  className="px-3 py-1.5 text-sm bg-navy text-bg rounded hover:bg-navy-dim focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy"
                >
                  Apply {PRESET_DESCRIPTORS.find((p) => p.id === selectedAlgo)?.name}
                </button>
              </div>
            </Section>
          )}
        </div>

        <footer className="px-5 py-3 border-t border-line flex items-center gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-sm border border-line rounded hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy"
          >
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  readonly title: string;
  readonly children: React.ReactNode;
}): JSX.Element {
  return (
    <section className="space-y-2">
      <h3 className="font-display text-sm text-navy">{title}</h3>
      <div>{children}</div>
    </section>
  );
}

interface DisclosureSectionProps {
  readonly title: string;
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly children: React.ReactNode;
}

function DisclosureSection({
  title,
  open,
  onToggle,
  children,
}: DisclosureSectionProps): JSX.Element {
  return (
    <section className="border border-line rounded">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full text-left px-3 py-2 flex items-center justify-between hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy"
      >
        <span className="font-display text-sm text-ink">{title}</span>
        <span className="text-ink-fade text-xs">{open ? "▾" : "▸"}</span>
      </button>
      {open && <div className="px-3 py-3 border-t border-line space-y-2">{children}</div>}
    </section>
  );
}

function SaveCurrentForm({
  onSave,
}: {
  readonly onSave: (name: string, description?: string) => void;
}): JSX.Element {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  return (
    <div className="space-y-2">
      <div>
        <label htmlFor="preset-save-name" className="block text-xs text-ink-dim mb-1">
          Preset name
        </label>
        <input
          id="preset-save-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Y10 mocks-first interleaved"
          className="w-full px-2 py-1 border border-line rounded text-sm"
        />
      </div>
      <div>
        <label htmlFor="preset-save-desc" className="block text-xs text-ink-dim mb-1">
          Description <span className="text-ink-fade">(optional)</span>
        </label>
        <textarea
          id="preset-save-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="What's distinctive about this layout?"
          className="w-full px-2 py-1 border border-line rounded text-xs"
        />
      </div>
      <div className="flex justify-end">
        <button
          disabled={!name.trim()}
          onClick={() => onSave(name.trim(), description.trim() || undefined)}
          className="px-3 py-1.5 text-sm bg-navy text-bg rounded hover:bg-navy-dim disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy"
        >
          Save preset
        </button>
      </div>
    </div>
  );
}

function PasteJsonForm({
  onAdd,
}: {
  readonly onAdd: (preset: SavedPreset) => void;
}): JSX.Element {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  function handleAdd(): void {
    setError(null);
    try {
      const preset = parseSavedPresetJson(text);
      onAdd(preset);
      setText("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="space-y-2">
      <p className="text-[11px] text-ink-fade">
        Paste a preset JSON document. The shape is documented in{" "}
        <code className="font-mono">docs/PRESET_FORMAT.md</code>. Validation runs
        before the preset is added — you'll see a clear error if anything is off.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        placeholder='{ "name": "…", "placements": [ … ], "customBlocks": [ … ] }'
        className="w-full px-2 py-1.5 border border-line rounded font-mono text-[11px]"
      />
      {error && (
        <p className="text-xs text-warn whitespace-pre-wrap">{error}</p>
      )}
      <div className="flex justify-end">
        <button
          disabled={!text.trim()}
          onClick={handleAdd}
          className="px-3 py-1.5 text-sm bg-navy text-bg rounded hover:bg-navy-dim disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy"
        >
          Add preset
        </button>
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}
