import { IMPORT_LIMITS, validateImportLimits } from '../src/lib/importLimits';
import { describe, expect, it } from 'vitest';

const validMetrics = {
  fileSizeBytes: 1,
  uncompressedBytes: 1,
  compressedBytes: 1,
  sheetCount: 1,
  rowCount: 1,
  columnCount: 1,
  cellCount: 1,
};

describe('import limit boundaries', () => {
  it.each([
    ['file size', 'fileSizeBytes', IMPORT_LIMITS.maxFileBytes],
    ['uncompressed size', 'uncompressedBytes', IMPORT_LIMITS.maxUncompressedBytes],
    ['sheet count', 'sheetCount', IMPORT_LIMITS.maxSheets],
    ['row count', 'rowCount', IMPORT_LIMITS.maxRows],
    ['column count', 'columnCount', IMPORT_LIMITS.maxColumns],
    ['cell count', 'cellCount', IMPORT_LIMITS.maxCells],
  ] as const)('%s accepts just under and at the limit and rejects over', (_, key, limit) => {
    const withMetric = (value: number) => ({
      ...validMetrics,
      [key]: value,
      ...(key === 'uncompressedBytes' ? { compressedBytes: value } : {}),
    });
    expect(() => validateImportLimits(withMetric(limit - 1))).not.toThrow();
    expect(() => validateImportLimits(withMetric(limit))).not.toThrow();
    expect(() => validateImportLimits(withMetric(limit + 1))).toThrow();
  });

  it('accepts compression ratios through 100:1 and rejects larger ratios', () => {
    const compressedBytes = 1_000_000;
    expect(() => validateImportLimits({
      ...validMetrics,
      uncompressedBytes: compressedBytes * IMPORT_LIMITS.maxCompressionRatio - 1,
      compressedBytes,
    })).not.toThrow();
    expect(() => validateImportLimits({
      ...validMetrics,
      uncompressedBytes: compressedBytes * IMPORT_LIMITS.maxCompressionRatio,
      compressedBytes,
    })).not.toThrow();
    expect(() => validateImportLimits({
      ...validMetrics,
      uncompressedBytes: compressedBytes * IMPORT_LIMITS.maxCompressionRatio + 1,
      compressedBytes,
    })).toThrow();
  });
});
