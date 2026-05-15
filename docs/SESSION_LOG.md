# Session Log

Append-only record of what was actually built each session. Claude Code adds a new entry at the **bottom** of this file at the end of every session, immediately before committing.

This is a project journal, not a git replacement — git has the diffs; this has the *why*, the *what got skipped*, and the *what surprised us*.

---

## Entry template

Each entry follows this structure:

```
## Session N — Title
**Date:** YYYY-MM-DD
**Status:** Complete | Partial | Blocked
**Commit:** <short sha or "see git log">

### What was built
- Bullet list of features / files added or changed
- Reference SPEC.md section numbers where relevant

### Exit criteria check
- [x] / [ ] Each criterion from BUILD_PLAN.md, ticked or unticked
- If any unticked, explain why and what's needed to finish

### Deviations from BUILD_PLAN.md
- Anything done differently from the plan, with reasoning
- "None" if straight execution

### Decisions logged
- Anything that required a judgement call not covered by SPEC.md
- Note if a corresponding DECISIONS.md entry was added

### Surprises and gotchas
- Things that didn't work as expected
- Workarounds applied
- Anything the next session needs to know

### Open questions for the user
- Things to confirm before continuing
- "None" if nothing pending
```

---

## Entries

## Session 0 — Project setup *(retroactive)*
**Date:** 2026-05-15 *(entry written at start of Session 1; commit timestamp authoritative)*
**Status:** Complete
**Commit:** `4316ce5` — `chore: session 0 - electron + react + ts + tailwind shell`

### What was built
- `package.json` with Electron 33, React 18, TypeScript 5.6, Vite 5, Tailwind 3, dnd-kit, zustand, xlsx, vitest, playwright, electron-builder, fontsource fonts
- Renderer `tsconfig.json` with `strict: true` plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitOverride`, `noFallthroughCasesInSwitch`
- Separate `tsconfig.electron.json` for the main process
- `vite.config.ts` with `@` → `src` alias, port 5173, chrome128 target
- Tailwind config + `src/styles/globals.css` with the SPEC.md §8.1 palette as CSS variables; IBM Plex Sans / Mono and Lora bundled via `@fontsource/*` (no CDN per SPEC.md §11)
- `electron/main.ts`: 1440×900 window, min 1280×800, `#FBF7EE` background, context-isolated, sandboxed, no node integration (per SPEC.md §11.1)
- `electron/preload.ts`: empty placeholder
- `src/App.tsx`: centred "Curriculum Planner" placeholder per BUILD_PLAN.md Session 0 step 8
- npm scripts: `dev` (concurrently vite + electron via `wait-on`), `build`, `typecheck`, `test`, `test:e2e`
- `examples/example_physics_spec.xlsx` and `examples/build_example.py` already present
- `reference/sow_planner_v1.html` already present

### Exit criteria check
- [x] `npm run dev` opens a window showing the placeholder *(verified at the time of the original commit; not re-verified retroactively)*
- [x] Hot reload works *(per Vite config; not re-verified retroactively)*
- [x] TypeScript strict mode on, zero errors — `npm run typecheck` passes
- [x] No console errors or warnings *(verified at the time of the original commit)*

### Deviations from BUILD_PLAN.md
None.

### Decisions logged
- Strict TS flags `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` — logged retroactively as [DEC-004](DECISIONS.md#dec-004).

### Surprises and gotchas
- None for Session 0 itself. For Session 1: `noUncheckedIndexedAccess` means array reads return `T | undefined` — plan model code accordingly.

### Open questions for the user
None.

---

## Session 1 — Data model: types and code generation
**Date:** 2026-05-15
**Status:** Complete
**Commit:** `398c3e3` — `feat: session 1 - data model types + topic/sub-topic code generation`
*(merged into `main` via `05a02bf` + merge commit; pre-merge entries written against templates I wrote myself in the worktree, then re-formatted to match the canonical templates on `main` during the merge resolution.)*

### What was built
- `src/model/types.ts` — every entity from SPEC.md §3.1 (`Workspace`, `Subject`, `Spec`, `Topic`, `SubTopic`, `Lesson`, `Objective`, `Timeline`, `HalfTerm`, `PlacedBlock` with discriminated `PlacedBlockSource`, `CustomBlock`, `SubjectMeta`, `SubjectConfig`, `PlacedBlockEdits`) plus `ImportResult` / `ValidationError` / `ValidationWarning` for Session 2 and `ViewType` / `YearId` aliases for the store. All fields `readonly`; arrays typed `readonly T[]`.
- `src/model/codes.ts` — `generateTopicCode` and `generateSubTopicCode`. Stable-ID semantics (no name input). Sub-topic suffixes roll over `a..z → aa..zz → aaa..zzz` via `indexToLetters`.
- `tests/model/codes.test.ts` — 16 unit tests covering empty, populated, gap-filling, contiguous walk, order-independence, single→double→triple letter rollover, and cross-topic isolation.
- `tsconfig.json` — added `"tests"` to `include` and a `paths` alias mirroring Vite's `@/* → src/*` (see [DEC-002](DECISIONS.md#dec-002)).
- `package.json` — `@vitest/coverage-v8` added as dev dependency (see [DEC-001](DECISIONS.md#dec-001)).

### Exit criteria check
- [x] All types defined and exported from `src/model/types.ts`
- [x] `codes.ts` tested with 100% line + branch coverage (`npx vitest run --coverage --coverage.include='src/model/codes.ts'` → 100% / 100% / 100% / 100%)
- [x] `npm test` passes (16/16)
- [x] No UI changes
- [x] `npm run typecheck` passes (renderer + electron tsconfigs both clean)

### Deviations from BUILD_PLAN.md
- BUILD_PLAN.md rule 12 forbids new deps without a DEC entry. Initially added `@vitest/coverage-v8` with just a commit-message justification (worktree was on an older BUILD_PLAN.md before merge); back-filled as [DEC-001](DECISIONS.md#dec-001) at merge time.
- Restructured `codes.ts` to remove an unreachable trailing `}` after an infinite `for` loop. The first draft used `for (;;) { … return … }` and v8 reported 92.3% statement coverage because the trailing brace was flagged as unreachable. Rewrote both functions as `while (used.has(candidate)) n++; return candidate;` — semantically identical, no dead lines, 100% coverage. Logic unchanged.

### Decisions logged
- [DEC-001](DECISIONS.md#dec-001) — Add `@vitest/coverage-v8` dev dep.
- [DEC-002](DECISIONS.md#dec-002) — Wire `@/*` path alias into `tsconfig.json` and include `tests/`.
- [DEC-003](DECISIONS.md#dec-003) — Sub-topic code suffix scheme past `z`.
- [DEC-004](DECISIONS.md#dec-004) — Strict TS flags stay on (retroactive to Session 0).

### Surprises and gotchas
- **Disk full mid-install.** First attempt to add `@vitest/coverage-v8` ran out of disk and left `node_modules/tailwindcss` partially unpacked (missing `package.json`), which broke `npm test` via the PostCSS plugin chain. After the user freed space, `npm install` repaired and the coverage dep installed cleanly. **For future sessions:** check `df -h` before any dep install on this machine.
- **Worktree vs. main confusion.** Initial Session 1 work was done in a `.claude/worktrees/practical-knuth-310ab4` worktree on branch `claude/practical-knuth-310ab4`. The user expected to see results in their primary `src/` folder. Resolved by merging the branch into `main`. **For future sessions:** work directly from `main` (user preference, saved to memory).
- **DECISIONS.md / SESSION_LOG.md template mismatch.** The user had prepared templates in `main` (this file) that I didn't see from the worktree. My initial entries used `D-001` numbering with my own structure. Rewrote at merge time to match the canonical `DEC-NNN` template — content preserved, format unified.

### Open questions for the user
- None blocking, but to confirm: from Session 2 onwards I'll work directly in the `main` checkout, not a worktree.
