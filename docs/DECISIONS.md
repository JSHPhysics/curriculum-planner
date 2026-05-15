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
