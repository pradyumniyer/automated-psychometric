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
  {
    name: 'an interpretation band changes',
    mutate: (current) => [...current],
  },
  {
    name: 'a subscale Show toggle changes',
    mutate: (current) => current.map((scale) => scale.id === 'stress'
      ? { ...scale, showOutputs: ['mean'] as const }
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
      bands: states === subscales
        ? { Stress: [{ name: 'Low', minScore: 1, maxScore: 2, color: '#000000' }] }
        : { Stress: [{ name: 'Low', minScore: 1, maxScore: 3, color: '#000000' }] },
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

  it('invalidates the cached score when a per-output band cut-off changes', async () => {
    const project = await projectRepository.create({ name: 'Band hash study', description: '' });
    const dataset = await datasetRepository.import({
      projectId: project.id,
      fileName: 'bands.csv',
      sheetName: 'Responses',
      headers: ['Q1'],
      rows: [{ Q1: 1 }],
      columnMeta: {},
    });
    const makeConfig = (maxScore: number) => toSurveyConfigRecord({
      datasetId: dataset.id,
      projectId: project.id,
      headers: dataset.headers,
      demographicColumns: [],
      subscales: [{
        ...subscales[0],
        items: [{ column: 'Q1', order: 0, reverse: false }],
        showOutputs: ['sum', 'mean'],
      }],
      bands: {},
      bandsByOutput: {
        Stress: {
          sum: [{ name: 'Low', minScore: 1, maxScore, color: '#000000' }],
        },
      },
      overallScale: null,
    });
    const initialConfig = makeConfig(2);
    const initialHashes = await createScoreHashes(dataset, initialConfig, buildSubscaleConfigs(initialConfig), []);
    await scoreRepository.save(dataset.id, {
      ...initialHashes,
      computed_at: Date.now(),
      payload: {},
    });
    const changedConfig = makeConfig(3);
    const changedHashes = await createScoreHashes(dataset, changedConfig, buildSubscaleConfigs(changedConfig), []);
    await expect(scoreRepository.getCurrent(dataset.id, changedHashes)).resolves.toBeNull();
  });

  it('invalidates the cached score when an automatic item reverse flag changes', async () => {
    const project = await projectRepository.create({ name: 'Automatic reverse hash study', description: '' });
    const dataset = await datasetRepository.import({
      projectId: project.id,
      fileName: 'automatic-reverse.csv',
      sheetName: 'Responses',
      headers: ['ID', 'Q1', 'Q2'],
      rows: [{ ID: 'P1', Q1: 1, Q2: 2 }],
      columnMeta: {},
    });
    const automatic = {
      id: 'auto-overall',
      name: 'Overall scale',
      items: [
        { column: 'Q1', order: 0, reverse: false },
        { column: 'Q2', order: 1, reverse: false },
      ],
      scoringMethod: 'sum' as const,
      customFormula: '',
      scaleType: 'numeric' as const,
      minValue: 1,
      maxValue: 5,
      labelMap: [],
      confirmed: false,
      displayOrder: 0,
    };
    const makeConfig = (reverse: boolean) => toSurveyConfigRecord({
      datasetId: dataset.id,
      projectId: project.id,
      headers: dataset.headers,
      demographicColumns: [],
      subscales: [{
        ...automatic,
        items: automatic.items.map((item) => item.column === 'Q1' ? { ...item, reverse } : item),
      }],
      bands: {},
      overallScale: null,
    });
    const initial = makeConfig(false);
    const changed = makeConfig(true);
    const initialHashes = await createScoreHashes(dataset, initial, buildSubscaleConfigs(initial), []);
    const changedHashes = await createScoreHashes(dataset, changed, buildSubscaleConfigs(changed), []);
    expect(changedHashes.config_hash).not.toBe(initialHashes.config_hash);
  });
});
