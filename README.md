# Curriculum Planner

A desktop curriculum planning tool for secondary-school teachers. Imports an Excel specification (e.g. Edexcel 1PH0 GCSE Physics) and produces an interactive year-by-year planner with drag-and-drop placement, four zoom levels (Topic / Sub-topic / Lesson / Objective), preset layouts (spiralling / frontloaded / interleaved), spacing + retrieval-suggestion analytics, and flexible export formats.

**Built with:** Electron · React · TypeScript · Tailwind · Vite · SheetJS · dnd-kit · Zustand
**Author:** Joshua Stafford-Haworth
**License:** UNLICENSED (private project)

---

## Download

Pre-built installers are produced for every tagged release by GitHub Actions.

→ **[Get the latest release](https://github.com/JSHPhysics/curriculum-planner/releases/latest)**

| Platform | File |
| --- | --- |
| Windows 10/11 | `Curriculum-Planner-Setup-*.exe` |
| macOS (Intel + Apple Silicon) | `Curriculum-Planner-*.dmg` |
| Linux (x86_64) | `Curriculum-Planner-*.AppImage` |

The installers are unsigned (no Apple Developer ID, no Windows code-signing certificate). On first launch:
- **Windows:** SmartScreen may warn — click "More info" → "Run anyway".
- **macOS:** Right-click the app and pick "Open" the first time (Gatekeeper).
- **Linux:** `chmod +x Curriculum-Planner-*.AppImage` then double-click.

---

## What it does

1. **Import** an `.xlsx` curriculum specification matching [the import schema](docs/SPEC.md#5-import-format) — the bundled "Load example" button is the fastest way to see what's expected.
2. **Place** sub-topics into a fortnight-by-fortnight timeline (default UK: Y9 → Y11; configurable per workspace).
3. **Refine** via drag-and-drop, the four zoom levels (Topic / Sub-topic / Lesson / Objective), and per-cell retrieval-block authoring.
4. **Diagnose** the plan via the Spacing Panel (single-touch, unplaced, blocked-cell, well-spaced flags) and per-cell retrieval-candidate suggestions.
5. **Apply a preset layout** (three-spiral, frontloaded, interleaved) for a deterministic starting point — refine from there.
6. **Export** as a single workbook, a zip/folder of per-half-term workbooks (with weekly schedules), or a zip/folder of per-topic workbooks.

No login, no network, no telemetry, no AI. Plans live in `.curriculum` files (JSON) on your local disk.

---

## Quick tour

- **`+ Add subject`** in the Header → pick a `.xlsx` matching the import format
- **`📐 Preset layout…`** in the StatusBar → pick a starting layout (three-spiral / frontloaded / interleaved)
- **`📅 Calendar`** in the Header → tune the workspace-wide half-term structure (Y7–Y13 supported, custom date ranges, per-half-term lesson budgets)
- **Right-click a subject tab** → set Key Stage, hide year groups, restore to imported spec
- **Plan health** strip below the Header → expand for spacing analytics
- **Export** → modal with single-workbook / folder-by-HT / folder-by-topic / zip options

The bundled example loads in two clicks and exercises every feature on a representative 66-lesson Edexcel 1PH0 spec.

---

## For developers

```bash
# Install
npm install

# Dev (launches Vite dev server + Electron concurrently)
npm run dev

# Quality gates
npm run typecheck     # tsc + electron tsconfig
npm test              # vitest unit
npm run test:e2e      # Playwright
npm run build:renderer
npm run build         # full electron-builder package (writes to release/)

# Regenerate the demo .xlsx after editing the spec
npm run build:example-spec
```

Project structure, design decisions, and session-by-session build log are under [`docs/`](docs/):
- [`SPEC.md`](docs/SPEC.md) — canonical specification
- [`SESSION_LOG.md`](docs/SESSION_LOG.md) — what each session built + why
- [`DECISIONS.md`](docs/DECISIONS.md) — design decisions made during the build
- [`PEDAGOGY.md`](docs/PEDAGOGY.md) — rationale for the analytics defaults
- [`BUGFIXES.md`](docs/BUGFIXES.md) — deferred punch list

---

## Releases

Releases are cut by pushing a `v*` git tag. GitHub Actions then builds installers for all three platforms and attaches them to the release.

```bash
# Maintainer workflow (example):
npm version 1.2.0 --no-git-tag-version
git add package.json package-lock.json
git commit -m "chore: bump to 1.2.0"
git tag v1.2.0
git push origin main --tags
# → Actions builds + publishes installers automatically
```

---

## Status

v1.1 ships:
- 4 view zoom levels with drag-and-drop placement
- Workspace-level + per-subject calendar templates (Y7–Y13)
- Key Stage classification + hideable year groups
- Spacing analytics + retrieval-suggestion engine (deterministic, no AI)
- Three preset layouts
- Three export modes (single workbook · folder/zip by half-term · folder/zip by topic)
- `.curriculum` save/load + autosave to localStorage
- 75+ Edexcel 1PH0 Physics demo lessons across 15 topics

See [the session log](docs/SESSION_LOG.md) for the build timeline.
