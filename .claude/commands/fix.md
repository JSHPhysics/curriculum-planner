---
description: Add a bug to the project's deferred-bugfixes list without fixing it now.
argument-hint: <terse description of the bug, optionally with file paths>
---

The user has spotted something broken and wants to log it for later — they do
NOT want you to fix it now. Your only job this turn is to append a structured
entry to `docs/BUGFIXES.md` and confirm to the user.

The bug they want logged:

$ARGUMENTS

## Steps

1. Read `docs/BUGFIXES.md`. If the file doesn't exist yet, create it with the
   header below:

   ```
   # Bugfixes — deferred punch list

   Bugs and rough edges spotted during use, parked here for a future polish
   pass. Newest entries on top. Add via `/fix <description>`.

   ---
   ```

2. Append a new entry **at the top** (under the `---`, above any existing
   entries) using this template:

   ```
   ## YYYY-MM-DD — <short title derived from the user's input>

   **Reported:** <ISO date>
   **Where:** <file path / component / view / "unclear" if not obvious>
   **What's wrong:** <one or two sentences from the user's input, polished but faithful>
   **Expected:** <only include if the user said what should happen instead>
   **Next step (when triaged):** <a one-line hint at how to investigate — e.g. "reproduce in BlockEditModal with a placed sub-topic"; omit if you have no useful hunch>

   ---
   ```

   Use today's date. If the user mentioned a specific file, component, or
   view, capture it under **Where**. Otherwise put "unclear".

3. Do NOT investigate the bug, open files to verify, run tests, or attempt
   a fix. The whole point is to defer.

4. Reply to the user in **one sentence**: confirm the bug was logged with
   the title you used, plus the file path. No follow-up questions, no
   options, no "want me to fix it now?" — they already chose to defer.

## Notes for future you

- The bugfix file is committed to the repo, so it surfaces in every session
  and on every checkout.
- When the user is ready to triage, they'll ask for it explicitly. Don't
  preemptively suggest tackling bugs from the list at every session start
  unless they ask.
- If the user provides multiple separate bugs in one `/fix` call, log them
  as separate entries (each gets its own `##` block).
