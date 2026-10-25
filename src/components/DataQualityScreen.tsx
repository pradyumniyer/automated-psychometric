// Data Quality screen — missingness, out-of-range, response bias, outliers, normality.
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  ShieldCheck, AlertTriangle, Eye, TrendingDown, BarChart3, Activity,
  ChevronDown, ChevronRight, Settings2, Plus, X,
  Check, Info, FileDown, AlertCircle, RotateCcw,
} from 'lucide-react';
import {
  Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Line, ComposedChart, Scatter, ReferenceLine,
} from 'recharts';
import type { Dataset, DemographicColumn, Project, SubscaleGroup, ResponseScale } from '@/types/domain';
import { datasetRepository, surveyConfigRepository } from '@/storage/repositories';

import {
  computeDataQuality, histogramData, qqPlotData, boxplotData,
  DEFAULT_THRESHOLDS, DEFAULT_ALLOWED_NON_RESPONSE,
  QualityThresholds, Severity, FlagCategory,
} from '@/scientific/dataQuality';
import { normalizeResponseMatrix, SubscaleConfig } from '@/scientific/scoring';
import { saveDataQualityThresholds } from '@/lib/dataQualitySettings';
import { Button, Card } from './ui';

interface SubscaleState {
  id: string; name: string;
  items: SubscaleGroup['items'];
  scoringMethod: SubscaleGroup['scoring_method'];
  minValue: number | null; maxValue: number | null;
  scaleType: 'numeric' | 'categorical';
  labelMap: ResponseScale['label_map'];
  confirmed?: boolean;
}

function configuredRange(subscale: SubscaleState): { min: number; max: number } | null {
  if (
    Number.isFinite(subscale.minValue)
    && Number.isFinite(subscale.maxValue)
    && subscale.minValue! <= subscale.maxValue!
  ) {
    return { min: subscale.minValue!, max: subscale.maxValue! };
  }
  const values = subscale.labelMap.map((entry) => entry.value).filter((value): value is number => value !== null);
  if (values.length > 0 && values.every(Number.isFinite)) {
    return { min: Math.min(...values), max: Math.max(...values) };
  }
  return null;
}

interface Props {
  project: Project;
  excludedRows: Set<number>;
  onToggleRow: (rowIndex: number) => Promise<void>;
  onBulkExclude: (indices: number[]) => Promise<void>;
  onSetExcludedRows: (rows: Set<number>) => Promise<void>;
  onInspectRow: (rowIndex: number) => void;
  onGoToExport: () => void;
  sharedDatasetId: string | null;
  onDatasetChange: (id: string | null) => void;
}

export function DataQualityScreen({
  project, excludedRows, onToggleRow, onBulkExclude, onSetExcludedRows, onInspectRow, onGoToExport,
  sharedDatasetId, onDatasetChange,
}: Props) {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const activeDatasetId = sharedDatasetId;
  const setActiveDatasetId = onDatasetChange;
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [demoCols, setDemoCols] = useState<DemographicColumn[]>([]);
  const [subscaleStates, setSubscaleStates] = useState<SubscaleState[]>([]);
  const [thresholds, setThresholds] = useState<QualityThresholds>(DEFAULT_THRESHOLDS);
  const thresholdsLoadedForDataset = useRef<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showAllItems, setShowAllItems] = useState(false);
  const [newTextValue, setNewTextValue] = useState('');
  const [newSentinelValue, setNewSentinelValue] = useState('');

  // ── Load datasets ──
  const loadDatasets = useCallback(async () => {
    try {
      const dsList = await datasetRepository.list(project.id);
      setDatasets(dsList);
      if (dsList.length > 0 && !activeDatasetId) setActiveDatasetId(dsList[0].id);
      setStorageError(null);
    } catch (error) {
      setStorageError(`Failed to load datasets: ${(error as Error).message}`);
    }
  }, [project.id, activeDatasetId, setActiveDatasetId]);

  // When datasets load and no active dataset is set, pick the first
  useEffect(() => {
    if (datasets.length > 0 && !activeDatasetId) setActiveDatasetId(datasets[0].id);
  }, [datasets, activeDatasetId, setActiveDatasetId]);

  useEffect(() => { loadDatasets(); }, [loadDatasets]);

  // ── Load config for active dataset ──
  useEffect(() => {
    thresholdsLoadedForDataset.current = null;
    if (!activeDatasetId) { setDataset(null); return; }
    const ds = datasets.find((d) => d.id === activeDatasetId);
    if (!ds) { setDataset(null); return; }
    setDataset(ds);

    let cancelled = false;
    (async () => {
      try {
        const config = await surveyConfigRepository.get(activeDatasetId);
        if (!config) throw new Error('Dataset configuration is missing.');
        if (cancelled) return;
        setDemoCols(config.demographic_columns);
        setThresholds({ ...DEFAULT_THRESHOLDS, ...config.dq_thresholds });
        thresholdsLoadedForDataset.current = activeDatasetId;
        setSubscaleStates(config.subscales.map((subscale) => ({
          id: subscale.id,
          name: subscale.name,
          items: subscale.items ?? [],
          scoringMethod: subscale.scoring_method,
          minValue: subscale.response_scale?.min_value ?? null,
          maxValue: subscale.response_scale?.max_value ?? null,
          scaleType: subscale.response_scale?.scale_type ?? 'numeric',
          labelMap: subscale.response_scale?.label_map ?? [],
        })));
        setStorageError(null);
      } catch (error) {
        if (!cancelled) setStorageError(`Failed to load dataset configuration: ${(error as Error).message}`);
      }
    })();
    return () => { cancelled = true; };
  }, [activeDatasetId, datasets]);

  useEffect(() => {
    if (!activeDatasetId || thresholdsLoadedForDataset.current !== activeDatasetId) return;
    let cancelled = false;
    const saveTimer = setTimeout(() => {
      saveDataQualityThresholds(activeDatasetId, thresholds)
        .then(() => {
          if (!cancelled) setStorageError(null);
        })
        .catch((error: unknown) => {
          if (!cancelled) setStorageError(`Failed to save Data Quality thresholds: ${(error as Error).message}`);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(saveTimer);
    };
  }, [activeDatasetId, thresholds]);

  // ── Derived state ──
  const demoColumnNames = useMemo(() => new Set(demoCols.map((d) => d.column_name)), [demoCols]);
  const itemColumns = useMemo(() => (dataset?.headers || []).filter((c) => !demoColumnNames.has(c)), [dataset, demoColumnNames]);

  // Get scale min/max from first subscale with range, or overall
  const scaleMin = useMemo(() => {
    const range = subscaleStates.map(configuredRange).find((candidate) => candidate !== null);
    return range?.min ?? null;
  }, [subscaleStates]);

  const scaleMax = useMemo(() => {
    const range = subscaleStates.map(configuredRange).find((candidate) => candidate !== null);
    return range?.max ?? null;
  }, [subscaleStates]);

  // Only items assigned to subscales are analysed (same resolution path as scoring).
  const qualityNormalization = useMemo(() => {
    if (!dataset) return null;
    const configs: SubscaleConfig[] = [];
    const reverseRangesByColumn: Record<string, { min: number; max: number }> = {};
    const analysedColumns: string[] = [];

    for (const subscale of subscaleStates) {
      if (subscale.items.length === 0) continue;
      const responseScale = {
        scaleType: subscale.scaleType,
        minValue: subscale.minValue ?? undefined,
        maxValue: subscale.maxValue ?? undefined,
        labelMap: subscale.labelMap,
        confirmed: subscale.confirmed === true,
      };
      const hasNumericRange = responseScale.scaleType === 'numeric'
        && Number.isFinite(responseScale.minValue)
        && Number.isFinite(responseScale.maxValue)
        && responseScale.minValue! <= responseScale.maxValue!;
      if (!hasNumericRange && responseScale.labelMap.length === 0) continue;
      configs.push({
        id: subscale.id,
        name: subscale.name,
        items: subscale.items,
        scoringMethod: subscale.scoringMethod,
        responseScale,
      });
      for (const item of subscale.items) {
        analysedColumns.push(item.column);
        const range = configuredRange(subscale);
        if (item.reverse && range) reverseRangesByColumn[item.column] = range;
      }
    }
    if (configs.length === 0) return null;

    const normalizedMatrix = normalizeResponseMatrix(
      dataset.rows as Record<string, unknown>[],
      configs,
      [],
    );
    const scaleForMidpoint = subscaleStates.find((subscale) => configuredRange(subscale) !== null) ?? null;
    const midpointRange = scaleForMidpoint ? configuredRange(scaleForMidpoint)! : null;
    const responseOptionCount = scaleForMidpoint
      ? scaleForMidpoint.labelMap.length || (midpointRange ? midpointRange.max - midpointRange.min + 1 : null)
      : null;
    return {
      normalizedMatrix,
      reverseRangesByColumn,
      responseOptionCount,
      analysedColumns: [...new Set(analysedColumns)],
    };
  }, [dataset, subscaleStates]);

  // ── Compute quality result ──
  const analysedItemColumns = qualityNormalization?.analysedColumns ?? itemColumns;

  const qualityResult = useMemo(() => {
    if (!dataset || analysedItemColumns.length === 0) return null;
    const rows = dataset.rows as Record<string, unknown>[];
    return computeDataQuality(
      rows,
      dataset.headers,
      analysedItemColumns,
      Array.from(excludedRows),
      scaleMin,
      scaleMax,
      DEFAULT_ALLOWED_NON_RESPONSE,
      thresholds,
      {
        rowIds: dataset.row_ids,
        normalizedMatrix: qualityNormalization?.normalizedMatrix,
        reverseRangesByColumn: qualityNormalization?.reverseRangesByColumn,
        responseOptionCount: qualityNormalization?.responseOptionCount ?? undefined,
      },
    );
  }, [dataset, analysedItemColumns, excludedRows, scaleMin, scaleMax, thresholds, qualityNormalization]);

  const totalRows = dataset?.rows.length ?? 0;
  const includedCount = totalRows - excludedRows.size;
  const excludedCount = excludedRows.size;

  // ── Handlers ──
  const handleBulkExclude = async (category: FlagCategory) => {
    if (!qualityResult) return;
    const indices = qualityResult.flags
      .filter((f) => f.categories.has(category) && !excludedRows.has(f.rowIndex))
      .map((f) => f.rowIndex);
    if (indices.length === 0) return;
    try {
      await onBulkExclude(indices);
      setStorageError(null);
    } catch (error) {
      setStorageError(`Failed to save row exclusions: ${(error as Error).message}`);
    }
  };

  // Exclude all flagged rows, or include all if every row is already excluded
  const handleExcludeAllToggle = async () => {
    if (!qualityResult) return;
    const flaggedIndices = qualityResult.flags.map((f) => f.rowIndex);
    const allFlaggedExcluded = flaggedIndices.length > 0 && flaggedIndices.every((idx) => excludedRows.has(idx));
    try {
      if (allFlaggedExcluded) {
        // Un-exclude all flagged rows
        const next = new Set(excludedRows);
        for (const idx of flaggedIndices) next.delete(idx);
        await onSetExcludedRows(next);
      } else {
        // Exclude all flagged rows that aren't already excluded
        await onBulkExclude(flaggedIndices.filter((idx) => !excludedRows.has(idx)));
      }
      setStorageError(null);
    } catch (error) {
      setStorageError(`Failed to save row exclusions: ${(error as Error).message}`);
    }
  };

  const toggleRow = async (rowIndex: number) => {
    try {
      await onToggleRow(rowIndex);
      setStorageError(null);
    } catch (error) {
      setStorageError(`Failed to save row exclusion: ${(error as Error).message}`);
    }
  };

  const resetThresholds = () => {
    setThresholds(DEFAULT_THRESHOLDS);
  };


  // ── Empty / loading states ──
  if (datasets.length === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-secondary-50">
        <div className="text-center">
          {storageError && <p role="alert" className="mb-3 text-sm text-error-700">{storageError}</p>}
          <div className="w-16 h-16 rounded-2xl bg-secondary-100 flex items-center justify-center mx-auto mb-4">
            <ShieldCheck className="w-8 h-8 text-secondary-400" />
          </div>
          <h3 className="text-lg font-semibold text-secondary-900 mb-1">No data yet</h3>
          <p className="text-sm text-secondary-500 max-w-md">Import a dataset on the Configure screen first, then return here to review data quality.</p>
        </div>
      </div>
    );
  }

  if (!dataset) {
    return (
      <div className="h-full flex items-center justify-center bg-secondary-50">
        <div className="text-sm text-secondary-500" role={storageError ? 'alert' : undefined}>
          {storageError ?? 'Loading data quality analysis...'}
        </div>
      </div>
    );
  }

  if (itemColumns.length === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-secondary-50">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-2xl bg-secondary-100 flex items-center justify-center mx-auto mb-4">
            <BarChart3 className="w-8 h-8 text-secondary-400" />
          </div>
          <h3 className="text-lg font-semibold text-secondary-900 mb-1">No item columns available</h3>
          <p className="text-sm text-secondary-500">All columns in this dataset are marked as demographics. Data quality analysis requires at least one item column. Adjust column assignments on the Configure screen.</p>
        </div>
      </div>
    );
  }

  if (!qualityResult) {
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
        {storageError && (
          <div role="alert" className="mx-6 mt-4 px-4 py-2 bg-error-50 text-sm text-error-700 rounded-lg">
            {storageError}
          </div>
        )}
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
          {/* ── All-excluded banner ── */}
          {includedCount === 0 && totalRows > 0 && (
            <div className="flex items-center gap-3 px-4 py-3 bg-error-50 rounded-lg">
              <AlertCircle className="w-5 h-5 text-error-600 flex-shrink-0" />
              <p className="text-sm text-error-700">All rows are currently excluded. Data quality metrics below reflect zero included cases. Adjust exclusions to see meaningful results.</p>
            </div>
          )}


          {/* ── Plain-language summary ── */}
          {(() => {
            const items = qualityResult.itemMissingness;
            const totals = items.reduce((acc, item) => ({
              outOfRange: acc.outOfRange + item.outOfRangeCount,
              noNumber: acc.noNumber + item.noNumberCount,
              blank: acc.blank + item.blankCount,
            }), { outOfRange: 0, noNumber: 0, blank: 0 });
            const attention = qualityResult.missingness.respondentsAboveThreshold > 0
              || totals.outOfRange > 0 || totals.noNumber > 0 || totals.blank > 0;
            return (
              <div className={`rounded-lg border px-4 py-3 ${attention ? 'border-warning-200 bg-warning-50' : 'border-success-200 bg-success-50'}`}>
                <p className={`text-sm ${attention ? 'text-warning-900' : 'text-success-800'}`}>
                  {includedCount} respondent{includedCount === 1 ? '' : 's'} · {analysedItemColumns.length} item{analysedItemColumns.length === 1 ? '' : 's'} analysed.
                  {qualityResult.missingness.respondentsAboveThreshold > 0 && <> {qualityResult.missingness.respondentsAboveThreshold} above the missingness threshold.</>}
                  {totals.outOfRange > 0 && <> {totals.outOfRange} answer{totals.outOfRange === 1 ? '' : 's'} outside range.</>}
                  {totals.noNumber > 0 && <> {totals.noNumber} answer{totals.noNumber === 1 ? '' : 's'} need a number or a decision.</>}
                  {totals.blank > 0 && <> {totals.blank} blank cell{totals.blank === 1 ? '' : 's'}.</>}
                  {!attention && <> No data-quality issues need attention.</>}
                </p>
                <div className="flex flex-wrap gap-2 mt-2">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-white/80 text-secondary-700 border border-secondary-200">{includedCount} respondents</span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-white/80 text-secondary-700 border border-secondary-200">{analysedItemColumns.length} items</span>
                  {qualityResult.missingness.respondentsAboveThreshold > 0 && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-warning-100 text-warning-800 border border-warning-200">{qualityResult.missingness.respondentsAboveThreshold} high missingness</span>
                  )}
                  {totals.outOfRange > 0 && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-warning-100 text-warning-800 border border-warning-200">{totals.outOfRange} outside range</span>
                  )}
                  {totals.noNumber > 0 && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-warning-100 text-warning-800 border border-warning-200">{totals.noNumber} need a number</span>
                  )}
                  {totals.blank > 0 && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-warning-100 text-warning-800 border border-warning-200">{totals.blank} blank</span>
                  )}
                </div>
                {subscaleStates.length === 0 && (
                  <p className="text-xs text-secondary-600 mt-2">Set up your scales first: go to Response scales.</p>
                )}
              </div>
            );
          })()}

          {/* ── Advanced thresholds ── */}
          <Card className="overflow-hidden">
            <button type="button" onClick={() => setShowSettings(!showSettings)}
              className="w-full flex items-center justify-between px-5 py-3 hover:bg-secondary-50 transition-colors">
              <div className="flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-secondary-500" />
                <span className="text-sm font-semibold text-secondary-700">Advanced</span>
              </div>
              {showSettings ? <ChevronDown className="w-4 h-4 text-secondary-400" /> : <ChevronRight className="w-4 h-4 text-secondary-400" />}
            </button>
            {showSettings && (
              <div className="px-5 pb-5 border-t border-secondary-100 space-y-4 pt-4">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-secondary-500 uppercase tracking-wide">Detection thresholds</div>
                  <button type="button" onClick={resetThresholds} className="text-xs text-primary-600 hover:underline flex items-center gap-1">
                    <RotateCcw className="w-3 h-3" /> Reset
                  </button>
                </div>
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
                {(() => {
                  const flaggedIndices = qualityResult.flags.map((f) => f.rowIndex);
                  const allFlaggedExcluded = flaggedIndices.length > 0 && flaggedIndices.every((idx) => excludedRows.has(idx));
                  return (
                    <Button variant={allFlaggedExcluded ? 'secondary' : 'outline'} size="sm" onClick={handleExcludeAllToggle} disabled={qualityResult.flags.length === 0}>
                      {allFlaggedExcluded ? 'Include all flagged' : 'Exclude all flagged'}
                    </Button>
                  );
                })()}
                <div className="w-px h-5 bg-secondary-200" />
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
                          <button onClick={() => toggleRow(flag.rowIndex)}
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

          {/* ── Item answer counts ── */}
          {qualityResult.itemMissingness.length > 0 && (
            <Card className="p-5">
              <h2 className="text-sm font-semibold text-secondary-900 mb-3">Item answer counts</h2>
              <div className="overflow-auto max-h-[320px]">
                <table className="w-full text-xs border-collapse">
                  <thead className="sticky top-0 bg-secondary-50">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-medium text-secondary-500 border-b border-secondary-200">Item</th>
                      <th className="px-2 py-1.5 text-right font-medium text-secondary-500 border-b border-secondary-200">Valid</th>
                      <th className="px-2 py-1.5 text-right font-medium text-secondary-500 border-b border-secondary-200">Not scored</th>
                      <th className="px-2 py-1.5 text-right font-medium text-secondary-500 border-b border-secondary-200">Scored special</th>
                      <th className="px-2 py-1.5 text-right font-medium text-secondary-500 border-b border-secondary-200">Outside range</th>
                      <th className="px-2 py-1.5 text-right font-medium text-secondary-500 border-b border-secondary-200">No number</th>
                      <th className="px-2 py-1.5 text-right font-medium text-secondary-500 border-b border-secondary-200">Blank</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-secondary-100">
                    {(() => {
                      const items = qualityResult.itemMissingness;
                      const visible = showAllItems ? items : items.slice(0, 100);
                      const totals = items.reduce((acc, item) => ({
                        valid: acc.valid + item.validCount,
                        notScored: acc.notScored + item.notScoredCount,
                        specialScored: acc.specialScored + item.specialScoredCount,
                        outOfRange: acc.outOfRange + item.outOfRangeCount,
                        noNumber: acc.noNumber + item.noNumberCount,
                        blank: acc.blank + item.blankCount,
                      }), { valid: 0, notScored: 0, specialScored: 0, outOfRange: 0, noNumber: 0, blank: 0 });
                      return (
                        <>
                          <tr className="bg-secondary-50 font-medium text-secondary-800">
                            <td className="px-2 py-1.5">Totals</td>
                            <td className="px-2 py-1.5 text-right">{totals.valid}</td>
                            <td className="px-2 py-1.5 text-right">{totals.notScored}</td>
                            <td className="px-2 py-1.5 text-right">{totals.specialScored}</td>
                            <td className="px-2 py-1.5 text-right">{totals.outOfRange}</td>
                            <td className="px-2 py-1.5 text-right">{totals.noNumber}</td>
                            <td className="px-2 py-1.5 text-right">{totals.blank}</td>
                          </tr>
                          {visible.map((item) => (
                            <tr key={item.column}>
                              <td className="px-2 py-1.5 text-secondary-700 font-mono">{item.column}</td>
                              <td className="px-2 py-1.5 text-right">{item.validCount}</td>
                              <td className="px-2 py-1.5 text-right">{item.notScoredCount}</td>
                              <td className="px-2 py-1.5 text-right">{item.specialScoredCount}</td>
                              <td className="px-2 py-1.5 text-right">{item.outOfRangeCount}</td>
                              <td className="px-2 py-1.5 text-right">{item.noNumberCount}</td>
                              <td className="px-2 py-1.5 text-right">{item.blankCount}</td>
                            </tr>
                          ))}
                        </>
                      );
                    })()}
                  </tbody>
                </table>
              </div>
              {qualityResult.itemMissingness.length > 100 && (
                <button type="button" className="mt-2 text-xs text-primary-600 hover:underline" onClick={() => setShowAllItems((v) => !v)}>
                  {showAllItems ? 'Show first 100 items' : `Show all ${qualityResult.itemMissingness.length} items`}
                </button>
              )}
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
