# Response Scales v2: one panel for numeric, word and special responses

**Status (21 Oct 2026, late):** sections 1-15 built for numeric scales and hand-tested (Fixture A, Fixture B, template path). Section 16 records what the state fix changed. Section 17 is the Word scales v3 design (prompt P2c-4), found broken by the owner's hand test of `fixture_words.csv`.

Owner-approved redesign (Oct 2026). Replaces the numeric/categorical choice and moves the "allowed non-response" editor out of Data Quality. Math rules stay in `scientific-spec.md` §0–1.

## 1. Goals
Every response in a column is accounted for; nothing is silently counted as a "unique value"; out-of-range stays detectable; N/A can be missing **or** scored by the questionnaire's norms; Data Quality only has to deal with truly blank cells.

## 2. Data per scale (`survey_configs.response_scale`, per subscale)
`{ min, max, rangeSource: detected|manual|preset, confirmed: bool, flipped: bool, startsAtZero: bool, labels: [{ text, value: number|null, kind: scale|special, reverse: false }], outOfRange: missing|widen }`
- `value = null` means **not scored (missing)**. A number means **scored as that number**.
- A **built-in list of usual missing codes** (N/A, NA, n/a, Prefer not to say, -99, -999 …) pre-fills special rows as "not scored". There is **no separate editor** for this list: anything the user wants handled differently is simply changed in that scale card's table.
- Migration: old numeric scale → min/max, empty labels; old categorical → labels with values, range = min/max of mapped values. Migrated scales are marked `confirmed: true` (the user set them).

## 3. Resolving one cell (single function, used by scoring, DQ, reliability, item analysis)
1. Normalize text (trim, Unicode NFKC, case-fold). Blank → `blank` (unexpected missing).
2. Matches a label → `value` null: `special_missing`; number: `scale` kind → `valid`; `special` kind → `special_scored` (**not reversed** unless the label's `reverse` is ticked).
3. Numeric: in [min, max] → `valid`; a usual numeric missing code (e.g. -99) → `special_missing` (listed in the table); otherwise `out_of_range` (action per `outOfRange`; default **treat as missing**, flagged, never altered).
4. Non-numeric text with no label → `unmapped` (invalid until the user decides; shown in the table, flagged).
Decimals present in a column → treated as continuous (slider): range from observed values, decimals not flagged.

## 4. Range detection (auto, a suggestion until confirmed)
- Candidates: 0–3, 0–4, 0–5, 0–6, 0–7, 0–10, 1–3, 1–4, 1–5, 1–6, 1–7, 1–9, 1–10, 0–100.
- Choose the candidate with the **smallest span that covers at least 99%** of numeric responses across the scale's items. If none, fall back to the observed min–max and say "unusual range, please confirm". A second step for small samples (weak-end check) was added on 21 Oct 2026: see section 16.3.
- **Detection is only a suggestion** (`confirmed: false`). The card shows "Detected: 1–4 scale (not confirmed)" with a **Confirm range** button; editing min/max also confirms. Reason: a real 1–5 scale where nobody chose 5 would be detected as 1–4, which breaks reverse scoring and drops real answers.
- **A subscale that has reverse items is not scored until its range is confirmed.** The status area says "Confirm the range for <subscale> (it has reverse items)". Subscales without reverse items are scored with the suggested range and show "range not confirmed".
- **One step beyond:** if the stray values are exactly one step past a detected end and the widened range is itself a candidate (e.g. a few 5s on a detected 1–4, widened to 1–5), the message says "N values are 5, one above the detected range: this may be a 1–5 scale" and the **default action is Widen range**. Values farther away (e.g. P26's 7 on a 1–5 scale) default to **Treat as missing**.
- The range is otherwise **not** widened to include stray values (that would make out-of-range undetectable): "1–5 detected. 1 value outside (Q4, P26)" with a link to the cell, and the two actions **Treat as missing** or **Widen range**.
- If the user enters a range by hand, outside values are reported the same way.
- Mixed ranges within a subscale: an item is flagged ("may use a different scale than the rest") only when more than 10% of its numeric responses fall outside the subscale's range. Differences in observed minimum or maximum between items are normal (nobody chose an extreme answer, one stray value) and are never flagged; strays are handled by the out-of-range message.

## 5. Word scales
- If most distinct non-special words match a preset (after normalization and common variants) the preset is applied automatically: labels → 1…k, range updates, **Flip order** and **Start at 0** buttons. Any other response in the data becomes an extra row.
- No preset matches: all distinct words appear on the left with empty numbers on the right; the range follows the numbers the user enters.
- More than 15 distinct non-numeric responses in a column: suggest "this looks like a demographic or ID, not a scale item".
- Presets: agreement (5, 7), frequency, satisfaction, importance, likelihood, quality, plus existing app presets.

## 6. Screen layout (the whole Response Scales step)
*(Items 3 and 4 below are superseded by section 15.)*
- At the top: the **Apply first to all** button (copies range, labels, flip and start options from the first subscale to the others, then re-checks each one).
- Next to it: the **Overall scale** switch (section 11). When on, the Overall card sits above the subscale cards.
- Below: **one card per subscale**. Nothing else on the page.
- Inside each card, top to bottom:
  1. Header line: "Detected: 1–5 scale" with editable min and max and a **Confirm range** button (status: not confirmed / confirmed).
  2. Out-of-range message (only if needed) with links to the cells and the two actions: **Treat as missing** (default) or **Widen range**.
  3. **Other responses found** table (only if there are any): response, count, number box (empty = not scored). Built-in missing codes are grey, unknown responses amber. A small caption lists the built-in codes.
  4. **Word labels** section (shown automatically when words are found, otherwise behind a "Responses are words" link): preset dropdown, Flip order, Start at 0, the mapping rows, and a "values without a label" message.
  5. Score columns: **Show: Sum, Mean, Custom formula**, any combination, at least one (section 11).

## 7. Data Quality coordination
- The old **allowed non-response editor is removed from Data Quality** (it is replaced by the per-card table). `special_missing` = allowed non-response (not an error); `special_scored` = valid; `out_of_range` and `unmapped` are flagged; `blank` = unexpected missing (thresholds and proration apply here).
- Items in no subscale have no card; their responses resolve with the built-in defaults.
- DQ's thresholds sit under an "Advanced" disclosure; the top shows a plain-language summary.

## 8. Templates
Store range, labels and values, flip/start flags. New values in another file appear as "needs a number".

## 9. Tests (write first)
Fixture A Q3/Q5 (detected 1–5; N/A and Prefer not to say as `special_missing`; P26's 7 `out_of_range` for Q4); N/A scored 0 and not reversed on a reverse item; preset match plus extra N/A row; non-matching words with empty numbers; flipped preset; 0-start; mixed ranges; >15 distinct words; decimals/slider; widen-range action; Apply-first-to-all; migration of old records; template round trip; one resolution function feeds scoring, DQ and reliability identically. Detection: 1–4 detected when nobody chose 5 (unconfirmed; reverse subscale held until confirmed); 3 fives in 300 responses suggest Widen range by default; P26's 7 defaults to Treat as missing; confirmation persists and survives reload; migrated records are confirmed.

## 10. Gap checklist (every item must be built and tested)
1. Direction: **Flip order** (1 = Strongly agree) and **Start at 0** for presets.
2. Word variants: case, extra spaces and Unicode forms match one label (`"strongly agree"`, `"Strongly Agree "`).
3. Numeric missing codes (-99, -999) appear in the table as built-in codes, not as out-of-range errors; unknown out-of-range numbers stay flagged.
4. Decimals in a column: treated as continuous (slider), not flagged.
5. More than 15 distinct words: suggest demographic/ID instead of building a huge table.
6. Mixed ranges within a subscale: flag items with more than 10% of responses outside the range (see section 4); never silently pick one.
7. Scored special responses (N/A → 0) are not reversed unless ticked.
8. Out-of-range actions (treat as missing / widen range) are written to the cleaning log with counts; cells are never altered.
9. Out-of-range and unmapped messages link to the cells in the LiveGrid.
10. Templates keep range, labels, values and flags; new unmatched values appear as "needs a number".
11. Apply first to all copies and re-checks.
12. Migration of existing saved scales (numeric and categorical).
13. Extra tests: numeric -99 code; word variants; 0-start; flip; cleaning-log entries.
14. Detection is a suggestion: Confirm range button and status; reverse-item subscales are not scored until confirmed.
15. One-step-beyond rule: widened range that is itself a candidate defaults to Widen range; farther values default to Treat as missing.
16. Apply first to all copies the confirmed state only if the first subscale is confirmed; templates carry confirmed ranges.

## 11. Score outputs and the Overall card (owner design, 17 Oct 2026; built in P1c and P1d, kept by P2c)
- Subscale card: toggles Show Sum / Mean / Custom formula (any combination, at least one). Per subscale, grid and export order: each shown score column followed by its own interpretation column (only when bands exist for that output), in the order Sum, Mean, Custom. Sum and Mean are always computable internally even when hidden. Old single method migrates to the matching toggle; old bands migrate to the first shown output.
- Overall switch next to Apply first to all. On: Overall card above the subscale cards: **Based on** subscale Sums | Means | Custom scores (Custom only if every subscale has a custom formula) and **Combine by** Sum | Mean | Custom formula (formula refers to the chosen subscale values). Off: no card, no column, settings kept. Apply first to all never touches the Overall card. Strict: blank if any subscale value is blank (proration is F8). The Overall column has its own interpretation column once Overall bands are set.
- Defaults reproduce today: switch on; Sums + Sum, or Means + Mean when every subscale is Mean-only.
- Templates (section 8) also keep the Show toggles, the Overall settings and the bands per output.
- Tests: Fixture A P01 Overall 37 (Sums, Sum), 18.5 (Sums, Mean); Sum of means; Mean of means; custom example; Custom disabled without subscale formulas; off removes the column; migration; cache invalidation on any of these settings.

## 12. Widening and reverse items (owner finding, 18 Oct 2026)
Reverse scoring is (range minimum + range maximum) minus the answer, so widening a range changes every reversed value and every score of the subscale (Fixture A: widening Subscale 1 to 1-7 moves P01's Overall from 37 to 39). The Widen range action therefore shows a warning when the subscale has reverse items, and says that far-out stray values (more than one step beyond) usually are entry errors for which Treat as missing is right. Cell links name the respondent ID (never an internal ID) and highlight only the cell.

## 13. Out-of-range decision and waiting status (owner, 18 Oct 2026; built)
*(The decision line and the two buttons are superseded by section 15: the choice moves into the answers table. The waiting status stays.)*
- Both actions are real buttons; "Treat as missing" is highlighted as the recommended default until the user chooses. Choosing either removes the amber message and the card chip and leaves one grey line: "Decision: Treat as missing for Q4: P26 (Change)" or "Decision: Widen range to 1-7 (Change)". The decision is saved with the scale, keyed to the exact set of out-of-range cells (a changed set reopens the question), logged once per decision. Scoring uses Treat as missing until the user decides otherwise.
- The reverse-scoring warning ("Q3 becomes 8 minus the answer instead of 6 minus the answer ...") is shown whenever the subscale has a reverse item and any out-of-range value exists.
- Waiting status: "Scoring is waiting: confirm the scale range for Subscale 1 (it has reverse items)." (several: "... ranges for Subscale 1 and 1 more (they have reverse items)."), amber, with a "Go to Subscale 1" button that opens the card.

## 14. No subscales (owner, 18 Oct 2026; P2c-U)
A dataset with no real subscales uses one automatic subscale (id auto-overall, name "Overall scale", all item columns, no reverse items). In the Subscales step it appears as one card "Overall scale (all items)" listing every item with the Rev toggles (no add, remove, rename or delete) and one plain line explaining that all items are scored together. It appears as a normal card in Response scales and Bands and uses the normal code path for scoring, export, Summary and templates. It starts not confirmed; scoring waits for confirmation only when it has reverse items. Adding a real subscale removes it after a warning. Planned redesign of this step: see FIX_LIST F6.

## 15. Answers table: final card design (owner, 20 Oct 2026; supersedes section 6 items 3-4, the preset dropdown of section 5 and the decision line of section 13)

An open subscale card shows, top to bottom, only what is relevant. Every answer appears in exactly one place.
1. **Scale line:** "Scale [min] to [max]", with "detected" or "from 5-point agreement". Editable. Only subscales that have reverse items show a status chip ("Not confirmed") with a "Confirm range" button and an (i) tip; other subscales show no status. Any change to the scale setup (min or max, widen, any "Counts as" value, flip order, start at 0, a reverse tick on an item) resets a reverse-item subscale to Not confirmed; scoring then waits as before (existing status text and Go to button). Leaving an answer on its default does not reset it.
2. **Word-scale line (word mode only):** "Detected: 5-point agreement" with a small link "Wrong scale? Change" (opens the preset list; there is no preset dropdown by default), plus the buttons Flip order and Start at 0.
3. **Answers table** (columns Answer, Found, Counts as), one row per distinct answer that is not a plain in-range number.
4. **Show:** Sum, Mean, Custom formula.

**Modes**
- Numeric (default): fewer than half of the non-special, non-blank answers across the subscale's items are text. Scale line and optional table only. No Flip order, no Start at 0.
- Word mode: at least half of those answers are text. The word-scale line appears. Flip order and Start at 0 appear (and look unavailable until every scale word has a number).
- Continuous (decimals in the column): the scale line says "continuous"; no table, no Flip order, no Start at 0.
- More than 15 distinct text answers: the table is replaced by "This looks like a demographic or an ID, not a scale item".

**Rows**
- Scale words (word mode), in scale order. "Counts as" is pre-filled from the detected preset or empty with "Needs a number" (amber). Preset words that do not occur are listed with Found 0 (grey) so the whole scale is visible. The preset is the smallest preset that covers all scale words found; if words are missing from a preset, the unused ones are shown at 0.
- Special answers (built-in codes: N/A, NA, n/a, Prefer not to say, -99, -999 and similar): grey; empty Counts as = Not scored; typing a number scores that answer. A special answer scored as a number is never reversed (there is no per-row reverse tick).
- Out-of-range numbers: row "7 (outside 1 to 5)" with the respondent link ("Q4: P26", highlights the cell). Counts as is a choice: Not scored (default), Widen scale to 1-7, or a typed number. When the subscale has reverse items a one-line note under the row says what widening does to reverse scoring ("Widening would calculate Q3 as 8 minus the answer instead of 6 minus the answer, and change scores for everyone."). Choosing Widen sets the range at once and the row shows the choice; choosing Not scored again restores the original range.
- Unknown text in a numeric column (for example "abc"): amber row, Counts as empty (Not scored) with "Needs a number".

**Review state:** out-of-range numbers and unknown answers are amber until the user makes a choice (choosing the default counts). The collapsed card summary shows "N answers to review" for amber rows only; built-in codes never count. The choice is saved and the cleaning log records widen and typed-number decisions (counts and values).

**Range rules:** typed numbers for special answers or out-of-range numbers never change the scale range (a 0 for "Prefer not to say" on a 1-5 scale stays a valid scored 0 and the range stays 1-5). Only the numbers of scale words in word mode, and the preset, set a word scale's range. Flip order and Start at 0 act on the scale-word numbers; Rev (reverse items) still reverses the selected items after mapping. Presets are detected automatically (see section 5 for the variants and the preset list).

**Tests (written first):** the five scenarios (clean numbers; numbers with special answers; one out-of-range number; words matching a preset; words with no preset), the mode rule (half of the answers), Flip order and Start at 0 only in word mode, unused preset words shown at 0, more than 15 words, continuous columns, typing 0 for "Prefer not to say" keeps the range, widen shows its choice at once and "Not scored" restores the range, amber rows and the review count, confirmation reset, template round trip, reload. Fixture A: P01 Overall 37, status line P25, P26, P29, P30. Word fixture (docs/fixtures/fixture_words.csv, no subscales so the automatic Overall scale is used): preset 5-point agreement matched; W01 Sum 13 Mean 2.6; W04 Sum 16 Mean 3.2; N/A and Prefer not to say not scored; "Maybe" amber until numbered (Maybe = 3 gives W12 Sum 11); Flip order W04 14; Start at 0 W04 11.

**Approved mockup (owner, 20 Oct 2026):** `docs/mockups/response_scale_card_five_scenarios.html` shows the open card in the five scenarios and is the visual reference for layout, wording and colours. Exact texts it uses: collapsed summary "5 items · scale 1 to 5" or "5 items · 1 answer to review" (with the "Not confirmed" chip only for a subscale with reverse items); scale line "Scale [min] to [max]" followed by "detected", "from 5-point agreement" or, for words with no preset, "set from the numbers you type below"; under the special rows "Built-in codes are not scored. Type a number to score one."; Flip order and Start at 0 with the hint "available once every word has a number" when not all words are numbered; out-of-range row "7 (outside 1 to 5)" with the link "Q4: P26" and choices "Not scored" / "Widen scale to 1-7". The card has a "Hide details" / "Show details" control. The Show row (Sum, Mean, Custom formula) is the last item of every card.

## 16. What the state fix changed (owner hand tests 20-21 Oct 2026; built on branch `p2c2-codex`, commits 3d42520, 7b0d349, 5cc2b28, 5fa8d4c)

### 16.1 Saved state per subscale (pure module `src/lib/responseScaleState.ts`)
- `minValue` / `maxValue` are the **effective** range; scoring, Data Quality, reliability, export and the score cache keep reading only these.
- `rangeSource` = detected | manual | preset; `baseMin` / `baseMax` = the range before any widening; `outOfRangeDecisions` = one entry per distinct out-of-range value (keyed by the value as text): `{ action: missing | widen, reviewed: boolean }`. A typed number for an answer lives in `labelMap` (as before). A value has at most one of: widen, typed number, not scored.
- Effective range = base range widened by every value whose decision is widen. Only this function (and the code that seeds detection) writes min/max/base/source.
- Detection (the 99% rule plus the weak-end check) may write the base range only while `rangeSource` is detected and only when the dataset or the subscale's item list changes. It never runs because `confirmed` changed or a decision changed (the original bug: an effect re-detected whenever a subscale became not confirmed and overwrote the user's range, including on every reload).
- Typing a range sets `manual`, makes the typed range the base and returns every widen decision of that subscale to Not scored. The scale line then says "set by you". Invalid typing (empty, letters, decimals, min not below max) reverts and changes nothing.
- Confirmation (subscales with reverse items only) resets if and only if the effective range, a decision, a Counts as number, flip order, start at 0, a preset or a reverse tick really changes. Confirm range changes nothing else. Other subscales are never touched by an action on one subscale.
- Migration: the old single `outOfRangeDecision` becomes per-value decisions (widen: base = original range); a scale without a source gets manual if it was confirmed, else detected.

### 16.2 Answers table wording (replaces the duplicate "Not scored" options)
Out-of-range and unknown-answer rows: a dropdown with "Choose…" (only while the row is unreviewed; amber), "Not scored", and for out-of-range numbers "Widen scale to {min of base and value}-{max of base and value}", plus an "or number" box. Choosing anything marks the row reviewed. The review count and the amber state follow the `reviewed` flag. **Added 21 Oct 2026 (late, owner decision): a row that still says "Choose…" blocks scoring** (see 17.2 Blocking); it applies to numeric out-of-range answers and unknown text exactly as to words. Cleaning log: one entry per Widen choice; typed numbers and Not scored are not logged (knowingly differs from section 15's typed-number logging; decide later).

### 16.3 Range detection for small samples (added 21 Oct 2026)
The 99% rule needs 99% of the answers inside the range, so with 35 answers a single odd answer (an 8 on a 1-7 item) is already 3%: the guess grew to 1-9 and the 8 was scored silently. After the usual result R, the weak-end check runs: N = numeric answers, tWeak = max(1, floor(1% of N)), tOut = max(2, floor(1% of N)). If R.min or R.max is used by at most tWeak answers, look for a smaller conventional range S whose two ends are each used by MORE than tWeak answers and that leaves at most tOut answers outside; take the one with the fewest outside answers (then the smallest span). If found, S replaces R and the outside answers appear as amber rows. If not, R is unchanged. Examples: 35 answers 1-7 plus one 8 gives 1-7 (8 flagged); 1-5 data plus one 7, or one 0 typed as "no answer", gives 1-5; two 8s on 1-7 data gives 1-7; a 1-5 scale where only two people chose 5 stays 1-5; tiny datasets and datasets of 100 or more answers behave as before. Out-of-range detection itself (compare each answer with the range) is exact at any sample size once the range is known; only the first guess is probabilistic, and the user can always type the true range.

### 16.4 Known differences from section 15 (decisions pending)
- The reverse-widening explanation note under an out-of-range row (section 12/15) is not shown on the new card.
- Typed-number decisions are not written to the cleaning log.
- The collapsed "Not confirmed" chip was removed and a quiet "Confirmed" text added (cosmetic backlog items 5 and 6, built; visual check pending).
- Cosmetic polish of the card is deferred to the end-of-project list in `FIX_LIST.md`.

## 17. Word scales v3 (owner hand test 21 Oct 2026; design for prompt P2c-4)

### 17.1 What was found (all reproduced on the real screen with `docs/fixtures/fixture_words.csv`, Subscale 1 = Q1+Q2, Subscale 2 = Q3+Q4+Q5, nothing reversed)
- **W1 Display is not saved.** The card shows "Counts as 1..5" derived from the detected preset, but the saved label map stays empty until the user clicks something. Run Scoring then gives every row a blank score and the status line blames "an item is missing, N/A or outside the scale".
- **W2 Legacy first-seen numbering is still alive.** `buildAutomaticSubscale` (`src/scientific/scoring.ts`, no-subscale datasets) and `autoDetectScale` (Auto button, `detectScale` in `src/scientific/detection.ts`) number every distinct text value 1..k in order of appearance, case variants separately, N/A, Prefer not to say and Maybe included. With no subscales, scoring "completes" with no warning and wrong numbers (W02 17 instead of 16; W03 15 and W05 21 instead of blank).
- **W3 A word without a number cannot be numbered.** `updateLabel` makes two updates from stale state (label map, then range); the second overwrites the first.
- **W4 "Wrong scale? Change" re-applies the same preset;** there is no picker.
- **W5 No word variants.** Matching is exact normalized text; "Neither agree nor disagree" does not match "Neutral".
- **W6 Weak messaging.** The status line gives the wrong reason; amber word rows and special rows have no cell links.
- **W7 Autosave loses edits.** Saves run 1 second after the last change and unmounting cancels the timer: edit a range, leave the screen within a second, reopen: the edit is gone.

### 17.2 Design (owner's idea of 21 Oct 2026, refined by the architect; this replaces the earlier draft of 17.2)

**The idea.** The app reads the labels from the data and lists them on the left with an empty number box on the right. When the labels match a known scale (a preset, including its usual variants) the numbers are filled in. One odd label (like "Maybe") just stays blank and is flagged with a message and actions. Every number can be edited, and new labels can be added with a small "+" under the list.

**A. What the user sees (word answers table of a subscale card)**
```
Subscale 2 - 3 items                                                  [Hide details]
Scale: 5-point Agreement (detected)   Wrong scale? Change     (Flip order and Start at 0 appear once every label has a decision)  (i)
Answer                        Found    Counts as
Strongly disagree               10     [ 1 ] v
Disagree                         6     [ 2 ] v
Neither agree nor disagree       5     [ 3 ] v        (spelling found in the data; "Neutral" is hidden because nobody used it)
Agree                           10     [ 4 ] v
Strongly agree                   7     [ 5 ] v
Maybe                            1     [   ] v        <- amber
  "Maybe" appears once (Q4: W12). It is not scored until you choose:  [Counts as v] [Number] [Not scored]
N/A                              2     Not scored     <- grey, built-in
[+ Add a label]
```
Three situations, decided from the data:
1. **Preset match.** The labels found match a known scale (existing rule: the smallest preset that covers the matching labels; at least 3 distinct labels match and they are more than half of the labels found; ties go to the preset listed first). Numbers are filled in. One row per scale point shows the spelling found in the data (two spellings found = two rows with the same number); if nobody used a scale point its canonical label is listed with "0 found" so the range is the full scale (needed for reverse scoring). Under the table: a scale line "5-point Agreement (detected)", the small link "Wrong scale? Change" (opens a list of all presets; hand-numbered labels are kept), and the toggles Flip order and Start at 0. "Wrong scale? Change" is visible whenever a preset was detected (a wrong guess is the likely reason for several waiting labels). **Flip order and Start at 0 appear only when a preset was recognised AND every label has a decision** (a number, Counts as, or Not scored); while a decision is pending they are not shown at all (not greyed out). They exist ONLY in the preset situations and recompute only preset-derived numbers (canonical labels and their observed variants); numbers the user typed keep their value.
2. **Partial preset match.** As 1, but labels that fit no scale point appear with a blank number, amber, with the message and actions below.
3. **No preset.** Labels are listed with blank numbers (amber). No "Wrong scale? Change", no Flip order, no Start at 0. The user types the numbers (any finite number, decimals and negatives allowed). The "+" and the editable range boxes cover scale points nobody chose.

**Rows and actions.** Every row has the label, a number box and a small menu (v): **Counts as...** (choose another label of the table: this label then takes that label's number, now and after Flip order or Start at 0; this is how typos and unusual spellings are fixed), **Not scored**, and for manual rows **Remove**. A row with a blank number is amber and shows one message line with the same actions inline: "'Maybe' appears once (Q4: W12). It is not scored until you give it a number, say what it counts as, or mark it Not scored." The cell links (first 3 as "Q4: W12", then "and N more") highlight the cell in the grid. If the label is a near-spelling of another label (small edit distance, for example "Agre" and "Agree") the message adds "Looks like 'Agree'?" with a one-click "Counts as Agree"; a suggestion is never applied silently. The words "appears once" are used when the count is 1, otherwise "appears N times".
**The raw data is never changed.** "Counts as" and numbers only change how the app reads a label; an (i) tip says so. Detected labels mirror the file, so their text is not editable (editing it could not change the data); the way to change how a detected label is read is its number or Counts as. Manual labels (added with "+") are fully editable (text and number) and can be removed. This is the one deliberate deviation from "all labels editable".
**"+ Add a label"** adds a manual label with a text box and a number box. Use cases: scale points nobody chose (so the range and reverse scoring use the full scale), spellings that will appear in later data, and preparing a template. A label equal (after normalization) to one already listed is refused with a message. The range boxes of the scale line stay editable in every situation (typing a range sets the source to manual, as for numeric scales).
**Special answers** (N/A, Prefer not to say, Don't know, ...) are listed grey at the bottom as "Not scored"; typing a number scores them (never reversed), as today.
**Order** of rows: preset points low to high, then other labels by count (highest first), then special answers. The order stays fixed while the user edits (rows never jump) and is recomputed when the card is opened again.
**Reset to detected (whole card, numeric and word).** A small "Reset to detected" link in the card appears only when something differs from what the app first showed (state compared with a fresh seed of the data). After a confirmation it returns the card to exactly that: range and range source, widen / not-scored / typed-number decisions, word numbers, Counts as, added labels, preset choice, Flip order, Start at 0, and the confirmed state; "Choose…" rows are unreviewed again (so scoring waits again). It does not touch what the app never detected: reverse ticks, Show toggles, bands, formulas.
**Numbered labels.** Exports often contain "5 - Strongly agree", "(2) Disagree", "3=Neutral". If every label carries a distinct leading number (formats: n - text, n = text, n) text, (n) text, n. text, n: text) the numbers are read from the data (labelSource detected) and the text part is matched against presets for the scale line.
**Different scales in one subscale.** If the labels clearly belong to two presets (each matching at least 3 labels) the card shows the message "These items look like two different scales. Consider separate subscales." (message only, nothing blocked).
**Blocking (owner decision, 21 Oct 2026, applies to words AND numbers).** Scoring does not run while any row of a scored subscale still says "Choose…" (an unnumbered word, an unknown text answer, or an out-of-range number nobody decided about). The status bar turns amber: "Scoring is waiting: Subscale 2 has 1 answer to decide ('Maybe', Q4: W12). Go to Subscale 2" (same mechanism as the unconfirmed reverse range; reverse subscales also still wait for Confirm range). When two or more answers are waiting a button "Treat all N as not scored" sets them all to Not scored in one step. Only included respondents count: a stray answer that exists only in excluded respondents does not block (the card shows that row grey, "only in excluded respondents"); items in no subscale never block. **Why "Not scored" must exist:** a decision needs an honest way out when no number is right ("Other", "Skip", a stray "Maybe"): any number would be invented data, and treating the answer as missing is what N/A already does. Data Quality does not wait: it shows the same answers as "No number" with a Go to link.

**B. Saved data.** Label entries: `{ label (normalized key and the observed spelling), value (number or null), kind (scale | special), notScored?, aliasOf?, manual? }`. A blank number is not stored (the label is unmapped and flagged); "Not scored" is stored as value null with notScored; "Counts as X" is stored as aliasOf X and resolves to X's current number (so Flip order and Start at 0 carry it along); reverse scoring applies to aliased labels. Old entries stay readable. A per-subscale `labelSource` (detected | preset | manual) records who set the labels.

**C. Seeding.** One pure function builds the seeded labels from the text answers of the subscale's items: preset numbers (canonical labels plus every observed variant), or numbers read from numbered labels, or nothing (situation 3). It runs only for a subscale whose labelSource is detected (or missing) when the dataset or the subscale's item columns change, in the automatic-subscale builder, when Auto is pressed and on Reset; never because of confirmation, decisions or range edits; never over manual. All legacy first-seen numbering is deleted. Migration: an old categorical scale with no labelSource that is not confirmed is re-seeded; a confirmed one keeps its labels as manual.

**D. Matching.** Normalization: Unicode NFKC, trim, collapse spaces, case-fold, hyphens and underscores read as spaces, trailing punctuation dropped. Variants (aliases) per preset point: Neutral = neither agree nor disagree, neither agree or disagree, neither agree/disagree, undecided, neither; Strongly Disagree/Agree = completely and totally; Slightly Disagree/Agree = somewhat; in Frequency presets Rarely = seldom, Often = frequently, Always = all the time, Never = not at all. Built-in special words (not scored): n/a, na, not applicable, prefer not to say, prefer not to answer, don't know, dont know, dk, refused, no answer, no response, skipped, missing, unknown, plus the numeric codes -99 and -999.

**E. Status and links.** The waiting message under Blocking replaces the earlier idea of an after-scoring sentence. After scoring the existing status sentence stays as it is (first sentence and respondent IDs unchanged); every flagged answer has been decided by then, so respondents with a blank score are blank because of an item that is missing, N/A, Not scored or outside the scale.

**F. Autosave never loses an edit:** a pending save is flushed (written at once) on unmount, tab or step switch, pagehide and visibilitychange to hidden.

**G.** Items in no subscale have no card, no seeding and cause no "needs a number" noise in any screen. Data Quality, reliability, export and report read the same saved mapping.

**H. Later ideas (not in P2c-4):** drag rows into order and a "Number 1 to n" helper for no-preset scales; the preset library expansion (P6).

### 17.3 Expected numbers (computed independently from the CSV)
Mapping: Strongly disagree 1, Disagree 2, Neutral and Neither agree nor disagree 3, Agree 4, Strongly agree 5; N/A and Prefer not to say not scored; "Maybe" has no number. Case variants ("strongly agree") and trailing spaces ("Agree ") are the same answer.
- **Setup A** (S1 = Q1+Q2, S2 = Q3+Q4+Q5, Overall on). Scoring first waits ("Maybe" says Choose…); set "Maybe" to Not scored, run scoring: S1 / S2 / Overall: W01 6 / 7 / 13; W02 8 / 8 / 16; W04 9 / 7 / 16; W06 3 / 10 / 13; W07 6 / 9 / 15; W10 6 / 12 / 18; W13 7 / 12 / 19; W18 2 / 12 / 14. Blank: W03 (S1, Overall), W05 (S2, Overall), W09 (S1, Overall), W12 (S2, Overall). Status line names W03, W05, W09, W12. W01 means 3 and 2.3333. Before the decision: one amber row ("Maybe", Subscale 2) and the waiting message; Subscale 1 has none (N/A is grey).
- Setup A with Maybe = 3: W12 4 / 7 / 11; status line W03, W05, W09. Flip order: W01 6 / 11 / 17. Start at 0: W01 4 / 4 / 8.
- **Setup B** (no subscales, one automatic Overall scale, Sum; "Maybe" set to Not scored first): W01 13, W02 16, W04 16, W03 / W05 / W09 / W12 blank; Maybe = 3 gives W12 11; Flip order W04 14, W01 17; Start at 0 W04 11.
- **Setup C** (A with Q2 reversed in S1 and Q4 reversed in S2, range 1-5 confirmed): W01 4 / 11 / 15; W02 4 / 4 / 8; W04 7 / 3 / 10; W06 7 / 12 / 19; W03 S1 blank; W12 S2 blank.
- Per item (Data Quality; "Maybe" undecided counts as No number, after Not scored it counts as Not scored): Q1 19 valid + 1 not scored (N/A); Q2 19 + 1 (N/A); Q3 19 + 1 (Prefer not to say); Q4 19 valid + 1 without a number (Maybe); Q5 20 valid. Item means 2.9474, 2.9474, 2.6316, 3.4211, 3.05.
