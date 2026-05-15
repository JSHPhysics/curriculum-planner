# Decisions Log

Architectural and design decisions that diverge from, refine, or supplement `SPEC.md`. Append-only — to overturn a decision, add a new entry that supersedes the old one (do not edit history).

Each entry: **what was decided, why, and what it rules out.** If the spec is ambiguous and a choice had to be made, note that here so it's not relitigated.

---

## D-001 — `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` stay on

**Date:** 2026-05-15 *(Session 0, retroactive)*

**Decision:** Both stay enabled in `tsconfig.json` for the renderer.

**Why:** The data model is the long-term load-bearing surface of this app. Catching "I assumed this array index existed" and "I forgot to set this optional field" at compile time is worth the boilerplate. The cost is paid most heavily in the model layer (which we're about to write) and amortises afterwards.

**Rules out:** Concise `arr[i].foo` chains without a narrowing step; spreading partial objects into types with non-`| undefined` optionals.

---

## D-002 — Tests directory added to `tsconfig.json` includes

**Date:** 2026-05-15 *(Session 1)*

**Decision:** `tsconfig.json` `include` now lists `tests` alongside `src`. The `tests/e2e` folder remains excluded (it'll need Playwright types later).

**Why:** Vitest does its own type checking via the TS compiler at run-time, but `npm run typecheck` is the gate before commit. Without this, a broken test passes typecheck and only fails when `npm test` runs. Catch it once, at the same gate.

**Rules out:** Letting unit tests carry latent type errors that the typecheck step misses.

---

## D-003 — Sub-topic codes use base-26-ish letter sequences past `z`

**Date:** 2026-05-15 *(Session 1)*

**Decision:** Sub-topic suffixes are `a..z`, then `aa..zz`, then `aaa..zzz`, etc. Concretely: position `n` (0-indexed) maps to a base-26 representation using `a-z`. `BUILD_PLAN.md` mentioned "`T1aa`, `T1ab`" as the pattern after `T1z`; this implements that.

**Why:** The spec doesn't define what happens past 26 sub-topics in a topic; build plan suggests `aa`/`ab`. Real curricula rarely exceed ~10 sub-topics per topic, so this is a defensive choice — any deterministic scheme is fine, this one matches the build plan's hint.

**Rules out:** Switching to numeric suffixes (`T1-27`) or running out at 26. If real-world data ever crosses ~100 sub-topics in one topic, revisit display formatting (`T1aaa` is ugly), but the algorithm holds.

---

## D-004 — Codes are stable by position, names are free-text

**Date:** 2026-05-15 *(Session 1, restating `SPEC.md §3.4`)*

**Decision:** `generateTopicCode` and `generateSubTopicCode` take the list of existing codes and emit the next free one in sequence. They do not look at topic names. Renaming a topic in `workingSpec` therefore does **not** change its code.

**Why:** Stable IDs let `PlacedBlock.source` reference a sub-topic by code across spec edits and restore-to-import. Codes-from-names would invalidate placement on every rename.

**Rules out:** Hash-based or name-slug-based codes; user-editable codes.
