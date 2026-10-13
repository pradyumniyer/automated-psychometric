# APP_FLOW — Complete navigation, screens, and control behavior

**Audience:** Any builder (human or AI) recreating the product.
**Sources:** AS_BUILT.md (Bolt/GitHub reality) + COMPLETE_PRODUCT.md (expansion).

If behavior is in AS_BUILT and listed here, implement **as-built fidelity** first, then phased expansions.

---

## 0. Route and view map

### Public
| Route | Screen |
|-------|--------|
| `/` | Launch / marketing |
| `/privacy` | Privacy Policy |
| `/terms` | Terms of Service |

### App views
| View | Screen |
|------|--------|
| `list` | Project list |
| `config` | Survey: Configure and Score workbench |
| `quality` | Survey: Data Quality |
| `export` | Survey: Export |
| `report` | Survey: Report |
| `cv-data` | Content validity: Data |
| `cv-results` | Content validity: Results |
| `cv-export` | Content validity: Export |
| `long-structure` | Longitudinal: Structure |
| `long-quality` | Longitudinal: Quality |
| `long-score` | Longitudinal: Score |
| `long-export` | Longitudinal: Export |
| `ema-import` | EMA: Import |
| `ema-compliance` | EMA: Compliance |
| `ema-aggregate` | EMA: Aggregate |
| `ema-export` | EMA: Export |

**As-built today:** only list, config, quality, export, report (survey). Other views are Phase 2+.

---

## 1. Global chrome (all project workspaces)

- App name
- Back to projects
- Project name
- Project type badge (Survey / Content validity / Longitudinal / EMA)
- Primary tabs (by type)
- Theme toggle light/dark (Phase 1)
- Plan badge Free/Pro (Phase 1)

### Shared state

| State | Scope | Behavior |
|-------|--------|----------|
| activeDatasetId | Project | Same sheet when switching tabs |
| excludedRows / droppedItems | Active matrix | Shared across Quality, Configure grid, Export, Report |
| scoreMode sum/mean | Dataset | Persists across tabs |
| highlightRowIndex | Session | DQ jump to LiveGrid row |

---

## 2. Project list

| Action | Result |
|--------|--------|
| New project | Modal: name + project type |
| Open | Restore project; default tab by type |
| Delete | Confirm; cascade delete project data |
| Backup project | Download a project backup file (warns it contains raw data) |
| Restore from backup | Choose a file, validate, import as a new project (never silently overwrite) |
| Delete all my local data | Confirm (offers backup first); clears all local tables |
| Empty state | CTA New project |

Free Phase 1: block creating a 3rd project with a clear limit message. (Limits are enforced in the client; see ADR 0004.)

---

## 3. Survey scoring — workbench (Bolt ditto)

### 3.1 Tab: Configure and Score

**Mandatory layout: split workbench**

```
Tabs: Configure | Data quality | Export | Report
Sheet tabs + Import + Templates
+----------------------+-------------------------------+
| LiveGrid             | Side panels                   |
| always visible       | Import / sheets               |
| grouped headers      | Column roles ID/demo/item     |
| exclude per row      | Scale groups + unassigned     |
| highlight from DQ    | Response scales               |
| sum/mean scores      | Interpretation bands          |
|                      | Run scoring / History / Undo  |
+----------------------+-------------------------------+
```

**LiveGrid:** grouped headers by subscale; exclude toggle; show-excluded filter; score columns; highlightRowIndex scroll.

**Import:** file -> multi-sheet queue -> Import preview (header row, data starts on row, optional remove empty rows default OFF, disable if count 0) -> confirm -> demographics auto-detect.

**Columns:** toggle demo/item; ID section; mark all items; search.

**Scales:** add subscale (scroll to assignment); assign items; reverse per item; sum|mean|custom formula; zero subscales => Overall Scale of all non-demo items.

**Response scales:** numeric min/max OR categorical label map; Likert presets.

**Bands:** name, min, max, color; suggest/validate.

**Templates:** save/apply with match report and aliases; link/unlink; Free max 2; must support overall-only configs.

**Scoring:** run scoring; respect exclusions. Strict by default (any missing item ⇒ scale score missing). Optional proration opt-in (20/25/50%, default 20%); prorated Sum = observed mean × number of items; counts all missing items (ADR 0007).

**History:** action log + undo; autosave; flush before sheet switch.

### 3.2 Tab: Data quality

Compute missingness (unexpected vs allowed), out-of-range, response bias (straight-line, extreme, midpoint, low variance), outliers on row means (IQR + z), normality (Shapiro, skew, kurtosis, histogram + normal curve).

Flagged table; Exclude; Exclude all TOGGLE; shared excludedRows; click row -> highlight; Continue to export.

Defaults (strictly-greater flag for missingness; see `scientific-spec.md` §2): unexpectedMissingPct 20, longstringMin 6, extremeRate 0.80, midpointRate 0.70, lowVarianceFraction 0.05, zscoreThreshold 3, minValidItemFrac 0.50.

Allowed non-response defaults: N/A family text + sentinels -99,99,999,-999,77,88.

**Reliability panel (in the Data quality tab, below the flagged table):** per scale (subscale and overall), show Cronbach's α, n complete / k, and a per-item table: α if item deleted and corrected item–total r. Uses the shared exclusions. Shows "not computable" with the reason when k < 2, n < 2, or total variance is 0. No verbal labels. If α < 0, note that an item may need reverse-keying. See `scientific-spec.md` §3.

### 3.3 Tab: Export

Summary counts. Drop excluded OR keep with yellow highlight.

Cards CSV+Excel: Cleaned Raw; Items Only; Scored Data; Scores + Demographics; Scores only (no interpretations).

Disabled scored cards explain why.

### 3.4 Tab: Report

Individual: select participant, scores, bands, interpretation draft (not a diagnosis).
Sample: composition, scale stats, band distribution, summary draft.

---

## 4. Content validity (Phase 2)

New project type -> Data | Results | Export.

**Data:** import expert matrix; map item/experts/dimensions; dimension rows or inline labels not scored; value mapping; empty default 0 toggle treat-as-1; exclude experts; Analyse.

**Results:** CVR or Aiken V, critical values, Accept/Drop; drop rejected items; re-analyse.

**Export:** full matrix; kept items; retained item list.

---

## 5. Longitudinal L1 (Phase 4)

**Structure:** person ID + wave key; map repeated items; reuse scoring template.
**Quality:** missingness by wave; attrition flags.
**Score:** same subscales per wave; long/wide grid toggle.
**Export:** long; wide; attrition table.

---

## 6. EMA helpers (Phase 5)

**Import:** id, timestamp, items.
**Compliance:** rates, gaps.
**Aggregate:** bins, person-means, within-person centering exports.
**Export:** beep-level cleaned; compliance; aggregates.

Not included: mobile capture, push notifications.

---

## 7. Cross-cutting

Free limits modal on exceed. Optional first-run tour. Visible errors only (no silent import fail).

---

## 8. Survey ditto acceptance (builder)

1. Configure = LiveGrid + side config simultaneously
2. Multi-sheet import + preview
3. Subscales, reverse, sum/mean/custom, bands, overall path
4. Templates match feedback
5. DQ flags + default thresholds + charts
6. Exclusions shared across grid, DQ, Export, Report
7. Export shapes with drop vs keep
8. Report individual + sample drafts
9. Reliability panel (α, α-if-deleted, item–total r) agrees with Fixture A
10. Backup / restore / delete-all work and warn about raw data

Expansions must not break survey paths.


## 9. Quick Run (new addition; needs UI approval at build time)

**Entry:** a "Quick Run" action on the project list (and offered after saving a template). It does not replace the guided workbench.
**Flow:** (1) upload file(s) → import preview as usual; (2) choose a saved template (match report shown: matched vs unmatched columns; the user must resolve unmatched required columns); (3) choose cleaning rules, each a visible checkbox with its threshold: exclude straight-liners, extreme responders, out-of-range rows, rows with missing above X%, row-mean outliers (IQR or z-score); nothing is on by default except a preview of how many rows each rule would exclude; (4) choose outputs: scored CSV/Excel, diagnostics report workbook, cleaning log; (5) **Run** → summary of included/excluded counts per rule → downloads; (6) "Open in workbench" to inspect or change anything.
**Rules:** every automatic exclusion is logged with its reason; the template never supplies demographics or data-quality verdicts; there is **no rule that removes observations to improve normality**.
**Reports:** the diagnostics workbook has sheets for descriptives (per item and scale), reliability, normality (Shapiro–Wilk, Lilliefors KS, skew, kurtosis), response quality, missing data, and exclusions.
