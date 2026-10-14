# ADR 0003: Local-first storage and stack

**Status:** Accepted.
**Decision:** Grids, configs, exclusions, templates, and history live in IndexedDB via **Dexie**. No server stores respondent or expert matrices. Stack: TypeScript, React, Vite, Tailwind, Dexie, Vitest.
**Why:** privacy brand and security (a static app with no data backend has a much smaller attack surface), DPDP/GDPR-minded design, solo-founder ops.
**Consequences:** users must keep backups (ADR 0006); the prototype's Supabase grid storage is removed from the grid path.
