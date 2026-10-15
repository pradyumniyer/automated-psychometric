import { db } from './db';
import type {
  DatasetRecord,
  ExclusionStateRecord,
  HistoryRecord,
  ProjectRecord,
  ScoreResultRecord,
  SettingRecord,
  SurveyConfigRecord,
  TemplateRecord,
} from './schema';
import type { Dataset, Project, Template } from '@/types/domain';

export interface DatasetImportInput {
  projectId: string;
  fileName: string;
  sheetName: string;
  headers: string[];
  rows: Record<string, unknown>[];
  columnMeta: Record<string, unknown>;
  headerRow: number;
  dataStartRow: number;
}

export interface ProjectRepository {
  list(): Promise<Project[]>;
  create(input: { name: string; description: string }): Promise<Project>;
  delete(projectId: string): Promise<void>;
}

export interface DatasetRepository {
  list(projectId: string): Promise<Dataset[]>;
  get(datasetId: string): Promise<Dataset | null>;
  import(input: DatasetImportInput): Promise<Dataset>;
  delete(datasetId: string): Promise<void>;
}

export interface SurveyConfigRepository {
  get(datasetId: string): Promise<SurveyConfigRecord | null>;
  save(datasetId: string, config: SurveyConfigRecord): Promise<void>;
}

export interface ExclusionRepository {
  get(datasetId: string): Promise<ExclusionStateRecord | null>;
  replace(datasetId: string, rowIds: Iterable<string>): Promise<void>;
  toggle(datasetId: string, rowId: string): Promise<void>;
}

export interface ScoreRepository {
  getCurrent(
    datasetId: string,
    hashes: Pick<ScoreResultRecord, 'dataset_hash' | 'config_hash' | 'spec_version'>,
  ): Promise<ScoreResultRecord | null>;
  save(datasetId: string, result: Omit<ScoreResultRecord, 'dataset_id' | 'version'>): Promise<ScoreResultRecord>;
}

export interface TemplateRepository {
  list(): Promise<Template[]>;
  get(templateId: string): Promise<Template | null>;
  save(template: Omit<TemplateRecord, 'id' | 'created_at' | 'updated_at'>): Promise<Template>;
  update(templateId: string, template: Partial<TemplateRecord>): Promise<void>;
}

export interface HistoryRepository {
  append(event: Omit<HistoryRecord, 'id' | 'ts'>): Promise<void>;
  list(datasetId: string): Promise<HistoryRecord[]>;
  delete(actionId: string): Promise<void>;
}

export interface SettingsRepository {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
}

export interface RepositorySet {
  projects: ProjectRepository;
  datasets: DatasetRepository;
  surveyConfigs: SurveyConfigRepository;
  exclusions: ExclusionRepository;
  scores: ScoreRepository;
  templates: TemplateRepository;
  history: HistoryRepository;
  settings: SettingsRepository;
}

function toProject(record: ProjectRecord): Project {
  return {
    ...record,
    created_at: new Date(record.created_at).toISOString(),
    updated_at: new Date(record.updated_at).toISOString(),
  };
}

function toDataset(record: DatasetRecord): Dataset {
  return {
    id: record.id,
    project_id: record.project_id,
    file_name: record.import_meta?.file_name ?? record.name,
    sheet_name: record.sheet_name ?? null,
    headers: record.headers,
    rows: record.rows.map((row) => Object.fromEntries(
      record.headers.map((header, index) => [header, row[index] ?? null]),
    )),
    column_meta: record.column_meta,
    row_ids: record.row_ids,
    row_count: record.rows.length,
    col_count: record.headers.length,
    linked_template_id: null,
    created_at: new Date(record.created_at).toISOString(),
  };
}

export const projectRepository: ProjectRepository = {
  async list() {
    const records = await db.projects.orderBy('updated_at').reverse().toArray();
    return records.map(toProject);
  },

  async create(input) {
    const now = Date.now();
    const record: ProjectRecord = {
      id: crypto.randomUUID(),
      name: input.name,
      description: input.description,
      project_type: 'survey_scoring',
      created_at: now,
      updated_at: now,
    };
    await db.projects.add(record);
    return toProject(record);
  },

  async delete(projectId) {
    await db.transaction(
      'rw',
      [
        db.projects,
        db.datasets,
        db.survey_configs,
        db.exclusion_state,
        db.score_results,
        db.history,
      ],
      async () => {
        const datasets = await db.datasets.where('project_id').equals(projectId).primaryKeys();
        await db.datasets.bulkDelete(datasets);
        await db.survey_configs.bulkDelete(datasets);
        await db.exclusion_state.bulkDelete(datasets);
        await db.score_results.bulkDelete(datasets);
        await db.history.where('project_id').equals(projectId).delete();
        await db.projects.delete(projectId);
      },
    );
  },
};

export const datasetRepository: DatasetRepository = {
  async list(projectId) {
    const records = await db.datasets.where('project_id').equals(projectId).sortBy('created_at');
    return records.map(toDataset);
  },

  async get(datasetId) {
    const record = await db.datasets.get(datasetId);
    return record ? toDataset(record) : null;
  },

  async import(input) {
    const id = crypto.randomUUID();
    const now = Date.now();
    const rowIds = input.rows.map(() => crypto.randomUUID());
    const datasetRecord: DatasetRecord = {
      id,
      project_id: input.projectId,
      name: input.sheetName || input.fileName,
      sheet_name: input.sheetName,
      headers: [...input.headers],
      rows: input.rows.map((row) => input.headers.map((header) =>
        Object.prototype.hasOwnProperty.call(row, header) ? row[header] : null,
      )),
      row_ids: rowIds,
      column_meta: input.columnMeta,
      import_meta: {
        file_name: input.fileName,
        header_row: input.headerRow,
        data_start_row: input.dataStartRow,
      },
      created_at: now,
    };
    const initialConfig: SurveyConfigRecord = {
      dataset_id: id,
      id_columns: [],
      demographic_columns: [],
      item_columns: [...input.headers],
      response_scale: { type: 'numeric' },
      subscales: [],
      bands: [],
      allowed_nonresponse: [],
      proration_enabled: false,
      proration_max_missing_pct: 20,
      dq_thresholds: {},
      linked_template_id: null,
      updated_at: now,
    };
    const initialExclusions: ExclusionStateRecord = {
      dataset_id: id,
      excluded_row_ids: [],
    };
    const historyRecord: HistoryRecord = {
      id: crypto.randomUUID(),
      project_id: input.projectId,
      dataset_id: id,
      action_type: 'import',
      description: `Imported ${input.fileName} [${input.sheetName}] (${input.rows.length} rows, ${input.headers.length} cols)`,
      payload: {
        fileName: input.fileName,
        sheetName: input.sheetName,
        headerRow: input.headerRow,
        dataStartRow: input.dataStartRow,
      },
      undo_data: null,
      ts: now,
    };

    await db.transaction(
      'rw',
      [db.datasets, db.survey_configs, db.exclusion_state, db.history],
      async () => {
        await db.datasets.add(datasetRecord);
        await db.survey_configs.add(initialConfig);
        await db.exclusion_state.add(initialExclusions);
        await db.history.add(historyRecord);
      },
    );

    return toDataset(datasetRecord);
  },

  async delete(datasetId) {
    await db.transaction(
      'rw',
      [db.datasets, db.survey_configs, db.exclusion_state, db.score_results, db.history],
      async () => {
        await db.datasets.delete(datasetId);
        await db.survey_configs.delete(datasetId);
        await db.exclusion_state.delete(datasetId);
        await db.score_results.delete(datasetId);
        await db.history.where('dataset_id').equals(datasetId).delete();
      },
    );
  },
};

export type {
  DatasetRecord,
  ExclusionStateRecord,
  HistoryRecord,
  ProjectRecord,
  ScoreResultRecord,
  SettingRecord,
  SurveyConfigRecord,
  TemplateRecord,
};
