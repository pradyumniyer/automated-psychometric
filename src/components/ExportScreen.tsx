// Export screen — download cleaned raw data, items only, scored data, or scores + demographics.
// Exclusions are respected from shared state. Scoring is optional.
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FileDown, FileSpreadsheet, Table, FileText, BarChart3, Users,
  Check, AlertCircle, Info, Loader2, Download,
} from 'lucide-react';
import {
  supabase, Project, Dataset, DemographicColumn, SubscaleGroup, ResponseScale, SubscaleItem,
} from '@/lib/supabase';
import { exportToCSV, exportToXLSX } from '@/lib/fileParser';
import { scoreDataset, SubscaleConfig, BandConfig } from '@/scientific/scoring';
import { Button, Card } from './ui';

interface Props {
  project: Project;
  excludedRows: Set<number>;
  sharedDatasetId: string | null;
  onDatasetChange: (id: string | null) => void;
}

type ExportType = 'cleaned_raw' | 'items_only' | 'scored' | 'scores_demo';

export function ExportScreen({ project, excludedRows, sharedDatasetId, onDatasetChange }: Props) {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [demoCols, setDemoCols] = useState<DemographicColumn[]>([]);
  const [subscaleGroups, setSubscaleGroups] = useState<SubscaleGroup[]>([]);
  const [responseScales, setResponseScales] = useState<ResponseScale[]>([]);
  const [savedScoringResult, setSavedScoringResult] = useState<{ headers: string[]; rows: Record<string, unknown>[]; excluded_rows: number[] } | null>(null);
  const [keepExcluded, setKeepExcluded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);

  // ── Load datasets ──
  const loadDatasets = useCallback(async () => {
    const { data } = await supabase.from('datasets').select('*').eq('project_id', project.id).order('created_at', { ascending: true });
    const dsList = (data || []) as Dataset[];
    setDatasets(dsList);
    if (dsList.length > 0 && !sharedDatasetId) onDatasetChange(dsList[0].id);
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

    (async () => {
      const [{ data: demoData }, { data: subData }, { data: scoreData }] = await Promise.all([
        supabase.from('demographic_columns').select('*').eq('dataset_id', activeDatasetId),
        supabase.from('subscale_groups').select('*').eq('dataset_id', activeDatasetId).order('display_order'),
        supabase.from('scoring_results').select('*').eq('dataset_id', activeDatasetId).order('version', { ascending: false }).limit(1).maybeSingle(),
      ]);

      setDemoCols((demoData || []) as DemographicColumn[]);
      const subs = (subData || []) as SubscaleGroup[];
      setSubscaleGroups(subs);

      // Load response scales for each subscale
      const scales: ResponseScale[] = [];
      for (const sub of subs) {
        const { data: scaleData } = await supabase.from('response_scales').select('*').eq('subscale_id', sub.id).maybeSingle();
        if (scaleData) scales.push(scaleData as ResponseScale);
      }
      setResponseScales(scales);

      if (scoreData) {
        setSavedScoringResult({
          headers: (scoreData as { headers: string[] }).headers,
          rows: (scoreData as { rows: Record<string, unknown>[] }).rows,
          excluded_rows: (scoreData as { excluded_rows: number[] }).excluded_rows || [],
        });
      } else {
        setSavedScoringResult(null);
      }
      setLoading(false);
    })();
  }, [activeDatasetId, datasets]);

  // ── Derived state ──
  const demoColumnNames = useMemo(() => new Set(demoCols.map((d) => d.column_name)), [demoCols]);
  const itemColumns = useMemo(() => (dataset?.headers || []).filter((c) => !demoColumnNames.has(c)), [dataset, demoColumnNames]);

  const hasSubscaleConfig = subscaleGroups.length > 0 && subscaleGroups.some((s) => s.items && s.items.length > 0);
  const scoringAvailable = !!savedScoringResult || hasSubscaleConfig;

  const totalRows = dataset?.rows.length ?? 0;
  const excludedCount = excludedRows.size;
  const includedCount = totalRows - excludedCount;

  // ── Build subscale configs for recomputation ──
  const subConfigs = useMemo<SubscaleConfig[]>(() => {
    return subscaleGroups.map((sub) => {
      const scale = responseScales.find((s) => s.subscale_id === sub.id);
      return {
        id: sub.id,
        name: sub.name,
        items: (sub.items || []).map((item: SubscaleItem) => ({ column: item.column, order: item.order, reverse: item.reverse })),
        scoringMethod: sub.scoring_method,
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

  // ── Band configs (loaded from DB as needed) ──
  const [bandConfigs, setBandConfigs] = useState<Record<string, BandConfig[]>>({});

  useEffect(() => {
    if (subscaleGroups.length === 0) { setBandConfigs({}); return; }
    (async () => {
      const bands: Record<string, BandConfig[]> = {};
      for (const sub of subscaleGroups) {
        const { data: bandData } = await supabase.from('interpretation_bands').select('*').eq('subscale_id', sub.id).order('display_order');
        if (bandData) bands[sub.name] = (bandData as { name: string; min_score: number; max_score: number; color: string }[]).map((b) => ({
          name: b.name, minScore: b.min_score, maxScore: b.max_score, color: b.color,
        }));
      }
      setBandConfigs(bands);
    })();
  }, [subscaleGroups]);

  // ── Compute scored result (use saved or recompute) ──
  const scoredResult = useMemo(() => {
    if (!dataset) return null;
    if (savedScoringResult) {
      return {
        headers: savedScoringResult.headers,
        rows: savedScoringResult.rows as Record<string, number | string | null>[],
      };
    }
    if (hasSubscaleConfig && subConfigs.length > 0) {
      try {
        const result = scoreDataset(
          dataset.rows as Record<string, unknown>[],
          dataset.headers,
          subConfigs,
          bandConfigs,
          Array.from(excludedRows),
        );
        return { headers: result.headers, rows: result.rows };
      } catch {
        return null;
      }
    }
    return null;
  }, [dataset, savedScoringResult, hasSubscaleConfig, subConfigs, bandConfigs, excludedRows]);

  // ── Exclusion filtering ──
  function applyExclusions<T extends Record<string, unknown>>(rows: T[], includeExcludedColumn: boolean): T[] {
    if (keepExcluded) {
      return rows.map((row, i) => ({ ...row, excluded: excludedRows.has(i) })) as T[];
    }
    return rows.filter((_, i) => !excludedRows.has(i));
  }

  // ── Filename helper ──
  const fileName = (type: ExportType, ext: 'csv' | 'xlsx'): string => {
    const proj = project.name.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
    return `${proj}_${type}.${ext}`;
  };

  // ── Export handlers ──
  const doExport = (type: ExportType, fmt: 'csv' | 'xlsx') => {
    if (!dataset) return;
    const key = `${type}_${fmt}`;
    setExporting(key);
    try {
      let headers: string[];
      let rows: Record<string, unknown>[];

      if (type === 'cleaned_raw') {
        headers = keepExcluded ? [...dataset.headers, 'excluded'] : dataset.headers;
        rows = applyExclusions(dataset.rows as Record<string, unknown>[], keepExcluded);
      } else if (type === 'items_only') {
        headers = keepExcluded ? [...itemColumns, 'excluded'] : itemColumns;
        const itemRows = (dataset.rows as Record<string, unknown>[]).map((row) => {
          const out: Record<string, unknown> = {};
          for (const col of itemColumns) out[col] = row[col];
          return out;
        });
        rows = applyExclusions(itemRows, keepExcluded);
      } else if (type === 'scored') {
        if (!scoredResult) throw new Error('Scoring not available');
        headers = keepExcluded ? [...scoredResult.headers, 'excluded'] : scoredResult.headers;
        rows = applyExclusions(scoredResult.rows as Record<string, unknown>[], keepExcluded);
      } else if (type === 'scores_demo') {
        if (!scoredResult) throw new Error('Scoring not available');
        // Keep demo columns + score/interpretation columns only
        const demoList = dataset.headers.filter((h) => demoColumnNames.has(h));
        const scoreCols = scoredResult.headers.filter((h) => !dataset.headers.includes(h));
        headers = keepExcluded ? [...demoList, ...scoreCols, 'excluded'] : [...demoList, ...scoreCols];
        const filteredRows = (scoredResult.rows as Record<string, unknown>[]).map((row) => {
          const out: Record<string, unknown> = {};
          for (const col of headers) { if (col !== 'excluded') out[col] = row[col]; }
          return out;
        });
        rows = applyExclusions(filteredRows, keepExcluded);
      } else {
        return;
      }

      const fn = fileName(type, fmt);
      if (fmt === 'csv') exportToCSV(headers, rows, fn);
      else exportToXLSX(headers, rows, fn);
    } catch (e) {
      // surfaced by disabling state; ignore
    }
    setExporting(null);
  };

  // ── Empty / loading states ──
  if (datasets.length === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-secondary-50">
        <div className="text-center">
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
        </div>

        <div className="p-6 space-y-6">
          {/* ── Exclusion mode toggle ── */}
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-secondary-900">Exclusion handling</h3>
                <p className="text-xs text-secondary-500 mt-0.5">
                  {keepExcluded
                    ? 'All rows are kept. An "excluded" column (true/false) is appended to indicate excluded rows.'
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
            {/* A) Cleaned Raw */}
            <ExportCard
              icon={<FileSpreadsheet className="w-5 h-5" />}
              title="Cleaned Raw Data"
              description="All original columns with excluded rows removed. Use this as a general-purpose cleaned dataset for any downstream analysis."
              badge="Always available"
              badgeColor="success"
              onExportCSV={() => doExport('cleaned_raw', 'csv')}
              onExportXLSX={() => doExport('cleaned_raw', 'xlsx')}
              exporting={exporting}
              exportKey="cleaned_raw"
              fileName={fileName('cleaned_raw', 'csv')}
            />

            {/* B) Items Only */}
            <ExportCard
              icon={<Table className="w-5 h-5" />}
              title="Items Only"
              description="Questionnaire item columns only — demographics removed. Ideal for item analysis, factor analysis, or IRT workflows in jamovi, SPSS, or R."
              badge="No scoring needed"
              badgeColor="success"
              onExportCSV={() => doExport('items_only', 'csv')}
              onExportXLSX={() => doExport('items_only', 'xlsx')}
              exporting={exporting}
              exportKey="items_only"
              fileName={fileName('items_only', 'csv')}
            />

            {/* C) Scored Data */}
            <ExportCard
              icon={<BarChart3 className="w-5 h-5" />}
              title="Scored Data"
              description="Original columns plus subscale scores and interpretation labels. Use this when you need the full scored dataset for report-ready analysis."
              badge={scoringAvailable ? 'Ready' : 'Scoring required'}
              badgeColor={scoringAvailable ? 'success' : 'neutral'}
              disabled={!scoringAvailable}
              disabledReason={!scoringAvailable ? (hasSubscaleConfig ? 'Run scoring on the Configure screen to generate scored data.' : 'Configure subscales with items on the Configure screen first.') : undefined}
              onExportCSV={() => doExport('scored', 'csv')}
              onExportXLSX={() => doExport('scored', 'xlsx')}
              exporting={exporting}
              exportKey="scored"
              fileName={fileName('scored', 'csv')}
            />

            {/* D) Scores + Demographics */}
            <ExportCard
              icon={<Users className="w-5 h-5" />}
              title="Scores + Demographics"
              description="Demographic columns plus score and interpretation columns only — item columns removed. Clean, compact file for group comparisons and demographic reporting."
              badge={scoringAvailable ? 'Ready' : 'Scoring required'}
              badgeColor={scoringAvailable ? 'success' : 'neutral'}
              disabled={!scoringAvailable}
              disabledReason={!scoringAvailable ? (hasSubscaleConfig ? 'Run scoring on the Configure screen to generate scored data.' : 'Configure subscales with items on the Configure screen first.') : undefined}
              onExportCSV={() => doExport('scores_demo', 'csv')}
              onExportXLSX={() => doExport('scores_demo', 'xlsx')}
              exporting={exporting}
              exportKey="scores_demo"
              fileName={fileName('scores_demo', 'csv')}
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
