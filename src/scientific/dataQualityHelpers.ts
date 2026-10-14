import type { AllowedNonResponse } from './dataQualityTypes';
import type { ItemValueState, NormalizedMatrix } from './scoring';
import type { Severity } from './dataQualityTypes';

function isBlank(val: unknown): boolean {
  return val == null || val === '' || (typeof val === 'string' && val.trim() === '');
}

function isAllowedNonResponse(val: unknown, allowed: AllowedNonResponse): boolean {
  if (val == null) return false;
  const str = String(val).trim();
  if (allowed.textValues.some((t) => t.toLowerCase() === str.toLowerCase())) return true;
  const num = Number(val);
  if (!isNaN(num) && isFinite(num) && allowed.numericSentinels.includes(num)) return true;
  return false;
}

function toNumeric(val: unknown): number | null {
  if (val == null || val === '') return null;
  const num = Number(val);
  if (!isNaN(num) && isFinite(num)) return num;
  return null;
}

export function severityRank(s: Severity): number {
  return s === 'severe' ? 3 : s === 'moderate' ? 2 : 1;
}

export function maxSeverity(a: Severity, b: Severity): Severity {
  return severityRank(a) >= severityRank(b) ? a : b;
}

export function resolveRowIds(rows: Record<string, unknown>[], suppliedIds?: string[]): string[] {
  const ids = suppliedIds ?? rows.map((row, index) => {
    const value = row.ID;
    return typeof value === 'string' || typeof value === 'number'
      ? String(value).trim() || `row-${index}`
      : `row-${index}`;
  });
  if (ids.length !== rows.length || ids.some((id) => !id.trim())) {
    throw new Error('Data quality row IDs must be non-empty and match the number of rows.');
  }
  if (new Set(ids).size !== ids.length) throw new Error('Data quality row IDs must be unique.');
  return [...ids];
}

export function createLegacyNormalizedMatrix(
  rows: Record<string, unknown>[],
  itemColumns: string[],
  min: number | null,
  max: number | null,
  allowed: AllowedNonResponse,
): NormalizedMatrix {
  const values: Record<string, number | null>[] = [];
  const states: Record<string, ItemValueState>[] = [];
  for (const row of rows) {
    const rowValues: Record<string, number | null> = {};
    const rowStates: Record<string, ItemValueState> = {};
    for (const column of itemColumns) {
      const raw = row[column];
      if (isBlank(raw)) {
        rowValues[column] = null;
        rowStates[column] = 'blank';
      } else if (isAllowedNonResponse(raw, allowed)) {
        rowValues[column] = null;
        rowStates[column] = 'allowed';
      } else {
        const value = toNumeric(raw);
        if (value === null) {
          rowValues[column] = null;
          rowStates[column] = 'blank';
        } else if ((min !== null && value < min) || (max !== null && value > max)) {
          rowValues[column] = null;
          rowStates[column] = 'out_of_range';
        } else {
          rowValues[column] = value;
          rowStates[column] = 'valid';
        }
      }
    }
    values.push(rowValues);
    states.push(rowStates);
  }
  return { values, states };
}

export function validateNormalizedMatrix(
  matrix: NormalizedMatrix,
  rowCount: number,
  itemColumns: string[],
  rowIds: string[],
): void {
  if (matrix.values.length !== rowCount || matrix.states.length !== rowCount) {
    throw new Error('Normalized data quality matrix must match the number of rows.');
  }
  for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
    for (const column of itemColumns) {
      if (!(column in matrix.values[rowIndex]) || !(column in matrix.states[rowIndex])) {
        throw new Error(`Normalized data quality matrix is missing item "${column}" in row ${rowIds[rowIndex]}.`);
      }
    }
  }
}
