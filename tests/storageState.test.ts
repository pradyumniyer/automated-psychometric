import 'fake-indexeddb/auto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/storage/db';
import {
  datasetRepository,
  exclusionRepository,
  historyRepository,
  projectRepository,
  scoreRepository,
} from '../src/storage/repositories';

describe('row-ID exclusions, score cache, and history repositories', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  afterAll(() => {
    db.close();
  });

  async function createDataset() {
    const project = await projectRepository.create({ name: 'State study', description: '' });
    return datasetRepository.import({
      projectId: project.id,
      fileName: 'state.csv',
      sheetName: 'Responses',
      headers: ['Q1'],
      rows: [{ Q1: 1 }, { Q1: 2 }, { Q1: 3 }],
      columnMeta: {},
      headerRow: 0,
      dataStartRow: 1,
    });
  }

  it('maps exclusions by row ID after rows are reordered', async () => {
    const dataset = await createDataset();
    const [first, second, third] = dataset.row_ids;
    await exclusionRepository.replace(dataset.id, [second]);

    expect(await exclusionRepository.get(dataset.id)).toEqual({
      dataset_id: dataset.id,
      excluded_row_ids: [second],
    });
    expect(await exclusionRepository.getExcludedIndices(dataset.id, [second, first, third])).toEqual([0]);
  });

  it('increments the score version and serves only a matching cached result', async () => {
    const dataset = await createDataset();
    const hashes = {
      dataset_hash: 'dataset-v1',
      config_hash: 'config-v1',
      spec_version: 'spec-v1',
    };
    const first = await scoreRepository.save(dataset.id, {
      ...hashes,
      computed_at: Date.now(),
      payload: { [dataset.row_ids[0]]: { score: 4 } },
    });

    expect(first.version).toBe(1);
    expect(await scoreRepository.getCurrent(dataset.id, hashes)).toEqual(first);
    const second = await scoreRepository.save(dataset.id, {
      ...hashes,
      computed_at: Date.now(),
      payload: { [dataset.row_ids[0]]: { score: 5 } },
    });
    expect(second.version).toBe(2);
    expect(await db.score_results.count()).toBe(1);
    expect(await scoreRepository.getCurrent(dataset.id, hashes)).toEqual(second);
  });

  it('rejects cached scores when any identity hash has changed', async () => {
    const dataset = await createDataset();
    const hashes = {
      dataset_hash: 'dataset-v1',
      config_hash: 'config-v1',
      spec_version: 'spec-v1',
    };
    await scoreRepository.save(dataset.id, {
      ...hashes,
      computed_at: Date.now(),
      payload: {},
    });

    await expect(scoreRepository.getCurrent(dataset.id, {
      ...hashes,
      dataset_hash: 'dataset-v2',
    })).resolves.toBeNull();
    await expect(scoreRepository.getCurrent(dataset.id, {
      ...hashes,
      config_hash: 'config-v2',
    })).resolves.toBeNull();
    await expect(scoreRepository.getCurrent(dataset.id, {
      ...hashes,
      spec_version: 'spec-v2',
    })).resolves.toBeNull();
  });

  it('stores history undo information by row ID, never row position', async () => {
    const dataset = await createDataset();
    const rowId = dataset.row_ids[1];

    await historyRepository.append({
      project_id: dataset.project_id,
      dataset_id: dataset.id,
      action_type: 'row_exclude_toggle',
      description: 'Excluded row',
      payload: { action: 'exclude' },
      undo_data: { rowId, wasExcluded: false },
    });
    const [event] = await historyRepository.list(dataset.id);

    expect(event.undo_data).toEqual({ rowId, wasExcluded: false });
    expect(event.undo_data).not.toHaveProperty('rowIndex');
  });
});
