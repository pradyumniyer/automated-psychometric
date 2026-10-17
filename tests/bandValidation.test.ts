import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import Papa from 'papaparse';
import {
  classifyScore,
  getOutputRange,
  suggestBands,
  validateBands,
  type BandValidationOptions,
} from '../src/scientific/bandValidation';
import { scoreDataset } from '../src/scientific/scoring';

describe('interpretation band validation', () => {
  it('skips maximum-range warnings when a custom formula has no known range', () => {
    expect(validateBands([
      { name: 'High', minScore: 50, maxScore: 100 },
    ], null)).toEqual([]);
  });

  it('reports a gap in continuous bands and classifies exact cut-offs in the upper band', () => {
    const options: BandValidationOptions = {
      outputKind: 'continuous',
      possibleRange: { min: 1, max: 5 },
    };
    expect(validateBands([
      { name: 'Low', minScore: 0, maxScore: 2 },
      { name: 'Moderate', minScore: 3, maxScore: 3 },
      { name: 'High', minScore: 4, maxScore: 5 },
    ], options)).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'gap' }),
    ]));
    const bands = [
      { name: 'Low', minScore: 1, maxScore: 2.33 },
      { name: 'Moderate', minScore: 2.33, maxScore: 3.67 },
      { name: 'High', minScore: 3.67, maxScore: 5 },
    ];
    expect(classifyScore(2.33, bands, 'continuous')).toBe('Moderate');
    expect(classifyScore(3.67, bands, 'continuous')).toBe('High');
    expect(classifyScore(5, bands, 'continuous')).toBe('High');
  });

  it('keeps integer Sum bands inclusive and validates their contiguous coverage', () => {
    const options: BandValidationOptions = {
      outputKind: 'integer',
      possibleRange: { min: 5, max: 25 },
    };
    expect(validateBands([
      { name: 'Low', minScore: 5, maxScore: 11 },
      { name: 'Moderate', minScore: 12, maxScore: 18 },
      { name: 'High', minScore: 19, maxScore: 25 },
    ], options)).toEqual([]);
    expect(classifyScore(11, [
      { name: 'Low', minScore: 5, maxScore: 11 },
      { name: 'Moderate', minScore: 12, maxScore: 18 },
    ], 'integer')).toBe('Low');
  });

  it('reports overlaps, inverted bands, and missing known-range coverage', () => {
    const warnings = validateBands([
      { name: 'Low', minScore: 2, maxScore: 1 },
      { name: 'High', minScore: 3, maxScore: 5 },
    ], {
      outputKind: 'continuous',
      possibleRange: { min: 1, max: 5 },
    });
    expect(warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'invalid' }),
      expect.objectContaining({ type: 'out_of_range' }),
    ]));
    expect(validateBands([
      { name: 'Low', minScore: 1, maxScore: 3 },
      { name: 'Moderate', minScore: 2, maxScore: 5 },
    ], {
      outputKind: 'continuous',
      possibleRange: { min: 1, max: 5 },
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'overlap' }),
    ]));
  });

  it('derives integer Sum and continuous Mean ranges', () => {
    expect(getOutputRange('sum', 5, { min: 1, max: 5 })).toEqual({
      min: 5, max: 25, kind: 'integer',
    });
    expect(getOutputRange('mean', 5, { min: 1, max: 5 })).toEqual({
      min: 1, max: 5, kind: 'continuous',
    });
    expect(getOutputRange('custom', 5, { min: 1, max: 5 })).toBeNull();
  });

  it('suggests contiguous equal-width bands over the complete output range', () => {
    expect(suggestBands({
      min: 5, max: 25, kind: 'integer',
    })).toMatchObject([
      { name: 'Low', minScore: 5, maxScore: 11 },
      { name: 'Moderate', minScore: 12, maxScore: 18 },
      { name: 'High', minScore: 19, maxScore: 25 },
    ]);
    expect(suggestBands({
      min: 1, max: 5, kind: 'continuous',
    })).toMatchObject([
      { name: 'Low', minScore: 1, maxScore: 2.33 },
      { name: 'Moderate', minScore: 2.33, maxScore: 3.67 },
      { name: 'High', minScore: 3.67, maxScore: 5 },
    ]);
    expect(validateBands(suggestBands({
      min: 1, max: 5, kind: 'continuous',
    }), {
      outputKind: 'continuous',
      possibleRange: { min: 1, max: 5 },
    })).toEqual([]);
  });

  it('covers every scored Fixture A Sum and Mean result with suggested bands', () => {
    const csv = readFileSync(new URL('../docs/fixtures/fixture_A.csv', import.meta.url), 'utf8');
    const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
    const rows = parsed.data;
    const result = scoreDataset(
      rows,
      parsed.meta.fields!,
      [{
        id: 'subscale-1',
        name: 'Subscale 1',
        items: ['Q1', 'Q2', 'Q3', 'Q4', 'Q5'].map((column, order) => ({ column, order, reverse: false })),
        scoringMethod: 'sum',
        showOutputs: ['sum', 'mean'],
        responseScale: { scaleType: 'numeric', minValue: 1, maxValue: 5 },
      }],
      {},
      [],
      {
        rowIds: rows.map((row) => row.ID),
        bandsByOutput: {
          'subscale-1': {
            sum: suggestBands({ min: 5, max: 25, kind: 'integer' }),
            mean: suggestBands({ min: 1, max: 5, kind: 'continuous' }),
          },
        },
      },
    );
    for (const row of result.rows) {
      if (typeof row['Subscale 1 Sum'] === 'number') {
        expect(['Low', 'Moderate', 'High']).toContain(row['Subscale 1 Sum interpretation']);
      }
      if (typeof row['Subscale 1 Mean'] === 'number') {
        expect(['Low', 'Moderate', 'High']).toContain(row['Subscale 1 Mean interpretation']);
      }
    }
  });
});
