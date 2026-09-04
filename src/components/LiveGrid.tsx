// LiveGrid — central data grid with conditional headers (simple or grouped),
// score/interpretation columns inline, and optional Sum/Mean summary rows.
import React from 'react';
import { Eye, EyeOff } from 'lucide-react';

export interface GridColumn {
  key: string;
  label: string;
  group: string;
  type: 'data' | 'score' | 'interpretation' | 'demo';
}

export interface GridGroup {
  name: string;
  columns: GridColumn[];
  color?: string;
}

export interface SummaryData {
  sums: Record<string, number | null>;
  means: Record<string, number | null>;
}

interface LiveGridProps {
  groups: GridGroup[];
  rows: Record<string, unknown>[];
  realRowCount: number;
  excludedRows: Set<number>;
  onToggleRow: (index: number) => void;
  showExcludedOnly: boolean;
  onToggleFilter: () => void;
  highlightRowIndex: number | null;
  highlightRef: React.RefObject<HTMLTableRowElement>;
  summary: SummaryData;
  showSummarySum: boolean;
  showSummaryMean: boolean;
  hasScoring: boolean;
  maxDisplayRows?: number;
}

export function LiveGrid({
  groups, rows, realRowCount, excludedRows, onToggleRow,
  showExcludedOnly, onToggleFilter, highlightRowIndex, highlightRef,
  summary, showSummarySum, showSummaryMean, hasScoring, maxDisplayRows = 200,
}: LiveGridProps) {
  const displayRows = rows.slice(0, maxDisplayRows);
  const useGroupedHeaders = groups.some((g) => g.name !== 'Demographics' && g.name !== 'Unassigned' && g.columns.some((c) => c.type === 'data'));
  const showSummary = hasScoring && (showSummarySum || showSummaryMean);
  const showSumRow = showSummary && showSummarySum;
  const showMeanRow = showSummary && showSummaryMean;

  const groupColors: Record<string, string> = {
    'Demographics': 'bg-secondary-100 text-secondary-700 border-secondary-300',
    'Unassigned': 'bg-warning-100 text-warning-700 border-warning-300',
    'Overall Scale': 'bg-primary-100 text-primary-700 border-primary-300',
  };
  const colTypeColors: Record<string, string> = {
    'score': 'bg-primary-50/60 text-primary-900 font-medium',
    'interpretation': 'bg-accent-50/60 text-accent-900 font-medium',
    'demo': 'bg-secondary-50/40 text-secondary-700',
    'data': 'text-secondary-700',
  };

  // Flatten all columns for simple-header mode
  const flatColumns = groups.flatMap((g) => g.columns);

  const renderCell = (row: Record<string, unknown>, col: GridColumn) => {
    const val = row[col.key];
    if (val != null && val !== '') return String(val);
    return <span className="text-secondary-300">—</span>;
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-lg font-bold text-secondary-900">Data Grid</h2>
          <p className="text-xs text-secondary-500">
            {realRowCount} rows · {flatColumns.length} columns
            {useGroupedHeaders ? ' · grouped by subscale' : ''}
          </p>
        </div>
        <button
          onClick={onToggleFilter}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-secondary-200 rounded-lg text-secondary-600 hover:bg-secondary-50 transition-colors"
        >
          {showExcludedOnly ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          {showExcludedOnly ? 'Show All' : 'Show Excluded'}
        </button>
      </div>

      <div className="flex-1 overflow-auto border border-secondary-200 rounded-xl bg-white">
        <table className="w-full text-sm border-collapse">
          {useGroupedHeaders ? (
            <thead className="sticky top-0 z-20">
              {/* Row 1: merged group headers */}
              <tr>
                <th rowSpan={2} className="px-2 py-2 text-left font-medium text-secondary-500 sticky left-0 bg-secondary-50 border-b border-r border-secondary-200 z-30">#</th>
                <th rowSpan={2} className="px-2 py-2 text-center font-medium text-secondary-500 border-b border-r border-secondary-200 bg-secondary-50 sticky top-0 z-20">Status</th>
                {groups.map((g) => (
                  g.columns.length > 1 ? (
                    <th key={g.name} colSpan={g.columns.length}
                      className={`px-3 py-1.5 text-center font-semibold text-xs uppercase tracking-wide border-b border-r border-secondary-200 ${groupColors[g.name] || 'bg-primary-100 text-primary-700 border-primary-300'}`}>
                      {g.name}
                    </th>
                  ) : (
                    <th key={g.name} rowSpan={2}
                      className={`px-3 py-2 text-left font-semibold text-xs uppercase tracking-wide border-b border-r border-secondary-200 ${groupColors[g.name] || 'bg-primary-100 text-primary-700 border-primary-300'}`}>
                      {g.name}
                    </th>
                  )
                ))}
              </tr>
              {/* Row 2: individual column headers */}
              <tr>
                {groups.map((g) =>
                  g.columns.length > 1 ? (
                    <React.Fragment key={g.name + '-cols'}>
                      {g.columns.map((col) => (
                        <th key={col.key} className={`px-2 py-1.5 text-left font-medium text-xs whitespace-nowrap border-b border-r border-secondary-200 last:border-r-0 ${
                          col.type === 'score' ? 'bg-primary-50 text-primary-700' :
                          col.type === 'interpretation' ? 'bg-accent-50 text-accent-700' :
                          col.type === 'demo' ? 'bg-secondary-50 text-secondary-600' :
                          'bg-secondary-50 text-secondary-600'
                        }`}>
                          {col.label}
                        </th>
                      ))}
                    </React.Fragment>
                  ) : null
                )}
              </tr>
            </thead>
          ) : (
            <thead className="sticky top-0 z-20">
              <tr>
                <th className="px-2 py-2 text-left font-medium text-secondary-500 sticky left-0 bg-secondary-50 border-b border-r border-secondary-200 z-30">#</th>
                <th className="px-2 py-2 text-center font-medium text-secondary-500 border-b border-r border-secondary-200 bg-secondary-50 sticky top-0 z-20">Status</th>
                {flatColumns.map((col) => (
                  <th key={col.key} className={`px-3 py-2 text-left font-medium text-xs whitespace-nowrap border-b border-r border-secondary-200 last:border-r-0 ${
                    col.type === 'score' ? 'bg-primary-50 text-primary-700' :
                    col.type === 'interpretation' ? 'bg-accent-50 text-accent-700' :
                    col.type === 'demo' ? 'bg-secondary-50 text-secondary-600' :
                    'bg-secondary-50 text-secondary-600'
                  }`}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody className="divide-y divide-secondary-100">
            {displayRows.map((row, i) => {
              const realIdx = showExcludedOnly ? i : i;
              const isExcluded = excludedRows.has(realIdx);
              const isHighlighted = highlightRowIndex === realIdx;
              return (
                <tr key={i} ref={isHighlighted ? highlightRef : undefined}
                  className={isHighlighted ? 'bg-accent-100 ring-2 ring-accent-400' : isExcluded ? 'bg-error-50/50' : i % 2 ? 'bg-secondary-50/20' : 'bg-white'}>
                  <td className="px-2 py-1.5 text-secondary-400 font-mono text-xs sticky left-0 bg-inherit border-r border-secondary-100">{realIdx + 1}</td>
                  <td className="px-2 py-1.5 text-center border-r border-secondary-100">
                    <button onClick={() => onToggleRow(realIdx)}
                      className={`px-1.5 py-0.5 text-xs rounded-full transition-colors ${isExcluded ? 'bg-error-100 text-error-700 hover:bg-error-200' : 'bg-success-100 text-success-700 hover:bg-success-200'}`}>
                      {isExcluded ? 'Excl.' : 'Incl.'}
                    </button>
                  </td>
                  {useGroupedHeaders ? (
                    groups.map((g) => (
                      <React.Fragment key={g.name + '-row-' + i}>
                        {g.columns.map((col) => (
                          <td key={col.key} className={`px-2 py-1.5 whitespace-nowrap max-w-[180px] truncate border-r border-secondary-100 last:border-r-0 ${colTypeColors[col.type] || ''}`}>
                            {renderCell(row, col)}
                          </td>
                        ))}
                      </React.Fragment>
                    ))
                  ) : (
                    flatColumns.map((col) => (
                      <td key={col.key} className={`px-2 py-1.5 whitespace-nowrap max-w-[180px] truncate border-r border-secondary-100 last:border-r-0 ${colTypeColors[col.type] || ''}`}>
                        {renderCell(row, col)}
                      </td>
                    ))
                  )}
                </tr>
              );
            })}
          </tbody>
          {showSummary && (
            <tfoot>
              {showSumRow && (
                <tr className="bg-secondary-100 font-medium border-t-2 border-secondary-300">
                  <td colSpan={2} className="px-2 py-2 text-xs text-secondary-500 text-right sticky left-0 bg-secondary-100 border-r border-secondary-200">Sum →</td>
                  {useGroupedHeaders ? (
                    groups.map((g) => (
                      <React.Fragment key={g.name + '-sum'}>
                        {g.columns.map((col) => (
                          <td key={col.key + '-sum'} className="px-2 py-2 text-sm text-secondary-800 border-r border-secondary-100 last:border-r-0">
                            {summary.sums[col.key] != null ? summary.sums[col.key]!.toFixed(2) : <span className="text-secondary-300">—</span>}
                          </td>
                        ))}
                      </React.Fragment>
                    ))
                  ) : (
                    flatColumns.map((col) => (
                      <td key={col.key + '-sum'} className="px-2 py-2 text-sm text-secondary-800 border-r border-secondary-100 last:border-r-0">
                        {summary.sums[col.key] != null ? summary.sums[col.key]!.toFixed(2) : <span className="text-secondary-300">—</span>}
                      </td>
                    ))
                  )}
                </tr>
              )}
              {showMeanRow && (
                <tr className="bg-secondary-50 font-medium border-t border-secondary-200">
                  <td colSpan={2} className="px-2 py-2 text-xs text-secondary-500 text-right sticky left-0 bg-secondary-50 border-r border-secondary-200">Mean →</td>
                  {useGroupedHeaders ? (
                    groups.map((g) => (
                      <React.Fragment key={g.name + '-mean'}>
                        {g.columns.map((col) => (
                          <td key={col.key + '-mean'} className="px-2 py-2 text-sm text-secondary-800 border-r border-secondary-100 last:border-r-0">
                            {summary.means[col.key] != null ? summary.means[col.key]!.toFixed(2) : <span className="text-secondary-300">—</span>}
                          </td>
                        ))}
                      </React.Fragment>
                    ))
                  ) : (
                    flatColumns.map((col) => (
                      <td key={col.key + '-mean'} className="px-2 py-2 text-sm text-secondary-800 border-r border-secondary-100 last:border-r-0">
                        {summary.means[col.key] != null ? summary.means[col.key]!.toFixed(2) : <span className="text-secondary-300">—</span>}
                      </td>
                    ))
                  )}
                </tr>
              )}
            </tfoot>
          )}
        </table>
        {rows.length > maxDisplayRows && (
          <div className="px-4 py-2 text-sm text-secondary-500 text-center border-t border-secondary-100">
            Showing first {maxDisplayRows} of {rows.length} rows
          </div>
        )}
      </div>
    </div>
  );
}
