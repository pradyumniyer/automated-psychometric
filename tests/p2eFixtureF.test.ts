import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectImportLayout } from '../src/lib/importLayoutDetection';
import { validateSplitPlan, columnsForGroup } from '../src/lib/masterSheetSplit';

const fixDir = resolve(process.cwd(), 'docs/fixtures');

function loadCsv(name: string): string[][] {
  const text = readFileSync(resolve(fixDir, name), 'utf8');
  return text.trim().split(/\r?\n/).map((line) => line.split(','));
}

/** Build an in-memory wide grid without shipping megabytes in git */
function buildWideGrid(cols: number, rows: number): string[][] {
  const headers = ['ID', 'Age', ...Array.from({ length: cols - 2 }, (_, i) => `Q${i + 1}`)];
  const grid = [headers];
  for (let r = 1; r <= rows; r++) {
    const row = [`W${r}`, String(20 + (r % 40))];
    for (let c = 1; c <= cols - 2; c++) row.push(String((r + c) % 5 + 1));
    grid.push(row);
  }
  return grid;
}

describe('P2e-3 fixture F (wide / performance)', () => {
  it('committed fixture_F exists and is wide enough', () => {
    const path = resolve(fixDir, 'fixture_F.csv');
    expect(existsSync(path)).toBe(true);
    const grid = loadCsv('fixture_F.csv');
    const expected = JSON.parse(readFileSync(resolve(fixDir, 'fixture_F_expected.json'), 'utf8'));
    expect(grid[0].length).toBe(expected.columns);
    expect(grid.length - 1).toBe(expected.rows);
    expect(grid[0].length).toBeGreaterThanOrEqual(100);
    expect(grid.length - 1).toBeGreaterThanOrEqual(200);
  });

  it('layout detection on committed F stays high-confidence and fast', () => {
    const grid = loadCsv('fixture_F.csv');
    const t0 = Date.now();
    const d = detectImportLayout(grid);
    const ms = Date.now() - t0;
    expect(d.dataStartRow).toBe(1);
    expect(d.confidence).not.toBe('low');
    // Budget: detection over first ~200 rows should be well under 2s on CI
    expect(ms).toBeLessThan(2000);
  });

  it('in-memory 500×200 grid: detection + split plan under budget', () => {
    const grid = buildWideGrid(500, 200);
    const t0 = Date.now();
    const d = detectImportLayout(grid);
    const headers = grid[0];
    const plan = {
      demoColumns: ['ID', 'Age'],
      groups: [
        { id: '1', name: 'BlockA', startIndex: 2, endIndex: 51 },
        { id: '2', name: 'BlockB', startIndex: 52, endIndex: 101 },
      ],
    };
    expect(validateSplitPlan(headers, plan)).toBeNull();
    const cols = columnsForGroup(headers, plan.demoColumns, plan.groups[0]);
    expect(cols.length).toBe(2 + 50);
    const ms = Date.now() - t0;
    expect(d.headerRows[0]).toBe(0);
    expect(ms).toBeLessThan(3000);
  });
});
