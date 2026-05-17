import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import {
  __internal,
  exportFolderStructure,
  packTreeAsZip,
} from "@/model/folderExport";
import { importSpec } from "@/model/import";
import { placeBlock } from "@/model/placement";
import { applyPreset } from "@/model/presets";
import { createDefaultTimeline, seedEndOfHalfTermTests } from "@/model/timeline";
import type { PlacedBlockSource, Subject } from "@/model/types";

function counterIdGen(): () => string {
  let n = 0;
  return () => `id-${++n}`;
}

function loadExample(): Subject {
  const path = resolve(__dirname, "../../examples/example_physics_spec.xlsx");
  const buf = readFileSync(path);
  const ab = new Uint8Array(buf).buffer;
  const r = importSpec(ab, {
    sourceFilename: "example_physics_spec.xlsx",
    subjectName: "GCSE Physics 1PH0",
    idGen: counterIdGen(),
  });
  if (!r.ok) throw new Error("import failed");
  return { ...r.subject, timeline: createDefaultTimeline() };
}

function decodeText(bytes: Uint8Array | undefined): string {
  if (!bytes) return "";
  return new TextDecoder().decode(bytes);
}

// ============================================================
// exportFolderStructure — by half-term
// ============================================================

describe("exportFolderStructure — by half-term (DEC-045)", () => {
  it("emits the root marker + a folder for every visible HT (even empty ones)", () => {
    const subject = loadExample();
    const tree = exportFolderStructure(subject, "half-term");
    expect(tree.suggestedRootName).toContain("GCSE Physics 1PH0");
    expect(tree.suggestedRootName).toContain("by half-term");
    // Every visible HT gets a folder — pre-built slots for future planning.
    // Default LEHS template has 17 half-terms (Y9-A1..Y11-U1).
    const paths = tree.entries.map((e) => e.path);
    expect(paths).toContain(""); // root marker
    expect(paths).toContain("Y9 Aut 1");
    expect(paths).toContain("Y11 Sum 1");
    // No topic folders since nothing's placed
    expect(paths.every((p) => p.split("/").length <= 1)).toBe(true);
  });

  it("emits HT → Topic → Sub-topic → Lesson folders + _lesson-info.txt at each leaf", () => {
    const subject = loadExample();
    // Place T1a (2 lessons) into Y9-A1 so the tree has something to walk
    const placed: Subject = {
      ...subject,
      timeline: placeBlock(
        subject.timeline,
        { kind: "sub-topic", subTopicCode: "T1a" } as PlacedBlockSource,
        "Y9-A1",
        2,
        { idGen: counterIdGen() }
      ),
    };
    const tree = exportFolderStructure(placed, "half-term");
    const paths = tree.entries.map((e) => e.path);
    // Tree structure should include:
    //   "" (root marker)
    //   "Y9 Aut 1"
    //   "Y9 Aut 1/Key concepts of physics"
    //   "Y9 Aut 1/Key concepts of physics/Units and measurement"
    //   "Y9 Aut 1/Key concepts of physics/Units and measurement/SI units and prefixes"
    //   "Y9 Aut 1/Key concepts of physics/Units and measurement/SI units and prefixes/_lesson-info.txt"
    //   …
    expect(paths).toContain("Y9 Aut 1");
    expect(paths).toContain("Y9 Aut 1/Key concepts of physics");
    expect(paths).toContain("Y9 Aut 1/Key concepts of physics/Units and measurement");
    expect(paths).toContain(
      "Y9 Aut 1/Key concepts of physics/Units and measurement/SI units and prefixes"
    );
    expect(paths).toContain(
      "Y9 Aut 1/Key concepts of physics/Units and measurement/SI units and prefixes/_lesson-info.txt"
    );
  });

  it("leaf _lesson-info.txt contains title, topic, sub-topic, half-term, objectives", () => {
    const subject = loadExample();
    const placed: Subject = {
      ...subject,
      timeline: placeBlock(
        subject.timeline,
        { kind: "sub-topic", subTopicCode: "T1a" } as PlacedBlockSource,
        "Y9-A1",
        2,
        { idGen: counterIdGen() }
      ),
    };
    const tree = exportFolderStructure(placed, "half-term");
    const lessonInfo = tree.entries.find((e) =>
      e.path.endsWith("SI units and prefixes/_lesson-info.txt")
    );
    expect(lessonInfo).toBeDefined();
    const text = decodeText(lessonInfo!.content);
    expect(text).toContain("Lesson:");
    expect(text).toContain("SI units and prefixes");
    expect(text).toContain("Topic:");
    expect(text).toContain("Key concepts of physics");
    expect(text).toContain("Sub-topic:");
    expect(text).toContain("Units and measurement");
    expect(text).toContain("Half-term:");
    expect(text).toContain("Y9 Aut 1");
    expect(text).toContain("Objectives:");
    // The actual SI-units objectives from the demo spec
    expect(text).toContain("Use SI base units");
  });

  it("custom blocks (e.g. auto-seeded EoHT tests) appear as leaf folders under the HT", () => {
    const subject = loadExample();
    const seeded = seedEndOfHalfTermTests(subject.timeline, { idGen: counterIdGen() });
    const withTests: Subject = {
      ...subject,
      timeline: seeded.timeline,
      customBlocks: [...subject.customBlocks, seeded.customBlock],
    };
    const tree = exportFolderStructure(withTests, "half-term");
    const paths = tree.entries.map((e) => e.path);
    // Each HT should contain an "End of half-term test" folder
    expect(paths).toContain("Y9 Aut 1/End of half-term test");
    expect(paths).toContain("Y9 Aut 1/End of half-term test/_lesson-info.txt");
  });

  it("respects hidden years — no folders for hidden-year HTs", () => {
    const subject: Subject = {
      ...loadExample(),
      config: {
        includeDepth: false,
        lostLessonBuffer: false,
        autoSpillover: true,
        hiddenYears: ["Y10"],
      },
    };
    // Place something in Y10-A1 (hidden) and Y9-A1 (visible)
    let tl = placeBlock(
      subject.timeline,
      { kind: "sub-topic", subTopicCode: "T1a" } as PlacedBlockSource,
      "Y9-A1",
      2,
      { idGen: counterIdGen() }
    );
    tl = placeBlock(
      tl,
      { kind: "sub-topic", subTopicCode: "T1a" } as PlacedBlockSource,
      "Y10-A1",
      1,
      { idGen: counterIdGen() }
    );
    const placed: Subject = { ...subject, timeline: tl };
    const tree = exportFolderStructure(placed, "half-term");
    const paths = tree.entries.map((e) => e.path);
    expect(paths.some((p) => p.startsWith("Y9 "))).toBe(true);
    expect(paths.some((p) => p.startsWith("Y10 "))).toBe(false);
  });

  it("respects the depth toggle — depth lessons disappear from the tree", () => {
    const subject = loadExample();
    // Find a sub-topic with mixed depth/foundation lessons (T2 acceleration has one)
    const tl = placeBlock(
      subject.timeline,
      { kind: "sub-topic", subTopicCode: "T2b" } as PlacedBlockSource,
      "Y9-A2",
      5,
      { idGen: counterIdGen() }
    );
    const placed: Subject = { ...subject, timeline: tl };
    const tree = exportFolderStructure(placed, "half-term");
    const paths = tree.entries.map((e) => e.path);
    // Foundation lessons should appear
    expect(paths.some((p) => p.includes("Acceleration"))).toBe(true);
    // The depth lesson "Terminal velocity (depth)" should NOT appear under
    // the default includeDepth=false
    expect(paths.some((p) => p.includes("Terminal velocity"))).toBe(false);
  });
});

// ============================================================
// exportFolderStructure — by topic
// ============================================================

describe("exportFolderStructure — by topic (DEC-045)", () => {
  it("emits Topic → Sub-topic → Lesson folders (no HT layer)", () => {
    const subject = loadExample();
    const placed: Subject = {
      ...subject,
      timeline: placeBlock(
        subject.timeline,
        { kind: "sub-topic", subTopicCode: "T1a" } as PlacedBlockSource,
        "Y9-A1",
        2,
        { idGen: counterIdGen() }
      ),
    };
    const tree = exportFolderStructure(placed, "topic");
    const paths = tree.entries.map((e) => e.path);
    expect(paths).toContain("Key concepts of physics");
    expect(paths).toContain("Key concepts of physics/Units and measurement");
    expect(paths).toContain(
      "Key concepts of physics/Units and measurement/SI units and prefixes"
    );
    expect(paths).toContain(
      "Key concepts of physics/Units and measurement/SI units and prefixes/_lesson-info.txt"
    );
    // No HT layer present
    expect(paths.every((p) => !p.startsWith("Y9 Aut"))).toBe(true);
  });

  it("topics emit in spec order, sub-topics in spec order within each topic", () => {
    const subject = loadExample();
    const placed: Subject = {
      ...subject,
      timeline: applyPreset(subject, "frontloaded"),
    };
    const tree = exportFolderStructure(placed, "topic");
    const topLevelFolders = tree.entries
      .filter((e) => e.content === undefined && !e.path.includes("/") && e.path !== "")
      .map((e) => e.path);
    // First two top-level folders should be T1 and T2 in spec order
    expect(topLevelFolders[0]).toContain("Key concepts of physics");
    expect(topLevelFolders[1]).toContain("Motion and forces");
  });

  it("custom blocks land under an 'Other blocks' folder at the root", () => {
    const subject = loadExample();
    const seeded = seedEndOfHalfTermTests(subject.timeline, { idGen: counterIdGen() });
    const withTests: Subject = {
      ...subject,
      timeline: seeded.timeline,
      customBlocks: [...subject.customBlocks, seeded.customBlock],
    };
    const tree = exportFolderStructure(withTests, "topic");
    const paths = tree.entries.map((e) => e.path);
    expect(paths).toContain("Other blocks");
    // Each placement gets its own folder
    expect(paths.filter((p) => p.startsWith("Other blocks/End of half-term test")).length).toBeGreaterThan(0);
  });

  it("skips topics with no placements", () => {
    const subject = loadExample();
    // Place only T1a — no T2/T3/etc placements
    const placed: Subject = {
      ...subject,
      timeline: placeBlock(
        subject.timeline,
        { kind: "sub-topic", subTopicCode: "T1a" } as PlacedBlockSource,
        "Y9-A1",
        2,
        { idGen: counterIdGen() }
      ),
    };
    const tree = exportFolderStructure(placed, "topic");
    const topLevelFolders = tree.entries
      .filter((e) => e.content === undefined && !e.path.includes("/") && e.path !== "")
      .map((e) => e.path);
    expect(topLevelFolders).toEqual(["Key concepts of physics"]);
  });
});

// ============================================================
// packTreeAsZip
// ============================================================

describe("packTreeAsZip", () => {
  it("returns a zip buffer named after the suggested root + .zip", async () => {
    const subject = loadExample();
    const tree = exportFolderStructure(subject, "half-term");
    const zipped = await packTreeAsZip(tree);
    expect(zipped.suggestedFilename).toBe(`${tree.suggestedRootName}.zip`);
    expect(zipped.buffer.byteLength).toBeGreaterThan(0);
  });

  it("preserves the folder/file structure round-trip", async () => {
    const subject = loadExample();
    const placed: Subject = {
      ...subject,
      timeline: placeBlock(
        subject.timeline,
        { kind: "sub-topic", subTopicCode: "T1a" } as PlacedBlockSource,
        "Y9-A1",
        2,
        { idGen: counterIdGen() }
      ),
    };
    const tree = exportFolderStructure(placed, "half-term");
    const zipped = await packTreeAsZip(tree);
    const reopened = await JSZip.loadAsync(zipped.buffer);
    const archivedPaths = Object.keys(reopened.files).sort();
    // The info file at the deepest leaf should be present
    expect(
      archivedPaths.some((p) =>
        p.endsWith("SI units and prefixes/_lesson-info.txt")
      )
    ).toBe(true);
  });

  it("preserves _lesson-info.txt content byte-for-byte", async () => {
    const subject = loadExample();
    const placed: Subject = {
      ...subject,
      timeline: placeBlock(
        subject.timeline,
        { kind: "sub-topic", subTopicCode: "T1a" } as PlacedBlockSource,
        "Y9-A1",
        2,
        { idGen: counterIdGen() }
      ),
    };
    const tree = exportFolderStructure(placed, "half-term");
    const original = tree.entries.find((e) =>
      e.path.endsWith("SI units and prefixes/_lesson-info.txt")
    );
    expect(original?.content).toBeDefined();

    const zipped = await packTreeAsZip(tree);
    const reopened = await JSZip.loadAsync(zipped.buffer);
    const fileInZip = Object.entries(reopened.files).find(([p]) =>
      p.endsWith("SI units and prefixes/_lesson-info.txt")
    );
    expect(fileInZip).toBeDefined();
    const fromZip = await fileInZip![1].async("uint8array");
    expect(Array.from(fromZip)).toEqual(Array.from(new Uint8Array(original!.content!)));
  });
});

// ============================================================
// safe() naming
// ============================================================

describe("folder-name safety", () => {
  it("strips path-reserved characters", () => {
    const { safe } = __internal;
    // `/`, `:`, `"` all map to spaces, then run-collapse merges adjacent spaces.
    expect(safe('Forces / Motion: "the basics"')).toBe("Forces Motion the basics");
    expect(safe("Topic with <reserved> chars")).toBe("Topic with reserved chars");
  });

  it("trims trailing dots (Windows-hostile)", () => {
    const { safe } = __internal;
    expect(safe("Topic name...")).toBe("Topic name");
    expect(safe("Forces.")).toBe("Forces");
  });

  it("collapses runs of whitespace", () => {
    const { safe } = __internal;
    expect(safe("Many   spaces  here")).toBe("Many spaces here");
  });
});
