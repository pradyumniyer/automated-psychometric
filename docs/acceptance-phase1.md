# Acceptance Criteria — Phase 1 (Survey prep)

A build is **Phase 1 complete** only if all items below pass. Use this as a QA script.

Free limits (locked): **≤ 500 rows per dataset**, **≤ 2 local projects**, **2 personal templates**. Pro raises or removes these caps.

---

## A. Storage & privacy

- [ ] Creating a project and importing a file does **not** require a backend dataset insert for the grid to work  
- [ ] Clearing site data removes local projects (expected); user can export a project backup file  
- [ ] Privacy copy does not claim “we never see your data” if any analytics/error tool is enabled without disclosure  

## B. Import

- [ ] CSV and XLSX import  
- [ ] Multi-sheet workbook: user can import selected sheets  
- [ ] User can set **data starts on row** (or equivalent clear control); rows above treated as headers  
- [ ] Fully empty rows **inside** data region: kept by default with clear message; optional remove; checkbox disabled if count = 0  
- [ ] Empty columns: same pattern if implemented  
- [ ] Failed import shows a visible error (never silent button reset)  

## C. Configure

- [ ] Mark demographic vs item columns  
- [ ] Create subscale and assign items (focus/scroll to assignment—not only a toast)  
- [ ] Zero subscales: overall/unidimensional path using non-demographic items works  
- [ ] Reverse-keyed items affect scores correctly (see scientific-spec)  
- [ ] Sum/mean toggle **persists** when switching to DQ/Export and back  
- [ ] Active sheet/dataset **persists** across Configure / DQ / Export  
- [ ] Templates: save/apply; blocked at the 2-slot limit with a clear message  
- [ ] Proration control: default off; thresholds 20/25/50; counts all missing items (blank, allowed non-response, out-of-range); prorated Sum = observed mean × k  
- [ ] With proration off, any missing item makes that scale score missing  
- [ ] Scoring is blocked with a clear message until the response scale min/max is set  

## D. Data quality

- [ ] Missingness distinguishes allowed non-response vs blank  
- [ ] Outlier helper (IQR default) runs without crashing on small n  
- [ ] Bias flags use defaults in scientific-spec  
- [ ] Exclude one row → reflected in export counts  
- [ ] Exclude all → toggles off on second click; Config/Export see same exclusions  
- [ ] Click flagged row navigates/highlights that row in the grid when grid is available  

## E. Scoring & export

- [ ] Scoring optional: Cleaned raw and Items only work without scoring  
- [ ] Scored / Scores+demographics / **Scores only** available when config allows  
- [ ] Excluded rows dropped by default; “keep with flag” uses **yellow highlight** in Excel path  
- [ ] Sum/mean columns appear in export when those modes are on  
- [ ] Proration provenance present when used  
- [ ] Filenames sanitized  

## F. UX shell

- [ ] Dark mode available  
- [ ] No infinite “Loading…” without timeout/error  
- [ ] Keyboard can reach primary actions on main flows (basic a11y)  

## G. Science regressions (automated tests preferred)

- [ ] All Fixture A rows and group statistics pass (`TEST_FIXTURES.md`), (Fixture A was already cross-checked against jamovi; see `TEST_FIXTURES.md` §9)  
- [ ] Hand-checkable unit cases in `TEST_FIXTURES.md` §2 pass  
- [ ] Reverse: L=1,H=5,x=2 → x'=4  
- [ ] Proration: 10 items, 2 missing, t=20 → defined; 3 missing → not scored  
- [ ] CVR fixture reserved for Phase 2; not required for Phase 1 exit  

---

## G2. Overall, outputs and normality

- [ ] Overall (combine subscale scores) and Overall (from all items) match the hand-checkable cases in `TEST_FIXTURES.md` §2, including flip  
- [ ] Sum / mean / both outputs generate only when enabled  
- [ ] Lilliefors KS and Shapiro–Wilk both shown and match Fixture A  
- [ ] No control exists that removes observations to improve normality  

## G3. Quick Run (if shipped in Phase 1)

- [ ] Upload → template → rules → run → downloads works end to end  
- [ ] Every automatic exclusion appears in the cleaning log with its reason  
- [ ] Diagnostics workbook contains all sections  

## H. Reliability

- [ ] α, α-if-deleted, corrected item–total r match Fixture A  
- [ ] Reverse-keyed items handled; proration not applied  
- [ ] Respects shared exclusions; shows n complete and k  
- [ ] "Not computable" messages for k<2, n<2, zero variance  

## I. Backup and data control

- [ ] Backup export/import round-trips a project exactly  
- [ ] Import rejects malformed or newer-schema files with a clear message and never overwrites silently  
- [ ] "Delete all my local data" works and offers a backup first  

## J. Security

- [ ] `npm audit` has no high/critical advisories; CI green  
- [ ] Upload type/size/decompression caps enforced; oversized file shows a clear error  
- [ ] Exported cells beginning `=`, `+`, `-`, `@` are neutralized (CSV and XLSX)  
- [ ] No `eval`/`new Function` (test)  
- [ ] No network request contains grid data (verified in browser dev tools)  
- [ ] Security headers present on the live host  

## Explicitly not required for Phase 1 exit

Content validity UI, APA Word export, longitudinal, EMA, accounts/payments, community templates.
