# Psychometric Prep

Browser-based workbench for turning messy questionnaire exports into analysis-ready, scored data.

**Local-first:** projects, datasets, config, exclusions, and scores live in **your browser** (IndexedDB). Respondent grids are **not** uploaded to a server.

## What it does

1. Import CSV / XLSX (Qualtrics-style headers, Google Forms, multi-sheet workbooks)
2. Mark IDs / demographics; optionally split one wide sheet into several scale sheets
3. Group items into subscales, set reverse items
4. Map response scales (numeric or word labels, specials like “Prefer not to say”)
5. Score (sum / mean / custom), optional proration
6. Data quality checks, export CSV / XLSX

Built for psychometric and survey workflows — not a full SPSS/jamovi replacement.

## Run locally

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

```bash
npm test          # unit tests
npm run build     # production build → dist/
npm run preview   # serve dist/ locally
```

## Closed beta (no accounts)

There is **no login**. Share a deploy URL; each person stores data only on their own device.

- Clearing site data or another browser = data not there
- You never receive their spreadsheets via this app

Beta blurb you can paste when inviting people:

> Psychometric Prep (beta) — score Likert / scale exports in the browser. Your data stays on your device; nothing is uploaded to our servers. Rough edges expected. Reply with what failed and what kind of file you used.

## Deploy (static site)

The app is a static Vite build (`dist/`). Any static host works. Routing uses the **URL hash**, so no special server rewrite rules are required.

### Recommended: Netlify (easiest with GitHub)

1. Push your branch to GitHub (e.g. `local-first-rebuild` or `main`).
2. Sign up at [netlify.com](https://www.netlify.com) with GitHub.
3. **Add new site → Import an existing project →** pick this repo.
4. Settings:
   - **Branch:** the branch you want live (e.g. `local-first-rebuild`)
   - **Build command:** `npm run build`
   - **Publish directory:** `dist`
5. Deploy. You get a URL like `https://random-name.netlify.app`.
6. (Optional) Site settings → Domain management → set a custom domain later.

Every push to that branch can auto-redeploy.

`netlify.toml` in the repo root already sets build + publish.

### Alternative: Cloudflare Pages

1. [dash.cloudflare.com](https://dash.cloudflare.com) → Workers & Pages → Create → Connect to Git.
2. Same settings: build `npm run build`, output `dist`.
3. Deploy.

### Alternative: GitHub Pages

1. Repo **Settings → Pages →** Source: GitHub Actions (or Deploy from branch).
2. Easiest path for this project: use a workflow that runs `npm ci && npm run build` and uploads `dist/`.
3. Site will be at `https://<user>.github.io/automated-psychometric/` — if you use a **project** site, set Vite `base` to `'/automated-psychometric/'` in `vite.config.ts` before building. **Hash routes still work**, but asset paths need the correct `base`.

For a first beta with zero Vite changes, prefer **Netlify** or **Cloudflare** (root URL, `base: '/'`).

## Project docs

| Doc | Purpose |
|-----|---------|
| [docs/README.md](docs/README.md) | Doc index |
| [docs/PRODUCT.md](docs/PRODUCT.md) | Product intent and phases |
| [docs/PROGRESS.md](docs/PROGRESS.md) | Build status |
| [docs/HANDOFF.md](docs/HANDOFF.md) | Where to continue |
| [docs/PROJECT_RULES.md](docs/PROJECT_RULES.md) | Agent / contributor rules |

## Stack

- React + TypeScript + Vite
- Dexie (IndexedDB)
- Papaparse / read-excel-file / write-excel-file (no server-side spreadsheet stack)

## Status

Local-first rebuild of the scoring workbench. Survey scoring path is the v1 focus. Other project types (content validity, longitudinal, EMA helpers) are planned later — see product docs.
