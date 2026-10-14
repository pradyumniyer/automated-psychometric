# Threat Model (v2)

## 1. Assets
| Asset | Sensitivity | Location |
|-------|-------------|----------|
| Respondent responses, demographics | High | User device |
| Expert rating matrices | High | User device |
| Backup files the user exports | High | User's disk |
| Scale configs / templates | Low–medium | User device; catalog on server later |
| Account email / billing | Medium | Server (from Phase 1h) |
| App source / secrets | High if leaked | Repo, CI, env: never in client bundles |

## 2. Entry points
| Entry | Risk |
|-------|------|
| File import in the browser | Malicious or huge file (zip bomb, memory exhaustion); library vulnerabilities (the current npm `xlsx` has known advisories); XSS if cell text is rendered as HTML |
| Backup-file import | Malformed or malicious JSON; overwriting existing projects |
| Export download | Spreadsheet formula injection when the file is opened in Excel/Sheets |
| Custom scoring formulas | Code execution if `eval` is ever used |
| Auth/API (from Phase 1h) | Credential stuffing, IDOR on account objects |
| Payment webhooks | Forged "paid" events |
| Marketing site forms | Spam, injection |
| Dependencies / supply chain | Compromised or vulnerable packages |

## 3. Adversaries (lightweight)
Another person using the same browser profile · remote attacker probing the static site / future API · abusive scraper · insider mistakes (secrets in Git).

## 4. STRIDE-style notes
| Threat | Mitigation |
|--------|-----------|
| Spoofing | Optional auth later via a proven provider |
| Tampering | Local data is user-controlled; backup schema validation |
| Information disclosure | **Never store grids on a server**; no cell contents in logs, analytics or error reports; CSP; "Delete all my data" for shared computers |
| Denial of service | Client-side size caps; static host bandwidth alerts; rate limits on any future API |
| Elevation | Server-side license checks for Pro features (from Phase 1h) |

## 5. Top risks for this product
1. Accidentally keeping cloud storage of matrices (the prototype pattern). Remove it.
2. Vulnerable or malicious spreadsheet parsing (import is the main attack surface).
3. XSS from rendering sheet text as HTML.
4. Formula injection through exported files.
5. Payment webhook forgery (Phase 1h).
6. Surprise cloud bills (traffic spikes) on the host.
7. Overclaiming privacy/compliance in marketing or the Privacy Policy.
8. Template library copyright / instrument licensing.

## 6. Privacy claims must match code
The Privacy Policy states local processing of uploads for core features. If analytics or error tools are added, disclose them. Never log cell values.
