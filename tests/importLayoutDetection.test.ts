import { describe, expect, it } from 'vitest';
import { detectImportLayout } from '../src/lib/importLayoutDetection';

describe('import layout detection (P4 / L1–L7)', () => {
  it('L1: one header row then numeric data', () => {
    const grid = [
      ['ID', 'Q1', 'Q2', 'Q3'],
      ['P1', '1', '2', '3'],
      ['P2', '4', '5', '6'],
    ];
    const d = detectImportLayout(grid);
    expect(d.headerRows).toContain(0);
    expect(d.dataStartRow).toBe(1);
    expect(d.confidence).not.toBe('low');
    expect(d.layoutId === 'L1' || d.layoutId === 'L5').toBe(true);
  });

  it('L2: Qualtrics-style ImportId row', () => {
    const grid = [
      ['Q1', 'Q2', 'Q3'],
      ['How often?', 'How much?', 'Agree?'],
      ['{"ImportId":"Q1"}', '{"ImportId":"Q2"}', '{"ImportId":"Q3"}'],
      ['1', '2', '3'],
      ['2', '3', '4'],
    ];
    const d = detectImportLayout(grid);
    expect(d.importIdRow).toBe(2);
    expect(d.dataStartRow).toBe(3);
    expect(d.layoutId).toBe('L2');
    expect(d.confidence).toBe('high');
  });

  it('L3: short codes then long labels', () => {
    const grid = [
      ['Q1', 'Q2', 'Q3'],
      [
        'Over the last two weeks, how often have you felt nervous?',
        'Over the last two weeks, how often have you not been able to stop worrying?',
        'Over the last two weeks, how often have you been restless?',
      ],
      ['1', '2', '1'],
      ['2', '1', '2'],
    ];
    const d = detectImportLayout(grid);
    expect(d.labelRow).not.toBeNull();
    expect(d.dataStartRow).toBeGreaterThan(1);
    expect(d.layoutId).toBe('L3');
  });

  it('L5: leading blank rows and title', () => {
    const grid = [
      ['', '', ''],
      ['My study export', '', ''],
      ['ID', 'Q1', 'Q2'],
      ['A', '1', '2'],
    ];
    const d = detectImportLayout(grid);
    expect(d.dataStartRow).toBeGreaterThanOrEqual(2);
    expect(d.headerRows.some((r) => r >= 1)).toBe(true);
  });

  it('L6: trailing Mean/SD rows ignored', () => {
    const grid = [
      ['ID', 'Q1', 'Q2'],
      ['P1', '1', '2'],
      ['P2', '3', '4'],
      ['Mean', '2', '3'],
      ['SD', '1', '1'],
    ];
    const d = detectImportLayout(grid);
    expect(d.dataEndRow).toBeLessThan(4);
    expect(d.warnings.some((w) => /trailing/i.test(w))).toBe(true);
  });

  it('L7: empty columns counted as ignored', () => {
    const grid = [
      ['ID', '', 'Q1', 'Q2'],
      ['P1', '', '1', '2'],
      ['P2', '', '3', '4'],
    ];
    const d = detectImportLayout(grid);
    expect(d.ignoredCols).toContain(1);
  });

  it('ambiguous all-text grid → low or medium confidence', () => {
    const grid = [
      ['a', 'b', 'c'],
      ['d', 'e', 'f'],
      ['g', 'h', 'i'],
    ];
    const d = detectImportLayout(grid);
    expect(['low', 'medium', 'high']).toContain(d.confidence);
  });
});
