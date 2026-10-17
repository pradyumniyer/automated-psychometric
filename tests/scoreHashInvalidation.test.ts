import 'fake-indexeddb/auto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/storage/db';
import { datasetRepository, projectRepository, scoreRepository } from '../src/storage/repositories';
import { buildSubscaleConfigs, createScoreHashes } from '../src/storage/scoreHashes';
import { toSurveyConfigRecord, type ScreenSubscaleState } from '../src/storage/viewAdapters';

type ConfigMutation = (subscales: ScreenSubscaleState[]) => ScreenSubscaleState[];

const subscales: ScreenSubscaleState[] = [
  {
    id: 'stress',
    name: 'Stress',
    items: [
      { column: 'Q1', order: 0, reverse: false },
      { column: 'Q2', order: 1, reverse: false },
    ],
    scoringMethod: 'sum',
    customFormula: '',
    scaleType: 'numeric',
    minValue: 1,
    maxValue: 5,
    labelMap: [],
    displayOrder: 0,
  },
  {
    id: 'coping',
    name: 'Coping',
    items: [{ column: 'Q3', order: 0, reverse: false }],
    scoringMethod: 'sum',
    customFormula: '',
    scaleType: 'numeric',
    minValue: 1,
    maxValue: 5,
    labelMap: [],
    displayOrder: 1,
  },
];

const mutations: { name: string; mutate: ConfigMutation }[] = [
  {
    name: "an item's reverse-coding flag changes",
    mutate: (current) => current.map((scale) => scale.id !== 'stress' ? scale : ({
      ...scale,
      items: scale.items.map((item) => item.column === 'Q1' ? { ...item, reverse: true } : item),
    })),
  },
  {
    name: "an item's response-scale range changes",
    mutate: (current) => current.map((scale) => scale.id === 'stress' ? { ...scale, maxValue: 6 } : scale),
  },
  {
    name: 'an item moves between subscales',
    mutate: (current) => current.map((scale) => {
      if (scale.id === 'stress') {
        return { ...scale, items: scale.items.filter((item) => item.column !== 'Q2') };
      }
      return {
        ...scale,
        items: [...scale.items, { column: 'Q2', order: scale.items.length, reverse: false }],
      };
    }),
  },
  {
    name: 'a subscale scoring method changes',
    mutate: (current) => current.map((scale) => scale.id === 'stress'
      ? { ...scale, scoringMethod: 'mean' }
      : scale),
  },
];

describe('score-cache invalidation for scoring configuration changes', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  afterAll(() => {
    db.close();
  });

  it.each(mutations)('invalidates the cached score when $name', async ({ mutate }) => {
    const project = await projectRepository.create({ name: 'Hash study', description: '' });
    const dataset = await datasetRepository.import({
      projectId: project.id,
      fileName: 'hashes.csv',
      sheetName: 'Responses',
      headers: ['Q1', 'Q2', 'Q3'],
      rows: [{ Q1: 1, Q2: 2, Q3: 3 }],
      columnMeta: {},
    });
    const makeConfig = (states: ScreenSubscaleState[]) => toSurveyConfigRecord({
      datasetId: dataset.id,
      projectId: project.id,
      headers: dataset.headers,
      demographicColumns: [],
      subscales: states,
      bands: {},
      overallScale: null,
    });

    const initialConfig = makeConfig(subscales);
    const initialHashes = await createScoreHashes(
      dataset,
      initialConfig,
      buildSubscaleConfigs(initialConfig),
      [],
    );
    await scoreRepository.save(dataset.id, {
      ...initialHashes,
      computed_at: Date.now(),
      payload: {},
    });

    const changedConfig = makeConfig(mutate(subscales));
    const changedHashes = await createScoreHashes(
      dataset,
      changedConfig,
      buildSubscaleConfigs(changedConfig),
      [],
    );

    await expect(scoreRepository.getCurrent(dataset.id, changedHashes)).resolves.toBeNull();
  });
});
