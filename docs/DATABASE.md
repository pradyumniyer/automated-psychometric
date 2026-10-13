# DATABASE — Schema (v2: single source of truth)

**Primary store:** IndexedDB in the user's browser via **Dexie**. Database name `psychometric_prep`. Schema versions with migrations are required.
**Server DB:** only for accounts, billing and catalog from Phase 1h, **never** for respondent or expert matrices.
This file replaces the old `data-model.md`.

## 1. Data boundary
| Data class | Where | Notes |
|------------|-------|-------|
| Response / expert matrices | Local only | Never a required server table |
| Project metadata, configs, exclusions, templates | Local | User-held backup file (section 5) |
| Account email, subscription | Server (from Phase 1h) | Minimal PII |
| Curated template definitions | Server or bundled | Config only, no respondent data |
| Analytics / error reports | Optional | Must never contain cell contents |

## 2. Local tables

### `projects`
| Column | Type | Notes |
|--------|------|-------|
| id | string (uuid) | PK |
| name | string | |
| project_type | string | `survey_scoring` \| `content_validity` \| `longitudinal` \| `ema_helpers` |
| created_at / updated_at | number (epoch ms) | |
| last_tab | string? | UX restore |

### `datasets`
| id (PK) | project_id (FK, indexed) | name | sheet_name? | headers: string[] | rows: JSON (array of row arrays; **one representation, row arrays**) | row_meta? | import_meta? (file name, header_row, data_start_row) | created_at |

### `survey_configs` (one per dataset)
| Column | Type | Notes |
|--------|------|-------|
| dataset_id | string | PK/FK |
| id_columns | string[] | |
| demographic_columns | string[] | |
| item_columns | string[] | |
| response_scale | JSON | `{type: numeric|categorical, min?, max?, label_map?}`; **min/max required to score** |
| subscales | JSON | `[{id, name, items:[{column, order, reverse}], scoring_method: sum|mean|custom, custom_formula?}]` |
| overall_scale | JSON? | used when zero subscales, or optional overall alongside subscales |
| bands | JSON | per scale: `[{name, min, max, color}]` |
| allowed_nonresponse | string[] | text and numeric sentinels |
| proration_enabled | boolean | default **false** |
| proration_max_missing_pct | integer | **20 \| 25 \| 50** (integer percent; never a fraction) |
| dq_thresholds | JSON | overrides of the defaults in scientific-spec §2 |
| updated_at | number | |

### `exclusion_state` (one per dataset)
`dataset_id` (PK), `excluded_row_indices: number[]` (0-based indices into `datasets.rows`).

### `score_results` (cache, optional)
`dataset_id` (PK), `computed_at`, `payload` JSON (per-row scores, band labels, `prorated`, `n_imputed_items`). Always recomputable from rows + config.

### `templates`
`id` (PK), `name`, `kind` (`instrument` \| `import` \| `dq`), `payload` (config snapshot **without rows**; includes proration threshold if the instrument manual prescribes one), `created_at`. Free tier: count ≤ 2, enforced in app logic.

### `cv_datasets`, `cv_configs`, `cv_results` (Phase 2)
- `cv_datasets`: id, project_id, headers, rows, row_types (item|dimension per row), import_meta.
- `cv_configs`: dataset_id (PK), method (`lawshe`|`aiken`), mappings, item_label_column?, expert_columns, dimension_column?, scale_lo/scale_hi (Aiken), alpha (0.05|0.01), empty_as (0|1), excluded_experts, dropped_item_indices.
- `cv_results`: dataset_id (PK), computed_at, payload (CVR/V, critical, decisions).

### `longitudinal_structure` (Phase 4)
dataset_id, person_id_column, wave_column, item_columns[], constant_columns[].
### `ema_config` (Phase 5)
dataset_id, id_column, timestamp_column, item_columns[], bin_rules JSON.

### `history` (undo)
`id`, `dataset_id`, `ts`, `action_type`, `summary`, `undo_data` JSON?. Retain the last N entries per dataset (N set in code).

### `settings` (key–value)
`key` (PK), `value` JSON. Keys: `theme`, `tour_seen`, `schema_version`.

## 3. Relationships
```
projects 1──* datasets;  datasets 1──1 survey_configs;  datasets 1──1 exclusion_state
datasets 1──0..1 score_results;  projects 1──* cv_datasets;  cv_datasets 1──1 cv_configs
templates (standalone);  deleting a project cascades to everything under it
```

## 4. Server schema (from Phase 1h)
Postgres via a proven provider. **No `survey_rows`-style table, ever.**
`users(id, email unique, created_at)` · `subscriptions(id, user_id, plan free|pro|team, status, provider, provider_customer_id, provider_subscription_id, current_period_end?)` · `webhook_events(event_id PK, processed_at)` · `catalog_templates(id, slug, name, field, payload jsonb, is_public)`.
`project_snapshots(id, user_id, project_local_id, kind settings|encrypted, payload jsonb | ciphertext bytea, version int, size_bytes, updated_at)`: owner-only; `settings` payloads contain no cell values; `encrypted` payloads are opaque ciphertext (ADR 0011).
RLS: users read only their own subscription and snapshots; catalog public read. **Never** open anon read/write policies. If any server table ever holds user-scoped data, add cross-tenant tests.

## 5. Backup file (P1-08)
- A single JSON file: `{ format: "psychometric-prep-backup", schema_version, app_version, exported_at, projects: [...], datasets: [...], survey_configs: [...], exclusion_state: [...], templates: [...] }`.
- **Not encrypted in v1.** The export UI warns that the file contains raw response data.
- Import: validate against the schema, enforce a size cap, reject unknown `format`/newer `schema_version` with a clear message, **never execute** anything from the file, and never silently overwrite existing projects (offer "import as new").
- "Delete all my data" (P1-09) clears all Dexie tables after a confirmation that offers a backup first.

## 6. Entitlements (Phase 1)
Hardcoded Free defaults `{maxRows: 500, maxProjects: 2, maxTemplates: 2}` in client code. See ADR 0004 for why this is acceptable in Phase 1 and how plan checks become server-side in Phase 1h.
