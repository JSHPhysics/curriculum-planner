import { useCallback, useState } from "react";

import { generateImportTemplate } from "@/model/importTemplate";

export interface ImportGuideModalProps {
  readonly onClose: () => void;
  readonly inElectron?: boolean;
}

const AI_PROMPT = `You are helping me convert an exam-board / curriculum specification into a tabular format I can paste into Excel and import into a curriculum-planning app. I will paste the source specification below this prompt.

Produce a single TAB-separated table with EXACTLY these columns in this order:

Topic\tSub-topic\tLesson No.\tLesson Title\tObjectives\tPractical\tDifficulty\tExtra-depth\tSeparate science only?\tPaper\tNotes

Rules:
1. Each row represents one objective. Use multiple rows for a lesson when it has multiple objectives — repeat the same Topic / Sub-topic / Lesson No. / Lesson Title on each row, vary only the Objectives cell. The importer merges rows that share (Topic, Sub-topic, Lesson No.).
2. Topic = the high-level unit (e.g. "Forces and motion"). Use the EXACT same spelling for every row in the same topic — same name means same topic. Topic codes (T1, T2, …) are generated automatically in the order topics first appear.
3. Sub-topic = the teachable chunk inside a topic (e.g. "Kinematics"). Same exact-spelling rule. Codes T1a, T1b, … are auto-generated within each topic.
4. Lesson No. = integer, restarting at 1 within each sub-topic. Treat as ordinal-within-sub-topic, not a global lesson counter.
5. Lesson Title = a short concrete teaching title (4–8 words). Must be identical on every row that shares the same Lesson No. inside a sub-topic.
6. Objectives = one spec-level learning objective per row, in the source's own wording where possible (verbs like "Describe", "Explain", "Calculate", "Compare"…). One objective per row keeps the import clean.
7. Practical = a required-practical code (e.g. "CP1") if the lesson is a practical, otherwise blank.
8. Difficulty = 1 (foundation), 2 (standard), 3 (challenging). The importer treats this as a sub-topic-level property — if you vary it within a sub-topic, the max wins.
9. Extra-depth = "yes" if this lesson is a depth-extension / stretch / higher-tier-only lesson; otherwise blank.
10. Separate science only? = "yes" if the lesson is triple-only / separate-sciences-only; otherwise blank. (Leave blank for non-science subjects.)
11. Paper = exam paper reference if applicable (e.g. "Paper 1"); blank if unknown.
12. Notes = free-text notes about the sub-topic (any pedagogical context worth carrying through); usually blank.

Sequencing:
- Preserve the SOURCE ORDER. Do not reshuffle topics, sub-topics, or lessons. Row order in the output is the order they'll appear in the planner.
- Aim for 4–8 sub-topics per topic, 4–10 lessons per sub-topic. If the source naturally needs more, that's fine; just keep sub-topics teachably small.

After the table, list anything you were uncertain about (ambiguous spec wording, lessons you invented to bridge gaps, depth-flag guesses) so I can verify it against the source before importing. Never silently invent objectives — flag them.

Source specification:
[paste your spec here]
`;

export function ImportGuideModal({
  onClose,
  inElectron = false,
}: ImportGuideModalProps): JSX.Element {
  const [copied, setCopied] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);

  const copyPrompt = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(AI_PROMPT);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }, []);

  const downloadTemplate = useCallback(async () => {
    setTemplateError(null);
    try {
      const buf = generateImportTemplate();
      if (inElectron && typeof window.api !== "undefined") {
        await window.api.saveSpreadsheetFile(new Uint8Array(buf), {
          defaultName: "curriculum-planner-template.xlsx",
        });
        return;
      }
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
      setTemplateError((e as Error).message);
    }
  }, [inElectron]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-guide-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-bg rounded-card border border-line w-[780px] max-w-full max-h-[92vh] overflow-hidden flex flex-col shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-6 py-4 border-b border-line flex items-start gap-4">
          <div className="flex-1">
            <h2
              id="import-guide-title"
              className="font-display text-xl text-navy leading-tight"
            >
              Importing your spec
            </h2>
            <p className="text-xs text-ink-fade mt-1">
              How the import file is structured, what the planner will do with it,
              and a prompt you can use with an AI to draft a first version.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-ink-dim hover:text-ink text-xl leading-none px-2 -mt-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy rounded"
          >
            ×
          </button>
        </header>

        <div className="px-6 py-5 space-y-7 overflow-y-auto text-sm text-ink">
          <Section title="1. What an import file is">
            <p>
              A flat list of rows describing your scheme of work. Each row names a{" "}
              <strong>topic</strong>, a <strong>sub-topic</strong>, a{" "}
              <strong>lesson</strong> within that sub-topic, and (optionally) a learning{" "}
              <strong>objective</strong> and a few flags. The planner reads the rows
              top-to-bottom, groups them, generates topic codes, and gives you back
              an interactive plan.
            </p>
            <p>
              The importer accepts <code className="font-mono text-[12px]">.xlsx</code>{" "}
              spreadsheets, <code className="font-mono text-[12px]">.tsv</code>{" "}
              (tab-separated), and <code className="font-mono text-[12px]">.csv</code>{" "}
              (comma-separated) files. Use whichever is easiest — TSV is often the
              cleanest output from an AI assistant.
            </p>
            <p>
              The file is the source of truth at import time. After import you can
              edit anything inside the app; you can also restore back to the original
              imported spec at any time.
            </p>
          </Section>

          <Section title="2. Required columns">
            <ColumnTable
              rows={[
                {
                  name: "Topic",
                  type: "text",
                  notes: "Free-text topic name. Same exact spelling → same topic.",
                },
                {
                  name: "Sub-topic",
                  type: "text",
                  notes:
                    "Free-text sub-topic name. Same name within the same topic → same sub-topic.",
                },
                {
                  name: "Lesson No.",
                  type: "integer",
                  notes:
                    "Ordinal within the sub-topic. Restart at 1 in each sub-topic.",
                },
                {
                  name: "Lesson Title",
                  type: "text",
                  notes: "Short concrete title for the lesson.",
                },
              ]}
            />
          </Section>

          <Section title="3. Optional columns">
            <ColumnTable
              rows={[
                {
                  name: "Objectives",
                  type: "text",
                  notes:
                    "One objective per row, OR multiple objectives separated by newlines / semicolons. Multiple rows for the same lesson merge into one lesson with concatenated objectives.",
                },
                {
                  name: "Practical",
                  type: "text",
                  notes: 'Practical reference, e.g. "CP1". Blank = no practical.',
                },
                {
                  name: "Difficulty",
                  type: "1 / 2 / 3",
                  notes:
                    "Sub-topic-level difficulty (1 foundation, 3 challenging). Max wins if rows disagree. Defaults to 2.",
                },
                {
                  name: "Extra-depth",
                  type: "yes / blank",
                  notes:
                    'Marks a lesson as depth-extension. Accepted truthy values: "yes" / "y" / "1" / "✓" / "★".',
                },
                {
                  name: "Separate science only?",
                  type: "yes / blank",
                  notes:
                    "Marks a lesson as triple-only (sciences). Leave blank for non-science subjects.",
                },
                {
                  name: "Paper",
                  type: "text",
                  notes: "Optional exam-paper code at the topic level.",
                },
                {
                  name: "Notes",
                  type: "text",
                  notes: "Free-text notes on the sub-topic.",
                },
              ]}
            />
          </Section>

          <Section title="4. How rows compose into a plan">
            <ul className="list-disc pl-5 space-y-1.5 text-ink-dim">
              <li>
                <strong>Same Topic name</strong> across rows → those rows belong to the
                same topic. Topics get codes <code className="font-mono">T1</code>,{" "}
                <code className="font-mono">T2</code>, … in the order they first appear.
              </li>
              <li>
                <strong>Same (Topic, Sub-topic) pair</strong> → the same sub-topic.
                Sub-topics get codes <code className="font-mono">T1a</code>,{" "}
                <code className="font-mono">T1b</code>, … within their topic in import
                order.
              </li>
              <li>
                <strong>Multiple rows for one lesson</strong> (same Topic, Sub-topic,
                Lesson No.) → the rows merge. Objectives concatenate; Practical,
                Extra-depth, and Separate flags OR together. Lesson Title must match
                across the merged rows.
              </li>
              <li>
                <strong>Row order matters.</strong> Lessons appear in import order
                within their sub-topic; sub-topics in the order their first lesson
                appears; topics likewise. Don't reshuffle to "tidy" the file.
              </li>
              <li>
                <strong>Codes are stable IDs.</strong> Renaming a topic in the app
                does not change its code. If you re-import and a sub-topic disappears,
                its placed blocks become orphans and the app surfaces them for
                re-placement.
              </li>
            </ul>
          </Section>

          <Section title="5. What you'll see after import">
            <p>
              Beyond the four zoom-level views (Topic → Sub-topic → Lesson → Objective),
              the planner runs a small set of <em>structural</em> pedagogical checks on
              your placement. They're surfaced so you know what to expect — none of
              them are prescriptive, all of them use rules you can tune per subject.
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-ink-dim mt-2">
              <li>
                <strong>Spacing panel.</strong> Flags <em>single-touch sub-topics</em>{" "}
                (placed exactly once across the year), <em>blocked cells</em> (one
                topic dominating a half-term, by default ≥80% of a cell with ≥4
                lessons), and <em>well-spaced sub-topics</em> (3+ placements with a mean
                gap of ≥4 half-terms). The first two are warnings; the last is a
                positive flag.
              </li>
              <li>
                <strong>Retrieval suggestions.</strong> Right-click a half-term cell
                and the planner ranks earlier sub-topics worth revisiting now. The
                score combines time-since-last-touch (the dominant signal), a depth
                bonus, a difficulty bonus, and a small penalty for content already
                revisited.
              </li>
              <li>
                <strong>Coverage check.</strong> The Objective view shows how many
                spec objectives are mapped to a lesson and which are unmapped, so you
                can spot gaps.
              </li>
              <li>
                <strong>What it deliberately doesn't do:</strong> simulate per-student
                forgetting, recommend specific retrieval activities, or auto-place
                anything. It's structural pattern-matching with deterministic rules
                — no AI, no learned weights. Same inputs → same outputs.
              </li>
            </ul>
            <p className="text-[12px] text-ink-fade mt-2">
              The flag thresholds and retrieval weights are configurable per subject
              once a subject is loaded.
            </p>
          </Section>

          <Section title="6. Drafting a first spec with AI">
            <p>
              If you have an exam-board specification (PDF or text), you can ask an
              LLM to translate it into the import structure. Copy this prompt, paste
              it into Claude / ChatGPT / etc., then paste your source spec below it.
              Save the AI's response straight into a{" "}
              <code className="font-mono text-[12px]">.tsv</code> file (any text
              editor works — Notepad, VS Code, …) and import it. No Excel detour
              needed.
            </p>
            <div className="mt-3 border border-line rounded-card overflow-hidden">
              <div className="flex items-center justify-between bg-surface-2 px-3 py-2 border-b border-line">
                <span className="text-[11px] uppercase tracking-wider text-ink-fade">
                  Prompt
                </span>
                <button
                  onClick={() => void copyPrompt()}
                  className="text-xs px-2 py-0.5 bg-navy text-bg rounded hover:bg-navy-dim transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy"
                >
                  {copied ? "Copied!" : "Copy to clipboard"}
                </button>
              </div>
              <pre className="bg-surface px-3 py-3 text-[11.5px] leading-relaxed font-mono text-ink-dim whitespace-pre-wrap overflow-x-auto max-h-72">
                {AI_PROMPT}
              </pre>
            </div>
            <p className="text-warn text-[12px] mt-3">
              <strong>Review before importing.</strong> LLMs hallucinate. Spot-check
              that lesson titles, objectives, and required-practical codes match the
              source spec before pressing Import — and especially that the AI hasn't
              silently invented content to fill perceived gaps.
            </p>
          </Section>

          <Section title="7. Before you import — quick checklist">
            <ul className="list-disc pl-5 space-y-1 text-ink-dim">
              <li>
                Required columns are present and spelled exactly: Topic, Sub-topic,
                Lesson No., Lesson Title.
              </li>
              <li>Topic names are consistent (no stray trailing spaces or capitalisation drift).</li>
              <li>Lesson No. restarts at 1 in each sub-topic.</li>
              <li>
                Difficulty values are 1, 2, or 3 (or blank — defaults to 2).
              </li>
              <li>
                If you used AI to draft the rows, you've read the "things I was
                unsure about" list it produced.
              </li>
            </ul>
            <p className="text-[12px] text-ink-fade mt-2">
              The importer also runs its own validation and shows you any errors or
              warnings before committing — nothing destructive happens silently.
            </p>
          </Section>
        </div>

        <footer className="px-6 py-3 border-t border-line flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <button
              onClick={() => void downloadTemplate()}
              className="px-3 py-1.5 text-sm border border-line rounded hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy"
            >
              Download blank template
            </button>
            {templateError && (
              <span className="text-xs text-warn">{templateError}</span>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm bg-navy text-bg rounded hover:bg-navy-dim focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy"
          >
            Got it
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
      <h3 className="font-display text-base text-navy">{title}</h3>
      <div className="space-y-2 leading-relaxed">{children}</div>
    </section>
  );
}

interface ColumnRow {
  readonly name: string;
  readonly type: string;
  readonly notes: string;
}

function ColumnTable({ rows }: { readonly rows: readonly ColumnRow[] }): JSX.Element {
  return (
    <div className="border border-line rounded-card overflow-hidden">
      <table className="w-full text-[12.5px]">
        <thead className="bg-surface-2 text-ink-dim text-left">
          <tr>
            <th className="px-3 py-2 font-medium w-[170px]">Header</th>
            <th className="px-3 py-2 font-medium w-[110px]">Accepts</th>
            <th className="px-3 py-2 font-medium">Notes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={r.name}
              className={i % 2 === 0 ? "bg-bg" : "bg-surface"}
            >
              <td className="px-3 py-2 font-mono text-ink">{r.name}</td>
              <td className="px-3 py-2 text-ink-dim font-mono text-[11.5px]">
                {r.type}
              </td>
              <td className="px-3 py-2 text-ink-dim">{r.notes}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
