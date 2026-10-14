# Handoff Guide (v2)

## Reading order for a new builder (human or AI)
0. PRODUCT.md: the product walkthrough (what the app is and does); PROGRESS.md: where the build currently stands
1. HANDOFF.md (this file)
2. PHASE1_BRIEF.md: what is in and out for the first release
3. PROJECT_RULES.md: standing constraints
3a. UI_FREEZE.md: what must not change
4. AS_BUILT.md: what the existing Bolt app does (and its audit findings)
5. APP_FLOW.md: every screen and control
6. PRD.md: feature IDs
7. scientific-spec.md, FORMULA_SPEC.md, TEST_FIXTURES.md: the math and its known answers; PROJECT_TYPES.md for later phases
8. DATABASE.md, TRD.md: storage and stack
9. ui-design-brief.md: look and workbench layout
10. IMPLEMENTATION_PLAN.md: order of work
11. acceptance-phase1.md, security/*, **audit/**: when it is done and safe; `audit/` holds the independent review of the prototype and how each finding is addressed
12. DECISIONS.md and decisions/: locked and open decisions

## Non-negotiables
0. **UI is frozen to the Bolt app** (`UI_FREEZE.md`). Change architecture, not the user experience. Do not redesign screens.
1. Respondent and expert matrices are not stored on our servers (local-first).
2. Survey Configure is a **split workbench** (LiveGrid + panels), not a bare form.
3. Statistics match `scientific-spec.md`, proven by fixtures. Where the old code differs, the spec wins (Appendix A).
4. Free tier: ≤500 rows/dataset, ≤2 projects, 2 templates.
5. Adding project types must not break survey paths.
6. Do not guess where a rule is missing; ask (see OPEN items in DECISIONS.md).

## The existing prototype
Repo: `pradyumniyer/automated-psychometric` (React + TypeScript + Vite + Tailwind + Supabase, built with Bolt). It is a useful **reference and a source of reusable scientific code**, but it stores grids in Supabase with open anon policies, has no tests, and has known math differences. Treat it as transitional (see TRD §11).

## Ditto definition (survey)
APP_FLOW §8. If the LiveGrid is not visible beside the config panels, it is not a successful recreation.

## Briefing an AI coder (paste this as the first message)
> Read CLAUDE.md, docs/PROJECT_RULES.md, docs/HANDOFF.md, docs/PHASE1_BRIEF.md and docs/IMPLEMENTATION_PLAN.md. Do not write code yet. Tell me what you understood, what is ambiguous or conflicting, and your plan for step 0a only. Then wait for my approval. After each step, show lint/typecheck/test/audit output and stop.
