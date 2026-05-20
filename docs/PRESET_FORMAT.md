# Preset JSON format

**Audience:** anyone authoring a curriculum-planner preset by hand or with an AI assistant. Presets are saved layouts: a snapshot of which sub-topics sit in which half-terms, plus any custom blocks the layout depends on.

**Status:** canonical — the planner's `parseSavedPresetJson` enforces this shape and will reject any document that doesn't match.

---

## 1. Why presets exist

A preset captures one *recipe* for organising a curriculum across the year. The planner ships with three algorithmic presets (three-spiral, frontloaded, interleaved) calibrated against the bundled example physics scheme. For any other subject those algorithms aren't tuned, so the planner hides them — you author your own presets instead.

A preset travels with the subject inside the `.curriculum` file. To share a preset between subjects (or between people), export it as JSON, paste it into the **Paste preset JSON** form in the preset picker, and the planner will validate and add it.

---

## 2. Top-level shape

```jsonc
{
  "id": "optional-stable-id",
  "name": "Y10 mocks-first interleaved",      // required, free text
  "description": "Mocks in Spr 2; …",         // optional, free text
  "createdAt": "2026-05-20T10:00:00.000Z",    // optional ISO 8601 — defaults to now on import
  "customBlocks": [ /* see §3 */ ],
  "placements":   [ /* see §4 */ ]            // required
}
```

`id` is optional. If omitted, the planner mints one on import. If included, it must be globally unique within the subject's `presets` list. If you want to update an existing preset, include its existing id and delete the previous version first via the picker — there's no "upsert" path.

---

## 3. `customBlocks[]`

Each entry describes one custom block the preset will create when applied. The `ref` is local to this preset — it's how `placements[].source` points at the right block. Refs are arbitrary strings; the convention is `cb1`, `cb2`, … in first-use order.

```jsonc
{
  "ref": "cb1",                  // required, unique within this preset
  "name": "End of Aut 1 test",   // required, free text
  "lessons": 1,                  // required, positive integer
  "colour": "#B98D2C",           // optional, CSS hex — null for "use category default"
  "category": "test",            // required, one of: test, lesson, unit, assessment, retrieval, other
  "label": "calculator paper",   // optional, short secondary descriptor
  "revisits": ["T1a", "T2c"],    // optional, only meaningful for category="retrieval"
  "isEoHT": true                 // optional, true if this is the auto-seeded end-of-HT test block
}
```

If the preset has no custom blocks at all, omit the array or send `[]`.

---

## 4. `placements[]`

Each entry places one block into one half-term cell. Order doesn't affect placement — the planner reads the array and drops each placement straight into its named cell. Lessons aren't packed with the spillover engine: the placement specifies exactly `lessonsClaimed` and `lessonRange`, so you're responsible for ensuring the numbers add up to a sensible plan.

```jsonc
// Sub-topic placement
{
  "halfTermId": "Y9-A1",                  // required — must match a cell in the subject's timeline
  "source": {
    "kind": "sub-topic",
    "subTopicCode": "T1a"                 // required — the importer-assigned code (T1, T1a, T1b, …)
  },
  "lessonsClaimed": 4,                    // required, positive integer
  "lessonRange": [0, 4],                  // required — [start, end) into the sub-topic's lessons array
  "splitType": "auto"                     // optional, one of: "auto" | "manual" | omitted
}

// Custom-block placement
{
  "halfTermId": "Y9-A1",
  "source": {
    "kind": "custom",
    "customBlockRef": "cb1"               // must match a ref defined in customBlocks[]
  },
  "lessonsClaimed": 1,
  "lessonRange": [0, 1]
}
```

### Half-term IDs

Half-term IDs are produced by the calendar template. The default UK template uses `Y{n}-{Term}{n}`:

| Year | Half-term | id      |
|------|-----------|---------|
| 9    | Aut 1     | `Y9-A1` |
| 9    | Aut 2     | `Y9-A2` |
| 9    | Spr 1     | `Y9-S1` |
| 9    | Spr 2     | `Y9-S2` |
| 9    | Sum 1     | `Y9-U1` |
| 9    | Sum 2     | `Y9-U2` |

Replace `9` with `7..13` for other year groups. If a school uses a custom calendar template the ids may differ — open the subject's calendar settings to inspect them, or look in the `.curriculum` file.

### Sub-topic codes

Sub-topic codes are assigned at import time and are stable for the life of the subject. `T1a` = the first sub-topic of the first topic, `T1b` = the second sub-topic of the first topic, `T2a` = the first sub-topic of the second topic, etc. Renaming a topic in the app does not change its code.

If you reference a code that no longer exists (e.g. the spec has been re-imported and the sub-topic was renamed), the planner skips that placement and shows a "{N} placements skipped" notice on apply. Existing matched placements still go in.

---

## 5. Minimal worked example

A preset that places sub-topic T1a into Y9-A1 for 4 lessons, then adds an end-of-half-term test:

```json
{
  "name": "Tiny example",
  "customBlocks": [
    {
      "ref": "cb1",
      "name": "End of Aut 1 test",
      "lessons": 1,
      "colour": "#B98D2C",
      "category": "test"
    }
  ],
  "placements": [
    {
      "halfTermId": "Y9-A1",
      "source": { "kind": "sub-topic", "subTopicCode": "T1a" },
      "lessonsClaimed": 4,
      "lessonRange": [0, 4]
    },
    {
      "halfTermId": "Y9-A1",
      "source": { "kind": "custom", "customBlockRef": "cb1" },
      "lessonsClaimed": 1,
      "lessonRange": [0, 1]
    }
  ]
}
```

---

## 6. Authoring with an AI assistant

A practical workflow:

1. Save your current plan as a preset using the picker. Open the `.curriculum` file in a text editor, copy the `presets[]` entry — that's a real, valid preset in the exact format the planner expects.
2. Show that as a few-shot example to the AI, along with this document.
3. Ask the AI to produce a new preset for a different teaching philosophy (e.g. "rebuild this for a one-year intensive: collapse Y9 + Y10 into Y10 only, mocks in Spr 1, all depth content in Sum 1–2").
4. Paste the AI's output into the **Paste preset JSON** form. The validator will tell you exactly which field is wrong if anything is off.

Things the AI is likely to get wrong, in rough order of frequency:

- **Made-up sub-topic codes.** It might confidently emit `T16a` when your spec only goes up to `T15`. Always cross-check.
- **Lesson counts that don't add up.** If a sub-topic has 5 lessons and the AI puts `lessonsClaimed: 8`, the plan looks fine to the validator (it doesn't cross-check against the spec yet) but you'll see oversized blocks on apply.
- **Half-term IDs from the wrong calendar.** If your school uses a custom template, the AI's default `Y9-A1` shape may not match.
- **Inventing custom blocks not referenced anywhere.** Harmless but bloats the file.

Validation runs on paste-import, so unrecoverable errors are caught before any state changes. Soft errors (missing sub-topic codes, missing half-term IDs) are caught at *apply* time and shown as "N placements skipped".

---

## 7. What presets deliberately don't capture

- **The imported spec itself.** A preset has placements that reference sub-topic codes; it can't reconstruct the sub-topics. To share a complete plan with someone, share the `.curriculum` file.
- **Per-block user edits** (titles, notes). Those live on `PlacedBlock.userEdits` and are tied to the live placement, not the preset recipe.
- **Subject config** (depth toggle, lost-lesson buffer, retrieval weights, spacing thresholds). Those are subject-wide preferences, not part of a layout recipe.
- **Calendar template overrides.** A preset that captured the calendar would break the moment you applied it to a subject with a different year-group setup.

If you find yourself wanting to share any of those, save and share the whole `.curriculum` file instead.
