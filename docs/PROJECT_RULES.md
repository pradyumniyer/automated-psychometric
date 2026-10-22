# Project Rules — Psychometric Prep (v2)

**Tool-agnostic.** Use with Claude Code, Cursor, Codex, Bolt, or human PRs. At the repo root, `CLAUDE.md` points here.

## What this product does
Browser-based, **local-first** workbench for questionnaire and expert-panel data: import → configure → data quality → score → reliability → export; later content validity, APA tables, longitudinal/EMA helpers. Raw response matrices stay on the user's machine.

## Standing rules
0. **Do not change the UI unless the prompt says so.** The UI started frozen to the live Bolt app (`docs/UI_FREEZE.md`); the owner has since approved specific redesigns (Response scales card, scoring UI, Data Quality, subscale builder) and each approved change is written into the prompt that asks for it. Anything not named in the prompt stays exactly as it is. Refactors must be behavior-preserving. Any other new or changed UI needs explicit approval first.
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

18. **Test on the real screen.** Anything the user can see or click is tested by mounting the real screen (for example `ConfigScreen`) in jsdom over `fake-indexeddb` and driving it with user-event. Never a test-local wrapper that re-implements the handlers (that is how four "fixed" bugs passed their tests and failed on the owner's screen). Every control a change touches is clicked or typed into in at least one test.
19. **Displayed = saved = scored.** A number shown next to an answer must be the number scoring, Data Quality, reliability and export use, also after a reload. No card-local derived values.
20. **No silent wrong numbers.** An answer the app cannot score is named, linked to its cell and offered a decision; a blank score column is explained in plain words.
21. **Generalise.** Real exports are messy and samples are small. No fixture value, column name, respondent id or subscale name in non-test source; edge cases (small samples, many subscales, wide files, mixed columns, special codes, duplicate or missing IDs) are built as synthetic data inside tests. Expected numbers are computed outside the app.
22. **Every scenario runs three ways:** freshly uploaded, after a reload, and through the template-applied path.
23. **State changes are single, functional updates** from one pure module; no two setters in a row, no reading state from a stale closure, no effect that overwrites user choices.
24. **Edits are never lost:** pending saves are flushed on leaving a screen, switching tabs, and page hide.

## Before saying "done"
1. Show lint, typecheck and test output (including audit). Lint baseline: 3 errors, 3 warnings, no new findings.
2. List files changed and why.
3. List anything stubbed, skipped, or assumed.
4. Confirm the current phase's acceptance criteria still hold.
5. List what was proven by automated tests on the real screen and what was NOT checked in a browser (never claim a feature works on screen unless a browser was used).
6. Stop and wait for review.

## Commands
Follow `package.json` in the repo.

## Source-of-truth map
Product scope → `PRD.md` · Phase 1 scope → `PHASE1_BRIEF.md` · Screens → `APP_FLOW.md` · Math → `scientific-spec.md` + `FORMULA_SPEC.md` + `TEST_FIXTURES.md` · Storage → `DATABASE.md` · Stack/security → `TRD.md` + `security/` · Look → `ui-design-brief.md` · Order of work → `IMPLEMENTATION_PLAN.md` · Decisions → `decisions/` + `DECISIONS.md`
