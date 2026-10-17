import 'fake-indexeddb/auto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildProjectHash, parseProjectHash, parseProjectViewSettings } from '../src/lib/appRoute';
import { saveDataQualityThresholds } from '../src/lib/dataQualitySettings';
import { restoreProjectView } from '../src/lib/projectRestoration';
import { buildSubscaleConfigs, createScoreHashes } from '../src/storage/scoreHashes';
import { db } from '../src/storage/db';
import {
  datasetRepository,
  projectRepository,
  settingsRepository,
  surveyConfigRepository,
} from '../src/storage/repositories';

describe('project view and saved display state', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  afterAll(() => {
    db.close();
  });

  it('builds and parses the project hash route for each workspace tab', () => {
    expect(buildProjectHash('study id', 'quality')).toBe('#/project/study%20id/quality');
    expect(parseProjectHash('#/project/study%20id/export')).toEqual({
      projectId: 'study id',
      tab: 'export',
    });
    expect(parseProjectHash('#/project/study/configure')).toBeNull();
    expect(parseProjectHash('#/project/study/not-a-tab')).toBeNull();
  });

  it('ignores legacy score-column display settings', () => {
    expect(parseProjectViewSettings({
      scoreColumnSettings: { sum: true, mean: true, overall: false },
    })).toEqual({
      activeDatasetId: null,
      tab: 'config',
      showSummarySum: false,
      showSummaryMean: false,
    });
  });

  it('restores the active dataset and display settings from IndexedDB', async () => {
    const project = await projectRepository.create({ name: 'Reload study', description: '' });
    const dataset = await datasetRepository.import({
      projectId: project.id,
      fileName: 'reload.csv',
      sheetName: 'Responses',
      headers: ['Q1'],
      rows: [{ Q1: '4' }],
      columnMeta: {},
    });
    const key = `project-view:${project.id}`;
    const saved = {
      activeDatasetId: dataset.id,
      showSummarySum: true,
      showSummaryMean: false,
      scoreColumnSettings: { sum: true, mean: false, overall: false },
    };
    await settingsRepository.set(key, saved);

    db.close();
    await db.open();

    await expect(settingsRepository.get(key)).resolves.toEqual(saved);
    expect(await datasetRepository.get(dataset.id)).toMatchObject({ id: dataset.id });
    const route = parseProjectHash(buildProjectHash(project.id, 'export'));
    if (!route) throw new Error('Project route did not parse.');
    await expect(restoreProjectView(route.projectId, route.tab)).resolves.toMatchObject({
      project: { id: project.id },
      datasetId: dataset.id,
      tab: 'export',
      settings: {
        activeDatasetId: dataset.id,
        showSummarySum: true,
        showSummaryMean: false,
      },
    });
  });

  it('persists and restores Data Quality thresholds in the survey configuration', async () => {
    const project = await projectRepository.create({ name: 'Threshold study', description: '' });
    const dataset = await datasetRepository.import({
      projectId: project.id,
      fileName: 'thresholds.csv',
      sheetName: 'Responses',
      headers: ['Q1'],
      rows: [{ Q1: 4 }],
      columnMeta: {},
    });
    const thresholds = {
      unexpectedMissingPct: 13,
      longstringMin: 7,
      extremeRate: 0.91,
      midpointRate: 0.8,
      lowVarianceFraction: 0.04,
      zscoreThreshold: 3.2,
      minValidItemFrac: 0.55,
    };

    const beforeConfig = await surveyConfigRepository.get(dataset.id);
    if (!beforeConfig) throw new Error('Dataset configuration was not created.');
    const beforeHashes = await createScoreHashes(
      dataset,
      beforeConfig,
      buildSubscaleConfigs(beforeConfig),
      [],
    );
    await saveDataQualityThresholds(dataset.id, thresholds);
    const restored = await surveyConfigRepository.get(dataset.id);
    if (!restored) throw new Error('Dataset configuration was not saved.');
    const afterHashes = await createScoreHashes(
      dataset,
      restored,
      buildSubscaleConfigs(restored),
      [],
    );

    expect(restored.dq_thresholds).toEqual(thresholds);
    expect(afterHashes.config_hash).toBe(beforeHashes.config_hash);
  });
});
