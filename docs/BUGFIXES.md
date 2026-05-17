# Bugfixes — deferred punch list

Bugs and rough edges spotted during use, parked here for a future polish
pass. Newest entries on top. Add via `/fix <description>`.

---

## 2026-05-17 — Folder export: sub-topic / topic folders sort alphabetically (not spec order) because of human-readable-only naming

**Reported:** 2026-05-17
**Where:** `src/model/folderExport.ts` (`safe()` + folder-name construction in `buildByHalfTerm`/`buildByTopic`)
**What's wrong:** Per DEC-045 the user chose "just the human-readable name" for folder names (no code or numerical prefix). File managers then sort sub-topic folders within a topic alphabetically, not in curriculum/spec order. E.g. within "Motion and forces", sub-topics appear as "Acceleration and Newton's laws" / "Kinematics" / "Momentum" / "Stopping distances" — alphabetical, which happens to NOT match spec order (Kinematics is T2a, Acceleration is T2b in the spec but sorts second).
**Expected:** Folder names should preserve spec order in the file manager. Either: (a) revert to "Code-prefix + name" naming (`"T2a Kinematics"`) — one-line change in `safe()`/builders; or (b) add a numeric prefix per level (`"01 Kinematics"`, `"02 Acceleration"`) — requires tracking sibling indices during tree construction.
**Next step (when triaged):** Option (a) is cleaner: pass the code through to the safe-naming helper, prefix with `<code> ` before the name. Topic = topic.code; sub-topic = subTopic.code; lesson = `Lesson N` or position-in-HT. Half-terms already sort correctly (Aut < Spr < Sum < Y9 < Y10 < Y11 alphabetically aligns with chronology). Likely ~15 LOC change + test update.

---

## 2026-05-17 — Browser mode falls back to "File dialogs require Electron shell" for Open / Save / Import / Export

**Reported:** 2026-05-17
**Where:** `src/App.tsx` (`handleAddSubject`, `handleOpen`, `handleSave`, `handleSaveAs`, `handleExport`) and `src/components/ViewPlaceholder.tsx` (`importFromFile`)
**What's wrong:** When running in a browser (not the Electron shell), clicking Open / Save / Save As / + Add subject / Export shows an alert "File dialogs require the Electron shell" (or silently no-ops). The browser is only usable for "Load bundled example" + in-app editing + autosave.
**Expected:** Browser should support file operations via `<input type="file">` + `FileReader` for opens/imports and Blob + anchor download for saves/exports. Pattern already exists in `ViewPlaceholder.downloadTemplate()`. Save and Save As collapse to one operation in browser (browsers can't write back to source file).
**Next step (when triaged):** Wrap each gated op in `if (window.api) { …existing electron path… } else { …browser fallback… }`. Reuse the Blob + anchor pattern from `downloadTemplate` for save paths. Add `<input type="file" accept=".curriculum"/.xlsx>` triggered programmatically for opens. ~100-150 LOC, electron paths unchanged.

---
