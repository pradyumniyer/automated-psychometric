import { inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import writeXlsxFile from 'write-excel-file/browser';
import {
  createCsvContent,
  createCsvExportFiles,
  createSummaryCsvContent,
  createXlsxSheetData,
  createXlsxSummarySheetData,
  createXlsxWorkbook,
} from '../src/lib/fileParser';

async function readZipTextEntry(blob: Blob, wantedName: string): Promise<string> {
  const buffer = Buffer.from(await blob.arrayBuffer());
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const searchStart = Math.max(0, buffer.length - 65_557);
  let endRecord = -1;
  for (let offset = buffer.length - 22; offset >= searchStart; offset--) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      endRecord = offset;
      break;
    }
  }
  if (endRecord < 0) throw new Error('Workbook has no ZIP directory.');

  const entries = view.getUint16(endRecord + 10, true);
  let cursor = view.getUint32(endRecord + 16, true);
  for (let index = 0; index < entries; index++) {
    const compressedSize = view.getUint32(cursor + 20, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const name = buffer.toString('utf8', cursor + 46, cursor + 46 + nameLength);
    const localOffset = view.getUint32(cursor + 42, true);
    if (name === wantedName) {
      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      const contentStart = localOffset + 30 + localNameLength + localExtraLength;
      const content = buffer.subarray(contentStart, contentStart + compressedSize);
      const method = view.getUint16(cursor + 10, true);
      return (method === 0 ? content : inflateRawSync(content)).toString('utf8');
    }
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error(`Workbook is missing ${wantedName}.`);
}

describe('export hardening', () => {
  it('neutralizes CSV formulas while preserving numeric values and quoted fields', () => {
    const csv = createCsvContent(
      ['@id', 'formula', 'plus', 'negative text', 'negative number', 'number', 'comment', 'at'],
      [{
        '@id': 7,
        formula: '=1+1',
        plus: '+cmd',
        'negative text': '-cmd',
        'negative number': '-12',
        number: -12,
        comment: 'first line\nsecond line',
        at: '@cmd',
      }],
    );

    expect(csv).toBe(
      '\'@id,formula,plus,negative text,negative number,number,comment,at\r\n' +
      '7,\'=1+1,\'+cmd,\'-cmd,-12,-12,"first line\nsecond line",\'@cmd',
    );
  });

  it('adds the Excluded column in keep mode and drops excluded rows in drop mode', () => {
    const headers = ['id', 'response'];
    const rows = [
      { id: 1, response: 'ok' },
      { id: 2, response: 'kept' },
    ];
    const excludedRows = new Set([1]);

    expect(createCsvContent(headers, rows, { excludedRows, keepExcluded: true })).toBe(
      'id,response,Excluded\r\n1,ok,false\r\n2,kept,true',
    );
    expect(createCsvContent(headers, rows, { excludedRows, keepExcluded: false })).toBe(
      'id,response\r\n1,ok',
    );
  });

  it('writes formula-like XLSX text as strings and fills retained excluded rows yellow', async () => {
    const data = createXlsxSheetData(
      ['id', 'formula', 'number', 'at'],
      [
        { id: 1, formula: '=1+1', number: 4, at: '@cmd' },
        { id: 2, formula: '+cmd', number: -3, at: '@user' },
      ],
      { excludedRows: new Set([1]), keepExcluded: true },
    );

    expect(data[1][1]).toMatchObject({ value: '=1+1', type: String });
    expect(data[1][2]).toMatchObject({ value: 4, type: Number });
    expect(data[2].every((cell) => typeof cell === 'object' && cell?.backgroundColor === '#FFFF00')).toBe(true);
    expect(data[2][1]).toMatchObject({ value: '+cmd', type: String });
    expect(data[2][2]).toMatchObject({ value: -3, type: Number });
    expect(data[2][3]).toMatchObject({ value: '@user', type: String });

    const workbook = await writeXlsxFile(data, { sheet: 'Scored Data' }).toBlob();
    const worksheetXml = await readZipTextEntry(workbook, 'xl/worksheets/sheet1.xml');
    const stylesXml = await readZipTextEntry(workbook, 'xl/styles.xml');
    expect(worksheetXml).toMatch(/<c r="B2"[^>]*t="s"/);
    expect(worksheetXml).toMatch(/<c r="B3" s="\d+" t="s"/);
    expect(worksheetXml).not.toMatch(/<f\b/);
    expect(stylesXml).toContain('rgb="FFFFFF00"');
    expect(stylesXml).not.toContain('<numFmts');
  });

  it('drops excluded rows from XLSX when keep mode is disabled', () => {
    const data = createXlsxSheetData(
      ['id'],
      [{ id: 1 }, { id: 2 }],
      { excludedRows: new Set([1]), keepExcluded: false },
    );

    expect(data).toEqual([
      [{ value: 'id', type: String }],
      [{ value: 1, type: Number }],
    ]);
  });

  it('keeps the main CSV pure and creates a protected companion only with summary content', () => {
    const summary = {
      rows: [
        ['Summary statistics (1 included respondent)'],
        [],
        ['ID', 'Value'],
        ['Sum', 4],
        [],
        ['Notes'],
        ['=1+1'],
      ],
    };
    const files = createCsvExportFiles(
      ['ID', 'Value'],
      [{ ID: 'P1', Value: 4 }, { ID: 'P2', Value: 8 }],
      'scores.csv',
      { numericColumns: new Set(['Value']), summary },
    );

    expect(files).toHaveLength(2);
    expect(files[0].fileName).toBe('scores.csv');
    expect(files[0].content).toBe('ID,Value\r\nP1,4\r\nP2,8');
    expect(files[1].fileName).toBe('scores_summary.csv');
    expect(files[1].content).toBe(
      'Summary statistics (1 included respondent)\r\n\r\nID,Value\r\nSum,4\r\n\r\nNotes\r\n\'=1+1',
    );
    expect(files[1].content).toContain("'=1+1");
    expect(createCsvExportFiles(
      ['ID', 'Value'],
      [{ ID: 'P1', Value: 4 }],
      'scores.csv',
    )).toHaveLength(1);
  });

  it('writes a typed Summary sheet beside pure data, and omits it when disabled', async () => {
    const summary = {
      rows: [
        ['Summary statistics (1 included respondent)'],
        [],
        ['ID', 'Value'],
        ['Sum', 4],
        [],
        ['Notes'],
        ['=1+1'],
      ],
    };
    const summaryData = createXlsxSummarySheetData(summary);
    expect(summaryData[3][1]).toMatchObject({ value: 4, type: Number });
    expect(summaryData[6][0]).toMatchObject({ value: '=1+1', type: String });

    const workbook = await createXlsxWorkbook(
      ['ID', 'Value'],
      [{ ID: 'P1', Value: 4 }, { ID: 'P2', Value: 8 }],
      { numericColumns: new Set(['Value']), summary },
    ).toBlob();
    const workbookXml = await readZipTextEntry(workbook, 'xl/workbook.xml');
    const firstSheet = await readZipTextEntry(workbook, 'xl/worksheets/sheet1.xml');
    const secondSheet = await readZipTextEntry(workbook, 'xl/worksheets/sheet2.xml');
    expect(workbookXml).toContain('name="Scored Data"');
    expect(workbookXml).toContain('name="Summary"');
    expect((firstSheet.match(/<row\b/g) || []).length).toBe(3);
    expect(firstSheet).not.toContain('Summary statistics');
    expect(secondSheet).toMatch(/<c r="B4"[^>]*><v>4<\/v><\/c>/);
    expect(secondSheet).not.toMatch(/<f\b/);

    const dataOnlyWorkbook = await createXlsxWorkbook(
      ['ID', 'Value'],
      [{ ID: 'P1', Value: 4 }],
      { numericColumns: new Set(['Value']) },
    ).toBlob();
    const dataOnlyXml = await readZipTextEntry(dataOnlyWorkbook, 'xl/workbook.xml');
    expect(dataOnlyXml).toContain('name="Scored Data"');
    expect(dataOnlyXml).not.toContain('name="Summary"');
  });

  it('neutralizes formula-like cells throughout the summary CSV', () => {
    expect(createSummaryCsvContent({
      rows: [['=header'], ['=formula'], [4]],
    })).toBe("'=header\r\n'=formula\r\n4");
  });
});
