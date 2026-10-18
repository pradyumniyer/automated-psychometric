export interface Project {
  id: string;
  name: string;
  description: string;
  project_type: 'survey_scoring' | 'content_validity' | 'longitudinal' | 'ema_helpers';
  created_at: string;
  updated_at: string;
  last_tab?: string;
}

export interface Dataset {
  id: string;
  project_id: string;
  file_name: string;
  sheet_name: string | null;
  headers: string[];
  rows: Record<string, unknown>[];
  column_meta: Record<string, unknown>;
  row_ids: string[];
  row_count: number;
  col_count: number;
  linked_template_id: string | null;
  created_at: string;
}

export interface DemographicColumn {
  id: string;
  project_id: string;
  dataset_id: string | null;
  column_name: string;
  detected_by: string;
  confidence: number;
  confirmed: boolean;
  created_at: string;
}

export interface SubscaleItem {
  column: string;
  order: number;
  reverse: boolean;
}

export type ScoreOutput = 'sum' | 'mean' | 'custom';

export interface SubscaleGroup {
  id: string;
  project_id: string;
  dataset_id: string | null;
  name: string;
  description: string;
  items: SubscaleItem[];
  scoring_method: 'sum' | 'mean' | 'custom';
  score_outputs?: ScoreOutput[];
  custom_formula: string | null;
  display_order: number;
  created_at: string;
}

export interface ResponseScale {
  id: string;
  project_id: string;
  dataset_id: string | null;
  subscale_id: string | null;
  scale_type: 'numeric' | 'categorical';
  min_value: number | null;
  max_value: number | null;
  label_map: { label: string; value: number }[];
  confirmed?: boolean;
  out_of_range?: 'missing' | 'widen';
  created_at: string;
}

export interface InterpretationBand {
  id: string;
  project_id: string;
  dataset_id: string | null;
  subscale_id: string | null;
  name: string;
  min_score: number;
  max_score: number;
  color: string;
  score_output?: ScoreOutput;
  display_order: number;
  created_at: string;
}

export interface ScoringResultDB {
  id: string;
  project_id: string;
  dataset_id: string | null;
  version: number;
  headers: string[];
  rows: Record<string, unknown>[];
  config_snapshot: Record<string, unknown>;
  excluded_rows: number[];
  dataset_hash: string;
  config_hash: string;
  spec_version: string;
  created_at: string;
}

export interface TemplateDefinition {
  subscales: {
    name: string;
    description: string;
    scoringMethod: 'sum' | 'mean' | 'custom';
    showOutputs?: ScoreOutput[];
    customFormula?: string | null;
    items: { name: string; aliases: string[]; order: number; reverse: boolean }[];
  }[];
  responseScales: {
    subscaleName: string;
    scaleType: 'numeric' | 'categorical';
    minValue: number | null;
    maxValue: number | null;
    labelMap: { label: string; value: number }[];
    confirmed?: boolean;
  }[];
  interpretationBands: {
    subscaleName: string;
    output?: ScoreOutput;
    bands: { name: string; minScore: number; maxScore: number; color: string }[];
  }[];
  overall?: {
    enabled: boolean;
    basedOn: 'sums' | 'means' | 'custom';
    combineBy: 'sum' | 'mean' | 'custom';
    customFormula: string;
    bands: { name: string; minScore: number; maxScore: number; color: string }[];
  };
  demographicRules: { patterns: string[]; contentHeuristics: string[] };
}

export interface Template {
  id: string;
  name: string;
  description: string;
  instrument: string;
  definition: TemplateDefinition;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface ActionHistory {
  id: string;
  project_id: string;
  dataset_id: string | null;
  action_type: string;
  description: string;
  payload: Record<string, unknown>;
  undo_data: { rowId?: string; [key: string]: unknown } | null;
  created_at: string;
}
