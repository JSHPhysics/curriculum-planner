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

---

## DEC-022 — Unmapped objectives are derived by id-diff against `importedSpec`, not stored separately
**Date:** 2026-05-16
**Session:** 10
**Status:** Accepted

### Context
`SPEC.md` §4.4 calls for a side panel of "Unmapped objectives — objectives that exist in the spec but aren't currently mapped to any lesson". The data model nests objectives under lessons, so there's no canonical place to "park" an objective that the user has removed from one lesson and not yet placed in another. Three ways to surface "unmapped":
1. Add `Subject.unmappedObjectives: Objective[]` and shuttle objectives in/out of it explicitly
2. Derive the unmapped list at read time by comparing `importedSpec` vs `workingSpec`
3. Allow only "move between lessons" — never "remove without target", which sidesteps unmapped entirely

### Decision
Option 2. `computeObjectiveCoverage(subject)` walks `importedSpec` and emits any objective whose id isn't in `workingSpec`. This works because every Objective has had a stable `id` since Session 2 (Objective ids are generated at import or when the user adds a new one via the Lesson view).

Consequences for behaviour:
- Removing an objective from a working-spec lesson makes it appear in the unmapped panel iff its id is in `importedSpec` (i.e. it's a spec objective). User-added objectives just disappear when removed.
- Dragging an unmapped objective onto a lesson restores it under its original id and text from `importedSpec` (the user's working-spec edits to that objective don't persist through the unmapped round-trip, because there's no working-spec record while unmapped — there's nowhere to attach them).
- Coverage % = `mappedCount / importedCount`, independent of user-added objectives.

### Alternatives considered
- **Option 1 (explicit storage).** More code (extra field, serialisation, restore-to-import logic), but lets unmapped objectives carry working-spec edits. Not worth it for v1: the user can always restore-then-edit.
- **Option 3 (no unmapped concept).** Cleanest, but loses the §4.4 coverage warning that the spec specifically calls out as a value.

### Consequences
- The unmapped panel is always in sync without separate state.
- Restoring a subject to import (`restoreSubjectToImport`) wipes the working spec back to imported spec, so the unmapped list resets to empty automatically — no special handling needed.
- Future: if users want unmapped objectives to carry edits, add an explicit `unmappedObjectives` field and migrate. Easy because reads can fall back to the derivation when the field is absent.

### Related
- `SPEC.md` §3.3, §4.4
- `BUILD_PLAN.md` Session 10 step 3
- `src/model/objectives.ts` (`computeObjectiveCoverage`)
- [DEC-021](#dec-021) (working spec is the editable side)

---

## DEC-023 — Drag-to-pool ("unmap") and drag-from-pool ("restore") on the Objective view; no objective-level reorder within a lesson
**Date:** 2026-05-16
**Session:** 10
**Status:** Accepted

### Context
`BUILD_PLAN.md` Session 10 lists four drag interactions on the Objective view:
- (a) Drag an objective from one lesson onto another
- (b) Drag an unmapped objective onto a lesson
- (c) Reorder objectives within a lesson
- Plus an implied (d) Drop a lesson's objective onto the unmapped panel to remove it

`SPEC.md` §4.4 names (a), (b), (d) explicitly but not (c). The current `LessonEditModal` already supports per-lesson reorder via up/down arrows.

### Decision
- **(a) lesson → lesson:** `placeObjectiveInLesson(objectiveId, toSubTopicCode, toLessonId)` — a store action that resolves the objective from working spec (or imported spec if unmapped), removes it from its current lesson, and appends to the target.
- **(b) unmapped → lesson:** same store action; the objective is found in `importedSpec` and appended to the target lesson under its original id.
- **(d) lesson → unmapped panel:** `removeObjective(objectiveId)`. The objective becomes unmapped automatically iff it's a spec objective. User-added objectives disappear.
- **(c) intra-lesson reorder:** *deferred*. The Lesson view's modal already supports this via arrow buttons, and dnd-kit's sortable mode would require nested DndContexts or sortable-strategy plumbing that adds complexity for a marginal win. v1.1+ can layer it on with `@dnd-kit/sortable`.

Same-target drops are no-ops in the store (no spurious dirty flag).

### Alternatives considered
- **Add `@dnd-kit/sortable` and support (c).** Possible but the drag-and-drop UX for fine-grained reordering of small chips is fiddly; users already have the modal. Skip for v1.
- **Make "drop on unmapped panel" do nothing for unmapped-source chips.** Already the case — handler guards `drag.fromLessonId !== null`.

### Consequences
- The view supports the three core SPEC §4.4 interactions cleanly.
- Reordering is via the modal, consistent with the Lesson view.
- A user-added (non-spec) objective dropped on the unmapped panel is destroyed. Acceptable for v1 (the user added it, they can re-add it); a future "trash bin" pool could replace this if needed.

### Related
- `SPEC.md` §4.4
- `BUILD_PLAN.md` Session 10 steps 4–5
- `src/components/ObjectiveView.tsx` (`handleDragEnd`)
- `src/store/useWorkspaceStore.ts` (`placeObjectiveInLesson`, `removeObjective`)
- [DEC-020](#dec-020), [DEC-022](#dec-022)

---

## DEC-024 — Topic-view drag is per-half-term, identity-preserving; no spillover on topic move
**Date:** 2026-05-16
**Session:** 11
**Status:** Accepted

### Context
`SPEC.md` §4.1 says a "Topic block" is "the aggregation of all that topic's placed sub-topic blocks in that half-term", and "Drag a topic to move *all* its sub-topics together to a different half-term (subject to capacity / spillover)". The phrase "subject to capacity / spillover" is ambiguous: is the *whole topic* subject to spillover (auto-splitting across multiple target half-terms), or is the per-block identity preserved (per [DEC-017](#dec-017)'s term→term policy in Sub-topic view)?

### Decision
- **Per-half-term aggregation.** A Topic block is per `(topicCode, halfTermId)`. If T2 has placements in Y9-A1 and Y9-A2, the user sees *two* T2 blocks (one per cell). Dragging the Y9-A1 block only moves the Y9-A1 placements; the Y9-A2 ones stay put.
- **Identity-preserving.** `moveTopicInHalfTerm(topicCode, fromTermId, toTermId)` iterates the source cell's placed blocks of that topic and calls `moveBlock` on each. Ids, `splitFrom` chains, `userEdits`, and existing `splitType` values all survive.
- **No spillover on the moved bundle.** If the target cell goes over budget, the StatusBar warning fires — same UX as Sub-topic view term→term drag ([DEC-017](#dec-017)). The user can split individual pieces from Sub-topic view if needed.
- **Excludes EoHT / custom placements from the topic-block aggregation.** Consistent with [DEC-011](#dec-011). The cell still shows a "+NL EoHT / custom" footer chip so the user sees overall load, but those placements aren't part of any draggable topic block.

### Alternatives considered
- **Whole-topic Topic block (sum across all half-terms).** Easy aggregation but the drag UX collapses: dragging "T2 (15L across 3 half-terms)" into a single target cell would have to spillover-redistribute, breaking identity for every piece. Worse, the user can't tell which half-term's piece they're moving from.
- **Spillover the bundle on overflow.** Tempting for first-time users but loses identity for every sub-block in the move, breaking any per-placement edits. SPEC.md §4.1 also says "Cannot split or recombine topics from Topic view (must go to sub-topic view)" — spillover would *create* splits as a side effect of a move.
- **Include EoHT/custom in the topic-block aggregation.** They don't belong to a topic, so they can't be moved as part of one. Surfacing them as a non-draggable footer is the honest middle.

### Consequences
- The Topic view is the cleanest place to see "T2 spans three half-terms" because each cell shows one T2 block; the user reads spatial sequence from the calendar grid.
- Bulk moves work without surprising the user: drag T2 Y9-A1 → Y9-A2; if T2 Y9-A2 already existed there it now has two T2 placements in the same cell (the breakdown bar reflects that). No silent merging — the Sub-topic view can recombine if the user wants.
- Cross-cell moves use `moveTopicInHalfTerm` as a single store action, which folds into one dirty flag and one autosave debounce.

### Related
- `SPEC.md` §4.1
- `BUILD_PLAN.md` Session 11 steps 2–3
- `src/model/topics.ts` (`getTopicBlocksForCell`, `getPlacedBlockIdsForTopicInCell`)
- `src/components/TopicView.tsx` (`handleDragEnd`)
- `src/store/useWorkspaceStore.ts` (`moveTopicInHalfTerm`)
- [DEC-011](#dec-011), [DEC-017](#dec-017)

---

## DEC-025 — Unsaved-changes prompt: 2-button Discard/Cancel, not 3-button Save/Discard/Cancel
**Date:** 2026-05-16
**Session:** 12
**Status:** Accepted

### Context
`SPEC.md` §9.3 says "Window close while dirty prompts 'Unsaved changes — save before closing?'", which reads as a 3-button dialog (Save / Don't save / Cancel — the OS-standard pattern). Implementing the Save path from a `close` event on the Electron main process requires:
1. A round-trip IPC call to the renderer to serialise the workspace
2. A second IPC call to perform the file dialog + write (or composing the existing save IPC inside main)
3. Handling the case where the user cancels the dialog *during* the close-confirmation flow (do we close anyway? cancel everything?)

That's a fair amount of plumbing for a confirm-and-discard pattern that's already the harder half of the SPEC's intent.

### Decision
The Electron `close` interceptor shows a 2-button dialog: `Cancel` (keep window open, default) and `Discard unsaved changes` (set bypass flag, re-issue close). Renderer also installs a `beforeunload` listener for the browser/Pages build, which triggers the native browser confirm prompt.

If the user wants to save, they cancel the close dialog and use the Save button in the header — the same UI that's already wired and that they're familiar with. The dialog message text explicitly nudges them to do this.

### Alternatives considered
- **Full 3-button OS-standard dialog.** Better fidelity to the SPEC's literal wording but requires either (a) plumbing a Save round-trip through IPC on close, or (b) having main process call `dialog.showSaveDialog` directly with serialised state — but main doesn't know the workspace state, that's a renderer concern. The IPC choreography for "ask renderer to save, wait for confirmation it succeeded, then close" is non-trivial and error-prone for marginal UX gain.
- **Block close in renderer and never let main get the event.** Doesn't work cleanly — `beforeunload` is a hint, not a guarantee; Electron specifically needs to handle window close at the main-process level.
- **No close prompt.** Loses §9.3 requirement.

### Consequences
- The user sees a single clear question instead of three options.
- A future polish pass can add a "Save now" button to the dialog by wiring an IPC round-trip if user feedback says they want it.
- The `app:setDirty` IPC pushes dirty state on every change; small overhead but it keeps main's view of dirtiness fresh without polling.

### Related
- `SPEC.md` §9.3
- `BUILD_PLAN.md` Session 12 step 5
- `electron/main.ts` (`win.on("close")`, `app:setDirty` handler)
- `electron/preload.ts` (`setDirty`)
- `src/App.tsx` (`beforeunload` + `window.api.setDirty(dirty)`)
- [DEC-014](#dec-014) (IPC bridge pattern)

---

## DEC-026 — Restore-to-import uses a preview function + commit-on-confirm modal
**Date:** 2026-05-16
**Session:** 12
**Status:** Accepted

### Context
Session 7 wired Restore via the Subject tab menu directly to `restoreSubjectToImport`, surfacing dropped placements via `alert()` *after* the mutation had committed. SPEC §7.6 specifies a confirmation modal with "orphaned placements surfaced as a list to review", which implies showing orphans *before* committing.

### Decision
Add a pure `previewRestoreSubjectToImport(workspace, subjectId): { subject, orphans }` to `workspace.ts` that runs the same orphan-collection logic but doesn't return a new workspace. The UI:

1. User clicks Restore in the tab menu → App.tsx calls the preview function and opens `RestoreToImportModal` with the result
2. Modal shows orphan count, list with breadcrumbs (sub-topic name, lessons claimed, lessonRange), and Cancel/Confirm buttons
3. On Confirm → calls the commit `restoreSubjectToImport` store action and closes the modal

`previewRestoreSubjectToImport` is `O(placements)`; cheap enough to call synchronously on every modal open without memoisation.

### Alternatives considered
- **Compute orphans inside the modal component itself.** Same logic but couples the modal to the implementation details of orphan-collection; the workspace module is the right home.
- **Keep the alert-after pattern.** Loses the "review before committing" semantic of SPEC §7.6 — and worse, undo doesn't exist, so the user can't recover from a mistaken click.

### Consequences
- 3 new workspace tests pin the preview function (orphan happy path, no-orphans path, unknown-subject throw).
- The modal is also a natural place to put a future "Save these orphans as custom blocks" action if v1.1+ user feedback wants it.
- `restoreSubjectToImport` still exists with its original signature — `previewRestore` is an additive function, no breaking changes.

### Related
- `SPEC.md` §3.3, §7.6
- `BUILD_PLAN.md` Session 12 step 2
- `src/model/workspace.ts` (`previewRestoreSubjectToImport`)
- `src/components/RestoreToImportModal.tsx`
- `src/App.tsx` (`handleRestore`, `confirmRestore`)
- [DEC-013](#dec-013) (`restoreSubjectToImport` returns orphans)

---

## DEC-027 — Import template generator lives in its own module, not in import.ts
**Date:** 2026-05-16
**Session:** 12
**Status:** Accepted

### Context
SPEC §5.5 calls for "Download import template" producing a blank `.xlsx` with header row and example rows. Two reasonable homes:
1. Extend `src/model/import.ts` with a `generateImportTemplate()` export, since it deals with the same column conventions
2. New module `src/model/importTemplate.ts`

### Decision
New module. `import.ts` already exports a lot (`importSpec`, validation types, header constants); adding template generation would make it the kind of file that's about two things. A dedicated module also makes it cheap to extend the template later (per-subject example rows, multi-template selector, etc.) without touching import.

### Alternatives considered
- **Extend `import.ts`.** Smaller surface, but mixes the "parse a user file" intent with "produce a starter file" intent.
- **Put generation in the renderer.** Worse — the column definitions duplicate across files and drift over time. Keeping it in the model means the test suite catches drift via the round-trip test.

### Consequences
- Template round-trips cleanly through `importSpec` → verified by `tests/model/importTemplate.test.ts` so any future change to column names or merge rules breaks the test, not the user.
- The empty-state UI (`EmptyWorkspace`) and the Electron save dialog share the same single source of truth for what a template looks like.

### Related
- `SPEC.md` §5.1, §5.5
- `BUILD_PLAN.md` Session 12 step 4
- `src/model/importTemplate.ts`
- `src/components/ViewPlaceholder.tsx` (`downloadTemplate`)

---

## DEC-028 — Playwright tests run against the Vite renderer with a mocked `window.api`, not the packaged Electron app
**Date:** 2026-05-16
**Session:** 13
**Status:** Accepted

### Context
`BUILD_PLAN.md` Session 13 step 2 says "Run on Windows and macOS via electron-builder packaged build". But electron-builder configuration is Session 14's job, and the renderer is the entire UI surface — `window.api` is a 5-method bridge to `dialog.showOpenDialog` etc., not load-bearing UI logic. Running the full Electron app under Playwright (`_electron.launch`) requires a packaged binary and adds tens of seconds to every test run; it pays off only for things that *only* break in the Electron context (preload context-isolation, OS dialogs, file-path handling). Those are best smoke-tested by hand in Session 14 after packaging works.

### Decision
Playwright runs against `npm run dev:vite` (renderer only). A test fixture (`tests/e2e/fixtures.ts`) installs a `window.api` mock via `page.addInitScript` before every test:
- `openCurriculumFile` / `openSpreadsheetFile` — no-op by default (tests use the in-renderer "Load example" path which uses `fetch`, not the IPC bridge)
- `saveCurriculumFile` / `saveSpreadsheetFile` — write to an in-process `Map<path, file>`. The mock exposes a `window.__testHooks.listFiles()` inspector so tests can assert "a `.curriculum` file was written" without leaving the renderer.
- `setDirty` — no-op
- `getAppVersion` — returns `"1.0.0-test"`

Real Electron-only smoke tests (file dialogs, app close confirm, OS integration) are deferred to a manual Session 14 checklist.

### Alternatives considered
- **Playwright + `_electron.launch` against a packaged build.** Truer to the production environment but requires Session 14 first and dwarfs run time. Build plan's exit criterion "all e2e tests pass on Windows and macOS" is met by manual smoke-test of the installed app.
- **Vitest + jsdom + React Testing Library.** Faster but no real DOM rendering, drag-and-drop testing is extremely fiddly with jsdom + dnd-kit, and you lose the "real Chrome layout / pointer events" fidelity that catches dnd-kit regressions.
- **Playwright in browser mode without `window.api`.** Loses ability to verify Save / Export / Open flows even at the renderer level — those just no-op when `window.api === undefined`.

### Consequences
- The 10 E2E scenarios run in ~12 seconds against the Vite dev server (cold) — fast enough to run on every commit.
- The mock surface is the same single source of truth as `src/types/api.d.ts`. If we add an IPC method, the mock breaks until it implements it — which is the right friction.
- dnd-kit drag-and-drop works in Playwright via multi-step `page.mouse.move` (4px activation threshold + a multi-step move to the target). Documented inline in `tests/e2e/drag-and-edit.spec.ts`.
- Session 14 still owns "does it actually launch + dialog + save + open on Windows and macOS". A short manual checklist in the SESSION_LOG is fine — the renderer side is already proven.

### Related
- `SPEC.md` §15 acceptance criteria (verified end-to-end where feasible)
- `BUILD_PLAN.md` Session 13 steps 1–2
- `playwright.config.ts`
- `tests/e2e/fixtures.ts`
- [DEC-014](#dec-014) (IPC bridge surface — the thing being mocked)
- [DEC-019](#dec-019) (CI workflows — Session 13 doesn't yet add e2e to CI; could be a future addition)

---

## DEC-029 — Icon assets are committed; `sharp` + `png2icons` are dev-only tools for regeneration
**Date:** 2026-05-16
**Session:** 14
**Status:** Accepted

### Context
`SPEC.md` §15 acceptance criterion #8 ("App icon shows correctly") and BUILD_PLAN Session 14 step 2 ("App icon — design one matching the palette") need an icon for every supported platform: `.ico` for Windows, `.icns` for macOS, `.png` for Linux. Generating those from a single SVG source needs an SVG rasteriser and a multi-size container builder.

Two ways to handle this:
1. Generate on every CI run from `build/icon.svg` (no committed binaries, deterministic from source)
2. Commit the generated `.png/.ico/.icns` and treat the tooling as a developer convenience for when the source changes

### Decision
Option 2. The generated icon files are committed under `build/`. `sharp` and `png2icons` are added as devDependencies and consumed by `scripts/generate-icons.mjs` (wired as `npm run build:icons`). Contributors edit `build/icon.svg`, run `npm run build:icons`, and commit all four files.

### Alternatives considered
- **Option 1 (regenerate on every build).** Cleaner provenance, but adds ~40s of CI time on each release run for an artefact that changes once per year and requires no per-build inputs. Also forces the release workflow to install `sharp` (which has prebuilt platform binaries — easy on Win/Mac, occasionally fiddly on Linux Docker images).
- **A separate `icon-builder` package.** Adds an indirection for a single command's worth of code; the inline script is 50 lines and a future contributor can read it in one sitting.
- **Skip the icon for v1 and use Electron's default.** Acceptance criterion #8 explicitly disallows.

### Consequences
- Three small binary files (~530 KB total) live in the repo under `build/`. Acceptable.
- New devDeps `sharp@^0.33.5` and `png2icons@^2.0.1` — both well-maintained, dev-only, small footprint after `sharp`'s ~60MB platform binary (only installed on contributor machines, not in CI's release path since the icons are committed).
- The release workflow doesn't depend on icon-generation tooling at all — it just reads the pre-built files.

### Related
- `SPEC.md` §15 acceptance criterion #8
- `BUILD_PLAN.md` Session 14 step 2
- `build/icon.svg`, `build/icon.png`, `build/icon.ico`, `build/icon.icns`
- `scripts/generate-icons.mjs`
- `package.json` (`build:icons` script + devDependencies)

---

## DEC-030 — Release workflow builds installers on three platforms via GitHub Actions matrix; no code signing in v1
**Date:** 2026-05-16
**Session:** 14
**Status:** Accepted

### Context
`SPEC.md` §1.1 promises Windows + macOS + Linux desktop builds. The author works on Windows; macOS and Linux installers need to be produced on their native runners (electron-builder can cross-compile some targets but DMG and AppImage are reliably native-only). BUILD_PLAN.md Session 14 step 5: "Code signing left for a future phase (note in release notes that the app is unsigned)".

### Decision
`.github/workflows/release.yml` runs an `os` matrix (`windows-latest`, `macos-latest`, `ubuntu-latest`) on tag push (`v*`) or `workflow_dispatch`. Each runner:
1. Installs deps, typechecks, runs unit tests, builds renderer + electron main
2. Runs `electron-builder` with the native target (NSIS + portable on Win, DMG on Mac, AppImage on Linux)
3. Uploads its artefacts via `actions/upload-artifact@v4`

A `release` job downloads everything and attaches them to a GitHub Release via `softprops/action-gh-release@v2`. Pre-release detection: any tag with a `-` (e.g. `v1.0.0-beta.1`) is marked pre-release.

No code signing: `electron-builder` logs "no signing info identified, signing is skipped" on both Windows and macOS. Users will see SmartScreen / Gatekeeper warnings on first launch. Documented in the release-notes generator (auto-derived from commits between tags).

### Alternatives considered
- **Build all three from a single Linux runner via cross-compile.** macOS DMG can't be built off-macOS without ugly workarounds; AppImage works but the win + linux split provides nothing.
- **Code signing now.** Requires (Win) a Windows code-signing cert (~£200/yr) and (macOS) an Apple Developer account + notarization round-trip. Out of scope for a v1 personal-use desktop tool.
- **Pin to specific runner versions (e.g. `windows-2022`).** Not yet necessary; `*-latest` is fine until GitHub starts rotating defaults more aggressively.

### Consequences
- Cutting a release: `git tag v1.0.0 && git push origin v1.0.0` — the workflow takes ~10 minutes wall-clock per OS in parallel (~12 min total) and the GitHub Release appears with three installer assets attached. `workflow_dispatch` lets you re-run a release manually.
- First-launch on Windows: SmartScreen warning ("Windows protected your PC" → More info → Run anyway). On macOS: right-click → Open the first time. Document in the release notes.
- Adding signing later: pin the cert via `WIN_CSC_LINK` / `CSC_LINK` repo secrets and electron-builder picks them up automatically; no workflow rewrite needed.

### Related
- `SPEC.md` §1.1, §11.5
- `BUILD_PLAN.md` Session 14 steps 1–5
- `.github/workflows/release.yml`
- `electron-builder.json`
- [DEC-019](#dec-019) (existing CI / Pages workflows)

---

## DEC-031 — Retrieval-suggestion algorithm: weighted gap with depth/difficulty bonuses; deterministic, no AI
**Date:** 2026-05-17
**Session:** 15
**Status:** Accepted

### Context
The user asked for an in-app way to "suggest retrieval topics for a given half-term — the app looks back, considers spacing, and suggests which topics might benefit from retrieval questions as part of tests/homework/lesson starters." They explicitly required this work for any imported curriculum without any AI/LLM component (per `SPEC.md` §1.2). The challenge: produce a defensible ranking of "which previously-taught sub-topics would benefit most from retrieval right now?" using only the structural properties of the (Spec × Timeline) data the user already authored.

### Decision
A pure scoring function in `src/model/retrievalSuggestions.ts`:

```
gapScore        = clamp(halfTermsSinceLastTouch / 12, 0, 1)
depthBonus      = hasDepthContent ? 0.15 : 0
difficultyBonus = (difficulty - 1) * 0.1              // 0, 0.1, 0.2
recentnessPenalty = totalPlacementsToDate > 1 ? -0.1 : 0
score = clamp(gapScore + depthBonus + difficultyBonus + recentnessPenalty, 0, 1)
```

Rationale, per signal:
- **gapScore** is the dominant term. Bigger gap → bigger retrieval payoff (Bjork's "desirable difficulties"). Peak at 12 half-terms (~1 school year of HTs out of our 17 across Y9–Y11).
- **depthBonus** rewards sub-topics flagged `isDepth` at import time, or containing any `isDepth` lesson. The user has signalled at authoring time that these matter; surface them more aggressively.
- **difficultyBonus** uses the sub-topic's `difficulty` (1–3) field, again user-authored. Harder content benefits more from spaced retrieval.
- **recentnessPenalty** nudges single-touch sub-topics above already-revisited ones. If something has been taught 3 times, a 4th retrieval prompt is less valuable than revisiting something taught only once.

All weights and the gap normalisation constant live at the top of the file as named constants. Tuning later (after user feedback) is a one-line change without touching algorithm shape.

### Alternatives considered
- **Forgetting-curve simulation** (e.g. Ebbinghaus exponential decay per touch). Mathematically tidier but adds the obligation to pin a decay constant per learner / per content — there's no defensible single value. The piecewise weighted approach is simpler and produces the same qualitative ordering for v1.
- **AI/LLM-driven suggestions** considering semantic similarity between topics. Out of scope per `SPEC.md` §1.2 and offers no clear advantage over structural ranking for a teacher who knows their content.
- **Pure gap, no other signals.** Cleanest but loses the user-authored depth/difficulty signals that should pull the ranking towards content the user already deems important.
- **Per-objective scoring** (rather than per-sub-topic). Considered, but each objective lives inside a lesson inside a sub-topic — placement gaps are per-sub-topic in practice. Keeping the unit at sub-topic level matches the UI surface (the eventual button will be on a `BlockEditModal` or `CustomBlockModal` already scoped to that granularity).

### Consequences
- **Subject-agnostic.** No hardcoded topic names, no per-curriculum tuning — works for physics, history, languages, any spec the user imports.
- **Deterministic.** Same inputs → same outputs. Reproducible across runs and contributors.
- **Easy to tune.** All five constants are at the top of the file; changing one is a 30-second edit + re-run of `npm test`.
- **Easy to test.** The score is a pure number from numeric inputs; tests can pin specific orderings (e.g. "T1a 12HT-gap single-touch outscores T1b 3HT-gap twice-touched").
- **No UI commitment.** The engine returns ranked `RetrievalCandidate[]`; the renderer (added in a follow-up session) can present them as chips in a panel, suggestions on the Block modal, or any other surface.
- **Algorithm is one of many that would work.** Documented so future contributors know what was considered and why this shape was chosen; a v1.1+ rework with real user data is fine and expected.

### Related
- `SPEC.md` §1.1 (in-scope), §1.2 (no AI), §14 (per-objective auto-schedule still deferred)
- `src/model/retrievalSuggestions.ts`
- `src/model/spacing.ts` (provides the underlying `getPlacementHistory` data)
- `tests/model/retrievalSuggestions.test.ts`

---

## DEC-032 — Retrieval weights are tunable per-subject via `subject.config.retrievalWeights`; canonical pedagogical rationale lives in `docs/PEDAGOGY.md`
**Date:** 2026-05-17
**Session:** 17
**Status:** Accepted

### Context
[DEC-031](#dec-031) shipped the retrieval-suggestion engine with hard-coded weights ("v1 deliberately simple, tunable in one file"). After real use, the user asked for two things:
1. The ability to adjust the weights themselves from within the UI, per subject (different subjects might weight depth differently — a Maths plan probably cares less about the "depth" flag than a Triple Science plan)
2. Explicit, in-app pedagogical justification for every weight — written for a pedagogically competent reader (Bjork's desirable difficulties, Cepeda's spacing meta-analysis, Roediger's testing effect — not consumer-tier "studies show…" hand-waving)

### Decision
**Tunability:**
- Add `RetrievalWeights` type (all fields optional) to `src/model/types.ts`.
- Extend `SubjectConfig` with optional `retrievalWeights?: RetrievalWeights`. Optional everywhere — existing `.curriculum` files load unchanged with all weights falling through to defaults.
- Export `DEFAULT_RETRIEVAL_WEIGHTS: Required<RetrievalWeights>` and `resolveRetrievalWeights(subject, options?)` from `src/model/retrievalSuggestions.ts`. The resolution order is: `options.weights` (per-call override) → `subject.config.retrievalWeights` (persistent per-subject) → `DEFAULT_RETRIEVAL_WEIGHTS`, field-by-field.
- UI: a collapsible `WeightsEditor` inside `RetrievalSuggestionPopover` with sliders + numeric inputs + "Reset to defaults" button. Edits flow through `updateActiveSubjectConfig({ retrievalWeights: { ... } })` and immediately re-rank the candidate list above the editor.

**Pedagogical surface:**
- A new `docs/PEDAGOGY.md` is the canonical reference, written in pedagogical prose with bibliography. Sections cover: the two principles (spacing + interleaving), why the planner surfaces them as structural concerns, what each spacing-panel flag means, and what each retrieval-weight does, plus what the engine deliberately does NOT do.
- Every weight in the `WeightsEditor` ships with a `<details>` "Why this weight?" disclosure summarising the docs entry — same content, condensed.
- Every section in the `SpacingPanel` ships with a `<details>` "Why this matters →" disclosure with 1–3 paragraphs of pedagogical reasoning, citing the same sources as the docs.
- Both `<details>` use the native browser disclosure widget — no animation/JS framework, accessible by default.

### Alternatives considered
- **User-global retrieval weights** (one tuning across all subjects). Simpler storage but loses the per-subject pedagogical flexibility the user explicitly asked for. Subject is the right granularity because the depth/difficulty flags themselves are spec-authored per subject.
- **Workspace-level weights** (one tuning that affects every subject in the workspace). Same downside as user-global, with worse storage semantics.
- **Inline rationale text in the UI without a separate `docs/PEDAGOGY.md`.** Considered, but the prose grew long enough to merit a single canonical file; the UI now condenses, the docs explain in depth. This also lets contributors and readers find the reasoning without running the app.
- **A modal-in-modal weights editor** rather than inline `<details>`. Considered, but stacking modals is fiddly and the editor is short enough to live inline. Also: the user is likely tuning weights *in response to* the candidate list they're looking at — having both on screen simultaneously is the right UX.
- **Auto-tune weights by classroom outcomes.** Out of scope per SPEC.md §1.2 (no AI/ML); even if it were in scope, the planner has no student-performance signal.

### Consequences
- Per-subject weights persist in `subject.config`, so they round-trip through `.curriculum` files. A subject saved with custom weights opens with those weights everywhere it loads.
- Existing `.curriculum` files load unchanged: missing `retrievalWeights` falls through to defaults, and the deserialiser doesn't touch the new optional field.
- The pedagogical disclosures are progressive: the casual reader sees one-line section descriptions; clicking "Why this matters →" reveals 1–3 paragraphs with sources; `docs/PEDAGOGY.md` is one further click away (file path mentioned in the disclosure).
- Future contributors can re-tune defaults by editing the `DEFAULT_RETRIEVAL_WEIGHTS` constant. Per-user/per-subject preferences override.
- All weights are deterministic constants — no ML, no learned values — preserving DEC-031's auditability guarantee.

### Related
- `SPEC.md` §1.1 (in-scope), §1.2 (no AI)
- `docs/PEDAGOGY.md` (canonical reference)
- `src/model/types.ts` (`RetrievalWeights`, `SubjectConfig.retrievalWeights`)
- `src/model/retrievalSuggestions.ts` (`DEFAULT_RETRIEVAL_WEIGHTS`, `resolveRetrievalWeights`)
- `src/components/RetrievalSuggestionPopover.tsx` (`WeightsEditor`, `WeightRow`)
- `src/components/SpacingPanel.tsx` (`Section` rationale disclosures)
- [DEC-031](#dec-031) (parent: the engine itself)

---

## DEC-033 — Spacing-panel flag thresholds are tunable per-subject via `subject.config.spacingThresholds`
**Date:** 2026-05-17
**Session:** 18
**Status:** Accepted

### Context
The Spacing panel surfaces four flags (single-touch, unplaced, blocked cells, well-spaced) computed against four numeric thresholds in `src/model/spacing.ts`: `BLOCKED_CELL_MIN_LESSONS = 4`, `BLOCKED_CELL_DOMINANT_SHARE = 0.8`, `WELL_SPACED_MIN_PLACEMENTS = 3`, `WELL_SPACED_MIN_MEAN_GAP = 4`. The user's working principle is "allow flexibility" — the thresholds should be user-tunable like the retrieval weights from DEC-032, with the same "click for more info" pedagogical rationale for each default.

### Decision
Same pattern as DEC-032, applied to the spacing thresholds:
- Add `SpacingThresholds` type (all four fields optional) to `src/model/types.ts`
- Extend `SubjectConfig` with optional `spacingThresholds?: SpacingThresholds`
- Export `DEFAULT_SPACING_THRESHOLDS: Required<SpacingThresholds>` and `resolveSpacingThresholds(subject)` from `src/model/spacing.ts`
- `getSpacingFlags` resolves thresholds internally; no signature change
- UI: a `ThresholdsEditor` lives inside the SpacingPanel's expanded view (full-width across the 4-column grid) behind a "⚙ Tune thresholds for this subject" `<details>` disclosure. Each threshold has a slider + numeric value + "Why this default?" sub-disclosure with a paragraph of pedagogical rationale
- `docs/PEDAGOGY.md` gains a new §4b covering all four thresholds with citations

The four defaults' pedagogical justifications (summarised; full prose in `docs/PEDAGOGY.md`):
- **blockedCellMinLessons = 4**: Approximates a teaching week, the empirical threshold past which fluency-illusion effects from blocked practice start hurting later transfer (Rohrer & Taylor 2007).
- **blockedCellDominantShare = 0.8**: 80%+ = "essentially the whole cell". Below ~55% the meaning inverts (healthy interleaving gets flagged as blocked); the slider clamps at 0.5 to prevent this.
- **wellSpacedMinPlacements = 3**: Two placements give one gap (which could be coincidence); three give two gaps, which reads as intentional spacing design.
- **wellSpacedMinMeanGap = 4**: 4 half-terms ≈ 24 weeks ≈ inside Cepeda et al.'s (2006) optimal ISI window for year-end retention.

### Alternatives considered
- **A single combined "Pedagogy settings" modal** covering both spacing thresholds and retrieval weights. Considered, but the two are conceptually different (thresholds = where do we flag, weights = how do we rank) and live near different UI surfaces (SpacingPanel vs RetrievalSuggestionPopover). Keeping them co-located with the thing they affect is better UX.
- **Workspace-level thresholds** (one tuning across all subjects). Consistent with DEC-032's per-subject decision — different subjects might legitimately want different cell-dominance thresholds.
- **Hardcoded thresholds with no UI tuning** (the v1 status). Rejected per the user's "allow flexibility" principle, but worth noting: the defaults are pedagogically defensible, so the typical user can ignore the tuner entirely.
- **Lower-bound clamps on the dominant-share slider**. Set at 0.5 (UI) to prevent the meaning-inversion. Below 0.5 the engine would flag every cell with two evenly-split topics as "blocked", which contradicts the pedagogical definition of blocked practice.

### Consequences
- Existing `.curriculum` files load unchanged: missing `spacingThresholds` falls through to defaults
- Per-subject thresholds persist in `subject.config.spacingThresholds` and round-trip through `.curriculum` files
- The Spacing panel's flag pills re-evaluate immediately on any slider change (the same `getSpacingFlags(subject)` call runs through the memo)
- The four threshold "Why this default?" disclosures expose the pedagogical literature without forcing the user to read it — same progressive-disclosure pattern as DEC-032

### Related
- `SPEC.md` §1.1 (in-scope), §1.2 (no AI)
- `docs/PEDAGOGY.md` §4b (canonical reference for the thresholds)
- `src/model/types.ts` (`SpacingThresholds`, `SubjectConfig.spacingThresholds`)
- `src/model/spacing.ts` (`DEFAULT_SPACING_THRESHOLDS`, `resolveSpacingThresholds`, refactored `getSpacingFlags`)
- `src/components/SpacingPanel.tsx` (`ThresholdsEditor`, `ThresholdRow`)
- [DEC-031](#dec-031), [DEC-032](#dec-032) (sibling decisions on the retrieval side)

---

## DEC-034 — Calendar template is workspace-level; YearId widens to Y7–Y13; per-cell `budgetOverride` rescues hand-tuned lesson counts
**Date:** 2026-05-17
**Session:** 19
**Status:** Accepted

### Context
SPEC §1.1 originally hardcoded a single LEHS calendar (17 half-terms across Y9–Y11 with hand-tuned per-cell lesson budgets). To support other schools — primary, KS3-only, KS5, schools with different cycle frequencies, different term lengths, different bank-holiday patterns — the calendar needs to be user-configurable. The user explicitly asked for this as feature #2 ahead of #3 (the first-startup wizard) so the wizard has machinery to write to.

Three architectural choices needed pinning down:
1. **Year-group scope**: which year groups to support
2. **Calendar storage**: per-subject or workspace-level
3. **How to express per-cell capacity** when the simple formula doesn't capture real-world irregularities (bank holidays, INSET days)

### Decision
**Year groups: widen to Y7–Y13 (UK secondary range).**
- `YearId = "Y7" | "Y8" | "Y9" | "Y10" | "Y11" | "Y12" | "Y13"`
- New `ALL_YEAR_IDS` constant for UI iteration
- Existing `.curriculum` files with Y9/Y10/Y11 values validate unchanged
- Views (TopicView, LessonView, StatusBar, TimelineGrid) now derive their year list from `getTimelineYears(timeline)` — a new helper that returns years actually present in the timeline, sorted in canonical Y7→Y13 order. Schools that teach only KS3 see only Y7–Y9 rows; KS5-only schools see Y12–Y13; etc.

**Calendar storage: workspace-level template, per-subject override.**
- `workspace.calendarTemplate?: CalendarTemplate` (optional). New subjects inherit the template via `applyCalendarTemplate()`; existing subjects keep their per-Subject timelines unchanged.
- Per-subject override is implicit: each Subject still owns its `Timeline`, so a teacher can edit one subject's calendar without affecting others. The workspace template is the *initial value* for new subjects, not a runtime constraint.
- Migration: workspaces without `calendarTemplate` (legacy `.curriculum` files) behave as before — `createDefaultTimeline()` produces the LEHS structure via `applyCalendarTemplate(DEFAULT_CALENDAR_TEMPLATE)`.

**Per-cell capacity: derived by formula, override per cell.**
- Template defines `cycleLengthInWeeks` (1, 2, or 3 — the school's timetable cycle) and `lessonsPerCyclePerYear` (a `Partial<Record<YearId, number>>`).
- Each `CalendarHalfTerm` has `weeks` and an optional `budgetOverride: number`. Derived budget = `ceil(lessonsPerCycle × weeks ÷ cycleLength)`; override (if set) takes precedence.
- Why override exists: real schools have irregular cells (a 5-week half-term might actually fit 11 lessons not 10 because of when INSET days fall; an exam fortnight might give 14 lessons of teaching despite being labelled 6 weeks). Forcing teachers to pick between "principled formula" and "accurate counts" would be hostile. The default LEHS template uses overrides for every cell to reproduce the original hand-tuned values exactly.

### Alternatives considered
- **Fully arbitrary year labels** (any string: "Y9", "P5", "S3", "Grade 11"). More flexible but exhaustive switch statements lose safety, and the canonical Y7→Y13 ordering depends on the union. Defer to a future iteration if international users need it.
- **Per-subject calendar with a "Copy from existing subject" action**. Simpler model but high friction for schools with many subjects on one calendar. Workspace-level template + per-subject override is the right default.
- **No `budgetOverride`; force users to express everything through the cycle/weeks formula.** Mathematically clean but loses information — bank holidays vary year-by-year and cell-by-cell, and a teacher who knows "I actually get 11 lessons in this cell" shouldn't have to fudge the cycle length to make it work.
- **Calendar as a separate top-level entity rather than embedded in Workspace.** Adds indirection without buying anything; the Workspace already owns the activeSubjectId and other workspace-scope state.

### Consequences
- Existing `.curriculum` files load unchanged: `calendarTemplate` is absent, fall-through to LEHS default
- New subjects added after a template is set use the configured calendar
- Existing subjects are NOT auto-rewritten — they keep their per-Subject timelines until the user explicitly edits them. (Auto-rewrite would clobber placements; needs a "preview orphans" UX which is deferred.)
- The four views all support arbitrary year ranges automatically — no hardcoded `["Y9", "Y10", "Y11"]` arrays anywhere in the renderer
- The `📅 Calendar` button in the header opens `CalendarSettingsModal` for editing the workspace template
- LEHS users see no behavioural change — `DEFAULT_CALENDAR_TEMPLATE` uses `budgetOverride` for every Y9–Y11 cell to reproduce the original 12/12/11/9/13/9 etc. budgets exactly

### Related
- `SPEC.md` §1.1 (in-scope)
- `BUILD_PLAN.md` (no entry — this is post-v1 work)
- `src/model/types.ts` (`YearId`, `ALL_YEAR_IDS`, `CalendarHalfTerm`, `CalendarTemplate`, `Workspace.calendarTemplate`)
- `src/model/timeline.ts` (`DEFAULT_CALENDAR_TEMPLATE`, `applyCalendarTemplate`, `getTimelineYears`, refactored `createDefaultTimeline`)
- `src/components/CalendarSettingsModal.tsx`
- `src/components/Header.tsx` (📅 button)
- `src/components/TopicView.tsx`, `LessonView.tsx`, `TimelineGrid.tsx`, `StatusBar.tsx` (all refactored to derive years from data)
- `src/store/useWorkspaceStore.ts` (`setCalendarTemplate`)
- Future: feature #3 (first-startup wizard) will use `setCalendarTemplate` as its commit hook; feature #1 (folder + weekly export) will use the `startDate`/`endDate` fields for accurate weekly schedules.

---

## DEC-035 — Per-subject calendar overrides live on `Subject.calendarTemplate`; orphans surfaced before commit
**Date:** 2026-05-17
**Session:** 20
**Status:** Accepted

### Context
DEC-034 established a workspace-level `CalendarTemplate` that new subjects inherit. Real schools have specialised subjects whose calendars diverge from the workspace default — A-level subjects might cover Y12–Y13 only while the workspace template is configured for Y9–Y11; a vocational subject might have a different cycle length; or a teacher might want to tweak one subject's half-term week-counts without touching others. The user explicitly requested per-subject editing as the first follow-up to DEC-034.

The second question was how to handle the workspace template changing after subjects already exist. Today, the change only affects new subjects. The user agreed that existing subjects should optionally be brought along, but only with a clear preview of what would be lost (placements whose half-term ids disappear from the new template).

### Decision
**Per-subject template lives on `Subject.calendarTemplate?: CalendarTemplate`.**
- Optional; when absent, the subject is "matching whatever the workspace template (or LEHS default) was at the time of subject creation".
- When present, this template is the source of truth for the subject's calendar shape, used both for display (the modal opens seeded from it) and for re-application (e.g. if the user later edits the workspace template and chooses to re-apply, this subject's per-subject template gets replaced).
- Stored alongside `Subject.timeline` (not derived from it) so the modal can faithfully edit cycle length and lessons-per-cycle, which aren't recoverable from the timeline alone.

**`applyTemplateToSubject(subject, template)` is the canonical transform.**
- Pure function: returns `{ timeline, orphans }`. Caller decides whether to commit.
- Preserves placements whose half-term `id` exists in the new template; orphans the rest.
- `previewApplyTemplateToSubject(subject, template)` returns just the orphans, for confirmation UI.

**`CalendarSettingsModal` is dual-mode** via a `scope` prop:
- `{ kind: "workspace" }` — edits `workspace.calendarTemplate`. "Reset" clears the workspace template; new subjects fall back to the LEHS default.
- `{ kind: "subject", subjectName }` — edits `subject.calendarTemplate`. "Reset" reverts the subject to the workspace template (or LEHS default if none). Header copy adjusts to make the scope visible.

**Re-apply-to-existing flow** via the workspace save path:
- After saving a non-null workspace template, if any subjects exist, prompt: "Also re-apply to all N existing subjects?"
- If yes: call `reapplyWorkspaceTemplateToAllSubjects()`, which iterates each subject through `applyTemplateToSubject` and returns a `Map<subjectId, orphans>`.
- Show a per-subject breakdown of any orphans discarded.

**`CalendarOverview` strip** sits below StatusBar — read-only horizontal layout showing the current subject's calendar structure, year-coloured chips per half-term, click to focus a cell. Collapsible.

### Alternatives considered
- **Per-subject template inferred from the timeline.** Lossy — cycle length and lessons-per-cycle aren't recoverable from per-cell budgets alone. Would force the modal to guess sensible defaults every time it opens, frustrating users who explicitly set a cycle length.
- **Forbid per-subject overrides; only workspace-wide.** Simpler but blocks the legitimate use case of "A-level chemistry is Y12–Y13 only, GCSE physics is Y9–Y11".
- **Auto-apply workspace template changes to all subjects, always.** Surprising — a teacher tweaking the workspace template (maybe to test a new cycle length) would silently lose all their per-subject placements. Manual opt-in with orphan preview is the right level of friction.
- **Subject mode's "Reset" should revert to the LEHS default, not the workspace template.** Inconsistent with "subject inherits from workspace"; reverting to the workspace template is the principled meaning of "reset" in this scope.

### Consequences
- Existing `.curriculum` files load unchanged: `subject.calendarTemplate` is absent, behaves as before.
- A subject that's never been calendar-edited shows the workspace template (or LEHS default) when opened in the editor.
- A subject that's been calendar-edited persists its own template independently of later workspace template changes — until the user explicitly re-applies the workspace template.
- The 📅 Calendar overview strip is always visible (and remembers its expanded state via component state, not localStorage — that's fine; it defaults to expanded which is the useful state).
- Future feature #5 (KS classification + hideable year groups) will benefit from the per-subject template separation — a KS3 subject's template can have a different year-group set from a KS5 subject's.

### Related
- `SPEC.md` §1.1 (in-scope)
- `src/model/types.ts` (`Subject.calendarTemplate?`)
- `src/model/workspace.ts` (`applyTemplateToSubject`, `previewApplyTemplateToSubject`)
- `src/store/useWorkspaceStore.ts` (`setSubjectCalendarTemplate`, `reapplyWorkspaceTemplateToAllSubjects`)
- `src/components/CalendarSettingsModal.tsx` (`scope` prop, dual-mode copy)
- `src/components/CalendarOverview.tsx`
- `src/components/SubjectTabs.tsx` ("📅 Edit calendar for this subject" tab menu item)
- `src/App.tsx` (`calendarTarget` state, scope-routed modal rendering, reapply confirm flow)
- [DEC-034](#dec-034) (parent: workspace-level template)

---

## DEC-036 — Key-stage classification + hideable year groups (render-time filter, not data deletion)
**Date:** 2026-05-17
**Session:** 21
**Status:** Accepted

### Context
With YearId widening to Y7–Y13 (DEC-034), schools can have subjects spanning any UK key stage range. Two related needs surfaced:
1. **Classification** — let teachers tag each subject with its key stage (KS3, KS4, KS5) so the system knows what it's looking at and can filter accordingly. Auto-detect from year groups present where unambiguous, but allow override.
2. **Hideable year groups** — let a teacher focused on (say) GCSE Y10–Y11 visually hide Y9 (or any other year) from every view without deleting the underlying placements. Exports should also respect this — teachers don't want unwanted years in their xlsx output.

The user explicitly chose "just hideable years, no combined view" — no multi-subject combined-timeline mode in this session. Each subject remains its own entity; the visibility filter is per-subject.

### Decision
**Classification:**
- New `KeyStage = "KS3" | "KS4" | "KS5"` type and optional `Subject.meta.keyStage?: KeyStage`
- `inferKeyStage(timeline)` in `timeline.ts` returns the KS when the timeline's years all fall within one KS range (KS3=Y7–Y9, KS4=Y9–Y11, KS5=Y12–Y13). Returns `null` when straddled (e.g. Y8+Y10) so the user can pick manually.
- Auto-applied at import (both the spec import flow and the example-loader path) — derives from the timeline produced by the active calendar template.
- Shown as a small badge next to the subject name in SubjectTabs.
- Set manually via "Set key stage…" in the subject tab menu (prompt for KS3/KS4/KS5 or `(unset)`).

**Hideable years:**
- New `Subject.config.hiddenYears?: readonly YearId[]` — optional array of years the user has hidden FROM VIEWS AND EXPORTS, but not from the underlying timeline. Placements in hidden years are untouched.
- `getVisibleTimelineYears(subject)` is the canonical helper for the render path; `getTimelineYears(timeline)` remains for the case where you genuinely want every year (e.g. the CalendarOverview, which shows hidden years too — but greyed out, with an eye toggle to unhide).
- All four content views (TopicView, LessonView, SubTopicView via TimelineGrid, ObjectiveView via its row source) and the StatusBar now derive their year list from `getVisibleTimelineYears`.
- CalendarOverview is the toggling surface: each year row has an eye icon (`✕` when visible, `👁` when hidden). A "Show all years" link appears when anything is hidden.
- `computeCoverageStats(subject, { respectHiddenYears: true })` opts into the filter; the Cover sheet uses this. All four content sheets (Topic, Sub-topic, Lesson, Objective) call a `visibleHalfTerms(subject)` helper that skips hidden-year cells.

**Deliberate non-scope:**
- **No combined-multi-subject view** (user's choice). Each subject is still rendered alone; the hideable-years filter is per-subject, not workspace-wide.
- **Spacing analytics still see hidden years.** "Unplaced" / "single-touch" warnings can include sub-topics that would belong to hidden-year cells. Acceptable for v1 — the analytics surface is informational, and filtering them by visibility would risk hiding genuine warnings the user wanted. Can revisit if it gets noisy in practice.
- **No "this subject only teaches this key stage" hard constraint.** A KS4 subject can still have Y12 cells if the calendar template includes them; the badge is descriptive, not prescriptive.

### Alternatives considered
- **Workspace-level hidden years** (one filter for all subjects). Simpler but loses per-subject granularity — a teacher focused on Y10-Y11 in one subject might still want to see all years for another.
- **Hidden = delete placements.** Aggressive; loses information. The render-time filter preserves the user's work and is reversible.
- **KS as derived-only (not stored).** Re-derive from timeline at every read. Lossy when a Y9 spec is being taught as KS3 vs KS4 — the user's stated intent matters. Storing it explicitly with auto-detect as a default is the right balance.
- **Per-view hideable years** (different hides in Topic vs Lesson view). Too granular; the user wants to focus on a slice, not toggle per-view.

### Consequences
- Existing `.curriculum` files load unchanged — both new optional fields are absent.
- A teacher opening the example sees a `KS4` badge appear next to "GCSE Physics 1PH0 (example)" automatically.
- Hiding Y9 collapses every Y9 row in every content view, removes Y9 from the per-year StatusBar bars, and excludes Y9 placements from any subsequent xlsx export.
- Unhiding restores everything immediately (no data loss).
- Future feature #1 (folder + weekly export) will respect hidden years by default — already covered by the `respectHiddenYears` plumbing.

### Related
- `SPEC.md` §1.1 (in-scope)
- `src/model/types.ts` (`KeyStage`, `Subject.meta.keyStage?`, `Subject.config.hiddenYears?`)
- `src/model/timeline.ts` (`inferKeyStage`, `getVisibleTimelineYears`)
- `src/model/export.ts` (`computeCoverageStats({ respectHiddenYears })`, `visibleHalfTerms` shared helper)
- `src/components/CalendarOverview.tsx` (eye toggles + "Show all years")
- `src/components/SubjectTabs.tsx` (KS badge + Set key stage menu)
- `src/store/useWorkspaceStore.ts` (`setSubjectKeyStage`, `toggleYearVisibility`, `setSubjectHiddenYears`)
- All four views (`TopicView`, `LessonView`, `TimelineGrid`, `StatusBar`) refactored to `getVisibleTimelineYears`
- [DEC-034](#dec-034) (parent: year-group widening)

---

## DEC-037 — Analytics scoped by key stage; Y9 disambiguated by subject KS metadata
**Date:** 2026-05-17
**Session:** 22
**Status:** Accepted

### Context
After DEC-036 added KS classification + hideable year groups, the user requested that pedagogical analytics (spacing flags and retrieval suggestions) treat key stages as separate learning contexts by default. The reasoning: a sub-topic taught once in KS3 (Y9) and once in KS4 (Y9 or Y10) is not really "spaced practice of the same content" in pedagogical terms — KS3 and KS4 versions of "forces" cover different depths and have different student cohorts. Cross-KS spacing analytics should be an opt-in for the rare case where it's actually wanted.

Two related concerns:
1. **Spacing analytics in hidden years.** Per DEC-036, hiding a year is the user's signal "this isn't in my planning scope." Analytics flagging unplaced/single-touch sub-topics in hidden years was noise — surface filtering wasn't enough; the engine itself needed to filter.
2. **Y9 ambiguity.** Y9 is officially KS3 (Y7–Y9) but many schools start a 3-year GCSE in Y9, making it KS4. Without disambiguation, the engine can't know which bucket a Y9 placement belongs to.

### Decision
**Hidden years are filtered at the analytics-engine layer.**
- `getPlacementHistory(subject, code)` skips placements in `subject.config.hiddenYears`. All downstream helpers (`getSpacingProfile`, `getSpacingProfilesAll`, `getSpacingFlags`) inherit the filter automatically.
- `getInterleavingScoresAll(subject)` skips hidden-year cells in the rolled-up sweep.
- Side effect: a sub-topic placed only in hidden years now appears as "unplaced" — semantically "unplaced from your visible scope". Tested explicitly.

**Y9 disambiguated by `subject.meta.keyStage`.**
- New `getKeyStageForYear(year, subjectKs?): KeyStage` helper in `timeline.ts`
- Default mapping: Y7/Y8 → KS3; Y9 → KS3; Y10/Y11 → KS4; Y12/Y13 → KS5
- When `subjectKs` is provided AND Y9, the subject's tag wins (Y9 in a KS4-tagged subject is KS4). The subject tag is ignored for years that aren't ambiguous (a KS5-tagged subject's Y9 is still KS3 — you can't redefine reality).

**Spacing analytics are per-KS by default.**
- New `getSpacingFlagsByKeyStage(subject): ReadonlyMap<KeyStage, SpacingFlags>` returns one bucket per KS represented in the visible timeline.
- Implementation: for each visible KS, build a "scoped subject view" that hides all years not in this KS (layered on top of the user's existing hiddenYears), call `getSpacingFlags` on it. Reuses the existing flag-computation logic exactly.
- A sub-topic taught once in KS3 and once in KS4 is single-touch in BOTH buckets, not a 2-placement spread.
- `getSpacingFlags(subject)` (the combined view) is kept for callers that want the cross-KS analysis.
- `SpacingPanel` renders one fieldset per KS when there are >1 visible KSes, with a "Combine across key stages" toggle to opt back into the single combined view. Single-KS subjects see the existing single-section layout (no extra UI).

**Retrieval suggestions are KS-restricted by default.**
- New `SuggestRetrievalOptions.restrictToContextKeyStage?: boolean` (default `true`).
- When true, candidates are filtered to those whose previous placements share the context cell's KS.
- `RetrievalSuggestionPopover` adds a checkbox "Include cross-KS revisits" — only rendered when the subject's visible timeline spans multiple KSes (otherwise the toggle would do nothing). Off by default. The context's KS is shown in the helper text.

**Inline KS picker** in the subject tab menu replaces the previous text `prompt()`:
- Three radio-style buttons KS3 / KS4 / KS5 + a "none" button to clear
- Single-click commits the value; the menu closes
- Active button highlighted with the navy primary colour

### Alternatives considered
- **Single combined view by default, per-KS as opt-in.** Less surprising in the single-KS case (no toggle), but conflicts with the user's stated pedagogical preference. Reversed.
- **Treat Y9 always as KS3 (DfE definition).** Theoretically correct but ignores classroom reality — many schools teach Y9 as the start of GCSE. The disambiguation via subject tag is the pragmatic answer.
- **Computed KS per placement (from import metadata).** Would require the spec to declare which KS each sub-topic belongs to. Out of scope; the year + subject KS combination is sufficient.
- **Filter "unplaced" warnings to exclude sub-topics that would only land in hidden years.** Considered, but a sub-topic the spec defines that has NO valid placement is still meaningful — "you've hidden every year this could go in" is itself a planning signal. Kept as a warning.

### Consequences
- Existing single-KS subjects (the vast majority) see no UI change — toggles don't appear, sections render as before.
- Multi-KS subjects (rare, e.g. a hypothetical Y9-Y13 mega-spec) now show per-KS analytics by default. Teacher gets independent spacing flags per KS.
- Retrieval popover from a Y10 cell on a KS3-tagged subject's timeline will not suggest Y8 placements — they're in a different KS. Cross-KS toggle reverses this.
- Tests had to opt in: the existing `retrievalSuggestions.test.ts` fixture now sets `meta.keyStage = "KS4"` to keep Y9-Y11 in one KS bucket (otherwise default Y9→KS3 broke the cross-Y9/Y10 spacing tests).
- The "noise reduction" intent is real: hidden-year analytics filtering means a teacher hiding Y7/Y8 stops seeing warnings about content they've chosen not to engage with.

### Related
- `SPEC.md` §1.1 (in-scope), `docs/PEDAGOGY.md` (the rationale doc; will be updated with §6 explaining KS scoping at next polish)
- `src/model/timeline.ts` (`getKeyStageForYear`, `getVisibleKeyStages`)
- `src/model/spacing.ts` (hidden-year filter in `getPlacementHistory`, `getInterleavingScoresAll`; `getSpacingFlagsByKeyStage`)
- `src/model/retrievalSuggestions.ts` (`restrictToContextKeyStage` option)
- `src/components/SpacingPanel.tsx` (per-KS `KeyStageGroup` + combine toggle)
- `src/components/RetrievalSuggestionPopover.tsx` ("Include cross-KS revisits" checkbox)
- `src/components/SubjectTabs.tsx` (inline KS radio-button row)
- [DEC-036](#dec-036) (parent: KS classification + hideable years), [DEC-031](#dec-031) (retrieval engine), [DEC-033](#dec-033) (spacing thresholds)

## DEC-038 — Preset layouts: three deterministic placement algorithms with replace-and-rebuild semantics
**Date:** 2026-05-17
**Session:** 22
**Status:** Accepted

### Context
A planner that starts every subject empty pushes the teacher into a sea of drag-and-drop choices with no anchor. The "right" first plan depends on pedagogy — spacing (Bjork), interleaving (Rohrer), or coverage-first frontloading — but the user shouldn't have to know the literature to get a starting point. We want to ship three opinionated layout algorithms that turn an imported spec into a complete, deterministic plan in one click, then let the user drag-and-drop to refine.

Constraints:
1. **Subject-agnostic.** The algorithms use only structural data: spec-row order, depth flags, lesson counts. No LLM, no learned weights, no per-subject heuristics.
2. **Deterministic.** Same input → same output every time. Tests assert this.
3. **Bounded scope.** Each algorithm is ~50 LOC, all weights in one file, tunable in one place. Pedagogical opinions should be readable from the code.

### Decision
Three presets ship under `src/model/presets.ts`:

1. **`three-spiral`** — each foundation sub-topic placed THREE times across thirds of the timeline. Depth sub-topics (when `includeDepth` is on) placed twice (passes 2 and 3 only). Per-pass lesson counts split N as `(ceil, mid, floor)` — first pass slightly larger when N isn't divisible by 3. Strong spacing; weakest depth-per-pass.
2. **`frontloaded`** — single linear pass. Foundation sub-topics in source order across the front of the timeline; depth sub-topics across the back third. Maximises depth-per-treatment; weakest spacing.
3. **`interleaved`** — single linear pass via round-robin across topics: T1.a, T2.a, T3.a, …, T1.b, T2.b, … Neighbouring placements come from different topics whenever possible. Strong topic-contrast; same coverage as frontloaded with different ordering.

**Replace-and-rebuild semantics.** `applyPreset(subject, presetId)` returns a fresh Timeline: existing sub-topic placements are dropped, EoHT blocks and custom blocks are preserved at their current locations. The UI confirms before invoking, exposing the existing-placement count so the user can't accidentally wipe hand-tuned work. Per user choice: "Replace (with confirm)" over "Apply only if empty" or "Merge into empty cells only" — simpler mental model, easier-to-explain semantics, easy to revert via save-restore.

**Algorithm-level honoured config:**
- `subject.config.includeDepth` — when false, depth sub-topics are skipped entirely regardless of preset.
- `subject.config.hiddenYears` — hidden years receive no placements; the visible-cell list is computed once at the top of `applyPreset` and threaded through.
- `subject.config.autoSpillover` — implicitly honoured because the algorithms use `placeBlockWithSpillover` for all placements.

**A `summarisePreset(subject, presetId)` preview helper** is exposed alongside `applyPreset`, used by `PresetPickerModal` to show placement count / total lessons / depth-skipped warnings before commit. This lets the teacher compare the three options without applying-then-undoing.

**Demo spec expansion (companion change).** The bundled `example_physics_spec.xlsx` was 25 lessons across 5 topics — enough to test import paths but not to make the preset layouts visually distinct. Expanded to 66 lessons across all 15 Edexcel 1PH0 topics and 33 sub-topics. A new `scripts/build-example-spec.mjs` (Node, uses xlsx) replaces the Python `build_example.py` as the cross-platform source-of-truth; wired into `npm run build:example-spec`. Output committed to both `examples/` (reference) and `public/` (fetched by `EmptyWorkspace`).

### Alternatives considered

- **"Apply only if empty"** semantics. Safer (no overwrite) but adds a frustrating "you need to Restore first" step every time the user wants to compare two presets. Rejected.

- **"Merge into empty cells only"**. Most flexible but the resulting layout depends on what's already there — the same preset on two subjects looks different, defeating the "opinionated starting point" intent. Rejected.

- **One preset that the user tunes** (e.g. a single algorithm with sliders for spacing intensity / depth distribution). More elegant in theory; in practice teachers don't have time to learn the parameter space. Three discrete options with one-line descriptions ship the pedagogy more honestly.

- **A "blank canvas" preset** that just places one block per cell. Considered as a starter for users who want to plan manually but still want a "fill the cells" affordance. Decided against — the empty timeline + drag-from-pool flow already covers this case.

- **Configurable round-robin width for interleaved** (mix 2-at-a-time vs 3-at-a-time vs every topic). Adds a parameter for a barely-perceptible change to most users. Rejected; v1 is "every topic, every round."

### Known sharp edges (documented in code)
- **Spillover into hidden years.** `placeBlockWithSpillover` advances through the underlying timeline.halfTerms — if a visible cell overflows AND the very next physical cell is hidden, spillover dumps lessons into the hidden cell. In practice hidden years are usually contiguous at the start/end so this is rare; the user sees it immediately if it happens. Fix would require teaching the placement engine about hidden years; deferred until somebody hits it.
- **Pass count = 3 hard-coded** in `three-spiral`. Tuning to 2-pass or 4-pass would be a single-line change but no UX surface exposes it. Could add a "spiral depth" slider later if requested.
- **Depth sub-topics in `three-spiral`** appear in passes 2+3 only. The choice (vs all-three-passes) is a pedagogical bet: build the foundation before stretching into depth. Adjustable in the code if real-world use suggests otherwise.

### Consequences
- New users can go from "import spec" to "complete-looking plan" in two clicks (load example → apply preset). The teacher sees what a spiral plan vs frontloaded plan vs interleaved plan actually looks like in their own context.
- The expanded demo spec gives presets enough material to be visually distinct: ~99 placements for three-spiral, ~33 for frontloaded/interleaved on the demo. Without this, presets looked indistinguishable on the 25-lesson v1 demo.
- The Spacing Panel and retrieval-suggestion popover now have meaningful signal on the example: a freshly three-spiraled physics spec triggers the well-spaced flag for ~half of sub-topics, frontloaded flags many as single-touch.
- StatusBar now carries an extra button ("📐 Preset layout…"). Considered crowded — happy to move it elsewhere if it competes with the toggles.

### Related
- `SPEC.md` §1.1 (in-scope — preset layouts now an explicit feature)
- `docs/PEDAGOGY.md` (will gain §7 explaining when each preset is the right starting point at next polish)
- `src/model/presets.ts` (the three algorithms + descriptors + summarise helper)
- `src/components/PresetPickerModal.tsx` (radio-style picker with per-preset preview)
- `src/components/StatusBar.tsx` ("📐 Preset layout…" trigger)
- `src/store/useWorkspaceStore.ts` (`applyPresetLayout` action)
- `scripts/build-example-spec.mjs` (cross-platform demo-spec generator; replaces `examples/build_example.py`)
- [DEC-031](#dec-031) (retrieval engine — shares the "deterministic, no AI" philosophy), [DEC-033](#dec-033) (spacing thresholds — same "weights in one file" pattern)
