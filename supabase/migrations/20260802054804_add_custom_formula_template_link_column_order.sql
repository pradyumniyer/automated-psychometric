/*
# Add custom formula, template linking, and column ordering support

## Purpose
Supports the new unified scoring workbench:
1. Custom formula scoring for subscales and the overall scale
2. Template auto-update linking (remember which template a dataset uses)
3. Column ordering so the live grid can persist subscale group positions

## Changes

1. subscale_groups:
   - custom_formula (text, nullable): stores the arithmetic formula expression
     when scoring_method is 'custom'. NULL for 'sum'/'mean'.
   - display_order (integer, default 0): persist subscale ordering for the
     live grid's column regrouping feature.

2. datasets:
   - linked_template_id (uuid, nullable, references templates(id) ON DELETE SET NULL):
     remembers which template was applied to this dataset, enabling the
     "Update template" workflow where the user can push config changes back
     to the linked template on explicit confirmation.

## Security
- No RLS policy changes. All existing policies remain in place.
- The scoring_method column already accepts text; 'custom' is a new value
  the application uses — no schema change needed there.
- linked_template_id is a soft reference (ON DELETE SET NULL) so deleting
  a template never blocks or orphans a dataset.
*/

-- 1. Add custom_formula and display_order to subscale_groups
ALTER TABLE subscale_groups ADD COLUMN IF NOT EXISTS custom_formula text;
ALTER TABLE subscale_groups ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0;

-- 2. Add linked_template_id to datasets
ALTER TABLE datasets ADD COLUMN IF NOT EXISTS linked_template_id uuid REFERENCES templates(id) ON DELETE SET NULL;

-- 3. Index for template linkage lookups
CREATE INDEX IF NOT EXISTS idx_datasets_linked_template_id ON datasets(linked_template_id);