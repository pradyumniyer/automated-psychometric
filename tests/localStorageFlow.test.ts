import 'fake-indexeddb/auto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { scoreDataset, type SubscaleConfig } from '../src/scientific/scoring';
import { createScoreHashes } from '../src/storage/scoreHashes';
import { db } from '../src/storage/db';
import {
  datasetRepository,
  exclusionRepository,
  projectRepository,
  scoreRepository,
  surveyConfigRepository,
} from '../src/storage/repositories';
import { toSurveyConfigRecord } from '../src/storage/viewAdapters';

describe('local storage scoring flow', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  afterAll(() => {
    db.close();
  });

  it('creates, imports, configures, scores, reloads exclusions, and rejects stale scores', async () => {
    const project = await projectRepository.create({ name: 'Flow study', description: '' });
    const dataset = await datasetRepository.import({
      projectId: project.id,
      fileName: 'responses.csv',
      sheetName: 'Responses',
      headers: ['Q1', 'Q2'],
      rows: [{ Q1: 1, Q2: 2 }, { Q1: 4, Q2: 5 }],
      columnMeta: { Q1: { label: 'First item' }, Q2: { label: 'Second item' } },
      demographicColumns: [],
    });
    const subscales: SubscaleConfig[] = [{
      id: 'stress',
      name: 'Stress',
      items: [
        { column: 'Q1', order: 0, reverse: false },
        { column: 'Q2', order: 1, reverse: false },
      ],
      scoringMethod: 'mean',
      customFormula: null,
      responseScale: { scaleType: 'numeric', minValue: 1, maxValue: 5, labelMap: [] },
    }];
    const screenSubscales = subscales.map((subscale, displayOrder) => ({
      id: subscale.id,
      name: subscale.name,
      items: subscale.items,
      scoringMethod: subscale.scoringMethod,
      showOutputs: ['mean'],
      customFormula: '',
      scaleType: 'numeric' as const,
      minValue: 1,
      maxValue: 5,
      labelMap: [],
      displayOrder,
    }));
    const configInput = toSurveyConfigRecord({
      datasetId: dataset.id,
      projectId: project.id,
      headers: dataset.headers,
      demographicColumns: [],
      subscales: screenSubscales,
      bands: {},
      overallScale: null,
    });
    const config = await surveyConfigRepository.save(dataset.id, configInput);
    await exclusionRepository.replace(dataset.id, [dataset.row_ids[1]]);

    const scoringResult = scoreDataset(
      dataset.rows,
      dataset.headers,
      subscales,
      {},
      [1],
      { rowIds: dataset.row_ids },
    );
    const excludedRowIds = [dataset.row_ids[1]];
    const hashes = await createScoreHashes(dataset, config, subscales, excludedRowIds);
    const saved = await scoreRepository.save(dataset.id, {
      ...hashes,
      computed_at: Date.now(),
      payload: { result: scoringResult },
    });

    db.close();
    await db.open();
    const reloadedDataset = await datasetRepository.get(dataset.id);
    const reloadedConfig = await surveyConfigRepository.get(dataset.id);
    expect(reloadedDataset?.row_ids).toEqual(dataset.row_ids);
    expect(reloadedConfig?.subscales[0].score_outputs).toEqual(['mean']);
    expect(await exclusionRepository.get(dataset.id)).toEqual({
      dataset_id: dataset.id,
      excluded_row_ids: excludedRowIds,
    });
    expect(await scoreRepository.getLatest(dataset.id)).toEqual(saved);
    expect(reloadedDataset && reloadedConfig).toBeTruthy();
    if (!reloadedDataset || !reloadedConfig) throw new Error('Imported data was not restored after reopening IndexedDB.');

    const currentHashes = await createScoreHashes(
      reloadedDataset,
      reloadedConfig,
      subscales,
      excludedRowIds,
    );
    expect(await scoreRepository.getCurrent(dataset.id, currentHashes)).toEqual(saved);

    const changedConfig = {
      ...reloadedConfig,
      subscales: reloadedConfig.subscales.map((subscale) => ({
        ...subscale,
        scoring_method: 'sum' as const,
      })),
    };
    const persistedChangedConfig = await surveyConfigRepository.save(dataset.id, changedConfig);
    const changedHashes = await createScoreHashes(
      reloadedDataset,
      persistedChangedConfig,
      [{ ...subscales[0], scoringMethod: 'sum' }],
      excludedRowIds,
    );
    expect(await scoreRepository.getCurrent(dataset.id, changedHashes)).toBeNull();
  });
});
