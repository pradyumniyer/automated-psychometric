// Export screen — download cleaned raw data, items only, scored data, or scores + demographics.
// Exclusions are respected from shared state. Scoring is optional.
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FileDown, FileSpreadsheet, Table, FileText, BarChart3, Users, Hash,
  Check, AlertCircle, Info, Loader2, Download,
} from 'lucide-react';
import type { Project, Dataset, DemographicColumn, ScoreOutput, SubscaleGroup, ResponseScale, SubscaleItem } from '@/types/domain';
import { datasetRepository, scoreRepository, surveyConfigRepository } from '@/storage/repositories';
import { buildSubscaleConfigs, createScoreHashes } from '@/storage/scoreHashes';
import { ensureAutomaticSubscale } from '@/storage/viewAdapters';
import { exportToCSV, exportToXLSX } from '@/lib/fileParser';
import { scoreDataset, SubscaleConfig, BandConfig } from '@/scientific/scoring';
import { buildScoredColumnData, scoreOnlyColumnKeys, type ScoredColumn } from '@/lib/scoredColumns';
import { buildSummaryExportContent } from '@/lib/summaryStatistics';
import { shownScoreOutputs } from '@/lib/scoreOutputs';
import type { SurveyConfigRecord } from '@/storage/schema';
import { Button, Card } from './ui';

interface Props {
  project: Project;
  excludedRows: Set<number>;
  sharedDatasetId: string | null;
  onDatasetChange: (id: string | null) => void;
  showSummarySum: boolean;
  showSummaryMean: boolean;
}

type ExportType = 'cleaned_raw' | 'items_only' | 'scored' | 'scores_demo' | 'scores_only';

export function ExportScreen({
  project,
  excludedRows,
  sharedDatasetId,
  onDatasetChange,
  showSummarySum,
  showSummaryMean,
}: Props) {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [demoCols, setDemoCols] = useState<DemographicColumn[]>([]);
  const [idColumns, setIdColumns] = useState<string[]>([]);
  const [subscaleGroups, setSubscaleGroups] = useState<SubscaleGroup[]>([]);
  const [responseScales, setResponseScales] = useState<ResponseScale[]>([]);
  const [overallSettings, setOverallSettings] = useState<NonNullable<SurveyConfigRecord['overall_settings']> | null>(null);
  const [savedScoringResult, setSavedScoringResult] = useState<ReturnType<typeof scoreDataset> | null>(null);
  const [scoreCacheStale, setScoreCacheStale] = useState(false);
  const [keepExcluded, setKeepExcluded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);

  // ── Load datasets ──
  const loadDatasets = useCallback(async () => {
    try {
      const dsList = await datasetRepository.list(project.id);
      setDatasets(dsList);
      if (dsList.length > 0 && !sharedDatasetId) onDatasetChange(dsList[0].id);
      setStorageError(null);
    } catch (error) {
      setStorageError(`Failed to load datasets: ${(error as Error).message}`);
    }
  }, [project.id, sharedDatasetId, onDatasetChange]);

  useEffect(() => { loadDatasets(); }, [loadDatasets]);

  // ── Load config for active dataset ──
  const activeDatasetId = sharedDatasetId;

  useEffect(() => {
    if (!activeDatasetId) { setDataset(null); setLoading(false); return; }
    const ds = datasets.find((d) => d.id === activeDatasetId);
    if (!ds) { setDataset(null); setLoading(false); return; }
    setDataset(ds);
    setLoading(true);

    let cancelled = false;
    (async () => {
      try {
        const savedConfig = await surveyConfigRepository.get(activeDatasetId);
        if (!savedConfig) throw new Error('Dataset configuration is missing.');
        const config = ensureAutomaticSubscale(savedConfig, ds);
        const latest = await scoreRepository.getLatest(activeDatasetId);
        const excludedRowIds = [...excludedRows].map((index) => {
          const rowId = ds.row_ids[index];
          if (!rowId) throw new Error(`Excluded row ${index + 1} has no stable ID.`);
          return rowId;
        });
        const hashes = await createScoreHashes(ds, config, buildSubscaleConfigs(config, ds), excludedRowIds);
        const current = await scoreRepository.getCurrent(activeDatasetId, hashes);
        const result = current?.payload.result as ReturnType<typeof scoreDataset> | undefined;
        const resultIsValid = !!result && Array.isArray(result.headers) && Array.isArray(result.rows);

        if (cancelled) return;
        setDemoCols(config.demographic_columns);
        setIdColumns([...new Set([
          ...config.id_columns,
          ...config.demographic_columns
            .filter((column) => /\bID\b/i.test(column.detected_by))
            .map((column) => column.column_name),
        ])]);
        setSubscaleGroups(config.subscales);
        setResponseScales(config.subscales.flatMap((subscale) => subscale.response_scale ? [subscale.response_scale] : []));
        const bands: Record<string, Partial<Record<ScoreOutput, BandConfig[]>>> = {};
        for (const subscale of config.subscales) {
          if (subscale.bands?.length) {
            const firstOutput = shownScoreOutputs(subscale.score_outputs, subscale.scoring_method)[0];
            for (const band of subscale.bands) {
              const output = band.score_output ?? firstOutput;
              bands[subscale.id] ??= {};
              bands[subscale.id][output] ??= [];
              bands[subscale.id][output]!.push({
                name: band.name,
                minScore: band.min_score,
                maxScore: band.max_score,
                color: band.color,
              });
            }
          }
        }
        if (config.overall_scale?.bands?.length) {
          const output = config.overall_settings?.combine_by === 'custom'
            ? 'custom'
            : config.overall_settings?.combine_by ?? 'sum';
          bands.overall ??= {};
          bands.overall[output] = config.overall_scale.bands.map((band) => ({
            name: band.name,
            minScore: band.min_score,
            maxScore: band.max_score,
            color: band.color,
          }));
        }
        setOverallSettings(config.overall_settings ?? null);
        setBandConfigs(bands);
        setSavedScoringResult(resultIsValid ? result : null);
        setScoreCacheStale(!!latest && (!current || !resultIsValid));
        setStorageError(null);
      } catch (error) {
        if (!cancelled) {
          setSavedScoringResult(null);
          setScoreCacheStale(false);
          setStorageError(`Failed to load dataset configuration: ${(error as Error).message}`);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [activeDatasetId, datasets, excludedRows]);

  // ── Derived state ──
  const demoColumnNames = useMemo(() => new Set(demoCols.map((d) => d.column_name)), [demoCols]);
  const itemColumns = useMemo(() => (dataset?.headers || []).filter((c) => !demoColumnNames.has(c)), [dataset, demoColumnNames]);

  const hasSubscaleConfig = subscaleGroups.length > 0 && subscaleGroups.some((s) => s.items && s.items.length > 0);

  const totalRows = dataset?.rows.length ?? 0;
  const excludedCount = excludedRows.size;
  const includedCount = totalRows - excludedCount;

  const noIncludedRows = !keepExcluded && includedCount === 0 && totalRows > 0;
  const exclusionBlockedReason = noIncludedRows
    ? 'All rows are excluded. Switch to "Keep with flag" mode or adjust exclusions on the Data Quality screen.'
    : undefined;
  const subConfigs = useMemo<SubscaleConfig[]>(() => {
    return subscaleGroups.map((sub) => {
      const scale = responseScales.find((s) => s.subscale_id === sub.id);
      return {
        id: sub.id,
        name: sub.name,
        items: (sub.items || []).map((item: SubscaleItem) => ({ column: item.column, order: item.order, reverse: item.reverse })),
        scoringMethod: sub.scoring_method,
        showOutputs: sub.score_outputs,
        customFormula: sub.custom_formula,
        responseScale: {
          scaleType: scale?.scale_type || 'numeric',
          minValue: scale?.min_value ?? undefined,
          maxValue: scale?.max_value ?? undefined,
          labelMap: scale?.label_map,
        },
      };
    });
  }, [subscaleGroups, responseScales]);

  const [bandConfigs, setBandConfigs] = useState<Record<string, Partial<Record<ScoreOutput, BandConfig[]>>>>({});

  // ── Compute scored result (use saved or recompute) ──
  const scoringAvailable = !!savedScoringResult || (!scoreCacheStale && hasSubscaleConfig);
  const scoredResult = useMemo(() => {
    if (!dataset) return null;
    if (savedScoringResult) return savedScoringResult;
    if (scoreCacheStale) return null;
    if (hasSubscaleConfig && subConfigs.length > 0) {
      try {
        return scoreDataset(
          dataset.rows as Record<string, unknown>[],
          dataset.headers,
          subConfigs,
          {},
          Array.from(excludedRows),
          {
            bandsByOutput: bandConfigs,
            overall: overallSettings
              ? {
                  enabled: overallSettings.enabled,
                  basedOn: overallSettings.based_on,
                  combineBy: overallSettings.combine_by,
                  customFormula: overallSettings.custom_formula,
                }
              : undefined,
          },
        );
      } catch {
        return null;
      }
    }
    return null;
  }, [dataset, savedScoringResult, scoreCacheStale, hasSubscaleConfig, subConfigs, bandConfigs, overallSettings, excludedRows]);
  const scoredColumnData = useMemo(() => {
    if (!dataset || !scoredResult) return null;
    return buildScoredColumnData({
      result: scoredResult,
      rawHeaders: dataset.headers,
      rawRows: dataset.rows as Record<string, unknown>[],
      demographicColumns: demoCols.map((column) => column.column_name),
      idColumns,
      subscales: subConfigs,
    });
  }, [dataset, scoredResult, demoCols, idColumns, subConfigs]);

  // ── Filename helper ──
  const fileName = (type: ExportType, ext: 'csv' | 'xlsx'): string => {
    const proj = project.name.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
    return `${proj}_${type}.${ext}`;
  };

  // ── Export handlers ──
  const doExport = async (type: ExportType, fmt: 'csv' | 'xlsx') => {
    if (!dataset) return;
    const key = `${type}_${fmt}`;
    setExporting(key);
    try {
      let headers: string[];
      let rows: Record<string, unknown>[];
      let numericColumns: ReadonlySet<string>;

      if (type === 'cleaned_raw') {
        headers = dataset.headers;
        rows = dataset.rows as Record<string, unknown>[];
        numericColumns = new Set(headers.filter((header) => !idColumns.includes(header)));
      } else if (type === 'items_only') {
        headers = itemColumns;
        numericColumns = new Set(headers.filter((header) => !idColumns.includes(header)));
        rows = (dataset.rows as Record<string, unknown>[]).map((row) => {
          const out: Record<string, unknown> = {};
          for (const col of itemColumns) out[col] = row[col];
          return out;
        });
      } else if (type === 'scored') {
        if (!scoredColumnData) throw new Error('Scoring not available');
        headers = scoredColumnData.headers;
        rows = scoredColumnData.rows;
        numericColumns = scoredColumnData.numericColumns;
      } else if (type === 'scores_demo') {
        if (!scoredResult || !scoredColumnData) throw new Error('Scoring not available');
        const demoList = dataset.headers.filter((h) => demoColumnNames.has(h));
        const scoreCols = scoredResult.headers.filter((h) => !dataset.headers.includes(h));
        headers = [...demoList, ...scoreCols];
        numericColumns = new Set(headers.filter((header) => !idColumns.includes(header)));
        rows = scoredColumnData.rows.map((row) => {
          const out: Record<string, unknown> = {};
          for (const col of headers) out[col] = row[col];
          return out;
        });
      } else if (type === 'scores_only') {
        if (!scoredResult || !scoredColumnData) throw new Error('Scoring not available');
        const demoList = dataset.headers.filter((h) => demoColumnNames.has(h));
        const scoreCols = scoreOnlyColumnKeys(
          scoredColumnData.groups.flatMap((group) => group.columns),
        );
        headers = [...demoList, ...scoreCols];
        numericColumns = new Set(headers.filter((header) => !idColumns.includes(header)));
        rows = scoredColumnData.rows.map((row) => {
          const out: Record<string, unknown> = {};
          for (const col of headers) out[col] = row[col];
          return out;
        });
      } else {
        return;
      }

      const fn = fileName(type, fmt);
      const summaryHeaders = keepExcluded ? [...headers, 'Excluded'] : headers;
      const summaryRows = keepExcluded
        ? rows.map((row, index) => ({ ...row, Excluded: excludedRows.has(index) }))
        : rows;
      const knownColumns = new Map(
        (scoredColumnData?.groups.flatMap((group) => group.columns) ?? [])
          .map((column) => [column.key, column]),
      );
      const summaryColumns: ScoredColumn[] = summaryHeaders.map((header) => {
        const known = knownColumns.get(header);
        if (known) return known;
        const type = header.endsWith(' Interpretation')
          ? 'interpretation'
          : header === 'Excluded' || demoColumnNames.has(header)
            ? 'demo'
            : dataset.headers.includes(header)
              ? 'data'
              : 'score';
        return { key: header, label: header, group: 'Export', type };
      });
      const summary = buildSummaryExportContent(
        summaryHeaders,
        summaryColumns,
        summaryRows,
        excludedRows,
        new Set(idColumns),
        { sum: showSummarySum, mean: showSummaryMean },
        scoredResult?.normalizedMatrix.states,
      );
      const exportOptions = { excludedRows, keepExcluded, numericColumns, summary: summary ?? undefined };
      if (fmt === 'csv') exportToCSV(headers, rows, fn, exportOptions);
      else await exportToXLSX(headers, rows, fn, exportOptions);
    } catch (error) {
      setStorageError(`Failed to export dataset: ${(error as Error).message}`);
    } finally {
      setExporting(null);
    }
  };

  // ── Empty / loading states ──
  if (datasets.length === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-secondary-50">
        <div className="text-center">
          {storageError && <p role="alert" className="mb-3 text-sm text-error-700">{storageError}</p>}
          <div className="w-16 h-16 rounded-2xl bg-secondary-100 flex items-center justify-center mx-auto mb-4">
            <FileDown className="w-8 h-8 text-secondary-400" />
          </div>
          <h3 className="text-lg font-semibold text-secondary-900 mb-1">No data to export</h3>
          <p className="text-sm text-secondary-500 max-w-md">Import a dataset on the Configure screen first, then return here to export cleaned data.</p>
        </div>
      </div>
    );
  }

  if (loading || !dataset) {
    return (
      <div className="h-full flex items-center justify-center bg-secondary-50">
        <Loader2 className="w-6 h-6 text-secondary-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-secondary-50 overflow-hidden">
      {/* ── Dataset tabs ── */}
      <div className="flex items-center gap-1 px-5 py-1.5 bg-white border-b border-secondary-200 overflow-x-auto flex-shrink-0">
        {datasets.map((ds) => (
          <button key={ds.id} onClick={() => onDatasetChange(ds.id)}
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
        {/* ── Header + summary ── */}
        <div className="px-6 py-4 bg-white border-b border-secondary-200">
          <h1 className="text-xl font-bold text-secondary-900">Export</h1>
          <p className="text-sm text-secondary-500 mt-0.5 mb-4">
            Download your data in multiple formats. Exclusions from Data Quality and Configure are respected in every export.
          </p>
          <div className="grid grid-cols-4 gap-3">
            <SummaryStat icon={<FileSpreadsheet className="w-4 h-4" />} label="Source" value={dataset.sheet_name || dataset.file_name} />
            <SummaryStat icon={<Table className="w-4 h-4" />} label="Total rows" value={totalRows.toString()} />
            <SummaryStat icon={<Check className="w-4 h-4" />} label="Included" value={includedCount.toString()} accent="success" />
            <SummaryStat icon={<AlertCircle className="w-4 h-4" />} label="Excluded" value={excludedCount.toString()} accent="error" />
          </div>
          {(showSummarySum || showSummaryMean) && (
            <p role="status" className="text-xs text-primary-700 mt-3">
              Summary statistics are included in XLSX exports as a second “Summary” sheet and in CSV downloads as a second “&lt;name&gt;_summary.csv” file.
            </p>
          )}
        </div>

        <div className="p-6 space-y-6">
          {/* ── Exclusion mode toggle ── */}
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-secondary-900">Exclusion handling</h3>
                <p className="text-xs text-secondary-500 mt-0.5">
                  {keepExcluded
                    ? 'All rows are kept with complete data (scores + interpretations as applicable). Excluded rows are not filtered out.'
                    : 'Excluded rows are dropped from the exported file. This is the default.'}
                </p>
              </div>
              <div className="flex items-center gap-1 bg-secondary-100 rounded-lg p-0.5">
                <button onClick={() => setKeepExcluded(false)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${!keepExcluded ? 'bg-white text-primary-700 shadow-sm' : 'text-secondary-500 hover:text-secondary-700'}`}>
                  Drop excluded
                </button>
                <button onClick={() => setKeepExcluded(true)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${keepExcluded ? 'bg-white text-primary-700 shadow-sm' : 'text-secondary-500 hover:text-secondary-700'}`}>
                  Keep with flag
                </button>
              </div>
            </div>
          </Card>

          {/* ── Export type cards ── */}
          <div className="grid grid-cols-2 gap-4">
            {/* A) Scored Data */}
            <ExportCard
              icon={<BarChart3 className="w-5 h-5" />}
              title="Scored Data"
              description="Original columns plus scale scores and interpretation labels. Use this when you need the full scored dataset for report-ready analysis."
              badge={scoringAvailable ? 'Ready' : 'Scoring required'}
              badgeColor={scoringAvailable ? 'success' : 'neutral'}
              disabled={!scoringAvailable || noIncludedRows}
              disabledReason={!scoringAvailable ? (scoreCacheStale || hasSubscaleConfig ? 'Run scoring on the Configure screen to generate scored data.' : 'Configure scales with items on the Configure screen first.') : exclusionBlockedReason}
              onExportCSV={() => doExport('scored', 'csv')}
              onExportXLSX={() => doExport('scored', 'xlsx')}
              exporting={exporting}
              exportKey="scored"
              fileName={fileName('scored', 'csv')}
            />

            {/* B) Scores + Demographics */}
            <ExportCard
              icon={<Users className="w-5 h-5" />}
              title="Scores + Demographics"
              description="Demographic columns plus scale scores and interpretation columns only — item columns removed. Clean, compact file for group comparisons and demographic reporting."
              badge={scoringAvailable ? 'Ready' : 'Scoring required'}
              badgeColor={scoringAvailable ? 'success' : 'neutral'}
              disabled={!scoringAvailable || noIncludedRows}
              disabledReason={!scoringAvailable ? (scoreCacheStale || hasSubscaleConfig ? 'Run scoring on the Configure screen to generate scored data.' : 'Configure scales with items on the Configure screen first.') : exclusionBlockedReason}
              onExportCSV={() => doExport('scores_demo', 'csv')}
              onExportXLSX={() => doExport('scores_demo', 'xlsx')}
              exporting={exporting}
              exportKey="scores_demo"
              fileName={fileName('scores_demo', 'csv')}
            />

            {/* C) Scores Only */}
            <ExportCard
              icon={<Hash className="w-5 h-5" />}
              title="Scores only"
              description="Scale scores without interpretation labels. Includes ID/demographic columns and all subscale + overall scores — no band or label columns. Use when you only need numeric scores for further analysis in jamovi, SPSS, or R."
              badge={scoringAvailable ? 'Ready' : 'Scoring required'}
              badgeColor={scoringAvailable ? 'success' : 'neutral'}
              disabled={!scoringAvailable || noIncludedRows}
              disabledReason={!scoringAvailable ? (scoreCacheStale || hasSubscaleConfig ? 'Run scoring on the Configure screen to generate scored data.' : 'Configure scales with items on the Configure screen first.') : exclusionBlockedReason}
              onExportCSV={() => doExport('scores_only', 'csv')}
              onExportXLSX={() => doExport('scores_only', 'xlsx')}
              exporting={exporting}
              exportKey="scores_only"
              fileName={fileName('scores_only', 'csv')}
            />
          </div>

          {/* ── Info note ── */}
          <div className="flex items-start gap-2 px-4 py-3 bg-info-50 rounded-lg">
            <Info className="w-4 h-4 text-info-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-info-700">
              Raw imported data is never modified. Exclusions are applied at export time based on the current exclusion state.
              {scoringAvailable && !savedScoringResult && ' Scores are computed on-the-fly from your current subscale configuration. Run scoring on the Configure screen to save a scoring version.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ──

function SummaryStat({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: 'success' | 'error' }) {
  const accentColors: Record<string, string> = {
    success: 'text-success-700 bg-success-50',
    error: 'text-error-700 bg-error-50',
  };
  return (
    <div className={`px-4 py-3 rounded-lg border border-secondary-200 ${accent ? accentColors[accent] : 'bg-white'}`}>
      <div className="flex items-center gap-1.5 text-secondary-500 mb-1">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className="text-sm font-bold text-secondary-900 truncate" title={value}>{value}</div>
    </div>
  );
}

function ExportCard({ icon, title, description, badge, badgeColor, disabled, disabledReason, onExportCSV, onExportXLSX, exporting, exportKey, fileName }: {
  icon: React.ReactNode;
  title: string;
  description: string;
  badge: string;
  badgeColor: 'success' | 'neutral';
  disabled?: boolean;
  disabledReason?: string;
  onExportCSV: () => void;
  onExportXLSX: () => void;
  exporting: string | null;
  exportKey: string;
  fileName: string;
}) {
  const badgeClasses: Record<string, string> = {
    success: 'bg-success-100 text-success-700 border-success-300',
    neutral: 'bg-secondary-100 text-secondary-500 border-secondary-300',
  };
  const csvKey = `${exportKey}_csv`;
  const xlsxKey = `${exportKey}_xlsx`;

  return (
    <Card className={`p-5 flex flex-col ${disabled ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${disabled ? 'bg-secondary-100 text-secondary-400' : 'bg-primary-100 text-primary-600'}`}>
            {icon}
          </div>
          <div>
            <h3 className="text-sm font-bold text-secondary-900">{title}</h3>
            <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full border ${badgeClasses[badgeColor]}`}>{badge}</span>
          </div>
        </div>
      </div>
      <p className="text-xs text-secondary-500 mb-4 flex-1 leading-relaxed">{description}</p>

      {disabled && disabledReason ? (
        <div className="flex items-center gap-2 px-3 py-2.5 bg-secondary-50 rounded-lg">
          <AlertCircle className="w-4 h-4 text-secondary-400 flex-shrink-0" />
          <span className="text-xs text-secondary-500">{disabledReason}</span>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onExportCSV} disabled={exporting === csvKey} className="flex-1">
            {exporting === csvKey ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            CSV
          </Button>
          <Button variant="outline" size="sm" onClick={onExportXLSX} disabled={exporting === xlsxKey} className="flex-1">
            {exporting === xlsxKey ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
            Excel
          </Button>
        </div>
      )}
      <div className="mt-2 text-xs text-secondary-400 font-mono truncate">{fileName}</div>
    </Card>
  );
}
