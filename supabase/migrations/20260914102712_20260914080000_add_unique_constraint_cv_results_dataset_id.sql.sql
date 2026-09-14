/*
# Add unique constraint on cv_results.dataset_id

## Purpose
The CV Results screen uses `upsert` with `onConflict: 'dataset_id'` to save
analysis results. Without a UNIQUE constraint on `dataset_id`, the upsert
silently fails after the first save for a given dataset — Postgres has no
conflict to detect, so it inserts duplicate rows instead of updating the
existing one.

## Changes
1. Remove duplicate `cv_results` rows if any exist, keeping the most recent
   per `dataset_id` (by `created_at`).
2. Add a UNIQUE constraint on `cv_results.dataset_id` so that `upsert` with
   `onConflict: 'dataset_id'` correctly updates the existing row.

## Security
- No changes to RLS or policies.

## Notes
- This is safe to re-run: the DELETE is a no-op if no duplicates exist, and
  the constraint is added only if it doesn't already exist.
- Existing data is preserved — only stale duplicate rows (artifacts of the
  missing constraint) are removed.
*/

-- Remove duplicate cv_results rows, keeping the most recent per dataset_id
DELETE FROM cv_results a USING cv_results b
WHERE a.dataset_id = b.dataset_id AND a.created_at < b.created_at;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'cv_results_dataset_id_key'
  ) THEN
    ALTER TABLE cv_results ADD CONSTRAINT cv_results_dataset_id_key UNIQUE (dataset_id);
  END IF;
END $$;