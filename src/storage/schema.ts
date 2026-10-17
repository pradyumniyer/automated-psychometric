import type {
  DemographicColumn,
  InterpretationBand,
  ResponseScale,
  SubscaleGroup,
  Template,
} from '@/types/domain';

export type RowValue = string | number | boolean | null;

export interface ProjectRecord {
  id: string;
  name: string;
  description: string;
  project_type: 'survey_scoring' | 'content_validity' | 'longitudinal' | 'ema_helpers';
  created_at: number;
  updated_at: number;
  last_tab?: string;
}

export interface DatasetRecord {
  id: string;
  project_id: string;
  name: string;
  sheet_name?: string;
  headers: string[];
  rows: unknown[][];
  row_ids: string[];
  row_meta?: Record<string, unknown>;
  column_meta: Record<string, unknown>;
  import_meta?: { file_name?: string; header_row?: number; data_start_row?: number };
  created_at: number;
}

export interface SurveyConfigRecord {
  dataset_id: string;
  id_columns: string[];
  demographic_columns: DemographicColumn[];
  item_columns: string[];
  response_scale: {
    type: 'numeric' | 'categorical';
    min?: number;
    max?: number;
    label_map?: { label: string; value: number }[];
    confirmed?: boolean;
  };
  subscales: (SubscaleGroup & {
    response_scale?: ResponseScale;
    bands?: InterpretationBand[];
  })[];
  overall_scale?: SubscaleGroup & {
    response_scale?: ResponseScale;
    bands?: InterpretationBand[];
  };
  overall_settings?: {
    enabled: boolean;
    based_on: 'sums' | 'means' | 'custom';
    combine_by: 'sum' | 'mean' | 'custom';
    custom_formula: string | null;
  };
  bands: InterpretationBand[];
  allowed_nonresponse: string[];
  proration_enabled: boolean;
  proration_max_missing_pct: 20 | 25 | 50;
  dq_thresholds: Record<string, number>;
  linked_template_id: string | null;
  updated_at: number;
}

export interface ExclusionStateRecord {
  dataset_id: string;
  excluded_row_ids: string[];
}

export interface ScoreResultRecord {
  dataset_id: string;
  version: number;
  computed_at: number;
  dataset_hash: string;
  config_hash: string;
  spec_version: string;
  payload: Record<string, unknown>;
}

export interface TemplateRecord extends Omit<Template, 'created_at' | 'updated_at' | 'definition'> {
  kind: 'instrument' | 'import' | 'dq';
  payload: Template['definition'];
  created_at: number;
  updated_at: number;
}

export interface HistoryRecord {
  id: string;
  project_id: string;
  dataset_id?: string;
  ts: number;
  action_type: string;
  summary: string;
  payload: Record<string, unknown>;
  undo_data: { rowId: string; wasExcluded?: boolean } | null;
}

export interface SettingRecord {
  key: string;
  value: unknown;
}
