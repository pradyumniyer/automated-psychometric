# ADR 0011: Resume your work after a browser wipe (cloud resume)

**Status:** **Accepted** (owner approved the recommended tiers T2 for all accounts + opt-in T3). Details below.
**Context:** The owner wants accounts to include history so a user can resume where they left off, and work to survive deleted browser data. Local-first storage alone cannot do this; a copy must live elsewhere.

## Options (storage tiers)
| Tier | What goes to the server | Survives browser wipe? | Server can read respondent data? | Cost / complexity |
|------|------------------------|------------------------|----------------------------------|------------------|
| T1 Local + backup file | nothing | Only if user kept a backup file | No | Done (ADR 0006) |
| T2 Settings & history sync | scale configs, subscales, bands, templates, exclusion indices, history summaries, file fingerprints. **No cell values** | Configuration yes; user re-attaches the original data file | No | Low |
| T3 Encrypted cloud copy (opt-in per project) | the whole project as **ciphertext**, encrypted in the browser with a key only the user holds | Yes, fully, and across devices | **No** (server stores unreadable blobs) | Medium: key handling, versioning, quotas |
| T4 Plain cloud storage | everything, readable | Yes | **Yes** | Lowest build effort, highest risk and compliance burden. Not recommended |

## Recommended decision
Build **T2 for every account** and **T3 as an opt-in per project** ("Keep an encrypted copy in your account"). Default for new projects: T2 only; the user is shown what each choice means in plain language.

## T3 design rules (for the security review)
- Encryption happens in the browser with the standard Web Crypto API (AES-GCM). **No custom cryptographic primitives.** Any key-derivation library needs approval under rule 6.
- The key comes from a user passphrase (never sent to the server) and/or a recovery key shown once. **If both are lost the data cannot be recovered**, by design. The UI must say so before enabling.
- The server stores: ciphertext, project id, size, version, updated_at. Owner-only access; size and count quotas per plan.
- Versioning: each save carries a version; a stale save is rejected and the user chooses (keep mine / keep cloud / save both). No silent overwrite.
- Restore flow: sign in → list cloud projects → enter passphrase → decrypt into local storage.
- "Delete my cloud copy" and account deletion remove all ciphertext.
- Tests: encrypt/decrypt round trip, wrong passphrase rejected, tampered ciphertext rejected, no plaintext in any network request.

## Why not T4
It contradicts the "data never leaves your device" promise, makes us a holder of readable sensitive data, and expands ethics, legal and breach exposure. If the owner chooses T4 anyway, the privacy copy and security checklist must be rewritten first.

## Consequences
- ADR 0003 stays true for **plaintext**: no readable respondent data on servers. Ciphertext snapshots (T3) are allowed only by explicit user opt-in.
- New server table `project_snapshots` (DATABASE.md §4) and snapshot endpoints (TRD §6).
- Legal review of the wording of the Privacy Policy is needed before launch.
