# TRD — Technical Requirements (v2)

**Rule:** Do not change the stack without a new ADR in `docs/decisions/`. This file also contains the former `architecture.md` content (modules, state, scaling).

## 1. Architecture summary
| Layer | Choice |
|-------|--------|
| App type | Single-page application in the browser |
| Core compute | **Client-side only**: import, DQ, scoring, reliability, export, CV math |
| Primary store | **IndexedDB via Dexie** on the user's device |
| Server (from Phase 1h) | Auth, license, subscription webhooks, template catalog metadata only. Never respondent data |
| Hosting | Static host (HTTPS, security headers) for app + marketing pages |

**Forbidden:** any design where respondent row matrices must live in Supabase/Postgres or any server we operate.

```
Browser SPA:  UI (React) → domain services → scientific pure functions
                              ↓
                       Dexie / IndexedDB (projects, grids, configs, exclusions, templates)
   from Phase 1h:       thin API (auth/license, billing webhooks, catalog)  — no response rows
   Static host + CDN for the app and marketing pages only
```

## 2. Stack (locked)
| Concern | Technology |
|---------|-----------|
| Language | TypeScript (strict) |
| UI | React 18+ |
| Build | Vite |
| Styling | Tailwind + CSS variable tokens (`ui-design-brief.md`), dark mode via class |
| Components | Headless (Radix) or shadcn-style, **themed** to the tokens |
| Local DB | Dexie |
| Spreadsheet I/O | **Replace the npm `xlsx@0.18.5`** (known high-severity advisories, no npm fix). Choose per ADR 0005. |
| Routing | React Router |
| Scientific | Pure TS under `src/scientific/`, zero UI imports |
| Tests | Vitest (unit + fixtures); Playwright later for E2E |
| Lint/format | ESLint + Prettier |
| Package manager | npm, lockfile committed |
| CI | GitHub Actions: lint, typecheck, test, `npm audit` (fail on high) from Phase 0 |

## 3. Folder structure (target)
```
src/
  app/          shell, routes, providers
  screens/      Configure, DataQuality, Export, Report, Launch, (CV* later)
  components/   shared UI (LiveGrid, ImportPreview, etc.)
  domain/       services: import, configure, dq, scoring, reliability, export, templates, backup
  scientific/   pure functions + tests (spec + fixtures)
  storage/      Dexie schema, repositories, migrations
  lib/          file-parse helpers, entitlements
docs/
```

## 4. Module boundaries
| Module | Responsibility |
|--------|----------------|
| `import/` | Parse, preview, header detection, empty-row policy, size/format validation |
| `configure/` | Columns, subscales, reverse, demographics, score mode |
| `dq/` | Missingness, outliers, normality aids, bias, exclusions |
| `scoring/` | Sum/mean/custom, bands, proration |
| `reliability/` | Cronbach's α and item diagnostics |
| `export/` | Shapes, CSV/XLSX, yellow excluded, provenance, formula-injection neutralization |
| `backup/` | Project file export/import, delete-all |
| `cv/` | Lawshe, Aiken, mapping (Phase 2) |
| `templates/` | Save/apply; slot limits |
| `reporting/` | APA tables, draft blurb (Phase 3) |
| `longitudinal/` | ID+time, reshape, attrition (Phase 4) |
| `billing/` | Plan gate client-side + server license verify (Phase 1h) |

**Project-type registry (ADR 0010):** the shell (project list, header, routing, entitlements, backup, theme) only knows a registry of project types. Each type declares its tabs/routes, tables/repositories, import and export handlers, and entitlement. `survey_scoring` is the first entry, with the existing UI unchanged. Shared services (import/parsing, grid, exclusions, export writer, templates, history, backup) sit outside any one type.

**Rule:** UI components call services; services call pure scientific functions and the store. No business rules live only in buttons. **Do not build mega-components**: no file over ~400 lines (the existing `ConfigScreen.tsx` is ~1,740 lines with ~42 `useState` calls and must be split).

## 5. Client state model
- Active project + **active dataset** stable across tabs (single source: router/store, not component-local state).
- `excludedRows` shared, persisted in `exclusion_state`, read by Configure, DQ, Export, Report, Reliability.
- `scoreMode` persisted per dataset.
- `configDirty` + flush before dataset switch / tab change.
- Entitlements object (Free defaults in Phase 1) consumed by gating helpers.

## 6. APIs
**Phase 1a–1g: none.** All operations read/write IndexedDB and download Blobs.
**Phase 1h (minimal):** plan amounts and limits come from provider/server configuration (ADR 0014). `POST /api/webhooks/billing` (verify signature, idempotent), `GET /api/license`, `GET /api/catalog/templates`. `GET/PUT /api/projects/:id/snapshot` (ADR 0011). No endpoint accepts or returns respondent matrices **in readable form**; encrypted snapshots are opaque ciphertext uploaded only by explicit user opt-in.

## 7. Auth (phased)
Phase 1a–1g: none. Phase 1h: a proven provider (Supabase Auth, Clerk, Auth.js), never hand-rolled password handling. Purpose: billing and license only.

## 8. Environment variables
None until Phase 1h. Then: public keys only in the client (`VITE_*`), webhook secrets server-side only. `.env.example` documents all. Never commit `.env`.

## 9. Security technical requirements (summary; full list in `security/checklist.md`)
- CSP, HSTS, X-Frame-Options / frame-ancestors on the host; no inline scripts; no `dangerouslySetInnerHTML` on cell values.
- Upload: allow-list of types (CSV, XLSX), **size cap**, **decompressed-size and sheet/row/column caps** for XLSX (zip-bomb guard), parse in memory only.
- Export: **neutralize spreadsheet formula injection**: any cell string starting with `=`, `+`, `-` (when not a number) or `@` is prefixed with an apostrophe/space in CSV and written as a string type in XLSX.
- No `eval` / `new Function` anywhere (test enforces).
- Error reporting (if added) must never capture cell contents.
- Dependencies: lockfile, `npm audit` in CI, Dependabot or equivalent, review before adding any package.

## 10. Scaling philosophy
First bottleneck: browser memory on large workbooks, so row caps, messaging and a virtualized grid. Not first: microservices, queues, multi-region DBs. A paid backend scales only license and catalog traffic.

## 11. Migration from the prototype
0. **Keep the existing UI components and styling** (`UI_FREEZE.md`). This is a re-platforming: replace the data layer, fix the math, split oversized components without changing behavior.
1. Keep scientific utilities that are correct, with Appendix A fixes, behind fixtures.
2. Replace remote grid persistence (Supabase) with Dexie.
3. Remove `@supabase/supabase-js` from the grid path (reintroduce later only for auth/billing if chosen).
4. Re-introduce optional accounts without moving matrices.

## 12. Third-party services (eventual)
Static host (Vercel / Netlify / Cloudflare Pages), Razorpay and/or Stripe, optional error tracking (SPA errors only, never cell contents).
