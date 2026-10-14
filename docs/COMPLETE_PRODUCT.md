# Complete Product Plan: Beyond Bolt

> **v2 note:** The first release is scoped by `PHASE1_BRIEF.md`. Storage is Dexie/IndexedDB (ADR 0003). Math follows `scientific-spec.md`. Reliability (Cronbach's α) is part of Phase 1. This file is the long-term vision and is not a build instruction for later phases until earlier ones are stable.

**Foundation:** `AS_BUILT.md` (what ships in the current GitHub/Bolt app).  
**Goal:** One coherent advanced product that **keeps** the workbench UX (LiveGrid + side panels, multi-sheet import, DQ engine, templates, reports) and **adds** every parked capability in a way that does not collapse into unrelated tools.

**Principle:** Same shell, **project types** and **optional modules**—not a second app for each idea.

---

## 1. Product identity (locked)

**Name (working):** Psychometric Prep  

**One sentence:** Local-first workbench that turns messy survey, expert-panel, and repeated-measures data into analysis-ready files, scored outputs, validity results, and draft reports—without warehousing respondent matrices on our servers.

**What we are not:** Full SPSS/SEM, full EMA collection platform, CAQDAS, or a cloud data lake for raw responses.

---

## 2. Architecture spine (must underpin everything)

| Layer | Direction |
|-------|-----------|
| **UX spine** | Keep Bolt’s **Configure workbench** pattern: LiveGrid + contextual panels; shared `activeDataset`, `excludedRows`, sheet tabs |
| **Data spine** | Migrate grids/configs to **IndexedDB (local-first)**; Supabase only for optional account/billing/catalog later |
| **Science spine** | Pure TS modules + tests (`scientific-spec.md` + as-built DQ/scoring) |
| **Nav spine** | Project list → project type → type-specific tabs |
| **Monetization** | Free: ≤500 rows/dataset, ≤2 projects, 2 templates; Pro: higher caps + advanced modules |

All new features plug into this spine. Nothing new should require “upload the whole matrix to our API to compute.”

---

## 3. Project types (the organizing model)

At **New project**, user chooses type. That choice selects tabs, importers, and scientific modules.

| Type ID | Label | Status | Tabs |
|---------|--------|--------|------|
| `survey_scoring` | Survey scoring / prep | **As-built core** | Configure · Data quality · Export · Report |
| `content_validity` | Content validity | Parked → Phase 2 | Data · Results · Export |
| `longitudinal` | Longitudinal / waves | Parked → Phase 4 | Structure · Quality · Score · Export |
| `ema_helpers` | EMA helpers | Parked → Phase 5 | Import · Compliance · Aggregate · Export |
| `qualitative_light` | Qualitative (light) | Later Phase 6 | Codebook · Tag · Export |
| `table_studio` | APA / table studio | Phase 3 (can be mode inside Report or sibling) | Input · Format · Export |

**Future types** (economics, HR packs) = same engines + **field template packs**, not new cores.

---

## 4. Module map — as-built + extensions

### A. Keep & harden (from Bolt)

| Module | Keep | Hardening |
|--------|------|-----------|
| LiveGrid workbench | Yes | Stable sheet across tabs; exclude-all sync; yellow keep-with-flag; sum/mean persist |
| Multi-sheet import + preview | Yes | Empty row/col UX; data-start-row simplicity |
| Subscales + overall scale | Yes | Templates work with zero subscales |
| Response scales + bands | Yes | — |
| Custom formula scoring | Yes | Documented formula grammar + tests |
| Templates + match/aliases | Yes | Free 2-slot gate; Pro library |
| History / undo | Yes | — |
| DQ engine + charts | Yes | Threshold defaults locked; optional proration |
| Export shapes | Yes | Scores-only; drop/yellow flag |
| Participant + sample reports | Yes | Clear “draft / not diagnosis” |

### B. Add — Content validity (Phase 2)

**Why here:** Same users building instruments; expert matrices are a second data shape, not a different product.

**How it plugs in:**

- New project type → **no** survey LiveGrid of respondents; instead expert-rating grid (can reuse LiveGrid patterns: columns = experts, rows = items).
- **Data tab:** import matrix, header/data-start (reuse import preview ideas), map essential/not or Likert ratings, tag **dimension rows** (full row or inline label cell), allowed missing, exclude experts (low variance / high missing—**reuse DQ bias ideas** on expert columns).
- **Method:** Lawshe **or** Aiken (separate flows or toggle after upload—prefer choose method on Data tab).
- **Results:** live columns sum/ne, CVR or V, critical value, decision (Accept / Drop / reject-refine); drop rejected items (exclusion layer like survey excludes).
- **Export:** full matrix + decisions; kept items; retained item list only.
- **Science:** `scientific/contentValidity.ts` (CVR, Ayre & Scally table, Aiken V + normal-approx V_crit).

**Does not require** survey subscales. Templates later: “CV mapping presets.”

### C. Add — Proration (Phase 1.5 / with survey harden)

- Opt-in on Configure or DQ: person-mean proration per scale, default max **20%** unexpected missing; 25%/50% presets.
- Provenance on export and in report drafts.
- Aligns with academic norms; never silent.

### D. Add — APA / table studio (Phase 3)

**Two entry points (same module):**

1. From **survey Report** tab: generate APA-ish tables from in-app scores/DQ summaries → download Word.  
2. **Standalone:** paste/upload jamovi/SPSS-style output → format (APA 7 defaults + custom font/borders) → Word.

**Draft results-section blurb:** numbers only from supplied/computed data; labeled draft.

**Sister feel:** MyBib-style “choose style → download”—not a full paper writer.

### E. Add — Point-biserial / item helpers (Phase 2, with content validity)

- Where external tools are awkward: reshape to ascending patterns if needed; optional **in-app Rpb** for item–total style workflows.
- Lives under survey **Export** or a small **Items** panel—not a new project type unless it grows.

### F. Add — Longitudinal Level 1 (Phase 4)

**Problem:** Same instrument, multiple waves; users need long↔wide, attrition visibility, score-by-wave—not full growth-curve SEM.

**How it plugs in:**

- Project type `longitudinal`.
- **Structure tab:** declare ID key + time/wave key (or detect); map which columns are repeated items vs constants.
- Reuse **scoring config** (templates!) across waves.
- **Quality:** missingness by wave; attrition flags (present W1 absent W2…); optional reuse bias checks within wave.
- **Score:** score each wave with same subscale definitions.
- **Export:** long format (id, wave, scores…); wide format (id, score_w1, score_w2…); attrition report.

**LiveGrid:** show long or wide view toggle.

### G. Add — EMA helpers (Phase 5) — not a full EMA app

**In scope:**

- Import beep-level or diary CSVs (id, timestamp, items).
- Compliance: response rate by day/person; gap detection.
- Time binning (e.g. morning/afternoon); within-person centering exports.
- Simple aggregation (person-mean of EMA items) for multilevel prep.
- Within-person DQ (straight-lining across beeps).

**Out of scope:** scheduling notifications, mobile data collection, GPS.

EMA can **share** longitudinal ID+time concepts; keep type separate so UX copy stays honest (“helpers for EMA files,” not “EMA platform”).

### H. Add — Qualitative light (Phase 6)

- Codebook, tag segments, export coded table.
- Not NVivo. Only if capacity after quantitative spine is solid.

### I. Add — Platform / trust (parallel phases)

| Item | Phase |
|------|--------|
| Local-first IndexedDB migration | 0–1 (before heavy Pro) |
| Free/Pro limits enforcement | 1 |
| Dark mode | 1 |
| Launch + PP/ToS accurate to local-first | 1 |
| Security checklist (upload validation, CSP, no secrets, rate limits on any API) | 1→3 |
| Auth + billing webhooks | 3 |
| Curated academic template library | 3 |
| HR/education field packs | 6 |
| Team / community templates | 6 |

---

## 5. Unified navigation model

```
Launch → Projects
         ├─ New → type picker
         │         ├─ Survey scoring     → Configure | Quality | Export | Report
         │         ├─ Content validity   → Data | Results | Export
         │         ├─ Longitudinal       → Structure | Quality | Score | Export
         │         └─ EMA helpers        → Import | Compliance | Aggregate | Export
         └─ Open existing (tabs restore by type)
```

**Shared chrome:** project name, type badge, theme toggle, plan badge, Help/tour entry.

**Shared primitives (build once):**

- File import preview (header/data-start/empty rows)  
- LiveGrid (columns, groups, exclude, highlight, sticky header)  
- Exclusion set model  
- Export card pattern (CSV/Excel, disabled reasons)  
- Template save/apply engine  
- Draft disclaimer component  
- Scientific panel (thresholds, method footnotes)

---

## 6. Data model evolution

**Keep conceptual entities from as-built**, move storage to local:

- projects (+ `project_type`)  
- datasets / matrices (survey rows **or** expert rows **or** wave/EMA rows)  
- configs (survey subscales **or** CV mapping **or** longitudinal structure)  
- exclusion / drop sets  
- results caches (scores, CVR table, compliance summary)  
- templates (typed by project_type)  
- action history  

**Server (Pro only):** users, subscriptions, catalog_templates—**never** respondent/expert matrices as product DB.

---

## 7. Phased delivery (complete product path)

| Phase | Name | Outcome |
|-------|------|---------|
| **0** | Local-first spine | IndexedDB; app works offline for core path; AS_BUILT UX preserved |
| **1** | Survey excellence | Fix exclusion sync, import UX, templates+overall scale, proration, free caps, dark mode, launch/legal, scores-only export |
| **2** | Content validity | Full Lawshe + Aiken project type on same grid/export primitives |
| **3** | Pro magnets | APA tables+blurb, Rpb helpers, billing, curated templates |
| **4** | Longitudinal L1 | ID+time, long/wide, attrition, score-by-wave |
| **5** | EMA helpers | Compliance, binning, aggregate exports |
| **6** | Expansion | Qualitative light, HR packs, Team |

**Rule:** Do not start Phase 4 until Phases 0–2 are stable; do not market “EMA platform.”

---

## 8. What “more than the entire Bolt project” means

| Bolt today | Complete product |
|------------|------------------|
| Survey workbench only | + CV + longitudinal + EMA helpers |
| Cloud Supabase grids | Local-first + optional account |
| No entitlements | Free/Pro with honest limits |
| Report drafts only | + APA Word studio |
| One instrument style | Templates + field packs |
| Security debt | Checklist-driven hardening |
| Implicit methods | Documented scientific-spec + provenance |

The **differentiation** remains: preprocessing + instrument-quality workflows that jamovi/SPSS/R still assume you’ve already suffered through—plus **privacy-respecting** local compute.

---

## 9. Documentation set

See `README.md` for the current document map. Superseded and merged files: `system-design.md`, `architecture.md`, `data-model.md`, `user-flows.md` (folded into PRD, TRD, DATABASE, APP_FLOW).

## 10. Immediate next documentation tasks

Done in v2: PRD expanded with Phase 1 hardening items; scientific spec revised with fixtures; decisions logged. Remaining: Figma frames for the Phase 1 screens (optional, see `ui-design-brief.md`), and Phase 2+ spec details when those phases approach.
