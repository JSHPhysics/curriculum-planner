import type {
  HalfTerm,
  PlacedBlock,
  PlacedBlockSource,
  Timeline,
} from "./types";

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
    userEdits: {},
  };
  return consolidate(appendToTerm(timeline, termId, block));
}

// DEC-056: placeBlockWithSpillover, computeDistribution, splitBlock, and
// recombineBlock were removed. Auto-spillover seemed nice in principle but
// in practice created hard-to-reason-about layouts and orphaned references
// to non-existent split groups. Same-cell manual split was a no-op after
// the DEC-046 consolidator anyway. The codebase now has one placement op
// per intent: placeBlock / placeBlockAtIndex / moveBlock / moveBlockToIndex
// / extractAndMoveLesson* / removeBlock — no split / no spillover.

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
    userEdits: {},
  };
  return consolidate(insertIntoTermAt(timeline, termId, block, atIndex));
}

/**
 * Place a SPECIFIC lesson from a sub-topic into a cell (DEC-049). Unlike
 * placeBlock — which always uses lessonRange [0, N) — this lets the caller
 * pin the placement to a particular absolute lesson index, so dragging a
 * single lesson from the Lesson-view pool reaches the right card in the
 * timeline. Underpins lesson-pool drops; consolidation will merge it with
 * an adjacent same-sub-topic block if one already exists in the cell.
 */
export function placeLessonAtIndex(
  timeline: Timeline,
  subTopicCode: string,
  absLessonIdx: number,
  termId: string,
  atIndex: number,
  options: PlacementOptions = {}
): Timeline {
  if (absLessonIdx < 0) {
    throw new Error(
      `placeLessonAtIndex: absLessonIdx must be >= 0 (got ${absLessonIdx})`
    );
  }
  const idGen = options.idGen ?? defaultIdGen;
  const block: PlacedBlock = {
    id: idGen(),
    source: { kind: "sub-topic", subTopicCode },
    lessonsClaimed: 1,
    lessonRange: [absLessonIdx, absLessonIdx + 1],
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
 * half-term. The source block is shrunk as needed:
 *   - lesson at the start → source becomes [start+1, end)
 *   - lesson at the end   → source becomes [start, end-1)
 *   - lesson in the middle → source splits into [start, lessonPos) + [lessonPos+1, end)
 *   - lesson was the only one → source is removed entirely
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

  const replacement: PlacedBlock[] = [];
  if (lessonPos > start) {
    replacement.push({
      ...block,
      id: idGen(),
      lessonsClaimed: lessonPos - start,
      lessonRange: [start, lessonPos],
    });
  }
  if (lessonPos + 1 < end) {
    replacement.push({
      ...block,
      id: idGen(),
      lessonsClaimed: end - (lessonPos + 1),
      lessonRange: [lessonPos + 1, end],
    });
  }

  const movedPiece: PlacedBlock = {
    ...block,
    id: idGen(),
    lessonsClaimed: 1,
    lessonRange: [lessonPos, lessonPos + 1],
  };

  let tl = replaceInTerm(timeline, found.termId, placedBlockId, replacement);
  tl = appendToTerm(tl, toTermId, movedPiece);
  return consolidate(tl);
}

/**
 * Set the per-placement display title (DEC-050). Stored in
 * `PlacedBlock.userEdits.title`; falsy / empty input clears the override so
 * the displayed name falls back to the underlying sub-topic / custom-block
 * name. Re-uses the same in-place block replacement plumbing as edit lesson.
 */
export function setPlacedBlockTitle(
  timeline: Timeline,
  placedBlockId: string,
  title: string
): Timeline {
  const found = findPlacedBlock(timeline, placedBlockId);
  if (!found) {
    throw new Error(`setPlacedBlockTitle: no placed block with id "${placedBlockId}"`);
  }
  const trimmed = title.trim();
  const nextUserEdits = { ...found.block.userEdits };
  if (trimmed === "") {
    delete (nextUserEdits as { title?: string }).title;
  } else {
    (nextUserEdits as { title?: string }).title = trimmed;
  }
  const edited: PlacedBlock = { ...found.block, userEdits: nextUserEdits };
  return consolidate(
    replaceInTerm(timeline, found.termId, placedBlockId, [edited])
  );
}

/**
 * Remove a single placed lesson, "releasing" it back into the unplaced pool
 * (DEC-049). Source block is shrunk or split using the same shape as
 * extractAndMoveLesson, but the extracted piece is discarded rather than
 * re-placed.
 */
export function removePlacedLesson(
  timeline: Timeline,
  placedBlockId: string,
  localLessonIdx: number,
  options: PlacementOptions = {}
): Timeline {
  const found = findPlacedBlock(timeline, placedBlockId);
  if (!found) {
    throw new Error(
      `removePlacedLesson: no placed block with id "${placedBlockId}"`
    );
  }
  const { block } = found;
  if (localLessonIdx < 0 || localLessonIdx >= block.lessonsClaimed) {
    throw new Error(
      `removePlacedLesson: localLessonIdx ${localLessonIdx} out of range ` +
        `[0, ${block.lessonsClaimed})`
    );
  }
  const idGen = options.idGen ?? defaultIdGen;
  const [start, end] = block.lessonRange;
  const lessonPos = start + localLessonIdx;

  const replacement: PlacedBlock[] = [];
  if (lessonPos > start) {
    replacement.push({
      ...block,
      id: idGen(),
      lessonsClaimed: lessonPos - start,
      lessonRange: [start, lessonPos],
    });
  }
  if (lessonPos + 1 < end) {
    replacement.push({
      ...block,
      id: idGen(),
      lessonsClaimed: end - (lessonPos + 1),
      lessonRange: [lessonPos + 1, end],
    });
  }
  return consolidate(
    replaceInTerm(timeline, found.termId, placedBlockId, replacement)
  );
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

  const idGen = options.idGen ?? defaultIdGen;
  const [start, end] = block.lessonRange;
  const lessonPos = start + localLessonIdx;

  const replacement: PlacedBlock[] = [];
  if (lessonPos > start) {
    replacement.push({
      ...block,
      id: idGen(),
      lessonsClaimed: lessonPos - start,
      lessonRange: [start, lessonPos],
    });
  }
  if (lessonPos + 1 < end) {
    replacement.push({
      ...block,
      id: idGen(),
      lessonsClaimed: end - (lessonPos + 1),
      lessonRange: [lessonPos + 1, end],
    });
  }

  const movedPiece: PlacedBlock = {
    ...block,
    id: idGen(),
    lessonsClaimed: 1,
    lessonRange: [lessonPos, lessonPos + 1],
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
    // DEC-051: only merge with the IMMEDIATELY PREVIOUS block in cell order.
    // Merging with any earlier same-source block (the old logic) would
    // collapse cell layouts like [T1a-piece1, T1b, T1a-piece2] into
    // [T1a-merged, T1b], silently reverting the user's "insert T1b between
    // T1a lessons" intent. Adjacent-in-cell-order matches what a teacher
    // sees on screen.
    const last = merged[merged.length - 1];
    const canMergeIntoLast =
      block.source.kind === "sub-topic" &&
      last !== undefined &&
      last.source.kind === "sub-topic" &&
      last.source.subTopicCode === block.source.subTopicCode &&
      (last.lessonRange[1] === block.lessonRange[0] ||
        last.lessonRange[0] === block.lessonRange[1]);
    if (!canMergeIntoLast) {
      merged.push(block);
      continue;
    }
    const existing = last!;
    const newStart = Math.min(existing.lessonRange[0], block.lessonRange[0]);
    const newEnd = Math.max(existing.lessonRange[1], block.lessonRange[1]);
    merged[merged.length - 1] = {
      ...existing,
      lessonsClaimed: newEnd - newStart,
      lessonRange: [newStart, newEnd],
      // If the incoming block carried user edits and the existing one
      // didn't, promote them — otherwise existing edits win (first-write).
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
