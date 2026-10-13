# Psychometric Prep: Product briefing (read this first)

*Working name; the live prototype calls itself "Psychometric Workbench". Final name is an open decision.*
This is a **walkthrough of what users see, click and get**. Engineering detail lives in the other docs. Based on the owner's briefing and origin notes, updated with decisions made in October 2026.

## 1. What it is
A browser app that sits in the gap between **data collection and statistical analysis**. Researchers (psychology, social science; HR later) upload messy questionnaire exports (Qualtrics, Google Forms, Excel, multi-sheet workbooks) and get **clean, scored, analysis-ready files**, quality diagnostics, and light reporting, without the hours of error-prone cutting, pasting, reverse-scoring and checking they do today.

**Origin and pain point:** the owner repeatedly made mistakes grouping columns into subscales, reverse-scoring items and checking normality/outliers by hand across Excel and jamovi. The product removes that chore.

**Product bets**
1. Heavy work happens **in the browser**. Raw response grids stay on the user's machine; accounts hold billing, license, templates and (opt-in, end-to-end-encrypted) project copies so work survives a wiped browser.
2. **Two ways to work:** the *guided workbench* (inspect everything) and the *Quick Run* (upload → pick a saved template → download scored file + report).
3. **Prove what you did:** every exclusion, recode and match is logged, so users can show a thesis committee or reviewer.

**What it is not:** an SPSS/jamovi replacement, an SEM/IRT suite, a mobile EMA collection app, or a place to send sensitive data to a server-side AI.

**Who it is for (first):** psychology students, researchers and psychometricians. HR/L&D template packs come later.

## 2. Mental model: project types
Everything starts at the **project list**; a project has a **type** that decides its tabs. One shell, different workflows. The survey type is the foundation nothing may break.
| Type | Plain terms | Phase |
|------|-------------|-------|
| Survey scoring | Clean and score questionnaire responses (exists in the Bolt prototype) | Stage 1 |
| Content validity | Experts rate draft items; keep or drop | Phase 2 |
| Longitudinal | Same people, several waves; long/wide export | Phase 4 |
| EMA helpers | Existing beep/diary files; compliance + aggregates | Phase 5 |

---
# PART A: Survey scoring (exists today; keep exactly)

## A1. Projects home
List of projects (name, last updated). **New project** (name; type chosen when more types exist), **Open**, **Delete** (destructive; confirmed). Empty state encourages a first project. Free: 2 projects; a third is blocked with a clear message.

## A2. Workspace chrome
Back to projects · project name · tabs **Configure & Score · Data quality · Export · Report**. With several imported sheets, **sheet tabs** switch the active dataset. **The active sheet stays the same across all tabs, and exclusions are shared across all tabs.**

## A3. Configure & Score: the workbench (most important screen)
Not a wizard. A **split workbench**: **LiveGrid always visible** beside configuration panels. If a rebuild has only a settings form without the live grid, it is not this product.

**LiveGrid:** spreadsheet-like view of the active sheet; headers **grouped by subscale** (merged header over its items); click a row control to **exclude** a participant (excluded rows look different; in "keep" export they are yellow); filter to excluded only; after scoring, **score and interpretation columns**; sum/mean presentation choice **persists** across tabs; clicking a flagged row in Data quality **scrolls and highlights** it here.

**Side panels:**
- **Import:** CSV/Excel; multi-sheet queue; **import preview** (header row, where data starts, drop fully empty rows (default keep; disabled if there are none), small preview); confirm writes, cancel doesn't. Qualtrics-style multi-row headers are handled here.
- **Column roles:** items vs demographics vs IDs; demographics auto-suggested per dataset (never taken from a template); "mark all as items"; search; unassigned items wait in a pool.
- **Subscales:** Add subscale → the user lands on the card to add items; multi-select from the pool; per-item **reverse**; per-scale scoring **sum / mean / custom formula**; with no subscales, all non-demographic items form one **Overall Scale**.
- **Overall score (decided):** the user chooses how an Overall is built: **(B, default) combine subscale scores** (sum or mean), with the option to **flip** a subscale (e.g. reverse Negative Coping so higher Overall means better), or **(A) compute from all items**. Optional outputs: subscale **sum**, subscale **mean**, or both, plus Overall; only enabled outputs are generated.
- **Response scales:** numeric min/max, or categorical labels mapped to numbers (unique options auto-detected; Likert presets).
- **Interpretation bands:** e.g. Low/Moderate/High with ranges and colours.
- **Templates:** save **configuration only** (never rows or demographics); apply to a new file by matching column names/aliases and showing matched vs unmatched. Free: 2 personal templates.
- **Run scoring:** reverse first; respect scale min/max (out-of-range becomes missing); **strict by default** (any missing item leaves that scale score blank); optional **proration** (opt-in, up to 20/25/50% missing, documented on export).
- **History:** action log with Undo; autosave; switching sheets must not lose recent edits.

## A4. Data quality
Inspect quality and **exclude people** without scoring first.
- **Missingness:** unexpected blanks vs allowed non-answers (N/A, -99, Prefer not to say; editable lists).
- **Out-of-range** values.
- **Response bias:** straight-lining (run ≥ 6), extreme responding (≥ 80% endpoints), midpoint responding (≥ 70%), very low variance.
- **Outliers** on row means (IQR fences; z-score opt-in).
- **Normality aids:** Shapiro–Wilk **and Kolmogorov–Smirnov (Lilliefors-corrected)**, skewness/kurtosis, histogram with normal curve, Q–Q plot, boxplot. **Information, never a deletion target.** The product does **not** offer removing observations to improve normality.
- **Reliability (new):** Cronbach's α, α-if-item-deleted, corrected item–total r.
- Flagged-row table with reasons; exclude one or **exclude all (toggles back)**; same exclusion set everywhere.
- Candidate additions (need approval): duplicate respondents, speeders, attention-check failures.

## A5. Export
Counts of total / included / excluded; **drop** excluded rows or **keep** them (yellow). Cards (CSV and Excel): **Cleaned raw**, **Items only**, **Scored data**, **Scores + demographics**, **Scores only**. Scored cards are disabled with a clear reason until scoring has run. New: **cleaning log**, **codebook**, **diagnostics report workbook**.

## A6. Report
Short **drafts**, not articles or diagnoses. **Individual:** pick a participant → scores and bands → interpretation draft with a disclaimer. **Sample:** composition, scale statistics, band distributions → methods-style summary draft.

## A7. Quick Run (new; decided)
For users who already trust a template and their quality settings: **upload → choose template → choose cleaning rules → run → download**.
- Cleaning rules are **explicit, rule-based and logged** (e.g. exclude straight-liners, extreme responders, out-of-range, missing above X%, outliers by chosen rule). Never "remove to improve normality".
- Output: scored CSV/Excel plus a **diagnostics report workbook** (descriptives, reliability, normality, response quality, missing-data summary, what was excluded and why) and the cleaning log.
- Users who want control use the guided workbench instead; both share the same engine.

---
# PART B: Beyond the survey flow
Detailed flows and decided defaults: **`PROJECT_TYPES.md`**. Summary:
- **B1 Content validity:** Lawshe or Aiken; expert matrix (rows items, columns experts); dimension labels may be a **full row or a single cell** and are never scored; map values (Essential → 1); empty cells count as 0 (toggle); **flag experts who answered very little or gave no variation** (and those who agree least) as suggestions; Accept/Drop per item; exports (full, kept, clean list) with a methods note.
- **B2 Item analysis:** panel inside a survey project: item statistics, point-biserial, answer-key scoring for right/wrong tests, discrimination index, distractor frequencies, reshaped export.
- **B3 Longitudinal:** ID + wave structure; one long file, sheets or files per wave; attrition; same scoring per wave; long/wide/attrition exports. Prep for growth models, not modelling.
- **B4 EMA helpers:** compliance (only against a supplied schedule), person/day aggregates, centering, lags; exports for multilevel work. Not a collection app.
- **B5 APA tables / richer reporting:** Word tables and a cautious draft results paragraph using real numbers only.
- Later: qualitative tools; norms and standard scores (z, T, percentiles) as a possible scale-development step.

# PART C: Platform
- **Plans:** Free (survey core, reliability, local history, dark mode, 2 templates, ≤500 rows/dataset, ≤2 projects, basic exports) and **Pro** (CV, item analysis, longitudinal, EMA, APA/reporting, template library, higher limits). **Pro price placeholder: ₹300/month or ₹3,000/year**, kept in configuration, not in code. Lab/university licences later.
- **Accounts + billing** are built in Stage 1. **Cloud resume:** settings and history sync for every account; opt-in end-to-end-encrypted project copy.
- Dark mode; launch page; Privacy Policy and Terms that match the code; security mindset: validate uploads, never log cell contents, no secrets in the client, verified webhooks, no open data tables.

# How the pieces fit
Cleaning and scoring users live in **Survey**: Import → Configure (grid + scales) → Data quality (exclude) → Export/Report, or skip to **Quick Run**. Instrument builders open **Content validity**. Users with waves or diary files open those types, which reuse the grid, exclusions, export cards and scoring templates under different tabs.
