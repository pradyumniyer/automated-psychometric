# Psychometric Prep: Documentation (builder pack v2)

**Start here:** [PRODUCT.md](./PRODUCT.md) (what the product is) → [HANDOFF.md](./HANDOFF.md) → [PHASE1_BRIEF.md](./PHASE1_BRIEF.md) → [PROJECT_RULES.md](./PROJECT_RULES.md)
What changed from v1 and what needs your sign-off: [CHANGELOG-v2.md](./CHANGELOG-v2.md)

## Core documents
| Doc | Purpose |
|-----|---------|
| [PRODUCT.md](./PRODUCT.md) | **Product walkthrough: what users see, click and get** |
| [PHASE1_BRIEF.md](./PHASE1_BRIEF.md) | One-page scope of the first release |
| [UI_FREEZE.md](./UI_FREEZE.md) | **The Bolt UI is frozen**; what may and may not change |
| [AS_BUILT.md](./AS_BUILT.md) | What the Bolt app does, plus a code audit |
| [COMPLETE_PRODUCT.md](./COMPLETE_PRODUCT.md) | Full vision |
| [PRD.md](./PRD.md) | Feature IDs, users, pricing, NFRs |
| [APP_FLOW.md](./APP_FLOW.md) | Every screen and control |
| [scientific-spec.md](./scientific-spec.md) | **The math** (wins over old code) |
| [FORMULA_SPEC.md](./FORMULA_SPEC.md) | Custom scoring formula grammar |
| [PROJECT_TYPES.md](./PROJECT_TYPES.md) | Decided flows and defaults: content validity, item analysis, longitudinal, EMA, pre-processing add-ons |
| [PAINPOINT_BACKLOG.md](./PAINPOINT_BACKLOG.md) | Ranked pain points vs effort |
| [TEST_FIXTURES.md](./TEST_FIXTURES.md) + [fixtures/](./fixtures/) | Known-answer tests and data |
| [DATABASE.md](./DATABASE.md) | Storage schema (single source) |
| [TRD.md](./TRD.md) | Stack, modules, state, security tech |
| [ui-design-brief.md](./ui-design-brief.md) | Visual system and workbench layout |
| [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) | Order of work |
| [acceptance-phase1.md](./acceptance-phase1.md) | Phase 1 QA checklist |
| [PROJECT_RULES.md](./PROJECT_RULES.md) | Standing rules for coding agents |
| [roadmap.md](./roadmap.md) | Phases overview |
| [DECISIONS.md](./DECISIONS.md) + [decisions/](./decisions/) | Locked and open decisions |
| [security/](./security/) | Threat model + checklist |

## Folded into other files (the old files were removed)
`system-design.md` → PRD §2, §5–7 · `architecture.md` → TRD §1, §4–5, §10 · `data-model.md` → DATABASE · `user-flows.md` → APP_FLOW.

## Locked decisions
- Local-first grids (IndexedDB/Dexie); no server-side matrices
- Free: ≤500 rows/dataset, ≤2 projects, 2 templates
- Survey Configure = LiveGrid + side panels always
- Proration: opt-in, default max 20%; strict scoring otherwise
- Stats conventions per ADR 0002 (G1/G2, type-7 quantiles, Shapiro–Wilk, Tukey fences)
- CV / longitudinal / EMA = project types on the same spine
