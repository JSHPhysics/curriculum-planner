export type ViewType = "topic" | "sub-topic" | "lesson" | "objective";

export type YearId = "Y9" | "Y10" | "Y11";

export interface Objective {
  readonly id: string;
  readonly text: string;
  readonly isDepth: boolean;
}

export interface Lesson {
  readonly id: string;
  readonly number: number;
  readonly title: string;
  readonly practical: string | null;
  readonly isDepth: boolean;
  readonly separateOnly: boolean;
  readonly objectives: readonly Objective[];
}

export interface SubTopic {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly difficulty: 1 | 2 | 3;
  readonly isDepth: boolean;
  readonly separateOnly: boolean;
  readonly notes: string | null;
  readonly lessons: readonly Lesson[];
}

export interface Topic {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly paper: string | null;
  readonly subTopics: readonly SubTopic[];
}

export interface Spec {
  readonly topics: readonly Topic[];
}

export type PlacedBlockSource =
  | { readonly kind: "sub-topic"; readonly subTopicCode: string }
  | { readonly kind: "custom"; readonly customBlockId: string }
  | { readonly kind: "eoht" };

export type SplitType = "auto" | "manual" | null;

export interface PlacedBlock {
  readonly id: string;
  readonly source: PlacedBlockSource;
  readonly lessonsClaimed: number;
  readonly lessonRange: readonly [number, number];
  readonly splitFrom: string | null;
  readonly splitType: SplitType;
  readonly userEdits: PlacedBlockEdits;
}

export interface PlacedBlockEdits {
  readonly title?: string;
  readonly note?: string;
}

export interface HalfTerm {
  readonly id: string;
  readonly year: YearId;
  readonly label: string;
  readonly dates: string | null;
  readonly budget: number;
  readonly placedBlocks: readonly PlacedBlock[];
}

export interface Timeline {
  readonly halfTerms: readonly HalfTerm[];
}

export interface CustomBlock {
  readonly id: string;
  readonly name: string;
  readonly lessons: number;
  readonly colour: string | null;
  readonly isEoHT: boolean;
}

export interface SubjectMeta {
  readonly name: string;
  readonly colour: string;
  readonly sourceFilename: string | null;
}

export interface SubjectConfig {
  readonly includeDepth: boolean;
  readonly lostLessonBuffer: boolean;
  readonly autoSpillover: boolean;
}

export interface Subject {
  readonly id: string;
  readonly meta: SubjectMeta;
  readonly importedSpec: Spec;
  readonly workingSpec: Spec;
  readonly timeline: Timeline;
  readonly customBlocks: readonly CustomBlock[];
  readonly config: SubjectConfig;
}

export interface Workspace {
  readonly activeSubjectId: string | null;
  readonly subjects: readonly Subject[];
}

export interface ValidationError {
  readonly code: string;
  readonly message: string;
  readonly row?: number;
}

export interface ValidationWarning {
  readonly code: string;
  readonly message: string;
  readonly row?: number;
}

export type ImportResult =
  | { readonly ok: true; readonly subject: Subject; readonly warnings: readonly ValidationWarning[] }
  | { readonly ok: false; readonly errors: readonly ValidationError[]; readonly warnings: readonly ValidationWarning[] };
