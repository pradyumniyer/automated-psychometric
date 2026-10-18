import { readFileSync } from 'node:fs';
import Papa from 'papaparse';
import { describe, expect, it } from 'vitest';
import { getUnscoredRowSummary } from '../src/lib/scoringStatus';
import { buildAutoScale, isAutomaticSubscale, scoreDataset } from '../src/scientific/scoring';
import { ensureAutomaticSubscale, fromSurveyConfigRecord } from '../src/storage/viewAdapters';
import { buildSubscaleConfigs, createScoreHashes } from '../src/storage/scoreHashes';
import type { Dataset } from '../src/types/domain';
import type { SurveyConfigRecord } from '../src/storage/schema';

function fixtureA() {
  const parsed = Papa.parse<Record<string, string>>(
    readFileSync(new URL('../docs/fixtures/fixture_A.csv', import.meta.url), 'utf8'),
    { header: true, skipEmptyLines: true },
  );
  if (parsed.errors.length > 0) throw new Error(parsed.errors[0].message);
  if (!parsed.meta.fields) throw new Error('Fixture A has no header row.');
  return { rows: parsed.data, headers: parsed.meta.fields };
}

const emptyConfig = (datasetId: string): SurveyConfigRecord => ({
  dataset_id: datasetId,
  id_columns: ['ID'],
  demographic_columns: [{
    id: 'age',
    project_id: 'project',
    dataset_id: datasetId,
    column_name: 'Age',
    detected_by: 'age header',
    confidence: 1,
    confirmed: true,
    created_at: new Date(0).toISOString(),
  }],
  item_columns: ['Q1', 'Q2'],
  response_scale: { type: 'numeric' },
  subscales: [],
  bands: [],
  allowed_nonresponse: [],
  proration_enabled: false,
  proration_max_missing_pct: 20,
  dq_thresholds: {},
  linked_template_id: null,
  updated_at: 0,
});

describe('automatic overall subscale', () => {
  it('reproduces Fixture A as one normal Sum and Mean subscale', async () => {
    const { rows, headers } = fixtureA();
    const automatic = buildAutoScale(headers, ['ID', 'Age'], rows);
    const result = scoreDataset(
      rows,
      headers,
      [{ ...automatic, showOutputs: ['sum', 'mean'] }],
      {},
      [],
      { rowIds: rows.map((row) => row.ID) },
    );

    expect(automatic).toMatchObject({
      id: 'auto-overall',
      name: 'Overall scale',
      items: headers
        .filter((header) => !['ID', 'Age'].includes(header))
        .map((column, order) => ({ column, order, reverse: false })),
      scoringMethod: 'sum',
      responseScale: { scaleType: 'numeric', minValue: 1, maxValue: 5, confirmed: true },
    });
    expect(result.rows.map((row) => row['Overall scale Sum'])).toEqual([
      33, 34, 27, 28, 37, 36, 37, 28, 37, 34, 31, 25, 25, 26, 39,
      34, 30, 26, 33, 29, 21, 34, 31, 32, null, null, 30, 34, null, null,
    ]);
    expect(result.rows.map((row) => row['Overall scale Mean'])).toEqual([
      3.3, 3.4, 2.7, 2.8, 3.7, 3.6, 3.7, 2.8, 3.7, 3.4, 3.1, 2.5,
      2.5, 2.6, 3.9, 3.4, 3, 2.6, 3.3, 2.9, 2.1, 3.4, 3.1, 3.2,
      null, null, 3, 3.4, null, null,
    ]);
    expect(getUnscoredRowSummary(result, rows.map((row) => row.ID))).toBe(
      '4 rows have at least one score missing because an item is missing, N/A or outside the scale: P25, P26, P29, P30',
    );
    expect(isAutomaticSubscale(automatic)).toBe(true);
  });

  it('uses per-output bands on the automatic subscale', () => {
    const { rows, headers } = fixtureA();
    const automatic = { ...buildAutoScale(headers, ['ID', 'Age'], rows), showOutputs: ['sum', 'mean'] as const };
    const result = scoreDataset(rows, headers, [automatic], {}, [], {
      bandsByOutput: {
        [automatic.id]: {
          sum: [{ name: 'Higher', minScore: 30, maxScore: 50, color: '#000000' }],
          mean: [{ name: 'Higher', minScore: 3, maxScore: 5, color: '#000000' }],
        },
      },
    });

    expect(result.headers).toEqual(expect.arrayContaining([
      'Overall scale Sum',
      'Overall scale Sum interpretation',
      'Overall scale Mean',
      'Overall scale Mean interpretation',
    ]));
    expect(result.rows[0]['Overall scale Sum interpretation']).toBe('Higher');
    expect(result.rows[0]['Overall scale Mean interpretation']).toBe('Higher');
  });

  it('rebuilds defaults when an old saved config has no subscales', () => {
    const { rows, headers } = fixtureA();
    const adapted = fromSurveyConfigRecord(emptyConfig('dataset'), {
      headers,
      rows,
      idColumns: ['ID'],
    });

    expect(adapted.overallScale).toBeNull();
    expect(adapted.subscales).toHaveLength(1);
    expect(adapted.subscales[0]).toMatchObject({
      id: 'auto-overall',
      name: 'Overall scale',
      items: headers
        .filter((header) => !['ID', 'Age'].includes(header))
        .map((column, order) => ({ column, order, reverse: false })),
      scoringMethod: 'sum',
      minValue: 1,
      maxValue: 5,
      confirmed: true,
    });
  });

  it('invalidates the score cache when automatic settings change', async () => {
    const { rows, headers } = fixtureA();
    const dataset: Dataset = {
      id: 'dataset',
      project_id: 'project',
      file_name: 'fixture.csv',
      sheet_name: null,
      headers,
      rows,
      column_meta: {},
      row_ids: rows.map((row) => row.ID),
      row_count: rows.length,
      col_count: headers.length,
      linked_template_id: null,
      created_at: new Date(0).toISOString(),
    };
    const initial = ensureAutomaticSubscale(emptyConfig(dataset.id), dataset);
    const changed = {
      ...initial,
      subscales: initial.subscales.map((subscale) => ({
        ...subscale,
        response_scale: { ...subscale.response_scale, max_value: 6 },
      })),
    };
    const initialHashes = await createScoreHashes(
      dataset,
      initial,
      buildSubscaleConfigs(initial, dataset),
      [],
    );
    const changedHashes = await createScoreHashes(
      dataset,
      changed,
      buildSubscaleConfigs(changed, dataset),
      [],
    );

    expect(changedHashes.config_hash).not.toBe(initialHashes.config_hash);
  });
});
