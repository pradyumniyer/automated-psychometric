// Data Quality screen — missingness, out-of-range, response bias, outliers, normality.
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ShieldCheck, AlertTriangle, Eye, TrendingDown, BarChart3, Activity,
  ChevronDown, ChevronRight, Settings2, Trash2, Plus, X,
  Check, Info, FileDown, ArrowRight, AlertCircle,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Line, ComposedChart, Scatter, ReferenceLine, Boxplot as RechartsBoxplot,
} from 'recharts';
import { supabase, Dataset, DemographicColumn, SubscaleGroup, ResponseScale } from '@/lib/supabase';
import { logAction, fetchHistory, deleteAction } from '@/lib/history';
import {
  computeDataQuality, histogramData, qqPlotData, boxplotData,
  DEFAULT_THRESHOLDS, DEFAULT_ALLOWED_NON_RESPONSE,
  QualityThresholds, AllowedNonResponse, RowFlag, Severity, FlagCategory,
} from '@/scientific/dataQuality';
import { Button, Card } from './ui';
import { Project } from '@/lib/supabase';

interface SubscaleState {
  id: string; name: string;
  minValue: number | null; maxValue: number | null;
  scaleType: 'numeric' | 'categorical';
}

interface Props {
  project: Project;
  excludedRows: Set<number>;
  onToggleRow: (rowIndex: number) => void;
  onBulkExclude: (indices: number[]) => void;
  onInspectRow: (rowIndex: number) => void;
  onGoToExport: () => void;
}

export function DataQualityScreen({
  project, excludedRows, onToggleRow, onBulkExclude, onInspectRow, onGoToExport,
}: Props) {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [activeDatasetId, setActiveDatasetId] = useState<string | null>(null);
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [demoCols, setDemoCols] = useState<DemographicColumn[]>([]);
  const [subscaleStates, setSubscaleStates] = useState<SubscaleState[]>([]);
  const [thresholds, setThresholds] = useState<QualityThresholds>(DEFAULT_THRESHOLDS);
  const [allowedNonResponse, setAllowedNonResponse] = useState<AllowedNonResponse>(DEFAULT_ALLOWED_NON_RESPONSE);
  const [showSettings, setShowSettings] = useState(false);
  const [newTextValue, setNewTextValue] = useState('');
  const [newSentinelValue, setNewSentinelValue] = useState('');

  // ── Load datasets ──
  const loadDatasets = useCallback(async () => {
    const { data } = await supabase.from('datasets').select('*').eq('project_id', project.id).order('created_at', { ascending: true });
    const dsList = (data || []) as Dataset[];
    setDatasets(dsList);
    if (dsList.length > 0 && !activeDatasetId) setActiveDatasetId(dsList[0].id);
  }, [project.id, activeDatasetId]);

  useEffect(() => { loadDatasets(); }, [loadDatasets]);

  // ── Load config for active dataset ──
  useEffect(() => {
    if (!activeDatasetId) { setDataset(null); return; }
    const ds = datasets.find((d) => d.id === activeDatasetId);
    if (!ds) { setDataset(null); return; }
    setDataset(ds);

    (async () => {
      const [{ data: demoData }, { data: subData }] = await Promise.all([
        supabase.from('demographic_columns').select('*').eq('dataset_id', activeDatasetId),
        supabase.from('subscale_groups').select('*').eq('dataset_id', activeDatasetId).order('display_order'),
      ]);
      setDemoCols((demoData || []) as DemographicColumn[]);
      if (subData) {
        const subs: SubscaleState[] = [];
        for (const sub of subData as SubscaleGroup[]) {
          const { data: scaleData } = await supabase.from('response_scales').select('*').eq('subscale_id', sub.id).maybeSingle();
          const scale = scaleData as ResponseScale | null;
          subs.push({
            id: sub.id, name: sub.name,
            minValue: scale?.min_value ?? null,
            maxValue: scale?.max_value ?? null,
            scaleType: (scale?.scale_type as 'numeric' | 'categorical') || 'numeric',
          });
        }
        setSubscaleStates(subs);
      } else {
        setSubscaleStates([]);
      }
    })();
  }, [activeDatasetId, datasets]);

  // ── Derived state ──
  const demoColumnNames = useMemo(() => new Set(demoCols.map((d) => d.column_name)), [demoCols]);
  const itemColumns = useMemo(() => (dataset?.headers || []).filter((c) => !demoColumnNames.has(c)), [dataset, demoColumnNames]);

  // Get scale min/max from first subscale with range, or overall
  const scaleMin = useMemo(() => {
    const s = subscaleStates.find((s) => s.minValue != null);
    return s?.minValue ?? null;
  }, [subscaleStates]);

  const scaleMax = useMemo(() => {
    const s = subscaleStates.find((s) => s.maxValue != null);
    return s?.maxValue ?? null;
  }, [subscaleStates]);

  // ── Compute quality result ──
  const qualityResult = useMemo(() => {
    if (!dataset || itemColumns.length === 0) return null;
    return computeDataQuality(
      dataset.rows as Record<string, unknown>[],
      dataset.headers,
      itemColumns,
      Array.from(excludedRows),
      scaleMin,
      scaleMax,
      allowedNonResponse,
      thresholds,
    );
  }, [dataset, itemColumns, excludedRows, scaleMin, scaleMax, allowedNonResponse, thresholds]);

  const totalRows = dataset?.rows.length ?? 0;
  const includedCount = totalRows - excludedRows.size;
  const excludedCount = excludedRows.size;

  // ── Handlers ──
  const handleBulkExclude = (category: FlagCategory) => {
    if (!qualityResult) return;
    const indices = qualityResult.flags
      .filter((f) => f.categories.has(category) && !excludedRows.has(f.rowIndex))
      .map((f) => f.rowIndex);
    if (indices.length === 0) return;
    onBulkExclude(indices);
  };

  const addTextValue = () => {
    const v = newTextValue.trim();
    if (!v) return;
    if (!allowedNonResponse.textValues.includes(v)) {
      setAllowedNonResponse({ ...allowedNonResponse, textValues: [...allowedNonResponse.textValues, v] });
    }
    setNewTextValue('');
  };

  const removeTextValue = (v: string) => {
    setAllowedNonResponse({ ...allowedNonResponse, textValues: allowedNonResponse.textValues.filter((t) => t !== v) });
  };

  const addSentinel = () => {
    const v = Number(newSentinelValue);
    if (isNaN(v)) return;
    if (!allowedNonResponse.numericSentinels.includes(v)) {
      setAllowedNonResponse({ ...allowedNonResponse, numericSentinels: [...allowedNonResponse.numericSentinels, v] });
    }
    setNewSentinelValue('');
  };

  const removeSentinel = (v: number) => {
    setAllowedNonResponse({ ...allowedNonResponse, numericSentinels: allowedNonResponse.numericSentinels.filter((n) => n !== v) });
  };

  // ── Empty / loading states ──
  if (datasets.length === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-secondary-50">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-secondary-100 flex items-center justify-center mx-auto mb-4">
            <ShieldCheck className="w-8 h-8 text-secondary-400" />
          </div>
          <h3 className="text-lg font-semibold text-secondary-900 mb-1">No data yet</h3>
          <p className="text-sm text-secondary-500 max-w-md">Import a dataset on the Configure screen first, then return here to review data quality.</p>
        </div>
      </div>
    );
  }

  if (!dataset || !qualityResult) {
    return (
      <div className="h-full flex items-center justify-center bg-secondary-50">
        <div className="text-sm text-secondary-500">Loading data quality analysis...</div>
      </div>
    );
  }

  const histData = histogramData(qualityResult.rowMeanValues);
  const qqData = qqPlotData(qualityResult.rowMeanValues);
  const boxData = boxplotData(qualityResult.rowMeanValues);

  return (
    <div className="h-full flex flex-col bg-secondary-50 overflow-hidden">
      {/* ── Dataset tabs ── */}
      <div className="flex items-center gap-1 px-5 py-1.5 bg-white border-b border-secondary-200 overflow-x-auto flex-shrink-0">
        {datasets.map((ds) => (
          <button key={ds.id} onClick={() => setActiveDatasetId(ds.id)}
            className={`flex items-center gap-1.5 px-3 py-1 text-sm rounded-md whitespace-nowrap transition-colors ${activeDatasetId === ds.id ? 'bg-primary-100 text-primary-700 border border-primary-300' : 'text-secondary-600 hover:bg-secondary-100 border border-transparent'}`}>
            {ds.sheet_name || ds.file_name}
            <span className="text-xs text-secondary-400">{ds.row_count}r</span>
          </button>
        ))}
      </div>

      {/* ── Scrollable content ── */}
      <div className="flex-1 overflow-auto">
        {/* ── Header ── */}
        <div className="px-6 py-4 bg-white border-b border-secondary-200">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-bold text-secondary-900">Data Quality</h1>
              <p className="text-sm text-secondary-500 mt-0.5">
                Review missingness, out-of-range values, response bias, outliers, and normality. Exclude problematic rows before export.
              </p>
            </div>
            <div className="flex items-center gap-4">
              <CountBadge label="Total" value={totalRows} color="secondary" />
              <CountBadge label="Included" value={includedCount} color="success" />
              <CountBadge label="Excluded" value={excludedCount} color="error" />
              <Button variant="outline" size="sm" onClick={onGoToExport}>
                <FileDown className="w-4 h-4" /> Continue to export
              </Button>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* ── Allowed non-response + thresholds ── */}
          <Card className="overflow-hidden">
            <button onClick={() => setShowSettings(!showSettings)}
              className="w-full flex items-center justify-between px-5 py-3 hover:bg-secondary-50 transition-colors">
              <div className="flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-secondary-500" />
                <span className="text-sm font-semibold text-secondary-700">Allowed non-response & thresholds</span>
              </div>
              {showSettings ? <ChevronDown className="w-4 h-4 text-secondary-400" /> : <ChevronRight className="w-4 h-4 text-secondary-400" />}
            </button>
            {showSettings && (
              <div className="px-5 pb-5 border-t border-secondary-100 space-y-5">
                {/* Allowed non-response */}
                <div className="pt-4">
                  <div className="text-xs font-semibold text-secondary-500 uppercase tracking-wide mb-2">Allowed non-response values</div>
                  <p className="text-xs text-secondary-400 mb-3">These values are NOT treated as data-quality failures. They are excluded from missingness calculations.</p>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {allowedNonResponse.textValues.map((v) => (
                      <span key={v} className="inline-flex items-center gap-1 px-2.5 py-1 bg-info-50 text-info-700 text-xs rounded-full border border-info-200">
                        {v}
                        <button onClick={() => removeTextValue(v)} className="hover:text-info-900"><X className="w-3 h-3" /></button>
                      </span>
                    ))}
                    {allowedNonResponse.numericSentinels.map((v) => (
                      <span key={v} className="inline-flex items-center gap-1 px-2.5 py-1 bg-accent-50 text-accent-700 text-xs rounded-full border border-accent-200">
                        {v}
                        <button onClick={() => removeSentinel(v)} className="hover:text-accent-900"><X className="w-3 h-3" /></button>
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="text" value={newTextValue} onChange={(e) => setNewTextValue(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTextValue(); } }}
                      placeholder="Add text (e.g. Not applicable)"
                      className="flex-1 px-3 py-1.5 text-sm border border-secondary-200 rounded-lg focus:outline-none focus:border-primary-400" />
                    <Button variant="secondary" size="sm" onClick={addTextValue}><Plus className="w-3.5 h-3.5" /> Text</Button>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <input type="number" value={newSentinelValue} onChange={(e) => setNewSentinelValue(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSentinel(); } }}
                      placeholder="Add numeric sentinel (e.g. -77)"
                      className="flex-1 px-3 py-1.5 text-sm border border-secondary-200 rounded-lg focus:outline-none focus:border-primary-400" />
                    <Button variant="secondary" size="sm" onClick={addSentinel}><Plus className="w-3.5 h-3.5" /> Number</Button>
                  </div>
                </div>

                {/* Thresholds */}
                <div>
                  <div className="text-xs font-semibold text-secondary-500 uppercase tracking-wide mb-2">Detection thresholds</div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                    <ThresholdInput label="Unexpected missing (% of items)" value={thresholds.unexpectedMissingPct}
                      onChange={(v) => setThresholds({ ...thresholds, unexpectedMissingPct: v })} />
                    <ThresholdInput label="Longstring (consecutive identical)" value={thresholds.longstringMin}
                      onChange={(v) => setThresholds({ ...thresholds, longstringMin: v })} step={1} />
                    <ThresholdInput label="Extreme responding rate" value={thresholds.extremeRate}
                      onChange={(v) => setThresholds({ ...thresholds, extremeRate: v })} step={0.05} />
                    <ThresholdInput label="Midpoint responding rate" value={thresholds.midpointRate}
                      onChange={(v) => setThresholds({ ...thresholds, midpointRate: v })} step={0.05} />
                    <ThresholdInput label="Low variance (fraction of scale range)" value={thresholds.lowVarianceFraction}
                      onChange={(v) => setThresholds({ ...thresholds, lowVarianceFraction: v })} step={0.01} />
                    <ThresholdInput label="Z-score threshold (|z|)" value={thresholds.zscoreThreshold}
                      onChange={(v) => setThresholds({ ...thresholds, zscoreThreshold: v })} step={0.1} />
                  </div>
                </div>

                {qualityResult.outOfRange.rangeSource === 'inferred' && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-warning-50 text-warning-700 text-xs rounded-lg">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    Scale range is <strong>inferred</strong> from observed data (min={qualityResult.outOfRange.scaleMin}, max={qualityResult.outOfRange.scaleMax}). Configure subscale scale min/max on the Configure screen for authoritative range checking.
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* ── Summary cards ── */}
          <div className="grid grid-cols-5 gap-4">
            <SummaryCard
              icon={<Eye className="w-5 h-5" />}
              title="Missingness"
              status={qualityResult.missingness.respondentsAboveThreshold > 0 ? 'warning' : 'success'}
              mainText={`${qualityResult.missingness.respondentsAboveThreshold} respondent${qualityResult.missingness.respondentsAboveThreshold !== 1 ? 's' : ''} above threshold`}
              subText={`>${thresholds.unexpectedMissingPct}% unexpected missing`}
              detail={qualityResult.missingness.itemsWithHighMissing.length > 0
                ? `${qualityResult.missingness.itemsWithHighMissing.length} item(s) with high missing`
                : 'No items with high unexpected missing'}
            />
            <SummaryCard
              icon={<AlertTriangle className="w-5 h-5" />}
              title="Out-of-range"
              status={qualityResult.outOfRange.rowsWithOutOfRange > 0 ? 'warning' : 'success'}
              mainText={`${qualityResult.outOfRange.rowsWithOutOfRange} row${qualityResult.outOfRange.rowsWithOutOfRange !== 1 ? 's' : ''}`}
              subText={`${qualityResult.outOfRange.outOfRangeCells} cell${qualityResult.outOfRange.outOfRangeCells !== 1 ? 's' : ''} out of range`}
              detail={qualityResult.outOfRange.rangeSource === 'inferred' ? 'Using inferred range' : `Range: ${qualityResult.outOfRange.scaleMin}–${qualityResult.outOfRange.scaleMax}`}
            />
            <SummaryCard
              icon={<Activity className="w-5 h-5" />}
              title="Response bias"
              status={qualityResult.responseBias.totalFlagged > 0 ? 'warning' : 'success'}
              mainText={`${qualityResult.responseBias.totalFlagged} flagged row${qualityResult.responseBias.totalFlagged !== 1 ? 's' : ''}`}
              subText={`SL: ${qualityResult.responseBias.straightLining} · Ext: ${qualityResult.responseBias.extremeResponding}`}
              detail={`Mid: ${qualityResult.responseBias.midpointResponding} · LowVar: ${qualityResult.responseBias.lowVariance}`}
            />
            <SummaryCard
              icon={<TrendingDown className="w-5 h-5" />}
              title="Outliers"
              status={qualityResult.outliers.combinedCount > 0 ? 'warning' : 'success'}
              mainText={`${qualityResult.outliers.combinedCount} outlier${qualityResult.outliers.combinedCount !== 1 ? 's' : ''}`}
              subText={`IQR: ${qualityResult.outliers.iqrCount} · Z: ${qualityResult.outliers.zscoreCount}`}
              detail="Based on row-mean distribution"
            />
            <SummaryCard
              icon={<BarChart3 className="w-5 h-5" />}
              title="Normality"
              status={qualityResult.normality.insufficientData ? 'neutral' : qualityResult.normality.isNormal === true ? 'success' : qualityResult.normality.isNormal === false ? 'warning' : 'neutral'}
              mainText={qualityResult.normality.insufficientData ? 'Insufficient data' : qualityResult.normality.isNormal ? 'Normal' : 'Non-normal'}
              subText={qualityResult.normality.n ? `n=${qualityResult.normality.n}` : ''}
              detail={qualityResult.normality.W != null ? `W=${qualityResult.normality.W.toFixed(3)}` : ''}
            />
          </div>

          {/* ── Flagged rows table ── */}
          <Card className="overflow-hidden">
            <div className="px-5 py-3 border-b border-secondary-200 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-secondary-900">Flagged rows</h2>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => handleBulkExclude('missingness')} disabled={!qualityResult.flags.some((f) => f.categories.has('missingness'))}>
                  Exclude high-missing
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleBulkExclude('responseBias')} disabled={!qualityResult.flags.some((f) => f.categories.has('responseBias'))}>
                  Exclude bias
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleBulkExclude('outlier')} disabled={!qualityResult.flags.some((f) => f.categories.has('outlier'))}>
                  Exclude outliers
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleBulkExclude('outOfRange')} disabled={!qualityResult.flags.some((f) => f.categories.has('outOfRange'))}>
                  Exclude out-of-range
                </Button>
              </div>
            </div>
            {qualityResult.flags.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <div className="w-12 h-12 rounded-xl bg-success-50 flex items-center justify-center mx-auto mb-3">
                  <Check className="w-6 h-6 text-success-600" />
                </div>
                <p className="text-sm text-secondary-500">No flagged rows on currently included cases.</p>
              </div>
            ) : (
              <div className="overflow-auto max-h-[400px]">
                <table className="w-full text-sm border-collapse">
                  <thead className="sticky top-0 bg-secondary-50 z-10">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-secondary-500 text-xs uppercase tracking-wide border-b border-secondary-200">Row #</th>
                      <th className="px-3 py-2 text-left font-medium text-secondary-500 text-xs uppercase tracking-wide border-b border-secondary-200">Severity</th>
                      <th className="px-3 py-2 text-left font-medium text-secondary-500 text-xs uppercase tracking-wide border-b border-secondary-200">Reasons</th>
                      <th className="px-3 py-2 text-center font-medium text-secondary-500 text-xs uppercase tracking-wide border-b border-secondary-200">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-secondary-100">
                    {qualityResult.flags.map((flag) => (
                      <tr key={flag.rowIndex} className={excludedRows.has(flag.rowIndex) ? 'bg-error-50/50' : 'bg-white'}>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <button onClick={() => onInspectRow(flag.rowIndex)}
                            className="text-primary-600 hover:text-primary-800 hover:underline font-mono text-xs font-medium">
                            #{flag.rowIndex + 1}
                          </button>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <SeverityBadge severity={flag.severity} />
                        </td>
                        <td className="px-3 py-2 text-secondary-700 text-xs">
                          {flag.reasons.join(' · ')}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button onClick={() => onToggleRow(flag.rowIndex)}
                            className={`px-2.5 py-1 text-xs rounded-full font-medium transition-colors ${excludedRows.has(flag.rowIndex) ? 'bg-success-100 text-success-700 hover:bg-success-200' : 'bg-error-100 text-error-700 hover:bg-error-200'}`}>
                            {excludedRows.has(flag.rowIndex) ? 'Include' : 'Exclude'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* ── Item missingness summary ── */}
          {qualityResult.itemMissingness.length > 0 && (
            <Card className="p-5">
              <h2 className="text-sm font-semibold text-secondary-900 mb-3">Item missingness summary</h2>
              <div className="overflow-auto max-h-[200px]">
                <table className="w-full text-xs border-collapse">
                  <thead className="sticky top-0 bg-secondary-50">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-medium text-secondary-500 border-b border-secondary-200">Item</th>
                      <th className="px-2 py-1.5 text-right font-medium text-secondary-500 border-b border-secondary-200">Unexpected missing %</th>
                      <th className="px-2 py-1.5 text-right font-medium text-secondary-500 border-b border-secondary-200">Allowed non-response %</th>
                      <th className="px-2 py-1.5 text-right font-medium text-secondary-500 border-b border-secondary-200">Total missing %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-secondary-100">
                    {qualityResult.itemMissingness.slice(0, 15).map((item) => (
                      <tr key={item.column}>
                        <td className="px-2 py-1.5 text-secondary-700 font-mono">{item.column}</td>
                        <td className="px-2 py-1.5 text-right">
                          <span className={item.unexpectedMissingPct > thresholds.unexpectedMissingPct ? 'text-error-600 font-medium' : 'text-secondary-600'}>
                            {item.unexpectedMissingPct.toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-right text-info-600">{item.allowedNonResponsePct.toFixed(1)}%</td>
                        <td className="px-2 py-1.5 text-right text-secondary-500">{item.totalMissingPct.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* ── Charts ── */}
          <div className="grid grid-cols-3 gap-4">
            {/* Histogram with normal curve */}
            <Card className="p-4">
              <h3 className="text-sm font-semibold text-secondary-900 mb-1">Histogram with normal curve</h3>
              <p className="text-xs text-secondary-400 mb-3">Distribution of row means (included rows)</p>
              {histData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <ComposedChart data={histData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                    <XAxis dataKey="bin" tick={{ fontSize: 8 }} angle={-30} textAnchor="end" height={40} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={{ fontSize: 11 }} />
                    <Bar dataKey="count" fill="#0d9488" opacity={0.7} name="Count" />
                    <Line type="monotone" dataKey="normalCurve" stroke="#ea580c" strokeWidth={2} dot={false} name="Normal curve" />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[200px] flex items-center justify-center text-xs text-secondary-400">Insufficient data for histogram</div>
              )}
            </Card>

            {/* Q-Q plot */}
            <Card className="p-4">
              <h3 className="text-sm font-semibold text-secondary-900 mb-1">Q–Q plot</h3>
              <p className="text-xs text-secondary-400 mb-3">Sample vs theoretical quantiles</p>
              {qqData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <ComposedChart data={qqData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                    <XAxis dataKey="theoretical" tick={{ fontSize: 10 }} domain={['dataMin', 'dataMax']} type="number" />
                    <YAxis tick={{ fontSize: 10 }} domain={['dataMin', 'dataMax']} type="number" />
                    <Tooltip contentStyle={{ fontSize: 11 }} />
                    <ReferenceLine segment={[{ x: Math.min(...qqData.map(d => d.theoretical)), y: Math.min(...qqData.map(d => d.theoretical)) }, { x: Math.max(...qqData.map(d => d.theoretical)), y: Math.max(...qqData.map(d => d.theoretical)) }]} stroke="#a8a29e" strokeDasharray="4 4" />
                    <Scatter dataKey="sample" fill="#0d9488" name="Sample" />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[200px] flex items-center justify-center text-xs text-secondary-400">Insufficient data for Q-Q plot</div>
              )}
            </Card>

            {/* Boxplot (simplified as bar representation) */}
            <Card className="p-4">
              <h3 className="text-sm font-semibold text-secondary-900 mb-1">Boxplot</h3>
              <p className="text-xs text-secondary-400 mb-3">Row mean distribution with outliers</p>
              {boxData ? (
                <BoxplotDisplay data={boxData} />
              ) : (
                <div className="h-[200px] flex items-center justify-center text-xs text-secondary-400">Insufficient data for boxplot</div>
              )}
            </Card>
          </div>

          {/* ── Normality interpretation ── */}
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-secondary-900 mb-2">Normality assessment</h2>
            <div className="grid grid-cols-4 gap-4 mb-3">
              <StatBox label="Test" value={qualityResult.normality.insufficientData ? '—' : 'Shapiro-Wilk'} />
              <StatBox label="W statistic" value={qualityResult.normality.W != null ? qualityResult.normality.W.toFixed(4) : '—'} />
              <StatBox label="p-value" value={qualityResult.normality.pValue != null ? qualityResult.normality.pValue.toFixed(4) : '—'} />
              <StatBox label="Verdict" value={qualityResult.normality.insufficientData ? 'Insufficient' : qualityResult.normality.isNormal ? 'Normal' : 'Non-normal'} />
            </div>
            <div className="grid grid-cols-2 gap-4 mb-3">
              <StatBox label="Skewness" value={qualityResult.normality.skewness != null ? qualityResult.normality.skewness.toFixed(4) : '—'} />
              <StatBox label="Excess kurtosis" value={qualityResult.normality.excessKurtosis != null ? qualityResult.normality.excessKurtosis.toFixed(4) : '—'} />
            </div>
            <div className="flex items-start gap-2 px-3 py-2.5 bg-secondary-50 rounded-lg">
              <Info className="w-4 h-4 text-secondary-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-secondary-600">{qualityResult.normality.interpretation}</p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ──

function CountBadge({ label, value, color }: { label: string; value: number; color: string }) {
  const colors: Record<string, string> = {
    secondary: 'bg-secondary-100 text-secondary-700',
    success: 'bg-success-100 text-success-700',
    error: 'bg-error-100 text-error-700',
  };
  return (
    <div className={`px-3 py-1.5 rounded-lg ${colors[color]}`}>
      <span className="text-xs font-medium opacity-70">{label}</span>
      <span className="text-sm font-bold ml-1.5">{value}</span>
    </div>
  );
}

function SummaryCard({ icon, title, status, mainText, subText, detail }: {
  icon: React.ReactNode; title: string; status: 'success' | 'warning' | 'neutral';
  mainText: string; subText: string; detail: string;
}) {
  const statusColors: Record<string, string> = {
    success: 'border-success-200 bg-success-50/50',
    warning: 'border-warning-200 bg-warning-50/50',
    neutral: 'border-secondary-200 bg-white',
  };
  const iconColors: Record<string, string> = {
    success: 'text-success-600 bg-success-100',
    warning: 'text-warning-600 bg-warning-100',
    neutral: 'text-secondary-500 bg-secondary-100',
  };
  return (
    <Card className={`p-4 ${statusColors[status]}`}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${iconColors[status]}`}>{icon}</div>
        <span className="text-xs font-semibold text-secondary-700 uppercase tracking-wide">{title}</span>
      </div>
      <div className="text-sm font-bold text-secondary-900">{mainText}</div>
      <div className="text-xs text-secondary-500 mt-0.5">{subText}</div>
      <div className="text-xs text-secondary-400 mt-1">{detail}</div>
    </Card>
  );
}

function SeverityBadge({ severity }: { severity: Severity }) {
  const colors: Record<Severity, string> = {
    mild: 'bg-info-100 text-info-700 border-info-300',
    moderate: 'bg-warning-100 text-warning-700 border-warning-300',
    severe: 'bg-error-100 text-error-700 border-error-300',
  };
  return <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full border ${colors[severity]}`}>{severity}</span>;
}

function ThresholdInput({ label, value, onChange, step = 1 }: {
  label: string; value: number; onChange: (v: number) => void; step?: number;
}) {
  return (
    <div>
      <label className="text-xs text-secondary-500 block mb-1">{label}</label>
      <input type="number" value={value} step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full px-3 py-1.5 text-sm border border-secondary-200 rounded-lg focus:outline-none focus:border-primary-400" />
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-2 bg-secondary-50 rounded-lg">
      <div className="text-xs text-secondary-500 mb-0.5">{label}</div>
      <div className="text-sm font-semibold text-secondary-900">{value}</div>
    </div>
  );
}

function BoxplotDisplay({ data }: { data: import('@/scientific/dataQuality').BoxplotData }) {
  // Render a simple visual boxplot using divs
  const allVals = [data.min, data.q1, data.median, data.q3, data.max, ...data.outliers];
  const lo = Math.min(...allVals);
  const hi = Math.max(...allVals);
  const range = hi - lo || 1;
  const pct = (v: number) => ((v - lo) / range) * 100;

  return (
    <div className="h-[200px] flex flex-col justify-center px-4">
      <div className="relative h-32">
        {/* Whiskers */}
        <div className="absolute left-1/2 w-px bg-secondary-300" style={{ top: `${100 - pct(data.max)}%`, height: `${pct(data.max) - pct(data.q3)}%` }} />
        <div className="absolute left-1/2 w-px bg-secondary-300" style={{ top: `${100 - pct(data.q1)}%`, height: `${pct(data.q1) - pct(data.min)}%` }} />
        {/* Max whisker cap */}
        <div className="absolute left-1/2 -translate-x-1/2 w-4 h-px bg-secondary-300" style={{ top: `${100 - pct(data.max)}%` }} />
        {/* Min whisker cap */}
        <div className="absolute left-1/2 -translate-x-1/2 w-4 h-px bg-secondary-300" style={{ top: `${100 - pct(data.min)}%` }} />
        {/* Box */}
        <div className="absolute left-1/2 -translate-x-1/2 w-12 bg-primary-200 border border-primary-400 rounded"
          style={{ top: `${100 - pct(data.q3)}%`, height: `${pct(data.q3) - pct(data.q1)}%` }} />
        {/* Median line */}
        <div className="absolute left-1/2 -translate-x-1/2 w-12 h-0.5 bg-primary-700"
          style={{ top: `${100 - pct(data.median)}%` }} />
        {/* Outliers */}
        {data.outliers.map((v, i) => (
          <div key={i} className="absolute left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-error-500 rounded-full"
            style={{ top: `calc(${100 - pct(v)}% - 3px)` }} />
        ))}
      </div>
      <div className="flex justify-between text-xs text-secondary-400 mt-1">
        <span>{lo.toFixed(2)}</span>
        <span>{hi.toFixed(2)}</span>
      </div>
      <div className="text-center text-xs text-secondary-500 mt-1">
        Q1: {data.q1.toFixed(2)} · Med: {data.median.toFixed(2)} · Q3: {data.q3.toFixed(2)}
      </div>
      {data.outliers.length > 0 && (
        <div className="text-center text-xs text-error-500 mt-0.5">{data.outliers.length} outlier(s)</div>
      )}
    </div>
  );
}
