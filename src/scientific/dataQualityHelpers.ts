import type { AllowedNonResponse } from './dataQualityTypes';
import type { ItemValueState, NormalizedMatrix } from './scoring';
import type { Severity } from './dataQualityTypes';
import { resolveResponse, type ResponseScaleV2 } from './responseScales';

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
      const scale: ResponseScaleV2 = {
        min: min ?? Number.NEGATIVE_INFINITY,
        max: max ?? Number.POSITIVE_INFINITY,
        rangeSource: 'manual',
        confirmed: true,
        flipped: false,
        startsAtZero: false,
        labels: allowed.textValues.map((text) => ({ text, value: null, kind: 'special' as const }))
          .concat(allowed.numericSentinels.map((value) => ({ text: String(value), value: null, kind: 'special' as const }))),
        outOfRange: 'missing',
      };
      const resolved = resolveResponse(raw, scale);
      rowValues[column] = 'value' in resolved && typeof resolved.value === 'number' ? resolved.value : null;
      rowStates[column] = resolved.kind === 'special_missing'
        ? 'allowed'
        : resolved.kind === 'special_scored'
          ? 'special_scored'
          : resolved.kind;
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
