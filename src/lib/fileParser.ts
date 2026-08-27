// File parsing — CSV and XLSX import with multi-tab support via SheetJS
import * as XLSX from 'xlsx';

export interface ParsedSheet {
  sheetName: string;
  headers: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  colCount: number;
}

export interface SheetInfo { name: string; rows: number; cols: number; }

// Get list of sheet names and dimensions from a workbook (for multi-tab selection)
export async function getSheetInfo(file: File): Promise<{ fileName: string; sheets: SheetInfo[] }> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheets = wb.SheetNames.map((name) => {
    const sheet = wb.Sheets[name];
    const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null }) as unknown[][];
    const rows = aoa.length > 1 ? aoa.length - 1 : 0;
    const cols = aoa[0]?.length || 0;
    return { name, rows, cols };
  });
  return { fileName: file.name, sheets };
}

// Parse a specific sheet from a file (re-reads from buffer)
export async function parseSheet(file: File, sheetName: string): Promise<ParsedSheet> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheet = wb.Sheets[sheetName];
  if (!sheet) throw new Error(`Sheet "${sheetName}" not found`);

  const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null }) as unknown[][];
  if (aoa.length === 0) return { sheetName, headers: [], rows: [], rowCount: 0, colCount: 0 };

  const rawHeaders = (aoa[0] || []).map((v, i) => {
    if (v == null || v === '') return `Column_${i + 1}`;
    return String(v).trim();
  });

  // Deduplicate headers
  const seen = new Map<string, number>();
  const headers = rawHeaders.map((h) => {
    const count = seen.get(h) || 0;
    seen.set(h, count + 1);
    return count > 0 ? `${h}_${count}` : h;
  });

  const dataRows = aoa.slice(1);
  const rows: Record<string, unknown>[] = dataRows.map((row) => {
    const obj: Record<string, unknown> = {};
    headers.forEach((h, i) => { obj[h] = row[i] !== undefined ? row[i] : null; });
    return obj;
  });

  return { sheetName, headers, rows, rowCount: rows.length, colCount: headers.length };
}

// Legacy single-file parse (uses first sheet)
export async function parseFile(file: File): Promise<ParsedSheet> {
  const info = await getSheetInfo(file);
  if (info.sheets.length === 0) throw new Error('No sheets found in file');
  return parseSheet(file, info.sheets[0].name);
}

// Export to CSV
export function exportToCSV(headers: string[], rows: Record<string, unknown>[], fileName: string) {
  const ws = XLSX.utils.json_to_sheet(
    rows.map((r) => { const out: Record<string, unknown> = {}; headers.forEach((h) => (out[h] = r[h])); return out; }),
    { header: headers },
  );
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data');
  XLSX.writeFile(wb, fileName);
}

// Export to XLSX
export function exportToXLSX(headers: string[], rows: Record<string, unknown>[], fileName: string) {
  const ws = XLSX.utils.json_to_sheet(
    rows.map((r) => { const out: Record<string, unknown> = {}; headers.forEach((h) => (out[h] = r[h])); return out; }),
    { header: headers },
  );
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Scored Data');
  XLSX.writeFile(wb, fileName);
}
