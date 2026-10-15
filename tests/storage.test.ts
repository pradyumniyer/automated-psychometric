import 'fake-indexeddb/auto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db, STORAGE_SCHEMA_VERSION } from '../src/storage/db';
import { projectRepository } from '../src/storage/repositories';

describe('storage schema and project repository', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  afterAll(() => {
    db.close();
  });

  it('creates, lists, and deletes projects', async () => {
    const project = await projectRepository.create({
      name: 'Validation study',
      description: 'Pilot data',
    });

    expect(project.id).toBeTruthy();
    expect(project.project_type).toBe('survey_scoring');
    expect(await projectRepository.list()).toEqual([project]);

    await projectRepository.delete(project.id);
    expect(await projectRepository.list()).toEqual([]);
  });

  it('declares the schema version and query indexes', () => {
    expect(STORAGE_SCHEMA_VERSION).toBeGreaterThan(0);
    expect(db.projects.schema.indexes.map((index) => index.name)).toContain('updated_at');
    expect(db.datasets.schema.indexes.map((index) => index.name)).toContain('project_id');
    expect(db.history.schema.indexes.map((index) => index.name)).toContain('dataset_id');
  });

  it('cascades project deletion to its stored data', async () => {
    const project = await projectRepository.create({
      name: 'Cascade study',
      description: '',
    });

    await db.datasets.put({
      id: 'dataset-1',
      project_id: project.id,
      name: 'Pilot',
      headers: ['Q1'],
      rows: [['yes']],
      row_ids: ['row-1'],
      created_at: Date.now(),
    });
    await db.survey_configs.put({ dataset_id: 'dataset-1' });
    await db.exclusion_state.put({ dataset_id: 'dataset-1', excluded_row_ids: ['row-1'] });
    await db.score_results.put({
      dataset_id: 'dataset-1',
      computed_at: Date.now(),
      dataset_hash: 'data',
      config_hash: 'config',
      spec_version: 'spec',
      version: 1,
      payload: {},
    });
    await db.history.put({
      id: 'history-1',
      project_id: project.id,
      dataset_id: 'dataset-1',
      ts: Date.now(),
      action_type: 'import',
      summary: 'Imported dataset',
    });

    await projectRepository.delete(project.id);

    expect(await db.datasets.count()).toBe(0);
    expect(await db.survey_configs.count()).toBe(0);
    expect(await db.exclusion_state.count()).toBe(0);
    expect(await db.score_results.count()).toBe(0);
    expect(await db.history.count()).toBe(0);
  });
});
