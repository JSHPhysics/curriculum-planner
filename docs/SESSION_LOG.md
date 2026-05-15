# Session Log

Chronological record of each build session: what was done, exit state, anything for the next session to know. Append-only.

---

## Session 0 — Project setup *(retroactive entry)*

**Commit:** `4316ce5 chore: session 0 - electron + react + ts + tailwind shell`

**Done**
- `package.json` with Electron 33, React 18, TypeScript 5.6, Vite 5, Tailwind 3, dnd-kit, zustand, xlsx, vitest, playwright, electron-builder
- `tsconfig.json` strict mode plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitOverride`, `noFallthroughCasesInSwitch`
- Separate `tsconfig.electron.json` for the main process
- Vite config with `@` → `src` alias
- Tailwind with palette + fonts; CSS variables in `src/styles/globals.css` matching `SPEC.md §8.1`
- IBM Plex Sans / Mono and Lora bundled via `@fontsource/*` (not CDN)
- `electron/main.ts` creates a 1440×900 window (min 1280×800), background `#FBF7EE`, context-isolated, sandboxed, no node integration
- `electron/preload.ts` placeholder
- `src/App.tsx` renders the placeholder heading centred on the canvas
- Scripts: `dev` (concurrently runs vite + electron via `wait-on`), `build`, `typecheck`, `test`, `test:e2e`
- `examples/example_physics_spec.xlsx` plus `build_example.py` generator already present
- `reference/sow_planner_v1.html` present

**Exit checks**
- `npm run typecheck` passes (renderer + electron tsconfigs both clean)
- `npm test` exits 1 with "No test files found" — expected, no tests authored yet

**Notes for next session**
- `noUncheckedIndexedAccess` is on — array index access yields `T | undefined`. Plan for this in the data model.
- `exactOptionalPropertyTypes` is on — optional fields must be `undefined` explicitly, not just omitted, when assignment requires.
- Test files live under `tests/` but `tsconfig.json` `include` is `["src", "vite.config.ts"]`. Vitest type-checks via its own loader, so this is fine for `npm test`, but `npm run typecheck` will not type-check tests. Acceptable for now — revisit if test-side type errors start slipping through.

---

## Session 1 — Data model: types and code generation

**Goal:** Complete type definitions per `SPEC.md §3`; `codes.ts` with 100% coverage.

**Done**
- `src/model/types.ts`: every entity from `SPEC.md §3.1` — `Workspace`, `Subject`, `Spec`, `Topic`, `SubTopic`, `Lesson`, `Objective`, `Timeline`, `HalfTerm`, `PlacedBlock` (+ discriminated `PlacedBlockSource`), `CustomBlock`, `SubjectMeta`, `SubjectConfig`, `PlacedBlockEdits`, plus `ImportResult` / `ValidationError` / `ValidationWarning` for Session 2 and `ViewType` / `YearId` aliases for the store. All entity fields `readonly`; arrays typed as `readonly T[]`.
- `src/model/codes.ts`: `generateTopicCode`, `generateSubTopicCode`. Stable-ID semantics — neither function takes a name. Sub-topic suffixes are `a..z`, then `aa..zz`, then `aaa..zzz`, etc. (see `indexToLetters`).
- `tests/model/codes.test.ts`: 16 tests covering empty, populated, gap-filling, contiguous-walk, order-independence, single→double→triple letter rollover, and cross-topic isolation.
- Added `tests` to `tsconfig.json` includes so type errors in tests are caught by `npm run typecheck`.
- Added `paths` mapping (`"@/*": ["src/*"]`) to `tsconfig.json` so `tsc` resolves the same `@` alias Vite already had — without it, `import from "@/model/codes"` in tests failed typecheck.
- Added `@vitest/coverage-v8` as a dev dependency (justified: the build plan asks for "100% coverage on codes.ts" and v8 is the standard vitest coverage provider).

**Exit checks**
- `npm test` passes (16/16)
- `npm run typecheck` passes (renderer + electron tsconfigs)
- `npx vitest run --coverage --coverage.include='src/model/codes.ts'`: 100% stmts / branch / funcs / lines
- No UI changes

**Incidents**
- An earlier `npm install -D @vitest/coverage-v8` ran out of disk space and left `node_modules/tailwindcss` partially unpacked (missing `package.json`), which broke `npm test` via the PostCSS plugin chain. After the user freed disk, `npm install` repaired and the coverage dep installed cleanly. **Lesson:** check `df -h` before any dep install when working on this machine.

**Notes for next session**
- Session 2 (import) consumes `Subject` / `Spec` / `Topic` / `SubTopic` / `Lesson` / `Objective` from `types.ts` and the two `generate*Code` functions.
- `Lesson.number` is the import's literal value (display-only per `SPEC.md §3.5`); ordering inside a sub-topic is array position, not the number.
- Sub-topic-level fields that vary between rows (`difficulty`, `isDepth`, `separateOnly`) are resolved at import time per `§5.2`, not at the type level — types just hold one value per sub-topic.
- Initial values for `codes.ts`'s output never change for an existing topic. Imports must use `generateTopicCode` once per *new* topic and persist the result; renames in Session 7+ must not call it again.
