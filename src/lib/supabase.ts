import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false },
});

export type ProjectType = 'survey_scoring' | 'content_validity';

export interface Project {
  id: string; name: string; description: string;
  project_type: ProjectType;
  created_at: string; updated_at: string;
}

export interface CVDataset {
  id: string; project_id: string; file_name: string;
  sheet_name: string | null;
  headers: string[]; rows: Record<string, unknown>[];
  row_count: number; col_count: number;
  created_at: string;
}

export interface CVConfig {
  id: string; project_id: string; dataset_id: string;
  method: 'lawshe' | 'aiken';
  item_label_column: string | null;
  expert_columns: string[];
  dimension_column: string | null;
  row_types: Record<number, 'item' | 'dimension'>;
  value_mapping: Record<string, string | number>;
  scale_lo: number | null;
  scale_hi: number | null;
  alpha: number;
  empty_as_essential: boolean;
  excluded_experts: string[];
  dropped_items: number[];
  updated_at: string;
}

export interface CVResults {
  id: string; project_id: string; dataset_id: string;
  results: Record<string, unknown>[];
  summary: Record<string, unknown>;
  config_snapshot: Record<string, unknown>;
  created_at: string;
}

export interface Dataset {
  id: string; project_id: string; file_name: string;
  sheet_name: string | null;
  headers: string[]; rows: Record<string, unknown>[];
  column_meta: Record<string, unknown>;
  row_count: number; col_count: number;
  linked_template_id: string | null;
  created_at: string;
}

export interface DemographicColumn {
  id: string; project_id: string; dataset_id: string | null; column_name: string;
  detected_by: string; confidence: number; confirmed: boolean;
  created_at: string;
}

export interface SubscaleItem { column: string; order: number; reverse: boolean; }

export interface SubscaleGroup {
  id: string; project_id: string; dataset_id: string | null; name: string; description: string;
  items: SubscaleItem[]; scoring_method: 'sum' | 'mean' | 'custom';
  custom_formula: string | null;
  display_order: number;
  created_at: string;
}

export interface ResponseScale {
  id: string; project_id: string; dataset_id: string | null; subscale_id: string | null;
  scale_type: 'numeric' | 'categorical';
  min_value: number | null; max_value: number | null;
  label_map: { label: string; value: number }[];
  created_at: string;
}

export interface InterpretationBand {
  id: string; project_id: string; dataset_id: string | null; subscale_id: string | null;
  name: string; min_score: number; max_score: number;
  color: string; display_order: number;
  created_at: string;
}

export interface ScoringResultDB {
  id: string; project_id: string; dataset_id: string | null; version: number;
  headers: string[]; rows: Record<string, unknown>[];
  config_snapshot: Record<string, unknown>;
  excluded_rows: number[];
  created_at: string;
}

export interface Template {
  id: string; name: string; description: string; instrument: string;
  definition: TemplateDefinition; version: number;
  created_at: string; updated_at: string;
}

export interface TemplateDefinition {
  subscales: {
    name: string; description: string; scoringMethod: 'sum' | 'mean' | 'custom';
    customFormula?: string | null;
    items: { name: string; aliases: string[]; order: number; reverse: boolean }[];
  }[];
  responseScales: {
    subscaleName: string; scaleType: 'numeric' | 'categorical';
    minValue: number | null; maxValue: number | null;
    labelMap: { label: string; value: number }[];
  }[];
  interpretationBands: {
    subscaleName: string;
    bands: { name: string; minScore: number; maxScore: number; color: string }[];
  }[];
  demographicRules: { patterns: string[]; contentHeuristics: string[] };
}

export interface ActionHistory {
  id: string; project_id: string; dataset_id: string | null; action_type: string;
  description: string; payload: Record<string, unknown>;
  undo_data: Record<string, unknown> | null;
  created_at: string;
}
