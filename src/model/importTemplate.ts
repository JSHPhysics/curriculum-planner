import * as XLSX from "xlsx";

/**
 * Generate a blank import template (`.xlsx`) per SPEC.md §5.1 + §5.5.
 *
 * One sheet named "Spec" with all required + optional headers and two example
 * rows demonstrating multi-row merging (two rows of one lesson, plus a second
 * lesson) — enough that re-importing the file produces a valid 1-topic /
 * 1-sub-topic / 2-lesson subject.
 */
export function generateImportTemplate(): ArrayBuffer {
  const headers = [
    "Topic",
    "Sub-topic",
    "Lesson No.",
    "Lesson Title",
    "Objectives",
    "Practical",
    "Difficulty",
    "Extra-depth",
    "Separate science only?",
    "Paper",
    "Notes",
  ];

  // Example data: 1 topic / 1 sub-topic / 2 lessons, showing the row-merge
  // pattern (the first lesson is split across two rows so the user sees how
  // to add more than one objective per lesson via separate lines).
  const rows: (string | number)[][] = [
    [
      "Example Topic",
      "Example Sub-topic",
      1,
      "First example lesson",
      "Define the first key concept",
      "",
      2,
      "",
      "",
      "Paper 1",
      "Sub-topic notes go here",
    ],
    [
      "Example Topic",
      "Example Sub-topic",
      1,
      "First example lesson",
      "Explain how the first concept applies",
      "",
      2,
      "",
      "",
      "",
      "",
    ],
    [
      "Example Topic",
      "Example Sub-topic",
      2,
      "Second example lesson",
      "Compare the two key concepts\nApply them to a worked example",
      "CP1",
      3,
      "yes",
      "",
      "",
      "",
    ],
  ];

  const wb = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  // Reasonable column widths so the template is readable without manual sizing.
  sheet["!cols"] = [
    { wch: 22 }, // Topic
    { wch: 24 }, // Sub-topic
    { wch: 11 }, // Lesson No.
    { wch: 30 }, // Lesson Title
    { wch: 50 }, // Objectives
    { wch: 12 }, // Practical
    { wch: 11 }, // Difficulty
    { wch: 13 }, // Extra-depth
    { wch: 22 }, // Separate science only?
    { wch: 10 }, // Paper
    { wch: 30 }, // Notes
  ];
  XLSX.utils.book_append_sheet(wb, sheet, "Spec");
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return buf;
}
