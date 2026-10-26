export interface ScaleColumnGroup {
  id: string;
  name: string;
  startIndex: number;
  endIndex: number;
}

export interface MasterSplitPlan {
  demoColumns: string[];
  groups: ScaleColumnGroup[];
}

export function columnsForGroup(headers: string[], demoColumns: string[], group: ScaleColumnGroup): string[] {
  const demos = demoColumns.filter((h) => headers.includes(h));
  const start = Math.max(0, Math.min(group.startIndex, group.endIndex));
  const end = Math.min(headers.length - 1, Math.max(group.startIndex, group.endIndex));
  const items: string[] = [];
  for (let i = start; i <= end; i++) {
    const h = headers[i];
    if (!demos.includes(h)) items.push(h);
  }
  return [...demos, ...items];
}

export function projectRows(rows: Record<string, unknown>[], columns: string[]): Record<string, unknown>[] {
  return rows.map((row) => {
    const next: Record<string, unknown> = {};
    for (const col of columns) next[col] = row[col] ?? null;
    return next;
  });
}

export function validateSplitPlan(headers: string[], plan: MasterSplitPlan): string | null {
  if (plan.groups.length === 0) return 'Add at least one scale group.';
  for (const g of plan.groups) {
    if (!g.name.trim()) return 'Each scale needs a name.';
    if (g.startIndex < 0 || g.endIndex < 0 || g.startIndex >= headers.length || g.endIndex >= headers.length) {
      return `Scale "${g.name}" has an invalid column range.`;
    }
    const cols = columnsForGroup(headers, plan.demoColumns, g);
    if (cols.length <= plan.demoColumns.filter((d) => headers.includes(d)).length) {
      return `Scale "${g.name}" needs at least one item column.`;
    }
  }
  return null;
}

export function rangeFromClicks(a: number, b: number): { startIndex: number; endIndex: number } {
  return { startIndex: Math.min(a, b), endIndex: Math.max(a, b) };
}
