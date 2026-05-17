# Pedagogical Reference — Spacing, Interleaving, and Retrieval

**Audience:** the teacher using the planner. This document explains, in pedagogical terminology, the reasoning behind the app's spacing analytics and retrieval-suggestion engine. It's the canonical reference; UI tooltips and "Why?" disclosures summarise it.

**Status:** living document. Refinements based on classroom evidence welcome.

---

## 1. The two principles

### Spacing (distributed practice)

Material that is re-encountered after a gap is retained more strongly than material practised in a single block. Cepeda et al. (2006) meta-analysed 254 studies and found a robust positive relationship between gap-to-test ratio and long-term retention. The optimal inter-study interval (ISI) depends on the retention interval you care about: as a rule of thumb, ISI ≈ 10–30% of the desired retention interval. For a year-end exam, that's months between revisits, not weeks.

### Interleaving (varied practice)

Within a block of practice, mixing topics produces better discrimination and transfer than blocked practice (Rohrer & Taylor 2007; Rohrer 2012). The downside: students *feel* less competent during interleaved practice (lower in-session accuracy), which is why teachers and students often prefer blocking. This is one of Bjork's "desirable difficulties" — short-term struggle that produces long-term retention.

### Retrieval practice (testing effect)

Bringing information to mind from memory — quizzing, low-stakes recall, free recall — produces stronger learning than re-reading or re-presentation (Roediger & Karpicke 2006). Spacing and retrieval compose well: spaced retrieval is the single most evidence-supported study technique we have.

---

## 2. Why the planner surfaces these as a structural concern

The planner doesn't know what your students *know*. It can't simulate forgetting curves. But it does know:

- **When** each sub-topic was placed (calendar topology)
- **What proportion** of each half-term is dominated by one topic
- **Which sub-topics were flagged** in your import as "depth" or higher-difficulty

That's enough to surface structural patterns that correlate with the principles above. A topic that appears once in Y9 and never again will be hard to remember by Y11, regardless of how well it was taught. A half-term that's 90% one topic gives students no chance to interleave that material against contrasting examples. The planner *flags* these patterns — your judgement decides whether they're deliberate (e.g. a foundational topic intentionally taught once early) or accidental.

---

## 3. The Spacing panel — what each flag means

### Single-touch sub-topics

A sub-topic placed exactly once in the timeline.

**Why this matters:** With no revisit, the only retrieval practice happens within the original teaching block. By exam time, that's months or years of forgetting with no spaced reinforcement. For foundational content that subsequent topics depend on, this is usually fine — the material gets revisited *implicitly* when it's applied. For higher-difficulty or depth-extension content (which doesn't get revisited implicitly), single-touch placement is a known weak point.

**What to do:** add a retrieval block in a later half-term that revisits the sub-topic, or split the original placement so part of it lives later in the year.

### Unplaced sub-topics

A sub-topic with no placements anywhere.

**Why this matters:** spec content with no calendar slot is content not taught. This is a coverage gap, not a spacing one — but the same panel surfaces both because they share the "is this on the plan at all?" question.

**What to do:** drag the sub-topic from the pool into a cell. If the omission is deliberate (e.g. an optional triple-only topic for a foundation cohort), it's safe to ignore.

### Blocked cells

A half-term with ≥4 lessons where one topic accounts for ≥80% of the lessons.

**Why this matters:** in such a cell, students experience extended blocked practice on a single domain. They build fluency *within* the topic but get no within-session opportunity to contrast it against neighbouring topics — the very skill exam questions test. Rohrer's lab work consistently shows interleaving produces stronger transfer for mathematics-like material; the effect generalises to most subjects with discriminable categories.

**What to do:** consider splitting some of the blocked sub-topic across two half-terms with another topic interleaved between them. If the cell IS intentionally a deep-dive (e.g. all of Y11 Spr 1 dedicated to a single PPE topic), the warning is informational and safe to leave.

### Well-spaced sub-topics

A sub-topic with 3+ placements whose mean inter-placement gap is ≥4 half-terms.

**Why this matters:** this configuration approximates spaced practice — the sub-topic is encountered repeatedly at intervals long enough for forgetting to begin, which is when retrieval payoff is highest. It's a *positive* flag: the planner is telling you a structural pattern you set up is good.

**What to do:** keep it. Use it as a template for other high-priority sub-topics.

---

## 4. The retrieval-suggestion engine — what the scoring weights mean

The popover ranks previously-placed sub-topics by how much each would benefit from being revisited *right now* (in the cell you opened it from). Each candidate's score is a sum of four signals:

```
score = gapScore + depthBonus + difficultyBonus + recentnessPenalty
```

clamped to 0..1. Higher = better retrieval candidate.

### gapScore — "how long since this was last touched"

```
gapScore = clamp(halfTermsSinceLastTouch / peakGapHalfTerms, 0, 1)
```

The dominant signal. A sub-topic last seen 1 half-term ago contributes a small gapScore; one last seen `peakGapHalfTerms` (default 12) or longer ago contributes the maximum of 1.

**Why this shape:** Bjork's "desirable difficulties" framework predicts that retrieval is most beneficial when it's hard but successful — i.e. when there's been enough forgetting that recall takes effort, but not so much that recall fails entirely. For school timescales (weeks to years), the inflection is well past "a few weeks ago" and into "the previous half-term or earlier". A 12-half-term ceiling (~72 weeks at 6 weeks per half-term) sits inside Cepeda's optimal ISI window for a one-year-out retention test.

**Adjust** `peakGapHalfTerms` **down** if you want the engine to weight shorter gaps more heavily (e.g. you teach in shorter cycles or want quicker reinforcement). **Adjust up** if you want the engine to only flag content from genuinely earlier in the year.

### depthBonus — "is this depth-extension content?"

```
depthBonus = (subTopic.isDepth || any lesson.isDepth) ? depthBonus : 0
```

A flat bonus added if the sub-topic carries the depth flag from your import. Default `+0.15`.

**Why this signal:** depth-extension content (in Triple Science: the higher-tier topics; analogous in other subjects: the stretch content) is what you've explicitly marked as "more important to revisit". The planner respects your authoring intent. Depth content also tends to receive less implicit revisit through subsequent teaching, so spaced retrieval matters more for retention.

**Adjust** `depthBonus` **up** if depth content is your single highest-priority retrieval target. **Adjust down to 0** if depth flags in your import don't carry pedagogical weight in your subject.

### difficultyBonus — "is this conceptually hard?"

```
difficultyBonus = (subTopic.difficulty - 1) × difficultyBonusPerLevel
```

Sub-topics imported with `Difficulty: 1` contribute 0; `Difficulty: 3` contributes the default `+0.2`.

**Why this signal:** harder content produces stronger encoding when retrieved (effortful processing — Craik & Lockhart 1972; refined in Bjork's "desirable difficulties"). Easier content is more robust to forgetting in the first place. The bonus is small relative to gapScore because difficulty is an *authoring* signal (the teacher's pre-class judgement), not a *student-performance* signal (which the planner has no access to).

**Adjust** `difficultyBonusPerLevel` **up** if you want the engine to aggressively prioritise high-difficulty content for retrieval. **Adjust down to 0** if difficulty in your import is noisy or not pedagogically meaningful.

### recentnessPenalty — "has this been revisited already?"

```
recentnessPenalty = totalPlacementsToDate > 1 ? repeatedPlacementPenalty : 0
```

Default `-0.1`, applied when the sub-topic has been taught more than once before the context half-term.

**Why this signal:** sub-topics already taught twice (or more) are presumably in better shape than single-touch ones. The penalty is mild (it doesn't override gapScore for very large gaps) but nudges the engine to surface neglected content first. The forgetting curve flattens with successive successful retrievals (Ebbinghaus 1885; Karpicke & Roediger 2008), so each additional revisit produces diminishing returns.

**Adjust** `repeatedPlacementPenalty` **further negative** (e.g. -0.2) if you have a curriculum with lots of redundancy and want to surface only the most-neglected content. **Adjust toward 0** if you want the engine to be neutral about how often content has been seen.

---

## 5. Things the engine deliberately doesn't do

- **It doesn't simulate forgetting curves per student.** The planner has no student-level data. The signals are structural; the inference (what should I revisit?) is yours.
- **It doesn't recommend specific retrieval activities.** "Add a recall starter for T2a" tells you *what* to revisit; *how* to revisit (low-stakes quiz, free recall, retrieval practice with flashcards, multiple-choice probe, etc.) is your call.
- **It doesn't auto-place retrieval blocks.** You stay in control of where retrieval slots go; the engine ranks candidates.
- **It doesn't use AI or learned weights.** Every weight is a constant you can read and adjust. Same inputs → same outputs across runs and machines. This makes the engine auditable and trustworthy in a way an ML-trained scorer wouldn't be.

---

## 6. Bibliography (selected)

- **Cepeda, N. J., Pashler, H., Vul, E., Wixted, J. T., & Rohrer, D. (2006).** Distributed practice in verbal recall tasks: a review and quantitative synthesis. *Psychological Bulletin*, 132(3), 354–380.
- **Rohrer, D., & Taylor, K. (2007).** The shuffling of mathematics problems improves learning. *Instructional Science*, 35(6), 481–498.
- **Roediger, H. L., & Karpicke, J. D. (2006).** Test-enhanced learning: taking memory tests improves long-term retention. *Psychological Science*, 17(3), 249–255.
- **Bjork, R. A. (1994).** Memory and metamemory considerations in the training of human beings. In J. Metcalfe & A. Shimamura (Eds.), *Metacognition: Knowing about knowing*. MIT Press.
- **Craik, F. I. M., & Lockhart, R. S. (1972).** Levels of processing: a framework for memory research. *Journal of Verbal Learning and Verbal Behavior*, 11(6), 671–684.
- **Karpicke, J. D., & Roediger, H. L. (2008).** The critical importance of retrieval for learning. *Science*, 319(5865), 966–968.

---

## 7. Where each weight is implemented

For when you want to read the code, not just the prose:

- Defaults: `src/model/retrievalSuggestions.ts` → `DEFAULT_RETRIEVAL_WEIGHTS`
- Per-subject overrides: `SubjectConfig.retrievalWeights` in `src/model/types.ts`
- Resolution logic: `resolveRetrievalWeights(subject, override?)`
- Scoring: `buildCandidate()` in the same file
- UI tuning: `WeightsEditor` inside `src/components/RetrievalSuggestionPopover.tsx`
- Spacing flag thresholds: top of `src/model/spacing.ts` (`BLOCKED_CELL_*`, `WELL_SPACED_*`) — these are not currently exposed to UI tuning. If you want to surface them, the same `SubjectConfig` extension pattern applies.
