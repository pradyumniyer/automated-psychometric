# UI Freeze: the Bolt app is the visual and interaction source of truth

**Rule:** The look, layout, labels, and workflows of the existing Bolt app are **frozen**. The v2 work changes *architecture* (storage, math, security, structure), not the user experience. A coding agent must **not** redesign, restyle, rename, reorder, or "improve" any screen. Where this file or `ui-design-brief.md` disagrees with the live app, the live app wins.

## What "frozen" means
- Same screens, same navigation (header: `← Projects`, project name, segmented tabs **Configure · Data Quality · Export · Report**), same panels, same wording, same Tailwind theme (primary/secondary palette), same lucide icons, same behavior on every click.
- Source of truth, in this order: (1) the live Bolt app, (2) the existing components in the repo (the agent may run the original app locally to compare), (3) `APP_FLOW.md`. Screenshots are **optional**; the agent captures its own before/after images as proof of no change.
- The grid must stay visible beside the config panels on Configure (the "workbench" layout).
- Refactors (splitting `ConfigScreen.tsx`, replacing Supabase with Dexie, fixing math) must be **behavior-preserving**: same screen before and after, proven with before/after screenshots at each step.

## Screens in the existing app (from the repo)
| Screen | Component | Notes |
|--------|-----------|-------|
| Project list ("Psychometric Workbench") | `ProjectList.tsx` | New project modal: Project Name, Description (optional) |
| Import preview | `ImportPreviewModal.tsx` | Format, Header row (1-based), Question labels row (optional), Data starts on row |
| Configure | `ConfigScreen.tsx` (~1,740 lines) + `LiveGrid.tsx` | Panels: ID Columns, Scale Groups (subscales), Response Scales (+ presets, "Apply first to all"), Interpretation Bands, Scoring, Excluded Rows, Original/Computed Cols, Templates (browse, save current), Undo/history, Saving…/Saved status |
| Data Quality | `DataQualityScreen.tsx` | Allowed non-response & thresholds, Flagged rows (severity, reasons, action), Item missingness summary, histogram + normal curve, Q–Q plot, boxplot, Normality assessment |
| Export | `ExportScreen.tsx` | Export cards, exclusion handling |
| Report | `ReportScreen.tsx` | Select participant, scale scores table, Interpretation Draft, Sample Composition, Scale Statistics, Summary Draft |
| Shared UI | `ui.tsx` | Primitives to reuse; do not replace |

Note: the app's visible name is **Psychometric Workbench**; docs use the working name *Psychometric Prep*. Final name is open item O2.

## Owner-approved changes (hands-on testing, Oct 2026): see `FIX_LIST.md`
Subscale builder popup flow (F6), import summary line with Adjust fallback (Import v2), unscored-rows status line (F2), export column order equals the grid (F3), neutral normality wording and axis formatting (F7), opaque row-number column (F5), reload persistence via routes (F4).

## Changes that ARE allowed
1. **The owner's fix list** (to be provided; each fix is specified individually and approved before building).
2. **Invisible architecture changes:** storage, state structure, file layout, math corrections (the numbers change where the old math was wrong; the screens do not).
3. **New additions**, each designed to *fit the existing visual language* and approved before building:
   | Addition | Where it should live (proposal, to be approved) |
   |----------|-----------------------------------------------|
   | Missing-item (proration) control | Inside the existing **Scoring** panel on Configure |
   | Reliability (Cronbach's α) | A new section on **Data Quality** below the existing sections, same card style |
   | Backup / restore / delete-all | Project list actions and a short notice there |
   | Free-limit messages | Modals using the existing modal style |
   | Dark mode | Theme toggle; no layout change |
   | First-run tour (light) | Overlay only; no layout change |
   | Launch page, Privacy, Terms | Separate pages outside the app shell |
   | Visible error/empty states | Where a screen currently fails silently |
| Quick Run | Project list action + one new screen in the existing style (APP_FLOW §9) |
| Overall composition (source, sum/mean, flip) | Inside the existing Scale/Scoring panels |
| Kolmogorov–Smirnov (Lilliefors) line | Normality assessment in Data quality |
| Diagnostics report workbook | Export tab card |
| Cleaning log + codebook + export pack | Export tab, new cards in the existing card style |
| Import presets | Import preview modal, one extra dropdown |
| Duplicate / speeder / attention-check flags | Data Quality, additional rows in existing thresholds and flagged-rows sections |
| Item analysis panel (Items) | Reachable from Export and Data Quality |
4. **Other project types** (content validity, longitudinal, EMA): UI/UX to be planned **after** the survey flow is faithfully reproduced, reusing the same shell, components and visual language.

## How an agent proves it did not change the UI
1. Before touching a screen, capture reference screenshots (or use `docs/ui-reference/`).
2. After the change, capture the same states and compare. Differences must be listed and approved.
3. Reuse existing components and Tailwind classes; do not introduce a new component library.
