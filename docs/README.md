# Curriculum Planner

A desktop curriculum planning tool for teachers. Imports a curriculum specification from Excel and produces an interactive year-by-year planner with four zoom levels (Topic / Sub-topic / Lesson / Objective), drag-and-drop placement, and multi-subject support.

**Author:** Joshua Stafford-Haworth
**Status:** Pre-build. Spec and build plan complete; code not yet started.

---

## What's in this folder

- **`docs/SPEC.md`** — canonical specification. Single source of truth. Read this first.
- **`docs/BUILD_PLAN.md`** — session-by-session plan for Claude Code to follow.
- **`docs/SESSION_LOG.md`** — append-only journal of what each session actually built. Read at the start of every session past Session 0.
- **`docs/DECISIONS.md`** — design decisions made during the build that aren't in SPEC.md.
- **`examples/example_physics_spec.xlsx`** — working example import file. Used by the build for tests and development.
- **`examples/build_example.py`** — script that generates the example file (regenerate if the schema changes).
- **`reference/sow_planner_v1.html`** — prototype proving the UX patterns. Reference only; not for porting.

---

## How to use this with Claude Code

**For the first session (Session 0):**

> Read `docs/SPEC.md` then `docs/BUILD_PLAN.md`, then start Session 0. Confirm exit criteria before committing.

**For every subsequent session (N ≥ 1):**

> Read `docs/SPEC.md` (skim if familiar), `docs/SESSION_LOG.md` (full), `docs/DECISIONS.md` (full), then the Session N brief in `docs/BUILD_PLAN.md`. Check `git log --oneline` for recent commits. Confirm previous session's exit criteria are met, then start Session N. Append to `SESSION_LOG.md` and commit at the end.

The session log and decisions log accumulate context across sessions. Skipping them at session start is the single fastest way for Claude Code to make a mess.

---

## Key design decisions (locked)

- Electron + React + TypeScript + Tailwind
- Single-user, desktop-only (Windows + macOS + Linux)
- No login, no network, no telemetry, no LLM
- Spec data and placement data are kept separate (see SPEC §3.2)
- `importedSpec` is immutable; edits apply to `workingSpec` clone (see SPEC §3.3)
- iPad is occasional read-mostly; desktop is the workhorse — PWA is a future phase

---

## Out of scope for v1

See SPEC §1.2 for the full list. Most notable:
- No LLM/AI features
- No mobile or iPad app (read-only PWA is a future phase)
- No cross-subject conflict detection
- No cloud sync
- No backwards compatibility with the v0 prototype

These constraints are deliberate. Do not relax them without explicit decision logs in `docs/`.
