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

export interface ProjectRepository {
  list(): Promise<Project[]>;
  create(input: { name: string; description: string }): Promise<Project>;
  delete(projectId: string): Promise<void>;
}

export interface DatasetRepository {
  list(projectId: string): Promise<Dataset[]>;
  get(datasetId: string): Promise<Dataset | null>;
  import(input: unknown): Promise<Dataset>;
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
