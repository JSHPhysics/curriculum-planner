import { applyCalendarTemplate } from "./timeline";
import type {
  CalendarTemplate,
  HalfTerm,
  PlacedBlock,
  Spec,
  Subject,
  Timeline,
  Workspace,
} from "./types";

export const FILE_VERSION = 1 as const;
export const APP_VERSION = "1.2.0";

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

export interface ApplyTemplateResult {
  readonly timeline: Timeline;
  readonly orphans: readonly PlacedBlock[];
}

/**
 * Regenerate a subject's Timeline from a new CalendarTemplate, preserving
 * placements whose half-term `id` exists in the new template. Placements
 * whose ids are absent become orphans — returned separately so the UI can
 * warn the user before committing.
 *
 * Does NOT mutate the subject. Caller decides whether to use the new
 * timeline (and discard orphans) or back out.
 */
export function applyTemplateToSubject(
  subject: Subject,
  template: CalendarTemplate
): ApplyTemplateResult {
  const fresh = applyCalendarTemplate(template);
  const orphans: PlacedBlock[] = [];
  const placementsByCellId = new Map<string, PlacedBlock[]>();
  for (const ht of subject.timeline.halfTerms) {
    if (ht.placedBlocks.length === 0) continue;
    placementsByCellId.set(ht.id, [...ht.placedBlocks]);
  }
  const halfTerms: HalfTerm[] = fresh.halfTerms.map((ht) => {
    const existing = placementsByCellId.get(ht.id);
    if (!existing) return ht;
    placementsByCellId.delete(ht.id);
    return { ...ht, placedBlocks: existing };
  });
  for (const blocks of placementsByCellId.values()) {
    for (const block of blocks) orphans.push(block);
  }
  return { timeline: { halfTerms }, orphans };
}

/**
 * Preview-only variant: returns the orphans that WOULD result from applying
 * the template, without committing the new timeline. Useful for the
 * confirmation modal that asks "this would lose N placements; continue?".
 */
export function previewApplyTemplateToSubject(
  subject: Subject,
  template: CalendarTemplate
): readonly PlacedBlock[] {
  return applyTemplateToSubject(subject, template).orphans;
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

/**
 * Thrown by `deserializeWorkspace` when the file contains legacy
 * `source.kind === "eoht"` placements (DEC-044). The App's open flow catches
 * this and surfaces a migration modal so the user can opt into the v2
 * shape, where end-of-HT tests are CustomBlocks with category "test".
 */
export class LegacyEoHTFileError extends DeserializationError {
  constructor() {
    super(
      "LEGACY_EOHT",
      "This file was saved with an older version that used end-of-half-term placements as a separate kind. Click Migrate to convert them into custom test blocks (DEC-044)."
    );
    this.name = "LegacyEoHTFileError";
  }
}

/**
 * Cheap check: returns true if the parsed workspace JSON contains any
 * `PlacedBlock` with `source.kind === "eoht"`. Used by the App's open flow
 * to decide whether to show the migration dialog before invoking the full
 * `deserializeWorkspace` (which would throw `LegacyEoHTFileError`).
 *
 * Tolerates malformed input — returns false rather than throwing so the
 * caller can fall through to `deserializeWorkspace` for a real error
 * message.
 */
export function detectLegacyEoHTPlacements(json: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return false;
  }
  if (typeof parsed !== "object" || parsed === null) return false;
  const ws = (parsed as Record<string, unknown>)["workspace"];
  if (typeof ws !== "object" || ws === null) return false;
  const subjects = (ws as Record<string, unknown>)["subjects"];
  if (!Array.isArray(subjects)) return false;
  for (const s of subjects) {
    if (typeof s !== "object" || s === null) continue;
    const timeline = (s as Record<string, unknown>)["timeline"];
    if (typeof timeline !== "object" || timeline === null) continue;
    const halfTerms = (timeline as Record<string, unknown>)["halfTerms"];
    if (!Array.isArray(halfTerms)) continue;
    for (const ht of halfTerms) {
      if (typeof ht !== "object" || ht === null) continue;
      const placedBlocks = (ht as Record<string, unknown>)["placedBlocks"];
      if (!Array.isArray(placedBlocks)) continue;
      for (const pb of placedBlocks) {
        if (typeof pb !== "object" || pb === null) continue;
        const source = (pb as Record<string, unknown>)["source"];
        if (typeof source !== "object" || source === null) continue;
        if ((source as Record<string, unknown>)["kind"] === "eoht") return true;
      }
    }
  }
  return false;
}

/**
 * Convert a legacy workspace JSON (with `source.kind: "eoht"` placements)
 * into the v2 shape (DEC-044). Per subject:
 *   - Create ONE new CustomBlock { isEoHT: true, category: "test",
 *     name: "End of half-term test", lessons: 1 }
 *   - Replace every EoHT placement with a custom-kind placement that
 *     references the new block. Lesson count is preserved per-placement.
 *
 * Returns the migrated JSON as a string (still v1 fileVersion — the caller
 * is expected to pipe this through `deserializeWorkspace` + a fresh save
 * to persist the new shape).
 *
 * Idempotent: re-running on already-migrated input is a no-op.
 */
export function migrateLegacyEoHTPlacements(
  json: string,
  options: { idGen?: () => string } = {}
): string {
  const idGen = options.idGen ?? (() => crypto.randomUUID());
  const parsed = JSON.parse(json) as { workspace?: { subjects?: unknown[] } } & Record<string, unknown>;
  if (!parsed.workspace || !Array.isArray(parsed.workspace.subjects)) {
    return json;
  }
  const subjects = parsed.workspace.subjects as Record<string, unknown>[];
  for (const subject of subjects) {
    const timeline = subject["timeline"] as { halfTerms?: unknown[] } | undefined;
    if (!timeline || !Array.isArray(timeline.halfTerms)) continue;
    const existingCustoms = Array.isArray(subject["customBlocks"])
      ? (subject["customBlocks"] as unknown[])
      : [];
    let migrationBlockId: string | null = null;
    const halfTerms = timeline.halfTerms as Record<string, unknown>[];
    let anyMigrated = false;
    for (const ht of halfTerms) {
      const placedBlocks = ht["placedBlocks"];
      if (!Array.isArray(placedBlocks)) continue;
      const nextBlocks: unknown[] = [];
      for (const pb of placedBlocks as Record<string, unknown>[]) {
        const source = pb["source"] as { kind?: string } | undefined;
        if (source && source.kind === "eoht") {
          if (!migrationBlockId) {
            migrationBlockId = idGen();
            existingCustoms.push({
              id: migrationBlockId,
              name: "End of half-term test",
              lessons: 1,
              colour: null,
              isEoHT: true,
              category: "test",
            });
          }
          anyMigrated = true;
          nextBlocks.push({
            ...pb,
            source: { kind: "custom", customBlockId: migrationBlockId },
          });
        } else {
          nextBlocks.push(pb);
        }
      }
      ht["placedBlocks"] = nextBlocks;
    }
    if (anyMigrated) {
      subject["customBlocks"] = existingCustoms;
    }
  }
  return JSON.stringify(parsed, null, 2);
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
  // DEC-044: reject legacy EoHT placements; the App's open flow catches this
  // and surfaces a migration modal. We re-use detectLegacyEoHTPlacements on
  // the raw JSON to avoid duplicating the walk logic.
  if (detectLegacyEoHTPlacements(json)) {
    throw new LegacyEoHTFileError();
  }
  return workspace as Workspace;
}
