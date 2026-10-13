# Phase 1 Brief: what we are building first

**One page. This is the scope for the first public release. Everything else waits.**

## Goal
A trustworthy, local-first workbench that takes a messy questionnaire export to analysis-ready, scored, quality-checked files, with reliability, for thesis-sized data, with **accounts, subscriptions and server-side entitlements** from day one, and no respondent data on our servers.

## Included
Survey project type only. Features `S01–S26` and `P1-01 … P1-16` in `PRD.md`:
import (CSV/XLSX, multi-sheet, header/data-start controls) · LiveGrid + Configure workbench · subscales, reverse, overall scale, sum/mean/custom · response scales · bands · scoring (strict default, opt-in proration) · templates (2 free) · history/undo · data quality (missingness, out-of-range, response bias, outliers, normality) · shared exclusions · **Cronbach's α panel** · exports (drop or yellow-keep) · individual + sample report drafts · project backup/restore + delete-all-data · dark mode · launch page, Privacy Policy, Terms · Free caps (500 rows / 2 projects / 2 templates) · **accounts (auth), subscription billing, server-side license/entitlements** · **Quick Run + diagnostics report + cleaning log (may ship as 1.1)** · **overall composition and sum/mean/both outputs** · **Lilliefors KS** · accessibility baseline · security baseline.

## Explicitly NOT in Phase 1
Content validity, Rpb / item analysis, longitudinal and EMA (these follow immediately as Phase 2+, in that order of priority) · APA Word tables · qualitative · HR packs · team features · cloud sync · any server that touches grid data · McDonald's ω, IRT, SEM, factor analysis.

## Non-negotiables
0. **The UI/UX is frozen to the existing Bolt app** (`UI_FREEZE.md`). Phase 1 is a re-platforming and correctness pass, not a redesign.
1. Data stays in the browser. No grid contents in any network request.
2. Math follows `scientific-spec.md`; Fixture A passes (`TEST_FIXTURES.md`) and has been cross-checked in jamovi/R.
3. Configure is always a split workbench: LiveGrid + side panels.
4. Visible errors; no silent failures.
5. Security baseline met and independently reviewed before public launch.

## Definition of done
`acceptance-phase1.md` is fully ticked, CI is green (lint, typecheck, tests, `npm audit` with no high), and the pre-launch minimum in `security/checklist.md` is complete.

## Build order
`IMPLEMENTATION_PLAN.md` Phases 0 → 1a → 1b → 1c → 1d → 1e → 1f.
