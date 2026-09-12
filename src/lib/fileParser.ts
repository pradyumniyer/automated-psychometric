// File parsing — CSV and XLSX import with multi-tab support via SheetJS
import * as XLSX from 'xlsx';

export interface ParsedSheet {
  sheetName: string;
  headers: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  colCount: number;
  columnMeta?: Record<string, { label?: string }>;
}

export interface SheetInfo { name: string; rows: number; cols: number; }

export interface HeaderLayoutDetection {
  headerRow: number;
  labelRow: number | null;
  dataStartRow: number;
  preset: 'simple' | 'two-row' | 'auto-detect';
  confidence: number;
  reason: string;
}

export interface EmptyRowReport {
  count: number;
  rowNumbers: number[];
}

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

/** Read a sheet as a raw grid (array-of-arrays) with no header assumption */
export async function getRawSheet(file: File, sheetName: string): Promise<unknown[][]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheet = wb.Sheets[sheetName];
  if (!sheet) throw new Error(`Sheet "${sheetName}" not found`);
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null }) as unknown[][];
}

function isRowEmpty(row: unknown[]): boolean {
  return row.every((v) => v == null || String(v).trim() === '');
}

function rowTextLength(row: unknown[]): number {
  return row.reduce<number>((sum, v) => sum + (v != null ? String(v).trim().length : 0), 0);
}

function nonEmptyCellCount(row: unknown[]): number {
  return row.filter((v) => v != null && String(v).trim() !== '').length;
}

function avgWordCount(row: unknown[]): number {
  const words = row
    .filter((v) => v != null && String(v).trim() !== '')
    .map((v) => String(v).trim().split(/\s+/).length);
  return words.length > 0 ? words.reduce((a, b) => a + b, 0) / words.length : 0;
}

function looksLikeVariableNames(row: unknown[]): boolean {
  const filled = row.filter((v) => v != null && String(v).trim() !== '').map((v) => String(v).trim());
  if (filled.length === 0) return false;
  const shortCount = filled.filter((v) => v.length <= 30).length;
  const varLike = filled.filter((v) =>
    /^[A-Za-z_][A-Za-z0-9_]*$/.test(v) ||
    /^[Qq]\d+/i.test(v) ||
    /^(item|var|v|col|question|q|scale|sub)[_\s-]?\d+$/i.test(v) ||
    v.includes('_')
  ).length;
  return shortCount / filled.length > 0.7 && (varLike / filled.length > 0.3 || avgWordCount(row) < 3);
}

function looksLikeQuestionText(row: unknown[]): boolean {
  const filled = row.filter((v) => v != null && String(v).trim() !== '').map((v) => String(v).trim());
  if (filled.length === 0) return false;
  const longCount = filled.filter((v) => v.length > 30).length;
  const hasQuestionMarks = filled.filter((v) => v.includes('?')).length;
  return (longCount / filled.length > 0.3) || (hasQuestionMarks / filled.length > 0.2) || avgWordCount(row) > 5;
}

function looksLikeAllNumbers(row: unknown[]): boolean {
  const filled = row.filter((v) => v != null && String(v).trim() !== '');
  if (filled.length === 0) return true;
  const numCount = filled.filter((v) => !isNaN(Number(v))).length;
  return numCount / filled.length > 0.8;
}

/** Score a row for how "header-like" it is (higher = more likely header) */
function headerScore(row: unknown[]): number {
  if (isRowEmpty(row)) return -10;
  if (looksLikeAllNumbers(row)) return -5;
  let score = 0;
  const filled = nonEmptyCellCount(row);
  if (filled > 0) score += Math.min(filled / 3, 3);
  if (looksLikeVariableNames(row)) score += 8;
  if (avgWordCount(row) < 3) score += 2;
  if (avgWordCount(row) > 6) score -= 3;
  if (looksLikeQuestionText(row)) score -= 2;
  return score;
}

/** Detect the most likely header layout from raw grid rows */
export function detectHeaderLayout(rawRows: unknown[][]): HeaderLayoutDetection {
  if (rawRows.length === 0) {
    return { headerRow: 0, labelRow: null, dataStartRow: 1, preset: 'simple', confidence: 0, reason: 'Empty sheet' };
  }

  // Skip leading blank rows
  let firstNonBlank = 0;
  while (firstNonBlank < rawRows.length && isRowEmpty(rawRows[firstNonBlank])) firstNonBlank++;
  if (firstNonBlank >= rawRows.length) {
    return { headerRow: 0, labelRow: null, dataStartRow: 1, preset: 'simple', confidence: 0, reason: 'All rows are empty' };
  }

  // Score candidate rows in the first 10 non-empty rows
  const candidateEnd = Math.min(firstNonBlank + 10, rawRows.length);
  let bestIdx = firstNonBlank;
  let bestScore = -Infinity;
  for (let i = firstNonBlank; i < candidateEnd; i++) {
    const s = headerScore(rawRows[i]);
    if (s > bestScore) { bestScore = s; bestIdx = i; }
  }

  // Check for two-row header: question text on bestIdx-1, variable names on bestIdx
  if (bestIdx > firstNonBlank) {
    const prevRow = rawRows[bestIdx - 1];
    if (looksLikeQuestionText(prevRow) && looksLikeVariableNames(rawRows[bestIdx])) {
      return {
        headerRow: bestIdx,
        labelRow: bestIdx - 1,
        dataStartRow: bestIdx + 1,
        preset: 'two-row',
        confidence: 0.85,
        reason: 'Detected two-row header: question text above variable names',
      };
    }
  }

  // Check if the row AFTER bestIdx is question text (labels below names, less common)
  // Or check bestIdx itself is question text and bestIdx+1 is variable names
  if (bestIdx < rawRows.length - 1) {
    if (looksLikeQuestionText(rawRows[bestIdx]) && looksLikeVariableNames(rawRows[bestIdx + 1])) {
      return {
        headerRow: bestIdx + 1,
        labelRow: bestIdx,
        dataStartRow: bestIdx + 2,
        preset: 'two-row',
        confidence: 0.8,
        reason: 'Detected two-row header: question text then variable names',
      };
    }
  }

  // Simple single-row header
  const dataStart = bestIdx + 1;
  const reason = bestIdx === 0
    ? 'First row looks like column names'
    : `Row ${bestIdx + 1} looks like column names (skipped ${bestIdx} leading row${bestIdx > 1 ? 's' : ''})`;

  return {
    headerRow: bestIdx,
    labelRow: null,
    dataStartRow: dataStart,
    preset: bestIdx === 0 ? 'simple' : 'auto-detect',
    confidence: bestScore > 5 ? 0.9 : bestScore > 2 ? 0.7 : 0.5,
    reason,
  };
}

/** Analyze empty rows in the data region (returns 1-based row numbers as seen in the file) */
export function analyzeEmptyRows(rawRows: unknown[][], dataStartRow: number): EmptyRowReport {
  const emptyRowNumbers: number[] = [];
  for (let i = dataStartRow; i < rawRows.length; i++) {
    if (isRowEmpty(rawRows[i])) {
      emptyRowNumbers.push(i + 1); // 1-based file row number
    }
  }
  return { count: emptyRowNumbers.length, rowNumbers: emptyRowNumbers };
}

/** Deduplicate headers and fill blanks */
function buildHeaders(rawRow: unknown[]): string[] {
  const rawHeaders = (rawRow || []).map((v, i) => {
    if (v == null || String(v).trim() === '') return `Column_${i + 1}`;
    return String(v).trim();
  });
  const seen = new Map<string, number>();
  return rawHeaders.map((h) => {
    const count = seen.get(h) || 0;
    seen.set(h, count + 1);
    return count > 0 ? `${h}_${count}` : h;
  });
}

export interface ConfigurableParseOptions {
  sheetName: string;
  headerRow: number;
  labelRow: number | null;
  dataStartRow: number;
  removeEmptyRows: boolean;
}

/** Parse a sheet with user-chosen header/data-start settings */
export function parseSheetConfigurable(
  rawRows: unknown[][],
  options: ConfigurableParseOptions,
): ParsedSheet {
  const { sheetName, headerRow, labelRow, dataStartRow, removeEmptyRows } = options;

  if (rawRows.length === 0) {
    return { sheetName, headers: [], rows: [], rowCount: 0, colCount: 0 };
  }
  if (headerRow >= rawRows.length) {
    throw new Error(`Header row ${headerRow + 1} is beyond the end of the file (${rawRows.length} rows).`);
  }
  if (dataStartRow <= headerRow) {
    throw new Error('Data start row must be after the header row.');
  }

  const headers = buildHeaders(rawRows[headerRow]);
  const colCount = headers.length;

  // Build column_meta with labels if a label row was specified
  let columnMeta: Record<string, { label?: string }> | undefined;
  if (labelRow != null && labelRow >= 0 && labelRow < rawRows.length && labelRow !== headerRow) {
    columnMeta = {};
    const labelCells = rawRows[labelRow];
    for (let i = 0; i < headers.length; i++) {
      const labelVal = labelCells?.[i];
      if (labelVal != null && String(labelVal).trim() !== '') {
        columnMeta[headers[i]] = { label: String(labelVal).trim() };
      }
    }
  }

  const dataSlice = rawRows.slice(dataStartRow);
  let rows: Record<string, unknown>[] = dataSlice.map((row) => {
    const obj: Record<string, unknown> = {};
    headers.forEach((h, i) => { obj[h] = row[i] !== undefined ? row[i] : null; });
    return obj;
  });

  if (removeEmptyRows) {
    rows = rows.filter((row) => headers.some((h) => row[h] != null && String(row[h]).trim() !== ''));
  }

  return {
    sheetName,
    headers,
    rows,
    rowCount: rows.length,
    colCount,
    columnMeta,
  };
}

// Parse a specific sheet from a file — legacy interface (header on row 0)
export async function parseSheet(file: File, sheetName: string): Promise<ParsedSheet> {
  const rawRows = await getRawSheet(file, sheetName);
  return parseSheetConfigurable(rawRows, {
    sheetName,
    headerRow: 0,
    labelRow: null,
    dataStartRow: 1,
    removeEmptyRows: false,
  });
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
