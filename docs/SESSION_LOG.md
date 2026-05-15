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

(Session 0 was completed before this log existed. The next session should retroactively fill in a Session 0 entry from `git log` and the actual project state, then proceed to its own session as normal.)
