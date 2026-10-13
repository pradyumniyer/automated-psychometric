# ADR 0010: Project-type registry (the seam that avoids a "big rewrite" later)

**Status:** Accepted.
**Context:** The survey-scoring workflow (Configure · Data Quality · Export · Report) is one *kind* of project. Content validity, longitudinal, EMA and qualitative projects will need different tabs, data tables, import steps and exports. If the shell hard-codes the survey tabs (as the prototype's `App.tsx` does), adding types forces a major refactor.
**Decision:** Build a small registry from the start. Each project type declares: `id`, display name, the tabs it shows (label, route, component), its Dexie tables/repositories, its import handler, its export handlers, and its entitlement requirement. The shell (project list, header, routing, entitlements, backup/restore, theme) knows only the registry.
- The **survey_scoring** type is implemented through the registry with **exactly the existing UI** (UI freeze).
- New types add an entry plus their own screens; they do not touch survey code.
- Shared services (file import/parsing, grid, exclusions, export writer, templates, history, backup) live outside any one type so new types reuse them.
**Why:** this is the cheap, early decision that turns "add a project type" into additive work. It does not need new UI now.
**Consequence:** a later *visual* redesign remains possible but is optional and separate from adding features. Shell-level UI changes (navigation for multiple types) get designed when the second type is planned.
