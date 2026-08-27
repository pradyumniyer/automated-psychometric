/*
# Add dataset_id scoping for independent per-sheet configuration

## Purpose
Previously all configuration tables (demographic_columns, subscale_groups,
response_scales, interpretation_bands, scoring_results, action_history) were
scoped only by project_id. When a multi-tab spreadsheet is imported, each tab
becomes its own dataset row, and each tab must be independently configured
through every step (demographics, subscales, scales, interpretation, scoring).

This migration adds a `dataset_id` column to those six tables so that each
dataset (sheet) has its own independent pipeline.

## Changes

1. New columns added (all nullable for backward compat with existing rows):
   - demographic_columns.dataset_id  (uuid, references datasets.id, ON DELETE CASCADE)
   - subscale_groups.dataset_id      (uuid, references datasets.id, ON DELETE CASCADE)
   - response_scales.dataset_id      (uuid, references datasets.id, ON DELETE CASCADE)
   - interpretation_bands.dataset_id (uuid, references datasets.id, ON DELETE CASCADE)
   - scoring_results.dataset_id      (uuid, references datasets.id, ON DELETE CASCADE)
   - action_history.dataset_id       (uuid, references datasets.id, ON DELETE CASCADE)

2. Backfill existing rows: set dataset_id to the latest dataset for the
   project so any existing single-dataset projects continue to work.

3. Indexes added on dataset_id for query performance.

## Security
- No RLS policy changes. All existing policies remain in place and continue
  to allow anon+authenticated CRUD on these tables.

## Notes
- project_id columns are kept for convenience joins but the application will
  filter by dataset_id for all configuration queries.
- Columns are nullable so the migration is non-destructive and idempotent.
*/

-- 1. Add dataset_id columns
ALTER TABLE demographic_columns ADD COLUMN IF NOT EXISTS dataset_id uuid REFERENCES datasets(id) ON DELETE CASCADE;
ALTER TABLE subscale_groups     ADD COLUMN IF NOT EXISTS dataset_id uuid REFERENCES datasets(id) ON DELETE CASCADE;
ALTER TABLE response_scales     ADD COLUMN IF NOT EXISTS dataset_id uuid REFERENCES datasets(id) ON DELETE CASCADE;
ALTER TABLE interpretation_bands ADD COLUMN IF NOT EXISTS dataset_id uuid REFERENCES datasets(id) ON DELETE CASCADE;
ALTER TABLE scoring_results     ADD COLUMN IF NOT EXISTS dataset_id uuid REFERENCES datasets(id) ON DELETE CASCADE;
ALTER TABLE action_history      ADD COLUMN IF NOT EXISTS dataset_id uuid REFERENCES datasets(id) ON DELETE CASCADE;

-- 2. Backfill: set dataset_id to the latest dataset for each project
UPDATE demographic_columns dc
  SET dataset_id = sub.latest_ds_id
  FROM (
    SELECT project_id, id AS latest_ds_id
    FROM datasets
    WHERE (project_id, created_at) IN (
      SELECT project_id, MAX(created_at) FROM datasets GROUP BY project_id
    )
  ) sub
  WHERE dc.project_id = sub.project_id AND dc.dataset_id IS NULL;

UPDATE subscale_groups sg
  SET dataset_id = sub.latest_ds_id
  FROM (
    SELECT project_id, id AS latest_ds_id
    FROM datasets
    WHERE (project_id, created_at) IN (
      SELECT project_id, MAX(created_at) FROM datasets GROUP BY project_id
    )
  ) sub
  WHERE sg.project_id = sub.project_id AND sg.dataset_id IS NULL;

UPDATE response_scales rs
  SET dataset_id = sub.latest_ds_id
  FROM (
    SELECT project_id, id AS latest_ds_id
    FROM datasets
    WHERE (project_id, created_at) IN (
      SELECT project_id, MAX(created_at) FROM datasets GROUP BY project_id
    )
  ) sub
  WHERE rs.project_id = sub.project_id AND rs.dataset_id IS NULL;

UPDATE interpretation_bands ib
  SET dataset_id = sub.latest_ds_id
  FROM (
    SELECT project_id, id AS latest_ds_id
    FROM datasets
    WHERE (project_id, created_at) IN (
      SELECT project_id, MAX(created_at) FROM datasets GROUP BY project_id
    )
  ) sub
  WHERE ib.project_id = sub.project_id AND ib.dataset_id IS NULL;

UPDATE scoring_results sc
  SET dataset_id = sub.latest_ds_id
  FROM (
    SELECT project_id, id AS latest_ds_id
    FROM datasets
    WHERE (project_id, created_at) IN (
      SELECT project_id, MAX(created_at) FROM datasets GROUP BY project_id
    )
  ) sub
  WHERE sc.project_id = sub.project_id AND sc.dataset_id IS NULL;

UPDATE action_history ah
  SET dataset_id = sub.latest_ds_id
  FROM (
    SELECT project_id, id AS latest_ds_id
    FROM datasets
    WHERE (project_id, created_at) IN (
      SELECT project_id, MAX(created_at) FROM datasets GROUP BY project_id
    )
  ) sub
  WHERE ah.project_id = sub.project_id AND ah.dataset_id IS NULL;

-- 3. Add indexes for dataset_id queries
CREATE INDEX IF NOT EXISTS idx_demographic_columns_dataset_id ON demographic_columns(dataset_id);
CREATE INDEX IF NOT EXISTS idx_subscale_groups_dataset_id ON subscale_groups(dataset_id);
CREATE INDEX IF NOT EXISTS idx_response_scales_dataset_id ON response_scales(dataset_id);
CREATE INDEX IF NOT EXISTS idx_interpretation_bands_dataset_id ON interpretation_bands(dataset_id);
CREATE INDEX IF NOT EXISTS idx_scoring_results_dataset_id ON scoring_results(dataset_id);
CREATE INDEX IF NOT EXISTS idx_action_history_dataset_id ON action_history(dataset_id);
