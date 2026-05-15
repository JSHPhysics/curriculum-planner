# Curriculum Planner — Claude Code Build Plan

**Companion to:** `SPEC.md`
**Audience:** Claude Code, building this project session by session
**Author:** Joshua Stafford-Haworth
**Version:** 1.0

---

## How to use this document

Each session below is designed to fit in a single Claude Code context window with room to spare. Sessions are sequenced so that each builds on the previous one and each ends in a runnable, testable state.

**Before starting any session, Claude Code should:**
1. Read `SPEC.md` end to end if not already familiar
2. Read the session brief here
3. Read `reference/sow_planner_v1.html` only if the session involves UI patterns from the prototype
4. Confirm the previous session's exit criteria are met
5. Commit at the end of every session with a clear message

**Reference HTML usage:**
The file `reference/sow_planner_v1.html` is the prototype that proves the UX patterns work. It is for **reference only** — do not port its code. Re-implement equivalent interactions in React/TypeScript. Patterns worth preserving: the topic colour palette, the drag-drop feel, the spillover-and-recombine logic, the EoHT defaults, the preset menu structure, the modal interaction model.

---

## Session 0 — Project setup

### Goal
Working Electron + React + TypeScript + Tailwind shell that opens a window saying "Hello, planner".

### Steps
1. Initialise `package.json` with Electron, React 18, TypeScript, Vite, Tailwind, dnd-kit, zustand, xlsx, vitest, playwright
2. Configure `tsconfig.json` with strict mode
3. Set up Vite with React + Electron-friendly config
4. Set up Tailwind with the palette from `SPEC.md §8.1` exposed as CSS variables
5. Set up IBM Plex Sans / Mono and Lora as web fonts (bundled, not CDN)
6. Build `electron/main.ts`: creates one BrowserWindow, loads the renderer
7. Build `electron/preload.ts`: empty contextBridge for now
8. Build `src/main.tsx` and `src/App.tsx`: renders "Curriculum Planner" centred on the canvas
9. Wire `npm run dev` to start Vite + Electron together
10. Wire `npm run build` to package via electron-builder for the current OS
11. Verify the app opens, shows the heading, hot-reloads on source change

### Exit criteria
- `npm run dev` opens a window showing the placeholder
- Hot reload works
- TypeScript strict mode is on and the project compiles with zero errors
- No console errors or warnings

### Notes
- Do not start any UI work beyond the placeholder
- Do not write the data model yet

---

## Session 1 — Data model: types and code generation

### Goal
A complete, tested data model with no UI. All types defined; topic/sub-topic code generation working with full test coverage.

### Steps
1. Create `src/model/types.ts` with every type from `SPEC.md §3.1`
2. Mark all types `readonly` where appropriate; data model is immutable, operations return new instances
3. Create `src/model/codes.ts` exporting:
   - `generateTopicCode(existingCodes: string[]): string` → next free `T{n}`
   - `generateSubTopicCode(topicCode: string, existingSubTopicCodes: string[]): string` → next free `{topicCode}{letter}`
4. Write thorough tests in `tests/model/codes.test.ts`:
   - Empty list → `T1` and `T1a`
   - Existing `T1` → `T2`
   - Gaps (`T1`, `T3` exist) → `T2`
   - More than 26 sub-topics: spec is ambiguous; for v1, after `T1z` use `T1aa`, `T1ab` (alphabet pairs)
   - User-renaming a topic does not change its code (codes are stable)
5. Achieve 100% coverage on `codes.ts`

### Exit criteria
- All types defined and exported from `src/model/types.ts`
- `codes.ts` tested with 100% line and branch coverage
- `npm test` passes
- No UI changes

---

## Session 2 — Data model: import

### Goal
An `importSpecFromXlsx` function that takes a file buffer and returns a `Subject` (or a validation report). Fully tested against the example file.

### Steps
1. Author `examples/example_physics_spec.xlsx` by hand based on Edexcel 1PH0 Triple Physics, ~50 sub-topics, ~150 lessons, ~300 objectives. Include some quirks: at least one row with empty objectives, one sub-topic with depth lessons, one with separate-only flag, one with practical.

   **Note:** It is acceptable to author a minimal version covering 2–3 topics fully (~40 rows) and stub the rest. The example file's purpose is to exercise the import path, not to be a teaching-ready document.
2. Create `src/model/import.ts`:
   - `importSpec(buffer: ArrayBuffer): ImportResult` where `ImportResult` is either `{ ok: true, subject: Subject }` or `{ ok: false, errors: ValidationError[], warnings: ValidationWarning[] }`
   - Parse headers case-insensitively
   - Implement all validation rules from `SPEC.md §5.3`
   - Implement sub-topic merging per `§5.2`
   - Generate topic and sub-topic codes per `§5.2` and `§3.4`
   - Produce both `importedSpec` and `workingSpec` (deep clone)
3. Tests in `tests/model/import.test.ts`:
   - Happy path against `example_physics_spec.xlsx`
   - Missing required column → error
   - Empty cell in required column → error
   - Duplicate lesson number with different titles → error
   - Sub-topic with zero objectives → warning
   - Difficulty out of range → warning, defaults to 2
   - Multiple rows per lesson are merged
   - Topic codes assigned in import order
   - Sub-topic codes assigned in import order within each topic

### Exit criteria
- Example file imports cleanly into a well-formed `Subject`
- All validation rules tested
- Round-trip: deep-equal `importedSpec` and `workingSpec` immediately after import

---

## Session 3 — Data model: timeline and placement

### Goal
Pure functions for placing, spillovering, splitting, recombining, and removing blocks on a timeline. No UI.

### Steps
1. Create `src/model/timeline.ts`:
   - `createDefaultTimeline(): Timeline` — returns Y9/Y10/Y11 with default half-term IDs, labels, and budgets (from `SPEC.md` reference values: Y9 4×45min/fortnight, Y10 7×45min, Y11 6×45min — see prototype for exact numbers)
   - `createEoHTBlocks(timeline): CustomBlock[]` — one 1-lesson test per half-term, pre-placed
2. Create `src/model/placement.ts`:
   - `placeBlock(timeline, blockId, termId): Timeline`
   - `placeWithSpillover(timeline, subTopic, lessonsClaimed, termId): Timeline` — implements the spillover logic from the prototype
   - `splitBlock(timeline, placedBlockId, atLessonIdx): Timeline` — manual split
   - `recombineBlock(timeline, placedBlockId): Timeline` — gathers all PlacedBlocks sharing the same `(subTopicId, splitOrigin)` and merges
   - `removeBlock(timeline, placedBlockId): Timeline`
   - `moveBlock(timeline, placedBlockId, toTermId): Timeline`
3. Tests in `tests/model/placement.test.ts` covering each scenario from the prototype's recombine tests (auto-split → all to pool → recombine; manual split → persist; edited auto → demoted)
4. Pay close attention to the auto/manual distinction in `SPEC.md §3.6` and the prototype's behaviour

### Exit criteria
- All placement operations are pure functions: `(Timeline, args) => Timeline`
- Every prototype scenario has a corresponding test
- Round-trip tests: place → spillover → recombine returns to original state

---

## Session 4 — Data model: export

### Goal
An `exportToXlsx` function producing the 5-sheet workbook described in `SPEC.md §6.1`.

### Steps
1. Create `src/model/export.ts`:
   - `exportSubjectToXlsx(subject: Subject): ArrayBuffer`
   - Implement all 5 sheets per `§6.1`
   - Use SheetJS
2. Tests in `tests/model/export.test.ts`:
   - Export → import round-trip preserves spec data (read back the export with SheetJS, check shape)
   - All 5 sheets present
   - Cover sheet has correct summary stats
   - Coverage percentage calculation correct
3. Bonus: write an inverse helper that reads the export back, useful for tests

### Exit criteria
- `exportSubjectToXlsx` works on the imported example file
- Tests cover all 5 sheets
- Generated workbook opens correctly in Excel / LibreOffice (manual check — open one, verify)

---

## Session 5 — Workspace and persistence

### Goal
Workspace operations (add subject, remove subject, switch subject), `.curriculum` file save/load, localStorage autosave.

### Steps
1. Create `src/model/workspace.ts`:
   - `createWorkspace(): Workspace`
   - `addSubject(workspace, subject): Workspace`
   - `removeSubject(workspace, subjectId): Workspace`
   - `replaceSubject(workspace, subjectId, newSubject): Workspace`
   - `restoreSubjectToImport(workspace, subjectId): { workspace, orphans: PlacedBlock[] }`
2. Serialisation:
   - `serializeWorkspace(workspace): string` — JSON with file version per `§9.1`
   - `deserializeWorkspace(json: string): Workspace` — handles version field, fails clearly on incompatible versions
3. Tests cover all workspace operations and round-trip serialisation
4. Wire `electron/preload.ts` with `contextBridge.exposeInMainWorld('api', { openFile, saveFile, ... })` and corresponding handlers in `electron/main.ts`
5. Test the IPC manually via the console (no UI yet)

### Exit criteria
- All workspace ops tested
- `.curriculum` file can be written and read manually via DevTools
- IPC bridge works (`window.api.saveFile(json, path)` and `window.api.openFile()` return what they should)

---

## Session 6 — State store

### Goal
Zustand store wired to the data model. Components can subscribe to slices. No UI yet beyond a simple debug panel.

### Steps
1. Install zustand
2. Create `src/store/useWorkspaceStore.ts`:
   - State shape: `{ workspace: Workspace, dirty: boolean, currentView: ViewType, currentTermId: string | null }`
   - Actions for every workspace + placement op (thin wrappers around model functions, setting state to the result)
   - Subscribe to changes → debounced autosave to localStorage
   - On app start: try to load from localStorage if present
3. Build a temporary `DebugPanel.tsx` showing the workspace as JSON, with buttons:
   - "Import example file" (fetches the bundled example, calls importSpec)
   - "Clear workspace"
   - "Force save"
4. Verify autosave works by importing the example, refreshing the renderer, seeing the data persist

### Exit criteria
- Store wired and reactive
- Autosave/restore works through a renderer refresh cycle
- Debug panel demonstrates all major workspace ops
- No production UI yet — debug panel only

---

## Session 7 — Header, tabs, view selector, status bar

### Goal
The page chrome: app header, subject tabs (with + to add), view selector (4 buttons), status bar showing year totals. None of these need to drive a real view yet — clicking the view selector can no-op.

### Steps
1. Replace `App.tsx` with the production layout shell from `SPEC.md §8.4`
2. `Header.tsx`: app name, subject tabs aligned left of centre, view selector centre, action buttons right (Open, Save, Save As, Export, Settings)
3. `SubjectTabs.tsx`: list of tabs (subject name with colour swatch), + button at end, click to switch active, right-click for tab menu (close, rename, restore to import)
4. `ViewSelector.tsx`: segmented control of `Topic | Sub-topic | Lesson | Objective`
5. `StatusBar.tsx`: three year progress bars (Y9, Y10, Y11) with used/budget, unplaced count, three toggles (depth / buffer / spillover)
6. Implement the tabs and view selector as fully styled and reactive to store, but the views themselves can be a placeholder "Sub-topic view (coming in next session)"
7. Wire Open / Save / Save As / Export buttons to the IPC bridge

### Exit criteria
- Header looks like the spec, palette is on
- Can switch between subjects via tabs (with example file imported via the + button)
- View selector toggles state but views are still placeholders
- Save/Open/Save As/Export wired and functional
- Status bar updates reactively

---

## Session 8 — Sub-topic view (port the prototype's core experience)

### Goal
The sub-topic view matches or exceeds the prototype's experience: topic pool, half-term grid, drag-drop, spillover, recombine, edit modal, custom blocks, EoHT defaults, presets.

### Steps
1. `Pool.tsx`: left sidebar listing sub-topic blocks grouped by topic, with collapse, lesson totals, "+ Custom" button
2. `TimelineGrid.tsx`: 3 rows (years), 6 / 6 / 5 columns (half-terms)
3. `HalfTermCell.tsx`: a drop zone, header with label / dates / used / budget, body listing placed blocks; EoHT blocks always sorted last
4. `Block.tsx`: a draggable block with topic colour, code, name, difficulty dots, depth star, lesson count
5. Wire dnd-kit: `DndContext` at view level, `useDraggable` on blocks, `useDroppable` on cells + pool
6. On drop: dispatch the appropriate store action
7. `BlockEditModal.tsx`: per `SPEC.md §4.2`, with Split / Recombine / Remove / Save
8. `CustomBlockModal.tsx`: per the prototype's behaviour
9. `PresetMenu.tsx`: header dropdown listing built-in presets + saved user presets, save/load/delete
10. Port the three built-in presets from the prototype: blank, three-spiral, distributed-depth, single-pass-forward — adapted to use the imported spec (presets must work with the **current loaded subject** — they are layouts of placement, not of spec content; this means presets in v1 are subject-specific. Save/load works fine; built-in presets only apply if the loaded spec has matching sub-topic codes)
11. Three toggles in status bar work (depth, buffer, spillover)

### Exit criteria
- Every interaction from the prototype works equivalently or better
- Drag-drop holds 60fps
- Save → reload → identical state
- Three built-in presets work with the example file

### Notes
- This is the largest session. It may need to split into 8a and 8b.
- Split point if needed: 8a covers Pool + TimelineGrid + dnd-kit + EoHT defaults; 8b covers modal, custom blocks, presets, toggles.

---

## Session 9 — Lesson view

### Goal
A working Lesson view per `SPEC.md §4.3`.

### Steps
1. `LessonView.tsx`: same calendar grid as sub-topic view
2. `LessonCard.tsx`: small card per lesson, showing number / title / sub-topic code / flags
3. Group lesson cards within a half-term by their parent sub-topic (subtle visual grouping)
4. Drag-drop per lesson: dropping a lesson into a different half-term either extends an existing PlacedBlock (if it's the adjacent lesson of the same sub-topic) or creates a split
5. `LessonEditModal.tsx`: edit title, practical, depth, separate-only, objectives list (reorderable)
6. Add-lesson and delete-lesson actions

### Exit criteria
- Lesson view fully functional
- Editing a lesson reflects across all views immediately
- Lesson drag creates correct splits

---

## Session 10 — Objective view

### Goal
A working Objective view per `SPEC.md §4.4`.

### Steps
1. `ObjectiveView.tsx`: lesson-row list in calendar order
2. `ObjectiveRow.tsx`: shows half-term, sub-topic, lesson title, objectives
3. Coverage indicator at top: count of mapped vs total objectives, click to filter
4. Side panel for unmapped objectives, drag from there onto a lesson
5. Drag objectives between lessons
6. Edit-objective inline or via modal (your choice; modal is safer for accidental clicks)

### Exit criteria
- Coverage indicator correct
- Drag-drop between lessons works
- Unmapped objectives pool surfaces correctly

---

## Session 11 — Topic view

### Goal
A working Topic view per `SPEC.md §4.1`.

### Steps
1. `TopicView.tsx`: same calendar grid
2. `TopicBlock.tsx`: aggregated block showing topic code, name, total lessons claimed, mini bar of sub-topic breakdown
3. Drag a topic block to move all its sub-topics together (move all PlacedBlocks of all matching sub-topics, preserving relative order)
4. Visual continuity: topic moved across half-terms maintains its colour and ordering

### Exit criteria
- Topic view functional
- Topic drag moves the whole topic correctly
- View switching between Topic ↔ Sub-topic shows consistent state

---

## Session 12 — Excel export, restore-to-import, polish

### Goal
Wire up the remaining functionality from §6 and §7, polish loose ends.

### Steps
1. Excel export from any view → 5-sheet workbook to user-chosen path
2. Restore-to-import: confirmation modal, surface orphans for re-placement
3. First-run experience per `§7.1`: empty workspace shows "Import a spec to begin" centre-screen
4. "Download import template" generates a blank `.xlsx` with example rows
5. Unsaved-changes prompt on app close per `§9.3`
6. Keyboard accessibility pass per `§13.1`
7. Performance pass — measure import time, view switch time, drag fps; fix anything missing the targets in `§10`

### Exit criteria
- All `SPEC.md §15` acceptance criteria pass

---

## Session 13 — Testing pass

### Goal
Comprehensive end-to-end test suite via Playwright.

### Steps
1. E2E scenarios in `tests/e2e/`:
   - Import example file → see all 4 views populated
   - Drag a block, save, reopen, verify state preserved
   - Switch views, verify same data
   - Add a custom block, save, reopen
   - Load a preset, verify placement
   - Restore to import, verify spec reset and placements preserved/orphaned correctly
   - Export to Excel, re-import, verify equivalent
2. Run on Windows and macOS via electron-builder packaged build

### Exit criteria
- All e2e tests pass on both platforms
- Coverage on `src/model/` is 80%+

---

## Session 14 — Packaging and release

### Goal
Distributable installers for Windows and macOS.

### Steps
1. Configure electron-builder for Win (.exe installer + portable) and Mac (.dmg)
2. App icon — design one matching the palette (a simple navy on cream mark)
3. Version 1.0.0 in package.json
4. Build, smoke-test on each platform
5. Code signing left for a future phase (note in release notes that the app is unsigned)

### Exit criteria
- Installers built for Windows and macOS
- Both install and run without errors
- App icon shows correctly
- Version metadata is correct

---

## Working agreements for Claude Code

1. **At the start of every session past Session 0**, read `SESSION_LOG.md` and `DECISIONS.md` in full before doing anything else. They are the project's working memory across context windows.
2. **At the end of every session**, append an entry to `SESSION_LOG.md` using the template at the top of that file, then commit. The session log entry and the code commit go together — never one without the other.
3. **If a design choice arose mid-session** that wasn't covered by `SPEC.md`, log it in `DECISIONS.md` with a `DEC-NNN` reference and link to it from the session log entry.
4. **If a decision contradicts SPEC.md**, also update SPEC.md in the same commit, referencing the DEC number.
5. **Commit at end of every session** with a message naming the session, e.g. `feat: session 3 - timeline and placement model (#DEC-002)`.
6. **Run the test suite at the end of every session** before committing. Tests must pass.
7. **Do not skip sessions** or merge their work, even if a session feels small. The sequence is designed for reviewability.
8. **If a session feels too large**, propose a split before starting — don't silently skip steps.
9. **Reference the spec, not memory.** When unsure, `SPEC.md` wins. When `SPEC.md` is silent, check `DECISIONS.md` next.
10. **Reference the prototype only for UX patterns**, never copy code from it.
11. **If a requirement is ambiguous, stop and ask** rather than guess. If the user resolves it, log the resolution as a DEC entry.
12. **No new dependencies after Session 0** without justification in the commit message and a DEC entry.
13. **No `any` types.** Strict TypeScript everywhere.
14. **No comments explaining what the code does.** Comment only the *why* — surprising choices, tricky invariants, links to the spec or DEC entries.

End of build plan.
