# ADR 0001: Proration defaults and template gating

**Status:** Accepted. **Amended by ADR 0007** (what counts as missing; strict scoring when proration is off; Sum = observed mean × k).

## Context

Users need person-mean (proration) for occasional missing Likert items when scoring. Free unlimited templates risk non-conversion and library abuse.

## Decision

### Proration
- Opt-in only (default off).  
- Applied per subscale / overall scale. (Original wording said "unexpected missing only"; superseded by ADR 0007: all missing items count.)  
- Default maximum missing items: **20%** (aligned with Downey & King 1998 and common applied practice).  
- User presets: 20%, 25%, 50% (half-rule, labeled).  
- Prefer score-level proration; optional cell fill with provenance.  
- Above threshold: do not score that scale for that row.  
- Export documents method.

### Templates
- Free: **2** personal template slots + small demos; **≤500 rows per dataset**; **≤2 projects**.  
- Pro: unlimited personal templates + curated academic library (license-safe); higher/unlimited row and project caps.  
- HR/field packs and community templates: Pro / Team later.  
- Templates store configuration only—never respondent matrices.

## Consequences

- Honest methods language; avoids silent heavy imputation.  
- Free tier remains useful for thesis-sized work (≤500 rows) without giving away the catalog.  
- Implementation must enforce slot limits client-side and, when accounts exist, server-side for synced templates.
