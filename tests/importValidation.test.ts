import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateImportFile } from '../src/lib/importLimits';

const fixtureDirectory = new URL('./fixtures/import/', import.meta.url);

function makeFile(name: string, contents: string | Uint8Array): File {
  return new File([contents], name);
}

describe('import file validation', () => {
  it('accepts supported CSV and XLSX fixtures', async () => {
    const csv = makeFile('valid.csv', readFileSync(new URL('csv-bom.csv', fixtureDirectory)));
    const xlsx = makeFile('valid.xlsx', readFileSync(new URL('xlsx-multi-sheet.xlsx', fixtureDirectory)));

    await expect(validateImportFile(csv)).resolves.toBeUndefined();
    await expect(validateImportFile(xlsx)).resolves.toBeUndefined();
  });

  it('rejects legacy XLS files and unrecognized extensions', async () => {
    await expect(validateImportFile(makeFile('old.xls', 'data'))).rejects.toThrow(/CSV or XLSX/i);
    await expect(validateImportFile(makeFile('data.txt', 'data'))).rejects.toThrow(/CSV or XLSX/i);
  });

  it('rejects XLSX files without a ZIP signature or central directory', async () => {
    await expect(validateImportFile(makeFile('bad.xlsx', 'not a workbook'))).rejects.toThrow(/valid Excel.*file/i);
    await expect(validateImportFile(makeFile('truncated.xlsx', new Uint8Array([0x50, 0x4b, 0x03, 0x04]))))
      .rejects.toThrow(/invalid ZIP directory/i);
  });

  it('allows a UTF-8 BOM but rejects invalid UTF-8 and NUL bytes in CSV', async () => {
    await expect(validateImportFile(makeFile('bom.csv', '\uFEFFid,score\n1,5')))
      .resolves.toBeUndefined();
    await expect(validateImportFile(makeFile('invalid.csv', new Uint8Array([0x61, 0xff]))))
      .rejects.toThrow(/UTF-8/i);
    await expect(validateImportFile(makeFile('binary.csv', new Uint8Array([0x61, 0x00, 0x62]))))
      .rejects.toThrow(/binary/i);
  });
});
