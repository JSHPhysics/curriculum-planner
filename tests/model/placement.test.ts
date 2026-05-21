import { describe, expect, it } from "vitest";

import {
  consolidateTimeline,
  editBlockLessons,
  extractAndMoveLesson,
  extractAndMoveLessonToIndex,
  findPlacedBlock,
  moveBlock,
  moveBlockToIndex,
  placeBlock,
  placeBlockAtIndex,
  placeBlockWithSpillover,
  placeLessonAtIndex,
  recombineBlock,
  removeBlock,
  removePlacedLesson,
  splitBlock,
} from "@/model/placement";
import { createDefaultTimeline, halfTermUsed } from "@/model/timeline";
import type { PlacedBlockSource, Timeline } from "@/model/types";

function counterIdGen(): () => string {
  let n = 0;
  return () => `id-${++n}`;
}

const T1a: PlacedBlockSource = { kind: "sub-topic", subTopicCode: "T1a" };
const T1b: PlacedBlockSource = { kind: "sub-topic", subTopicCode: "T1b" };

function blocksIn(tl: Timeline, termId: string) {
  return tl.halfTerms.find((h) => h.id === termId)?.placedBlocks ?? [];
}

describe("placeBlock", () => {
  it("creates a new placed block in the target half-term", () => {
    const tl = placeBlock(createDefaultTimeline(), T1a, "Y9-A1", 4, {
      idGen: counterIdGen(),
    });
    const placed = blocksIn(tl, "Y9-A1");
    expect(placed).toHaveLength(1);
    expect(placed[0]).toMatchObject({
      id: "id-1",
      source: T1a,
      lessonsClaimed: 4,
      lessonRange: [0, 4],
      splitFrom: null,
      splitType: null,
    });
  });

  it("does not mutate the input timeline", () => {
    const tl = createDefaultTimeline();
    const before = blocksIn(tl, "Y9-A1").length;
    placeBlock(tl, T1a, "Y9-A1", 4, { idGen: counterIdGen() });
    expect(blocksIn(tl, "Y9-A1")).toHaveLength(before);
  });

  it("throws on negative lessonsClaimed", () => {
    expect(() => placeBlock(createDefaultTimeline(), T1a, "Y9-A1", -1)).toThrow();
  });

  it("throws on an unknown term id", () => {
    expect(() => placeBlock(createDefaultTimeline(), T1a, "NOPE", 4)).toThrow();
  });
});

describe("placeBlockWithSpillover", () => {
  it("places as a single block when it fits in the target term", () => {
    const tl = placeBlockWithSpillover(createDefaultTimeline(), T1a, 4, "Y9-A1", {
      idGen: counterIdGen(),
    });
    expect(blocksIn(tl, "Y9-A1")).toHaveLength(1);
    expect(blocksIn(tl, "Y9-A1")[0]?.splitType).toBeNull();
  });

  it("auto-splits across consecutive half-terms when the target overflows", () => {
    // Y9-A1 budget = 12. Pre-place 10 → 2 room left. Then add 5 → should put 2 in A1, 3 in A2.
    let tl = placeBlock(createDefaultTimeline(), T1a, "Y9-A1", 10, { idGen: counterIdGen() });
    tl = placeBlockWithSpillover(tl, T1b, 5, "Y9-A1", { idGen: counterIdGen() });
    const a1 = blocksIn(tl, "Y9-A1").filter((b) => b.source.kind === "sub-topic" && b.source.subTopicCode === "T1b");
    const a2 = blocksIn(tl, "Y9-A2").filter((b) => b.source.kind === "sub-topic" && b.source.subTopicCode === "T1b");
    expect(a1).toHaveLength(1);
    expect(a2).toHaveLength(1);
    expect(a1[0]?.lessonsClaimed).toBe(2);
    expect(a2[0]?.lessonsClaimed).toBe(3);
    expect(a1[0]?.splitType).toBe("auto");
    expect(a2[0]?.splitType).toBe("auto");
    expect(a1[0]?.splitFrom).toBe(a2[0]?.splitFrom);
  });

  it("preserves ranges as contiguous slices of the source", () => {
    let tl = placeBlock(createDefaultTimeline(), T1a, "Y9-A1", 10, { idGen: counterIdGen() });
    tl = placeBlockWithSpillover(tl, T1b, 5, "Y9-A1", { idGen: counterIdGen() });
    const t1bPieces = [
      ...blocksIn(tl, "Y9-A1").filter((b) => b.source.kind === "sub-topic" && b.source.subTopicCode === "T1b"),
      ...blocksIn(tl, "Y9-A2").filter((b) => b.source.kind === "sub-topic" && b.source.subTopicCode === "T1b"),
    ];
    expect(t1bPieces[0]?.lessonRange).toEqual([0, 2]);
    expect(t1bPieces[1]?.lessonRange).toEqual([2, 5]);
  });

  it("skips terms with zero room and continues to the next available one", () => {
    // Saturate Y9-A1 (budget 12) and Y9-A2 (budget 12), then spillover from A1
    let tl = createDefaultTimeline();
    tl = placeBlock(tl, T1a, "Y9-A1", 12, { idGen: counterIdGen() });
    tl = placeBlock(tl, T1a, "Y9-A2", 12, { idGen: counterIdGen() });
    tl = placeBlockWithSpillover(tl, T1b, 4, "Y9-A1", { idGen: counterIdGen() });
    expect(blocksIn(tl, "Y9-A1").filter((b) => b.source.kind === "sub-topic" && b.source.subTopicCode === "T1b")).toHaveLength(0);
    expect(blocksIn(tl, "Y9-A2").filter((b) => b.source.kind === "sub-topic" && b.source.subTopicCode === "T1b")).toHaveLength(0);
    const s1 = blocksIn(tl, "Y9-S1").filter((b) => b.source.kind === "sub-topic" && b.source.subTopicCode === "T1b");
    expect(s1).toHaveLength(1);
    expect(s1[0]?.lessonsClaimed).toBe(4);
    expect(s1[0]?.splitType).toBeNull();
  });

  it("stuffs leftover lessons into the last placement when no room remains anywhere", () => {
    // Saturate every half-term, then try to place 5 from Y9-A1
    let tl = createDefaultTimeline();
    for (const ht of tl.halfTerms) {
      tl = placeBlock(tl, T1a, ht.id, ht.budget, { idGen: counterIdGen() });
    }
    tl = placeBlockWithSpillover(tl, T1b, 5, "Y9-A1", { idGen: counterIdGen() });
    const a1Pieces = blocksIn(tl, "Y9-A1").filter((b) => b.source.kind === "sub-topic" && b.source.subTopicCode === "T1b");
    expect(a1Pieces).toHaveLength(1);
    expect(a1Pieces[0]?.lessonsClaimed).toBe(5);
    expect(a1Pieces[0]?.splitType).toBeNull();
  });

  it("treats lessonsClaimed = 0 as a single empty placement", () => {
    const tl = placeBlockWithSpillover(createDefaultTimeline(), T1a, 0, "Y9-A1", {
      idGen: counterIdGen(),
    });
    expect(blocksIn(tl, "Y9-A1")).toHaveLength(1);
    expect(blocksIn(tl, "Y9-A1")[0]?.lessonsClaimed).toBe(0);
  });

  it("throws on unknown term id", () => {
    expect(() =>
      placeBlockWithSpillover(createDefaultTimeline(), T1a, 4, "BAD")
    ).toThrow();
  });
});

describe("splitBlock", () => {
  it("immediately re-merges adjacent pieces in the same cell (DEC-046)", () => {
    // splitBlock divides a placed block into two adjacent pieces, then the
    // consolidator notices they share a sub-topic + sit in one cell and
    // merges them back into one. Net effect: splitBlock-in-same-cell is a
    // no-op at the data level. The user requested visual clarity — same-
    // sub-topic adjacent placements always render as one merged block.
    let tl = placeBlock(createDefaultTimeline(), T1a, "Y9-A1", 4, { idGen: counterIdGen() });
    const blockId = blocksIn(tl, "Y9-A1")[0]!.id;
    tl = splitBlock(tl, blockId, 1, { idGen: counterIdGen() });
    const placed = blocksIn(tl, "Y9-A1");
    expect(placed).toHaveLength(1);
    expect(placed[0]?.lessonRange).toEqual([0, 4]);
    expect(placed[0]?.lessonsClaimed).toBe(4);
  });

  it("preserves splitFrom across the merge so cross-cell recombine still works", () => {
    // Two-cell split: place a block that auto-spills across A1+A2. Both
    // pieces share splitFrom. Within each cell consolidation is a no-op
    // (one piece per cell). Recombine should still find the group by
    // splitFrom and wipe both pieces.
    let tl = placeBlock(createDefaultTimeline(), T1a, "Y9-A1", 0, { idGen: counterIdGen() });
    tl = removeBlock(tl, blocksIn(tl, "Y9-A1")[0]!.id);
    tl = placeBlockWithSpillover(tl, T1a, 16, "Y9-A1", { idGen: counterIdGen() });
    const pieces = [
      ...blocksIn(tl, "Y9-A1").filter((b) => b.source.kind === "sub-topic"),
      ...blocksIn(tl, "Y9-A2").filter((b) => b.source.kind === "sub-topic"),
    ];
    expect(pieces.length).toBeGreaterThanOrEqual(2);
    expect(pieces.every((p) => p.splitFrom === pieces[0]!.splitFrom)).toBe(true);
  });

  it("throws when atLessonIdx is out of range", () => {
    let tl = placeBlock(createDefaultTimeline(), T1a, "Y9-A1", 4, { idGen: counterIdGen() });
    const blockId = blocksIn(tl, "Y9-A1")[0]!.id;
    expect(() => splitBlock(tl, blockId, 0)).toThrow();
    expect(() => splitBlock(tl, blockId, 4)).toThrow();
    expect(() => splitBlock(tl, blockId, 5)).toThrow();
  });

  it("throws when the placed block id is unknown", () => {
    expect(() => splitBlock(createDefaultTimeline(), "ghost", 1)).toThrow();
  });
});

describe("recombineBlock", () => {
  it("removes every PlacedBlock sharing the same splitFrom", () => {
    let tl = placeBlock(createDefaultTimeline(), T1a, "Y9-A1", 10, { idGen: counterIdGen() });
    tl = placeBlockWithSpillover(tl, T1b, 5, "Y9-A1", { idGen: counterIdGen() });
    const someT1bPiece = blocksIn(tl, "Y9-A1").find(
      (b) => b.source.kind === "sub-topic" && b.source.subTopicCode === "T1b"
    )!;
    tl = recombineBlock(tl, someT1bPiece.id);
    const remaining = [
      ...blocksIn(tl, "Y9-A1"),
      ...blocksIn(tl, "Y9-A2"),
    ].filter((b) => b.source.kind === "sub-topic" && b.source.subTopicCode === "T1b");
    expect(remaining).toHaveLength(0);
    // T1a placement is untouched
    expect(blocksIn(tl, "Y9-A1").some((b) => b.source.kind === "sub-topic" && b.source.subTopicCode === "T1a")).toBe(true);
  });

  it("throws when called on a block with no splitFrom", () => {
    const tl = placeBlock(createDefaultTimeline(), T1a, "Y9-A1", 4, { idGen: counterIdGen() });
    const blockId = blocksIn(tl, "Y9-A1")[0]!.id;
    expect(() => recombineBlock(tl, blockId)).toThrow();
  });

  it("throws on an unknown block id", () => {
    expect(() => recombineBlock(createDefaultTimeline(), "ghost")).toThrow();
  });
});

describe("removeBlock", () => {
  it("removes the placement from its half-term", () => {
    let tl = placeBlock(createDefaultTimeline(), T1a, "Y9-A1", 4, { idGen: counterIdGen() });
    const id = blocksIn(tl, "Y9-A1")[0]!.id;
    tl = removeBlock(tl, id);
    expect(blocksIn(tl, "Y9-A1")).toHaveLength(0);
  });

  it("is a no-op on an unknown id", () => {
    const tl = placeBlock(createDefaultTimeline(), T1a, "Y9-A1", 4, { idGen: counterIdGen() });
    const after = removeBlock(tl, "ghost");
    expect(after.halfTerms).toEqual(tl.halfTerms);
  });
});

describe("moveBlock", () => {
  it("moves a placement to another half-term, preserving every other field", () => {
    let tl = placeBlock(createDefaultTimeline(), T1a, "Y9-A1", 4, { idGen: counterIdGen() });
    const original = blocksIn(tl, "Y9-A1")[0]!;
    tl = moveBlock(tl, original.id, "Y10-S2");
    expect(blocksIn(tl, "Y9-A1")).toHaveLength(0);
    const moved = blocksIn(tl, "Y10-S2");
    expect(moved).toHaveLength(1);
    expect(moved[0]).toEqual(original);
  });

  it("is a no-op when moving to the same term", () => {
    let tl = placeBlock(createDefaultTimeline(), T1a, "Y9-A1", 4, { idGen: counterIdGen() });
    const before = tl;
    tl = moveBlock(tl, blocksIn(tl, "Y9-A1")[0]!.id, "Y9-A1");
    expect(tl).toBe(before);
  });

  it("throws on unknown block or unknown target term", () => {
    let tl = placeBlock(createDefaultTimeline(), T1a, "Y9-A1", 4, { idGen: counterIdGen() });
    const id = blocksIn(tl, "Y9-A1")[0]!.id;
    expect(() => moveBlock(tl, "ghost", "Y9-A2")).toThrow();
    expect(() => moveBlock(tl, id, "BAD")).toThrow();
  });
});

describe("editBlockLessons (auto → manual demotion)", () => {
  it("changes lessonsClaimed and re-anchors lessonRange", () => {
    let tl = placeBlock(createDefaultTimeline(), T1a, "Y9-A1", 4, { idGen: counterIdGen() });
    const id = blocksIn(tl, "Y9-A1")[0]!.id;
    tl = editBlockLessons(tl, id, 6);
    const edited = blocksIn(tl, "Y9-A1")[0];
    expect(edited?.lessonsClaimed).toBe(6);
    expect(edited?.lessonRange).toEqual([0, 6]);
  });

  it("demotes splitType from 'auto' to 'manual' on edit", () => {
    let tl = placeBlock(createDefaultTimeline(), T1a, "Y9-A1", 10, { idGen: counterIdGen() });
    tl = placeBlockWithSpillover(tl, T1b, 5, "Y9-A1", { idGen: counterIdGen() });
    const piece = blocksIn(tl, "Y9-A1").find(
      (b) => b.source.kind === "sub-topic" && b.source.subTopicCode === "T1b"
    )!;
    expect(piece.splitType).toBe("auto");
    tl = editBlockLessons(tl, piece.id, piece.lessonsClaimed + 1);
    const edited = findPlacedBlock(tl, piece.id)?.block;
    expect(edited?.splitType).toBe("manual");
  });

  it("leaves splitType unchanged for non-auto blocks", () => {
    let tl = placeBlock(createDefaultTimeline(), T1a, "Y9-A1", 4, { idGen: counterIdGen() });
    const id = blocksIn(tl, "Y9-A1")[0]!.id;
    tl = editBlockLessons(tl, id, 6);
    expect(blocksIn(tl, "Y9-A1")[0]?.splitType).toBeNull();
  });

  it("is a no-op when newLessons === current count", () => {
    let tl = placeBlock(createDefaultTimeline(), T1a, "Y9-A1", 4, { idGen: counterIdGen() });
    const before = tl;
    const id = blocksIn(tl, "Y9-A1")[0]!.id;
    tl = editBlockLessons(tl, id, 4);
    expect(tl).toBe(before);
  });
});

describe("extractAndMoveLesson (Lesson view drag)", () => {
  it("moves a single edge lesson and shrinks the source block (no split)", () => {
    // Place [0, 4) in Y9-A1. Extract local index 0 → moved [0,1), source [1,4).
    let tl = placeBlock(createDefaultTimeline(), T1a, "Y9-A1", 4, { idGen: counterIdGen() });
    const blockId = blocksIn(tl, "Y9-A1")[0]!.id;
    tl = extractAndMoveLesson(tl, blockId, 0, "Y9-A2", { idGen: counterIdGen() });
    const a1 = blocksIn(tl, "Y9-A1").filter((b) => b.source.kind === "sub-topic");
    const a2 = blocksIn(tl, "Y9-A2").filter((b) => b.source.kind === "sub-topic");
    expect(a1).toHaveLength(1);
    expect(a1[0]?.lessonRange).toEqual([1, 4]);
    expect(a1[0]?.lessonsClaimed).toBe(3);
    expect(a2).toHaveLength(1);
    expect(a2[0]?.lessonRange).toEqual([0, 1]);
    expect(a2[0]?.lessonsClaimed).toBe(1);
    // Both pieces share the same splitFrom (the original's id)
    expect(a1[0]?.splitFrom).toBe(blockId);
    expect(a2[0]?.splitFrom).toBe(blockId);
  });

  it("splits an interior lesson out of the middle into three placements", () => {
    // [0, 5) in Y9-A1. Extract local 2 → A1 becomes [0,2) + [3,5); A2 gets [2,3).
    let tl = placeBlock(createDefaultTimeline(), T1a, "Y9-A1", 5, { idGen: counterIdGen() });
    const blockId = blocksIn(tl, "Y9-A1")[0]!.id;
    tl = extractAndMoveLesson(tl, blockId, 2, "Y9-A2", { idGen: counterIdGen() });
    const a1 = blocksIn(tl, "Y9-A1")
      .filter((b) => b.source.kind === "sub-topic")
      .sort((x, y) => x.lessonRange[0] - y.lessonRange[0]);
    const a2 = blocksIn(tl, "Y9-A2").filter((b) => b.source.kind === "sub-topic");
    expect(a1.map((b) => b.lessonRange)).toEqual([[0, 2], [3, 5]]);
    expect(a2.map((b) => b.lessonRange)).toEqual([[2, 3]]);
    expect(a1.every((b) => b.splitFrom === blockId && b.splitType === "manual")).toBe(true);
    expect(a2[0]?.splitFrom).toBe(blockId);
    expect(a2[0]?.splitType).toBe("manual");
  });

  it("removes the source block entirely when extracting its only lesson", () => {
    let tl = placeBlock(createDefaultTimeline(), T1a, "Y9-A1", 1, { idGen: counterIdGen() });
    const blockId = blocksIn(tl, "Y9-A1")[0]!.id;
    tl = extractAndMoveLesson(tl, blockId, 0, "Y9-A2", { idGen: counterIdGen() });
    expect(blocksIn(tl, "Y9-A1").filter((b) => b.source.kind === "sub-topic")).toHaveLength(0);
    expect(blocksIn(tl, "Y9-A2").filter((b) => b.source.kind === "sub-topic")).toHaveLength(1);
  });

  it("preserves the existing splitFrom chain when extracting from an already-split piece", () => {
    let tl = placeBlock(createDefaultTimeline(), T1a, "Y9-A1", 4, { idGen: counterIdGen() });
    const origId = blocksIn(tl, "Y9-A1")[0]!.id;
    tl = splitBlock(tl, origId, 2, { idGen: counterIdGen() });
    const piecesAfterSplit = blocksIn(tl, "Y9-A1");
    const pieceA = piecesAfterSplit[0]!;
    // pieceA already has splitFrom = origId
    tl = extractAndMoveLesson(tl, pieceA.id, 0, "Y9-A2", { idGen: counterIdGen() });
    const allTouchedBlocks = [
      ...blocksIn(tl, "Y9-A1"),
      ...blocksIn(tl, "Y9-A2"),
    ].filter((b) => b.source.kind === "sub-topic");
    expect(allTouchedBlocks.every((b) => b.splitFrom === origId)).toBe(true);
  });

  it("is a no-op when toTermId equals the source term", () => {
    let tl = placeBlock(createDefaultTimeline(), T1a, "Y9-A1", 1, { idGen: counterIdGen() });
    const before = tl;
    const id = blocksIn(tl, "Y9-A1")[0]!.id;
    tl = extractAndMoveLesson(tl, id, 0, "Y9-A1", { idGen: counterIdGen() });
    expect(tl).toBe(before);
  });

  it("throws on out-of-range localLessonIdx", () => {
    const tl = placeBlock(createDefaultTimeline(), T1a, "Y9-A1", 3, { idGen: counterIdGen() });
    const id = blocksIn(tl, "Y9-A1")[0]!.id;
    expect(() => extractAndMoveLesson(tl, id, -1, "Y9-A2")).toThrow();
    expect(() => extractAndMoveLesson(tl, id, 3, "Y9-A2")).toThrow();
  });

  it("throws on unknown placed block or target term", () => {
    const tl = placeBlock(createDefaultTimeline(), T1a, "Y9-A1", 3, { idGen: counterIdGen() });
    const id = blocksIn(tl, "Y9-A1")[0]!.id;
    expect(() => extractAndMoveLesson(tl, "ghost", 0, "Y9-A2")).toThrow();
    expect(() => extractAndMoveLesson(tl, id, 0, "BAD")).toThrow();
  });
});

describe("prototype scenarios", () => {
  it("auto-split → remove every piece → sub-topic fully unplaced", () => {
    let tl = placeBlock(createDefaultTimeline(), T1a, "Y9-A1", 10, { idGen: counterIdGen() });
    tl = placeBlockWithSpillover(tl, T1b, 5, "Y9-A1", { idGen: counterIdGen() });
    // Collect every T1b piece across the timeline
    const t1bIds = tl.halfTerms.flatMap((ht) =>
      ht.placedBlocks
        .filter((b) => b.source.kind === "sub-topic" && b.source.subTopicCode === "T1b")
        .map((b) => b.id)
    );
    expect(t1bIds.length).toBeGreaterThan(1);
    for (const id of t1bIds) tl = removeBlock(tl, id);
    const stillPlaced = tl.halfTerms.flatMap((ht) =>
      ht.placedBlocks.filter((b) => b.source.kind === "sub-topic" && b.source.subTopicCode === "T1b")
    );
    expect(stillPlaced).toHaveLength(0);
  });

  it("same-cell split → re-merges into one block (DEC-046)", () => {
    // splitBlock + adjacency in same cell → consolidator merges back.
    // Removing a piece (when there's only one piece left) is the
    // single-block-removal case, so the cell ends up empty.
    let tl = placeBlock(createDefaultTimeline(), T1a, "Y9-A1", 6, { idGen: counterIdGen() });
    const origId = blocksIn(tl, "Y9-A1")[0]!.id;
    tl = splitBlock(tl, origId, 2, { idGen: counterIdGen() });
    expect(blocksIn(tl, "Y9-A1")).toHaveLength(1);
    const onlyPieceId = blocksIn(tl, "Y9-A1")[0]!.id;
    tl = removeBlock(tl, onlyPieceId);
    expect(blocksIn(tl, "Y9-A1")).toHaveLength(0);
  });

  it("edited auto → demoted (post-edit, recombine still works via splitFrom)", () => {
    let tl = placeBlock(createDefaultTimeline(), T1a, "Y9-A1", 10, { idGen: counterIdGen() });
    tl = placeBlockWithSpillover(tl, T1b, 5, "Y9-A1", { idGen: counterIdGen() });
    const piece = blocksIn(tl, "Y9-A1").find(
      (b) => b.source.kind === "sub-topic" && b.source.subTopicCode === "T1b"
    )!;
    tl = editBlockLessons(tl, piece.id, piece.lessonsClaimed + 2);
    const edited = findPlacedBlock(tl, piece.id)?.block;
    expect(edited?.splitType).toBe("manual");
    // recombineBlock still works on splitFrom even if one piece is now manual
    tl = recombineBlock(tl, piece.id);
    const remainingT1b = tl.halfTerms.flatMap((ht) =>
      ht.placedBlocks.filter((b) => b.source.kind === "sub-topic" && b.source.subTopicCode === "T1b")
    );
    expect(remainingT1b).toHaveLength(0);
  });

  it("round-trip: place + spillover + recombine leaves the timeline back to baseline", () => {
    const baseline = placeBlock(createDefaultTimeline(), T1a, "Y9-A1", 10, { idGen: counterIdGen() });
    let tl = placeBlockWithSpillover(baseline, T1b, 5, "Y9-A1", { idGen: counterIdGen() });
    const piece = blocksIn(tl, "Y9-A1").find(
      (b) => b.source.kind === "sub-topic" && b.source.subTopicCode === "T1b"
    )!;
    tl = recombineBlock(tl, piece.id);
    // Every half-term's used-count matches the baseline
    for (const ht of baseline.halfTerms) {
      const baseUsed = halfTermUsed(ht);
      const after = tl.halfTerms.find((h) => h.id === ht.id)!;
      expect(halfTermUsed(after)).toBe(baseUsed);
    }
  });
});

describe("cell consolidation (DEC-046)", () => {
  function injectUnconsolidated(tl: Timeline): Timeline {
    // Hand-roll the "unconsolidated" state that legacy `.curriculum` files
    // can contain after many drag operations. Exercises consolidateTimeline
    // directly rather than relying on a mutator side-effect.
    return {
      halfTerms: tl.halfTerms.map((ht) => {
        if (ht.id !== "Y9-A1") return ht;
        return {
          ...ht,
          placedBlocks: [
            {
              id: "first",
              source: T1a,
              lessonsClaimed: 2,
              lessonRange: [0, 2],
              splitFrom: null,
              splitType: null,
              userEdits: {},
            },
            {
              id: "second",
              source: T1a,
              lessonsClaimed: 2,
              lessonRange: [2, 4],
              splitFrom: null,
              splitType: null,
              userEdits: {},
            },
          ],
        };
      }),
    };
  }

  it("merges two adjacent placements of the same sub-topic in one cell", () => {
    const messy = injectUnconsolidated(createDefaultTimeline());
    const tl = consolidateTimeline(messy);
    const placed = blocksIn(tl, "Y9-A1");
    expect(placed).toHaveLength(1);
    expect(placed[0]?.lessonRange).toEqual([0, 4]);
    expect(placed[0]?.lessonsClaimed).toBe(4);
  });

  it("does NOT merge when ranges have a gap (non-adjacent)", () => {
    const tl: Timeline = {
      halfTerms: createDefaultTimeline().halfTerms.map((ht) => {
        if (ht.id !== "Y9-A1") return ht;
        return {
          ...ht,
          placedBlocks: [
            {
              id: "first",
              source: T1a,
              lessonsClaimed: 2,
              lessonRange: [0, 2],
              splitFrom: null,
              splitType: null,
              userEdits: {},
            },
            {
              id: "second",
              source: T1a,
              lessonsClaimed: 2,
              lessonRange: [3, 5],
              splitFrom: null,
              splitType: null,
              userEdits: {},
            },
          ],
        };
      }),
    };
    const out = consolidateTimeline(tl);
    expect(blocksIn(out, "Y9-A1")).toHaveLength(2);
  });

  it("does NOT merge across different sub-topics", () => {
    let tl = placeBlock(createDefaultTimeline(), T1a, "Y9-A1", 2, { idGen: counterIdGen() });
    tl = placeBlock(tl, T1b, "Y9-A1", 2, { idGen: counterIdGen() });
    const placed = blocksIn(tl, "Y9-A1");
    expect(placed).toHaveLength(2);
  });

  it("only merges with the IMMEDIATELY-previous block (DEC-051)", () => {
    // [T1a piece 1, T1b, T1a piece 2] must NOT collapse to [T1a-merged, T1b]
    // even though both T1a pieces share a code and their lessonRanges are
    // adjacent. Reverting that layout silently was the cause of the
    // "lesson snaps back to origin when dropping between cross-sub-topic
    // lessons in the same cell" bug.
    const tl: Timeline = {
      halfTerms: createDefaultTimeline().halfTerms.map((ht) => {
        if (ht.id !== "Y9-A1") return ht;
        return {
          ...ht,
          placedBlocks: [
            {
              id: "t1a-1",
              source: T1a,
              lessonsClaimed: 1,
              lessonRange: [0, 1],
              splitFrom: null,
              splitType: null,
              userEdits: {},
            },
            {
              id: "t1b",
              source: T1b,
              lessonsClaimed: 1,
              lessonRange: [0, 1],
              splitFrom: null,
              splitType: null,
              userEdits: {},
            },
            {
              id: "t1a-2",
              source: T1a,
              lessonsClaimed: 1,
              lessonRange: [1, 2],
              splitFrom: null,
              splitType: null,
              userEdits: {},
            },
          ],
        };
      }),
    };
    const out = consolidateTimeline(tl);
    const placed = blocksIn(out, "Y9-A1");
    expect(placed).toHaveLength(3);
    // Order is preserved.
    expect(placed[0]?.id).toBe("t1a-1");
    expect(placed[1]?.id).toBe("t1b");
    expect(placed[2]?.id).toBe("t1a-2");
  });

  it("preserves splitFrom through a merge so recombine still wipes both pieces", () => {
    let tl = placeBlock(createDefaultTimeline(), T1a, "Y9-A1", 4, { idGen: counterIdGen() });
    const origId = blocksIn(tl, "Y9-A1")[0]!.id;
    tl = splitBlock(tl, origId, 2, { idGen: counterIdGen() });
    const merged = blocksIn(tl, "Y9-A1");
    expect(merged).toHaveLength(1);
    expect(merged[0]?.splitFrom).not.toBeNull(); // recombine can still find it
    tl = recombineBlock(tl, merged[0]!.id);
    expect(blocksIn(tl, "Y9-A1")).toHaveLength(0);
  });
});

describe("index-aware drops (DEC-048)", () => {
  const T1c: PlacedBlockSource = { kind: "sub-topic", subTopicCode: "T1c" };

  it("placeBlockAtIndex inserts at the given index, not the end", () => {
    const ids = counterIdGen();
    let tl = placeBlock(createDefaultTimeline(), T1a, "Y9-A1", 1, { idGen: ids });
    tl = placeBlock(tl, T1b, "Y9-A1", 1, { idGen: ids });
    tl = placeBlockAtIndex(tl, T1c, "Y9-A1", 1, 1, { idGen: ids });
    const placed = blocksIn(tl, "Y9-A1");
    expect(placed.map((b) =>
      b.source.kind === "sub-topic" ? b.source.subTopicCode : "?"
    )).toEqual(["T1a", "T1c", "T1b"]);
  });

  it("placeBlockAtIndex clamps an out-of-range index to the end", () => {
    const ids = counterIdGen();
    let tl = placeBlock(createDefaultTimeline(), T1a, "Y9-A1", 1, { idGen: ids });
    tl = placeBlockAtIndex(tl, T1b, "Y9-A1", 1, 999, { idGen: ids });
    expect(blocksIn(tl, "Y9-A1").map((b) =>
      b.source.kind === "sub-topic" ? b.source.subTopicCode : "?"
    )).toEqual(["T1a", "T1b"]);
  });

  it("moveBlockToIndex within the same cell reorders blocks", () => {
    const ids = counterIdGen();
    let tl = placeBlock(createDefaultTimeline(), T1a, "Y9-A1", 1, { idGen: ids });
    tl = placeBlock(tl, T1b, "Y9-A1", 1, { idGen: ids });
    tl = placeBlock(tl, T1c, "Y9-A1", 1, { idGen: ids });
    const t1bId = blocksIn(tl, "Y9-A1")[1]!.id;
    tl = moveBlockToIndex(tl, t1bId, "Y9-A1", 0);
    expect(blocksIn(tl, "Y9-A1").map((b) =>
      b.source.kind === "sub-topic" ? b.source.subTopicCode : "?"
    )).toEqual(["T1b", "T1a", "T1c"]);
  });

  it("moveBlockToIndex across cells inserts at the destination index", () => {
    const ids = counterIdGen();
    let tl = placeBlock(createDefaultTimeline(), T1a, "Y9-A1", 1, { idGen: ids });
    tl = placeBlock(tl, T1b, "Y9-A2", 1, { idGen: ids });
    tl = placeBlock(tl, T1c, "Y9-A2", 1, { idGen: ids });
    const t1aId = blocksIn(tl, "Y9-A1")[0]!.id;
    tl = moveBlockToIndex(tl, t1aId, "Y9-A2", 1);
    expect(blocksIn(tl, "Y9-A1")).toHaveLength(0);
    expect(blocksIn(tl, "Y9-A2").map((b) =>
      b.source.kind === "sub-topic" ? b.source.subTopicCode : "?"
    )).toEqual(["T1b", "T1a", "T1c"]);
  });

  it("extractAndMoveLessonToIndex preserves the destination index", () => {
    const ids = counterIdGen();
    let tl = placeBlock(createDefaultTimeline(), T1a, "Y9-A1", 4, { idGen: ids });
    tl = placeBlock(tl, T1b, "Y9-A2", 1, { idGen: ids });
    tl = placeBlock(tl, T1c, "Y9-A2", 1, { idGen: ids });
    const t1aId = blocksIn(tl, "Y9-A1")[0]!.id;
    // Extract the 2nd lesson (localIdx 1) of T1a and drop at slot 1 of Y9-A2.
    tl = extractAndMoveLessonToIndex(tl, t1aId, 1, "Y9-A2", 1, { idGen: ids });
    const blocks = blocksIn(tl, "Y9-A2");
    expect(blocks.map((b) =>
      b.source.kind === "sub-topic" ? b.source.subTopicCode : "?"
    )).toEqual(["T1b", "T1a", "T1c"]);
    // The inserted T1a piece has lessonRange [1, 2).
    expect(blocks[1]?.lessonRange).toEqual([1, 2]);
  });

  it("moveBlockToIndex consolidates with same-source neighbours after insertion", () => {
    // Place T1a in A1, plus a second T1a block in A2. Move A1's block into
    // A2 at index 0 — both should merge if their lessonRanges are adjacent.
    let tl = placeBlock(createDefaultTimeline(), T1a, "Y9-A1", 0, { idGen: counterIdGen() });
    // Re-use the public API to inject two adjacent T1a pieces in A2.
    tl = removeBlock(tl, blocksIn(tl, "Y9-A1")[0]!.id);
    tl = placeBlock(tl, T1a, "Y9-A2", 2, { idGen: counterIdGen() });
    // A second T1a piece in A1 covering [2, 4) (adjacent to the A2 piece).
    tl = {
      halfTerms: tl.halfTerms.map((ht) => {
        if (ht.id !== "Y9-A1") return ht;
        return {
          ...ht,
          placedBlocks: [
            {
              id: "extra",
              source: T1a,
              lessonsClaimed: 2,
              lessonRange: [2, 4],
              splitFrom: null,
              splitType: null,
              userEdits: {},
            },
          ],
        };
      }),
    };
    tl = moveBlockToIndex(tl, "extra", "Y9-A2", 1);
    const merged = blocksIn(tl, "Y9-A2");
    expect(merged).toHaveLength(1);
    expect(merged[0]?.lessonRange).toEqual([0, 4]);
  });
});

describe("lesson-pool placement (DEC-049)", () => {
  it("placeLessonAtIndex creates a single-lesson block at the chosen lesson", () => {
    const ids = counterIdGen();
    const tl = placeLessonAtIndex(createDefaultTimeline(), "T1a", 2, "Y9-A1", 0, {
      idGen: ids,
    });
    const placed = blocksIn(tl, "Y9-A1");
    expect(placed).toHaveLength(1);
    expect(placed[0]?.lessonRange).toEqual([2, 3]);
    expect(placed[0]?.lessonsClaimed).toBe(1);
  });

  it("placeLessonAtIndex consolidates with an adjacent same-sub-topic block", () => {
    const ids = counterIdGen();
    // Place T1a lessons 0-1 in the cell.
    let tl = placeBlock(createDefaultTimeline(), T1a, "Y9-A1", 2, { idGen: ids });
    // Now drop T1a lesson 2 (absolute) into the same cell — should merge
    // into a single [0, 3) block since [0, 2) + [2, 3) are adjacent.
    tl = placeLessonAtIndex(tl, "T1a", 2, "Y9-A1", 1, { idGen: ids });
    const placed = blocksIn(tl, "Y9-A1");
    expect(placed).toHaveLength(1);
    expect(placed[0]?.lessonRange).toEqual([0, 3]);
  });

  it("removePlacedLesson shrinks a single-lesson block to nothing", () => {
    const ids = counterIdGen();
    let tl = placeLessonAtIndex(createDefaultTimeline(), "T1a", 0, "Y9-A1", 0, {
      idGen: ids,
    });
    const id = blocksIn(tl, "Y9-A1")[0]!.id;
    tl = removePlacedLesson(tl, id, 0);
    expect(blocksIn(tl, "Y9-A1")).toHaveLength(0);
  });

  it("removePlacedLesson removing a middle lesson splits the block into two halves", () => {
    const ids = counterIdGen();
    let tl = placeBlock(createDefaultTimeline(), T1a, "Y9-A1", 5, { idGen: ids });
    // Place block has lessonRange [0, 5). Remove the lesson at localIdx 2
    // (absolute lesson 2). Result: [0, 2) and [3, 5).
    const id = blocksIn(tl, "Y9-A1")[0]!.id;
    tl = removePlacedLesson(tl, id, 2, { idGen: ids });
    const placed = blocksIn(tl, "Y9-A1");
    expect(placed).toHaveLength(2);
    expect(placed[0]?.lessonRange).toEqual([0, 2]);
    expect(placed[1]?.lessonRange).toEqual([3, 5]);
  });
});
