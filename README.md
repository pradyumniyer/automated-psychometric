# Psychometric Prep

Psychometric Prep is a browser-based psychometric workbench for transforming messy questionnaire exports into analysis-ready, scored data. Project, dataset, configuration, exclusion, and scoring data are stored locally in the browser using IndexedDB; respondent data is not sent to a server.

## Run locally

```bash
npm install
npm run dev
```

Open the local Vite URL shown in the terminal to start working in the app.

## Project docs

- [docs/README.md](docs/README.md)
- [CLAUDE.md](CLAUDE.md)

This repo is currently in the local-first rebuild phase; the goal is to preserve the existing product flow while replacing the server-backed storage and architecture with a browser-local, auditable workflow.
