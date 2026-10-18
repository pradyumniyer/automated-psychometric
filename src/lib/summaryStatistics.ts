import type { ScoredColumn } from './scoredColumns';
import type { ItemValueState } from '../scientific/scoring';

export interface SummaryColumnStatistics {
  sum: number | null;
  mean: number | null;
  nUsed: number;
  nNotCounted: number;
  notCountedByKind?: Record<'blank' | 'special_missing' | 'out_of_range' | 'unmapped', number>;
}

export interface SummaryStatistics {
  includedCount: number;
  numericColumns: ReadonlySet<string>;
  columns: Record<string, SummaryColumnStatistics>;
}

export interface SummaryExportContent {
  rows: (string | number)[][];
}

export interface SummaryExportToggles {
  sum: boolean;
  mean: boolean;
}

function numericCell(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function buildSummaryStatistics(
  columns: readonly Pick<ScoredColumn, 'key' | 'type'>[],
  rows: Record<string, unknown>[],
  excludedRows: ReadonlySet<number>,
  idColumns: ReadonlySet<string>,
  itemStates?: Record<string, ItemValueState>[],
): SummaryStatistics {
  const includedRows = rows.flatMap((row, index) =>
    excludedRows.has(index) ? [] : [{ row, index }],
  );
  const numericColumns = new Set<string>();
  const summaries: Record<string, SummaryColumnStatistics> = {};

  for (const column of columns) {
    if (column.type === 'interpretation' || idColumns.has(column.key)) continue;
    const values = includedRows
      .map(({ row, index }) => {
        const state = itemStates?.[index]?.[column.key];
        return state && state !== 'valid' && state !== 'special_scored'
          ? null
          : numericCell(row[column.key]);
      })
      .filter((value): value is number => value !== null);
    const notCountedByKind = itemStates
      ? includedRows.reduce((counts, { index }) => {
          const state = itemStates[index]?.[column.key];
          const kind = state === 'allowed' ? 'special_missing'
            : state === 'blank' ? 'blank'
              : state === 'out_of_range' ? 'out_of_range'
                : state === 'unmapped' ? 'unmapped'
                  : null;
          if (kind) counts[kind]++;
          return counts;
        }, {
          blank: 0,
          special_missing: 0,
          out_of_range: 0,
          unmapped: 0,
        })
      : undefined;
    if (
      column.type === 'demo'
      && rows.every((row) => numericCell(row[column.key]) === null)
    ) continue;

    numericColumns.add(column.key);
    const sum = values.length > 0 ? values.reduce((total, value) => total + value, 0) : null;
    summaries[column.key] = {
      sum,
      mean: sum === null ? null : sum / values.length,
      nUsed: values.length,
      nNotCounted: includedRows.length - values.length,
      ...(notCountedByKind ? { notCountedByKind } : {}),
    };
  }

  return { includedCount: includedRows.length, numericColumns, columns: summaries };
}

export function buildSummaryExportContent(
  headers: string[],
  columns: readonly Pick<ScoredColumn, 'key' | 'type'>[],
  rows: Record<string, unknown>[],
  excludedRows: ReadonlySet<number>,
  idColumns: ReadonlySet<string>,
  toggles: SummaryExportToggles,
  itemStates?: Record<string, ItemValueState>[],
): SummaryExportContent | null {
  if (!toggles.sum && !toggles.mean) return null;

  const statistics = buildSummaryStatistics(columns, rows, excludedRows, idColumns, itemStates);
  const labelColumnIndex = Math.max(
    0,
    headers.findIndex((header) => !statistics.numericColumns.has(header)),
  );
  const makeSummaryRow = (
    label: string,
    value: (column: SummaryColumnStatistics) => number | null,
  ): (string | number)[] => {
    const output: (string | number)[] = headers.map(() => '');
    if (output.length > 0) output[labelColumnIndex] = label;
    for (const header of statistics.numericColumns) {
      const index = headers.indexOf(header);
      if (index < 0) continue;
      const summary = statistics.columns[header];
      const cell = value(summary);
      output[index] = cell ?? '';
    }
    return output;
  };

  const outputRows: (string | number)[][] = [
    [`Summary statistics (${statistics.includedCount} included respondents)`],
    [],
    [...headers],
  ];
  if (toggles.sum) outputRows.push(makeSummaryRow('Sum', (column) => column.sum));
  if (toggles.mean) outputRows.push(makeSummaryRow('Mean', (column) => column.mean));
  outputRows.push(makeSummaryRow('N used', (column) => column.nUsed));
  outputRows.push(makeSummaryRow('N not counted', (column) => column.nNotCounted));
  outputRows.push(
    [],
    ['Notes'],
    ['Statistics use included respondents only; respondents the user excluded are not counted.'],
    [
      'Blank, special missing (N/A, Prefer not to say, -99 and similar), out of range, and unmapped text cells are not counted. A subscale or Overall score is blank when any of its items is missing.',
    ],
  );

  const affectedColumns = [...statistics.numericColumns]
    .filter((header) => statistics.columns[header].nNotCounted > 0)
    .map((header) => `${header} (${statistics.columns[header].nNotCounted})`);
  if (affectedColumns.length > 0) {
    const details = [...statistics.numericColumns]
      .filter((header) => statistics.columns[header].nNotCounted > 0)
      .map((header) => {
        const breakdown = statistics.columns[header].notCountedByKind;
        if (!breakdown) return `${header} (${statistics.columns[header].nNotCounted})`;
        const kinds = Object.entries(breakdown)
          .filter(([, count]) => count > 0)
          .map(([kind, count]) => `${kind === 'special_missing' ? 'special missing'
            : kind === 'out_of_range' ? 'out of range'
              : kind === 'unmapped' ? 'unmapped text'
                : kind}: ${count}`)
          .join(', ');
        return kinds
          ? `${header} (${statistics.columns[header].nNotCounted}) [${kinds}]`
          : `${header} (${statistics.columns[header].nNotCounted})`;
      });
    outputRows.push([`Not counted in this file: ${details.join(', ')}`]);
  }
  outputRows.push([
    'Sum and Mean ignore not-counted cells, so a Sum can be lower than the full-sample total.',
  ]);

  return { rows: outputRows };
}
