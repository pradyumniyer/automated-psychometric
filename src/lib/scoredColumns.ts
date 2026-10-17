import type { ScoringResult, SubscaleConfig } from '@/scientific/scoring';
import {
  interpretationColumnKey,
  scoreColumnKey,
  scoreOutputLabel,
  shownScoreOutputs,
  uniqueSubscaleNames,
} from './scoreOutputs';

export interface ScoredColumn {
  key: string;
  label: string;
  group: string;
  type: 'data' | 'score' | 'interpretation' | 'demo';
}

export function scoreOnlyColumnKeys(columns: readonly ScoredColumn[]): string[] {
  return columns.filter((column) => column.type === 'score').map((column) => column.key);
}

export interface ScoredColumnGroup {
  name: string;
  columns: ScoredColumn[];
}

export interface ScoredColumnData {
  groups: ScoredColumnGroup[];
  headers: string[];
  rows: Record<string, unknown>[];
  numericColumns: ReadonlySet<string>;
}

interface BuildScoredColumnDataOptions {
  result: ScoringResult | null;
  rawHeaders: string[];
  rawRows: Record<string, unknown>[];
  demographicColumns: string[];
  idColumns: string[];
  subscales: Pick<SubscaleConfig, 'id' | 'name' | 'items' | 'scoringMethod' | 'showOutputs'>[];
}

type BuiltColumn = ScoredColumn;

export function buildScoredColumnData({
  result,
  rawHeaders,
  rawRows,
  demographicColumns,
  idColumns,
  subscales,
}: BuildScoredColumnDataOptions): ScoredColumnData {
  const groups: { name: string; columns: BuiltColumn[] }[] = [];
  const demoSet = new Set(demographicColumns);
  const idSet = new Set(idColumns);
  const assignedItems = new Set(subscales.flatMap((subscale) =>
    subscale.items.map((item) => item.column),
  ));

  const demographics = rawHeaders
    .filter((header) => demoSet.has(header))
    .map((header) => ({
      key: header,
      label: header,
      group: 'ID',
      type: 'demo' as const,
    }));
  if (demographics.length > 0) groups.push({ name: 'ID', columns: demographics });

  const subscaleNames = uniqueSubscaleNames(subscales.map((subscale) => subscale.name), rawHeaders);
  const addScoreColumns = (
    target: BuiltColumn[],
    subscale: Pick<SubscaleConfig, 'name' | 'scoringMethod' | 'showOutputs'>,
    groupName = subscale.name,
  ) => {
    const outputs = shownScoreOutputs(subscale.showOutputs, subscale.scoringMethod);
    for (const output of outputs) {
      const scoreHeader = scoreColumnKey(groupName, output);
      if (result?.headers.includes(scoreHeader)) {
        target.push({
          key: scoreHeader,
          label: scoreOutputLabel(output),
          group: groupName,
          type: 'score',
        });
      }
      const interpretationHeader = interpretationColumnKey(groupName, output, outputs.length);
      if (result?.headers.includes(interpretationHeader)) {
        target.push({
          key: interpretationHeader,
          label: outputs.length === 1 ? 'Interpretation' : `${scoreOutputLabel(output)} interpretation`,
          group: groupName,
          type: 'interpretation',
        });
      }
    }
  };

  for (const [subscaleIndex, subscale] of subscales.entries()) {
    const groupName = subscaleNames[subscaleIndex];
    const columns: BuiltColumn[] = subscale.items
      .map((item) => item.column)
      .filter((column) => rawHeaders.includes(column))
      .map((column) => ({
        key: column,
        label: column,
        group: groupName,
        type: 'data',
      }));
    if (result) addScoreColumns(columns, subscale, groupName);
    groups.push({ name: groupName, columns });
  }

  const unassigned = rawHeaders
    .filter((header) => !demoSet.has(header) && !assignedItems.has(header))
    .map((header) => ({
      key: header,
      label: header,
      group: 'Unassigned',
      type: 'data' as const,
    }));
  if (unassigned.length > 0) groups.push({ name: 'Unassigned', columns: unassigned });

  if (result) {
    const overall = groups.find((group) => group.name === 'Overall Scale');
    const overallColumns = overall?.columns ?? [];
    const overallScoreHeader = 'Overall Scale Score';
    if (subscales.length === 0) {
      if (result.headers.includes(overallScoreHeader)) {
        overallColumns.push({
          key: overallScoreHeader,
          label: 'Overall Score',
          group: 'Overall Scale',
          type: 'score',
        });
        const interpretationHeader = 'Overall Scale Interpretation';
        if (result.headers.includes(interpretationHeader)) {
          overallColumns.push({
            key: interpretationHeader,
            label: 'Interpretation',
            group: 'Overall Scale',
            type: 'interpretation',
          });
        }
      } else {
        const autoScale = result.configSnapshot.subscales[0];
        if (autoScale) addScoreColumns(overallColumns, autoScale);
      }
    } else if (result.headers.includes(overallScoreHeader)) {
      overallColumns.push({
        key: overallScoreHeader,
        label: 'Overall Score',
        group: 'Overall Scale',
        type: 'score',
      });
    }
    if (overallColumns.length > 0 && !overall) {
      groups.push({ name: 'Overall Scale', columns: overallColumns });
    }
  }

  const headers = groups.flatMap((group) => group.columns.map((column) => column.key));
  const rows = rawRows.map((rawRow, index) => {
    const sourceRow = result?.rows[index] ?? rawRow;
    const projected: Record<string, unknown> = {};
    for (const group of groups) {
      for (const [columnIndex, column] of group.columns.entries()) {
        const value = sourceRow[column.key] ?? null;
        if (column.type === 'interpretation' && value === null) {
          const scoreColumn = group.columns
            .slice(0, columnIndex)
            .reverse()
            .find((candidate) => candidate.type === 'score');
          projected[column.key] = scoreColumn && typeof sourceRow[scoreColumn.key] === 'number'
            ? 'No band'
            : null;
        } else {
          projected[column.key] = value;
        }
      }
    }
    return projected;
  });
  const numericColumns = new Set(
    groups.flatMap((group) => group.columns)
      .filter((column) => column.type !== 'interpretation' && !idSet.has(column.key))
      .map((column) => column.key),
  );

  return { groups, headers, rows, numericColumns };
}
