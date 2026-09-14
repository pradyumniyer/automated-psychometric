/*
# Add Content Validity as a second project type

## Purpose
This migration adds support for a new project type — "content_validity" — alongside
the existing "survey_scoring" workflow. Content validity projects store
expert-rating spreadsheets where subject-matter experts judge draft questionnaire
items (Lawshe CVR or Aiken's V methodology).

## Changes

1. `projects` table: add `project_type` column
   - text, NOT NULL, default 'survey_scoring'
   - CHECK constraint limits to 'survey_scoring' | 'content_validity'
   - Existing rows backfilled to 'survey_scoring'

2. New table: `cv_datasets`
   - Stores imported expert-rating spreadsheet data per content-validity project
   - `id` (uuid PK), `project_id` (FK → projects, CASCADE)
   - `file_name` (text), `sheet_name` (text nullable)
   - `headers` (jsonb), `rows` (jsonb) — same pattern as `datasets`
   - `row_count` (int), `col_count` (int)
   - `created_at` (timestamptz)

3. New table: `cv_config`
   - Per-dataset configuration for content validity analysis
   - `id` (uuid PK), `project_id` (FK → projects, CASCADE),
     `dataset_id` (FK → cv_datasets, CASCADE)
   - `method` (text): 'lawshe' | 'aiken'
   - `item_label_column` (text nullable) — which column holds item labels/IDs
   - `expert_columns` (jsonb) — array of column names that are expert ratings
   - `dimension_column` (text nullable) — optional inline dimension label column
   - `row_types` (jsonb) — map of row index → 'item' | 'dimension'
   - `value_mapping` (jsonb) — map of raw value → mapped role/number
   - `scale_lo` (int nullable), `scale_hi` (int nullable) — Aiken scale bounds
   - `alpha` (real, default 0.05) — significance level for Aiken V_critical
   - `empty_as_essential` (bool, default false) — Lawshe empty-cell default
   - `excluded_experts` (jsonb) — array of excluded expert column names
   - `dropped_items` (jsonb) — array of dropped item row indices
   - `updated_at` (timestamptz default now())

4. New table: `cv_results`
   - Per-dataset computed results (stored after Analyse)
   - `id` (uuid PK), `project_id` (FK → projects, CASCADE),
     `dataset_id` (FK → cv_datasets, CASCADE)
   - `results` (jsonb) — full results matrix with per-item CVR/V, decisions, etc.
   - `summary` (jsonb) — aggregate metrics (mean CVR, counts, etc.)
   - `config_snapshot` (jsonb) — snapshot of config at computation time
   - `created_at` (timestamptz default now())

## Security
- RLS enabled on all three new tables.
- Policies: anon + authenticated CRUD (single-tenant, no auth — matches existing pattern).
- No changes to existing table policies.

## Notes
- `project_type` column is additive; existing survey_scoring projects are unaffected.
- The three new tables are only used when project_type = 'content_validity'.
- All jsonb columns store structured data defined by the TypeScript interfaces in src/lib/supabase.ts.
*/

-- 1. Add project_type to projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_type text NOT NULL DEFAULT 'survey_scoring';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'projects_project_type_check'
  ) THEN
    ALTER TABLE projects ADD CONSTRAINT projects_project_type_check
      CHECK (project_type IN ('survey_scoring', 'content_validity'));
  END IF;
END $$;

-- 2. cv_datasets
CREATE TABLE IF NOT EXISTS cv_datasets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  file_name text NOT NULL DEFAULT '',
  sheet_name text,
  headers jsonb NOT NULL DEFAULT '[]',
  rows jsonb NOT NULL DEFAULT '[]',
  row_count integer NOT NULL DEFAULT 0,
  col_count integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE cv_datasets ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_cv_datasets_project_id ON cv_datasets(project_id);

DROP POLICY IF EXISTS "anon_select_cv_datasets" ON cv_datasets;
CREATE POLICY "anon_select_cv_datasets" ON cv_datasets FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_cv_datasets" ON cv_datasets;
CREATE POLICY "anon_insert_cv_datasets" ON cv_datasets FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_cv_datasets" ON cv_datasets;
CREATE POLICY "anon_update_cv_datasets" ON cv_datasets FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_cv_datasets" ON cv_datasets;
CREATE POLICY "anon_delete_cv_datasets" ON cv_datasets FOR DELETE
  TO anon, authenticated USING (true);

-- 3. cv_config
CREATE TABLE IF NOT EXISTS cv_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  dataset_id uuid NOT NULL REFERENCES cv_datasets(id) ON DELETE CASCADE,
  method text NOT NULL DEFAULT 'lawshe',
  item_label_column text,
  expert_columns jsonb NOT NULL DEFAULT '[]',
  dimension_column text,
  row_types jsonb NOT NULL DEFAULT '{}',
  value_mapping jsonb NOT NULL DEFAULT '{}',
  scale_lo integer,
  scale_hi integer,
  alpha real NOT NULL DEFAULT 0.05,
  empty_as_essential boolean NOT NULL DEFAULT false,
  excluded_experts jsonb NOT NULL DEFAULT '[]',
  dropped_items jsonb NOT NULL DEFAULT '[]',
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE cv_config ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_cv_config_project_id ON cv_config(project_id);
CREATE INDEX IF NOT EXISTS idx_cv_config_dataset_id ON cv_config(dataset_id);

DROP POLICY IF EXISTS "anon_select_cv_config" ON cv_config;
CREATE POLICY "anon_select_cv_config" ON cv_config FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_cv_config" ON cv_config;
CREATE POLICY "anon_insert_cv_config" ON cv_config FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_cv_config" ON cv_config;
CREATE POLICY "anon_update_cv_config" ON cv_config FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_cv_config" ON cv_config;
CREATE POLICY "anon_delete_cv_config" ON cv_config FOR DELETE
  TO anon, authenticated USING (true);

-- 4. cv_results
CREATE TABLE IF NOT EXISTS cv_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  dataset_id uuid NOT NULL REFERENCES cv_datasets(id) ON DELETE CASCADE,
  results jsonb NOT NULL DEFAULT '[]',
  summary jsonb NOT NULL DEFAULT '{}',
  config_snapshot jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE cv_results ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_cv_results_project_id ON cv_results(project_id);
CREATE INDEX IF NOT EXISTS idx_cv_results_dataset_id ON cv_results(dataset_id);

DROP POLICY IF EXISTS "anon_select_cv_results" ON cv_results;
CREATE POLICY "anon_select_cv_results" ON cv_results FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_cv_results" ON cv_results;
CREATE POLICY "anon_insert_cv_results" ON cv_results FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_cv_results" ON cv_results;
CREATE POLICY "anon_update_cv_results" ON cv_results FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_cv_results" ON cv_results;
CREATE POLICY "anon_delete_cv_results" ON cv_results FOR DELETE
  TO anon, authenticated USING (true);