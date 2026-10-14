import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getRawSheet, getSheetInfo } from '../src/lib/fileParser';

interface ParityCase {
  name: string;
  fileName: string;
  sheets: Record<string, unknown[][]>;
}

const fixtureDirectory = new URL('./fixtures/import/', import.meta.url);
const parityCases = JSON.parse(
  readFileSync(new URL('expected.json', fixtureDirectory), 'utf8'),
) as ParityCase[];

const ownerApprovedDifferences: Record<string, Record<string, unknown[][]>> = {
  'csv-unicode': {
    Sheet1: [
      ['name', 'language'],
      ['José', 'Español'],
      ['आर्या', 'हिन्दी'],
    ],
  },
  'csv-dates': {
    Sheet1: [
      ['id', 'date'],
      [1, '2024-02-29'],
      [2, '14/10/2026'],
    ],
  },
};

describe('spreadsheet import parity', () => {
  it.each(parityCases)('$name matches the recorded legacy grid or approved difference', async ({ name, fileName, sheets }) => {
    const file = new File(
      [readFileSync(new URL(fileName, fixtureDirectory))],
      fileName,
    );
    const info = await getSheetInfo(file);

    expect(info.sheets.map(({ name }) => name)).toEqual(Object.keys(sheets));
    for (const [sheetName, expectedGrid] of Object.entries(sheets)) {
      await expect(getRawSheet(file, sheetName)).resolves.toEqual(
        ownerApprovedDifferences[name]?.[sheetName] ?? expectedGrid,
      );
    }
  });
});
