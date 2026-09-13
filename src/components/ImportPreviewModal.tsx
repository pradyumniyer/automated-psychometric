import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Upload, AlertTriangle, Info, Loader2, X,
} from 'lucide-react';
import {
  getRawSheet,
  detectHeaderLayout,
  analyzeEmptyRows,
  parseSheetConfigurable,
  type ParsedSheet,
  type HeaderLayoutDetection,
  type EmptyRowReport,
} from '@/lib/fileParser';
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
  const [removeEmptyRows, setRemoveEmptyRows] = useState(false);
  const [activePreset, setActivePreset] = useState<Preset>('auto-detect');
  const [importing, setImporting] = useState(false);

  // Load raw rows when request changes
  useEffect(() => {
    if (!request) { setRawRows(null); return; }
    setLoading(true);
    setError(null);
    setRemoveEmptyRows(false);
    setImporting(false);
    getRawSheet(request.file, request.sheetName)
      .then((rows) => {
        setRawRows(rows);
        // Auto-detect on open
        const layout = detectHeaderLayout(rows);
        applyLayout(layout);
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
  const previewRows = rawRows?.slice(0, 20) ?? [];
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

  const dataRowCount = useMemo(() => {
    if (!rawRows) return 0;
    const total = rawRows.length - dataStartRow;
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

  const maxCols = rawRows
    ? Math.max(...rawRows.slice(0, 20).map((r) => r.length), 0)
    : 0;

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
            <label className="flex items-center gap-2 py-1.5 cursor-pointer select-none">
              <input
                type="checkbox" checked={removeEmptyRows}
                onChange={(e) => setRemoveEmptyRows(e.target.checked)}
                className="w-4 h-4 rounded border-secondary-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-xs text-secondary-600">Remove fully empty data rows</span>
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
                <span className="font-medium">Found {emptyRowReport.count} fully empty row{emptyRowReport.count > 1 ? 's' : ''}</span> in the data region (row{emptyRowReport.count > 1 ? 's' : ''} {formatEmptyRowSample(emptyRowReport)}).
                They will be kept. Check "Remove fully empty data rows" to drop them.
              </div>
            </div>
          )}
          {emptyRowReport.count > 0 && removeEmptyRows && (
            <div className="flex items-center gap-2 px-3 py-2.5 bg-info-50 rounded-lg">
              <Info className="w-4 h-4 text-info-600 flex-shrink-0" />
              <span className="text-xs text-info-700">{emptyRowReport.count} empty row{emptyRowReport.count > 1 ? 's' : ''} will be removed.</span>
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
                          const display = val != null ? String(val) : '';
                          return (
                            <td
                              key={cIdx}
                              className={`px-2 py-1 max-w-[200px] truncate ${isHeader ? 'font-semibold text-primary-900' : isLabel ? 'text-blue-700 italic' : isBefore ? 'text-secondary-400' : 'text-secondary-700'}`}
                              title={display}
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
            {totalRawRows > 20 && (
              <div className="px-3 py-1.5 bg-secondary-50 border-t border-secondary-200 text-xs text-secondary-500 text-center">
                Showing first 20 of {totalRawRows} rows
              </div>
            )}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 text-xs text-secondary-500">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-primary-100 border border-primary-300" /> Header row</span>
            {labelRow != null && <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-50 border border-blue-300" /> Labels row</span>}
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-warning-50 border border-warning-300" /> Empty row</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-secondary-50 border border-secondary-200" /> Skipped</span>
          </div>

          {/* Detected column names */}
          {previewHeaders.length > 0 && !validationError && (
            <div>
              <h4 className="text-xs font-semibold text-secondary-500 uppercase tracking-wide mb-1.5">Detected columns ({previewHeaders.length})</h4>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                {previewHeaders.map((h, i) => (
                  <span key={i} className={`px-2 py-0.5 text-xs rounded-full border ${h.startsWith('Column_') ? 'bg-warning-50 text-warning-700 border-warning-200' : 'bg-secondary-100 text-secondary-700 border-secondary-200'}`}>
                    {h}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Summary line */}
          {!validationError && (
            <div className="text-xs text-secondary-500">
              {dataRowCount} data row{dataRowCount !== 1 ? 's' : ''} × {previewHeaders.length} column{previewHeaders.length !== 1 ? 's' : ''}
              {labelRow != null && ' (with question labels)'}
            </div>
          )}

          {/* Help note */}
          <div className="flex items-start gap-2 px-3 py-2 bg-secondary-50 rounded-lg">
            <Info className="w-3.5 h-3.5 text-secondary-400 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-secondary-500 leading-relaxed">
              Works best with tabular exports from Qualtrics, SurveyMonkey, REDCap, Google Forms, and Excel/CSV.
              For multi-row headers, use the controls above to pick the name row.
              Empty rows inside the data are kept by default.
            </p>
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
