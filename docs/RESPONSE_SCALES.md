# Response Scales v2: one panel for numeric, word and special responses

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
- Choose the candidate with the **smallest span that covers at least 99%** of numeric responses across the scale's items. If none, fall back to the observed min–max and say "unusual range, please confirm".
- **Detection is only a suggestion** (`confirmed: false`). The card shows "Detected: 1–4 scale (not confirmed)" with a **Confirm range** button; editing min/max also confirms. Reason: a real 1–5 scale where nobody chose 5 would be detected as 1–4, which breaks reverse scoring and drops real answers.
- **A subscale that has reverse items is not scored until its range is confirmed.** The status area says "Confirm the range for <subscale> (it has reverse items)". Subscales without reverse items are scored with the suggested range and show "range not confirmed".
- **One step beyond:** if the stray values are exactly one step past a detected end and the widened range is itself a candidate (e.g. a few 5s on a detected 1–4, widened to 1–5), the message says "N values are 5, one above the detected range: this may be a 1–5 scale" and the **default action is Widen range**. Values farther away (e.g. P26's 7 on a 1–5 scale) default to **Treat as missing**.
- The range is otherwise **not** widened to include stray values (that would make out-of-range undetectable): "1–5 detected. 1 value outside (Q4, P26)" with a link to the cell, and the two actions **Treat as missing** or **Widen range**.
- If the user enters a range by hand, outside values are reported the same way.
- Mixed ranges within a subscale: list the items that differ and ask; never silently use one.

## 5. Word scales
- If most distinct non-special words match a preset (after normalization and common variants) the preset is applied automatically: labels → 1…k, range updates, **Flip order** and **Start at 0** buttons. Any other response in the data becomes an extra row.
- No preset matches: all distinct words appear on the left with empty numbers on the right; the range follows the numbers the user enters.
- More than 15 distinct non-numeric responses in a column: suggest "this looks like a demographic or ID, not a scale item".
- Presets: agreement (5, 7), frequency, satisfaction, importance, likelihood, quality, plus existing app presets.

## 6. Screen layout (the whole Response Scales step)
- At the top: the **Apply first to all** button (copies range, labels, flip and start options from the first subscale to the others, then re-checks each one).
- Below it: **one card per subscale**. Nothing else on the page.
- Inside each card, top to bottom:
  1. Header line: "Detected: 1–5 scale" with editable min and max and a **Confirm range** button (status: not confirmed / confirmed).
  2. Out-of-range message (only if needed) with links to the cells and the two actions: **Treat as missing** (default) or **Widen range**.
  3. **Other responses found** table (only if there are any): response, count, number box (empty = not scored). Built-in missing codes are grey, unknown responses amber. A small caption lists the built-in codes.
  4. **Word labels** section (shown automatically when words are found, otherwise behind a "Responses are words" link): preset dropdown, Flip order, Start at 0, the mapping rows, and a "values without a label" message.
  5. Scoring method: sum, mean or custom formula (unchanged).

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
6. Mixed ranges within a subscale: list the differing items, never silently pick one.
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
