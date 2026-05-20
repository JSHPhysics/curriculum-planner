import type {
  HalfTerm,
  PlacedBlock,
  PlacedBlockSource,
  Timeline,
} from "./types";
import { halfTermRoom } from "./timeline";

export interface PlacementOptions {
  readonly idGen?: () => string;
}

export interface FoundBlock {
  readonly block: PlacedBlock;
  readonly termId: string;
  readonly termIndex: number;
  readonly indexInTerm: number;
}

export function findPlacedBlock(
  timeline: Timeline,
  placedBlockId: string
): FoundBlock | null {
  for (let i = 0; i < timeline.halfTerms.length; i++) {
    const ht = timeline.halfTerms[i];
    if (!ht) continue;
    const idx = ht.placedBlocks.findIndex((b) => b.id === placedBlockId);
    if (idx >= 0) {
      const block = ht.placedBlocks[idx];
      if (!block) continue;
      return { block, termId: ht.id, termIndex: i, indexInTerm: idx };
    }
  }
  return null;
}

export function placeBlock(
  timeline: Timeline,
  source: PlacedBlockSource,
  termId: string,
  lessonsClaimed: number,
  options: PlacementOptions = {}
): Timeline {
  if (lessonsClaimed < 0) {
    throw new Error(`placeBlock: lessonsClaimed must be >= 0 (got ${lessonsClaimed})`);
  }
  const idGen = options.idGen ?? defaultIdGen;
  const block: PlacedBlock = {
    id: idGen(),
    source,
    lessonsClaimed,
    lessonRange: [0, lessonsClaimed],
    splitFrom: null,
    splitType: null,
    userEdits: {},
  };
  return consolidate(appendToTerm(timeline, termId, block));
}

export function placeBlockWithSpillover(
  timeline: Timeline,
  source: PlacedBlockSource,
  lessonsClaimed: number,
  termId: string,
  options: PlacementOptions = {}
): Timeline {
  if (lessonsClaimed < 0) {
    throw new Error(
      `placeBlockWithSpillover: lessonsClaimed must be >= 0 (got ${lessonsClaimed})`
    );
  }
  if (lessonsClaimed === 0) {
    return placeBlock(timeline, source, termId, 0, options);
  }
  const idGen = options.idGen ?? defaultIdGen;
  const startIdx = timeline.halfTerms.findIndex((ht) => ht.id === termId);
  if (startIdx === -1) {
    throw new Error(`placeBlockWithSpillover: unknown term "${termId}"`);
  }

  const distribution = computeDistribution(timeline, startIdx, lessonsClaimed);

  if (distribution.length === 1) {
    const first = distribution[0];
    if (!first) {
      throw new Error("placeBlockWithSpillover: empty distribution (unreachable)");
    }
    return placeBlock(timeline, source, first.termId, first.lessons, options);
  }

  const splitFrom = idGen();
  let cursor = 0;
  const pieces: { termId: string; block: PlacedBlock }[] = [];
  for (const part of distribution) {
    const block: PlacedBlock = {
      id: idGen(),
      source,
      lessonsClaimed: part.lessons,
      lessonRange: [cursor, cursor + part.lessons],
      splitFrom,
      splitType: "auto",
      userEdits: {},
    };
    cursor += part.lessons;
    pieces.push({ termId: part.termId, block });
  }
  return consolidate(
    pieces.reduce(
      (tl, p) => appendToTerm(tl, p.termId, p.block),
      timeline
    )
  );
}

interface DistributionPart {
  readonly termId: string;
  readonly lessons: number;
}

function computeDistribution(
  timeline: Timeline,
  startIdx: number,
  total: number
): DistributionPart[] {
  const distribution: DistributionPart[] = [];
  let remaining = total;
  for (
    let i = startIdx;
    i < timeline.halfTerms.length && remaining > 0;
    i++
  ) {
    const ht = timeline.halfTerms[i];
    if (!ht) continue;
    const room = halfTermRoom(ht);
    if (room === 0) continue;
    const take = Math.min(room, remaining);
    distribution.push({ termId: ht.id, lessons: take });
    remaining -= take;
  }
  if (remaining > 0) {
    const last = distribution[distribution.length - 1];
    if (last) {
      distribution[distribution.length - 1] = {
        termId: last.termId,
        lessons: last.lessons + remaining,
      };
    } else {
      const startTerm = timeline.halfTerms[startIdx];
      if (!startTerm) {
        throw new Error("computeDistribution: invalid startIdx (unreachable)");
      }
      distribution.push({ termId: startTerm.id, lessons: remaining });
    }
  }
  return distribution;
}

export function splitBlock(
  timeline: Timeline,
  placedBlockId: string,
  atLessonIdx: number,
  options: PlacementOptions = {}
): Timeline {
  const found = findPlacedBlock(timeline, placedBlockId);
  if (!found) {
    throw new Error(`splitBlock: no placed block with id "${placedBlockId}"`);
  }
  const { block } = found;
  if (atLessonIdx < 1 || atLessonIdx >= block.lessonsClaimed) {
    throw new Error(
      `splitBlock: atLessonIdx must be between 1 and lessonsClaimed-1 ` +
        `(got ${atLessonIdx}, lessonsClaimed=${block.lessonsClaimed})`
    );
  }
  const idGen = options.idGen ?? defaultIdGen;
  const splitFrom = block.splitFrom ?? block.id;
  const [start, end] = block.lessonRange;
  const mid = start + atLessonIdx;

  const piece1: PlacedBlock = {
    ...block,
    id: idGen(),
    lessonsClaimed: atLessonIdx,
    lessonRange: [start, mid],
    splitFrom,
    splitType: "manual",
  };
  const piece2: PlacedBlock = {
    ...block,
    id: idGen(),
    lessonsClaimed: block.lessonsClaimed - atLessonIdx,
    lessonRange: [mid, end],
    splitFrom,
    splitType: "manual",
  };
  return consolidate(replaceInTerm(timeline, found.termId, placedBlockId, [piece1, piece2]));
}

export function recombineBlock(
  timeline: Timeline,
  placedBlockId: string
): Timeline {
  const found = findPlacedBlock(timeline, placedBlockId);
  if (!found) {
    throw new Error(
      `recombineBlock: no placed block with id "${placedBlockId}"`
    );
  }
  const groupKey = found.block.splitFrom;
  if (!groupKey) {
    throw new Error(
      `recombineBlock: block "${placedBlockId}" has no splitFrom — nothing to recombine`
    );
  }
  return consolidate({
    halfTerms: timeline.halfTerms.map(
      (ht): HalfTerm => ({
        ...ht,
        placedBlocks: ht.placedBlocks.filter((b) => b.splitFrom !== groupKey),
      })
    ),
  });
}

export function removeBlock(
  timeline: Timeline,
  placedBlockId: string
): Timeline {
  const found = findPlacedBlock(timeline, placedBlockId);
  if (!found) return timeline;
  return consolidate({
    halfTerms: timeline.halfTerms.map((ht): HalfTerm => {
      if (ht.id !== found.termId) return ht;
      return {
        ...ht,
        placedBlocks: ht.placedBlocks.filter((b) => b.id !== placedBlockId),
      };
    }),
  });
}

export function moveBlock(
  timeline: Timeline,
  placedBlockId: string,
  toTermId: string
): Timeline {
  const found = findPlacedBlock(timeline, placedBlockId);
  if (!found) {
    throw new Error(`moveBlock: no placed block with id "${placedBlockId}"`);
  }
  if (found.termId === toTermId) return timeline;
  if (!timeline.halfTerms.some((ht) => ht.id === toTermId)) {
    throw new Error(`moveBlock: unknown term "${toTermId}"`);
  }
  const removed = removeBlock(timeline, placedBlockId);
  return consolidate(appendToTerm(removed, toTermId, found.block));
}

/**
 * Move + insert at a specific index. Replaces moveBlock-then-reorder for the
 * "drop between two existing items" interaction (DEC-048). atIndex is into
 * the destination cell's placedBlocks AFTER removal of the moving block.
 *
 * Same-term moves: re-orders within the cell.
 * Cross-term moves: removes from source, inserts at the destination index.
 */
export function moveBlockToIndex(
  timeline: Timeline,
  placedBlockId: string,
  toTermId: string,
  atIndex: number
): Timeline {
  const found = findPlacedBlock(timeline, placedBlockId);
  if (!found) {
    throw new Error(`moveBlockToIndex: no placed block with id "${placedBlockId}"`);
  }
  if (!timeline.halfTerms.some((ht) => ht.id === toTermId)) {
    throw new Error(`moveBlockToIndex: unknown term "${toTermId}"`);
  }
  // Remove from source first (atIndex is relative to the post-remove state).
  const removed = removeBlockUnconsolidated(timeline, placedBlockId);
  return consolidate(insertIntoTermAt(removed, toTermId, found.block, atIndex));
}

/**
 * Place a new block into a specific index in the term. Same as `placeBlock`
 * but lets the caller control the position within the cell.
 */
export function placeBlockAtIndex(
  timeline: Timeline,
  source: PlacedBlockSource,
  termId: string,
  lessonsClaimed: number,
  atIndex: number,
  options: PlacementOptions = {}
): Timeline {
  if (lessonsClaimed < 0) {
    throw new Error(
      `placeBlockAtIndex: lessonsClaimed must be >= 0 (got ${lessonsClaimed})`
    );
  }
  const idGen = options.idGen ?? defaultIdGen;
  const block: PlacedBlock = {
    id: idGen(),
    source,
    lessonsClaimed,
    lessonRange: [0, lessonsClaimed],
    splitFrom: null,
    splitType: null,
    userEdits: {},
  };
  return consolidate(insertIntoTermAt(timeline, termId, block, atIndex));
}

/**
 * Remove without re-consolidating — internal helper for compound ops that
 * will run consolidate themselves at the end. Avoids two passes when callers
 * remove and immediately re-insert.
 */
function removeBlockUnconsolidated(
  timeline: Timeline,
  placedBlockId: string
): Timeline {
  const found = findPlacedBlock(timeline, placedBlockId);
  if (!found) return timeline;
  return {
    halfTerms: timeline.halfTerms.map((ht): HalfTerm => {
      if (ht.id !== found.termId) return ht;
      return {
        ...ht,
        placedBlocks: ht.placedBlocks.filter((b) => b.id !== placedBlockId),
      };
    }),
  };
}

/**
 * Pluck a single lesson out of a placed block and move it to a different
 * half-term. The source block is shrunk or split as needed:
 *   - lesson at the start → source becomes [start+1, end)
 *   - lesson at the end   → source becomes [start, end-1)
 *   - lesson in the middle → source splits into [start, lessonPos) + [lessonPos+1, end)
 *   - lesson was the only one → source is removed entirely
 * The pulled-out lesson becomes a new PlacedBlock with `splitType: "manual"`
 * and the same splitFrom group as the source (so a later recombine still
 * picks up every piece).
 *
 * `localLessonIdx` is 0-indexed within the source block's lessonRange:
 *   block.lessonRange = [3, 7)  → localLessonIdx 0 = lesson position 3
 *                                  localLessonIdx 1 = lesson position 4
 *                                  …
 */
export function extractAndMoveLesson(
  timeline: Timeline,
  placedBlockId: string,
  localLessonIdx: number,
  toTermId: string,
  options: PlacementOptions = {}
): Timeline {
  const found = findPlacedBlock(timeline, placedBlockId);
  if (!found) {
    throw new Error(
      `extractAndMoveLesson: no placed block with id "${placedBlockId}"`
    );
  }
  const { block } = found;
  if (localLessonIdx < 0 || localLessonIdx >= block.lessonsClaimed) {
    throw new Error(
      `extractAndMoveLesson: localLessonIdx ${localLessonIdx} out of range ` +
        `[0, ${block.lessonsClaimed})`
    );
  }
  if (!timeline.halfTerms.some((ht) => ht.id === toTermId)) {
    throw new Error(`extractAndMoveLesson: unknown term "${toTermId}"`);
  }
  // No-op: lesson dragged back to its own term and the block has a single
  // lesson (so the operation would split and immediately rejoin to nothing).
  if (found.termId === toTermId) return timeline;

  const idGen = options.idGen ?? defaultIdGen;
  const [start, end] = block.lessonRange;
  const lessonPos = start + localLessonIdx;
  const groupKey = block.splitFrom ?? block.id;

  const replacement: PlacedBlock[] = [];
  if (lessonPos > start) {
    replacement.push({
      ...block,
      id: idGen(),
      lessonsClaimed: lessonPos - start,
      lessonRange: [start, lessonPos],
      splitFrom: groupKey,
      splitType: "manual",
    });
  }
  if (lessonPos + 1 < end) {
    replacement.push({
      ...block,
      id: idGen(),
      lessonsClaimed: end - (lessonPos + 1),
      lessonRange: [lessonPos + 1, end],
      splitFrom: groupKey,
      splitType: "manual",
    });
  }

  const movedPiece: PlacedBlock = {
    ...block,
    id: idGen(),
    lessonsClaimed: 1,
    lessonRange: [lessonPos, lessonPos + 1],
    splitFrom: groupKey,
    splitType: "manual",
  };

  let tl = replaceInTerm(timeline, found.termId, placedBlockId, replacement);
  tl = appendToTerm(tl, toTermId, movedPiece);
  return consolidate(tl);
}

/**
 * Variant of extractAndMoveLesson that inserts at a specific index in the
 * destination cell (DEC-048). `atIndex === -1` appends.
 */
export function extractAndMoveLessonToIndex(
  timeline: Timeline,
  placedBlockId: string,
  localLessonIdx: number,
  toTermId: string,
  atIndex: number,
  options: PlacementOptions = {}
): Timeline {
  const found = findPlacedBlock(timeline, placedBlockId);
  if (!found) {
    throw new Error(
      `extractAndMoveLessonToIndex: no placed block with id "${placedBlockId}"`
    );
  }
  const { block } = found;
  if (localLessonIdx < 0 || localLessonIdx >= block.lessonsClaimed) {
    throw new Error(
      `extractAndMoveLessonToIndex: localLessonIdx ${localLessonIdx} out of range ` +
        `[0, ${block.lessonsClaimed})`
    );
  }
  if (!timeline.halfTerms.some((ht) => ht.id === toTermId)) {
    throw new Error(`extractAndMoveLessonToIndex: unknown term "${toTermId}"`);
  }
  if (found.termId === toTermId) {
    // Same-cell: same source means it'll re-consolidate with the remaining
    // pieces, so the index is effectively about positioning the surviving
    // (merged) block. Skip: handled by the same-cell no-op path below.
    return timeline;
  }

  const idGen = options.idGen ?? defaultIdGen;
  const [start, end] = block.lessonRange;
  const lessonPos = start + localLessonIdx;
  const groupKey = block.splitFrom ?? block.id;

  const replacement: PlacedBlock[] = [];
  if (lessonPos > start) {
    replacement.push({
      ...block,
      id: idGen(),
      lessonsClaimed: lessonPos - start,
      lessonRange: [start, lessonPos],
      splitFrom: groupKey,
      splitType: "manual",
    });
  }
  if (lessonPos + 1 < end) {
    replacement.push({
      ...block,
      id: idGen(),
      lessonsClaimed: end - (lessonPos + 1),
      lessonRange: [lessonPos + 1, end],
      splitFrom: groupKey,
      splitType: "manual",
    });
  }

  const movedPiece: PlacedBlock = {
    ...block,
    id: idGen(),
    lessonsClaimed: 1,
    lessonRange: [lessonPos, lessonPos + 1],
    splitFrom: groupKey,
    splitType: "manual",
  };

  let tl = replaceInTerm(timeline, found.termId, placedBlockId, replacement);
  tl = insertIntoTermAt(tl, toTermId, movedPiece, atIndex);
  return consolidate(tl);
}

export function editBlockLessons(
  timeline: Timeline,
  placedBlockId: string,
  newLessons: number
): Timeline {
  if (newLessons < 0) {
    throw new Error(
      `editBlockLessons: newLessons must be >= 0 (got ${newLessons})`
    );
  }
  const found = findPlacedBlock(timeline, placedBlockId);
  if (!found) {
    throw new Error(
      `editBlockLessons: no placed block with id "${placedBlockId}"`
    );
  }
  const { block } = found;
  if (block.lessonsClaimed === newLessons) return timeline;
  const [start] = block.lessonRange;
  const edited: PlacedBlock = {
    ...block,
    lessonsClaimed: newLessons,
    lessonRange: [start, start + newLessons],
    splitType: block.splitType === "auto" ? "manual" : block.splitType,
  };
  return consolidate(replaceInTerm(timeline, found.termId, placedBlockId, [edited]));
}

function appendToTerm(
  timeline: Timeline,
  termId: string,
  block: PlacedBlock
): Timeline {
  return insertIntoTermAt(timeline, termId, block, -1);
}

/**
 * Insert a block into a term at a specific index. `atIndex === -1` means
 * "append to end". Out-of-range indices clamp to [0, length]. Underpins all
 * "drop between items" interactions (DEC-048).
 */
function insertIntoTermAt(
  timeline: Timeline,
  termId: string,
  block: PlacedBlock,
  atIndex: number
): Timeline {
  if (!timeline.halfTerms.some((ht) => ht.id === termId)) {
    throw new Error(`unknown term "${termId}"`);
  }
  return {
    halfTerms: timeline.halfTerms.map((ht): HalfTerm => {
      if (ht.id !== termId) return ht;
      const blocks = [...ht.placedBlocks];
      const clamped =
        atIndex < 0 || atIndex > blocks.length
          ? blocks.length
          : atIndex;
      blocks.splice(clamped, 0, block);
      return { ...ht, placedBlocks: blocks };
    }),
  };
}

function replaceInTerm(
  timeline: Timeline,
  termId: string,
  blockId: string,
  replacement: readonly PlacedBlock[]
): Timeline {
  return {
    halfTerms: timeline.halfTerms.map((ht): HalfTerm => {
      if (ht.id !== termId) return ht;
      const next: PlacedBlock[] = [];
      for (const b of ht.placedBlocks) {
        if (b.id === blockId) {
          for (const r of replacement) next.push(r);
        } else {
          next.push(b);
        }
      }
      return { ...ht, placedBlocks: next };
    }),
  };
}

function defaultIdGen(): string {
  return crypto.randomUUID();
}

// ============================================================
// Cell consolidation (DEC-046)
//
// Invariant we maintain after every mutation: within a half-term, no two
// sub-topic placements of the same code with adjacent lessonRanges exist as
// separate blocks. Lessons of the same sub-topic that end up in one cell are
// rendered as ONE merged block, regardless of how many drag operations
// produced them. This eliminates the "every moved lesson is its own split"
// noise the user reported. The merge is conservative — non-adjacent ranges
// (gaps in the lesson sequence) stay as separate blocks because merging them
// would silently include lessons the user didn't place.
//
// We don't dedup custom-block placements: two of the same custom block in one
// cell is unusual but if a user does it on purpose, we leave the data alone.
// ============================================================

function consolidateCell(ht: HalfTerm): HalfTerm {
  const merged: PlacedBlock[] = [];
  for (const block of ht.placedBlocks) {
    if (block.source.kind !== "sub-topic") {
      merged.push(block);
      continue;
    }
    const code = block.source.subTopicCode;
    const matchIdx = merged.findIndex((b) => {
      if (b.source.kind !== "sub-topic" || b.source.subTopicCode !== code) {
        return false;
      }
      // Adjacent only — either block sits immediately before or after `b`.
      const [aStart, aEnd] = b.lessonRange;
      const [nStart, nEnd] = block.lessonRange;
      return aEnd === nStart || aStart === nEnd;
    });
    if (matchIdx < 0) {
      merged.push(block);
      continue;
    }
    const existing = merged[matchIdx]!;
    const newStart = Math.min(existing.lessonRange[0], block.lessonRange[0]);
    const newEnd = Math.max(existing.lessonRange[1], block.lessonRange[1]);
    merged[matchIdx] = {
      ...existing,
      lessonsClaimed: newEnd - newStart,
      lessonRange: [newStart, newEnd],
      // After a merge the surviving block is the "canonical" piece for this
      // cell. We drop the splitType badge — the user wants visual cleanliness
      // and the badge stops being informative once consecutive lessons live in
      // one block. `splitFrom` is preserved so `recombineBlock` still finds
      // the original split group across cells.
      splitType: null,
      // If the incoming block carried user edits and the existing one didn't,
      // promote them — otherwise existing edits win (first-write).
      userEdits:
        Object.keys(existing.userEdits).length > 0
          ? existing.userEdits
          : block.userEdits,
    };
  }
  if (merged.length === ht.placedBlocks.length) return ht; // no change
  return { ...ht, placedBlocks: merged };
}

/**
 * Apply `consolidateCell` to every half-term in a timeline. Idempotent. All
 * public mutators in this module pipe their result through this so callers
 * never have to remember to call it themselves.
 *
 * Exported as `consolidateTimeline` for the deserializer — legacy `.curriculum`
 * files saved before DEC-046 may contain split-up adjacent placements that
 * need a one-time merge on load.
 */
export function consolidateTimeline(timeline: Timeline): Timeline {
  return consolidate(timeline);
}

function consolidate(timeline: Timeline): Timeline {
  const next = timeline.halfTerms.map(consolidateCell);
  // Cheap reference-equality short-circuit so an unchanged timeline keeps the
  // same array identity (callers may depend on this for memoization).
  let changed = false;
  for (let i = 0; i < next.length; i++) {
    if (next[i] !== timeline.halfTerms[i]) {
      changed = true;
      break;
    }
  }
  return changed ? { halfTerms: next } : timeline;
}
