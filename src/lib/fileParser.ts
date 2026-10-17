// File parsing — CSV and XLSX import with multi-tab support.
import Papa from 'papaparse';
import readXlsxFile from 'read-excel-file/browser';
import writeXlsxFile, { type Cell, type SheetData } from 'write-excel-file/browser';
import { validateImportFile, validateParsedSheets } from './importLimits';
import type { SummaryExportContent } from './summaryStatistics';

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

export interface EmptyColumnReport {
  count: number;
  columnIndices: number[];
}

// Get list of sheet names and dimensions from a workbook (for multi-tab selection)
export async function getSheetInfo(file: File): Promise<{ fileName: string; sheets: SheetInfo[] }> {
  const rawSheets = await readRawSheets(file);
  const sheets = rawSheets.map(({ sheet: name, data }) => ({
    name,
    rows: data.length > 1 ? data.length - 1 : 0,
    cols: data[0]?.length || 0,
  }));
  return { fileName: file.name, sheets };
}

/** Read a sheet as a raw grid (array-of-arrays) with no header assumption */
export async function getRawSheet(file: File, sheetName: string): Promise<unknown[][]> {
  const sheets = await readRawSheets(file);
  const sheet = sheets.find(({ sheet: name }) => name === sheetName);
  if (!sheet) throw new Error(`Sheet "${sheetName}" not found`);
  return sheet.data;
}

async function readRawSheets(file: File): Promise<{ sheet: string; data: unknown[][] }[]> {
  await validateImportFile(file);
  const extension = file.name.slice(file.name.lastIndexOf('.') + 1).toLowerCase();
  const sheets = extension === 'csv'
    ? [{ sheet: 'Sheet1', data: parseCsvGrid(await file.text()) }]
    : (await readXlsxFile(file)).map(({ sheet, data }) => ({
      sheet,
      data: data.map((row) => row.map(normalizeSpreadsheetValue)),
    }));
  validateParsedSheets(sheets);
  return sheets;
}

function normalizeSpreadsheetValue(value: unknown): unknown {
  if (value instanceof Date) {
    return formatSpreadsheetDate(value);
  }
  return value;
}

export function formatSpreadsheetDate(value: Date): string {
  const year = String(value.getUTCFullYear()).padStart(4, '0');
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');
  const day = String(value.getUTCDate()).padStart(2, '0');
  const date = `${year}-${month}-${day}`;
  const hours = value.getUTCHours();
  const minutes = value.getUTCMinutes();
  const seconds = value.getUTCSeconds();

  if (hours === 0 && minutes === 0 && seconds === 0 && value.getUTCMilliseconds() === 0) {
    return date;
  }

  return `${date} ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function parseCsvGrid(contents: string): unknown[][] {
  const parsed = Papa.parse<unknown[]>(contents, {
    dynamicTyping: true,
    skipEmptyLines: false,
  });
  const rows = parsed.data.map((row) => row.map((value) => value === '' ? null : value));
  while (rows.length > 0 && rows[rows.length - 1].every((value) => value == null)) rows.pop();
  const columnCount = rows.reduce((maximum, row) => Math.max(maximum, row.length), 0);
  return rows.map((row) => Array.from({ length: columnCount }, (_, index) => row[index] ?? null));
}

function isRowEmpty(row: unknown[]): boolean {
  return row.every((v) => v == null || String(v).trim() === '');
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

/** Analyze empty rows in the data region (returns 1-based row numbers as seen in the file).
 *  Trailing fully-empty rows are automatically excluded from the report and from the data region. */
export function analyzeEmptyRows(rawRows: unknown[][], dataStartRow: number): EmptyRowReport {
  // Find last non-empty row — trailing empties are trimmed automatically
  let lastNonEmpty = dataStartRow - 1;
  for (let i = rawRows.length - 1; i >= dataStartRow; i--) {
    if (!isRowEmpty(rawRows[i])) { lastNonEmpty = i; break; }
  }
  const emptyRowNumbers: number[] = [];
  for (let i = dataStartRow; i <= lastNonEmpty; i++) {
    if (isRowEmpty(rawRows[i])) {
      emptyRowNumbers.push(i + 1); // 1-based file row number
    }
  }
  return { count: emptyRowNumbers.length, rowNumbers: emptyRowNumbers };
}

/** Analyze fully empty columns in the data region (0-based column indices). */
export function analyzeEmptyColumns(rawRows: unknown[][], dataStartRow: number, colCount: number): EmptyColumnReport {
  // Find last non-empty row (same logic as analyzeEmptyRows)
  let lastNonEmpty = dataStartRow - 1;
  for (let i = rawRows.length - 1; i >= dataStartRow; i--) {
    if (!isRowEmpty(rawRows[i])) { lastNonEmpty = i; break; }
  }
  const emptyCols: number[] = [];
  for (let c = 0; c < colCount; c++) {
    let hasValue = false;
    for (let r = dataStartRow; r <= lastNonEmpty; r++) {
      const v = rawRows[r]?.[c];
      if (v != null && String(v).trim() !== '') { hasValue = true; break; }
    }
    if (!hasValue) emptyCols.push(c);
  }
  return { count: emptyCols.length, columnIndices: emptyCols };
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
  removeEmptyColumns?: boolean;
}

/** Parse a sheet with user-chosen header/data-start settings */
export function parseSheetConfigurable(
  rawRows: unknown[][],
  options: ConfigurableParseOptions,
): ParsedSheet {
  const { sheetName, headerRow, labelRow, dataStartRow, removeEmptyRows, removeEmptyColumns } = options;

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
  let colCount = headers.length;

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

  // Auto-trim trailing fully-empty rows
  let lastNonEmptyIdx = -1;
  for (let i = dataSlice.length - 1; i >= 0; i--) {
    if (!isRowEmpty(dataSlice[i])) { lastNonEmptyIdx = i; break; }
  }
  const trimmedSlice = lastNonEmptyIdx >= 0 ? dataSlice.slice(0, lastNonEmptyIdx + 1) : dataSlice;

  let rows: Record<string, unknown>[] = trimmedSlice.map((row) => {
    const obj: Record<string, unknown> = {};
    headers.forEach((h, i) => { obj[h] = row[i] !== undefined ? row[i] : null; });
    return obj;
  });

  if (removeEmptyRows) {
    rows = rows.filter((row) => headers.some((h) => row[h] != null && String(row[h]).trim() !== ''));
  }

  // Drop fully empty columns if requested
  if (removeEmptyColumns) {
    const nonEmptyIdx = headers.map((_, i) => {
      return trimmedSlice.some((row) => {
        const v = row[i];
        return v != null && String(v).trim() !== '';
      });
    });
    const keepIdx = nonEmptyIdx.map((keep, i) => keep ? i : -1).filter((i) => i >= 0);
    const newHeaders = keepIdx.map((i) => headers[i]);
    if (columnMeta) {
      const newMeta: Record<string, { label?: string }> = {};
      for (const h of newHeaders) { if (columnMeta[h]) newMeta[h] = columnMeta[h]; }
      columnMeta = newMeta;
    }
    headers.length = 0;
    for (const h of newHeaders) headers.push(h);
    colCount = headers.length;
    rows = rows.map((row) => {
      const out: Record<string, unknown> = {};
      keepIdx.forEach((origIdx, newIdx) => { out[headers[newIdx]] = row[headers[origIdx]] !== undefined ? row[headers[origIdx]] : null; });
      return out;
    });
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
    removeEmptyColumns: false,
  });
}

// Legacy single-file parse (uses first sheet)
export async function parseFile(file: File): Promise<ParsedSheet> {
  const info = await getSheetInfo(file);
  if (info.sheets.length === 0) throw new Error('No sheets found in file');
  return parseSheet(file, info.sheets[0].name);
}

export interface ExportOptions {
  excludedRows?: ReadonlySet<number>;
  keepExcluded?: boolean;
  numericColumns?: ReadonlySet<string>;
  summary?: SummaryExportContent;
}

function sanitizeCsvText(value: string): string {
  if (/^[=+@]/.test(value) || (value.startsWith('-') && !Number.isFinite(Number(value)))) {
    return `'${value}`;
  }
  return value;
}

function numericValue(value: unknown, header: string, numericColumns?: ReadonlySet<string>): unknown {
  if (typeof value === 'string' && numericColumns?.has(header)) {
    const trimmed = value.trim();
    if (/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(trimmed)) {
      const numeric = Number(trimmed);
      if (Number.isFinite(numeric)) return numeric;
    }
  }
  return value ?? '';
}

function csvValue(value: unknown, header: string, numericColumns?: ReadonlySet<string>): unknown {
  const cellValue = numericValue(value, header, numericColumns);
  return typeof cellValue === 'string' ? sanitizeCsvText(cellValue) : cellValue;
}

export function createCsvContent(
  headers: string[],
  rows: Record<string, unknown>[],
  options: ExportOptions = {},
): string {
  const excludedRows = options.excludedRows ?? new Set<number>();
  const keepExcluded = options.keepExcluded ?? false;
  const outputHeaders = keepExcluded ? [...headers, 'Excluded'] : headers;
  const outputRows = rows
    .map((row, index) => ({ row, index }))
    .filter(({ index }) => keepExcluded || !excludedRows.has(index))
    .map(({ row, index }) => [
      ...headers.map((header) => csvValue(row[header], header, options.numericColumns)),
      ...(keepExcluded ? [excludedRows.has(index)] : []),
    ]);
  return Papa.unparse([
    outputHeaders.map(sanitizeCsvText),
    ...outputRows,
  ]);
}

export interface CsvExportFile {
  fileName: string;
  content: string;
}

export function createSummaryCsvContent(summary: SummaryExportContent): string {
  return Papa.unparse(summary.rows.map((row) =>
    row.map((value) => typeof value === 'string' ? sanitizeCsvText(value) : value),
  ));
}

export function createCsvExportFiles(
  headers: string[],
  rows: Record<string, unknown>[],
  fileName: string,
  options: ExportOptions = {},
): CsvExportFile[] {
  const files: CsvExportFile[] = [{
    fileName,
    content: createCsvContent(headers, rows, options),
  }];
  if (options.summary) {
    files.push({
      fileName: `${fileName.replace(/\.csv$/i, '')}_summary.csv`,
      content: createSummaryCsvContent(options.summary),
    });
  }
  return files;
}

function xlsxCell(value: unknown): Cell {
  if (typeof value === 'number' && Number.isFinite(value)) return { value, type: Number };
  if (typeof value === 'boolean') return { value, type: Boolean };
  return { value: value == null ? '' : String(value), type: String };
}

export function createXlsxSheetData(
  headers: string[],
  rows: Record<string, unknown>[],
  options: ExportOptions = {},
): SheetData {
  const excludedRows = options.excludedRows ?? new Set<number>();
  const keepExcluded = options.keepExcluded ?? false;
  const sheetData: SheetData = [headers.map((header) => xlsxCell(header))];
  rows.forEach((row, index) => {
    if (!keepExcluded && excludedRows.has(index)) return;
    sheetData.push(headers.map((header) => {
      const value = numericValue(row[header], header, options.numericColumns);
      const cell = xlsxCell(value);
      return keepExcluded && excludedRows.has(index) && typeof cell === 'object' && cell
        ? { ...cell, backgroundColor: '#FFFF00' }
        : cell;
    }));
  });
  return sheetData;
}

export function createXlsxSummarySheetData(summary: SummaryExportContent): SheetData {
  return summary.rows.map((row) => row.map(xlsxCell));
}

export function createXlsxWorkbook(
  headers: string[],
  rows: Record<string, unknown>[],
  options: ExportOptions = {},
) {
  const dataSheet = createXlsxSheetData(headers, rows, options);
  if (!options.summary) return writeXlsxFile(dataSheet, { sheet: 'Scored Data' });
  return writeXlsxFile([
    { sheet: 'Scored Data', data: dataSheet },
    { sheet: 'Summary', data: createXlsxSummarySheetData(options.summary) },
  ]);
}

// Export to CSV
export function exportToCSV(
  headers: string[],
  rows: Record<string, unknown>[],
  fileName: string,
  options: ExportOptions = {},
) {
  for (const file of createCsvExportFiles(headers, rows, fileName, options)) {
    const blob = new Blob([file.content], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = file.fileName;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

// Export to XLSX
export function exportToXLSX(
  headers: string[],
  rows: Record<string, unknown>[],
  fileName: string,
  options: ExportOptions = {},
): Promise<void> {
  return createXlsxWorkbook(headers, rows, options).toFile(fileName);
}
