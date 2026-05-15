# Decisions

Log of design decisions made *during the build* that aren't covered in `SPEC.md`. Anything that changes how the system behaves, or that a future reader would need to know to understand the code.

**When to add an entry:**
- A SPEC.md requirement turned out to be ambiguous and a choice was made
- A practical constraint forced a different approach than the spec described
- A user request mid-build added or changed a requirement
- A trade-off was made that future maintainers should understand

**When NOT to add an entry:**
- Trivial implementation choices (variable names, file organisation)
- Things already explicit in SPEC.md
- Bug fixes (those belong in commit messages)

If a decision contradicts SPEC.md, **also update SPEC.md** in the same commit, with a reference to the decision entry.

---

## Entry template

```
## DEC-NNN — Short title
**Date:** YYYY-MM-DD
**Session:** N
**Status:** Accepted | Superseded by DEC-NNN | Reversed

### Context
What problem prompted this decision.

### Decision
What was decided. Be specific.

### Alternatives considered
Options weighed, briefly.

### Consequences
What this means for current and future work.

### Related
SPEC.md sections touched, files affected, prior DECs.
```

---

## Entries

(none yet)
