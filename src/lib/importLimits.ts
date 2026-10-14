export const IMPORT_LIMITS = Object.freeze({
  maxFileBytes: 20 * 1024 * 1024,
  maxUncompressedBytes: 100 * 1024 * 1024,
  maxCompressionRatio: 100,
  maxSheets: 25,
  maxRows: 100_000,
  maxColumns: 2_000,
  maxCells: 5_000_000,
});

export interface ImportLimitMetrics {
  fileSizeBytes?: number;
  uncompressedBytes?: number;
  compressedBytes?: number;
  sheetCount?: number;
  rowCount?: number;
  columnCount?: number;
  cellCount?: number;
}

export interface ZipMetadata {
  compressedBytes: number;
  uncompressedBytes: number;
  sheetCount: number;
}

const ZIP_LOCAL_FILE_HEADER = 0x04034b50;
const ZIP_CENTRAL_DIRECTORY_HEADER = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const ZIP64_SENTINEL = 0xffffffff;

function reject(message: string): never {
  throw new Error(message);
}

export function validateImportLimits(metrics: ImportLimitMetrics): void {
  if (metrics.fileSizeBytes != null && metrics.fileSizeBytes > IMPORT_LIMITS.maxFileBytes) {
    reject('File exceeds the 20 MB limit.');
  }
  if (metrics.uncompressedBytes != null && metrics.uncompressedBytes > IMPORT_LIMITS.maxUncompressedBytes) {
    reject('The Excel file expands beyond the 100 MB uncompressed limit.');
  }
  if (metrics.compressedBytes != null && metrics.uncompressedBytes != null) {
    const ratio = metrics.compressedBytes === 0
      ? (metrics.uncompressedBytes === 0 ? 0 : Infinity)
      : metrics.uncompressedBytes / metrics.compressedBytes;
    if (ratio > IMPORT_LIMITS.maxCompressionRatio) {
      reject('The Excel file has an unsafe compression ratio (maximum 100:1).');
    }
  }
  if (metrics.sheetCount != null && metrics.sheetCount > IMPORT_LIMITS.maxSheets) {
    reject('The workbook contains more than 25 sheets.');
  }
  if (metrics.rowCount != null && metrics.rowCount > IMPORT_LIMITS.maxRows) {
    reject('A sheet contains more than 100,000 rows.');
  }
  if (metrics.columnCount != null && metrics.columnCount > IMPORT_LIMITS.maxColumns) {
    reject('A sheet contains more than 2,000 columns.');
  }
  if (metrics.cellCount != null && metrics.cellCount > IMPORT_LIMITS.maxCells) {
    reject('The workbook contains more than 5,000,000 cells.');
  }
}

export function scanZipCentralDirectory(buffer: ArrayBuffer): ZipMetadata {
  const bytes = new DataView(buffer);
  const length = bytes.byteLength;
  if (length < 4 || bytes.getUint32(0, true) !== ZIP_LOCAL_FILE_HEADER) {
    reject('This file is not a valid Excel (.xlsx) file.');
  }

  const searchStart = Math.max(0, length - 65_557);
  let endRecordOffset = -1;
  for (let offset = length - 22; offset >= searchStart; offset--) {
    if (bytes.getUint32(offset, true) === ZIP_END_OF_CENTRAL_DIRECTORY) {
      const commentLength = bytes.getUint16(offset + 20, true);
      if (offset + 22 + commentLength === length) {
        endRecordOffset = offset;
        break;
      }
    }
  }
  if (endRecordOffset < 0) {
    reject('This Excel file is incomplete or has an invalid ZIP directory.');
  }

  const diskNumber = bytes.getUint16(endRecordOffset + 4, true);
  const centralDirectoryDisk = bytes.getUint16(endRecordOffset + 6, true);
  const entriesOnDisk = bytes.getUint16(endRecordOffset + 8, true);
  const entryCount = bytes.getUint16(endRecordOffset + 10, true);
  const centralDirectorySize = bytes.getUint32(endRecordOffset + 12, true);
  const centralDirectoryOffset = bytes.getUint32(endRecordOffset + 16, true);
  if (diskNumber !== 0 || centralDirectoryDisk !== 0 || entriesOnDisk !== entryCount) {
    reject('Multi-disk Excel archives are not supported.');
  }
  if (
    entriesOnDisk === 0xffff ||
    entryCount === 0xffff ||
    centralDirectorySize === ZIP64_SENTINEL ||
    centralDirectoryOffset === ZIP64_SENTINEL
  ) {
    reject('ZIP64 Excel archives are not supported.');
  }
  if (centralDirectoryOffset + centralDirectorySize > endRecordOffset) {
    reject('This Excel file is incomplete or has an invalid ZIP directory.');
  }

  let compressedBytes = 0;
  let uncompressedBytes = 0;
  let sheetCount = 0;
  let cursor = centralDirectoryOffset;
  const centralDirectoryEnd = centralDirectoryOffset + centralDirectorySize;
  const decoder = new TextDecoder('utf-8', { fatal: true });

  for (let entry = 0; entry < entryCount; entry++) {
    if (cursor + 46 > centralDirectoryEnd || bytes.getUint32(cursor, true) !== ZIP_CENTRAL_DIRECTORY_HEADER) {
      reject('This Excel file has an invalid ZIP directory.');
    }
    const compressedSize = bytes.getUint32(cursor + 20, true);
    const uncompressedSize = bytes.getUint32(cursor + 24, true);
    const nameLength = bytes.getUint16(cursor + 28, true);
    const extraLength = bytes.getUint16(cursor + 30, true);
    const commentLength = bytes.getUint16(cursor + 32, true);
    const diskStart = bytes.getUint16(cursor + 34, true);
    const entryEnd = cursor + 46 + nameLength + extraLength + commentLength;
    if (entryEnd > centralDirectoryEnd || diskStart !== 0) {
      reject('This Excel file has an invalid ZIP directory.');
    }
    if (compressedSize === ZIP64_SENTINEL || uncompressedSize === ZIP64_SENTINEL) {
      reject('ZIP64 Excel archives are not supported.');
    }

    const name = decoder.decode(new Uint8Array(buffer, cursor + 46, nameLength));
    if (/^xl\/worksheets\/sheet[^/]*\.xml$/i.test(name)) sheetCount++;
    compressedBytes += compressedSize;
    uncompressedBytes += uncompressedSize;
    cursor = entryEnd;
  }
  if (cursor !== centralDirectoryEnd) {
    reject('This Excel file has an invalid ZIP directory.');
  }

  const metadata = { compressedBytes, uncompressedBytes, sheetCount };
  validateImportLimits(metadata);
  return metadata;
}

export async function validateImportFile(file: File): Promise<void> {
  const extension = file.name.slice(file.name.lastIndexOf('.') + 1).toLowerCase();
  if (extension !== 'csv' && extension !== 'xlsx') {
    reject('Choose a CSV or XLSX file.');
  }
  validateImportLimits({ fileSizeBytes: file.size });

  const buffer = await file.arrayBuffer();
  if (extension === 'xlsx') {
    const metadata = scanZipCentralDirectory(buffer);
    validateImportLimits({ sheetCount: metadata.sheetCount });
    return;
  }

  const csvBytes = new Uint8Array(buffer);
  if (csvBytes.includes(0)) {
    reject('CSV files cannot contain binary data.');
  }
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    reject('CSV files must use valid UTF-8 text encoding.');
  }
}

export function validateParsedSheets(sheets: { data: unknown[][] }[]): void {
  let rowCount = 0;
  let columnCount = 0;
  let cellCount = 0;
  for (const { data } of sheets) {
    rowCount = Math.max(rowCount, data.length);
    let sheetColumnCount = 0;
    for (const row of data) sheetColumnCount = Math.max(sheetColumnCount, row.length);
    columnCount = Math.max(columnCount, sheetColumnCount);
    cellCount += data.length * sheetColumnCount;
  }
  validateImportLimits({
    sheetCount: sheets.length,
    rowCount,
    columnCount,
    cellCount,
  });
}
