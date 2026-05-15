import { describe, expect, it } from "vitest";

import {
  editBlockLessons,
  findPlacedBlock,
  moveBlock,
  placeBlock,
  placeBlockWithSpillover,
  recombineBlock,
  removeBlock,
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
  it("divides a placed block into two pieces with non-overlapping ranges", () => {
    let tl = placeBlock(createDefaultTimeline(), T1a, "Y9-A1", 4, { idGen: counterIdGen() });
    const blockId = blocksIn(tl, "Y9-A1")[0]!.id;
    tl = splitBlock(tl, blockId, 1, { idGen: counterIdGen() });
    const placed = blocksIn(tl, "Y9-A1");
    expect(placed).toHaveLength(2);
    expect(placed[0]?.lessonRange).toEqual([0, 1]);
    expect(placed[0]?.lessonsClaimed).toBe(1);
    expect(placed[1]?.lessonRange).toEqual([1, 4]);
    expect(placed[1]?.lessonsClaimed).toBe(3);
    expect(placed[0]?.splitType).toBe("manual");
    expect(placed[1]?.splitType).toBe("manual");
  });

  it("uses the block's own id as splitFrom for the first split, then preserves chain", () => {
    let tl = placeBlock(createDefaultTimeline(), T1a, "Y9-A1", 6, { idGen: counterIdGen() });
    const origId = blocksIn(tl, "Y9-A1")[0]!.id;
    tl = splitBlock(tl, origId, 3, { idGen: counterIdGen() });
    const afterFirst = blocksIn(tl, "Y9-A1");
    expect(afterFirst[0]?.splitFrom).toBe(origId);
    expect(afterFirst[1]?.splitFrom).toBe(origId);

    // Split one of the pieces again
    const piece1Id = afterFirst[0]!.id;
    tl = splitBlock(tl, piece1Id, 1, { idGen: counterIdGen() });
    const placed = blocksIn(tl, "Y9-A1");
    expect(placed.every((b) => b.splitFrom === origId)).toBe(true);
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

  it("manual split → pieces persist (no implicit recombine)", () => {
    let tl = placeBlock(createDefaultTimeline(), T1a, "Y9-A1", 6, { idGen: counterIdGen() });
    const origId = blocksIn(tl, "Y9-A1")[0]!.id;
    tl = splitBlock(tl, origId, 2, { idGen: counterIdGen() });
    expect(blocksIn(tl, "Y9-A1")).toHaveLength(2);
    // Remove one piece — the other persists, no auto-recombine into the original
    const firstPieceId = blocksIn(tl, "Y9-A1")[0]!.id;
    tl = removeBlock(tl, firstPieceId);
    const remaining = blocksIn(tl, "Y9-A1");
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.splitType).toBe("manual");
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
