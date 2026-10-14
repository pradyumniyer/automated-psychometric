# Independent code review (October 2026): how each finding is addressed

`SECURITY-AND-PRODUCTION-RISKS.md` is an independent review of the Bolt prototype. **Every finding must be resolved or consciously deferred.** Finding numbers match the report.

| # | Finding | Where addressed |
|---|---------|-----------------|
| 1, 2 | Anonymous CRUD; cross-project IDOR | Removed by design: no server-side grids (ADR 0003). Server tables hold account/plan/snapshots only, with owner-only RLS and cross-user tests (`DATABASE.md` §4, `security/checklist.md` C, D) |
| 3 | Export formula injection | `TRD.md` §9, checklist B, acceptance J |
| 4 | Vulnerable `xlsx` | ADR 0005 |
| 5 | File-type validation bypassable | `TRD.md` §9: extension **and** file-signature check; drag-and-drop goes through the same validator |
| 6 | Unbounded parsing | `TRD.md` §9 caps; parsing in a Web Worker with cancellation |
| 7 | Path traversal / RCE not found | Keep it that way: no `eval`, test enforces |
| 8, 35 | Whole datasets in the browser; scale | Row caps, virtualized grid, Web Worker for scoring/DQ; server-side compute deliberately not planned (local-first) |
| 9 | N+1 queries | Disappears with local storage; use bulk reads |
| 10, 11 | Non-transactional save and import | Dexie transactions; import writes dataset + config + history atomically (`DATABASE.md`) |
| 12, 19 | No error boundary; hidden export failures | PRD P1-16; acceptance |
| 13 | Stale scoring results | Provenance hashes; stale results blocked (`scientific-spec.md` §9) |
| 14 | Positional exclusions | Stable row IDs (`DATABASE.md`) |
| 15, 16 | Heuristic header / template matching | Heuristics only suggest; user confirms; Unicode normalization (NFKC + case-fold) in matching; low-confidence matches never auto-applied (`APP_FLOW.md`, PRD P1-26) |
| 17 | Locale and mixed values | `scientific-spec.md` §0 numeric parsing; PRD P1-26 |
| 18 | Silent formula failures | `FORMULA_SPEC.md` F5 |
| 20 | Accessibility | PRD P1-12, acceptance (modal semantics, focus trap, Escape, labels, state not by colour alone) |
| 21 | Mobile layout | Desktop browsers are the supported target; phones/tablets best-effort (PRD §6) |
| 22 | Internationalization | English UI in v1; locale-aware number import and dates; translations later |
| 23, 24 | Approximate pnorm / t critical values | Spec §2.6 and Appendix A (A12, A13) |
| 25, 29 | Reliability vs scoring use different value rules | One normalized matrix for every module (spec §0, A14) |
| 26 | α missing-data semantics | Listwise-complete, documented, verified against jamovi (spec §3) |
| 27 | Mahalanobis fragile | Not in the v1 UI |
| 28 | Binary "normal" verdict | Forbidden (spec §2.6) |
| 30, 37 | No statistical tests; metamorphic tests | `TEST_FIXTURES.md` (Fixture A + invariants) |
| 31–34, 36 | Future AI / advanced methods | `PROJECT_RULES.md` rule 17; provenance (spec §9); no raw data to third parties |
| Ops | No docs, observability, backups, CI | IMPLEMENTATION_PLAN Phase 0; `security/checklist.md`; ADRs 0006, 0011 |
