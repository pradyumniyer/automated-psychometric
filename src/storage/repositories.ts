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
  headerRow?: number;
  dataStartRow?: number;
  demographicColumns?: Omit<import('@/types/domain').DemographicColumn, 'id' | 'project_id' | 'dataset_id' | 'created_at'>[];
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
  save(datasetId: string, config: SurveyConfigRecord): Promise<SurveyConfigRecord>;
}

export interface TemplateInput {
  name: string;
  description: string;
  instrument: string;
  definition: Template['definition'];
  kind?: TemplateRecord['kind'];
  version?: number;
}

export interface ExclusionRepository {
  get(datasetId: string): Promise<ExclusionStateRecord | null>;
  replace(datasetId: string, rowIds: Iterable<string>): Promise<void>;
  toggle(datasetId: string, rowId: string): Promise<void>;
  getExcludedIndices(datasetId: string, orderedRowIds?: readonly string[]): Promise<number[]>;
}

export interface ScoreRepository {
  getLatest(datasetId: string): Promise<ScoreResultRecord | null>;
  getCurrent(
    datasetId: string,
    hashes: Pick<ScoreResultRecord, 'dataset_hash' | 'config_hash' | 'spec_version'>,
  ): Promise<ScoreResultRecord | null>;
  save(datasetId: string, result: Omit<ScoreResultRecord, 'dataset_id' | 'version'>): Promise<ScoreResultRecord>;
}

export interface TemplateRepository {
  list(): Promise<Template[]>;
  get(templateId: string): Promise<Template | null>;
  save(template: TemplateInput): Promise<Template>;
  update(templateId: string, template: Partial<TemplateInput>): Promise<void>;
  applyToDataset(
    templateId: string,
    datasetId: string,
    config: SurveyConfigRecord,
  ): Promise<void>;
}

export interface HistoryRepository {
  append(event: Omit<import('@/types/domain').ActionHistory, 'id' | 'created_at'> & {
    undo_data: { rowId: string; wasExcluded?: boolean } | null;
  }): Promise<void>;
  list(datasetId: string): Promise<import('@/types/domain').ActionHistory[]>;
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

function toDataset(record: DatasetRecord, linkedTemplateId: string | null = null): Dataset {
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
    linked_template_id: linkedTemplateId,
    created_at: new Date(record.created_at).toISOString(),
  };
}

function toTemplate(record: TemplateRecord): Template {
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    instrument: record.instrument,
    definition: record.payload,
    version: record.version,
    created_at: new Date(record.created_at).toISOString(),
    updated_at: new Date(record.updated_at).toISOString(),
  };
}

function toHistory(record: HistoryRecord) {
  return {
    id: record.id,
    project_id: record.project_id,
    dataset_id: record.dataset_id ?? null,
    action_type: record.action_type,
    description: record.summary,
    payload: record.payload,
    undo_data: record.undo_data,
    created_at: new Date(record.ts).toISOString(),
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
    return Promise.all(records.map(async (record) => {
      const config = await db.survey_configs.get(record.id);
      return toDataset(record, config?.linked_template_id ?? null);
    }));
  },

  async get(datasetId) {
    const record = await db.datasets.get(datasetId);
    if (!record) return null;
    const config = await db.survey_configs.get(datasetId);
    return toDataset(record, config?.linked_template_id ?? null);
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
        ...(input.headerRow !== undefined ? { header_row: input.headerRow } : {}),
        ...(input.dataStartRow !== undefined ? { data_start_row: input.dataStartRow } : {}),
      },
      created_at: now,
    };
    const initialConfig: SurveyConfigRecord = {
      dataset_id: id,
      id_columns: [],
      demographic_columns: (input.demographicColumns ?? []).map((suggestion) => ({
        ...suggestion,
        id: crypto.randomUUID(),
        project_id: input.projectId,
        dataset_id: id,
        created_at: new Date(now).toISOString(),
      })),
      item_columns: input.headers.filter((header) =>
        !(input.demographicColumns ?? []).some((suggestion) => suggestion.column_name === header),
      ),
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
      summary: `Imported ${input.fileName} [${input.sheetName}] (${input.rows.length} rows, ${input.headers.length} cols)`,
      payload: {
        fileName: input.fileName,
        sheetName: input.sheetName,
        ...(input.headerRow !== undefined ? { headerRow: input.headerRow } : {}),
        ...(input.dataStartRow !== undefined ? { dataStartRow: input.dataStartRow } : {}),
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

export const surveyConfigRepository: SurveyConfigRepository = {
  async get(datasetId) {
    return (await db.survey_configs.get(datasetId)) ?? null;
  },

  async save(datasetId, config) {
    return db.transaction('rw', db.survey_configs, async () => {
      const saved = {
        ...config,
        dataset_id: datasetId,
        updated_at: Date.now(),
      };
      await db.survey_configs.put(saved);
      return saved;
    });
  },
};

export const templateRepository: TemplateRepository = {
  async list() {
    const records = await db.templates.orderBy('name').toArray();
    return records.map(toTemplate);
  },

  async get(templateId) {
    const record = await db.templates.get(templateId);
    return record ? toTemplate(record) : null;
  },

  async save(input) {
    const now = Date.now();
    const record: TemplateRecord = {
      id: crypto.randomUUID(),
      name: input.name,
      description: input.description,
      instrument: input.instrument,
      kind: input.kind ?? 'instrument',
      payload: input.definition,
      version: input.version ?? 1,
      created_at: now,
      updated_at: now,
    };
    await db.transaction('rw', db.templates, async () => {
      await db.templates.add(record);
    });
    return toTemplate(record);
  },

  async update(templateId, input) {
    await db.transaction('rw', db.templates, async () => {
      const existing = await db.templates.get(templateId);
      if (!existing) throw new Error(`Template "${templateId}" was not found.`);
      const updated: TemplateRecord = {
        ...existing,
        name: input.name ?? existing.name,
        description: input.description ?? existing.description,
        instrument: input.instrument ?? existing.instrument,
        kind: input.kind ?? existing.kind,
        payload: input.definition ?? existing.payload,
        version: input.version ?? existing.version,
        updated_at: Date.now(),
      };
      await db.templates.put(updated);
    });
  },

  async applyToDataset(templateId, datasetId, config) {
    await db.transaction(
      'rw',
      [db.templates, db.datasets, db.survey_configs, db.history],
      async () => {
        const [template, dataset] = await Promise.all([
          db.templates.get(templateId),
          db.datasets.get(datasetId),
        ]);
        if (!template) throw new Error(`Template "${templateId}" was not found.`);
        if (!dataset) throw new Error(`Dataset "${datasetId}" was not found.`);
        const now = Date.now();
        await db.survey_configs.put({
          ...config,
          dataset_id: datasetId,
          linked_template_id: templateId,
          updated_at: now,
        });
        await db.history.add({
          id: crypto.randomUUID(),
          project_id: dataset.project_id,
          dataset_id: datasetId,
          action_type: 'template_apply',
          summary: `Applied template: ${template.name} (v${template.version})`,
          payload: { templateId, templateVersion: template.version },
          undo_data: null,
          ts: now,
        });
      },
    );
  },
};

export const exclusionRepository: ExclusionRepository = {
  async get(datasetId) {
    return (await db.exclusion_state.get(datasetId)) ?? null;
  },

  async replace(datasetId, rowIds) {
    const requestedIds = [...new Set(rowIds)];
    await db.transaction(
      'rw',
      [db.datasets, db.exclusion_state],
      async () => {
        const dataset = await db.datasets.get(datasetId);
        if (!dataset) throw new Error(`Dataset "${datasetId}" was not found.`);
        const knownIds = new Set(dataset.row_ids);
        const unknownIds = requestedIds.filter((rowId) => !knownIds.has(rowId));
        if (unknownIds.length > 0) {
          throw new Error(`Unknown row ID(s) for dataset "${datasetId}": ${unknownIds.join(', ')}`);
        }
        await db.exclusion_state.put({
          dataset_id: datasetId,
          excluded_row_ids: requestedIds,
        });
      },
    );
  },

  async toggle(datasetId, rowId) {
    await db.transaction(
      'rw',
      [db.datasets, db.exclusion_state],
      async () => {
        const dataset = await db.datasets.get(datasetId);
        if (!dataset) throw new Error(`Dataset "${datasetId}" was not found.`);
        if (!dataset.row_ids.includes(rowId)) {
          throw new Error(`Row ID "${rowId}" does not belong to dataset "${datasetId}".`);
        }
        const state = await db.exclusion_state.get(datasetId);
        const excluded = new Set(state?.excluded_row_ids ?? []);
        if (excluded.has(rowId)) excluded.delete(rowId);
        else excluded.add(rowId);
        await db.exclusion_state.put({
          dataset_id: datasetId,
          excluded_row_ids: [...excluded],
        });
      },
    );
  },

  async getExcludedIndices(datasetId, orderedRowIds) {
    const dataset = await db.datasets.get(datasetId);
    if (!dataset) throw new Error(`Dataset "${datasetId}" was not found.`);
    const rowIds = orderedRowIds ?? dataset.row_ids;
    const excluded = new Set((await db.exclusion_state.get(datasetId))?.excluded_row_ids ?? []);
    return rowIds.flatMap((rowId, index) => excluded.has(rowId) ? [index] : []);
  },
};

export const scoreRepository: ScoreRepository = {
  async getLatest(datasetId) {
    return (await db.score_results.get(datasetId)) ?? null;
  },

  async getCurrent(datasetId, hashes) {
    const result = await this.getLatest(datasetId);
    if (!result) return null;
    if (
      result.dataset_hash !== hashes.dataset_hash ||
      result.config_hash !== hashes.config_hash ||
      result.spec_version !== hashes.spec_version
    ) return null;
    return result;
  },

  async save(datasetId, result) {
    return db.transaction('rw', db.score_results, async () => {
      const previous = await db.score_results.get(datasetId);
      const saved: ScoreResultRecord = {
        ...result,
        dataset_id: datasetId,
        version: (previous?.version ?? 0) + 1,
      };
      await db.score_results.put(saved);
      return saved;
    });
  },
};

export const historyRepository: HistoryRepository = {
  async append(event) {
    if (event.undo_data && (
      typeof event.undo_data.rowId !== 'string' ||
      'rowIndex' in event.undo_data
    )) {
      throw new Error('History undo data must identify rows by rowId, not row position.');
    }
    const record: HistoryRecord = {
      id: crypto.randomUUID(),
      project_id: event.project_id,
      ...(event.dataset_id ? { dataset_id: event.dataset_id } : {}),
      action_type: event.action_type,
      summary: event.description,
      payload: event.payload,
      undo_data: event.undo_data,
      ts: Date.now(),
    };
    await db.transaction('rw', db.history, async () => {
      await db.history.add(record);
    });
  },

  async list(datasetId) {
    const records = await db.history.where('dataset_id').equals(datasetId).toArray();
    return records.sort((left, right) => right.ts - left.ts).map(toHistory);
  },

  async delete(actionId) {
    await db.transaction('rw', db.history, async () => {
      await db.history.delete(actionId);
    });
  },
};

export const settingsRepository: SettingsRepository = {
  async get<T>(key: string) {
    const record = await db.settings.get(key);
    return record?.value as T | undefined;
  },

  async set<T>(key: string, value: T) {
    await db.settings.put({ key, value });
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
