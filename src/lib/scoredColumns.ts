import type { ScoringResult, SubscaleConfig } from '@/scientific/scoring';

export interface ScoredColumn {
  key: string;
  label: string;
  group: string;
  type: 'data' | 'score' | 'interpretation' | 'demo';
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
  subscales: Pick<SubscaleConfig, 'id' | 'name' | 'items' | 'scoringMethod'>[];
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

  const addScoreColumns = (
    target: BuiltColumn[],
    subscale: Pick<SubscaleConfig, 'name'>,
  ) => {
    const scoreHeader = `${subscale.name} Score`;
    if (result?.headers.includes(scoreHeader)) {
      target.push({
        key: scoreHeader,
        label: 'Score',
        group: subscale.name,
        type: 'score',
      });
    }
    const interpretationHeader = `${subscale.name} Interpretation`;
    if (result?.headers.includes(interpretationHeader)) {
      target.push({
        key: interpretationHeader,
        label: 'Interpretation',
        group: subscale.name,
        type: 'interpretation',
      });
    }
  };

  for (const subscale of subscales) {
    const columns: BuiltColumn[] = subscale.items
      .map((item) => item.column)
      .filter((column) => rawHeaders.includes(column))
      .map((column) => ({
        key: column,
        label: column,
        group: subscale.name,
        type: 'data',
      }));
    if (result) addScoreColumns(columns, subscale);
    groups.push({ name: subscale.name, columns });
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
      const autoScale = result.configSnapshot.subscales[0];
      if (autoScale) {
        addScoreColumns(overallColumns, autoScale);
      } else if (result.headers.includes(overallScoreHeader)) {
        overallColumns.push({
          key: overallScoreHeader,
          label: 'Overall Score',
          group: 'Overall Scale',
          type: 'score',
        });
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
      for (const column of group.columns) {
        projected[column.key] = sourceRow[column.key] ?? null;
      }
    }
    return projected;
  });
  const numericColumns = new Set(headers.filter((header) => !idSet.has(header)));

  return { groups, headers, rows, numericColumns };
}
