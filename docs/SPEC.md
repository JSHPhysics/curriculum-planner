# Curriculum Planner — Specification

**Author:** Joshua Stafford-Haworth
**Version:** 1.0 (spec draft for v1 build)
**Status:** Canon — to be revised only with explicit decision logs

---

## 0. One-paragraph summary

A desktop curriculum planning tool for teachers. The user imports an Excel file describing a course specification (topic → sub-topic → lesson → objectives) and the tool produces an interactive year-by-year planner with four zoom levels: Topic, Sub-topic, Lesson, Objective. The user drags content blocks across half-terms, edits at every zoom level, supports multiple subjects simultaneously, and saves their work to disk. No login, no cloud, no LLM — a single-user desktop app where the user's spec file is the source of truth and their edits are theirs.

---

## 1. Scope

### 1.1 In scope (v1)
- Desktop application (Windows + macOS + Linux via Electron)
- Single-user, no authentication, no network calls
- Import a specification from a single `.xlsx` file
- Four-level zoom: Topic / Sub-topic / Lesson / Objective
- Drag-and-drop placement of content into half-term cells
- Auto-spillover when a block exceeds a half-term's capacity
- Recombine split blocks back to original
- Configurable end-of-half-term test defaults
- Custom blocks (user-defined events: trips, mocks, retrieval weeks, etc.)
- Multiple subjects loaded simultaneously, switchable by tab
- Save/load entire workspace state to/from `.curriculum` files on disk
- Auto-save to localStorage as backup
- Export to Excel at any zoom level (single workbook with one sheet per level)
- Restore-to-import — revert any subject to its original imported state
- "Lost-lesson buffer" toggle (scales capacities by 0.9)
- "Include depth" toggle (adds depth-flagged lessons to totals)
- Spacing + interleaving analytics surfaced as health flags on the plan (subject-agnostic, deterministic, no AI — see [DEC-031](DECISIONS.md#dec-031))
- Retrieval-candidate suggestion engine: given a half-term, surface sub-topics worth revisiting based on placement gap, depth flag, difficulty, and revisit history
- Workspace-level calendar template configurable per school (cycle length, year groups Y7–Y13, lessons per cycle per year, half-term names + weeks + dates + per-cell budget overrides) — see [DEC-034](DECISIONS.md#dec-034)

### 1.2 Explicitly out of scope (v1)
- Any AI or LLM features
- Network sync, login, multi-user collaboration
- Cross-subject conflict detection (e.g. "Y10 has a test in both Maths and Physics same week")
- Mobile/tablet apps with full editing (read-mostly PWA is a future phase)
- Auto-generation of lesson plans from objectives
- Print/PDF export (Excel export covers reporting needs)
- Lesson-level resources, file attachments, or links
- Multiple users editing the same file (single-user assumption everywhere)
- Backwards compatibility with the v0 HTML prototype

### 1.3 Future phases (not built now, but architecture should not preclude them)
- PWA build for iPad read-mostly viewing
- Cross-subject view (see all subjects in one timeline)
- Per-objective spaced-retrieval scheduler
- Resource attachments per lesson

---

## 2. Users and intent

### 2.1 Primary user
A single subject teacher or head of department who:
- Maintains the scheme of work for their subject(s)
- Has the curriculum specification available as an Excel file
- Plans across multiple year groups simultaneously
- Edits weekly during a planning cycle, more rarely during term
- Works on a Windows desktop, occasionally reviews on iPad
- Is technically literate but not a developer

### 2.2 Use sessions
**Long planning session (1–3 hours):** Import a new spec, design year-by-year placement, drill into lessons, write lesson titles and objectives mapping. Happens once per year.

**Short edit session (5–20 minutes):** Open existing plan, refine a specific block, export updated Excel for sharing. Happens weekly.

**Reference session (1–5 minutes):** Open, look at next half-term's plan, close. Frequent.

### 2.3 Non-users
Students, parents, senior leadership reading the plan output. They see exported Excel or PDF; they do not use the tool.

---

## 3. Data model

### 3.1 Core entities

```
Workspace
└── Subjects[]                  // multiple subjects loaded simultaneously
    └── Subject
        ├── meta                // name, colour, spec source filename
        ├── importedSpec        // immutable original from import
        ├── workingSpec         // editable clone (edits apply here)
        │   └── Topics[]
        │       └── Topic
        │           ├── code            // auto-generated, e.g. T1
        │           ├── name            // from import, e.g. "Motion and forces"
        │           ├── paper           // optional
        │           └── SubTopics[]
        │               └── SubTopic
        │                   ├── code            // auto-generated, e.g. T1a
        │                   ├── name            // from import, e.g. "Kinematics"
        │                   ├── difficulty      // 1-3, from import
        │                   ├── isDepth         // bool, from import
        │                   ├── separateOnly    // bool, from import
        │                   ├── notes           // optional, from import
        │                   ├── Lessons[]
        │                   │   └── Lesson
        │                   │       ├── number          // from import, ordinal within subtopic
        │                   │       ├── title           // from import
        │                   │       ├── practical       // optional, from import
        │                   │       ├── isDepth         // bool, from import (lesson-level)
        │                   │       └── Objectives[]    // ordered list
        │                   │           └── Objective
        │                   │               ├── text         // from import
        │                   │               └── isDepth      // bool, from import (objective-level)
        │                   └── (computed) lessonCount = Lessons.length
        ├── Timeline
        │   └── HalfTerms[]
        │       └── HalfTerm
        │           ├── id              // e.g. Y9-A1
        │           ├── year            // e.g. Y9
        │           ├── label           // e.g. "Aut 1"
        │           ├── dates           // optional display string
        │           ├── budget          // base lesson capacity
        │           └── PlacedBlocks[]
        │               └── PlacedBlock
        │                   ├── id              // unique per placement
        │                   ├── source          // subtopic reference OR custom OR EoHT
        │                   ├── lessonsClaimed  // how many lessons of source this block represents
        │                   ├── lessonRange     // [startLessonIdx, endLessonIdx) into source
        │                   ├── splitFrom       // id of original if auto-split
        │                   ├── splitType       // 'auto' | 'manual' | null
        │                   └── userEdits       // any per-placement overrides
        ├── CustomBlocks[]      // user-defined non-spec blocks
        └── config              // per-subject UI prefs
```

### 3.2 Distinction: spec data vs placement data

Critical separation:
- **Spec data** (Topics → SubTopics → Lessons → Objectives) is the *content* — what's taught. Lives in `workingSpec`. Edits to lesson titles, objective text, sub-topic groupings are spec-edits.
- **Placement data** (Timeline → HalfTerms → PlacedBlocks) is the *schedule* — when it's taught. Lives in `Timeline`. Edits to placement (drag, split, reorder) are schedule-edits.

A `PlacedBlock` references a `SubTopic` (or a range of lessons within one) by reference, not by copy. Spec-edits propagate automatically into the placed view. Placement edits never alter the spec.

### 3.3 Restore-to-import behaviour

`importedSpec` is set once at import and never modified. "Restore to import" copies `importedSpec` into `workingSpec`, wiping all spec-edits. **Placement is preserved** unless a sub-topic no longer exists in the restored spec, in which case its placed blocks are orphaned and surfaced to the user for re-placement.

### 3.4 Topic and sub-topic code generation

Codes are derived from topic *name* in import order:
- First distinct topic name → `T1`
- Second → `T2`
- ...

Sub-topic codes are letter suffixes within a topic in import order: `T1a`, `T1b`, `T1c`.

User-renaming a topic does not change its code (codes are stable IDs). User-reordering changes display order but not codes.

If the user wants different codes, they edit the topic *name*; codes are deterministic from import order, full stop.

### 3.5 Lesson numbering within a sub-topic

Lessons inherit their `number` from the import's "Lesson No." column. Lesson numbers are display-only and unique within a sub-topic; if the import has lessons numbered 1, 2, 3, 5 (gap), the system uses them as labels but treats them as ordered positions internally.

### 3.6 PlacedBlock granularity

A `PlacedBlock` represents a contiguous range of lessons from one sub-topic placed in one half-term. The default behaviour is "one sub-topic = one block", but auto-spillover and manual splits produce multiple `PlacedBlocks` from the same `SubTopic`, each covering a `lessonRange`.

Example: SubTopic T2b "Acceleration" has 4 lessons. Placed in Y9 Spr 1. Then auto-spillover splits it: PlacedBlock A (lessons 1–3) in Y9 Spr 1, PlacedBlock B (lesson 4) in Y9 Spr 2. Both reference the same SubTopic.

### 3.7 Subject-agnostic vocabulary

The word "subject" is used internally and in the UI. The word "lesson" is used internally and in the UI. Other subject-specific vocabulary (e.g. "fortnight", "module", "unit") is **not customisable in v1** — keep things simple.

What *is* customisable per subject:
- Subject name (e.g. "GCSE Physics 1PH0")
- Subject colour (for tab + accent)

---

## 4. Zoom levels

### 4.1 Topic view (zoom-out)

**Purpose:** See course at the highest level. Useful for big-picture sequencing.

**Display:**
- Each row is a Year (Y9, Y10, Y11)
- Each year is a grid of half-terms
- Each half-term cell shows a stack of *Topic-level* blocks
- A "Topic block" is the aggregation of all that topic's placed sub-topic blocks in that half-term (or split across half-terms)
- Block label shows topic code, name, total lessons claimed, and a small breakdown bar showing which sub-topics are in that placement

**Editing in Topic view:**
- Drag a topic to move *all* its sub-topics together to a different half-term (subject to capacity / spillover)
- Cannot split or recombine topics from Topic view (must go to sub-topic view)
- Cannot reorder sub-topics within a topic from Topic view

### 4.2 Sub-topic view (current default)

**Purpose:** The main planning view. Most editing happens here.

**Display:** As current sow_planner.html — sub-topic blocks with difficulty dots, depth stars, lesson counts. Topic pool on left, half-term grid on right.

**Editing in Sub-topic view:**
- Drag sub-topic blocks between half-terms (with spillover)
- Click a placed block → edit modal (rename, change lesson count, split, recombine, remove)
- "+ Custom" button creates custom blocks
- All current planner interactions

### 4.3 Lesson view (zoom-in)

**Purpose:** Plan the lesson sequence within a sub-topic. See where individual lessons land in the calendar.

**Display:**
- Each row is a Year, each year a grid of half-terms (same calendar structure)
- Within each half-term cell, each *lesson* is a small card showing: lesson number, lesson title, parent sub-topic code, lesson-level depth/practical flags
- Lessons within the same sub-topic are visually grouped (subtle border, same colour as sub-topic)
- Drag-and-drop is per-*lesson* — you can move L3 of a sub-topic to a different half-term independently (this effectively does a manual split)

**Editing in Lesson view:**
- Click a lesson card → edit lesson (title, practical, depth flag, objectives mapped)
- Add a new lesson to any sub-topic
- Delete a lesson
- Reorder lessons within a sub-topic
- Drag a lesson to a different half-term

**Constraint:** Moving a lesson out of its sub-topic's "home" half-terms creates a split in the sub-topic's `PlacedBlock`s. The Sub-topic view will reflect this as a split.

### 4.4 Objective view (deepest zoom-in)

**Purpose:** See which spec objectives are covered in each lesson, and verify spec coverage.

**Display:**
- Each row is a Lesson (in calendar order)
- Each row shows: half-term, sub-topic, lesson title, ordered list of objectives covered
- A side panel shows "Unmapped objectives" — objectives that exist in the spec but aren't currently mapped to any lesson (gives the user a coverage warning)

**Editing in Objective view:**
- Click an objective → edit text (with warning that this is a spec-edit, not a placement-edit)
- Drag objectives between lessons (e.g. move an objective from L3 to L4)
- Drag objectives from "Unmapped" pool onto a lesson
- Add a new objective to a lesson (manual addition, not from spec)
- Mark/unmark objective as depth

**Coverage indicator (always visible at top of view):**
- "247 of 250 spec objectives mapped (3 unmapped)"
- Click to filter to unmapped only

### 4.5 View switching

A view selector in the header: `Topic | Sub-topic | Lesson | Objective`

State preservation across views:
- Selected half-term highlight persists across views
- Scroll position resets to the selected half-term when switching

---

## 5. Import

### 5.1 Format

Single `.xlsx` file. First sheet (or sheet named `Spec`) is read. Columns identified by header row (case-insensitive match, trimmed):

| Column header (required) | Type | Notes |
|---|---|---|
| Topic | string | Free-text topic name. Same name → same topic. |
| Lesson No. | number | Ordinal within sub-topic. Used as label. |
| Lesson Title | string | Free-text. |
| Sub-topic | string | Free-text sub-topic name. Same name within same topic → same sub-topic. |

| Column header (optional) | Type | Notes |
|---|---|---|
| Objectives | string | Newline- or semicolon-separated objectives for this lesson. |
| Practical | string | Free-text practical reference (e.g. "CP1"). Blank = no practical. |
| Difficulty | 1–3 | Sub-topic-level difficulty. If varies within sub-topic, max wins. |
| Extra-depth | yes/y/1/✓/★ | Marks lesson as depth-optional. Sub-topic counts as depth if any lesson is. |
| Separate science only? | yes/y/1/✓ | Marks lesson as triple-only. |
| Paper | string | Optional paper code. |
| Notes | string | Optional sub-topic notes. |

**Order matters:** lessons appear in the order they appear in the import file, within their sub-topic. Sub-topics appear in the order their first lesson appears. Topics likewise.

### 5.2 Sub-topic grouping rules

Rows with the same (Topic, Sub-topic) value pair belong to the same sub-topic. Lesson count for that sub-topic = number of distinct (Topic, Sub-topic, Lesson No.) tuples. Multiple rows per lesson allowed — they are merged: objectives concatenated, practical/depth/separate flags OR-ed together.

### 5.3 Import validation

Before commit, run validation pass and show a report. Errors block import; warnings allow proceed with confirmation.

**Errors:**
- Missing required column
- Empty Topic, Sub-topic, or Lesson Title cell
- Lesson No. not parseable as integer
- Duplicate lesson number within a sub-topic with different titles (ambiguous)

**Warnings:**
- Sub-topic with zero objectives across all lessons
- Lesson with empty objectives column
- Difficulty value outside 1–3 (treated as 2)
- Sub-topic difficulty varies between rows (using max)
- More than 50 lessons in one sub-topic (probably an error)

### 5.4 Replacing an existing subject

If a subject is loaded and the user imports a new spec:
- Offer three options:
  - "Replace this subject" — overwrites imported + working spec for this subject; placement preserved where sub-topic codes match by name; orphans surfaced
  - "Load as new subject" — creates a new subject tab
  - "Cancel"

### 5.5 Import template generation

A "Download import template" action produces a blank `.xlsx` with the header row and 2 example rows showing the format.

### 5.6 Performance target for import

- 250 objectives across 50 sub-topics across 15 topics: complete in under 2 seconds on a typical 2020 laptop
- 1500 objectives across 200 sub-topics across 50 topics: complete in under 10 seconds

---

## 6. Export

### 6.1 Excel export

A single `.xlsx` file with four sheets, one per zoom level. User can export at any time from any view. Export is a snapshot of the current state.

**Sheet 1: Topic view**
| Year | Half-term | Topic code | Topic name | Lessons claimed | Sub-topics included |

**Sheet 2: Sub-topic view**
| Year | Half-term | Topic code | Sub-topic code | Sub-topic name | Lessons claimed | Difficulty | Depth? | Practical(s) |

**Sheet 3: Lesson view**
| Year | Half-term | Topic | Sub-topic | Lesson No. | Lesson Title | Practical | Depth? | Separate only? |

**Sheet 4: Objective view**
| Year | Half-term | Topic | Sub-topic | Lesson No. | Lesson Title | Objective text | Depth? |

Plus a "Cover" sheet with: subject name, source spec filename, export date, summary stats (lessons placed per year, coverage %).

### 6.2 Workspace save (`.curriculum` file)

A `.curriculum` file is a JSON document with extension `.curriculum`. Contains the entire workspace: all subjects, all imported specs (so the file is self-contained — re-opening a `.curriculum` file does not require the original `.xlsx`), all placement, all custom blocks, all config.

Saved via OS file dialog (`File → Save` and `File → Save as…`).

### 6.3 Workspace load

`File → Open…` opens a `.curriculum` file. Replaces current workspace after confirmation if there are unsaved changes.

### 6.4 Auto-save

Whole workspace state serialised to localStorage on every state change, debounced 500ms. On app start, if localStorage has a workspace and no file is opened, offer to restore it.

---

## 7. UI flows

### 7.1 First-run experience

1. App opens to an empty workspace
2. Centre of screen: "Import a specification to begin", with two buttons:
   - "Import .xlsx file"
   - "Download import template"
3. After import, user lands in Sub-topic view of the new subject

### 7.2 Adding a second subject

1. User clicks "+" tab next to existing subject tabs
2. Same import dialog as 7.1
3. New tab appears; user can switch between subjects

### 7.3 Editing in Sub-topic view (= current behaviour)

As current sow_planner.html, modulo the new view selector and tab bar.

### 7.4 Drilling into a lesson

1. User is in Sub-topic view
2. Clicks view selector → "Lesson"
3. View changes; same calendar grid, but lesson cards now visible
4. User clicks a lesson card
5. Lesson edit modal opens with: title (text), practical (text), depth (checkbox), separate-only (checkbox), objectives (editable list with add/remove/reorder)

### 7.5 Coverage check

1. User switches to Objective view
2. Top of view: "247 / 250 spec objectives mapped"
3. Clicks the indicator → filters to show only unmapped objectives in side panel
4. User drags each onto an appropriate lesson

### 7.6 Restore to import

1. User clicks subject's settings (gear icon on tab)
2. "Restore to imported spec" option
3. Confirmation modal: "This will discard all spec edits (lesson titles, objectives, sub-topic names). Placement will be preserved where possible. Continue?"
4. User confirms; spec is restored; orphaned placements surfaced as a list to review

---

## 8. Layout and visual identity

### 8.1 Palette (inherited from v0 prototype)

Specified as a single CSS variable set in the global stylesheet:

```css
--bg: #FBF7EE;
--surface: #FFFFFF;
--surface-2: #F5EFE0;
--line: #E5DDC9;
--line-2: #D4CFC0;
--ink: #1A1A1A;
--ink-dim: #4A4A4A;
--ink-fade: #8A8478;
--navy: #1F3A5F;
--navy-dim: #324E73;
--gold: #B98D2C;
--warn: #B85C5C;
--good: #6FA068;
```

Plus topic colour ramps as in v0 (see reference HTML).

### 8.2 Typography

- Body: IBM Plex Sans
- Mono (codes, numbers): IBM Plex Mono
- Display (h1, year headers): Lora

### 8.3 Density

Minimal. Generous whitespace. No drop shadows except on dragging blocks and the preset menu. No gradients. No animations beyond 100–150ms transitions on hover/drag.

### 8.4 Window layout

```
┌─────────────────────────────────────────────────────────────┐
│ Header: app name · subject tabs · view selector · actions    │
├─────────────────────────────────────────────────────────────┤
│ Status bar: Y9/Y10/Y11 progress · unplaced · config toggles │
├──────────────┬──────────────────────────────────────────────┤
│              │                                              │
│  Pool        │  Timeline grid                               │
│  (left)      │  (year rows × half-term columns)             │
│              │                                              │
│              │                                              │
└──────────────┴──────────────────────────────────────────────┘
```

Minimum window size: 1280 × 800.
Recommended: 1440 × 900 or higher.

---

## 9. Persistence and file formats

### 9.1 `.curriculum` file structure

JSON, UTF-8. Top-level shape:

```json
{
  "fileVersion": 1,
  "savedAt": "2026-05-15T14:30:00.000Z",
  "appVersion": "1.0.0",
  "workspace": {
    "activeSubjectId": "subj-1",
    "subjects": [
      {
        "id": "subj-1",
        "meta": { "name": "GCSE Physics 1PH0", "colour": "#1F3A5F" },
        "importedSpec": { /* full Topic[] tree from import */ },
        "workingSpec": { /* editable clone */ },
        "timeline": { /* HalfTerm[] with placed blocks */ },
        "customBlocks": [ /* user-defined blocks */ ],
        "config": { /* per-subject UI prefs */ }
      }
    ]
  }
}
```

A version field allows future migrations.

### 9.2 localStorage

Same JSON as `.curriculum` minus the file metadata, stored under key `curriculum-planner-autosave-v1`. Written on state change with 500ms debounce.

### 9.3 Unsaved-changes detection

Tracked via a dirty flag: true after any state change since last `File → Save`. Window close while dirty prompts "Unsaved changes — save before closing?".

---

## 10. Performance targets

| Operation | Target | Hard limit |
|---|---|---|
| App cold start | < 2s to interactive | < 5s |
| Import 250-objective spec | < 2s | < 5s |
| Import 1500-objective spec | < 10s | < 30s |
| View switch | < 200ms | < 500ms |
| Drag-drop frame rate | 60fps | > 30fps |
| Modal open | < 100ms | < 300ms |
| Excel export | < 3s | < 10s |
| `.curriculum` file save | < 1s | < 3s |

If hard limit is hit, surface a progress indicator. Never block UI for more than 200ms without feedback.

---

## 11. Tech stack

### 11.1 Application shell
- **Electron** (latest stable) for Windows / macOS / Linux desktop
- Single main process, single renderer process (no need for multi-window in v1)
- Disable Node integration in renderer; use contextBridge for file I/O

### 11.2 Renderer
- **React 18+**, functional components, hooks
- **TypeScript** strict mode
- **Tailwind CSS** for styling, with the palette tokens above as CSS variables
- **Zustand** or **Jotai** for state management (avoid Redux — overkill here)
- **dnd-kit** for drag-and-drop (`@dnd-kit/core`, `@dnd-kit/sortable`)

### 11.3 Excel handling
- **SheetJS** (`xlsx`) for import and export

### 11.4 File I/O
- Electron's `dialog` API exposed via preload script
- Read/write JSON synchronously for `.curriculum` files (they will be small — < 1MB even at 1500 objectives)

### 11.5 Build / packaging
- **Vite** for renderer dev server and bundling
- **electron-builder** for packaging Windows/macOS/Linux installers
- Code signing left for a later phase

### 11.6 Testing
- **Vitest** for unit tests (data model logic, import/export round-trips)
- **Playwright** for end-to-end (open app, import file, drag block, save, reload, verify)
- Coverage target: 80%+ on the data model layer; smoke coverage on UI

---

## 12. Folder structure

```
curriculum-planner/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── electron-builder.json
├── electron/
│   ├── main.ts                    # Electron main process
│   └── preload.ts                 # contextBridge for file I/O
├── src/
│   ├── main.tsx                   # React root
│   ├── App.tsx
│   ├── model/                     # Pure data model — no React
│   │   ├── types.ts
│   │   ├── codes.ts               # Topic/sub-topic code generation
│   │   ├── import.ts              # xlsx → Subject
│   │   ├── export.ts              # Subject → xlsx
│   │   ├── placement.ts           # spillover, recombine, split logic
│   │   └── workspace.ts           # workspace operations
│   ├── store/                     # Zustand store
│   │   └── useWorkspaceStore.ts
│   ├── views/
│   │   ├── TopicView.tsx
│   │   ├── SubTopicView.tsx
│   │   ├── LessonView.tsx
│   │   └── ObjectiveView.tsx
│   ├── components/                # Shared UI
│   │   ├── Header.tsx
│   │   ├── SubjectTabs.tsx
│   │   ├── ViewSelector.tsx
│   │   ├── StatusBar.tsx
│   │   ├── TimelineGrid.tsx
│   │   ├── HalfTermCell.tsx
│   │   ├── Block.tsx
│   │   ├── Pool.tsx
│   │   ├── Modal.tsx
│   │   └── …
│   ├── styles/
│   │   └── globals.css            # Tailwind directives + CSS variables
│   └── lib/
│       ├── ipc.ts                 # Renderer-side file I/O helpers
│       └── debounce.ts
├── tests/
│   ├── model/
│   └── e2e/
├── reference/
│   └── sow_planner_v1.html        # Read-only reference of the prototype
└── docs/
    ├── SPEC.md                    # This document
    └── BUILD_PLAN.md              # Session-by-session plan
```

---

## 13. Non-functional requirements

### 13.1 Accessibility
- Keyboard navigation: Tab through pool, arrow keys in grid, Space to pick up a block, arrow keys to move it, Space to drop
- Focus rings visible everywhere
- ARIA labels on all interactive controls
- Screen reader announcements on drag operations
- Colour is never the only signal (icons or text accompany topic colours)

### 13.2 Internationalisation
- All user-facing strings in a central `strings.ts` file
- v1 ships English only; structure allows future translation

### 13.3 Error handling
- Import failures: show validation report inline, never silent
- File save/load failures: surface OS-level error with retry option
- Unhandled errors: surface in a non-modal toast, log to console; never crash silently

### 13.4 Privacy
- No telemetry, no analytics, no network calls in v1
- All user data stays local

---

## 14. Open questions deliberately left for v1.1+

- Cross-subject conflict detection (e.g. test in two subjects same week)
- Per-objective retrieval *auto-schedule* (the suggestion engine in §1.1 is per-sub-topic and user-initiated; a full per-objective auto-scheduler would auto-place ghost markers across the year)
- PWA build for iPad
- Resource attachments per lesson
- Lesson plan templates
- Multi-window for side-by-side views
- Export to PDF / print layouts
- Cloud sync

These are explicitly **not** v1 features. The data model and architecture must not preclude them, but the build plan does not include them.

---

## 15. Acceptance criteria (v1 launch)

The build is complete when:

1. A user can import the supplied `example_physics_spec.xlsx` and see Topic, Sub-topic, Lesson, and Objective views populated correctly
2. The Sub-topic view supports all interactions present in the v0 HTML prototype (drag, spillover, recombine, EoHT defaults, custom blocks, presets, toggles)
3. All four views are functional and switching between them is < 200ms
4. The user can save the workspace to a `.curriculum` file and load it back identically
5. Excel export produces a valid 5-sheet workbook
6. The user can load two subjects simultaneously and switch between them
7. Restore-to-import works for any subject, preserving placements where sub-topic codes survive
8. No regressions versus the prototype's UX in Sub-topic view
9. App packages and runs on Windows 10/11 and macOS 12+
10. All performance targets in §10 are met on a 2020-era laptop

End of spec.
