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
  return appendToTerm(timeline, termId, block);
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
  return pieces.reduce(
    (tl, p) => appendToTerm(tl, p.termId, p.block),
    timeline
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
  return replaceInTerm(timeline, found.termId, placedBlockId, [piece1, piece2]);
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
  return {
    halfTerms: timeline.halfTerms.map(
      (ht): HalfTerm => ({
        ...ht,
        placedBlocks: ht.placedBlocks.filter((b) => b.splitFrom !== groupKey),
      })
    ),
  };
}

export function removeBlock(
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
  return appendToTerm(removed, toTermId, found.block);
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
  return replaceInTerm(timeline, found.termId, placedBlockId, [edited]);
}

function appendToTerm(
  timeline: Timeline,
  termId: string,
  block: PlacedBlock
): Timeline {
  if (!timeline.halfTerms.some((ht) => ht.id === termId)) {
    throw new Error(`unknown term "${termId}"`);
  }
  return {
    halfTerms: timeline.halfTerms.map((ht): HalfTerm => {
      if (ht.id !== termId) return ht;
      return { ...ht, placedBlocks: [...ht.placedBlocks, block] };
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
