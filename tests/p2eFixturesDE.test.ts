import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateSplitPlan, columnsForGroup } from '../src/lib/masterSheetSplit';

const fixDir = resolve(process.cwd(), 'docs/fixtures');

function loadCsv(name: string): string[][] {
  const text = readFileSync(resolve(fixDir, name), 'utf8');
  return text.trim().split(/\r?\n/).map((line) => {
    // naive split sufficient for these fixtures
    const cells: string[] = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { q = !q; continue; }
      if (ch === ',' && !q) { cells.push(cur); cur = ''; continue; }
      cur += ch;
    }
    cells.push(cur);
    return cells;
  });
}

describe('P2e-2 fixture D (Google Forms–style)', () => {
  const grid = loadCsv('fixture_D.csv');
  const expected = JSON.parse(readFileSync(resolve(fixDir, 'fixture_D_expected.json'), 'utf8'));

  it('has long question-style headers and Timestamp', () => {
    expect(grid[0][0]).toMatch(/Timestamp/i);
    expect(grid[0].some((h) => h.length > 20 || /feel|Rate|What is/i.test(h))).toBe(true);
  });

  it('has mixed word and numeric answer cells', () => {
    const body = grid.slice(1);
    const wordy = body.some((r) => r.some((c) => /agree|neutral|disagree/i.test(c)));
    const numeric = body.some((r) => r.some((c) => /^[1-5]$/.test(String(c).trim())));
    expect(wordy).toBe(true);
    expect(numeric).toBe(true);
  });

  it('includes duplicate / case-variant IDs', () => {
    const idCol = grid[0].findIndex((h) => /id/i.test(h));
    expect(idCol).toBeGreaterThanOrEqual(0);
    const ids = grid.slice(1).map((r) => String(r[idCol]).toLowerCase());
    const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dup.length).toBeGreaterThan(0);
  });

  it('respondent count matches expected', () => {
    expect(grid.length - 1).toBe(expected.respondentCount);
  });
});

describe('P2e-2 fixture E (missing codes + many subscales)', () => {
  const grid = loadCsv('fixture_E.csv');
  const expected = JSON.parse(readFileSync(resolve(fixDir, 'fixture_E_expected.json'), 'utf8'));

  it('has 20 respondents and 21 item columns', () => {
    expect(grid.length - 1).toBe(expected.respondentCount);
    expect(grid[0].length - 1).toBe(expected.itemCount);
  });

  it('contains -99 and 0 missing codes', () => {
    const flat = grid.slice(1).flat().map(String);
    expect(flat).toContain('-99');
    expect(flat).toContain('0');
  });

  it('contains a decimal value', () => {
    const flat = grid.slice(1).flat().map(String);
    expect(flat.some((c) => c.includes('.'))).toBe(true);
  });

  it('subscale plan covers 11 groups including one-item', () => {
    const plan = expected.subscalePlan as Record<string, string[]>;
    expect(Object.keys(plan).length).toBe(11);
    expect(plan.Subscale_11).toEqual(['S11only']);
    const headers = grid[0];
    for (const cols of Object.values(plan)) {
      for (const c of cols) expect(headers).toContain(c);
    }
  });

  it('split plan can isolate first subscale block', () => {
    const headers = grid[0];
    const group = { id: '1', name: 'Subscale_1', startIndex: 1, endIndex: 2 };
    expect(validateSplitPlan(headers, { demoColumns: ['ID'], groups: [group] })).toBeNull();
    expect(columnsForGroup(headers, ['ID'], group)).toEqual(['ID', 'S1a', 'S1b']);
  });
});
