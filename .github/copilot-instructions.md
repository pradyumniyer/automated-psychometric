Before doing anything, read and follow `CLAUDE.md` and `docs/PROJECT_RULES.md`.
Then follow the prompt you were given; do not work ahead of it.

## Working agreement
- Do not push, create or switch branches (unless the prompt says which branch to stay on), or install/upgrade dependencies.
- Do not change UI components, labels, styling or layout except what the prompt names (owner-approved changes are written into the prompt).
- Write tests first and show the new tests failing before implementation.
- Test what the user sees on the REAL screen: mount the real component (for example `ConfigScreen`) in jsdom with `fake-indexeddb` and drive it with user-event; never a test-local wrapper that re-implements handlers. Recipe: `tests/responseScaleRealScreen.test.ts` and `tests/helpers/realScreen.ts`. Vitest only runs `tests/**/*.test.ts` (use `React.createElement`). Scoring is a manual step (rail step "Scoring", button "Run Scoring"); autosave runs 1 second after the last change, so flush before reloading in a test.
- Click or type into every control you add or touch in at least one test. A control that does nothing is a bug.
- Run every scenario fresh, after a reload, and on the template-applied path. Compute expected numbers outside the app (python or a tiny reference scorer that reads the raw CSV).
- Displayed = saved = scored. No fixture literals in non-test source; build synthetic edge cases inside tests.
- State changes are single functional updates from one pure module; no chained setters, no stale closures, no effects that overwrite user choices.
- Preserve existing exported function names and behavior through adapters.
- Search narrowly; do not reread project guidance already read in this chat; do not re-read `src/components/ConfigScreen.tsx` (about 2,000 lines).
- Do not edit documentation outside the requested scope.
- At completion list: visible behavior changes, assumptions, changed files, tests proven on the real screen, and what was NOT checked in a browser (never claim something works on screen unless you ran a browser). Show lint totals (baseline 3 errors, 3 warnings, no new findings), test counts and run times.
- Run tests, typecheck, and build; show `git status` and `git diff --stat`.
- Make local commits only, then stop for review.
