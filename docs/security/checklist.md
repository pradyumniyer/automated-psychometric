# Security & Launch Checklist (v2)

**N/A** = not applicable while grids stay local and there is no multi-tenant response database. Items marked **[NEW]** were added after the October 2026 repo audit.

## A. Data & privacy
| Item | Target |
|------|--------|
| Privacy Policy published and accurate (local processing; any analytics disclosed) | Required before public |
| Terms of Service | Required |
| Cookie notice if non-essential cookies | As needed |
| No storage of response matrices on our servers | **Invariant** |
| No default cloud LLM on raw responses | Required |
| **[NEW]** Disclose that browser storage is unencrypted and visible to others using the same browser profile; provide "Delete all my local data" | Phase 1 |
| **[NEW]** Backup file warns it contains raw data | Phase 1 |
| Account deletion / export for account PII when auth exists | Phase 1h |
| Demographics isolation on export documented | Phase 1 |

## B. Application security
| Item | Target |
|------|--------|
| No secrets in Git or client bundles; `.env.example` documented | Required |
| **[NEW]** Repository private; secrets scan of git history before any public release | Required |
| File import: type allow-list, size cap, parse in memory only | Required |
| **[NEW]** XLSX zip-bomb guard: decompressed-size cap, max sheets/rows/columns | Required |
| XSS: no unsanitized HTML from cells; no `dangerouslySetInnerHTML` on data | Required |
| **[NEW]** Export formula-injection neutralization (cells beginning `=`, `+`, `-`, `@`) in CSV and XLSX | Required |
| **[NEW]** No `eval` / `new Function` (automated test) | Required |
| **[NEW]** `npm audit` in CI from Phase 0; no high/critical advisories at release; lockfile committed; Dependabot | Required |
| **[NEW]** Backup-file import: schema validation, size cap, never executed, never silently overwrites | Required |
| CSP, HSTS, X-Frame-Options / frame-ancestors, Referrer-Policy, Permissions-Policy on host | Ship |
| Verbose errors off in production; error reports never contain cell contents | Ship |

## C. Auth & payments (Phase 1h)
| Item | Target |
|------|--------|
| Proven auth provider; no hand-rolled password crypto | Required |
| Webhook signature verification and idempotent handling | Required |
| Server is source of truth for plan; never trust a client "I paid" | Required |
| Rate limiting on login and expensive APIs | Required |
| **[NEW]** Pro features gated by server `GET /api/license`, not only client flags | Required |
| N/A: IDOR on other users' grids (grids are not on the server) | N/A |

## C2. Cloud resume (ADR 0011)
| Item | Target |
|------|--------|
| Web Crypto only; no custom primitives; key derivation library approved | Required |
| Passphrase and keys never leave the browser; never logged | Required |
| Round-trip, wrong-key, tamper and "no plaintext in network requests" tests | Required |
| Version-conflict handling, no silent overwrite | Required |
| Clear warning that lost passphrase + recovery key = unrecoverable | Required |
| Delete-cloud-copy and account-deletion remove ciphertext | Required |
| Owner-only access + quotas tested | Required |

## D. Multi-tenant DB patterns
| Item | Target |
|------|--------|
| Open anon RLS on survey tables | **Forbidden** (the prototype's Supabase policies must not be carried over) |
| organization_id and cross-tenant tests on any cloud tenant tables | If Team features exist |

## E. Ops & money
| Item | Target |
|------|--------|
| Billing alerts on host and payment provider | Required at ship |
| Staging ≠ production secrets/DB | When a backend exists |
| Backups of server account data | Phase 1h |
| **[NEW]** Independent security review (upload handling, XSS, headers, dependencies) before public launch | Required |

## F. Product integrity / legal
No fake testimonials · no unsupported efficacy claims · no compliance "certification" claims · accessibility baseline · license-safe template library only · APA/results text labeled draft and never fabricated.

## Pre-launch minimum (public beta)
- [ ] Privacy Policy and Terms live and accurate
- [ ] Local-first story true in code (no grid data in any network request)
- [ ] Import/export errors visible
- [ ] `npm audit` clean of high/critical; CI green
- [ ] Upload caps, zip-bomb guard, formula-injection tests passing
- [ ] No cloud grid tables; Supabase grid code removed
- [ ] Security headers verified on the live host
- [ ] Billing alerts set
- [ ] Independent review completed
