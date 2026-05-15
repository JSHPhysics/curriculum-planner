import type { HalfTerm, PlacedBlock, Timeline, YearId } from "./types";

interface HalfTermSeed {
  readonly id: string;
  readonly year: YearId;
  readonly label: string;
  readonly dates: string | null;
  readonly budget: number;
}

const DEFAULT_HALF_TERMS: readonly HalfTermSeed[] = [
  { id: "Y9-A1", year: "Y9", label: "Aut 1", dates: "4 Sep – 16 Oct", budget: 12 },
  { id: "Y9-A2", year: "Y9", label: "Aut 2", dates: "2 Nov – 11 Dec", budget: 12 },
  { id: "Y9-S1", year: "Y9", label: "Spr 1", dates: "6 Jan – 12 Feb", budget: 11 },
  { id: "Y9-S2", year: "Y9", label: "Spr 2", dates: "22 Feb – 24 Mar", budget: 9 },
  { id: "Y9-U1", year: "Y9", label: "Sum 1", dates: "15 Apr – 28 May", budget: 13 },
  { id: "Y9-U2", year: "Y9", label: "Sum 2", dates: "7 Jun – 7 Jul", budget: 9 },
  { id: "Y10-A1", year: "Y10", label: "Aut 1", dates: null, budget: 21 },
  { id: "Y10-A2", year: "Y10", label: "Aut 2", dates: null, budget: 21 },
  { id: "Y10-S1", year: "Y10", label: "Spr 1", dates: null, budget: 19 },
  { id: "Y10-S2", year: "Y10", label: "Spr 2", dates: null, budget: 16 },
  { id: "Y10-U1", year: "Y10", label: "Sum 1", dates: null, budget: 18 },
  { id: "Y10-U2", year: "Y10", label: "Sum 2", dates: null, budget: 10 },
  { id: "Y11-A1", year: "Y11", label: "Aut 1", dates: null, budget: 18 },
  { id: "Y11-A2", year: "Y11", label: "Aut 2", dates: null, budget: 18 },
  { id: "Y11-S1", year: "Y11", label: "Spr 1", dates: null, budget: 16 },
  { id: "Y11-S2", year: "Y11", label: "Spr 2", dates: null, budget: 14 },
  { id: "Y11-U1", year: "Y11", label: "Sum 1", dates: null, budget: 12 },
];

export function createDefaultTimeline(): Timeline {
  return {
    halfTerms: DEFAULT_HALF_TERMS.map(
      (seed): HalfTerm => ({
        id: seed.id,
        year: seed.year,
        label: seed.label,
        dates: seed.dates,
        budget: seed.budget,
        placedBlocks: [],
      })
    ),
  };
}

export interface EoHTOptions {
  readonly lessonsPerEoHT?: number;
  readonly idGen?: () => string;
}

export function createEoHTBlocks(
  timeline: Timeline,
  options: EoHTOptions = {}
): Timeline {
  const lessons = options.lessonsPerEoHT ?? 1;
  const idGen = options.idGen ?? defaultIdGen;
  return {
    halfTerms: timeline.halfTerms.map(
      (ht): HalfTerm => ({
        ...ht,
        placedBlocks: [
          ...ht.placedBlocks,
          eoHTPlacement(idGen(), lessons),
        ],
      })
    ),
  };
}

function eoHTPlacement(id: string, lessons: number): PlacedBlock {
  return {
    id,
    source: { kind: "eoht" },
    lessonsClaimed: lessons,
    lessonRange: [0, lessons],
    splitFrom: null,
    splitType: null,
    userEdits: {},
  };
}

export function halfTermUsed(halfTerm: HalfTerm): number {
  return halfTerm.placedBlocks.reduce((s, b) => s + b.lessonsClaimed, 0);
}

export function halfTermRoom(halfTerm: HalfTerm): number {
  return Math.max(0, halfTerm.budget - halfTermUsed(halfTerm));
}

function defaultIdGen(): string {
  return crypto.randomUUID();
}
