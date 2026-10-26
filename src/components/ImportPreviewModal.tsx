import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Upload, AlertTriangle, Info, Loader2,
} from 'lucide-react';
import {
  getRawSheet,
  detectHeaderLayout,
  analyzeEmptyRows,
  analyzeEmptyColumns,
  parseSheetConfigurable,
  type ParsedSheet,
  type HeaderLayoutDetection,
  type EmptyRowReport,
  type EmptyColumnReport,
} from '@/lib/fileParser';
import { detectImportLayout, layoutToModalFields, type ImportLayoutDetection } from '@/lib/importLayoutDetection';
import { Button, Modal } from './ui';

type Preset = 'simple' | 'two-row' | 'auto-detect';

export interface ImportPreviewRequest {
  file: File;
  sheetName: string;
  /** For multi-sheet: which index in the queue (0-based) */
  queueIndex: number;
  queueTotal: number;
}

export interface ImportPreviewResult {
  parsed: ParsedSheet;
  sheetName: string;
  emptyRowsKept: number;
}

interface Props {
  open: boolean;
  request: ImportPreviewRequest | null;
  onConfirm: (result: ImportPreviewResult) => void;
  onCancel: () => void;
}

export function ImportPreviewModal({ open, request, onConfirm, onCancel }: Props) {
  const [rawRows, setRawRows] = useState<unknown[][] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [headerRow, setHeaderRow] = useState(0);
  const [labelRow, setLabelRow] = useState<number | null>(null);
  const [dataStartRow, setDataStartRow] = useState(1);
  const [removeEmptyRows, setRemoveEmptyRows] = useState(true);
  const [removeEmptyCols, setRemoveEmptyCols] = useState(true);
  const [activePreset, setActivePreset] = useState<Preset>('auto-detect');
  const [importing, setImporting] = useState(false);
  const [showAdjust, setShowAdjust] = useState(false);
  const [detection, setDetection] = useState<ImportLayoutDetection | null>(null);

  // Load raw rows when request changes
  useEffect(() => {
    if (!request) { setRawRows(null); return; }
    setLoading(true);
    setError(null);
    setRemoveEmptyRows(true);
    setRemoveEmptyCols(true);
    setShowAdjust(false);
    setDetection(null);
    setImporting(false);
    getRawSheet(request.file, request.sheetName)
      .then((rows) => {
        setRawRows(rows);
        const detected = detectImportLayout(rows);
        setDetection(detected);
        const fields = layoutToModalFields(detected);
        setHeaderRow(fields.headerRow);
        setLabelRow(fields.labelRow);
        setDataStartRow(fields.dataStartRow);
        setRemoveEmptyRows(fields.removeEmptyRows);
        setRemoveEmptyCols(fields.removeEmptyColumns);
        setShowAdjust(detected.confidence === 'low');
        setActivePreset('auto-detect');
        setLoading(false);
      })
      .catch((e) => {
        setError((e as Error).message);
        setLoading(false);
      });
  }, [request]);

  const applyLayout = useCallback((layout: HeaderLayoutDetection) => {
    setHeaderRow(layout.headerRow);
    setLabelRow(layout.labelRow);
    setDataStartRow(layout.dataStartRow);
  }, []);

  const applyPreset = useCallback((preset: Preset) => {
    setActivePreset(preset);
    if (!rawRows) return;
    if (preset === 'simple') {
      // Find first non-empty row for header
      let first = 0;
      while (first < rawRows.length && rawRows[first].every((v) => v == null || String(v).trim() === '')) first++;
      setHeaderRow(first);
      setLabelRow(null);
      setDataStartRow(first + 1);
    } else if (preset === 'two-row') {
      let first = 0;
      while (first < rawRows.length && rawRows[first].every((v) => v == null || String(v).trim() === '')) first++;
      setLabelRow(first);
      setHeaderRow(first + 1);
      setDataStartRow(first + 2);
    } else {
      const layout = detectHeaderLayout(rawRows);
      applyLayout(layout);
    }
  }, [rawRows, applyLayout]);

  // Computed preview data
  const previewRows = rawRows?.slice(0, 6) ?? [];
  const totalRawRows = rawRows?.length ?? 0;

  const previewHeaders = useMemo(() => {
    if (!rawRows || headerRow >= rawRows.length) return [];
    return (rawRows[headerRow] || []).map((v, i) => {
      if (v == null || String(v).trim() === '') return `Column_${i + 1}`;
      return String(v).trim();
    });
  }, [rawRows, headerRow]);

  const emptyRowReport: EmptyRowReport = useMemo(() => {
    if (!rawRows) return { count: 0, rowNumbers: [] };
    return analyzeEmptyRows(rawRows, dataStartRow);
  }, [rawRows, dataStartRow]);

  const emptyColReport: EmptyColumnReport = useMemo(() => {
    if (!rawRows) return { count: 0, columnIndices: [] };
    return analyzeEmptyColumns(rawRows, dataStartRow, previewHeaders.length);
  }, [rawRows, dataStartRow, previewHeaders.length]);

  const dataRowCount = useMemo(() => {
    if (!rawRows) return 0;
    // Auto-trim trailing empties: find last non-empty row from dataStartRow onward
    let lastNonEmpty = dataStartRow - 1;
    for (let i = rawRows.length - 1; i >= dataStartRow; i--) {
      if (!rawRows[i].every((v) => v == null || String(v).trim() === '')) { lastNonEmpty = i; break; }
    }
    const total = Math.max(0, lastNonEmpty - dataStartRow + 1);
    if (removeEmptyRows) return Math.max(0, total - emptyRowReport.count);
    return Math.max(0, total);
  }, [rawRows, dataStartRow, removeEmptyRows, emptyRowReport]);

  const validationError = useMemo(() => {
    if (!rawRows) return null;
    if (dataStartRow <= headerRow) return 'Data start row must be after the header row.';
    if (dataStartRow >= rawRows.length) return 'No data rows after the selected start row.';
    if (previewHeaders.length === 0) return 'No columns found in the header row.';
    if (previewHeaders.every((h) => h.startsWith('Column_'))) return 'Header row appears to contain no usable column names. Try a different row.';
    return null;
  }, [rawRows, headerRow, dataStartRow, previewHeaders]);

  const handleConfirm = async () => {
    if (!rawRows || !request || validationError) return;
    setImporting(true);
    try {
      const parsed = parseSheetConfigurable(rawRows, {
        sheetName: request.sheetName,
        headerRow,
        labelRow,
        dataStartRow,
        removeEmptyRows,
        removeEmptyColumns: removeEmptyCols,
      });
      if (parsed.rows.length === 0) {
        setError('No data rows found with the current settings.');
        setImporting(false);
        return;
      }
      onConfirm({ parsed, sheetName: request.sheetName, emptyRowsKept: removeEmptyRows ? 0 : emptyRowReport.count });
    } catch (e) {
      setError((e as Error).message);
      setImporting(false);
    }
  };

  const maxCols = Math.min(8, Math.max(1, ...((rawRows ?? []).map((r) => (r as unknown[]).length).concat([1]))));

  const formatEmptyRowSample = (report: EmptyRowReport): string => {
    const sample = report.rowNumbers.slice(0, 5);
    const text = sample.join(', ');
    return report.count > 5 ? `${text}, ... (+${report.count - 5} more)` : text;
  };

  if (!open || !request) return null;

  return (
    <Modal open={open} onClose={onCancel} title={`Import Preview${request.queueTotal > 1 ? ` — Sheet ${request.queueIndex + 1} of ${request.queueTotal}: "${request.sheetName}"` : ''}`} maxWidth="max-w-6xl">
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-primary-600 animate-spin" />
          <span className="ml-2 text-secondary-500">Reading sheet...</span>
        </div>
      ) : error ? (
        <div className="py-8 text-center">
          <AlertTriangle className="w-8 h-8 text-error-500 mx-auto mb-2" />
          <p className="text-error-700">{error}</p>
          <Button variant="outline" size="sm" onClick={onCancel} className="mt-4">Cancel</Button>
        </div>
      ) : (
        <div className="space-y-4">
                    {/* Detection summary — always */}
          {detection && !validationError && (
            <div className={`px-3 py-2.5 rounded-lg border text-sm ${
              detection.confidence === 'high' ? 'bg-success-50 border-success-200 text-success-900'
              : detection.confidence === 'medium' ? 'bg-info-50 border-info-200 text-info-900'
              : 'bg-warning-50 border-warning-200 text-warning-900'
            }`}>
              <div className="font-medium">{detection.summary}</div>
              {detection.warnings.length > 0 && (
                <ul className="mt-1 text-[11px] opacity-90 list-disc list-inside">
                  {detection.warnings.slice(0, 4).map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {!validationError && !detection && (
            <div className="text-xs text-secondary-500">
              {dataRowCount} data row{dataRowCount !== 1 ? 's' : ''} × {previewHeaders.length} column{previewHeaders.length !== 1 ? 's' : ''}
              {labelRow != null && ' (with question labels)'}
            </div>
          )}

{/* Preview grid */}
          <div className="border border-secondary-200 rounded-lg overflow-hidden">
            <div className="overflow-x-auto max-h-[380px] overflow-y-auto">
              <table className="w-full text-xs border-collapse">
                <tbody>
                  {previewRows.map((row, rIdx) => {
                    const isHeader = rIdx === headerRow;
                    const isLabel = rIdx === labelRow;
                    const isData = rIdx >= dataStartRow;
                    const isEmpty = row.every((v: unknown) => v == null || String(v).trim() === '');
                    const isBefore = rIdx < dataStartRow && !isHeader && !isLabel;
                    let bgClass = 'bg-white';
                    if (isHeader) bgClass = 'bg-primary-100';
                    else if (isLabel) bgClass = 'bg-blue-50';
                    else if (isEmpty && isData) bgClass = 'bg-warning-50/60';
                    else if (isBefore) bgClass = 'bg-secondary-50';

                    return (
                      <tr key={rIdx} className={`${bgClass} border-b border-secondary-100`}>
                        <td className="px-2 py-1 text-secondary-400 font-mono w-12 text-right border-r border-secondary-200 sticky left-0 bg-inherit flex-shrink-0">
                          <div className="flex items-center justify-end gap-1">
                            {isHeader && <span className="px-1 py-0.5 rounded bg-primary-600 text-white text-[9px] font-semibold leading-none">H</span>}
                            {isLabel && <span className="px-1 py-0.5 rounded bg-blue-600 text-white text-[9px] font-semibold leading-none">L</span>}
                            {isEmpty && isData && <span className="px-1 py-0.5 rounded bg-warning-500 text-white text-[9px] font-semibold leading-none">E</span>}
                            <span>{rIdx + 1}</span>
                          </div>
                        </td>
                        {Array.from({ length: maxCols }, (_, cIdx) => {
                          const val = (row as unknown[])[cIdx];
                          const full = val != null ? String(val) : '';
                          const display = full.length > 30 ? `${full.slice(0, 30)}…` : full;
                          return (
                            <td
                              key={cIdx}
                              className={`px-2 py-1 max-w-[140px] truncate ${isHeader ? 'font-semibold text-primary-900' : isLabel ? 'text-blue-700 italic' : isBefore ? 'text-secondary-400' : 'text-secondary-700'}`}
                              title={full}
                            >
                              {display || <span className="text-secondary-300">--</span>}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {totalRawRows > 6 && (
              <div className="px-3 py-1.5 bg-secondary-50 border-t border-secondary-200 text-xs text-secondary-500 text-center">
                Showing first rows (up to 6×8); full file imports on confirm
              </div>
            )}
          </div>

          
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              className="text-xs font-medium text-primary-700 hover:underline"
              onClick={() => setShowAdjust((v) => !v)}
            >
              {showAdjust ? 'Hide layout adjust' : 'Adjust layout'}
            </button>
            <span className="text-[11px] text-secondary-400">
              Header and empty rows/columns are detected automatically
            </span>
          </div>

          {showAdjust && (
          <div className="space-y-3 rounded-lg border border-secondary-200 p-3 bg-secondary-50/40">
{/* Preset buttons */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-secondary-500 mr-1">Format:</span>
            {([
              { key: 'auto-detect' as Preset, label: 'Auto-detect' },
              { key: 'simple' as Preset, label: 'Simple table (1 header row)' },
              { key: 'two-row' as Preset, label: 'Two-row header (labels + names)' },
            ]).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => applyPreset(key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${activePreset === key ? 'bg-primary-600 text-white' : 'bg-secondary-100 text-secondary-600 hover:bg-secondary-200'}`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Controls row */}
          <div className="flex items-end gap-4 flex-wrap">
            <div>
              <label className="block text-xs font-medium text-secondary-600 mb-1">Header row (1-based)</label>
              <input
                type="number" min={1} max={totalRawRows}
                value={headerRow + 1}
                onChange={(e) => {
                  const v = Math.max(0, Number(e.target.value) - 1);
                  setHeaderRow(v);
                  if (dataStartRow <= v) setDataStartRow(v + 1);
                  setActivePreset('auto-detect');
                }}
                className="w-24 px-3 py-1.5 text-sm border border-secondary-200 rounded-lg focus:outline-none focus:border-primary-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-secondary-600 mb-1">Question labels row (optional)</label>
              <input
                type="number" min={0} max={totalRawRows}
                value={labelRow != null ? labelRow + 1 : ''}
                placeholder="None"
                onChange={(e) => {
                  const raw = e.target.value.trim();
                  if (raw === '' || raw === '0') { setLabelRow(null); return; }
                  setLabelRow(Math.max(0, Number(raw) - 1));
                  setActivePreset('auto-detect');
                }}
                className="w-24 px-3 py-1.5 text-sm border border-secondary-200 rounded-lg focus:outline-none focus:border-primary-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-secondary-600 mb-1">Data starts on row</label>
              <input
                type="number" min={1} max={totalRawRows}
                value={dataStartRow + 1}
                onChange={(e) => {
                  setDataStartRow(Math.max(0, Number(e.target.value) - 1));
                  setActivePreset('auto-detect');
                }}
                className="w-24 px-3 py-1.5 text-sm border border-secondary-200 rounded-lg focus:outline-none focus:border-primary-400"
              />
            </div>
            <label className={`flex items-center gap-2 py-1.5 select-none ${emptyRowReport.count > 0 ? 'cursor-pointer' : 'opacity-50'}`}>
              <input
                type="checkbox" checked={removeEmptyRows}
                disabled={emptyRowReport.count === 0}
                onChange={(e) => setRemoveEmptyRows(e.target.checked)}
                className="w-4 h-4 rounded border-secondary-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-xs text-secondary-600">Remove empty data rows {emptyRowReport.count > 0 && `(${emptyRowReport.count})`}</span>
            </label>
            <label className={`flex items-center gap-2 py-1.5 select-none ${emptyColReport.count > 0 ? 'cursor-pointer' : 'opacity-50'}`}>
              <input
                type="checkbox" checked={removeEmptyCols}
                disabled={emptyColReport.count === 0}
                onChange={(e) => setRemoveEmptyCols(e.target.checked)}
                className="w-4 h-4 rounded border-secondary-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-xs text-secondary-600">Remove empty columns {emptyColReport.count > 0 && `(${emptyColReport.count})`}</span>
            </label>
          </div>

          {/* Validation error */}
          {validationError && (
            <div className="flex items-center gap-2 px-3 py-2.5 bg-error-50 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-error-600 flex-shrink-0" />
              <span className="text-xs text-error-700">{validationError}</span>
            </div>
          )}

          {/* Empty row warning */}
          {emptyRowReport.count > 0 && !removeEmptyRows && (
            <div className="flex items-start gap-2 px-3 py-2.5 bg-warning-50 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-warning-600 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-warning-700">
                <span className="font-medium">{emptyRowReport.count} empty row{emptyRowReport.count > 1 ? 's' : ''} within the data</span> (row{emptyRowReport.count > 1 ? 's' : ''} {formatEmptyRowSample(emptyRowReport)}).
                They will be kept. Check "Remove empty data rows" to drop them.
              </div>
            </div>
          )}
          {emptyRowReport.count > 0 && removeEmptyRows && (
            <div className="flex items-center gap-2 px-3 py-2.5 bg-info-50 rounded-lg">
              <Info className="w-4 h-4 text-info-600 flex-shrink-0" />
              <span className="text-xs text-info-700">{emptyRowReport.count} empty row{emptyRowReport.count > 1 ? 's' : ''} will be removed.</span>
            </div>
          )}

          {/* Empty column warning */}
          {emptyColReport.count > 0 && !removeEmptyCols && (
            <div className="flex items-start gap-2 px-3 py-2.5 bg-warning-50 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-warning-600 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-warning-700">
                <span className="font-medium">{emptyColReport.count} fully empty column{emptyColReport.count > 1 ? 's' : ''}</span> in the data region.
                They will be kept. Check "Remove empty columns" to drop them.
              </div>
            </div>
          )}
          {emptyColReport.count > 0 && removeEmptyCols && (
            <div className="flex items-center gap-2 px-3 py-2.5 bg-info-50 rounded-lg">
              <Info className="w-4 h-4 text-info-600 flex-shrink-0" />
              <span className="text-xs text-info-700">{emptyColReport.count} empty column{emptyColReport.count > 1 ? 's' : ''} will be removed.</span>
            </div>
          )}

          </div>
          )}

          {/* Legend */}
          <div className="flex items-center gap-4 text-xs text-secondary-500">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-primary-100 border border-primary-300" /> Header row</span>
            {labelRow != null && <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-50 border border-blue-300" /> Labels row</span>}
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-warning-50 border border-warning-300" /> Empty row</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-secondary-50 border border-secondary-200" /> Skipped</span>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-2 border-t border-secondary-200">
            <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
            <Button size="sm" onClick={handleConfirm} disabled={!!validationError || importing || dataRowCount === 0}>
              {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {request.queueTotal > 1
                ? `Import Sheet ${request.queueIndex + 1} of ${request.queueTotal}`
                : `Import ${dataRowCount} Row${dataRowCount !== 1 ? 's' : ''}`}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
