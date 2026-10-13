# AS-BUILT: What the Bolt app actually implements

> **Verification status (v2):** Sections 1–11 were reverse-engineered from the app and repo by an AI tool. Section 12 below is a direct audit of the repo code (October 2026) and **overrides** earlier sections where they disagree. The rebuild follows `scientific-spec.md`, not this file, wherever math is concerned.

**Source of truth for this document:** reverse-engineering of the GitHub repo `pradyumniyer/automated-psychometric` and local clones (`automated-psychometric-fresh` includes Report + ImportPreview; `automated-psychometric` main line includes richer Export variants).  

**Purpose:** Capture **every real screen, control, and behavior** so PRD / APP_FLOW / Figma / future work extend reality—not a simplified sketch.

**Stack as shipped in Bolt today (differs from target architecture):**

| Layer | As built |
|-------|----------|
| UI | React 18 + TypeScript + Vite + Tailwind + lucide-react + recharts |
| Data | **Supabase** (Postgres): projects, datasets, demographics, subscales, scales, bands, scoring_results, templates, action_history |
| Files | `xlsx` (SheetJS) client parse/export |
| Math | Pure TS under `src/scientific/` |

**Target architecture (planning docs)** moves grids to **IndexedDB / local-first**. As-built still uses Supabase for grids—document both; migrate deliberately.

---

## 1. Global app shell (`App.tsx`)

**Views (enum):** `list` | `config` | `quality` | `export` | `report`

| UI element | Behavior |
|------------|----------|
| Back to projects | Clears project → `list` |
| Tabs | Configure & Score · Data Quality · Export · Report |
| Shared state | `project`, `activeDatasetId`, **`excludedRows: Set<number>`** passed to Config / DQ / Export / Report |

**Important:** Exclusions are intended to be **global per active dataset** across tabs (bugs in some builds: Config not always reflecting DQ “exclude all”—product requirement is universal sync).

No project-type switcher in current main (survey-only after CV rollback). Content validity is **not** in the as-built main path.

---

## 2. Project list (`ProjectList.tsx`)

- List projects from Supabase  
- **New Project** (name) → creates project → opens Configure  
- Open / delete project  
- Empty state: “No projects yet”

**Missing vs future PRD:** Free caps (2 projects), project type (survey vs CV), plan badge—not in as-built UI.

---

## 3. Configure & Score workbench (`ConfigScreen.tsx` ~1.7k lines)

### 3.1 Layout pattern (critical UX the Figma sketch understated)

**Split workbench, not “form then table”:**

1. **Left / main:** **`LiveGrid`** — live spreadsheet of the active dataset while the user configures.  
2. **Side / sections:** configuration panels (import, columns, subscales, scales, bands, templates, scoring).  
3. Config changes **update the grid** (roles, groups, scores, exclusions) without leaving the screen.

This “live spreadsheet available while config is completed” is a **core product characteristic** and must appear in APP_FLOW, PRD, and design.

### 3.2 Multi-sheet import

- File picker → sheet picker if workbook has multiple sheets  
- **Queue:** import sheet-by-sheet via `ImportPreviewModal`  
- Each sheet → one `datasets` row (`file_name`, `sheet_name`, headers, rows JSON)  
- Dataset **tabs** to switch active sheet  
- Delete sheet with confirm (removes config/scoring for that dataset)  
- Active dataset must stay stable when switching to Quality / Export / Report (product rule; fixed in later prompts)

### 3.3 Import preview (`ImportPreviewModal.tsx`)

| Control | Behavior |
|---------|----------|
| Header row index | User picks which row is the column-name header (multi-row header support) |
| Data starts on row | Rows above (except header) treated as non-data / labels |
| Remove fully empty data rows | Optional; **default keep** empty rows inside data region |
| Preview table | Color tags: **H** header, empty rows warning tint |
| Empty-row report | Message lists sample empty row numbers |
| Platforms called out | Qualtrics, SurveyMonkey, REDCap, Google Forms, Excel/CSV |
| Confirm / Cancel | Confirm writes dataset; multi-sheet continues queue |

**Later product polish (requested, partially landed):** disable empty-row checkbox when count = 0; empty columns analog; simplify presets vs “data starts on row.”

### 3.4 Column roles

- **Auto-detect demographics** (`detectDemographics`) on import  
- Toggle demographic vs item per column  
- **ID columns** section  
- **Mark all as items**  
- Search/filter columns  
- Unassigned items pool → assign to subscales  

### 3.5 Scale groups / subscales

| Feature | Detail |
|---------|--------|
| Add subscale | Creates DB row; UI should **scroll/focus** to assignment (requested fix) |
| Name | Editable |
| Items | Multi-select from unassigned; add to subscale; order; **reverse** per item |
| Delete subscale | Removes bands for that name |
| **Overall Scale** | If **zero subscales**, all non-demographic items form one overall scale (unidimensional path) |
| Scoring method per scale | **`sum` \| `mean` \| `custom`** |
| Custom formula | `evaluateFormula` / `validateFormula` (`scientific/formula.ts`) |

### 3.6 Response scales

- Per subscale: **`numeric`** (min/max) or **`categorical`** (label → value map)  
- **Preset Likert** scales from `COMMON_LIKERT_SCALES` (`detection.ts`)  
- Add/remove label-map rows (same pattern as “add label”)

### 3.7 Interpretation bands

- Per subscale: named bands with min/max score + **color**  
- Suggest bands (`suggestBands` / `validateBands`)  
- Shown on LiveGrid / scoring output as interpretation labels  

### 3.8 Templates (`lib/templates.ts`)

| Feature | Detail |
|---------|--------|
| Save current as template | Snapshot: subscales, items+aliases, reverse, scoring method, formulas, response scales, bands, demographic rules |
| Browse / apply | Match headers by name/aliases; **match report**; unmatched skipped |
| Link / unlink | Linked template version shown; changes can update template |
| Validation | Some builds require ≥1 subscale to save (conflicts with unidimensional—product rule: templates must work with overall-only configs) |

### 3.9 Scoring action

- **Run scoring** → `scoreDataset` → persist `scoring_results`  
- Outputs per-row subscale scores + interpretation labels (+ overall if applicable)  
- Respects **excluded row indices**  
- Out-of-range numeric values → null for scoring  
- Reverse before aggregate  

### 3.10 History / undo (`lib/history.ts` + panel)

- Action log: import, sheet delete, config changes, etc.  
- **Undo** when `undo_data` present  
- Autosave indicator: saving / saved  
- Flush autosave before dataset switch (edge-case fix)

### 3.11 Exclusions on Configure

- Excluded rows panel / toggles  
- LiveGrid row exclude  
- “Show excluded only” filter on grid  

### 3.12 LiveGrid (`LiveGrid.tsx`) — first-class surface

| Feature | Detail |
|---------|--------|
| Grouped headers | When subscales exist: columns grouped by subscale name (color-coded) |
| Simple headers | ID / Unassigned / Overall Scale paths |
| Row exclude toggle | Click to exclude/include |
| Highlight | External `highlightRowIndex` + ref (DQ “jump to row”) |
| Summary row | Optional **Sum →** / **Mean →** display of scores |
| Excluded styling | Visual distinction for excluded rows |
| Real row indices | Maps filtered view ↔ underlying row index |

---

## 4. Data Quality (`DataQualityScreen.tsx` + `scientific/dataQuality.ts`)

### 4.1 Engine defaults (`DEFAULT_THRESHOLDS`)

| Key | Default |
|-----|---------|
| `unexpectedMissingPct` | **0 in code** (docs previously said 20; see §12; v2 spec default is 20) |
| `longstringMin` | **6** |
| `extremeRate` | **0.80** |
| `midpointRate` | **0.70** |
| `lowVarianceFraction` | **0.05** of scale range |
| `zscoreThreshold` | **3.0** |
| `minValidItemFrac` | **0.50** (need ≥50% valid items for row-mean metrics) |

### 4.2 Allowed non-response defaults

- Text: N/A, Not applicable, Prefer not to say, Refused, NA, n/a, na  
- Numeric sentinels: -99, 99, 999, -999, 77, 88  
- User-editable lists in UI  

### 4.3 Checks performed

1. **Missingness** — unexpected vs allowed vs total; person-level + **item missingness summary** table  
2. **Out-of-range** — vs configured scale min/max (or inferred)  
3. **Response bias** — straight-lining (longstring; severity escalates at ≥12 or ≥50% of items), extreme responding, midpoint responding, low within-person variance  
4. **Outliers** — on **row means**: IQR fences + optional z-score; combined flag set  
5. **Normality** — Shapiro–Wilk on valid row means; skew/kurtosis; **histogram + normal curve** (recharts)  

### 4.4 UI

- Summary cards / sections for each category  
- **Flagged rows table** with reasons, severity, Exclude actions  
- **Exclude all** (must be toggleable; must update shared state → Config/Export)  
- Threshold + allowed non-response editors  
- **Continue to export**  
- Click row → highlight in grid (when navigated back to Config with shared highlight state)

### 4.5 Not in as-built DQ (parked)

- Person-mean **proration / imputation** UI (specified in planning docs, not confirmed in this tree)  
- Full Mahalanobis multivariate outliers (one mock mentioned it; engine is row-mean IQR/z)

---

## 5. Export (`ExportScreen.tsx`)

### 5.1 Cards (variants across commits)

| Export | Needs scoring? | Purpose |
|--------|----------------|---------|
| **Cleaned Raw Data** | No | All original columns; exclusions applied |
| **Items Only** | No | Item columns only (factor/IRT prep) |
| **Scored Data** | Yes | Original + scores + interpretations |
| **Scores + Demographics** | Yes | Demo columns + scores/interpretations |
| **Scores only** | Yes | Scores without interpretations (later add) |
| **Codebook + Provenance** | Optional | Metadata export (present in some commits; user asked to omit from product focus for now) |

### 5.2 Controls

- Dataset selector if multiple sheets  
- Summary: total / included / excluded counts  
- **Drop excluded** vs **Keep with flag** (product direction: yellow highlight preferred over bare boolean column)  
- CSV + Excel buttons  
- Disabled scored cards with reasons (no config / scoring not run)  
- Recompute scores on the fly if config exists but no saved result (some builds)

---

## 6. Report (`ReportScreen.tsx`)

Two modes:

1. **Individual / participant report**  
   - Select participant  
   - Scale scores + interpretation bands  
   - **Interpretation draft** text (“Draft for clinician review only. Not a diagnosis.”)  
2. **Sample / summary report**  
   - Sample composition  
   - Scale statistics  
   - Band distribution  
   - **Summary draft** text  

Uses excluded-row filtering. Requires configured scales for individual reports.

---

## 7. Scientific modules (as-built file list)

| Module | Role |
|--------|------|
| `scoring.ts` | Map values, reverse, sum/mean/custom, bands, overall scale |
| `formula.ts` | Custom score formulas |
| `bandValidation.ts` | Validate / suggest bands |
| `dataQuality.ts` | Full DQ engine |
| `descriptives.ts` | mean, sd, quantiles, skew, kurtosis |
| `outliers.ts` | IQR / z-score helpers |
| `shapiroWilk.ts` | Normality test |
| `kolmogorovSmirnov.ts` | Present in tree |
| `normalityTest.ts` | Orchestration |
| `distributions.ts` | e.g. qnorm for QQ-style aids |
| `detection.ts` | Demographics + Likert presets + scale detect |
| `reliability.ts` | Present (e.g. alpha helpers)—confirm UI wiring |
| `analysis.ts` | Extra analysis helpers |

---

## 8. Supabase data model (as-built)

Entities (from `lib/supabase.ts` types):

- `projects`  
- `datasets` (headers, rows JSON, file_name, sheet_name)  
- `demographic_columns`  
- `subscale_groups` (items JSON, scoring_method, custom_formula)  
- `response_scales`  
- `interpretation_bands`  
- `scoring_results`  
- `templates` (definition JSON, version)  
- `action_history`  

RLS: historically anon CRUD for single-tenant Bolt usage (security debt vs planning docs).

---

## 9. Gaps: as-built vs simplified Figma / early PRD

| Nuance in Bolt | Was under-specified in early screens |
|----------------|--------------------------------------|
| LiveGrid + config side-by-side | Shown as separate “form” screens |
| Multi-sheet queue + import preview | Simplified to one upload |
| Grouped subscale headers on grid | Not shown |
| Custom formula scoring | Not shown |
| Categorical label maps + Likert presets | Not shown |
| Interpretation bands + colors | Weakly shown |
| Template link/version/match report | Templates list only |
| History + undo | Missing |
| DQ charts (histogram, normal curve) | Summary cards only |
| Editable DQ thresholds + allowed N/A | Missing |
| Report individual + sample drafts | Single “Report” stub |
| Autosave / linked template | Missing |
| ID column treatment | Missing |

---

## 10. Explicitly not in current main (parked)

- Content validity project type (rolled back after upload bugs)  
- Auth / paid entitlements  
- IndexedDB local-first store  
- Dark mode (tokenized in design docs, not confirmed in app CSS as full theme)  
- APA Word export  
- Rpb helper  
- Longitudinal / EMA  

---

## 11. How to use this document

1. Treat **AS_BUILT** as inventory of **what exists**.  
2. **PRD** = as-built ∪ planned extensions (with phase tags).  
3. **APP_FLOW** must describe the **Configure workbench + LiveGrid** pattern.  
4. Figma should be revised toward split workbench, not only marketing-style pages.  
5. Security/architecture migration: Supabase grids → local store without losing the UX above.


---

## 12. Repo audit (October 2026: `pradyumniyer/automated-psychometric`)

**Facts**
- About 7,600 lines of TypeScript/React. `ConfigScreen.tsx` is ~1,740 lines with ~42 `useState` calls (state sprawl; likely cause of sync bugs).
- **No tests** and no test script. `package.json` still named `vite-react-typescript-starter`. Repo is **public**.
- Supabase migrations state that anon + authenticated CRUD policies remain on all tables. **Open data access: must not be carried over.**
- `npm audit`: 2 high advisories: `xlsx` (prototype pollution, ReDoS; no npm fix) and `ws`.
- No `eval`/`new Function`/`dangerouslySetInnerHTML` found. `formula.ts` is a real parser.
- No committed `.env`; no hard-coded keys found.

**Scoring and math behaviors that differ from the v2 spec** (all listed in `scientific-spec.md` Appendix A)
1. Missing items are silently skipped: Sum under-counts; Mean is the mean of observed items.
2. Overall score with subscales = sum of subscale scores, even if subscales use Mean.
3. Reverse coding with no scale min/max set computes `−x`.
4. DQ default unexpected-missing threshold is 0, not 20.
5. Longstring ignores missing values (runs can span gaps).
6. Row means for DQ use raw (not reverse-coded) values.
7. z-score outliers run in addition to IQR by default.
8. Band validation assumes integer steps; fractional scores can fall between bands.
9. `reliability.ts` (Cronbach's α) exists but is not wired to any UI.
10. Extra modules present (Kolmogorov–Smirnov, MAD, Mahalanobis) are not part of the product scope.

**Already matching the v2 spec:** sample SD; linear-interpolation quantiles (R type 7); skewness/kurtosis = G1/G2 (e1071 type 2); Shapiro–Wilk limited to n ≤ 5000; strict `>` comparison for the missingness flag; Tukey 1.5×IQR fences; extreme/midpoint/longstring/low-variance default thresholds.

**Formula evaluator limitations** (see `FORMULA_SPEC.md`): column names with spaces cannot be referenced; `1.2.3` silently parses as `1.2`; validation with dummy 1s can falsely reject divisions like `x/(a-b)`.
