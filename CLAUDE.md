# Psychometric Prep: instructions for coding agents

Read `docs/PROJECT_RULES.md` first, then `docs/HANDOFF.md`. Build only the current step of `docs/IMPLEMENTATION_PLAN.md`.

Non-negotiables:
- Local-first: respondent data never leaves the user's browser. No server-side grid storage.
- `docs/scientific-spec.md` and `docs/TEST_FIXTURES.md` define the math; write the test first; never edit a test to make it pass.
- Ask before adding dependencies. No `eval`. No secrets in git.
- When a rule is missing or listed as OPEN in `docs/DECISIONS.md`, stop and ask.
- After each step: show lint/typecheck/test/audit output, list changed files and assumptions, then stop for review.
