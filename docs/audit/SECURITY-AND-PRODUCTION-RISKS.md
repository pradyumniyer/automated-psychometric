# Security and Production Risks

This report consolidates the code review findings for the psychometric workbench. It covers security vulnerabilities and non-security issues that could cause incorrect results, poor usability, outages, or operational problems at larger scale.

## Priority Summary

| Priority | Finding | Main impact |
| --- | --- | --- |
| Critical | No authentication boundary with anonymous CRUD policies | Unauthorized access, modification, and deletion of all data |
| High | Cross-project object tampering | Users can target records outside their project if policies permit it |
| High | Spreadsheet formula injection | Exported data can execute formulas when opened in spreadsheet software |
| High | Vulnerable `xlsx` dependency | Exposure to prototype-pollution and ReDoS advisories |
| High | Client-side full-dataset architecture | Browser freezes, expensive queries, and poor million-user scalability |
| High | Non-transactional auto-save and multi-step writes | Partial data corruption and lost concurrent updates |
| Medium | Unbounded workbook parsing | Memory exhaustion and browser denial of service |
| Medium | File-type validation is advisory only | Arbitrary inputs reach the workbook parser |
| Medium | Stale scoring and positional exclusions | Reports and exports can be incorrect without obvious errors |
| Medium | Missing global error and recovery handling | Blank, stale, or permanently loading screens |
| Medium | Heuristic import/template matching | Silent misclassification and incorrect scoring |
| Low/Medium | Accessibility, internationalization, and mobile limitations | Worldwide users encounter confusing or inaccessible workflows |

## Security Findings

### 1. No authentication boundary with anonymous CRUD access

**Severity: Critical**

[src/lib/supabase.ts](src/lib/supabase.ts#L1-L8) creates a Supabase client with a public anon key, disables session persistence, and contains no sign-in or authorization flow. The migration documents that existing policies allow anonymous and authenticated CRUD in [supabase/migrations/20260723031227_add_dataset_id_scoping.sql](supabase/migrations/20260723031227_add_dataset_id_scoping.sql#L19-L25).

If those policies are deployed as documented, an unauthenticated browser can read, create, modify, and delete projects, datasets, respondent data, scoring results, templates, and history. The anon key is expected to be public; it is not an access-control mechanism.

### 2. Cross-project IDOR and configuration tampering

**Severity: High**

Many operations trust IDs held in browser state. For example, project and dataset reads are selected by client-provided project IDs in [src/components/ConfigScreen.tsx](src/components/ConfigScreen.tsx#L116-L124), while configuration updates and deletes often filter only by a child record ID in [src/components/ConfigScreen.tsx](src/components/ConfigScreen.tsx#L213-L233) and [src/components/ConfigScreen.tsx](src/components/ConfigScreen.tsx#L374-L398). History deletion similarly filters only by action ID in [src/lib/history.ts](src/lib/history.ts#L31-L35).

With permissive policies, a caller who learns another record ID can alter scoring configuration, delete data, or manipulate audit history across projects. Database policies must enforce ownership and parent-child relationships; client-side `.eq()` filters are not authorization.

### 3. Spreadsheet formula injection on export

**Severity: High**

Untrusted imported cell values flow through export handlers in [src/components/ExportScreen.tsx](src/components/ExportScreen.tsx#L199-L224) into `json_to_sheet` and `writeFile` in [src/lib/fileParser.ts](src/lib/fileParser.ts#L292-L301). Values beginning with spreadsheet formula prefixes such as `=`, `+`, `-`, or `@` are not neutralized.

A malicious cell can execute a formula when a victim opens the exported CSV or workbook in compatible spreadsheet software. This is especially relevant because the app handles uploaded data that may be shared with other people.

### 4. Vulnerable SheetJS dependency

**Severity: High**

The app uses `xlsx` for parsing and export in [package.json](package.json#L18-L24). The dependency audit reported high-severity prototype-pollution and ReDoS advisories with no available fix. Uploaded workbooks reach this parser in [src/lib/fileParser.ts](src/lib/fileParser.ts#L30-L49).

Malicious or malformed workbooks may exploit parser weaknesses or consume excessive resources. The dependency should be treated as a release blocker until replaced, upgraded to a verified safe version, or isolated behind a server-side processing boundary.

### 5. File-type validation is bypassable

**Severity: Medium**

The file picker’s `accept` attribute in [src/components/ConfigScreen.tsx](src/components/ConfigScreen.tsx#L876-L878) is advisory. Drag-and-drop sends any file directly to `handleFileSelected` in [src/components/ConfigScreen.tsx](src/components/ConfigScreen.tsx#L1156-L1161), and the parser does not validate extension, MIME type, or file signature.

Arbitrary content can reach the workbook parser, expanding exposure to parser vulnerabilities and resource-exhaustion inputs.

### 6. Unbounded workbook parsing

**Severity: Medium**

[getSheetInfo](src/lib/fileParser.ts#L30-L42) and [getRawSheet](src/lib/fileParser.ts#L45-L49) read the entire file and materialize complete sheets in browser memory. There are no file-size, sheet-count, row-count, or column-count limits. A multi-sheet import repeatedly parses the complete file.

Large or malformed workbooks can freeze the UI, exhaust browser memory, or crash the tab. This is both a security concern and a normal-world reliability problem.

### 7. Path traversal and RCE were not found

The reviewed upload flow uses browser `File.arrayBuffer()` and SheetJS parsing. It does not expose a server filesystem path, shell command, dynamic code evaluation, or an RCE sink. Path traversal and RCE are therefore not confirmed in this client-side flow.

## Scalability and Performance Risks

### 8. Full datasets are loaded and processed in the browser

**Severity: High**

The screens repeatedly use `select('*')` and store complete `rows` arrays in browser state, for example in [src/components/ReportScreen.tsx](src/components/ReportScreen.tsx#L36-L80) and [src/components/ExportScreen.tsx](src/components/ExportScreen.tsx#L35-L80). Scoring, quality analysis, reports, and exports operate over the whole dataset synchronously.

Large datasets will increase download time, memory use, rendering cost, and mobile failure rates. Millions of users also create a database and bandwidth load that this architecture does not control with pagination, server-side aggregation, quotas, background jobs, or caching.

### 9. N+1 database queries

For every subscale, the app separately loads response scales and interpretation bands in Config, Data Quality, Report, and Export. Representative code is [src/components/ConfigScreen.tsx](src/components/ConfigScreen.tsx#L157-L160) and [src/components/ReportScreen.tsx](src/components/ReportScreen.tsx#L66-L78).

Projects with many subscales cause request storms and slow screens. At global concurrency, this increases latency and Supabase connection pressure.

### 10. Auto-save is non-transactional

**Severity: High**

[src/components/ConfigScreen.tsx](src/components/ConfigScreen.tsx#L213-L233) performs a sequence of updates, deletes, and inserts. Individual response errors are not checked, and the operation is not wrapped in a database transaction.

Network interruption or a concurrent edit can leave configuration half-saved. The delete-then-reinsert band flow can temporarily remove valid configuration and can lose another user’s changes. The UI may show “saved” even when one intermediate request failed.

### 11. Multi-step imports can leave partial data

Import inserts a dataset, then inserts demographic rows and history in [src/components/ConfigScreen.tsx](src/components/ConfigScreen.tsx#L284-L340). Cleanup is explicitly handled for one demographic-detection failure, but later failures can leave orphaned or incomplete records.

Refreshing or losing the network during multi-sheet import can produce a partially imported project with no reliable resume or reconciliation flow.

### 12. Missing global error and recovery model

[src/main.tsx](src/main.tsx#L1-L11) mounts the application without an error boundary. Several async loaders ignore errors or leave empty state as the fallback, while exports intentionally swallow exceptions in [src/components/ExportScreen.tsx](src/components/ExportScreen.tsx#L222-L231).

A rendering exception, expired connection, or failed request can leave users with a blank screen, stale data, or an indefinite loading state. There is no consistent retry, cancellation, offline, or reconnect behavior.

## Correctness and Data Integrity Risks

### 13. Stale scoring results can be shown or exported

Report and Export prefer saved scoring results when exclusion state matches, but freshness is not tied to a dataset version or configuration hash in [src/components/ReportScreen.tsx](src/components/ReportScreen.tsx#L112-L147) and [src/components/ExportScreen.tsx](src/components/ExportScreen.tsx#L147-L170).

If data, subscales, response scales, bands, or formulas change without updating the saved result, the app can display or export scores that no longer correspond to the current configuration. This is a silent correctness failure.

### 14. Positional exclusion indexes become invalid

Excluded rows are represented as numeric positions in [src/App.tsx](src/App.tsx#L44-L60) and persisted as `excluded_rows`. Any dataset replacement, row filtering, import reordering, or changed empty-row handling can make those indexes refer to different respondents.

The result can be exclusions applied to the wrong people without an obvious error. A stable row identifier is needed for durable data-quality decisions.

### 15. Header detection is heuristic and can silently misparse data

[detectHeaderLayout](src/lib/fileParser.ts#L109-L176) scores only the first ten candidate rows using English-oriented heuristics. It assumes recognizable variable names, question marks, and word counts.

Multilingual exports, merged spreadsheet headers, numeric question labels, partially blank headers, or metadata rows can cause the wrong row to become the header. The resulting dataset may still look valid while scoring the wrong columns.

### 16. Template matching can silently map the wrong columns

Alias generation and normalization in [src/lib/templates.ts](src/lib/templates.ts#L45-L81) are ASCII-centric and heuristic. Similar names, Unicode variants, duplicate columns, or translated headers can map incorrectly or remain unmatched.

Incorrect mappings affect reverse scoring and subscale assignment. A confidence score does not itself prevent a user from proceeding with a wrong match.

### 17. Locale and mixed-value handling can produce incorrect scores

[src/scientific/scoring.ts](src/scientific/scoring.ts#L20-L52) uses JavaScript `Number()` for numeric values. Locale formats such as `1,5`, thousands separators, localized decimal marks, non-breaking spaces, and spreadsheet date serials can be treated as missing or misinterpreted.

The formula and scoring paths return `null` for unsupported or malformed values, which can hide data loss instead of forcing an explicit correction.

### 18. Custom formula configuration can fail silently

The formula parser in [src/scientific/formula.ts](src/scientific/formula.ts#L1-L156) intentionally supports only a small arithmetic grammar. Invalid formulas, missing columns, null operands, and division by zero become null results. Callers often retain the result without surfacing a row-level explanation.

Users may receive incomplete scores without knowing which rows or formulas failed. Deeply nested or unusually long formulas also add avoidable CPU cost because they run once per row.

### 19. Export failures are hidden

[doExport](src/components/ExportScreen.tsx#L174-L231) catches export exceptions and ignores them. Large datasets, unsupported values, browser download restrictions, or quota errors can therefore look like a successful click with no usable file and no explanation.

## Edge Cases Likely to Break Workflows

- Empty files, one-row sheets, all-empty sheets, and sheets with only metadata rows.
- Duplicate, blank, whitespace-only, or visually identical Unicode headers.
- Very long sheet names, project names, headers, descriptions, and cell values.
- Mixed numeric/text cells, localized numbers, dates, booleans, error cells, and formulas in uploaded workbooks.
- Corrupted or password-protected workbooks.
- Hundreds of sheets or sheets with millions of rows/columns.
- Missing linked templates, deleted child records, or partially migrated rows with nullable `dataset_id`.
- Network loss during import, scoring, auto-save, template application, or export.
- Concurrent edits from multiple browser tabs or users.
- Browser refresh, sleep, navigation, or token expiry during long operations.
- All rows excluded, no item columns, missing response scales, missing bands, malformed scoring results, and zero-variance data.

## Worldwide Usability and Accessibility Risks

### 20. Accessibility gaps

The shared modal in [src/components/ui.tsx](src/components/ui.tsx#L42-L57) does not show focus trapping, focus restoration, Escape-key handling, or dialog semantics. Several icon-only buttons lack accessible labels, including close and delete controls in [src/components/ProjectList.tsx](src/components/ProjectList.tsx#L78-L88). Color and abbreviated labels such as “Excl.”/“Incl.” carry important state in [src/components/LiveGrid.tsx](src/components/LiveGrid.tsx#L130-L143).

Keyboard and screen-reader users may be unable to complete imports, understand row state, or recover from dialogs.

### 21. Mobile and long-content layout failures

The data grid is wide by design, while headers and cells use truncation in [src/components/LiveGrid.tsx](src/components/LiveGrid.tsx#L92-L180). Long translated labels, many columns, and long project or sheet names can become difficult to inspect on small screens. Several dense control rows in [src/components/ImportPreviewModal.tsx](src/components/ImportPreviewModal.tsx#L205-L260) are not designed around narrow viewports.

### 22. Missing internationalization

The app hardcodes English UI text and uses browser locale formatting only for project dates in [src/components/ProjectList.tsx](src/components/ProjectList.tsx#L61-L65). Header matching, numeric parsing, formula references, and demographic heuristics are not locale-aware.

Worldwide users may see confusing dates, fail to import valid local number formats, or receive weaker template matching for non-English instruments.

## Operational and Release Readiness Gaps

The repository has no documented production deployment, authentication, authorization, backup/restore, retention, rate limiting, observability, alerting, migration rollback, or load-testing process. [README.md](README.md#L1-L4) contains only the project title and a Bolt link.

The current verification state also includes:

- Production build succeeds.
- TypeScript check fails because `subscaleStates` is undefined in `src/components/ConfigScreen.tsx`.
- Lint reports 17 errors and 3 warnings.
- `npm audit` reports 7 vulnerabilities, including high-severity `xlsx` and `brace-expansion` advisories and a moderate `esbuild` advisory.
- Dynamic Strix scanning did not reach application testing because Omniroute returned `503 Maximum combo retry limit reached` for chat completions.

## Calculation Accuracy and Statistical Integrity

The application describes its scientific output as “R-accurate,” so these items should be treated as release blockers until verified against trusted reference implementations and published test vectors.

### 23. Distribution functions do not support the advertised R-compatible contract

**Severity: Critical for scientific correctness**

[src/scientific/distributions.ts](src/scientific/distributions.ts#L1-L7) claims that all functions match R to machine precision, but `pnorm` uses the Abramowitz and Stegun 7.1.26 approximation in [src/scientific/distributions.ts](src/scientific/distributions.ts#L52-L76), not R's implementation. The tail branches can lose precision in extreme tails.

`qnorm`, `pnorm`, and `pchisq` accept `_logP` but ignore it in [src/scientific/distributions.ts](src/scientific/distributions.ts#L5-L6) and [src/scientific/distributions.ts](src/scientific/distributions.ts#L52-L53). This is an API mismatch: a caller can believe it requested log probabilities while receiving ordinary probabilities. P-values, confidence intervals, or critical values depending on extreme tails can be wrong.

### 24. Critical-value calculation is an approximation without validation

[tCritical](src/scientific/descriptives.ts#L116-L122) uses a short normal-quantile correction rather than a full Student-t inverse CDF implementation. It is used for 95% confidence intervals in [src/scientific/descriptives.ts](src/scientific/descriptives.ts#L94-L108), where small-sample accuracy matters most. No error bounds or reference tests demonstrate that the approximation is acceptable.

### 25. Reliability analysis handles categorical items inconsistently

The scoring path maps categorical labels through response-scale label maps in [src/scientific/scoring.ts](src/scientific/scoring.ts#L20-L39). However, `runFullAnalysis` builds reliability rows with `Number(rawRows[i][item.column])` in [src/scientific/analysis.ts](src/scientific/analysis.ts#L42-L46). Text responses such as `Agree` become `NaN`, so Cronbach's alpha and item statistics can use zero or too few cases even when scoring correctly mapped those responses.

This creates a direct disagreement between displayed scores and reliability statistics.

### 26. Cronbach's alpha has undocumented missing-data and edge-case semantics

[cronbachAlpha](src/scientific/reliability.ts#L14-L38) uses complete-case deletion across every item. This can discard most respondents for sparse survey data and differs from common software settings that use pairwise or scale-specific missing-data rules. Degenerate scales can return `NaN` or misleading standardized-alpha values. The advertised compatibility with `psych::alpha()` is not demonstrated by automated reference comparisons.

### 27. Mahalanobis outlier detection is numerically fragile

[mahalanobisDistance](src/scientific/outliers.ts#L57-L121) computes and inverts a covariance matrix with hand-written Gauss-Jordan elimination, a fixed pivot cutoff, and no conditioning check, shrinkage, or pseudoinverse path.

Highly correlated items, different measurement scales, large magnitudes, or near-singular covariance matrices can yield unstable distances, empty results, or false outlier flags. The chi-square p-value also relies on assumptions that are not surfaced to users.

### 28. Normality-test p-values and conclusions require independent verification

The Shapiro-Wilk implementation is a hand port in [src/scientific/shapiroWilk.ts](src/scientific/shapiroWilk.ts#L1-L8), while the Lilliefors implementation uses an approximation in [src/scientific/kolmogorovSmirnov.ts](src/scientific/kolmogorovSmirnov.ts#L76-L152). Comments claim R parity, but no golden tests compare results against R across sample sizes, ties, constant data, extreme values, or known distributions.

The selector in [src/scientific/normalityTest.ts](src/scientific/normalityTest.ts#L35-L92) presents a binary `isNormal` result. A non-significant test does not prove normality, and large samples make tiny deviations significant. The UI should not turn a p-value threshold into an unconditional claim that parametric analyses are appropriate.

### 29. Analysis and scoring use different missing-value rules

`scoreDataset` maps values through response scales, including categorical labels, while `runFullAnalysis` converts raw item values with `Number()` in [src/scientific/analysis.ts](src/scientific/analysis.ts#L42-L46). Different modules can therefore use different respondent sets and different values for the same dataset.

Every statistic needs an explicit missing-data policy, and the same normalized data matrix should feed scoring, reliability, descriptives, and outlier analysis.

### 30. Statistical correctness is not protected by automated tests

No scientific test suite or reference fixtures were found for the distribution, scoring, reliability, normality, outlier, or formula modules. Build success cannot detect a wrong p-value or an incorrect confidence interval.

Accuracy gates should include comparisons against R or another independently trusted implementation, known-value tests, tolerance policies, and fixtures covering missingness, ties, constant vectors, extreme magnitudes, categorical scales, reversed items, duplicate names, and large sample sizes.

## Future AI and Advanced-Statistics Upgrade Considerations

### 31. AI must never be the authority for numerical results

AI may explain results, suggest mappings, generate formulas, or help choose analyses, but it must not directly invent or mutate final scores, p-values, confidence intervals, exclusions, or dataset transformations. Deterministic, versioned statistical code should remain the source of truth; AI output should be a proposal requiring validation and explicit user approval.

### 32. Treat AI-generated formulas and code as untrusted input

Uploaded cells, project names, templates, and instructions may contain prompt injection. AI-generated formulas must be parsed by a strict allowlist grammar, type-checked, bounded for length and runtime, and evaluated in a sandbox with no network or filesystem access.

Do not send raw datasets or personally identifiable psychometric data to external model providers by default. Define redaction, consent, retention, regional-processing, tenant-isolation, and provider-training policies before enabling AI.

### 33. Add provenance and reproducibility to every result

Record the dataset revision, normalized-data hash, configuration revision, formula version, statistical-library version, missing-data policy, random seed where applicable, and execution timestamp. AI-assisted suggestions should record the model/provider, prompt/template version, response, approval, and final deterministic transformation.

Without provenance, future AI or statistical upgrades can silently change historical results and make published analyses impossible to reproduce.

### 34. Advanced methods need explicit assumptions and multiplicity controls

Factor analysis, regression, item-response theory, bootstrapping, imputation, Bayesian models, and multiple testing require documented assumptions, sample-size checks, convergence diagnostics, missing-data policies, multiple-comparison correction, and uncertainty intervals. The UI should block or clearly label results when assumptions are unmet instead of silently falling back to another interpretation.

### 35. Statistical computation should move to a controlled service at scale

For large datasets, run calculations in a versioned server-side or worker environment with resource limits, queueing, cancellation, retries, and immutable job inputs. Keep the browser for previews and interactive configuration. This improves auditability, reproducibility, and resource isolation.

### 36. Protect AI and statistics endpoints like data APIs

Future analysis endpoints need authentication, tenant authorization, rate limits, request-size limits, idempotency keys, job ownership checks, output filtering, audit logs, and cost controls. Never allow a model or uploaded prompt to select arbitrary database tables, invoke tools, fetch URLs, execute code, or alter production configuration.

### 37. Add differential and metamorphic tests before extending the model layer

Useful invariants include: reversing an item twice restores the original; row order does not change aggregate statistics; duplicating every observation preserves estimates where mathematically expected; scaling variables transforms covariance and Mahalanobis distances predictably; and a categorical scale mapped to numeric labels matches the equivalent numeric dataset.

These tests catch regressions that ordinary UI tests miss.

## Recommended Release Order

1. Establish authentication and database ownership/RLS policies before handling real user data.
2. Eliminate the vulnerable workbook dependency or isolate and constrain parsing.
3. Add server-side validation, quotas, transaction boundaries, and stable row identifiers.
4. Make scoring versioned and reproducible; block exports when results are stale or invalid.
5. Move large-data processing away from the browser and remove N+1 query patterns.
6. Add error boundaries, retries, user-visible failure states, observability, backups, and load tests.
7. Test multilingual files, malformed workbooks, huge datasets, concurrent editing, keyboard navigation, mobile layouts, and interrupted network operations.
