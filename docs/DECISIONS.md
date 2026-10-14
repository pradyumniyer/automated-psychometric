# Decisions Log

Locked decisions live in `decisions/` as ADRs. **A coding agent must not override a locked decision, and must ask the owner about every OPEN item below before implementing anything that depends on it.**

## Locked
| ADR | Decision |
|-----|----------|
| 0001 | Proration opt-in default 20%; Free template/row/project caps (amended by 0007) |
| 0002 | Statistical conventions (estimators, thresholds, tests shown) |
| 0003 | Local-first storage with Dexie; no server-side grids; stack |
| 0004 | Numeric caps client-side; plan/entitlements server-side from Phase 1h |
| 0005 | Replace the vulnerable `xlsx` npm dependency (options to be approved) |
| 0006 | Project backup file (unencrypted v1) and "delete all my data" |
| 0007 | Proration counts all missing items; strict scoring by default; Sum = observed mean × k |
| 0008 | Interpretation bands matched at the bounds' precision |
| 0009 | Cronbach's α ships in Phase 1 |
| 0010 | Project-type registry in the shell so new project types are additive |
| 0011 | Cloud resume: T2 settings/history sync for all accounts + opt-in encrypted T3 copy |
| 0012 | Overall composition and optional sum/mean outputs |
| 0013 | Quick Run mode; no removing data to improve test results; cleaning log |
| 0014 | Pricing and plan configuration (₹300/mo, ₹3,000/yr placeholders) |

## OPEN: ask the owner
| # | Open item | Needed by | Notes |
|---|-----------|-----------|-------|
| O1 | Payment provider(s): Razorpay (India), Stripe/PayPal (international), or a merchant-of-record service | **Phase 1h** | Needed before billing is built |
| O2 | Final product name and domain | Phase 1e (launch page) | |
| O3 | ~~First paid feature / pricing~~ **Resolved:** Pro ₹300/month or ₹3,000/year (placeholders, configurable); Pro = CV, item analysis, longitudinal, EMA, APA/reporting, template library, higher limits | n/a | International prices and lab licences still open |
| O11 | Feature defaults in `PROJECT_TYPES.md` were **decided by SME recommendation (owner delegated)**. Owner may veto any item before its phase starts | Before each phase | Fixtures for each feature follow |
| O12 | ~~Local vs cloud~~ **Resolved:** hybrid; cloud resume per ADR 0011 | n/a | |
| O4 | Aiken/CVR decision bands and the 0.70 floor; whether to add I-CVI / S-CVI | Phase 2 | spec §4.3 |
| O5 | Static host choice (Cloudflare Pages / Vercel / Netlify) and billing alerts | Phase 1f | |
| O6 | Analytics: none, or a privacy-respecting tool? If any, disclose in the Privacy Policy | Phase 1e | Default: none |
| O7 | ~~Spreadsheet library choice~~ **Resolved:** PapaParse 5.7.0, read-excel-file 9.3.12, write-excel-file 4.1.1; exact versions, npm `xlsx` removed | Phase 0d | Owner approved; two documented CSV parity differences accepted |
| O8 | ~~Overall score~~ **Resolved** (ADR 0012) | n/a | |
| O9 | Custom-formula functions such as `SUM()`/`MEAN()` | After Phase 1 | FORMULA_SPEC F4 |
| O10 | Repo visibility and licensing (private recommended) | Phase 0a | |

## Foundation checklist: "decide now, build when needed"
Status key: **Decided** (in these docs) · **Decide now, build later** (choice made or to be made now; implementation deferred until the phase needs it) · **Open** (needs your input) · **Not yet covered**.

| Area | Status | Where / note |
|------|--------|--------------|
| Local-first storage, no server-side grids | Decided | ADR 0003 |
| Adding project types without a rewrite | Decided | ADR 0010 |
| Security baseline (CSP, upload caps, formula-injection, no `eval`, audit in CI, independent review) | Decided | `security/checklist.md` |
| Tests + known-answer math | Decided | `TEST_FIXTURES.md`, ADR 0002 |
| CI/CD, repo private, lockfile, Dependabot | Decided | IMPLEMENTATION_PLAN Phase 0 |
| Backup / restore / delete-all | Decided | ADR 0006 |
| Free-tier limits and entitlements | Decided (client-side now, server later) | ADR 0004 |
| Accounts and auth | **Build in Phase 1h** | Provider choice (Supabase Auth / Clerk / Auth.js) recorded before 1h; accounts hold email/plan only, never grids |
| Payments | **Build in Phase 1h** | O1; consider a merchant-of-record service vs direct Razorpay/Stripe for global sales tax; get accountant advice first |
| Server-side license check | **Build in Phase 1h** | `GET /api/license` shape in TRD §6 |
| Scalability | Decided | TRD §10: scale = browser memory limits + static CDN; server only handles license/catalog |
| Optional future sync/collaboration | Keep possible | Storage behind repository interfaces so an opt-in, encrypted sync adapter could be added later; not planned |
| Error monitoring and analytics | Open | O6; never capture cell contents |
| Hosting, domain, billing alerts | Open | O5, O2 |
| Product name and branding | Open | App is "Psychometric Workbench"; docs say "Psychometric Prep" |
| Accessibility baseline | Decided | PRD P1-12 |
| Privacy Policy, Terms, DPDP/GDPR posture | Decided in outline; text to be written | PRD §6; get legal review before charging |
| Business entity, GST/tax registration, invoicing | Not yet covered | Needed before taking payments; ask an accountant (not legal/financial advice from this pack) |
| Instrument/template licensing (published scales) | Decided principle: license-safe only | PRD PR05; needs a sourcing plan |
| Support process and feedback channel | Not yet covered | Even a simple email + issue form |
| Pricing validation with real users | Not yet covered | Test the free app with real users before building billing |
| Qualitative-data feature scope | Open | Large separate product area; define a small first feature or defer |
