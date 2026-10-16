# Scientific Specification — Psychometric Prep (v2)

**Purpose:** Anyone implementing scoring, data quality (DQ), reliability or content validity must match these definitions so results are reproducible across rebuilds and agree with standard software (jamovi, SPSS, R).

**Rules for implementers**
1. If a method is not listed here, do not invent a default. Ask, or treat it as out of scope.
2. Every pure function here needs unit tests using `docs/TEST_FIXTURES.md` and `docs/fixtures/`.
3. Where this spec differs from the existing Bolt code, **this spec wins** (see Appendix A).
4. Citations below are for provenance and user-facing method notes. **Verify each citation (authors, year, journal) before putting it in user-visible copy.**

---

## 0. Vocabulary and conventions

**Item value states.** Every item cell is exactly one of:

| State | Meaning | Counts as missing for scoring? | DQ missingness |
|-------|---------|-------------------------------|----------------|
| `valid` | numeric (or label-mapped to numeric) and within [L, H] | no | — |
| `blank` | empty / whitespace / unparseable | **yes** | "unexpected missing" |
| `allowed` | matches the user's allowed non-response list (N/A, Prefer not to say, -99, 99, 999, …) | **yes** | reported separately, **not** a DQ failure |
| `out_of_range` | numeric but < L or > H | **yes** (default; action per scale) | reported separately as out-of-range |
| `special_scored` | a response the user gave a number outside the normal scale (e.g. N/A scored 0) | no (scored; **not reversed** unless ticked) | counted as valid |
| `unmapped` | a word or code with no decision | **yes** (invalid until decided) | flagged |

**Scale range.** `L` and `H` are the lowest and highest possible response values. They come from the response scale (detected by the conventional-range rule in `RESPONSE_SCALES.md` §4 and shown for confirmation, set manually, or implied by a preset/label map). The range is never widened to include stray values. If no range can be determined, scoring is blocked with a visible message. See `RESPONSE_SCALES.md` for how special responses and word labels resolve.

**One normalized matrix.** Scoring, data quality, reliability, descriptives, outliers and item analysis must all read the **same normalized data matrix**, produced by one function that applies the state table above (value mapping, range check, allowed non-response). No module may call `Number()` on raw cells itself. (Fixes the old disagreement between scoring and reliability for text responses.)

**Numeric parsing.** Trim whitespace including non-breaking spaces. The import preview has a **number format** setting: *decimal point* (default) or *decimal comma*. `1,5` is read as 1.5 only under decimal comma; otherwise it is flagged, never guessed. Thousands separators are removed only under the chosen format. Spreadsheet date serials and booleans in item columns are flagged, not silently converted.

**Precision.** Do not round internally. Round only for display. Compare thresholds using integer arithmetic where possible (see 1.3).

**Estimators (fixed, match jamovi/SPSS):**
- Variance and SD: sample (n − 1).
- Quantiles: linear interpolation between order statistics (R `quantile` type 7; NumPy default; Excel `QUARTILE.INC`).
- Skewness: bias-corrected **G1**. Kurtosis: bias-corrected **excess kurtosis G2** (normal = 0). (Joanes & Gill, 1998; SPSS/SAS/e1071 type 2.)
- SE of skewness = sqrt(6n(n−1) / ((n−2)(n+1)(n+3))). SE of kurtosis = 2·SE_skew·sqrt((n²−1) / ((n−3)(n+5))).
- Pearson correlation: standard product-moment.

---

## 1. Scoring

### 1.1 Value mapping
1. Categorical label → numeric via the label map (case-insensitive, trimmed).
2. Numeric strings parse to numbers.
3. Apply the state table in section 0.

### 1.2 Reverse coding
For an item with scale range L–H: `x' = (L + H) − x`. Applied to `valid` values only, **before** summing, averaging, proration, or reliability. Example: L=1, H=5, x=2 → x'=4. For categorical scales, reverse the *numeric coded value*.

### 1.3 Scale score (default = strict)
Let `k` = items on the scale, `m` = items that are missing (any non-valid state), `o = k − m` observed.

**Proration OFF (default):**
- If `m = 0`: Sum = Σ x', Mean = Σ x' / k.
- If `m > 0`: the scale score is **missing** for that row. (No silent partial sums.)

**Proration ON (opt-in, person-mean / "prorating"):**
- Let `t` = max missing percentage (integer). Presets: **20** (default), 25, 50 (half-rule).
- Allowed iff `o ≥ 1` **and** `m × 100 ≤ t × k` (inclusive boundary, integer arithmetic).
- If allowed: `Mean = Σobserved x' / o`; **`Sum = Mean × k`** (i.e. the sum you would get if each missing item were replaced by the person's observed mean).
- If not allowed: scale score missing.
- Rows where proration was applied are marked (`prorated = true`, `n_imputed_items = m`).
- If a published scale manual prescribes a different rule, the user sets `t` to match; it is stored in the template.

**Both unexpected-blank and allowed-non-response items count in `m`.** Proration is about how many items are unavailable, regardless of why. (This amends ADR 0001; see ADR 0007.) DQ still reports the two kinds separately.

**Rationale:** person-mean proration is common applied practice; Downey & King (1998) found it performs well up to about 20% missing items per scale; the 50% "half-rule" is used by several published instrument manuals.

### 1.4 Subscales, outputs and Overall (decided: ADR 0012)
- Zero subscales → one **Overall Scale** from all non-demographic, non-ID item columns, scored with 1.3.
- Subscales → each scored independently with 1.3. Per-scale scoring method is `sum`, `mean` or `custom` (see `FORMULA_SPEC.md`). Proration applies to `sum` and `mean` only.
- **Output columns:** for each subscale the user may enable **sum**, **mean**, or both (the existing Sum/Mean toggles stay); only enabled outputs are generated. The Overall is generated only if enabled.
- **Overall score** (when ≥ 2 subscales) has `source` and `method`:
  - **Source B, "combine subscale scores" (default):** Overall = Σ sₖ (method `sum`) or (Σ sₖ)/K (method `mean`), where sₖ is subscale k's score as configured and K the number of included subscales. A subscale may be **flipped**: sₖ′ = (min + max) − sₖ, where min and max are the lowest and highest *possible* score of that subscale given its item count and the scale range (sum: n·L to n·H; mean: L to H). Flip is unavailable for `custom` subscales.
  - **Source A, "from all items":** Overall = sum (or mean) of all items of the included subscales, same rules as 1.3; a flipped subscale's items are reverse-coded **for the Overall only**.
  - **Missing:** if any included subscale score is missing (after proration, if enabled), the Overall is missing. Proration happens at subscale level first.
  - Examples: Positive (4 items, mean 4) and Negative (6 items, mean 2): B-mean = 3.0, A-mean = 2.8; flipping Negative (L=1,H=5 → 6 − 2 = 4) gives B-mean = 4.0.
- The existing code adds subscale scores even when subscales use `mean` (Appendix A2); that is a bug.

### 1.5 Interpretation bands
- A band is `{name, min, max, color}`. A score matches the band where `min ≤ score ≤ max`.
- Before matching, the score is rounded **half-up to the number of decimals used by the band bounds** (0 decimals if all bounds are whole numbers). The unrounded score is what is displayed and exported; the rounding is noted in the export provenance.
- Validation must warn on overlaps and on gaps, evaluated at that same precision (not assuming integer steps when bounds have decimals).
- Excluded rows: no score, no band.

---

## 2. Data quality (survey)

All thresholds below are product defaults, editable in the UI.

### 2.1 Missingness
- Person-level unexpected-missing rate = `blank cells / configured item columns`. (Allowed non-response and out-of-range are not "blank".)
- Flag if rate **>** threshold. **Default threshold = 20%** (strictly greater; a row at exactly 20% is *not* flagged and is prorate-eligible).
- Item-level table: per item, count and % of blank / allowed / out-of-range / valid.

### 2.2 Out-of-range
Numeric values outside [L, H] are reported per row and per item, and treated as missing for scoring (section 0).

### 2.3 Response bias (computed on **raw responses as given**, i.e. before reverse coding)
| Check | Rule | Default | Reference |
|-------|------|---------|-----------|
| Straight-lining (longstring) | Longest run of identical consecutive responses across the configured item columns in column order. **A missing value breaks a run.** | flag if ≥ **6** | Johnson (2005); Meade & Craig (2012) |
| Extreme responding | share of valid responses at L or H | flag if ≥ **0.80** | Greenleaf (1992) |
| Midpoint responding | share of valid responses at the midpoint; defined **only when the number of response options is odd** | flag if ≥ **0.70** | — |
| Low within-person variance | sample SD of a row's valid responses (needs ≥ 2 valid) < `0.05 × (H − L)` | flag | — |

Severity labels (mild / moderate / severe) are UI conveniences; they must not change which rows are flagged. Rows with fewer than 3 valid responses are not evaluated for response-bias checks.
Flags are **suggestions**; the user decides on exclusion.

### 2.4 Row means (basis for outliers and normality)
- Row mean = mean of the row's `valid` item values **after reverse coding** (when a config exists; raw values if not configured yet).
- Computed only for rows with `≥ 50%` valid items (`ceil(0.5 × k)` valid).
- Computed across included (non-excluded) rows.

### 2.5 Outliers on row means
- **Primary (on by default): Tukey fences.** Flag if `mean < Q1 − 1.5×IQR` or `> Q3 + 1.5×IQR` (Q1, Q3 per section 0). Needs ≥ 4 row means.
- **Secondary (opt-in toggle, off by default):** |z| > 3 using the sample SD of row means.
- No multivariate (Mahalanobis) or MAD outlier flags in v1.

### 2.6 Normality aids (descriptive, never gatekeeping)
- Shapiro–Wilk W and p (Royston, 1995, algorithm AS R94). Valid for **3 ≤ n ≤ 5000**; outside that range show "not computed (n out of range)" and descriptive shape only.
- Skewness G1, excess kurtosis G2, and their SEs (section 0).
- Histogram with normal curve; Q–Q plot optional.
- **Kolmogorov–Smirnov, Lilliefors-corrected** (Lilliefors, 1967) is shown next to Shapiro–Wilk: statistic D exact; p-value exactly as R `nortest::lillie.test` (Dallal & Wilkinson, 1986 exponential approximation, polynomial correction above 0.1, n > 100 adjustment); computed for n ≥ 5. **R is the reference.** statsmodels uses a simulation table above p = 0.1, so it is only compared strictly when both p-values are ≤ 0.1 (ADR 0002). Plain KS with estimated parameters must never be shown. The existing `lillieforsTest` already follows this method; it must pass Fixture A and be cross-checked against R (`nortest::lillie.test`) when R is available.
- **Never exclude for non-normality, and the product does not offer removing observations to improve a test result.** Exclusions are rule-based (2.1–2.5), logged and user-approved. Copy must say what the test does and does not mean in plain language, and that large samples reject trivially.
- **No binary "normal / not normal" verdict** anywhere (screen, report, export). Show the statistic and p-value with wording such as "p < .05 suggests a departure from normality; read it alongside the plots and the sample size".
- **Accurate distribution functions.** p-values and critical values must use accurate algorithms: the normal CDF per R/Cody (not the Abramowitz–Stegun 7.1.26 approximation), an exact Student-t quantile for 95% confidence intervals (not a normal correction), and functions that honour any `log.p`-style argument they expose (or do not expose it). Each must agree with SciPy/R to 1e-9 on a test grid that includes the tails. A vetted library may be used with approval (rule 6).

### 2.8 Candidate checks (need UI approval before building; thresholds are conventions, editable)
- **Duplicate respondents:** rows sharing the same respondent ID, or identical answers on all items. Flag only; the user decides.
- **Speeders** (needs a duration column): flag duration below a user-set fraction of the median (default one third) or below a user-set seconds-per-item.
- **Attention checks:** the user names an item and its correct response(s); rows failing it are flagged.

### 2.7 Exclusions
- One shared set of excluded row indices per dataset, used by Configure, DQ, Export, Report, Reliability.
- "Exclude all flagged" is a toggle (second click restores).
- Export: drop excluded rows (default) **or** keep with yellow row highlight (Excel) plus a flag column (CSV).

---

## 3. Reliability (Phase 1)

For each scale (each subscale, and the overall scale if shown):
- Items are reverse-coded first (1.2). Proration is **not** applied.
- Use **listwise-complete** cases among included rows (a row must have all items of that scale valid). Report `n_complete` and `k`.
- **Cronbach's α** = `k/(k−1) × (1 − Σσ²ᵢ / σ²_total)` with sample variances. (Cronbach, 1951.)
- Per item: **α if item deleted**, and **corrected item–total correlation** (Pearson r between the item and the sum of the *other* items).
- Needs `k ≥ 2` and `n_complete ≥ 2` and σ²_total > 0; otherwise show "not computable" with the reason.
- Do **not** attach verbal labels ("good/poor") automatically. If α < 0, or an item's corrected item–total r is negative, show a note that the item probably needs reverse-keying (jamovi shows the same kind of note; in the raw Fixture A run it flagged Q6 and Q9).
- Copy must state α's assumptions (essentially tau-equivalent items) and that it is not a validity statistic.
- Out of scope in v1: McDonald's ω, standardized α, confidence intervals, factor analysis, IRT. (The existing `reliability.ts` also computes standardized α; it may stay in the code but must not appear in the UI until fixture-tested.)

---

## 4. Content validity (Phase 2)

### 4.1 Lawshe CVR
`CVR = (nₑ − N/2) / (N/2)`, `nₑ` = experts rating "essential" after mapping, `N` = experts included (not excluded). (Lawshe, 1975.)
**Critical values:** the Ayre & Scally (2014) corrected one-tailed table for N = 5–40. **The implementer must copy values from the published table and cite it; do not reproduce values from memory.** Accept iff `CVR ≥ critical(N)`.

### 4.2 Aiken's V
For ratings `r` on `lo…hi`, `c = hi − lo + 1`, `n` experts with usable ratings: `V = Σ(rᵢ − lo) / (n × (hi − lo))`. (Aiken, 1985.)
Critical value, normal approximation: `V_crit = 0.5 + Z × sqrt((c+1) / (12 n (c−1)))`, Z = 1.6449 (α=.05) or 2.3263 (α=.01).
Before shipping Phase 2, **verify against Aiken's published exact table** and document any difference; note the approximation in user-visible output.

### 4.3 Decision rule (proposed default, see `PROJECT_TYPES.md` §A)
- **Accept iff the statistic ≥ its critical value; otherwise Drop.** No "refine" band. An optional user-set minimum V is off by default.
- I-CVI / S-CVI are not included in v1.

### 4.4 Other rules
- Dimension labels are never scored. A dimension may be a **full row** or a **single cell** (label in the item column with the expert cells empty); both are detected and shown for confirmation.
- Expert flags (suggestions, never automatic): experts with many empty ratings, experts with **no variation** across items, and experts who agree least with the panel (lowest mean correlation with the others).
- Empty cells: default treated as "not essential / lowest rating" (code 0) unless the user toggles treat-as-1. Show the count of empty cells used.

---

## 5. Not specified (do not fake)

Full multiple imputation / FIML; IRT; SEM; multivariate outliers; McDonald's ω; confidence intervals for α.

## 6. Longitudinal rules (proposed defaults; see `PROJECT_TYPES.md` §C)
- **Person key** = one to three columns combined, trimmed and case-folded (original shown). Wave label = value of the wave column, the sheet name, or the file's assigned wave when each wave is a sheet or file.
- **ID-match suggestions:** among keys that occur in only some waves, suggest pairs whose normalized forms (after removing spaces, hyphens and underscores) differ by an edit distance of 1. Never auto-merge; an accepted match is recorded in the cleaning log.
- **Duplicate (ID, wave):** more than one row for the same key and wave blocks scoring until the user chooses keep-first / keep-last / exclude-both.
- **Present** at wave k = a row exists for the person at that wave. **Scoreable** = present and the scale score is non-missing under section 1.
- **Attrition at wave k** = 1 − (present at k ÷ present at the first wave). Patterns: *completer* (present at all waves), *dropout* (present, then absent at every later wave), *intermittent* (absent at some wave but present later), *late joiner* (absent at the first wave).
- **Scores per wave** use the same configuration as survey scoring (section 1), applied independently to each person-wave row.
- **Change score** (optional export) = score at wave k − score at the first wave; missing if either is missing.
- Exclusions: person-level (all waves) or person-wave level; shared across tabs.
- Exports state long vs wide; wide columns are named `<scale>_<wave>`.
- Not specified in v1: measurement invariance, growth models, imputation across waves.

## 7. EMA helper rules (proposed defaults; see `PROJECT_TYPES.md` §D)
- **Required columns:** person ID, timestamp, at least one item column.
- **Timestamps:** the user confirms the format and time zone; unparseable values are listed and excluded from time-based calculations, never guessed. Duplicate timestamps for one person are flagged; out-of-order rows are sorted and counted.
- **Day** = calendar date in the confirmed time zone, shifted by the optional "day starts at" hour. **Beep index** within a day = order by timestamp.
- **Compliance** (needs a schedule: prompts per day `P`, number of days `D`): `expected = P × D` per person (days = study days given, or first-to-last observed day if the user chooses that); `compliance = valid beeps ÷ expected`, shown uncapped, with duplicates flagged. Without a schedule: show counts and gaps only.
- **Gaps:** time between consecutive observations per person; report median and maximum gap; a user-set threshold flags long gaps (off by default).
- **Time-of-day bins:** user-editable; defaults night 00–06, morning 06–12, afternoon 12–18, evening 18–24 (start inclusive, end exclusive).
- **Person-level aggregates** per variable: mean, SD (sample), n of valid observations. A person with fewer than a user-set minimum n gets the aggregate flagged.
- **Within-person centering:** `x_ij − mean_i`, using that person's valid observations; if a person has fewer than 2 valid observations the centered value is missing. Optional grand-mean centering of person means.
- Aggregates by day use the same formulas within each person-day.
- **Lag-1 variable:** for each person, the value at the previous observation (by timestamp). Default: only if the previous observation is on the same day and its value is non-missing; otherwise missing. The user may instead allow any previous observation within X hours.
- No imputation of missing beeps. No multilevel reliability in v1.

## 8. Item analysis (Phase 2; see `PROJECT_TYPES.md` §B)
For a chosen scale (items reverse-coded as in 1.2, included rows only, **listwise-complete cases on the scale's items**, as in section 3):
- **Item mean** (difficulty p for 0/1 items) and **SD** (sample).
- **Corrected item–total correlation** `r_it` = Pearson r between the item and the sum of the *other* items. For 0/1 items this is the **corrected point-biserial**. An uncorrected version may be shown only if labelled inflated.
- **α if item deleted** (section 3).
- **Point-biserial with a binary criterion:** `r_pb` = Pearson r between the item (or total) and a 0/1 criterion; equivalently `(M₁ − M₀)/s × sqrt(p·q)` with `s` the population SD. Both forms must agree in tests. The criterion is a 0/1 column or a cut score on the total (state "≥").
- Needs `n_complete ≥ 3` and non-zero variance, else "not computable" with the reason.

### 8.1 Answer-key scoring
- A key lists, per item, the accepted response(s); comparison is trimmed and case-insensitive.
- Correct = 1, incorrect = 0. **Blank/omitted:** incorrect by default, or missing (setting). Responses outside the item's options are counted and shown, and treated like blanks.
- Total score = sum of item scores; proration does not apply to key-scored tests unless the user turns on "treat omitted as missing" and proration.

### 8.2 Upper–lower discrimination index
- Rank included rows by total score. Upper and lower groups = top and bottom 27% (`ceil(0.27 × n)`), **with ties at the cut included**, so group sizes may exceed 27%; report both sizes. `D = p_upper − p_lower` per item. (Kelley, 1939.)

### 8.3 Option (distractor) frequencies
- Per item: count and % choosing each option, overall and in the upper and lower groups. Flag options chosen by fewer than the threshold (default 5%, editable) as "rarely chosen". Suggestion only.

### 8.4 Review flags (suggestions, editable thresholds)
Negative corrected `r_it`; difficulty p < 0.10 or > 0.90. No automatic verbal labels.

### 8.5 Reshaped export
One row per person per item: person ID, item, raw response, scored value, scale.
Not in v1: IRT parameters.

## 9. Provenance and stale results
Every computed result stores: dataset version (hash of the normalized matrix), configuration hash, spec version, library version, missing-data policy, timestamp. Exports state these. **A saved result whose dataset or configuration hash no longer matches is never shown or exported**; the user sees "Scores are out of date. Run scoring again." (Fixes silent stale scores.)

## Appendix A — Known differences between the existing Bolt code and this spec (fix during rebuild)

| # | Area | Existing code | This spec |
|---|------|---------------|-----------|
| A1 | Missing items in scoring | Silently skipped: **Sum under-counts**, Mean = mean of observed | Strict by default; opt-in proration with Sum = observed mean × k |
| A2 | Overall with subscales | Always sums subscale scores, even when subscales use Mean | Configurable per 1.4: combine subscale scores (sum or mean, optional flip; default) or from all items |
| A3 | Reverse with no min/max set | `0 + 0 − x` = **−x** | Block scoring until L/H set |
| A4 | DQ default `unexpectedMissingPct` | **0** in code (docs said 20) | 20, flag when strictly greater |
| A5 | Longstring | Skips missing values, so runs can span gaps | A missing value breaks the run |
| A6 | Row means for DQ | Raw values (not reverse-coded) | Reverse-coded when config exists |
| A7 | Z-score outliers | On alongside IQR | Opt-in, off by default |
| A8 | Band gap check | Assumes integer steps (`+1`) | Precision-aware (1.5) |
| A9 | Band matching with fractional scores | Inclusive min/max, fractional scores can fall in gaps | Round to band precision (1.5) |
| A10 | Cronbach's α | `reliability.ts` exists, not wired to UI | Wired in Phase 1 (section 3) |
| A11 | KS / MAD / Mahalanobis modules | Present in `src/scientific/`; KS not shown in the UI | KS (Lilliefors) is shown in Data quality (2.6); MAD / Mahalanobis stay out of the v1 UI |
| A12 | `pnorm` | Abramowitz–Stegun 7.1.26 approximation | Accurate algorithm (2.6) |
| A13 | `tCritical` for 95% CIs | Normal-quantile correction, no error bounds | Exact Student-t quantile (2.6) |
| A14 | Reliability input | `Number()` on raw cells, so text responses become NaN | Same normalized matrix as scoring (§0) |
| A15 | `_logP` argument | Accepted but ignored | Honour it or remove it |
| A16 | Normality conclusion | Binary `isNormal` | Statistic + p + plain-language note, no verdict (2.6) |
| A17 | Stale saved scores | Shown if exclusion state matches | Hash check, blocked when stale (§9) |
| A18 | Exclusions | Row positions | Stable row IDs (`DATABASE.md`) |
| A19 | `qnorm` lower tail | Returned a positive magnitude for lower-tail probabilities (wrong sign); broke Shapiro–Wilk weights (W ≈ 0.002 for data whose true W is 0.98) and the Q–Q plot's theoretical quantiles | Fixed and validated on a 590-point grid against SciPy (1e-9 relative) |
| A20 | `tCritical` for confidence intervals | Used `pnorm(0.975)` as a quantile (0.89 at n = 5; 1.96 at n ≥ 31) | `qt(0.975, n − 1)` (2.776 at n = 5; 2.042 at n = 31); intervals widen |
| A21 | Lilliefors p-value | Hand-written piecewise exponential (0.010 for Fixture A) | Exact `nortest::lillie.test` Dallal–Wilkinson + polynomial correction, n > 100 adjustment (0.4586 for Fixture A) |

## Appendix B — References (verify before citing)
Aiken (1985) *Educational and Psychological Measurement*; Ayre & Scally (2014) *Measurement and Evaluation in Counseling and Development*; Cronbach (1951) *Psychometrika*; Downey & King (1998) *Journal of General Psychology*; Greenleaf (1992) *Public Opinion Quarterly*; Hyndman & Fan (1996) *The American Statistician* (quantile types); Joanes & Gill (1998) *The Statistician*; Johnson (2005) *Journal of Research in Personality*; Lawshe (1975) *Personnel Psychology*; Lilliefors (1967) *JASA*; Meade & Craig (2012) *Psychological Methods*; Royston (1995) *Applied Statistics* (AS R94); Tukey (1977) *Exploratory Data Analysis*.
