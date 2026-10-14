# ADR 0005: Replace the npm `xlsx` dependency

**Status:** Accepted; library choice approved by the owner on 2026-10-14.
**Context:** the repo uses `xlsx@^0.18.5` from npm. `npm audit` reports high-severity advisories (prototype pollution; ReDoS) and no fix on npm. File import is the app's main attack surface.
**Decision:** do not ship the npm `xlsx` build. In step 0d the agent presents options and gets approval. Candidates to evaluate: (a) SheetJS's officially maintained builds distributed outside npm (verify current version, license, install method); (b) a combination such as a CSV parser plus a maintained XLSX reader/writer. Evaluation criteria: no high advisories, maintained, can write per-row fill colors (yellow excluded rows), supports multi-sheet read, license acceptable for a commercial product.
**Mandatory regardless of library:** file type allow-list, size cap, decompressed-size and sheet/row/column caps, parse in memory only, formula-injection neutralization on export, tests for all of these.

**Selected libraries:** `papaparse@5.7.0`, `read-excel-file@9.3.12`, and `write-excel-file@4.1.1`, installed with exact versions. All three packages declare the MIT license. The npm `xlsx` package is removed.

**Approved parity differences:** PapaParse decodes the UTF-8 accent/Devanagari fixture correctly where the previous reader recorded mojibake, and keeps the ISO date `2024-02-29` as text where the previous reader coerced it to an Excel serial. The owner approved both differences on 2026-10-14; the expected legacy corpus remains unchanged and tests assert these explicit new outputs.
