/**
 * Import v2 layout detection — pure function over a cell grid.
 * Spec: docs/IMPORT_DETECTION.md (Layer A)
 */

export type LayoutConfidence = 'high' | 'medium' | 'low';
export type LayoutOrientation = 'wide' | 'transposed';

export interface ImportLayoutDetection {
  headerRows: number[];
  labelRow: number | null;
  importIdRow: number | null;
  dataStartRow: number;
  dataEndRow: number;
  ignoredRows: number[];
  ignoredCols: number[];
  orientation: LayoutOrientation;
  confidence: LayoutConfidence;
  warnings: string[];
  summary: string;
  layoutId: 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6' | 'L7' | 'unknown';
}

function cellText(value: unknown): string {
  if (value == null) return '';
  return String(value).trim();
}

function isEmptyRow(row: unknown[] | undefined): boolean {
  if (!row || row.length === 0) return true;
  return row.every((c) => cellText(c) === '');
}

function isEmptyCol(grid: unknown[][], col: number, fromRow: number, toRow: number): boolean {
  for (let r = fromRow; r <= toRow; r++) {
    if (cellText(grid[r]?.[col]) !== '') return false;
  }
  return true;
}

function nonEmptyCount(row: unknown[]): number {
  return row.filter((c) => cellText(c) !== '').length;
}

function avgLen(row: unknown[]): number {
  const filled = row.map(cellText).filter(Boolean);
  if (filled.length === 0) return 0;
  return filled.reduce((s, t) => s + t.length, 0) / filled.length;
}

function looksNumericHeavy(row: unknown[]): boolean {
  const filled = row.map(cellText).filter(Boolean);
  if (filled.length === 0) return false;
  let n = 0;
  for (const t of filled) {
    if (/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(t.replace(',', '.'))) n++;
  }
  return n / filled.length >= 0.5;
}

function looksImportIdRow(row: unknown[]): boolean {
  const filled = row.map(cellText).filter(Boolean);
  if (filled.length === 0) return false;
  const hits = filled.filter((t) => /"ImportId"\s*:/i.test(t) || /^\{\s*"ImportId"/i.test(t)).length;
  return hits >= Math.max(1, Math.floor(filled.length * 0.4));
}

function looksSummaryLabel(text: string): boolean {
  return /^(mean|sd|std\.?\s*dev|total|sum|n|count|median|min|max|notes?)$/i.test(text.trim());
}

function uniqueRatio(row: unknown[]): number {
  const filled = row.map(cellText).filter(Boolean);
  if (filled.length === 0) return 0;
  return new Set(filled.map((t) => t.toLowerCase())).size / filled.length;
}

export function detectImportLayout(rawGrid: unknown[][]): ImportLayoutDetection {
  const warnings: string[] = [];
  const grid = rawGrid.slice(0, 200);
  const n = grid.length;
  if (n === 0) {
    return {
      headerRows: [0], labelRow: null, importIdRow: null, dataStartRow: 1, dataEndRow: 0,
      ignoredRows: [], ignoredCols: [], orientation: 'wide', confidence: 'low',
      warnings: ['Empty sheet'], summary: 'Empty sheet — nothing to import.', layoutId: 'unknown',
    };
  }

  let first = 0;
  while (first < n && isEmptyRow(grid[first])) first++;
  if (first >= n) {
    return {
      headerRows: [0], labelRow: null, importIdRow: null, dataStartRow: 1, dataEndRow: 0,
      ignoredRows: Array.from({ length: n }, (_, i) => i), ignoredCols: [], orientation: 'wide',
      confidence: 'low', warnings: ['All rows are empty'], summary: 'All rows are empty.', layoutId: 'L5',
    };
  }

  while (first < n) {
    const filled = nonEmptyCount(grid[first]);
    if (filled === 1 && avgLen(grid[first]) > 20) { first++; continue; }
    break;
  }
  if (first >= n) first = 0;

  let dataEnd = n - 1;
  while (dataEnd > first) {
    if (isEmptyRow(grid[dataEnd])) { dataEnd--; continue; }
    const firstCell = cellText(grid[dataEnd][0]);
    if (looksSummaryLabel(firstCell)) { dataEnd--; continue; }
    break;
  }

  let importIdRow: number | null = null;
  for (let i = first; i < Math.min(first + 8, n); i++) {
    if (looksImportIdRow(grid[i])) { importIdRow = i; break; }
  }

  let headerRow = first;
  let labelRow: number | null = null;
  let dataStart = first + 1;
  let layoutId: ImportLayoutDetection['layoutId'] = 'L1';
  let confidence: LayoutConfidence = 'medium';

  if (importIdRow != null) {
    layoutId = 'L2';
    confidence = 'high';
    if (importIdRow >= first + 2) {
      headerRow = importIdRow - 2;
      labelRow = importIdRow - 1;
      if (avgLen(grid[importIdRow - 1]) < avgLen(grid[importIdRow - 2])) {
        headerRow = importIdRow - 1;
        labelRow = importIdRow - 2;
      }
      dataStart = importIdRow + 1;
    } else if (importIdRow >= first + 1) {
      headerRow = importIdRow - 1;
      dataStart = importIdRow + 1;
    } else {
      headerRow = first;
      dataStart = importIdRow + 1;
    }
  } else {
    let best = first;
    let bestScore = -Infinity;
    for (let i = first; i < Math.min(first + 8, n); i++) {
      if (isEmptyRow(grid[i])) continue;
      let score = uniqueRatio(grid[i]) * 6;
      const len = avgLen(grid[i]);
      if (len > 0 && len < 25) score += 3;
      if (len > 40) score -= 4;
      if (looksNumericHeavy(grid[i])) score -= 8;
      score += Math.min(nonEmptyCount(grid[i]) / 4, 3);
      if (score > bestScore) { bestScore = score; best = i; }
    }
    headerRow = best;

    if (best + 1 < n && !looksNumericHeavy(grid[best + 1])) {
      const a = avgLen(grid[best]);
      const b = avgLen(grid[best + 1]);
      if (a < 20 && b > a * 1.8 && b > 25 && uniqueRatio(grid[best]) > 0.7) {
        layoutId = 'L3'; confidence = 'high';
        headerRow = best; labelRow = best + 1; dataStart = best + 2;
      }
    }
    if (layoutId === 'L1' && best > first) {
      const prev = best - 1;
      const a = avgLen(grid[prev]);
      const b = avgLen(grid[best]);
      if (b < 20 && a > b * 1.8 && a > 25 && uniqueRatio(grid[best]) > 0.7) {
        layoutId = 'L3'; confidence = 'high';
        headerRow = best; labelRow = prev; dataStart = best + 1;
      }
    }
    if (layoutId === 'L1') {
      dataStart = headerRow + 1;
      confidence = bestScore >= 8 ? 'high' : bestScore >= 4 ? 'medium' : 'low';
      if (dataStart < n && looksNumericHeavy(grid[dataStart]) && !looksNumericHeavy(grid[headerRow])) {
        confidence = confidence === 'low' ? 'medium' : 'high';
      }
    }
  }

  const width = Math.max(0, ...grid.map((r) => r?.length ?? 0));
  const ignoredCols: number[] = [];
  for (let c = 0; c < width; c++) {
    if (isEmptyCol(grid, c, headerRow, dataEnd)) ignoredCols.push(c);
  }

  const ignoredRows: number[] = [];
  for (let r = 0; r < first; r++) ignoredRows.push(r);
  for (let r = dataStart; r <= dataEnd; r++) {
    if (isEmptyRow(grid[r])) ignoredRows.push(r);
  }
  for (let r = dataEnd + 1; r < n; r++) ignoredRows.push(r);
  if (importIdRow != null) ignoredRows.push(importIdRow);

  if (first > 0 && layoutId === 'L1') layoutId = 'L5';
  if (dataEnd < n - 1) {
    warnings.push(`Ignored ${n - 1 - dataEnd} trailing row(s) (summary/notes).`);
    if (layoutId === 'L1' || layoutId === 'L5') layoutId = 'L6';
  }
  if (ignoredCols.length > 0) warnings.push(`Ignored ${ignoredCols.length} empty column(s).`);
  const emptyDataRows = ignoredRows.filter((r) => r >= dataStart && r <= dataEnd).length;
  if (emptyDataRows > 0) warnings.push(`Ignored ${emptyDataRows} empty data row(s).`);
  if (confidence === 'low') warnings.push('Layout is uncertain — please check the header row under Adjust.');

  const headerRows = labelRow != null && labelRow !== headerRow
    ? [Math.min(headerRow, labelRow), Math.max(headerRow, labelRow)]
    : [headerRow];

  const dataRowCount = Math.max(0, dataEnd - dataStart + 1 - emptyDataRows);
  const colCount = Math.max(0, width - ignoredCols.length);
  const summaryParts = [
    `Header on row ${headerRow + 1}`,
    labelRow != null ? `labels on row ${labelRow + 1}` : null,
    importIdRow != null ? `ImportId row ${importIdRow + 1} skipped` : null,
    `${dataRowCount} data rows × ${colCount} columns`,
  ].filter(Boolean);

  return {
    headerRows, labelRow, importIdRow, dataStartRow: dataStart, dataEndRow: dataEnd,
    ignoredRows: [...new Set(ignoredRows)].sort((a, b) => a - b),
    ignoredCols, orientation: 'wide', confidence, warnings,
    summary: summaryParts.join(' · '), layoutId,
  };
}

export function layoutToModalFields(layout: ImportLayoutDetection): {
  headerRow: number;
  labelRow: number | null;
  dataStartRow: number;
  removeEmptyRows: boolean;
  removeEmptyColumns: boolean;
} {
  const headerRow = layout.labelRow != null
    ? (layout.headerRows.find((r) => r !== layout.labelRow) ?? layout.headerRows[0])
    : layout.headerRows[layout.headerRows.length - 1];
  return {
    headerRow,
    labelRow: layout.labelRow,
    dataStartRow: layout.dataStartRow,
    removeEmptyRows: true,
    removeEmptyColumns: true,
  };
}
