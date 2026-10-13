# ADR 0005: Replace the npm `xlsx` dependency

**Status:** Accepted in principle; **library choice is OPEN (O7).**
**Context:** the repo uses `xlsx@^0.18.5` from npm. `npm audit` reports high-severity advisories (prototype pollution; ReDoS) and no fix on npm. File import is the app's main attack surface.
**Decision:** do not ship the npm `xlsx` build. In step 0d the agent presents options and gets approval. Candidates to evaluate: (a) SheetJS's officially maintained builds distributed outside npm (verify current version, license, install method); (b) a combination such as a CSV parser plus a maintained XLSX reader/writer. Evaluation criteria: no high advisories, maintained, can write per-row fill colors (yellow excluded rows), supports multi-sheet read, license acceptable for a commercial product.
**Mandatory regardless of library:** file type allow-list, size cap, decompressed-size and sheet/row/column caps, parse in memory only, formula-injection neutralization on export, tests for all of these.
