-- Add sheet_name column to datasets for multi-tab spreadsheet support
ALTER TABLE datasets ADD COLUMN IF NOT EXISTS sheet_name text DEFAULT '';