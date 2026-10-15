import 'fake-indexeddb/auto';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../src/storage/db';
import { datasetRepository, projectRepository } from '../src/storage/repositories';

describe('atomic dataset import repository', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  afterAll(() => {
    db.close();
  });

  it('assigns unique row IDs once and preserves row objects and column metadata after reload', async () => {
    const project = await projectRepository.create({ name: 'Import study', description: '' });
    const dataset = await datasetRepository.import({
      projectId: project.id,
      fileName: 'responses.csv',
      sheetName: 'Responses',
      headers: ['Participant', 'Q1'],
      rows: [
        { Participant: 'P-1', Q1: 4 },
        { Participant: 'P-2', Q1: null },
      ],
      columnMeta: { Q1: { label: 'Anxiety item one' } },
      headerRow: 1,
      dataStartRow: 2,
    });

    expect(dataset.row_ids).toHaveLength(2);
    expect(new Set(dataset.row_ids).size).toBe(2);
    expect(dataset.row_ids.every((rowId) => /^[0-9a-f-]{36}$/i.test(rowId))).toBe(true);

    db.close();
    await db.open();
    const reloaded = await datasetRepository.get(dataset.id);

    expect(reloaded?.row_ids).toEqual(dataset.row_ids);
    expect(reloaded?.rows).toEqual([
      { Participant: 'P-1', Q1: 4 },
      { Participant: 'P-2', Q1: null },
    ]);
    expect(reloaded?.column_meta).toEqual({ Q1: { label: 'Anxiety item one' } });
    expect(reloaded?.sheet_name).toBe('Responses');
  });

  it('rolls back the dataset and related records if the import event fails', async () => {
    const project = await projectRepository.create({ name: 'Rollback study', description: '' });
    vi.spyOn(db.history, 'add').mockRejectedValueOnce(new Error('history write failed'));

    await expect(datasetRepository.import({
      projectId: project.id,
      fileName: 'responses.csv',
      sheetName: 'Responses',
      headers: ['Q1'],
      rows: [{ Q1: 3 }],
      columnMeta: {},
      headerRow: 0,
      dataStartRow: 1,
    })).rejects.toThrow('history write failed');

    expect(await db.datasets.count()).toBe(0);
    expect(await db.survey_configs.count()).toBe(0);
    expect(await db.exclusion_state.count()).toBe(0);
    expect(await db.history.count()).toBe(0);
    vi.restoreAllMocks();
  });
});
