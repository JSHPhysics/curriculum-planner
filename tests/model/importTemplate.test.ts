import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import { importSpec } from "@/model/import";
import { generateImportTemplate } from "@/model/importTemplate";

describe("generateImportTemplate", () => {
  it("produces a single 'Spec' sheet with every required + optional header", () => {
    const buf = generateImportTemplate();
    const wb = XLSX.read(buf, { type: "array" });
    expect(wb.SheetNames).toEqual(["Spec"]);
    const sheet = wb.Sheets["Spec"]!;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
    const headers = rows[0] as string[];
    expect(headers).toContain("Topic");
    expect(headers).toContain("Sub-topic");
    expect(headers).toContain("Lesson No.");
    expect(headers).toContain("Lesson Title");
    expect(headers).toContain("Objectives");
    expect(headers).toContain("Practical");
    expect(headers).toContain("Difficulty");
    expect(headers).toContain("Extra-depth");
    expect(headers).toContain("Separate science only?");
    expect(headers).toContain("Paper");
    expect(headers).toContain("Notes");
  });

  it("round-trips through importSpec into a 1-topic / 1-sub-topic / 2-lesson subject", () => {
    const buf = generateImportTemplate();
    const result = importSpec(buf, { subjectName: "Template" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const topic = result.subject.workingSpec.topics[0]!;
    expect(topic.name).toBe("Example Topic");
    expect(topic.subTopics.length).toBe(1);
    const subTopic = topic.subTopics[0]!;
    expect(subTopic.name).toBe("Example Sub-topic");
    expect(subTopic.lessons.length).toBe(2);
    // First lesson is split across two rows — objectives should merge to two entries
    expect(subTopic.lessons[0]?.objectives.length).toBe(2);
    // Second lesson has two newline-separated objectives in one cell
    expect(subTopic.lessons[1]?.objectives.length).toBe(2);
    expect(subTopic.lessons[1]?.practical).toBe("CP1");
    expect(subTopic.lessons[1]?.isDepth).toBe(true);
  });
});
