# Project Types and Add-ons: flows and decided defaults (v2)

**Positioning:** the product is a **data pre-processing workbench**: it takes raw, messy exports and makes them clean, organized, documented, and ready for analysis in SPSS, jamovi, R or Excel. Every feature below is judged by one question: *does it remove a real chore between raw data and analysis?*

**Status of defaults:** the owner delegated these decisions; they are the SME/cofounder/senior-developer recommendation and can be vetoed before the phase starts. Math is in `scientific-spec.md` (§2.8–2.10, §4, §6–§8). New types are registry entries (ADR 0010); the survey type and its UI are untouched. Reuse everywhere: import preview and multi-sheet/multi-file parsing, grid, exclusions, export writer, templates, history, backup/cloud resume, entitlements.

---

## A. Content validity (project type; Phase 2)
Experts rate items; the app decides which to keep. It scores *items*.
**Tabs:** Data · Results · Export.
**Flow:** new project → choose Lawshe or Aiken → upload expert sheet (rows = items, columns = experts) → map item text, expert columns, optional dimensions → map values (e.g. Essential → 1; Aiken rating range) → optionally exclude noisy experts → analyse → per item statistic, critical value, **Accept / Drop** → drop weak items → export full results, kept items only, or a clean item list.
**Decided:**
- Accept iff statistic ≥ critical value, else Drop. No "refine" band. Optional user-set minimum V, off by default.
- Per-dimension summary (kept / dropped counts).
- Empty cells per spec §4.4, with the count shown.
- "Noisy expert" helper: list experts whose ratings agree least with the panel (e.g. lowest average correlation with other experts) as a *suggestion* to exclude; never automatic.
- Export includes a short methods note (method, critical values source, number of experts, exclusions).
- Not in v1: I-CVI / S-CVI.

## B. Item analysis (panel inside a survey project; Phase 2)
Two kinds of data, one panel:
- **Opinion/Likert items:** corrected item–total r, α if deleted (already computed for reliability), item mean/SD.
- **Right/wrong tests** (MCQ, quizzes, aptitude): needs **answer-key scoring**.
**Decided:**
- **Add answer-key scoring** as a scoring mode: a key (typed in the app or read from a key row) maps each item's accepted answer(s); correct = 1, incorrect = 0. Setting: *blank/omitted answers count as* **incorrect (default)** or missing.
- Item statistics: difficulty p, SD, corrected point-biserial (= corrected item–total r), α if deleted, optional point-biserial with a binary criterion (pass/fail column or cut score), **upper–lower (27%) discrimination index**, and **option (distractor) frequencies** with a "rarely chosen" flag (default < 5%, editable).
- Review flags (suggestions only, thresholds editable): negative corrected r; p below 0.10 or above 0.90.
- Exports: item table (CSV/XLSX) and a reshaped long file (person × item).
- Where: a new **Items** panel reachable from Export and Data Quality, same card style (UI-freeze approval needed at build time).

## C. Longitudinal (project type; Phase 4)
**Tabs:** Structure · Quality · Score · Export.
**Decided:**
- **Inputs (v1):** one long file (ID + wave column); **one sheet per wave**; **several files, one per wave** (same pattern as multi-sheet import). Wide input (`Q1_T1`, `Q1_T2`) comes in v1.1 via a "wave suffix" mapping.
- **Person key:** one to three columns combined (for self-generated codes such as initials + birth month), trimmed and case-folded; original values always shown.
- **ID-matching help:** list IDs found in only some waves, and **suggest likely matches** (e.g. `R101` vs `r-101`, one-character typos). Suggestions are never auto-merged; each accepted match is recorded in the cleaning log.
- Duplicate (ID, wave): blocks scoring until the user chooses keep first / keep last / exclude both.
- Attrition: completer, dropout, intermittent, late joiner; retention table by wave.
- Scoring per wave reuses survey templates; optional per-wave DQ reuses survey DQ.
- Exclusions: person level (default) or person-wave level.
- Exports: long, wide (`<scale>_<wave>`), attrition summary, optional change scores (wave k − wave 1, off by default).

## D. EMA helpers (project type; Phase 5)
**Tabs:** Data · Compliance · Aggregate · Export. Not a collection app.
**Decided:**
- The user confirms timestamp format and time zone; unparseable rows are listed, never guessed. Duplicate timestamps flagged; out-of-order rows sorted and counted.
- Compliance % needs an optional **schedule** (prompts per day, number of days). With no schedule, show counts per person/day and gaps only; never present an inferred figure as "compliance".
- Low-compliance flag: people below a user-set % (default 50%, a convention, not a standard).
- "Day" = calendar day with optional "day starts at" hour; editable time-of-day bins (night 00–06, morning 06–12, afternoon 12–18, evening 18–24).
- Aggregates: person and person-day mean, SD, n; within-person centering; optional grand-mean centering of person means.
- **Lagged variables** (previous beep's value within person): default lag-1 *within the same day*, missing if the previous beep is missing; the rule is editable (e.g. any gap up to X hours).
- Optional multi-item composites per beep reuse survey scoring templates.
- Exports: cleaned beep-level data (with day number, beep index, time bin, centered and lagged columns) and person-level summary.

---

## E. Cross-cutting pre-processing add-ons (see `PAINPOINT_BACKLOG.md` for ranking)
- **Cleaning log** (what was imported, excluded, recoded, matched, and why) exportable as a file and as a methods paragraph.
- **Codebook / data dictionary** export (variable names, labels, scale ranges, reverse-keyed items, missing codes).
- **Import presets** for common survey-tool exports (e.g. Qualtrics extra header rows, Google Forms timestamp column).
- **Extra data-quality checks** (survey): duplicate respondents, speeders (optional duration column), attention-check failures.
- **Analysis-ready export pack:** CSV/XLSX plus syntax or script files (SPSS / R) that apply variable and value labels.
These touch the frozen survey UI, so each needs explicit approval at build time (`UI_FREEZE.md`).

## Build order after the survey recreation
Phase 2: A + B → Phase 3: reporting + cleaning-log/codebook/export pack → Phase 4: C → Phase 5: D. Fixtures for each feature are generated before its phase starts.
