# Test Fixtures (v2)

Known-answer tests for the scientific modules. **The numbers below are produced by `docs/fixtures/generate_fixtures.py` (NumPy/SciPy) from `docs/fixtures/fixture_A.csv`.** They follow `scientific-spec.md` exactly.

> **Status: cross-checked against jamovi (see section 9).** The estimators, the reverse-coded α values, item–rest correlations and the row-mean statistics all match jamovi. Rules that jamovi does not compute (proration, response-bias flags, Tukey fences, Overall composites) and the Lilliefors KS values (reference: SciPy-independent statsmodels `lilliefors`, approximate p; **to be cross-checked against R `nortest::lillie.test`**) are defined by the spec and the hand-checkable cases in section 2. If jamovi disagrees, stop and resolve it. Either the spec or the generator is wrong. Never edit a test to make it pass.

Machine-readable expected values for **every** row: `docs/fixtures/fixture_A_expected.json`. jamovi-ready version of the data: `docs/fixtures/fixture_A_jamovi.csv`.

## 1. Fixture A: setup

- 30 respondents `P01`–`P30`, demographic column `Age`, ten 1–5 Likert items `Q1`–`Q10` (L=1, H=5).
- Reverse-keyed: **Q3, Q6, Q9**.
- Subscales: **Sub1 = Q1–Q5** (k=5), **Sub2 = Q6–Q10** (k=5), **Overall = Q1–Q10** (k=10).
- Allowed non-response: `N/A`, `Prefer not to say`. Proration threshold when ON: **20**.
- `P01`–`P24` are ordinary generated respondents. `P25`–`P30` are hand-built edge cases (below).

## 2. Hand-checkable unit cases (no fixture file needed)

| Case | Input | Expected |
|------|-------|----------|
| Reverse | L=1, H=5, x=2 | x' = 4 |
| Reverse, categorical map | labels 0..3, x=1 | x' = 2 |
| Reverse, no L/H configured | any | scoring blocked with message (no `−x`) |
| Strict scoring | 5 items, 1 missing, proration OFF | scale score missing |
| Proration boundary (inclusive) | 5 items, 1 missing, t=20 | allowed (1×100 ≤ 20×5) |
| Proration over | 5 items, 2 missing, t=20 | missing |
| Proration spec example | 10 items, 2 missing, t=20 | allowed |
| Proration spec example | 10 items, 3 missing, t=20 | missing |
| Half-rule | 10 items, 5 missing, t=50 | allowed; 6 missing → missing |
| All missing | k items, o=0 | missing even if t=50 |
| Prorated Sum | observed [4,4,4,4], k=5 | mean 4, **sum 20** (not 16) |
| Floating-point guard | 15 items, 3 missing, t=20 | allowed (integer arithmetic) |
| Overall, source B mean | Positive 4 items mean 4; Negative 6 items mean 2 | Overall mean 3.0 |
| Overall, source A mean | same data | Overall mean 2.8 (16 + 12 over 10 items) |
| Overall, source B mean with Negative flipped | L=1, H=5, Negative mean 2 → 6 − 2 = 4 | Overall mean 4.0 |
| Overall, source B sum | Positive sum 20, Negative sum 10 (5 items each, L=1,H=5) | 30; flipped Negative: (5+25)−10 = 20 → 40 |
| Overall with a missing subscale score | one subscale missing | Overall missing |
| Aiken V | ratings [4,5,4,5,5], lo=1, hi=5 | V = 18/20 = 0.9 |
| Lawshe CVR | N=10, nₑ=8 | CVR = 0.6 |
| Longstring, missing breaks run | `3,3,,3,3` | longest run = 2 |
| Midpoint undefined | 4-option scale | midpoint check skipped |

Lawshe and Aiken **critical values** are not listed here on purpose: fill them from the published tables in Phase 2 (see scientific-spec section 4).

### 2b. Invariant (metamorphic) tests, in addition to known answers
- Reversing an item twice restores the original values.
- Shuffling row order does not change any aggregate statistic or any flag for a given row.
- Duplicating every observation leaves means, correlations and α unchanged (variances change only by the n/(n−1) factor).
- A categorical scale mapped to numbers gives the same scores, reliability and DQ results as the equivalent numeric dataset.
- Adding a constant to all responses of a scale changes means by that constant and leaves SD, correlations and α unchanged.
- The same normalized matrix feeds scoring and reliability (no module differs on a given cell).
- A saved result is rejected after any change to data or configuration (hash mismatch).

## 3. Fixture A: edge-case rows (expected)

| Row | What it tests | Key expected values |
|-----|---------------|---------------------|
| P25 | Allowed non-response ("Prefer not to say") counts as missing for scoring but not as a DQ failure | blank 0, allowed 1, out-of-range 0; longstring 2; extreme 0; midpoint 0; SD 1<br>No proration → Sub1: —; Sub2: sum 20, mean 4; Overall: —<br>Proration 20 → Sub1: sum 20, mean 4; Sub2: sum 20, mean 4; Overall: sum 40, mean 4<br>Flags: none |
| P26 | Out-of-range value (7 in Q4): treated as missing | blank 0, allowed 0, out-of-range 1; longstring 3; extreme 0; midpoint 0.556; SD 0.667<br>No proration → Sub1: —; Sub2: sum 17, mean 3.4; Overall: —<br>Proration 20 → Sub1: sum 17.5, mean 3.5; Sub2: sum 17, mean 3.4; Overall: sum 34.444, mean 3.444<br>Flags: none |
| P27 | Straight-liner: all 3s | blank 0, allowed 0, out-of-range 0; longstring 10; extreme 0; midpoint 1; SD 0<br>No proration → Sub1: sum 15, mean 3; Sub2: sum 15, mean 3; Overall: sum 30, mean 3<br>Proration 20 → Sub1: sum 15, mean 3; Sub2: sum 15, mean 3; Overall: sum 30, mean 3<br>Flags: straightline_ge_6, midpoint_ge_70pct, low_variance_sd_lt_5pct_range |
| P28 | Extreme responder: only 1s and 5s | blank 0, allowed 0, out-of-range 0; longstring 2; extreme 1; midpoint 0; SD 2.066<br>No proration → Sub1: sum 13, mean 2.6; Sub2: sum 17, mean 3.4; Overall: sum 30, mean 3<br>Proration 20 → Sub1: sum 13, mean 2.6; Sub2: sum 17, mean 3.4; Overall: sum 30, mean 3<br>Flags: extreme_ge_80pct |
| P29 | Two blanks = exactly 20% overall: prorate-eligible AND not DQ-flagged (boundary) | blank 2, allowed 0, out-of-range 0; longstring 2; extreme 0; midpoint 0; SD 1.035<br>No proration → Sub1: —; Sub2: —; Overall: —<br>Proration 20 → Sub1: sum 20, mean 4; Sub2: sum 20, mean 4; Overall: sum 40, mean 4<br>Flags: none |
| P30 | Q1, Q2 blank + Q3 "N/A": Sub1 has 3 of 5 missing; unexpected-missing rate is exactly 20% | blank 2, allowed 1, out-of-range 0; longstring 1; extreme 0; midpoint 0.571; SD 0.535<br>No proration → Sub1: —; Sub2: sum 15, mean 3; Overall: —<br>Proration 20 → Sub1: —; Sub2: sum 15, mean 3; Overall: —<br>Flags: none |

Rows `P01`–`P24` are generated; their expected values are in the JSON. Four of them are flagged by the rules and are therefore also good regression targets: `P05` (extreme_ge_80pct), `P17` (midpoint_ge_70pct), `P21` (extreme_ge_80pct, outlier_iqr), `P23` (straightline_ge_6).

## 4. Fixture A: group-level data quality (all 30 rows included; row means after reverse coding)

| Statistic | Expected |
|-----------|----------|
| n row means | 30 |
| Mean of row means | 3.236243 |
| SD (sample) | 0.83694 |
| Q1 / Q3 (type 7) | 2.9 / 3.925 |
| IQR | 1.025 |
| Tukey fences | 1.3625 to 5.4625 |
| Skewness G1 | -0.290569 |
| Excess kurtosis G2 | -0.203833 |
| Shapiro–Wilk W | 0.980381 |
| Shapiro–Wilk p | 0.835585 |
| Lilliefors KS D | 0.110600 |
| Lilliefors KS p (Dallal–Wilkinson approx.) | 0.452928 |

## 5. Fixture A: reliability (listwise complete cases, reverse-coded, no proration)

| Scale | n complete | k | Cronbach's α |
|-------|-----------|---|--------------|
| Sub1 | 26 | 5 | 0.783964 |
| Sub2 | 29 | 5 | 0.816949 |
| Overall | 26 | 10 | 0.899069 |

Per-item α-if-deleted and corrected item–total r are in the JSON under `reliability.<scale>.items`.

## 6. Tolerances

| Quantity | Tolerance |
|----------|-----------|
| Scores, means, rates, quantiles, G1, G2, α, item–total r | absolute 1e-9 |
| Shapiro–Wilk W | absolute 1e-4 |
| Shapiro–Wilk p | absolute 1e-3 |
| Lilliefors D | absolute 1e-9 |
| Lilliefors p | absolute 1e-3 |
| Flags and counts | exact |

## 7. How to use these in the build

1. Phase 0: add Vitest and a test that loads `fixture_A.csv` and `fixture_A_expected.json`.
2. Each scientific module is "done" only when its fixture rows pass.
3. When you add a feature that needs a new rule, add a fixture for it **first**, hand-checked and cross-checked in jamovi/R.
4. Phase 2 (content validity) fixtures: to be created from the published Lawshe/Aiken tables.

## 9. jamovi cross-check log

### 9.1 Done: raw-data run (reported by the owner, matched by the generator's methods)
Run on `fixture_A.csv` as-is (nothing reverse-coded, nothing excluded). Observations: jamovi read Q3 and Q5 as text (they contain "N/A" / "Prefer not to say"), so they were not analysed; Q4 still contains the out-of-range 7 (max 7).
| Check | Result |
|-------|--------|
| N / missing, mean, SD, IQR (type 7), min, max for Q1, Q2, Q4, Q6–Q10, Age | match |
| Skewness (G1) and SE; excess kurtosis (G2) and SE | match |
| Shapiro–Wilk W and p | match (3 d.p.) |
| Cronbach's α on Q1, Q2, Q4, Q6, Q7, Q8, Q9, Q10 (28 listwise-complete rows) | 0.352 = match |
| α if item dropped for all 8 items (e.g. Q6 0.6782, Q9 0.5991, Q4 0.0675) | match to 4 d.p. |
| jamovi note that Q6 and Q9 correlate negatively with the total | expected (they are reverse-keyed and were not reversed) |

Implication: the app's import must treat "N/A"-style text as allowed non-response, not as a reason to drop a whole column, and the estimator conventions in `scientific-spec.md` §0 are confirmed.

### 9.2 Done: reverse-coded run with `fixture_A_jamovi.csv` (reported by the owner)
Everything in sections 4 and 5 matches jamovi: α for Sub1 (0.784), Sub2 (0.817) and Overall (0.899); item–rest correlation and α-if-dropped for all 20 item rows (to 3 d.p.); and the RowMean statistics (mean 3.24, SD 0.837, IQR 1.02, quartiles 2.90 / 3.92, skewness −0.291, excess kurtosis −0.204, Shapiro–Wilk W 0.980, p .836). **Fixture A is confirmed against jamovi.**
Not covered by jamovi (hand-checked / generator only): proration, DQ flag rules (longstring, extreme, midpoint, low variance), Tukey fences, row-level scores. These are defined by the spec and verified by the hand-checkable cases in §2.

### 9.2a (original instructions, kept for re-running)
This file has text and out-of-range values blanked, reverse-coded copies `Q3r`, `Q6r`, `Q9r`, and a precomputed `RowMean`. In jamovi:
1. **Reliability → Scale Analysis**, enable *Item-rest correlation* ("corrected item–total r") and *α if item dropped*:
   - Sub1 = `Q1, Q2, Q3r, Q4, Q5` → expected α and n in section 5
   - Sub2 = `Q6r, Q7, Q8, Q9r, Q10` → same
   - Overall = `Q1, Q2, Q3r, Q4, Q5, Q6r, Q7, Q8, Q9r, Q10` → same
2. **Exploration → Descriptives** on `RowMean` with skewness, kurtosis, Shapiro–Wilk, quartiles → compare with section 4.
3. Compare the per-item α-if-dropped and item–rest r with `fixture_A_expected.json` → `reliability`.
Record the outcome here.

## 8. Regenerating

```bash
cd docs/fixtures && python3 generate_fixtures.py   # needs numpy and scipy
```
The data uses a fixed seed. Do not regenerate casually: expected values would change if the generator changes.
