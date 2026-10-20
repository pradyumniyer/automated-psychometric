# Handoff for the next Claude chat (written 20 Oct 2026)

## How to start the new chat
1. Upload this file plus `AGENT_PROMPTS.md`, `FIX_LIST.md`, `PROGRESS.md`, `RESPONSE_SCALES.md`, `UX_PRINCIPLES.md` (and `fixture_words.csv` if useful).
2. Say: "Read HANDOFF_CLAUDE.md first, then PROGRESS.md. Do not update docs until I say so."
3. The first thing to settle: the owner looks at the mockup of the new Response scales card (five scenarios, shown in the previous chat; the design is written down in `RESPONSE_SCALES.md` section 15). If they approve, the prompt P2c-3 in `AGENT_PROMPTS.md` is ready to send. Ask at most one question.

## Your role and the owner
- You are the owner's architect, spec writer, reviewer, prompt writer and UI/UX design expert (also entrepreneur and business lead for the product).
- The owner is Pradyumn, an MSc Psychology (HRDM) student, not a developer. Keep answers plain and step by step; push back honestly when he is wrong; ask at most one question at a time; write complete, self-contained prompts he pastes exactly; never put secrets or real respondent data in chats; decide dependency additions with him first.
- Do not update docs while a design is being discussed. Update them only when he says to, after decisions are final (he wants to avoid burning tokens on repeated rewrites).
- UI decisions: no numbering on the top tabs or left steps; no sticky bottom next-step button; he prefers simple, elegant, professional screens where every fact appears once and controls appear only when relevant.

## The product
Psychometric Prep (working name): a browser app that takes raw questionnaire exports and produces clean, scored, analysis-ready data (import, configure subscales / reverse items / scoring / bands, data quality, export, report). Local-first: respondent data stays in the browser (IndexedDB via Dexie). Later: accounts and billing (Pro 300 rupees per month or 3,000 per year placeholders), opt-in encrypted cloud copy, content validity, item analysis, longitudinal, EMA. The UI is frozen to the original Bolt app except for owner-approved changes.

## Repo, rules, tools
- Repo (public): `pradyumniyer/automated-psychometric`, main working branch `local-first-rebuild`, local folder `D:\automated-psychometric`. Docs in `docs/`; specs `scientific-spec.md`, `TEST_FIXTURES.md`, `DATABASE.md`, `TRD.md`, `DECISIONS.md`, `decisions/`, `IMPORT_DETECTION.md`. Standing agent rules: `.github/copilot-instructions.md`, `CLAUDE.md`, `docs/PROJECT_RULES.md`. Test data: `docs/fixtures/fixture_A*.csv/json` (verified against jamovi) and `fixture_words.csv` (to be added to `docs/fixtures/`).
- Builders: Codex in VS Code ("Work locally"), model GPT-5.6 Luna at medium reasoning (GPT-6.1 Sol is NOT available on his ChatGPT Go plan; I checked OpenAI's posts: Astra is the top model, 6.1 Sol near-Astra at a fifth of Astra's price, Luna the cheapest tier and weaker at admitting failures). The GitHub Copilot student plan is a backup: 151 of 200 AI credits used on 19 Oct, resets 1 Nov, 1 credit = 1 US cent, additional budget $0 (he is willing to pay $1-2 with a hard cap if needed).
- Loop: you write a prompt; he creates a branch for it (`git status --short` empty, `git switch local-first-rebuild`, `git pull`, `git switch -c <name>`); the agent works test-first in small local commits and never pushes; he pastes its report; you review (scope, tests, visible behavior changes, risks, claims versus what is on screen); he hand-tests; if approved: `git switch local-first-rebuild`, `git merge --ff-only <name>`, `git push`, `git branch -d <name>`; if rejected: `git branch -D <name>`. The branch steps are at the top of `AGENT_PROMPTS.md`.
- Prompts start with: "Follow the working agreement in `.github/copilot-instructions.md`. Use search to find the lines you need and do not re-read large files such as `src/components/ConfigScreen.tsx`." (that file is huge; re-reading it is what burns credits).

## Regression anchors (must not change unless a prompt says so)
- Fixture A with two subscales (Q3, Q6, Q9 reversed, scale 1-5): P01 Overall 37; status line lists exactly P25, P26, P29, P30; Q4 has one out-of-range value (P26 = 7); Q3 and Q5 each have one special-missing answer (N/A, Prefer not to say). Treated as one scale with no reverse items P01 Sum is 33; with Q3, Q6, Q9 reversed and the range confirmed it is 37 (Mean = Sum / 10 for complete rows).
- Test suite: 833 tests pass at the last P2c-2 commit; lint baseline 3 errors and 4 warnings (all pre-existing, files ConfigScreen, ImportPreviewModal, ProjectList, ui); typecheck, build and `npm audit --omit=dev` pass.
- Word fixture (no subscales): 5-point agreement matched; W01 Sum 13 Mean 2.6; W04 Sum 16 Mean 3.2; Maybe = 3 gives W12 Sum 11; Flip order W04 14; Start at 0 W04 11.

## What is built (see PROGRESS.md for commit hashes)
Math and storage rewritten test-first (scoring, data quality, reliability, normality; Dexie storage; Supabase removed). Batch 1: unscored-rows status line, shared column builder for grid and export, reload keeps your place, opaque # column. Scoring UI: per-subscale Show Sum / Mean / Custom, interpretation column per output with bands per output, Overall scale card (based on sums, means or custom; combine by sum, mean or custom), Overall bands, Summary rows and a Summary sheet / `_summary.csv` that never mixes into the data, bands for decimal scores with "No band". Response scales v2 logic (one `resolveResponse`, range detection with confirm, presets and word variants, widen/missing action with cleaning log) and its UI (cards, confirm range, out-of-range handling, waiting status with Go to button, collapsed cards, automatic one-scale subscale shown in the Subscales step with Rev toggles). Branch `p2c2-codex` holds P2c-2 (commits 50784f9, 530e9a9, 8b50b2c, 2774fd4), not merged.

## Where we stopped
- P2c-2's first version had problems found by his hand test (duplicate mapping UI; typing 0 for Prefer not to say turned the range into 0-0 with 145 warnings; Confirmed did not reset on change; the widen decision did not show until the range was reset). A fix prompt (P2c-2b) was written in chat but is superseded: I do not know whether he ran it (check `git log --oneline -8` on `p2c2-codex`).
- He found my layout too complicated and gave a simpler idea: no preset dropdown (auto-detect), one scale line plus one answers table, Flip order and Start at 0 only for word scales. The design is final in `RESPONSE_SCALES.md` section 15 and the prompt is P2c-3. I flagged holes I closed: wrong preset guess (small "Wrong scale? Change" link), data missing some preset words (show unused words at 0), words with no preset (numbers typed; Flip and Start at 0 appear but look unavailable until all numbered), mode rule (word mode when half of non-special answers are text), amber review state, confirmation chip only for reverse-item subscales, per-row reverse tick removed. These choices are open to his veto after he sees the mockup.

## Roadmap (in order)
1. P2c-3 answers table redesign, hand-test with Fixture A and the word fixture, merge.
2. P2d: Data Quality screen (remove the allowed-non-response editor, counts, thresholds under an Advanced disclosure, plain-language summary).
3. Clarity passes C1 and C2 per `UX_PRINCIPLES.md` (Checks bar and panel, amber cell marks, attention badges without numbers, contextual next-step link in the status bar, (i) tips, first-run checklist, saved indicator, wording pass); write those prompts after P2d.
4. Small fixes (`FIX_LIST.md` backlog): S1 summary rows only for items, scores and Overall (not Age); Summary sheet values start at A1 for jamovi, with notes naming each excluded cell (Excel address, reason, link in the app); UI alert when scores omitted cells; (i) tooltip for summary rows; Overall transparency sentence and "Show these columns" button.
5. P3: F6 subscale builder rework (popup flow, unassigned strip, fix for items assigned to the wrong card with several empty cards, the "One scale / Subscales" choice at the top of the step), F7 normality wording, Q-Q labels, Lilliefors line, reliability section, F8 proration control.
6. P4 Import v2 (`IMPORT_DETECTION.md`).
7. P5 cleanup (lint and audit blocking in CI, list dead code).
8. F11 Report rework: a publication-ready, APA-formatted section (not specified yet).
9. Later: templates and history checks, error boundary, delete-all-data, backup and restore, first free deployment, accounts and billing and cloud resume, ConfigScreen split (also cuts credit use), content validity and other project types; the spec's Overall "Source A" (from all items) and subscale flipping are not exposed yet.
He has not hand-checked yet: Templates, history and undo, the rest of Data Quality, the other Export cards, the Report.

## How to review an agent report (lessons from this project)
- Check scope against the prompt; full test, typecheck, build; lint totals before and after (no new findings); compare the report's claims with his screenshots: agents have three times reported a feature as done that was not on screen (reverse warning, Go to button, widen decision).
- Hand tests must include a freshly uploaded dataset AND the template-applied path AND a reload; a persisted-path regression once slipped past in-memory tests.
- For UI work give a layout or mockup, not only prose; this model misreads loose specs.
- Keep prompts self-contained with expected numbers, separate commits, and "stop for review".
