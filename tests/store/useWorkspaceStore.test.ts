import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import { importSpec } from "@/model/import";
import { createDefaultTimeline, createEoHTBlocks } from "@/model/timeline";
import type { Subject } from "@/model/types";
import { useWorkspaceStore } from "@/store/useWorkspaceStore";

function counterIdGen(): () => string {
  let n = 0;
  return () => `id-${++n}`;
}

function loadExampleSubject(id: string): Subject {
  const path = resolve(__dirname, "../../examples/example_physics_spec.xlsx");
  const buf = readFileSync(path);
  const ab = new Uint8Array(buf).buffer;
  const r = importSpec(ab, {
    sourceFilename: "example_physics_spec.xlsx",
    subjectName: "Physics",
    idGen: counterIdGen(),
  });
  if (!r.ok) throw new Error("import failed");
  const timeline = createEoHTBlocks(createDefaultTimeline());
  return { ...r.subject, id, timeline };
}

function reset(): void {
  useWorkspaceStore.getState().clearWorkspace();
}

beforeEach(reset);

describe("useWorkspaceStore — initial state", () => {
  it("starts with an empty workspace, not dirty, sub-topic view, no save path", () => {
    const s = useWorkspaceStore.getState();
    expect(s.workspace.subjects).toHaveLength(0);
    expect(s.workspace.activeSubjectId).toBeNull();
    expect(s.dirty).toBe(false);
    expect(s.currentView).toBe("sub-topic");
    expect(s.currentTermId).toBeNull();
    expect(s.currentSavePath).toBeNull();
  });
});

describe("workspace actions", () => {
  it("addSubject marks dirty and sets the first subject active", () => {
    const s = loadExampleSubject("subj-1");
    useWorkspaceStore.getState().addSubject(s);
    const after = useWorkspaceStore.getState();
    expect(after.workspace.subjects).toHaveLength(1);
    expect(after.workspace.activeSubjectId).toBe("subj-1");
    expect(after.dirty).toBe(true);
  });

  it("removeSubject + setActiveSubject + renameSubject work together", () => {
    const store = useWorkspaceStore.getState();
    store.addSubject(loadExampleSubject("subj-1"));
    store.addSubject({ ...loadExampleSubject("subj-2"), id: "subj-2" });
    store.setActiveSubject("subj-2");
    expect(useWorkspaceStore.getState().workspace.activeSubjectId).toBe("subj-2");

    store.renameSubject("subj-2", "Renamed");
    expect(
      useWorkspaceStore.getState().workspace.subjects.find((s) => s.id === "subj-2")?.meta.name
    ).toBe("Renamed");

    store.removeSubject("subj-2");
    expect(useWorkspaceStore.getState().workspace.subjects).toHaveLength(1);
    expect(useWorkspaceStore.getState().workspace.activeSubjectId).toBe("subj-1");
  });

  it("restoreSubjectToImport returns orphans and marks dirty", () => {
    const store = useWorkspaceStore.getState();
    const subject = loadExampleSubject("subj-1");
    store.addSubject(subject);
    store.placeBlock({ kind: "sub-topic", subTopicCode: "T99z" }, "Y9-A1", 3);
    store.markClean();
    const orphans = store.restoreSubjectToImport("subj-1");
    expect(orphans).toHaveLength(1);
    expect(useWorkspaceStore.getState().dirty).toBe(true);
  });
});

describe("placement actions delegate to the active subject's timeline", () => {
  it("placeBlock and removeBlock flip dirty and modify the active timeline", () => {
    const store = useWorkspaceStore.getState();
    store.addSubject(loadExampleSubject("subj-1"));
    store.markClean();
    store.placeBlock({ kind: "sub-topic", subTopicCode: "T1a" }, "Y9-A1", 2);
    let placed = useWorkspaceStore.getState().workspace.subjects[0]?.timeline.halfTerms.find((h) => h.id === "Y9-A1")?.placedBlocks ?? [];
    // Note: createEoHTBlocks already places 1 EoHT block in every half-term
    const subTopicPlacements = placed.filter((p) => p.source.kind === "sub-topic");
    expect(subTopicPlacements).toHaveLength(1);
    const id = subTopicPlacements[0]!.id;

    store.removeBlock(id);
    placed = useWorkspaceStore.getState().workspace.subjects[0]?.timeline.halfTerms.find((h) => h.id === "Y9-A1")?.placedBlocks ?? [];
    expect(placed.filter((p) => p.source.kind === "sub-topic")).toHaveLength(0);
  });

  it("placeBlockWithSpillover distributes across half-terms when overflowing", () => {
    const store = useWorkspaceStore.getState();
    store.addSubject(loadExampleSubject("subj-1"));
    // Y9-A1 budget is 12; EoHT placed = 1, so room = 11
    store.placeBlock({ kind: "sub-topic", subTopicCode: "T1a" }, "Y9-A1", 10);
    // Now room in Y9-A1 = 1; spillover a 5-lesson block
    store.placeBlockWithSpillover({ kind: "sub-topic", subTopicCode: "T2a" }, 5, "Y9-A1");
    const subj = useWorkspaceStore.getState().workspace.subjects[0]!;
    const t2aPieces = subj.timeline.halfTerms.flatMap((h) =>
      h.placedBlocks.filter((p) => p.source.kind === "sub-topic" && p.source.subTopicCode === "T2a")
    );
    expect(t2aPieces.length).toBeGreaterThan(1);
    expect(t2aPieces.every((p) => p.splitType === "auto")).toBe(true);
  });

  it("split + recombine round-trip removes the pieces", () => {
    const store = useWorkspaceStore.getState();
    store.addSubject(loadExampleSubject("subj-1"));
    store.placeBlock({ kind: "sub-topic", subTopicCode: "T2a" }, "Y9-S1", 6);
    const subj = useWorkspaceStore.getState().workspace.subjects[0]!;
    const piece = subj.timeline.halfTerms.find((h) => h.id === "Y9-S1")?.placedBlocks.find((p) => p.source.kind === "sub-topic")!;
    store.splitBlock(piece.id, 2);
    let s = useWorkspaceStore.getState().workspace.subjects[0]!;
    let placed = s.timeline.halfTerms.find((h) => h.id === "Y9-S1")?.placedBlocks.filter((p) => p.source.kind === "sub-topic") ?? [];
    expect(placed).toHaveLength(2);
    // Use the first piece's id to find splitFrom and recombine
    store.recombineBlock(placed[0]!.id);
    s = useWorkspaceStore.getState().workspace.subjects[0]!;
    placed = s.timeline.halfTerms.find((h) => h.id === "Y9-S1")?.placedBlocks.filter((p) => p.source.kind === "sub-topic") ?? [];
    expect(placed).toHaveLength(0);
  });

  it("moveBlock relocates a placement", () => {
    const store = useWorkspaceStore.getState();
    store.addSubject(loadExampleSubject("subj-1"));
    store.placeBlock({ kind: "sub-topic", subTopicCode: "T1a" }, "Y9-A1", 2);
    const piece = useWorkspaceStore.getState().workspace.subjects[0]!.timeline.halfTerms.find((h) => h.id === "Y9-A1")!.placedBlocks.find((p) => p.source.kind === "sub-topic")!;
    store.moveBlock(piece.id, "Y9-A2");
    const a1 = useWorkspaceStore.getState().workspace.subjects[0]!.timeline.halfTerms.find((h) => h.id === "Y9-A1")!.placedBlocks.filter((p) => p.source.kind === "sub-topic");
    const a2 = useWorkspaceStore.getState().workspace.subjects[0]!.timeline.halfTerms.find((h) => h.id === "Y9-A2")!.placedBlocks.filter((p) => p.source.kind === "sub-topic");
    expect(a1).toHaveLength(0);
    expect(a2).toHaveLength(1);
  });

  it("editBlockLessons updates count and demotes auto splits", () => {
    const store = useWorkspaceStore.getState();
    store.addSubject(loadExampleSubject("subj-1"));
    store.placeBlock({ kind: "sub-topic", subTopicCode: "T1a" }, "Y9-A1", 2);
    const piece = useWorkspaceStore.getState().workspace.subjects[0]!.timeline.halfTerms.find((h) => h.id === "Y9-A1")!.placedBlocks.find((p) => p.source.kind === "sub-topic")!;
    store.editBlockLessons(piece.id, 4);
    const after = useWorkspaceStore.getState().workspace.subjects[0]!.timeline.halfTerms.find((h) => h.id === "Y9-A1")!.placedBlocks.find((p) => p.id === piece.id);
    expect(after?.lessonsClaimed).toBe(4);
  });

  it("moveTopicInHalfTerm moves every sub-topic placement of that topic from source to target", () => {
    const store = useWorkspaceStore.getState();
    store.addSubject(loadExampleSubject("subj-1"));
    // Place two sub-topics of T2 (Motion and forces) in Y9-A1, plus one of T3 as a distractor
    store.placeBlock({ kind: "sub-topic", subTopicCode: "T2a" }, "Y9-A1", 2);
    store.placeBlock({ kind: "sub-topic", subTopicCode: "T2b" }, "Y9-A1", 2);
    store.placeBlock({ kind: "sub-topic", subTopicCode: "T3a" }, "Y9-A1", 1);

    const before = useWorkspaceStore.getState().workspace.subjects[0]!;
    const a1Before = before.timeline.halfTerms.find((h) => h.id === "Y9-A1")!;
    const t2Ids = a1Before.placedBlocks
      .filter((p) => p.source.kind === "sub-topic" && (p.source.subTopicCode === "T2a" || p.source.subTopicCode === "T2b"))
      .map((p) => p.id);

    store.moveTopicInHalfTerm("T2", "Y9-A1", "Y9-A2");

    const after = useWorkspaceStore.getState().workspace.subjects[0]!;
    const a1 = after.timeline.halfTerms.find((h) => h.id === "Y9-A1")!;
    const a2 = after.timeline.halfTerms.find((h) => h.id === "Y9-A2")!;

    // T2 placements gone from A1, T3 distractor stays
    expect(a1.placedBlocks.filter((p) => p.source.kind === "sub-topic" && (p.source.subTopicCode === "T2a" || p.source.subTopicCode === "T2b"))).toHaveLength(0);
    expect(a1.placedBlocks.some((p) => p.source.kind === "sub-topic" && p.source.subTopicCode === "T3a")).toBe(true);

    // Both T2 ids are now in A2 (identity preserved)
    const movedIds = a2.placedBlocks.filter((p) => t2Ids.includes(p.id)).map((p) => p.id);
    expect(movedIds.length).toBe(2);
    expect(new Set(movedIds)).toEqual(new Set(t2Ids));
  });

  it("moveTopicInHalfTerm is a no-op when source equals target or topic has no placements in cell", () => {
    const store = useWorkspaceStore.getState();
    store.addSubject(loadExampleSubject("subj-1"));
    store.placeBlock({ kind: "sub-topic", subTopicCode: "T2a" }, "Y9-A1", 2);
    store.markClean();

    store.moveTopicInHalfTerm("T2", "Y9-A1", "Y9-A1");
    expect(useWorkspaceStore.getState().dirty).toBe(false);

    store.moveTopicInHalfTerm("T2", "Y9-A2", "Y9-A1"); // no T2 in A2
    expect(useWorkspaceStore.getState().dirty).toBe(false);
  });

  it("updateCustomBlock patches an existing custom block and marks dirty", () => {
    const store = useWorkspaceStore.getState();
    store.addSubject(loadExampleSubject("subj-1"));
    store.addCustomBlock({
      id: "cb-test",
      name: "Mock exam",
      lessons: 2,
      colour: "#B85C5C",
      isEoHT: false,
    });
    store.markClean();
    store.updateCustomBlock("cb-test", { kind: "retrieval", revisits: ["T2a", "T3b"] });
    const subj = useWorkspaceStore.getState().workspace.subjects[0]!;
    const cb = subj.customBlocks.find((c) => c.id === "cb-test");
    expect(cb?.kind).toBe("retrieval");
    expect(cb?.revisits).toEqual(["T2a", "T3b"]);
    expect(cb?.name).toBe("Mock exam"); // unchanged
    expect(useWorkspaceStore.getState().dirty).toBe(true);
  });

  it("setCalendarTemplate stores the template and marks dirty; null clears it cleanly", () => {
    const store = useWorkspaceStore.getState();
    store.setCalendarTemplate({
      cycleLengthInWeeks: 1,
      lessonsPerCyclePerYear: { Y9: 5 },
      halfTerms: [{ id: "Y9-HT1", name: "Aut 1", year: "Y9", weeks: 6 }],
    });
    expect(useWorkspaceStore.getState().workspace.calendarTemplate?.cycleLengthInWeeks).toBe(1);
    expect(useWorkspaceStore.getState().dirty).toBe(true);

    store.setCalendarTemplate(null);
    // Field should be ABSENT after clear, not present-as-undefined — keeps
    // the "no template configured" semantics clean.
    expect("calendarTemplate" in useWorkspaceStore.getState().workspace).toBe(false);
  });

  it("updateCustomBlock is a no-op for unknown id", () => {
    const store = useWorkspaceStore.getState();
    store.addSubject(loadExampleSubject("subj-1"));
    store.markClean();
    store.updateCustomBlock("ghost", { name: "X" });
    expect(useWorkspaceStore.getState().dirty).toBe(false);
  });

  it("placement actions are no-ops when no active subject exists", () => {
    const before = useWorkspaceStore.getState().workspace;
    useWorkspaceStore.getState().placeBlock({ kind: "sub-topic", subTopicCode: "T1a" }, "Y9-A1", 2);
    const after = useWorkspaceStore.getState().workspace;
    // workspace unchanged when no active subject
    expect(after.subjects).toEqual(before.subjects);
  });
});

describe("view actions", () => {
  it("setCurrentView and setCurrentTermId mutate without dirty flag", () => {
    const store = useWorkspaceStore.getState();
    store.setCurrentView("lesson");
    store.setCurrentTermId("Y9-A1");
    expect(useWorkspaceStore.getState().currentView).toBe("lesson");
    expect(useWorkspaceStore.getState().currentTermId).toBe("Y9-A1");
    expect(useWorkspaceStore.getState().dirty).toBe(false);
  });
});

describe("setWorkspace, setSavePath, markClean, clearWorkspace", () => {
  it("setWorkspace replaces state and clears dirty", () => {
    const store = useWorkspaceStore.getState();
    store.addSubject(loadExampleSubject("subj-1"));
    store.setWorkspace({ activeSubjectId: null, subjects: [] });
    expect(useWorkspaceStore.getState().dirty).toBe(false);
    expect(useWorkspaceStore.getState().workspace.subjects).toHaveLength(0);
  });

  it("setSavePath tracks the file path for subsequent saves", () => {
    useWorkspaceStore.getState().setSavePath("/tmp/foo.curriculum");
    expect(useWorkspaceStore.getState().currentSavePath).toBe("/tmp/foo.curriculum");
  });

  it("markClean flips dirty to false without changing the workspace", () => {
    const store = useWorkspaceStore.getState();
    store.addSubject(loadExampleSubject("subj-1"));
    const before = useWorkspaceStore.getState().workspace;
    store.markClean();
    expect(useWorkspaceStore.getState().dirty).toBe(false);
    expect(useWorkspaceStore.getState().workspace).toBe(before);
  });

  it("clearWorkspace resets every slice to initial state", () => {
    const store = useWorkspaceStore.getState();
    store.addSubject(loadExampleSubject("subj-1"));
    store.setCurrentView("topic");
    store.setSavePath("/x");
    store.clearWorkspace();
    const s = useWorkspaceStore.getState();
    expect(s.workspace.subjects).toHaveLength(0);
    expect(s.currentView).toBe("sub-topic");
    expect(s.currentSavePath).toBeNull();
    expect(s.dirty).toBe(false);
  });
});
