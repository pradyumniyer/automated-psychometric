import { describe, expect, it } from 'vitest';
import { formatSpreadsheetDate } from '../src/lib/fileParser';

describe('formatSpreadsheetDate', () => {
  it.each([
    [new Date('2024-02-28T23:30:00.000Z'), '2024-02-28 23:30:00'],
    [new Date('2024-03-01T00:30:00.000Z'), '2024-03-01 00:30:00'],
    [new Date('2024-02-29T00:00:00.000Z'), '2024-02-29'],
    [new Date(Date.UTC(2024, 1, 29)), '2024-02-29'],
    [new Date('2024-02-29T12:34:56.789Z'), '2024-02-29 12:34:56'],
  ])('formats %s as %s', (date, expected) => {
    expect(formatSpreadsheetDate(date)).toBe(expected);
  });
});
