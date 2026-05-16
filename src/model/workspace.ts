import type {
  PlacedBlock,
  Spec,
  Subject,
  Workspace,
} from "./types";

export const FILE_VERSION = 1 as const;
export const APP_VERSION = "1.0.0";

export function createWorkspace(): Workspace {
  return { activeSubjectId: null, subjects: [] };
}

export function addSubject(workspace: Workspace, subject: Subject): Workspace {
  if (workspace.subjects.some((s) => s.id === subject.id)) {
    throw new Error(`addSubject: subject "${subject.id}" already exists`);
  }
  return {
    activeSubjectId: workspace.activeSubjectId ?? subject.id,
    subjects: [...workspace.subjects, subject],
  };
}

export function removeSubject(
  workspace: Workspace,
  subjectId: string
): Workspace {
  const idx = workspace.subjects.findIndex((s) => s.id === subjectId);
  if (idx === -1) return workspace;
  const subjects = workspace.subjects.filter((s) => s.id !== subjectId);
  const nextActiveId =
    workspace.activeSubjectId === subjectId
      ? subjects[0]?.id ?? null
      : workspace.activeSubjectId;
  return { activeSubjectId: nextActiveId, subjects };
}

export function replaceSubject(
  workspace: Workspace,
  subjectId: string,
  newSubject: Subject
): Workspace {
  const idx = workspace.subjects.findIndex((s) => s.id === subjectId);
  if (idx === -1) {
    throw new Error(`replaceSubject: subject "${subjectId}" not found`);
  }
  if (newSubject.id !== subjectId) {
    throw new Error(
      `replaceSubject: id mismatch — passed subject has id "${newSubject.id}", expected "${subjectId}"`
    );
  }
  const subjects = workspace.subjects.map((s) =>
    s.id === subjectId ? newSubject : s
  );
  return { ...workspace, subjects };
}

export function setActiveSubject(
  workspace: Workspace,
  subjectId: string | null
): Workspace {
  if (subjectId === null) {
    return { ...workspace, activeSubjectId: null };
  }
  if (!workspace.subjects.some((s) => s.id === subjectId)) {
    throw new Error(`setActiveSubject: subject "${subjectId}" not found`);
  }
  return { ...workspace, activeSubjectId: subjectId };
}

export function getActiveSubject(workspace: Workspace): Subject | null {
  if (!workspace.activeSubjectId) return null;
  return workspace.subjects.find((s) => s.id === workspace.activeSubjectId) ?? null;
}

export interface RestoreResult {
  readonly workspace: Workspace;
  readonly orphans: readonly PlacedBlock[];
}

export interface RestorePreview {
  readonly subject: Subject;
  readonly orphans: readonly PlacedBlock[];
}

/**
 * Like `restoreSubjectToImport` but does not mutate the workspace. Returns
 * the subject (so the UI can show its name/colour) and the list of placements
 * that *would* be dropped if the restore is committed. Cheap enough to call
 * synchronously from a confirmation modal.
 */
export function previewRestoreSubjectToImport(
  workspace: Workspace,
  subjectId: string
): RestorePreview {
  const subject = workspace.subjects.find((s) => s.id === subjectId);
  if (!subject) {
    throw new Error(`previewRestoreSubjectToImport: subject "${subjectId}" not found`);
  }
  const validSubTopicCodes = collectSubTopicCodes(subject.importedSpec);
  const validCustomIds = new Set(subject.customBlocks.map((c) => c.id));
  const orphans: PlacedBlock[] = [];
  for (const ht of subject.timeline.halfTerms) {
    for (const pb of ht.placedBlocks) {
      if (pb.source.kind === "sub-topic" && !validSubTopicCodes.has(pb.source.subTopicCode)) {
        orphans.push(pb);
      } else if (pb.source.kind === "custom" && !validCustomIds.has(pb.source.customBlockId)) {
        orphans.push(pb);
      }
    }
  }
  return { subject, orphans };
}

/**
 * Reset a subject's `workingSpec` to a clone of its `importedSpec` and drop any
 * placements that reference sub-topic codes or custom-block ids that no longer
 * exist. Returns the dropped placements as `orphans` so the caller can surface
 * them to the user.
 */
export function restoreSubjectToImport(
  workspace: Workspace,
  subjectId: string
): RestoreResult {
  const subject = workspace.subjects.find((s) => s.id === subjectId);
  if (!subject) {
    throw new Error(`restoreSubjectToImport: subject "${subjectId}" not found`);
  }
  const importedClone = cloneSpec(subject.importedSpec);
  const validSubTopicCodes = collectSubTopicCodes(importedClone);
  const validCustomIds = new Set(subject.customBlocks.map((c) => c.id));

  const orphans: PlacedBlock[] = [];
  const halfTerms = subject.timeline.halfTerms.map((ht) => ({
    ...ht,
    placedBlocks: ht.placedBlocks.filter((pb) => {
      if (pb.source.kind === "sub-topic") {
        if (validSubTopicCodes.has(pb.source.subTopicCode)) return true;
        orphans.push(pb);
        return false;
      }
      if (pb.source.kind === "custom") {
        if (validCustomIds.has(pb.source.customBlockId)) return true;
        orphans.push(pb);
        return false;
      }
      return true;
    }),
  }));

  const restored: Subject = {
    ...subject,
    workingSpec: importedClone,
    timeline: { halfTerms },
  };
  return {
    workspace: replaceSubject(workspace, subjectId, restored),
    orphans,
  };
}

function collectSubTopicCodes(spec: Spec): Set<string> {
  const out = new Set<string>();
  for (const t of spec.topics) {
    for (const st of t.subTopics) out.add(st.code);
  }
  return out;
}

function cloneSpec(spec: Spec): Spec {
  return JSON.parse(JSON.stringify(spec)) as Spec;
}

// =====================================================================
// Persistence (SPEC.md §9.1)
// =====================================================================

export interface SerializedWorkspaceFile {
  readonly fileVersion: number;
  readonly savedAt: string;
  readonly appVersion: string;
  readonly workspace: Workspace;
}

export interface SerializeOptions {
  readonly now?: Date;
  readonly appVersion?: string;
}

export function serializeWorkspace(
  workspace: Workspace,
  options: SerializeOptions = {}
): string {
  const file: SerializedWorkspaceFile = {
    fileVersion: FILE_VERSION,
    savedAt: (options.now ?? new Date()).toISOString(),
    appVersion: options.appVersion ?? APP_VERSION,
    workspace,
  };
  return JSON.stringify(file, null, 2);
}

export class DeserializationError extends Error {
  public readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "DeserializationError";
  }
}

export function deserializeWorkspace(json: string): Workspace {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    throw new DeserializationError(
      "INVALID_JSON",
      `Could not parse file as JSON: ${(e as Error).message}`
    );
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new DeserializationError(
      "NOT_AN_OBJECT",
      "File contents are not a JSON object"
    );
  }
  const obj = parsed as Record<string, unknown>;
  if (typeof obj["fileVersion"] !== "number") {
    throw new DeserializationError(
      "MISSING_VERSION",
      "File is missing the required `fileVersion` field"
    );
  }
  const fileVersion = obj["fileVersion"];
  if (fileVersion > FILE_VERSION) {
    throw new DeserializationError(
      "UNSUPPORTED_VERSION",
      `File version ${fileVersion} is newer than this app supports (${FILE_VERSION}). Update the app to open this file.`
    );
  }
  if (fileVersion < FILE_VERSION) {
    throw new DeserializationError(
      "UNSUPPORTED_VERSION",
      `File version ${fileVersion} is older than this app supports (${FILE_VERSION}). Migration is not yet implemented.`
    );
  }
  const workspace = obj["workspace"];
  if (typeof workspace !== "object" || workspace === null) {
    throw new DeserializationError(
      "MISSING_WORKSPACE",
      "File is missing the required `workspace` field"
    );
  }
  // Light structural validation — full schema validation is deferred until needed.
  const w = workspace as Record<string, unknown>;
  if (!Array.isArray(w["subjects"])) {
    throw new DeserializationError(
      "INVALID_WORKSPACE",
      "workspace.subjects must be an array"
    );
  }
  if (
    w["activeSubjectId"] !== null &&
    typeof w["activeSubjectId"] !== "string"
  ) {
    throw new DeserializationError(
      "INVALID_WORKSPACE",
      "workspace.activeSubjectId must be a string or null"
    );
  }
  return workspace as Workspace;
}
