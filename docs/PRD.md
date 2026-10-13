# PRD — Psychometric Prep (v2, complete product)

**Builder note:** Build in the order of `IMPLEMENTATION_PLAN.md`. Phase 1 scope is fixed by `PHASE1_BRIEF.md`. Statistics follow `scientific-spec.md`. Do not invent cloud storage for respondent matrices.

---

## 1. Overview
Local-first browser workbench for questionnaire, expert-panel, and repeated-measures data: import, configure, quality-check, score/validate, export, draft reports, **without warehousing raw matrices on our servers.**
**Working name:** Psychometric Prep (final brand name is an open decision).

## 2. Users
| Segment | Priority | Needs |
|---------|----------|-------|
| Psychology / social-science researchers and PhD students | **Primary** | Prep, scoring, DQ, reliability, CV, APA tables, honest methods language |
| Methods instructors / small labs | High | Teachable workflow, templates, a free tier for class |
| Consultants | Medium | Speed, exports |
| HR / people analytics | Later (template packs) | Same engine, different templates and labels |
| Clinicians | Careful | De-identified exports; not an EHR |

Tenancy early on: one browser profile, local projects. An account (later) exists only for billing, license and template sync, never for storing grids. No collaboration on our servers in early phases.

## 3. Project types
| Type | Phase | Description |
|------|-------|-------------|
| survey_scoring | As-built / P0–1 | LiveGrid workbench, DQ, score, reliability, export, report |
| content_validity | P2 | Lawshe CVR and Aiken V on expert matrices |
| longitudinal | P4 | ID+wave, attrition, score-by-wave, long/wide export |
| ema_helpers | P5 | Compliance, binning, aggregates (not a full EMA platform) |

## 4. Feature inventory

### 4.1 Survey workbench (must match the Bolt app's behavior; math per scientific-spec)
| ID | Feature |
|----|---------|
| S01 | Project list: create / open / delete |
| S02 | Multi-sheet import queue |
| S03 | Import preview: header row, data start row, empty rows default keep |
| S04 | LiveGrid always visible on Configure beside config panels |
| S05 | Grouped headers by subscale on the grid |
| S06 | Demographic auto-detect + toggle; ID columns; mark all items |
| S07 | Subscales: add, assign items, reverse, delete |
| S08 | Overall scale when zero subscales |
| S09 | Scoring methods: sum, mean, custom formula (`FORMULA_SPEC.md`) |
| S10 | Response scales: numeric, or categorical label map; Likert presets |
| S11 | Interpretation bands with colors; suggest/validate (precision-aware) |
| S12 | Run scoring; persist results; grid shows scores |
| S13 | Templates: save/apply/link; match report; aliases |
| S14 | Action history + undo; autosave; flush on sheet switch |
| S15 | Shared exclusions across Configure, DQ, Export, Report, Reliability |
| S16 | LiveGrid row exclude; show excluded only; highlight from DQ |
| S17 | DQ: missingness (unexpected vs allowed) |
| S18 | DQ: out-of-range |
| S19 | DQ: response bias (straight-line, extreme, midpoint, low variance) |
| S20 | DQ: outliers (Tukey fences; z-score opt-in) on row means |
| S21 | DQ: Shapiro–Wilk, skew, kurtosis, histogram + normal curve |
| S22 | DQ: editable thresholds + allowed non-response lists |
| S23 | DQ: exclude-all toggle |
| S24 | Export: cleaned raw, items only, scored, scores+demo, scores only |
| S25 | Export: drop excluded, or keep with yellow highlight |
| S26 | Report: individual interpretation draft + sample summary draft |

### 4.2 Phase 1: harden and platform
| ID | Feature |
|----|---------|
| P1-01 | Local-first IndexedDB (Dexie) as primary store for grids |
| P1-02 | Free caps: ≤500 rows/dataset, ≤2 projects, 2 templates (client-enforced; see ADR 0004) |
| P1-03 | Dark mode |
| P1-04 | Launch page + accurate Privacy Policy and Terms |
| P1-05 | Proration: opt-in, default max 20%; strict scoring otherwise (ADR 0007) |
| P1-06 | Bug fixes: exclusion sync, sum/mean persistence, sheet stability across tabs |
| P1-07 | Security baseline (see `security/checklist.md`): CSP, no secrets, upload validation and size caps, export formula-injection neutralization, dependency audit in CI |
| P1-08 | Project backup and restore (export/import a project file) |
| P1-09 | "Delete all my local data" control |
| P1-10 | Reliability panel: Cronbach's α, α-if-deleted, corrected item–total r (scientific-spec §3) |
| P1-11 | Light first-run tour |
| P1-12 | Accessibility baseline (keyboard, labels, contrast, not color-only) |
| P1-13 | Custom-formula fixes F1–F3 (`FORMULA_SPEC.md`) |
| P1-14 | Conformance with scientific-spec Appendix A, proven by fixtures |
| P1-15 | Replace the vulnerable spreadsheet dependency (ADR 0005) |
| P1-16 | Loading / empty / error states on every data screen; no silent failures |
| P1-17 | Accounts: sign up / sign in via a proven auth provider; account holds email + plan only |
| P1-18 | Subscription billing (provider per O1) with verified, idempotent webhooks |
| P1-19 | Server-side license/entitlements (`GET /api/license`); Pro features gated by it |
| P1-20 | Cloud resume T2: settings, templates, exclusions and history summaries sync to the account (no cell values) (ADR 0011) |
| P1-21 | Cloud resume T3: opt-in per project end-to-end-encrypted copy; restore after a browser wipe (ADR 0011) |
| P1-22 | **Quick Run:** upload → saved template → rule-based cleaning choices → scored file + diagnostics report + cleaning log (ADR 0013). Last step before the pre-launch gate; may ship as Phase 1.1 without blocking launch |
| P1-23 | Diagnostics report workbook (Excel, one sheet per section: descriptives, reliability, normality, response quality, missing data, exclusions) |
| P1-24 | Overall composition (combine subscale scores with optional flip, or from all items) and optional sum / mean / both outputs (ADR 0012) |
| P1-25 | Kolmogorov–Smirnov (Lilliefors) shown beside Shapiro–Wilk in Data quality |

### 4.3 Content validity + item analysis (Phase 2)
| ID | Feature |
|----|---------|
| CV01 | Project type content_validity |
| CV02 | Expert matrix import + column mapping |
| CV03 | Dimension row or inline label tags (not scored) |
| CV04 | Lawshe CVR + Ayre & Scally critical values |
| CV05 | Aiken V + critical values (verified against the published table) |
| CV06 | Exclude experts; drop items |
| CV07 | Results table with decisions (bands per open decision in spec §4.3) |
| CV08 | Exports: full, kept, item list |
| IA01 | Item analysis panel: difficulty, corrected point-biserial, α if deleted, optional binary-criterion r_pb |
| IA02 | Answer-key scoring mode (blank = incorrect by default) |
| IA03 | Upper–lower discrimination index and distractor frequencies |
| IA04 | Reshaped item-level export |

### 4.4 Reporting and Pro depth (Phase 3)
| ID | Feature |
|----|---------|
| PR01 | APA tables to Word from in-app or pasted output |
| PR02 | Draft results blurb (numbers only; labeled draft) |
| PR04 | (moved to Phase 1: P1-17 to P1-19) |
| PR05 | Curated academic template library (license-safe) |

### 4.5 Longitudinal (Phase 4): L01 ID+wave mapping (1–3 column key) · L02 attrition flags · L03 score by wave · L04 long/wide export · L05 ID-match suggestions · L06 multi-file / sheet-per-wave import · L07 optional change scores
### 4.6 EMA helpers (Phase 5): E01 beep-level import with confirmed time zone · E02 compliance (optional schedule) · E03 time bins and person aggregates · E04 within-person centering · E05 lagged variables

### 4.6b Pre-processing add-ons (see `PROJECT_TYPES.md` §E and `PAINPOINT_BACKLOG.md`; each needs UI approval)
X01 cleaning log + methods paragraph · X02 codebook export · X03 import presets (Qualtrics, Google Forms) · X04 duplicate / speeder / attention-check flags · X05 analysis-ready export pack
### 4.7 Out of scope
Cloud warehouse for raw responses; full SEM/IRT suite; full EMA capture app; CAQDAS; pirated item banks; multi-user live grid editing on our servers; cloud LLM analysis of raw responses by default.

## 5. Pricing (decided direction; amounts are placeholders kept in configuration)
| Tier | Includes |
|------|----------|
| **Free** | Survey prep core, reliability, local history, dark mode, 2 personal templates, ≤500 rows/dataset, ≤2 projects, basic exports |
| **Pro** | Unlimited templates, curated library, content validity, APA tables + blurb, Rpb helpers, longitudinal, higher/unlimited caps |
| **Team (later)** | Community templates, seats, HR/field packs, template sync |
**Pro: ₹300 per month or ₹3,000 per year** (about two months free), plus lab/university licences later and separate international prices (open). Prices live in billing-provider and server configuration, never hardcoded in the client (ADR 0014). Quick Run is free within Free caps; Pro raises limits. The server knows plan/license only, never grids. **Accounts and billing are built in Phase 1**, so a paid tier can start as soon as the first Pro feature (content validity / item analysis, Phase 2) ships.

## 6. Non-functional requirements
| Area | Target |
|------|--------|
| Privacy | Grids never required on our backend; Privacy Policy matches the code |
| Performance | Usable at thesis/lab sizes in-browser; clear limits messaging; virtualized grid |
| Security | No secrets in the client beyond public keys; CSP/HSTS on host; upload validation; dependency audit in CI |
| Accessibility | Keyboard, labels, contrast (WCAG 2.1 AA direction) |
| Reliability | No silent failures on import/export; visible errors |
| Compliance posture | DPDP (India) / GDPR-minded; user is controller of files processed locally; no certification claims |

## 7. Success criteria
- A researcher completes import → DQ → reliability → export without contacting support.
- A methods section can truthfully say data were prepared locally.
- Fixture A passes all tests (`TEST_FIXTURES.md`).
- No cloud grid tables exist; no open anon policies.
- Free users recommend the tool; Pro converts on CV / item analysis + APA + limits.
