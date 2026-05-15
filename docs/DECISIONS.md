# Decisions

Log of design decisions made *during the build* that aren't covered in `SPEC.md`. Anything that changes how the system behaves, or that a future reader would need to know to understand the code.

**When to add an entry:**
- A SPEC.md requirement turned out to be ambiguous and a choice was made
- A practical constraint forced a different approach than the spec described
- A user request mid-build added or changed a requirement
- A trade-off was made that future maintainers should understand

**When NOT to add an entry:**
- Trivial implementation choices (variable names, file organisation)
- Things already explicit in SPEC.md
- Bug fixes (those belong in commit messages)

If a decision contradicts SPEC.md, **also update SPEC.md** in the same commit, with a reference to the decision entry.

---

## Entry template

```
## DEC-NNN — Short title
**Date:** YYYY-MM-DD
**Session:** N
**Status:** Accepted | Superseded by DEC-NNN | Reversed

### Context
What problem prompted this decision.

### Decision
What was decided. Be specific.

### Alternatives considered
Options weighed, briefly.

### Consequences
What this means for current and future work.

### Related
SPEC.md sections touched, files affected, prior DECs.
```

---

## Entries

## DEC-001 — Add `@vitest/coverage-v8` as a dev dependency
**Date:** 2026-05-15
**Session:** 1
**Status:** Accepted

### Context
`BUILD_PLAN.md` Session 1 exit criteria require "100% line and branch coverage on `codes.ts`". Vitest doesn't include a coverage provider by default. `BUILD_PLAN.md` rule 12 forbids new deps after Session 0 without a DEC entry — hence this entry.

### Decision
Add `@vitest/coverage-v8` (matches vitest 2.1.x) as a dev-only dependency. Use it via `npx vitest run --coverage`. No config change; defaults are fine.

### Alternatives considered
- **`@vitest/coverage-istanbul`** — alternative provider. v8 is the default vitest recommends and is faster on small suites. No need to swap.
- **Skip coverage measurement, eyeball it** — defeats the BUILD_PLAN's explicit "100% line and branch coverage" exit criterion. Manual review is fine for sanity but not as a gate.

### Consequences
- `npm install` footprint grows by ~19 packages (test-time only).
- Future sessions can extend coverage assertions to other model files without further setup.
- A CI step can later run `vitest run --coverage` with a threshold flag.

### Related
- `BUILD_PLAN.md` Session 1 exit criteria, working agreement #12
- `package.json` (devDependencies)

---

## DEC-002 — Wire `@/*` path alias into `tsconfig.json` and include `tests/`
**Date:** 2026-05-15
**Session:** 1
**Status:** Accepted

### Context
`vite.config.ts` already aliases `@` to `src/`, but `tsc` resolves modules independently. `tests/model/codes.test.ts` imports `@/model/codes` and failed `npm run typecheck` because:
1. `tests/` was not in the renderer `tsconfig.json` `include`.
2. The renderer `tsconfig.json` had no `paths` entry to mirror Vite's alias.

### Decision
- Add `"baseUrl": "."` and `"paths": { "@/*": ["src/*"] }` to renderer `tsconfig.json`.
- Add `"tests"` to the renderer `tsconfig.json` `include`. Keep `tests/e2e` in `exclude` (Playwright types come later).

### Alternatives considered
- **Use relative imports in tests (`../../src/model/codes`)** — works, but inconsistent with renderer code and brittle to test re-organisation.
- **Separate `tsconfig.test.json`** — more config files for no real win on a project this size.

### Consequences
- `npm run typecheck` now type-checks unit tests too, catching test-side type bugs at the same gate as renderer code.
- Vitest already uses Vite's resolver, so runtime behaviour is unchanged.

### Related
- `SPEC.md` §11.2 (TypeScript strict mode)
- `BUILD_PLAN.md` Session 1 exit criteria
- `tsconfig.json`, `vite.config.ts`

---

## DEC-003 — Sub-topic code suffix scheme past `z`
**Date:** 2026-05-15
**Session:** 1
**Status:** Accepted

### Context
`SPEC.md` §3.4 specifies single-letter sub-topic suffixes (`T1a`, `T1b`, …) but does not define behaviour past `T1z`. `BUILD_PLAN.md` Session 1 step 4 suggests "after `T1z` use `T1aa`, `T1ab` (alphabet pairs)" — a hint, not a binding rule.

### Decision
Sub-topic suffixes are produced by `indexToLetters(n)` in `src/model/codes.ts`, where position `n` (0-indexed) maps to:
- `n = 0..25` → `a..z`
- `n = 26..701` → `aa..zz`
- `n = 702..` → `aaa..zzz`, etc.

Same shape as spreadsheet column letters, but lowercase. Deterministic, monotonic, gap-filling (same as topic codes).

### Alternatives considered
- **Numeric suffixes past 26 (`T1-27`)** — breaks the spec's letter-suffix convention and reads oddly in the UI.
- **Hard cap at 26** — would silently fail on imports with very flat topic structures. Not v1 user-friendly.

### Consequences
- Real curricula rarely exceed ~10 sub-topics per topic; this is defensive and matches the build plan's hint.
- If a real-world topic ever has >100 sub-topics, the displayed code `T1aaa` is ugly but the algorithm holds. Revisit display layer then, not the algorithm.

### Related
- `SPEC.md` §3.4
- `BUILD_PLAN.md` Session 1 step 4
- `src/model/codes.ts`

---

## DEC-004 — Strict TS flags `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` stay on
**Date:** 2026-05-15
**Session:** 1 *(retroactive — chosen in Session 0)*
**Status:** Accepted

### Context
Session 0's `tsconfig.json` set both flags on top of `strict: true`. They are stricter than typical projects use and force more verbose narrowing of `T | undefined` and explicit `undefined` values for optional properties.

### Decision
Both flags stay enabled for the renderer `tsconfig.json` throughout v1.

### Alternatives considered
- **Relax to plain `strict: true`** — less verbose, but the data model is the long-term load-bearing surface of this app, and catching "I assumed this index existed" / "I forgot to set this optional field" at compile time is worth the cost.

### Consequences
- Model-layer code must narrow array index reads (`const x = arr[i]; if (x === undefined) …`).
- Optional fields must be set to `undefined` explicitly when assigning from a source that might omit them.
- Pays off most heavily in the model layer (Sessions 1–5); amortises in the UI layer.

### Related
- `SPEC.md` §11.2
- `tsconfig.json` (Session 0 commit `4316ce5`)

---

## DEC-005 — `importSpec` accepts an `options` parameter beyond `buffer`
**Date:** 2026-05-15
**Session:** 2
**Status:** Accepted

### Context
`BUILD_PLAN.md` Session 2 step 2 specifies `importSpec(buffer: ArrayBuffer): ImportResult`. But several `Subject` fields can't be derived from the xlsx bytes:
- `meta.sourceFilename` — needs the OS path the user picked
- `meta.name` — user-facing display name; could default but is best provided
- `meta.colour` — palette colour for the subject tab
- A deterministic id generator is useful for tests (per-Subject UUIDs make assertions awkward)

### Decision
Extend the signature to `importSpec(buffer: ArrayBuffer, options?: ImportOptions): ImportResult` where `ImportOptions` is:
```ts
{
  sourceFilename?: string;
  subjectName?: string;
  subjectColour?: string;
  idGen?: () => string;
}
```
All fields are optional. Defaults: `subjectName = "Imported Subject"`, `subjectColour = "#1F3A5F"` (palette navy), `sourceFilename = null`, `idGen = () => crypto.randomUUID()`.

### Alternatives considered
- **Stick literally to the BUILD_PLAN signature, force callers to wrap and assign meta after.** Two-step API is uglier and asks every caller to know that `meta.name` defaults aren't meaningful. The UI layer (Session 7+) will pass these at the call site anyway.
- **Take a second positional arg for filename only.** Doesn't give tests an `idGen` hook and doesn't extend cleanly when we need to thread more context later.

### Consequences
- Test suite uses a counter `idGen` for deterministic IDs without mocking `crypto`.
- Session 7 (UI) will call `importSpec(buf, { sourceFilename: path, subjectName: …, subjectColour: … })` after the user picks a file.

### Related
- `SPEC.md` §3.1 (`SubjectMeta`)
- `BUILD_PLAN.md` Session 2 step 2
- `src/model/import.ts`

---

## DEC-006 — Per-cell merge rules for multi-row lessons
**Date:** 2026-05-15
**Session:** 2
**Status:** Accepted

### Context
`SPEC.md` §5.2 says multi-row lessons merge by *"objectives concatenated, practical/depth/separate flags OR-ed together"*. But `practical` is a free-text string, not a boolean — "OR-ed" needs a concrete interpretation. The spec is also silent on `Paper`, `Notes`, and `Difficulty` merging at the lesson level.

### Decision
For rows sharing `(Topic, Sub-topic, Lesson No.)`:
- **Lesson Title** — must match (case-insensitive after trim); mismatch is `DUPLICATE_LESSON_DIFFERENT_TITLES` error per `SPEC.md` §5.3.
- **Objectives** — splits on newline or semicolon, trims, drops empties, concatenates in row order. Duplicates are preserved (the user authored them; we don't second-guess).
- **Practical** — collects distinct non-empty values across rows, joins with `"; "`. Most lessons have one; this gracefully handles the rare "two practicals on one lesson" case.
- **Extra-depth flag** — OR.
- **Separate science only flag** — OR.
- **Difficulty** — tracked per-row, max wins at the sub-topic level (per `SPEC.md` §5.1). A `SUBTOPIC_DIFFICULTY_VARIES` warning fires when rows within a sub-topic disagree.
- **Paper** — taken from the first non-empty row in the topic (topic-level field per `SPEC.md` §3.1).
- **Notes** — taken from the first non-empty row in the sub-topic.

### Alternatives considered
- **Concat practicals with `" / "` instead of `"; "`.** Pure aesthetics; `; ` matches the objectives separator convention.
- **For Notes, concat all non-empty values.** Easy to get noisy; first-non-empty is the safer default. Users can re-export and re-import a cleaner spec if they want all of them.

### Consequences
- Test `importSpec — merge behaviour for multi-row lessons` pins this behaviour.
- A user wanting to *replace* a lesson's data via a second row can't — they get a merge. Acceptable: the spec said "merged"; if they wanted replacement they would edit the original row.

### Related
- `SPEC.md` §5.1, §5.2, §5.3
- `src/model/import.ts` (`mergeLessonRows`, `validateLessonTitleConsistency`)

---

## DEC-007 — `Subject` non-spec defaults at import time
**Date:** 2026-05-15
**Session:** 2
**Status:** Accepted

### Context
`importSpec` returns a fully-formed `Subject`. Sessions 3+ populate the timeline, custom blocks, and provide UI for config toggles. Session 2's `Subject` needs sensible non-spec defaults that don't pre-empt Session 3's design.

### Decision
At import time:
- `timeline = { halfTerms: [] }` — empty. Session 3's `createDefaultTimeline()` will be called explicitly (likely by the store action that loads a subject) — `importSpec` itself stays pure data-model.
- `customBlocks = []` — empty. Users add their own; Session 3's `createEoHTBlocks(timeline)` runs after timeline init.
- `config = { includeDepth: false, lostLessonBuffer: false, autoSpillover: true }` — conservative defaults. `autoSpillover` is the documented v1 default behaviour for placement (see `SPEC.md` §1.1: "Auto-spillover when a block exceeds a half-term's capacity"); the other two toggles default off.

### Alternatives considered
- **Have `importSpec` call `createDefaultTimeline()` itself.** Couples import to timeline shape; Session 3 hasn't been written yet. Better to keep import responsible only for spec content and let the store assemble the runtime Subject.
- **Return a partial Subject and have the caller fill the rest.** Breaks the build plan's contract that `importSpec` returns a `Subject`. Defaults are cheap.

### Consequences
- A `Subject` straight out of `importSpec` is *technically* invalid for placement (no half-terms). The store layer (Session 6) must call timeline init after import.
- Tests can assert `subject.timeline.halfTerms.length === 0` immediately post-import.

### Related
- `SPEC.md` §1.1, §3.1
- `BUILD_PLAN.md` Session 2, Session 3, Session 6
- `src/model/import.ts`

---

## DEC-008 — Placement function signatures take `PlacedBlockSource` + `lessonsClaimed` rather than a pool `blockId`
**Date:** 2026-05-15
**Session:** 3
**Status:** Accepted

### Context
`BUILD_PLAN.md` Session 3 step 2 lists `placeBlock(timeline, blockId, termId)` and `placeWithSpillover(timeline, subTopic, lessonsClaimed, termId)`. The prototype maintains a separate `state.blocks` map keyed by id (a pool of unplaced blocks). The new data model (per [DEC-007](#dec-007) and `SPEC.md` §3) has no pool storage — `PlacedBlock`s live inside `HalfTerm.placedBlocks`. The "pool" is a derived UI concept: sub-topics whose lessons aren't fully covered by `PlacedBlock`s.

### Decision
Placement functions accept the *source descriptor* directly, not a pre-existing block id:
- `placeBlock(timeline, source: PlacedBlockSource, termId, lessonsClaimed, options?): Timeline` — creates a fresh `PlacedBlock` and appends it to the term
- `placeBlockWithSpillover(timeline, source: PlacedBlockSource, lessonsClaimed, termId, options?): Timeline` — same but auto-splits across consecutive half-terms when the target overflows
- `moveBlock(timeline, placedBlockId, toTermId): Timeline` covers "I have an existing placed block, move it" (no spillover — the user moved a block manually, they wanted *that term*)
- `splitBlock`, `recombineBlock`, `removeBlock`, `editBlockLessons` all take a `placedBlockId` since they operate on existing placements

### Alternatives considered
- **Add a pool collection to `Timeline`.** Closer to the prototype's mental model but contradicts `SPEC.md` §3.1's data shape. Would require a third storage location for blocks (term-placed, pool, custom).
- **Mint a `PlacedBlock` upstream and pass to a `placeBlock(timeline, block, termId)`.** Removes the source/lessonsClaimed pair but pushes id-generation and split-state defaults onto every caller. Less ergonomic, more error-prone.

### Consequences
- The UI layer (Session 7+) will compute "pool" as `spec.topics.subTopics` minus `timeline.halfTerms[].placedBlocks` grouped by `source.subTopicCode`. Each placement operation is a single function call rather than a "remove from pool, add to term" sequence.
- Tests can construct timelines purely by chaining placement calls without any pool-bootstrapping step.

### Related
- `SPEC.md` §3.1, §3.6
- `BUILD_PLAN.md` Session 3 step 2
- `src/model/placement.ts`

---

## DEC-009 — `PlacedBlockSource.kind = "eoht"` is its own kind, not a `CustomBlock`
**Date:** 2026-05-15
**Session:** 3
**Status:** Accepted

### Context
The prototype models end-of-half-term tests as `CustomBlock`s with an `isEoHT: true` flag, one per half-term. `BUILD_PLAN.md` Session 3 step 1.2 specifies `createEoHTBlocks(timeline): CustomBlock[]` returning the custom-block list. But the data model from [Session 1](#dec-004) already has `PlacedBlockSource = "sub-topic" | "custom" | "eoht"` — EoHT was given its own kind.

### Decision
- `createEoHTBlocks(timeline, options?): Timeline` — returns the new timeline with an EoHT `PlacedBlock` (`source: { kind: "eoht" }`) appended to every half-term. Function signature deviates from the build plan's `CustomBlock[]` return type, but matches the existing type model.
- EoHT placements carry no backing `CustomBlock`. Display text ("Y9 Aut 1 test") is derived at render time from the parent `HalfTerm.year + label`.
- The `options.lessonsPerEoHT` parameter (default 1) supports `SPEC.md` §1.1's "Configurable end-of-half-term test defaults" without re-running the function.

### Alternatives considered
- **Match the build plan literally — return `CustomBlock[]` with `isEoHT: true`.** Would require separate placement logic, contradict the existing `PlacedBlockSource.kind = "eoht"` from Session 1, and store the EoHT display name on every block (duplication).
- **Drop the `"eoht"` kind from `PlacedBlockSource` and use only `"custom"`.** Possible but reverses a Session 1 decision; the discriminator is cheap.

### Consequences
- The UI knows it's looking at an EoHT block via `source.kind === "eoht"` (no flag lookup on a separate CustomBlock).
- EoHT name changes (e.g. "Y10 mid-term") would require either a per-half-term override (via `userEdits.title`) or a different model. Acceptable for v1: prototype only supports the default name pattern.

### Related
- `SPEC.md` §1.1
- `BUILD_PLAN.md` Session 3 step 1.2
- [DEC-004](#dec-004) (types established in Session 1)
- `src/model/types.ts`, `src/model/timeline.ts`

---

## DEC-010 — Auto-recombine is implicit, not an explicit pass
**Date:** 2026-05-15
**Session:** 3
**Status:** Accepted

### Context
The prototype's `tryRecombine()` ran after every drop event. It iterated every `splitOrigin` group, and if all pieces of an auto-split block had returned to the pool AND none had been edited (none demoted to `splitType: 'manual'`), it restored the original block in the pool. This was needed because the prototype tracked blocks as live entities in `state.blocks` independently of placement.

In the new model, a `PlacedBlock` *is* a placement — removing it from a `HalfTerm` removes it entirely. The "pool" is computed from the spec minus current placements. So:
- Auto-split into 3 pieces + remove all 3 = the sub-topic is automatically unplaced (no pieces in timeline)
- Auto-split into 3 + remove 2 of 3 = the third piece stays as a placed block with the original's `subTopicCode` and a partial `lessonRange`

There is no separate "restore the original" step.

### Decision
- No `tryRecombine` function or implicit pass. State of the timeline is what it is at any moment.
- Explicit recombine remains: `recombineBlock(timeline, placedBlockId)` finds every `PlacedBlock` whose `splitFrom` equals this one's group key, removes them all. Triggered by the user via the modal (Session 8).
- The prototype's "edited auto → demoted" behaviour is preserved in `editBlockLessons`: if the edited block has `splitType: "auto"`, the edit demotes it to `"manual"`. This serves the same purpose (it's a record of user intent) even though no auto-recombine pass consumes it. Future code (e.g. a "smart recombine" feature) can still distinguish edited pieces.

### Alternatives considered
- **Add a `tryAutoRecombine(timeline): Timeline` function that callers invoke after operations.** Reintroduces the cognitive overhead of "did I forget to call it?" with no functional benefit in the new model.
- **Drop the `splitType` field entirely.** Loses information that future features (smart recombine, history) might want. Keep it as user-intent metadata.

### Consequences
- Tests for the three prototype scenarios are simpler:
  - "auto-split → all to pool → recombine" reduces to "remove every piece → assert no piece remains"
  - "manual split → persist" verifies pieces still have `splitType: "manual"` after partial removal
  - "edited auto → demoted" pins the demotion behaviour in `editBlockLessons`
- The UI's "pool" view is the authority on whether a sub-topic is unplaced.

### Related
- `SPEC.md` §3.6
- `BUILD_PLAN.md` Session 3 step 3
- `reference/sow_planner_v1.html` (`tryRecombine`)
- `src/model/placement.ts`

---

## DEC-011 — Export excludes EoHT and custom-block placements from the 4 content sheets
**Date:** 2026-05-15
**Session:** 4
**Status:** Accepted

### Context
`SPEC.md` §6.1's sheet column lists all reference spec content (Topic code, Sub-topic code, Lesson No., Objective text) — fields that EoHT and custom placements don't have. The spec is silent on whether to surface them in some other column or skip them entirely.

### Decision
- The four content sheets (Topic view, Sub-topic view, Lesson view, Objective view) contain only `PlacedBlock`s whose `source.kind === "sub-topic"`. EoHT and custom placements are skipped.
- The Cover sheet's "Lessons placed" and per-year placement counts also exclude EoHT and custom placements. This matches the spec's framing of coverage as *curriculum* coverage (how much of the spec's content has been scheduled), not *time* utilisation.

### Alternatives considered
- **Include EoHT with topic code "EoHT" / sub-topic code "EoHT" in sheets 1–2.** Adds rows that don't carry curriculum content, would clutter reports for senior leadership / parents (the documented audience for the Excel export per `SPEC.md` §2.3).
- **Add a 6th "Other placements" sheet for EoHT and custom blocks.** Adds complexity for a use case nobody has asked for. The user can see EoHT placements in the planner UI; the export is for sharing the *curriculum plan*, not the test calendar.

### Consequences
- A user exporting a fully-planned timeline including EoHT tests sees a 9-lesson placed count (sub-topic content) rather than 9 + 17 = 26. Matches the "X / 25 spec lessons placed" framing of the Cover sheet.
- If users start wanting EoHT/test calendars in their exports, add a sixth sheet in v1.1+ rather than mixing types in existing sheets.

### Related
- `SPEC.md` §6.1, §2.3
- `BUILD_PLAN.md` Session 4
- `src/model/export.ts` (`buildTopicSheet`, `buildSubTopicSheet`, …, `computeCoverageStats`)

---

## DEC-012 — Coverage % is lesson-based, not objective-based
**Date:** 2026-05-15
**Session:** 4
**Status:** Accepted

### Context
`SPEC.md` §4.4 describes a Coverage indicator for the Objective view: *"247 of 250 spec objectives mapped (3 unmapped)"* — implying objective-level coverage. `SPEC.md` §6.1 is less specific: just *"summary stats (lessons placed per year, coverage %)"*.

In the current data model, every spec Objective is always nested under a spec Lesson (no detached objectives), so objective-mapping coverage is always 100%. Until the Objective view (Session 10) introduces a notion of unmapped objectives, an objective-based metric here would just mirror the lesson-based one — but with extra surface area for confusion.

### Decision
The Cover sheet's "Coverage %" is computed as:
```
sum(lessonsClaimed for sub-topic placements) / sum(subTopic.lessons.length for all subTopics)
```
rounded to 1 decimal place. Reported as e.g. `36%` or `73.5%`.

Naming on the sheet: "Coverage" — deliberately ambiguous between lesson coverage and broader "how much of the spec is scheduled". The labelled metric "Lessons placed" sits directly above it, so the reader can resolve.

### Alternatives considered
- **Objective-based: count placed objectives / total objectives.** Equivalent to lesson-based in v1 (since objectives don't detach), so produces the same number with more computation. Worth revisiting in Session 10 if Objective view introduces unmapped objectives.
- **Per-year coverage too.** Already reported as "Lessons placed / Total budget" in the per-year block — that's a *utilisation* metric, not curriculum coverage. Don't conflate.

### Consequences
- Session 10's Objective view UI may show "247 / 250 mapped" — a different metric, both legitimate. Cover sheet's number won't match if some objectives become unmapped, which is a feature: lesson coverage ≠ objective coverage in v1.1+.
- Easy to extend: when objective detachment lands, add an "Objective coverage" line to the Cover sheet.

### Related
- `SPEC.md` §4.4, §6.1
- `BUILD_PLAN.md` Session 4 step 2
- `src/model/export.ts` (`computeCoverageStats`)

---

## DEC-013 — `restoreSubjectToImport` returns orphans rather than silently dropping or refusing
**Date:** 2026-05-15
**Session:** 5
**Status:** Accepted

### Context
`BUILD_PLAN.md` Session 5 step 1.5 specifies the signature `restoreSubjectToImport(workspace, subjectId): { workspace, orphans: PlacedBlock[] }`. "Restore" resets the `workingSpec` to a clone of the immutable `importedSpec`. The question this raises: if the user has placements that reference sub-topics that exist only in `workingSpec` (because the user edited the spec or because a re-import dropped some sub-topics), what happens to them?

### Decision
The function:
1. Clones `importedSpec` into a fresh `workingSpec`.
2. Walks every `PlacedBlock` in `subject.timeline`. For `kind: "sub-topic"`, the placement survives iff its `subTopicCode` exists in the restored `importedSpec`. For `kind: "custom"`, it survives iff the `customBlockId` is still in `subject.customBlocks`. EoHT placements always survive (no source reference).
3. Returns a list of dropped placements as `orphans` alongside the updated workspace.

The caller (Session 8's UI confirmation modal) shows the user which placements were dropped before committing the restore. Dropped placements aren't put anywhere — they're discarded along with the working spec.

### Alternatives considered
- **Refuse the restore if any placement would be orphaned.** Forces the user to manually delete affected placements first. Pessimistic; the placements may be irrelevant if the user is restoring specifically to throw away stale state.
- **Keep orphan placements in the timeline.** Renders as broken cards in the UI ("missing sub-topic"). Adds runtime-validity concerns to every render path.
- **Drop orphans silently.** Loses information the user might want — "wait, where did my placements go?".

### Consequences
- Tests pin orphan behaviour for sub-topic, custom-block, and EoHT placements separately.
- Session 8's "Re-import spec" / "Restore from import" UI must show the orphan list before confirming.
- v1.1+ might add an "Unplaced bucket" container so orphans become un-placed rather than discarded — easy extension without changing the return shape.

### Related
- `SPEC.md` §3.3
- `BUILD_PLAN.md` Session 5 step 1.5
- `src/model/workspace.ts` (`restoreSubjectToImport`)

---

## DEC-014 — IPC bridge exposes file dialogs, not a generic readFile/writeFile
**Date:** 2026-05-15
**Session:** 5
**Status:** Accepted

### Context
`BUILD_PLAN.md` Session 5 step 4 says *"Wire `electron/preload.ts` with `contextBridge.exposeInMainWorld('api', { openFile, saveFile, ... })`"*. Several API shapes would meet this brief:
- **Low-level**: `showOpenDialog`, `showSaveDialog`, `readFile`, `writeFile` — four ops, renderer composes them.
- **Mid-level**: `openCurriculumFile`, `saveCurriculumFile`, `openSpreadsheetFile`, `saveSpreadsheetFile` — each does dialog + read/write atomically.
- **High-level**: `openWorkspace` (returns a `Workspace`), `saveWorkspace(ws)` (serializes inside the bridge) — pushes the model into the preload.

### Decision
Mid-level. The bridge exposes four file-flavour ops + `getAppVersion`:
- `openCurriculumFile(): Promise<{ path; json } | null>`
- `saveCurriculumFile(json, options?): Promise<{ path } | null>` — accepts `knownPath` for "Save", omits it for "Save As"
- `openSpreadsheetFile(): Promise<{ path; buffer: Uint8Array } | null>`
- `saveSpreadsheetFile(buffer, options?): Promise<{ path } | null>`
- `getAppVersion(): Promise<string>`

Each performs the dialog + I/O on the main process side. Cancelling the dialog returns `null` (not a rejection). File-content shapes differ by flavour: curriculum files are strings (JSON), spreadsheets are byte buffers.

### Alternatives considered
- **Low-level dialog + readFile/writeFile.** Renderer would have to coordinate three calls per save, opening attack surface (the renderer holds an arbitrary path). Wrong direction for `nodeIntegration: false` / `sandbox: true`.
- **High-level Workspace-shaped API.** Couples the IPC layer to the model. The Workspace type would then be imported by the preload — adds a circular cross-process dependency for marginal renderer convenience.
- **Single `openFile(filters)` / `saveFile(data, filters)`.** Pushes type discrimination onto the renderer (`buffer | string`) instead of carrying it in the function name.

### Consequences
- Renderer code reads as `const result = await window.api.openCurriculumFile()` — clear intent, no path manipulation client-side.
- Filename-default policy lives in the main process (currently `workspace.curriculum`, `curriculum-plan.xlsx`). Centralised.
- Future additions (e.g. recently-opened files, multi-file open) bolt on as new ops without breaking the existing four.

### Related
- `SPEC.md` §11.1, §11.3
- `BUILD_PLAN.md` Session 5 step 4
- `electron/main.ts`, `electron/preload.ts`, `src/types/api.d.ts`

---

## DEC-015 — Bundle the example xlsx as a hashed asset via `?url` import
**Date:** 2026-05-15
**Session:** 6
**Status:** Accepted

### Context
The Session 6 debug panel needs to "Import the bundled example file" with one click. Three options to ship the file with the app:
1. `import url from "…/example.xlsx?url"` — Vite copies the file into `dist/assets/` with a content hash and resolves the import to a hashed URL.
2. Copy to `public/example_physics_spec.xlsx` and `fetch("/example_physics_spec.xlsx")` — file lives at a stable, predictable URL.
3. Read from disk at runtime via the IPC bridge — bypasses Vite entirely.

### Decision
Option 1 (`?url` asset import). The DebugPanel does `import exampleUrl from "../../examples/example_physics_spec.xlsx?url"; fetch(exampleUrl)`.

### Alternatives considered
- **`public/` copy.** Avoids a Vite-specific syntax but duplicates the file in two places (`examples/` for tests, `public/` for runtime). One file is the source of truth and accidental drift between them is a paper cut waiting to happen.
- **Read from disk via IPC.** Couples the renderer to the absolute filesystem path of the example, which depends on whether the app is running unpacked (dev) or installed (packaged). Solvable, but more code for the same outcome.

### Consequences
- Cache-busting is automatic (filename hashes).
- TypeScript needs `vite/client` in `tsconfig.json` `types` for the `?url` declaration — already present from Session 0.
- The example xlsx is part of the renderer bundle (~30 KB). For v1.1+ when more example files might be useful, the same pattern scales.

### Related
- `BUILD_PLAN.md` Session 6 step 3
- `src/components/DebugPanel.tsx`
- `tsconfig.json` (`types: ["vite/client", "node"]`)

---

## DEC-016 — Subject tab menu via `⋯` + native right-click, not a styled context menu component
**Date:** 2026-05-15
**Session:** 7
**Status:** Accepted

### Context
`BUILD_PLAN.md` Session 7 step 3 specifies *"right-click for tab menu (close, rename, restore to import)"*. Right-click alone is a discoverability tax — most users won't think to right-click a tab in a desktop app. There are three sensible ways to surface the actions:
1. Per-tab `⋯` button + right-click (both open the same menu)
2. A persistent settings cog on every tab
3. Hover-revealed actions inline on the tab

### Decision
Option 1. Every subject tab shows a `⋯` glyph after the name. Clicking it (or right-clicking anywhere on the tab) opens a dropdown menu with Rename…, Restore to imported spec…, Close subject (warn-coloured). The menu closes on mouse leave or after any action.

### Alternatives considered
- **Settings cog (option 2).** Adds visual weight to every tab including ones the user never edits. Worse default state.
- **Hover actions (option 3).** Discoverable but cramped; tabs are narrow.
- **Right-click only.** Matches the build plan literally but tests poorly with first-time users.

### Consequences
- `Rename…` uses `window.prompt`; Session 12 can upgrade to inline editing without changing the menu surface.
- The dropdown is positioned with `absolute` and isn't a portal — it'll be clipped at the header bottom in very rare narrow-window cases. Acceptable for v1.
- The same `⋯` affordance scales to future per-subject actions (Duplicate, Change colour, etc.).

### Related
- `SPEC.md` §8.4
- `BUILD_PLAN.md` Session 7 step 3
- `src/components/SubjectTabs.tsx`

---

## DEC-017 — Term→term drag uses `moveBlock` (no spillover); spillover applies only to pool→term placements
**Date:** 2026-05-15
**Session:** 8
**Status:** Accepted

### Context
The prototype's `onDrop` handler runs `spilloverPlace` on every drop into a term, including drags from one term to another. In the new model, a `PlacedBlock` has an `id` and a `splitFrom` chain. Re-creating it as fresh auto-split pieces during a term-to-term move would discard those identifiers and replace them with new ones, losing any user-applied edits in `userEdits` and breaking any "recombine" intent.

### Decision
- **Pool → term**: respect `subject.config.autoSpillover`. If on, use `placeBlockWithSpillover` (may produce multiple auto-split pieces in consecutive half-terms). If off, use `placeBlock` (single placement; over-budget allowed, surfaced in the StatusBar).
- **Term → term**: always use `moveBlock`. The placement keeps its id and any edits. If the target is too small, the new term goes over-budget (warning red in the cell header and StatusBar).
- **Term → pool**: use `removeBlock`. The sub-topic returns to the pool by virtue of the unplaced-lessons computation in `getPoolEntries`.

If the user wants to split an existing placement to fit, they use the modal's Split action — explicit, identity-preserving.

### Alternatives considered
- **Match the prototype: spillover on every term drop.** Loses placement identity on every drag; surprising when a single-piece placement becomes three auto-pieces just for being moved one column. Users can re-spillover by removing and re-dragging from pool.
- **Only spillover for over-budget targets, regardless of source.** Slightly nicer than "always", but still breaks identity. The Split modal is a cleaner control surface for the same outcome.

### Consequences
- Documentation/screencasts that show "drag a too-big block from a term to another term and watch it split" will need a different demonstration — drag from pool instead.
- Identity is preserved for `userEdits.title` overrides etc. through any sequence of moves.
- Possible v1.1+ improvement: a "spillover" cursor modifier (Shift+drag) that opts in to split-on-move.

### Related
- `SPEC.md` §3.6
- `BUILD_PLAN.md` Session 8 step 6
- `reference/sow_planner_v1.html` (`onDrop`, `spilloverPlace`)
- `src/components/SubTopicView.tsx` (`handleDragEnd`)

---

## DEC-018 — Example xlsx lives in `public/` and is loaded via `fetch` from the empty-state UI
**Date:** 2026-05-15
**Session:** Post-8 (CI/Pages setup)
**Status:** Accepted

### Context
The Session 6 DebugPanel imported the example via Vite's `?url` (`import url from "…/example.xlsx?url"`). When Session 7 replaced the DebugPanel as the default route, the import became unreachable from the entry tree, Vite's tree-shaking dropped it, and the xlsx stopped being bundled. The bug surfaced when preparing the GitHub Pages deploy: the renderer hosted in a browser had no way to load the example because there was no IPC bridge and no bundled asset to fetch.

### Decision
- Place the example file at `public/example_physics_spec.xlsx`. Vite's `publicDir` copies it verbatim to `dist/example_physics_spec.xlsx` on every build, regardless of import-graph reachability.
- The empty-state view (`ViewPlaceholder` / `EmptyWorkspace`) renders a "Load example file" button that does `fetch(new URL("./example_physics_spec.xlsx", document.baseURI))` → `importSpec` → `addSubject`. Works under both `file://` (Electron) and `https://…/curriculum-planner/` (Pages).
- The empty-state also detects `typeof window.api === "undefined"` and shows a short note that file dialogs are Electron-only — so the Pages deploy is honest about its constraints.
- `examples/example_physics_spec.xlsx` stays as the canonical fixture for tests. The `public/` copy is a static-serving duplicate; if the example schema changes, regenerate both via `examples/build_example.py`.

### Alternatives considered
- **Re-introduce the `?url` import somewhere always-rendered.** Works, but the bundled URL has a content hash and isn't a stable URL — bad for screenshots and external links.
- **Lazy-import the DebugPanel and keep the `?url` import.** Adds plumbing for a debug-only artefact.
- **Always serve from a CDN.** No: the spec is offline-only (`SPEC.md` §1.1).

### Consequences
- The same renderer build artefact works as both the Electron renderer and the public Pages prototype.
- The example is now a duplicated file (one in `examples/`, one in `public/`). Drift risk: low — both come from `build_example.py` and the test suite would catch a behavioural difference.
- Future "Load template" or "Load fully-placed example" buttons follow the same pattern.

### Related
- `BUILD_PLAN.md` Session 6 step 3
- `vite.config.ts` (`base: "./"`)
- `public/example_physics_spec.xlsx`
- `src/components/ViewPlaceholder.tsx` (`EmptyWorkspace`)
- `.github/workflows/pages.yml`

---

## DEC-019 — CI + Pages workflows; no installer build in CI yet
**Date:** 2026-05-15
**Session:** Post-8 (CI/Pages setup)
**Status:** Accepted

### Context
The user wanted GitHub Actions configured to deploy a browser-viewable prototype. Three workflow categories were available: continuous integration (typecheck + tests), GitHub Pages renderer deploy, and Electron installer build on tag push. The repo's Pages source was already set to "GitHub Actions".

### Decision
Two workflows:
1. **`.github/workflows/ci.yml`** — runs on every push to `main` and every pull request. `npm ci`, then typecheck, unit tests, and renderer build. `ELECTRON_SKIP_BINARY_DOWNLOAD=1` to skip the ~80 MB Electron download (we never run Electron in CI).
2. **`.github/workflows/pages.yml`** — runs on push to `main` and `workflow_dispatch`. Builds the renderer and deploys `dist/` to Pages via `actions/upload-pages-artifact@v3` + `actions/deploy-pages@v4`. `concurrency: { group: pages, cancel-in-progress: false }` so rapid pushes don't kill a deploy mid-flight.

No installer build workflow yet — `electron-builder` lives in Session 14 and is the natural home for Windows/macOS installer artefacts attached to GitHub Releases.

### Alternatives considered
- **Single workflow with multiple jobs.** Two files is clearer; CI gates merges to `main`, Pages is the deploy artefact. Different lifecycles, different triggers.
- **Build installers on tag push now.** Premature — `electron-builder` config isn't done (Session 14), and macOS code signing needs setup we don't have.
- **Cancel in-progress Pages deploys.** Rejected: cancelling a mid-flight deploy can leave the site half-broken if `actions/deploy-pages@v4` is part-way through atomic upload. Better to queue.

### Consequences
- Every push to `main` runs both workflows. CI must pass for the build to be useful, but Pages will still attempt to deploy even if CI fails (separate workflows, no dependency). Acceptable for now — Pages failures are loud in the Actions UI.
- A future improvement: gate the Pages workflow on CI passing via a `workflow_run` trigger. Skipped for v1 simplicity.

### Related
- `BUILD_PLAN.md` Session 14 (where installer CI belongs)
- `.github/workflows/ci.yml`
- `.github/workflows/pages.yml`
- [DEC-018](#dec-018)

---

## DEC-020 — Per-lesson drag uses `extractAndMoveLesson`, which always produces `splitType: "manual"` pieces
**Date:** 2026-05-15
**Session:** 9
**Status:** Accepted

### Context
The Lesson view exposes individual lesson cards within a `PlacedBlock`'s lessonRange. Dragging a single lesson to another half-term must split the source block as needed:
- Lesson at the start of a range → shrink range from the left
- Lesson at the end → shrink range from the right
- Interior lesson → split into two surviving pieces around it
- Sole lesson → remove the source block entirely

`BUILD_PLAN.md` Session 9 step 4 also mentions adjacency-merging: *"either extends an existing PlacedBlock (if it's the adjacent lesson of the same sub-topic) or creates a split"*.

### Decision
- New `extractAndMoveLesson(timeline, placedBlockId, localLessonIdx, toTermId, options?)` placement op handles all four shape cases.
- The moved lesson and the (zero, one, or two) survivors all get `splitType: "manual"` and share the same `splitFrom` group key — the original block's `splitFrom` if it had one, otherwise the original block's id. Recombine still gathers every piece across the timeline.
- **Adjacency-merging is deferred.** Dropping a lesson into a half-term that already has a placed block of the same sub-topic produces an independent piece, not a merged extended range. Cleanly testable, predictable, and the recombine action exists to flatten any messes after the fact.

### Alternatives considered
- **Use the existing `splitBlock` + `moveBlock`.** Doesn't work cleanly for interior lessons because `splitBlock` splits at one position and produces two pieces; an interior-lesson extraction needs three operations (split-left, split-right, move-one). Composing them is more lines than just writing the extract op.
- **Merge on adjacency at drag time.** Tempting but layers a second concept (merging) on top of placement. Tests for "where do my pieces go after this drag?" become "where would they go assuming merging rules, given the current adjacency?" — harder to reason about. Defer to a polish pass.

### Consequences
- Lesson view drag-to-extract is implemented in one store action + one model function, with 7 unit tests covering edges, interior, sole-lesson, splitFrom chain preservation, same-term no-op, and error paths.
- A user wanting to clean up multiple pieces uses the BlockEditModal's "Recombine" action (still wired in the Lesson view because lesson cards open `BlockEditModal` for EoHT/custom placements).

### Related
- `SPEC.md` §4.3
- `BUILD_PLAN.md` Session 9 step 4
- `src/model/placement.ts` (`extractAndMoveLesson`)
- `src/components/LessonView.tsx` (`handleDragEnd`)
- [DEC-017](#dec-017) (term→term drag in Sub-topic view, identity-preserving)

---

## DEC-021 — Lesson edits commit to the working spec only; `importedSpec` remains immutable
**Date:** 2026-05-15
**Session:** 9
**Status:** Accepted

### Context
The `LessonEditModal` lets the user edit lesson title, practical, depth, separate-only, and the objectives list. `SPEC.md` §3.3 establishes the two-spec model: `importedSpec` is immutable, edits land in `workingSpec`. The model module `specEdits.ts` exposes `updateLesson`, `setLessonObjectives`, and `appendLesson` as pure spec→spec functions.

### Decision
Store actions `editLesson`, `setLessonObjectives`, and `addLesson` always operate on `subject.workingSpec`. The `importedSpec` is never touched by the Lesson view. The user can call `restoreSubjectToImport` (Subject Tab menu) to discard all working-spec edits and reset.

### Alternatives considered
- **Edit both specs simultaneously.** Defeats the purpose of having an immutable baseline.
- **Soft-delete via a "userEdits" overlay on lessons (like `PlacedBlock.userEdits.title`).** Would let the user revert per-lesson with no spec change, but compounds the tree's complexity: every reader (export, view, validation) would need to apply the overlay. The two-spec model is simpler.

### Consequences
- Restoring to imported spec drops every Lesson view edit. Documented and intentional.
- Lesson title/practical/flags edits are propagated to all four views via the shared `workingSpec` — no cross-view sync code needed.
- `Lesson.id` is stable across edits, so placements (which use `subTopicCode` + `lessonRange` index, not `Lesson.id`) keep working even if titles change.

### Related
- `SPEC.md` §3.3, §4.3
- `BUILD_PLAN.md` Session 9 step 5
- `src/model/specEdits.ts`
- `src/store/useWorkspaceStore.ts` (`editLesson`, `setLessonObjectives`, `addLesson`)
- [DEC-013](#dec-013) (`restoreSubjectToImport` returns orphans)
