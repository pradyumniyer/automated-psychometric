# Project Rules — Psychometric Prep (v2)

**Tool-agnostic.** Use with Claude Code, Cursor, Codex, Bolt, or human PRs. At the repo root, `CLAUDE.md` points here.

## What this product does
Browser-based, **local-first** workbench for questionnaire and expert-panel data: import → configure → data quality → score → reliability → export; later content validity, APA tables, longitudinal/EMA helpers. Raw response matrices stay on the user's machine.

## Standing rules
0. **Do not change the UI.** Layout, labels, styling and flows follow the live Bolt app (`docs/UI_FREEZE.md`). Refactors must be behavior-preserving, shown with before/after screenshots. Any new or changed UI needs explicit approval first.
1. Never commit secrets. Document env vars in `.env.example`.
2. **Never** require uploading respondent matrices to any server as the primary store, and never send cell contents to any third party (analytics, error tracking, LLMs).
3. `docs/scientific-spec.md` wins over existing code for all scoring/DQ/reliability/CV math. If a rule is missing or ambiguous, **stop and ask**; do not invent defaults. Open items are listed in `docs/DECISIONS.md`.
4. **Fixtures first.** For any math change, add or update a known-answer test (`docs/TEST_FIXTURES.md`) before the code. Do not edit tests to make them pass; fix the code. If a test seems wrong, say so and explain.
5. No `eval`, `new Function`, or dynamic code execution. Formulas use the parser in `docs/FORMULA_SPEC.md`.
6. Ask before adding or upgrading any dependency (state what, why, size, license, maintenance status, `npm audit` result).
7. Stack changes require an ADR in `docs/decisions/`.
8. One step of `docs/IMPLEMENTATION_PLAN.md` at a time. Small, reviewable commits on a feature branch. Do not start the next step until the current one is approved.
9. No file over ~400 lines; no business rules only inside UI components.
10. Every async action has pending / success / error states. No silent failures. No infinite "Loading…".
11. Every new API endpoint (from Phase 1h): input validation, auth, authorization, tests. Webhooks: signature verification + idempotency.
12. Proration is opt-in, default max 20% (ADR 0007). Free tier: ≤500 rows/dataset, ≤2 projects, 2 templates.
13. APA/results text is **draft only**, built from computed numbers; never fabricated statistics.
14. Template libraries: license-safe instruments only.
15. Privacy copy must match the code.
17. **AI is never the authority for numbers.** If AI features are ever added, they only propose (mappings, formulas, explanations); deterministic, tested code computes every score and statistic; outputs need explicit user approval and are logged; no raw respondent data goes to a third-party model by default.
16. **No feature may remove or alter observations merely to improve a statistical test result.** Exclusions are rule-based, logged, and user-approved (ADR 0013). If analytics or error tools are added, disclose them.

## Before saying "done"
1. Show lint, typecheck and test output (including audit).
2. List files changed and why.
3. List anything stubbed, skipped, or assumed.
4. Confirm the current phase's acceptance criteria still hold.
5. Stop and wait for review.

## Commands
Follow `package.json` in the repo.

## Source-of-truth map
Product scope → `PRD.md` · Phase 1 scope → `PHASE1_BRIEF.md` · Screens → `APP_FLOW.md` · Math → `scientific-spec.md` + `FORMULA_SPEC.md` + `TEST_FIXTURES.md` · Storage → `DATABASE.md` · Stack/security → `TRD.md` + `security/` · Look → `ui-design-brief.md` · Order of work → `IMPLEMENTATION_PLAN.md` · Decisions → `decisions/` + `DECISIONS.md`
