import Dexie, { type Table } from 'dexie';
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
import { migrateSurveyConfigRecord } from './viewAdapters';

export const STORAGE_SCHEMA_VERSION = 2;
export const DATABASE_NAME = 'psychometric_prep';

export class PsychometricDatabase extends Dexie {
  projects!: Table<ProjectRecord, string>;
  datasets!: Table<DatasetRecord, string>;
  survey_configs!: Table<SurveyConfigRecord, string>;
  exclusion_state!: Table<ExclusionStateRecord, string>;
  score_results!: Table<ScoreResultRecord, string>;
  templates!: Table<TemplateRecord, string>;
  history!: Table<HistoryRecord, string>;
  settings!: Table<SettingRecord, string>;

  constructor() {
    super(DATABASE_NAME);
    this.version(STORAGE_SCHEMA_VERSION).stores({
      projects: '&id, name, updated_at',
      datasets: '&id, project_id, created_at, [project_id+created_at]',
      survey_configs: '&dataset_id',
      exclusion_state: '&dataset_id',
      score_results: '&dataset_id',
      templates: '&id, name, kind',
      history: '&id, project_id, dataset_id, ts, [dataset_id+ts]',
      settings: '&key',
    });
    this.version(2).stores({}).upgrade(async (tx) => {
      await tx.table('survey_configs').toCollection().modify((record: SurveyConfigRecord) => {
        Object.assign(record, migrateSurveyConfigRecord(record));
      });
    });
  }
}

export const db = new PsychometricDatabase();
