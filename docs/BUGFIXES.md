# Bugfixes — deferred punch list

Bugs and rough edges spotted during use, parked here for a future polish
pass. Newest entries on top. Add via `/fix <description>`.

---

## 2026-05-17 — Browser mode falls back to "File dialogs require Electron shell" for Open / Save / Import / Export

**Reported:** 2026-05-17
**Where:** `src/App.tsx` (`handleAddSubject`, `handleOpen`, `handleSave`, `handleSaveAs`, `handleExport`) and `src/components/ViewPlaceholder.tsx` (`importFromFile`)
**What's wrong:** When running in a browser (not the Electron shell), clicking Open / Save / Save As / + Add subject / Export shows an alert "File dialogs require the Electron shell" (or silently no-ops). The browser is only usable for "Load bundled example" + in-app editing + autosave.
**Expected:** Browser should support file operations via `<input type="file">` + `FileReader` for opens/imports and Blob + anchor download for saves/exports. Pattern already exists in `ViewPlaceholder.downloadTemplate()`. Save and Save As collapse to one operation in browser (browsers can't write back to source file).
**Next step (when triaged):** Wrap each gated op in `if (window.api) { …existing electron path… } else { …browser fallback… }`. Reuse the Blob + anchor pattern from `downloadTemplate` for save paths. Add `<input type="file" accept=".curriculum"/.xlsx>` triggered programmatically for opens. ~100-150 LOC, electron paths unchanged.

---
