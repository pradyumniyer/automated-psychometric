import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { supabase, Project, CVDataset, CVConfig } from '@/lib/supabase';
import { Button, Card } from './ui';
import { exportToCSV, exportToXLSX } from '@/lib/fileParser';
import {
  FileDown, Loader2, AlertCircle, Download, FileText, Table as TableIcon, List,
} from 'lucide-react';
import {
  analyseLawshe, analyseAiken,
  type ContentValidityResult, type ItemResult,
} from '@/scientific/contentValidity';

interface Props {
  project: Project;
  sharedDatasetId: string | null;
  onDatasetChange: (id: string | null) => void;
}

export function CVExportScreen({ project, sharedDatasetId, onDatasetChange }: Props) {
  const [datasets, setDatasets] = useState<CVDataset[]>([]);
  const [config, setConfig] = useState<CVConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const activeDataset = datasets.find((d) => d.id === sharedDatasetId) ?? datasets[0] ?? null;

  const loadDatasets = useCallback(async () => {
    const { data, error } = await supabase
      .from('cv_datasets')
      .select('*')
      .eq('project_id', project.id)
      .order('created_at', { ascending: true });
    if (!error && data) {
      const ds = data as CVDataset[];
      setDatasets(ds);
      if (ds.length > 0 && !sharedDatasetId) onDatasetChange(ds[0].id);
    }
    setLoading(false);
  }, [project.id, sharedDatasetId, onDatasetChange]);

  const loadConfig = useCallback(async () => {
    if (!activeDataset) { setConfig(null); return; }
    const { data, error } = await supabase
      .from('cv_config')
      .select('*')
      .eq('dataset_id', activeDataset.id)
      .maybeSingle();
    if (!error && data) setConfig(data as CVConfig);
  }, [activeDataset]);

  useEffect(() => { loadDatasets(); }, [loadDatasets]);
  useEffect(() => { loadConfig(); }, [loadConfig]);

  // ── Compute result on the fly for export ──
  const result = useMemo((): ContentValidityResult | null => {
    if (!activeDataset || !config) return null;
    if (config.expert_columns.length === 0) return null;
    try {
      if (config.method === 'lawshe') {
        return analyseLawshe({
          rows: activeDataset.rows,
          headers: activeDataset.headers,
          itemLabelColumn: config.item_label_column,
          expertColumns: config.expert_columns,
          dimensionColumn: config.dimension_column,
          rowTypes: config.row_types,
          valueMapping: config.value_mapping as Record<string, string>,
          emptyAsEssential: config.empty_as_essential,
          excludedExperts: config.excluded_experts,
          droppedItems: config.dropped_items,
        });
      } else {
        return analyseAiken({
          rows: activeDataset.rows,
          headers: activeDataset.headers,
          itemLabelColumn: config.item_label_column,
          expertColumns: config.expert_columns,
          dimensionColumn: config.dimension_column,
          rowTypes: config.row_types,
          valueMapping: config.value_mapping as Record<string, number>,
          scaleLo: config.scale_lo ?? 1,
          scaleHi: config.scale_hi ?? 5,
          alpha: config.alpha,
          excludedExperts: config.excluded_experts,
          droppedItems: config.dropped_items,
        });
      }
    } catch {
      return null;
    }
  }, [activeDataset, config]);

  // ── Build export data ──
  const buildFullMatrix = useCallback((): { headers: string[]; rows: Record<string, unknown>[] } => {
    if (!activeDataset || !config || !result) return { headers: [], rows: [] };
    const { headers: dataHeaders, rows: dataRows } = activeDataset;
    const isLawshe = config.method === 'lawshe';
    const computedHeaders = isLawshe
      ? ['n_e', 'N', 'CVR', 'CVR_critical', 'decision', 'dropped']
      : ['V', 'band', 'V_critical', 'n', 'c', 'decision', 'dropped'];
    const exportHeaders = [...dataHeaders, ...computedHeaders];
    const droppedSet = new Set(config.dropped_items);
    const exportRows: Record<string, unknown>[] = [];

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const rowType = config.row_types[i] ?? 'item';
      const itemResult = result.itemResults.find((r) => r.rowIndex === i);
      const outRow: Record<string, unknown> = {};
      for (const h of dataHeaders) outRow[h] = row[h] ?? '';

      if (rowType === 'dimension' || !itemResult) {
        for (const ch of computedHeaders) outRow[ch] = '—';
      } else if (isLawshe) {
        const r = itemResult as Extract<ItemResult, { cvr: number | null }>;
        outRow['n_e'] = r.nEssential;
        outRow['N'] = r.nExperts;
        outRow['CVR'] = r.cvr != null ? Number(r.cvr.toFixed(4)) : '—';
        outRow['CVR_critical'] = r.cvrCritical != null ? Number(r.cvrCritical.toFixed(4)) : 'n/a';
        outRow['decision'] = r.decision;
        outRow['dropped'] = droppedSet.has(r.rowIndex) ? 'Yes' : 'No';
      } else {
        const r = itemResult as Extract<ItemResult, { v: number | null }>;
        outRow['V'] = r.v != null ? Number(r.v.toFixed(4)) : '—';
        outRow['band'] = r.bandLabel ?? '—';
        outRow['V_critical'] = r.vCritical != null ? Number(r.vCritical.toFixed(4)) : 'n/a';
        outRow['n'] = r.n;
        outRow['c'] = r.c;
        outRow['decision'] = r.decision;
        outRow['dropped'] = droppedSet.has(r.rowIndex) ? 'Yes' : 'No';
      }
      exportRows.push(outRow);
    }
    return { headers: exportHeaders, rows: exportRows };
  }, [activeDataset, config, result]);

  const buildKeptItems = useCallback((): { headers: string[]; rows: Record<string, unknown>[] } => {
    const full = buildFullMatrix();
    if (!config) return full;
    const droppedSet = new Set(config.dropped_items);
    const keptRows = full.rows.filter((_, i) => {
      const rowType = config.row_types[i] ?? 'item';
      if (rowType === 'dimension') return true;
      return !droppedSet.has(i);
    });
    return { headers: full.headers, rows: keptRows };
  }, [buildFullMatrix, config]);

  const buildRetainedList = useCallback((): { headers: string[]; rows: Record<string, unknown>[] } => {
    if (!activeDataset || !config || !result) return { headers: [], rows: [] };
    const droppedSet = new Set(config.dropped_items);
    const labelCol = config.item_label_column;
    const exportRows: Record<string, unknown>[] = [];
    for (const item of result.itemResults) {
      if (droppedSet.has(item.rowIndex)) continue;
      const rawRow = activeDataset.rows[item.rowIndex];
      const label = labelCol ? String(rawRow[labelCol] ?? `Row ${item.rowIndex + 1}`) : `Row ${item.rowIndex + 1}`;
      exportRows.push({
        'Item ID': label,
        'Decision': item.decision,
        ...(item.dimensionLabel ? { 'Dimension': item.dimensionLabel } : {}),
      });
    }
    const headers = exportRows.length > 0 && 'Dimension' in exportRows[0] ? ['Item ID', 'Decision', 'Dimension'] : ['Item ID', 'Decision'];
    return { headers, rows: exportRows };
  }, [activeDataset, config, result]);

  // ── Export handlers ──
  const sanitizeFileName = (base: string) => base.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim().replace(/\s+/g, '_');

  const doExport = useCallback((type: 'full' | 'kept' | 'retained', format: 'csv' | 'xlsx') => {
    const key = `${type}_${format}`;
    setExporting(key);
    setExportError(null);
    try {
      let data: { headers: string[]; rows: Record<string, unknown>[] };
      let baseName: string;
      if (type === 'full') { data = buildFullMatrix(); baseName = 'full_results'; }
      else if (type === 'kept') { data = buildKeptItems(); baseName = 'kept_items'; }
      else { data = buildRetainedList(); baseName = 'retained_items'; }

      const dsName = activeDataset?.sheet_name || activeDataset?.file_name || 'export';
      const fileName = `${sanitizeFileName(project.name)}_${sanitizeFileName(dsName)}_${baseName}.${format}`;

      if (format === 'csv') exportToCSV(data.headers, data.rows, fileName);
      else exportToXLSX(data.headers, data.rows, fileName);
    } catch (err) {
      setExportError(
        err instanceof Error
          ? `Export failed: ${err.message}`
          : 'Export failed. Please try again.',
      );
    }
    setExporting(null);
  }, [buildFullMatrix, buildKeptItems, buildRetainedList, activeDataset, project.name]);

  // ── Empty / loading states ──
  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-secondary-50">
        <Loader2 className="w-6 h-6 text-accent-600 animate-spin" />
      </div>
    );
  }

  if (datasets.length === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-secondary-50">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-2xl bg-secondary-100 flex items-center justify-center mx-auto mb-4">
            <FileDown className="w-8 h-8 text-secondary-400" />
          </div>
          <h3 className="text-lg font-semibold text-secondary-900 mb-1">No data yet</h3>
          <p className="text-sm text-secondary-500">Import expert ratings on the Data tab first.</p>
        </div>
      </div>
    );
  }

  if (!activeDataset || !config) {
    return (
      <div className="h-full flex items-center justify-center bg-secondary-50">
        <div className="text-sm text-secondary-500">Loading...</div>
      </div>
    );
  }

  const noExpertCols = config.expert_columns.length === 0;
  const allExcluded = config.excluded_experts.length === config.expert_columns.length && config.expert_columns.length > 0;
  const noItems = result?.itemResults.length === 0;

  return (
    <div className="h-full flex flex-col bg-secondary-50 overflow-hidden">
      {/* Dataset tabs */}
      {datasets.length > 1 && (
        <div className="flex items-center gap-1 px-5 py-1.5 bg-white border-b border-secondary-200 overflow-x-auto flex-shrink-0">
          {datasets.map((ds) => (
            <button key={ds.id} onClick={() => onDatasetChange(ds.id)}
              className={`flex items-center gap-1.5 px-3 py-1 text-sm rounded-md whitespace-nowrap transition-colors ${activeDataset.id === ds.id ? 'bg-accent-100 text-accent-700 border border-accent-300' : 'text-secondary-600 hover:bg-secondary-100 border border-transparent'}`}>
              {ds.sheet_name || ds.file_name}
              <span className="text-xs text-secondary-400">{ds.row_count}r</span>
            </button>
          ))}
        </div>
      )}

      {/* Scrollable content */}
      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-secondary-900">Export Results</h1>
          <p className="text-sm text-secondary-500 mt-0.5">
            Download your content validity analysis results as CSV or Excel files.
          </p>
        </div>

        {/* Warnings */}
        {(noExpertCols || allExcluded || noItems) && (
          <div className="flex items-center gap-2 px-4 py-3 bg-error-50 rounded-lg">
            <AlertCircle className="w-5 h-5 text-error-600 flex-shrink-0" />
            <p className="text-sm text-error-700">
              {noExpertCols ? 'No expert columns selected. Configure your data on the Data tab first.' :
               allExcluded ? 'All experts are excluded. Include at least one expert on the Data tab.' :
               'No item rows to export. Ensure rows are tagged as items, not dimensions.'}
            </p>
          </div>
        )}

        {/* Export cards */}
        <div className="grid grid-cols-3 gap-4">
          <ExportCard
            icon={<TableIcon className="w-5 h-5" />}
            title="Full Results Matrix"
            description="All rows (including dimension tags) + expert columns + computed fields (CVR/V, critical value, decision, band) + drop flags."
            badge="Complete"
            badgeColor="success"
            disabled={noExpertCols || allExcluded || noItems}
            onExportCSV={() => doExport('full', 'csv')}
            onExportXLSX={() => doExport('full', 'xlsx')}
            exporting={exporting}
            exportKey="full"
            fileName={`${sanitizeFileName(project.name)}_full_results.csv`}
          />
          <ExportCard
            icon={<FileText className="w-5 h-5" />}
            title="Kept Items Only"
            description="Omits dropped items. Includes all computed fields and expert columns for retained items only."
            badge="Filtered"
            badgeColor="success"
            disabled={noExpertCols || allExcluded || noItems}
            onExportCSV={() => doExport('kept', 'csv')}
            onExportXLSX={() => doExport('kept', 'xlsx')}
            exporting={exporting}
            exportKey="kept"
            fileName={`${sanitizeFileName(project.name)}_kept_items.csv`}
          />
          <ExportCard
            icon={<List className="w-5 h-5" />}
            title="Retained Item List"
            description="Item IDs/labels and decisions only — for building the next questionnaire version."
            badge="Summary"
            badgeColor="neutral"
            disabled={noExpertCols || allExcluded || noItems}
            onExportCSV={() => doExport('retained', 'csv')}
            onExportXLSX={() => doExport('retained', 'xlsx')}
            exporting={exporting}
            exportKey="retained"
            fileName={`${sanitizeFileName(project.name)}_retained_items.csv`}
          />
        </div>

        {/* Info note */}
        <div className="flex items-start gap-2 px-4 py-3 bg-info-50 rounded-lg">
          <AlertCircle className="w-4 h-4 text-info-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-info-700">
            Exports use the current configuration: {config.method === 'lawshe' ? 'Lawshe CVR' : 'Aiken\'s V'}, {config.expert_columns.length - config.excluded_experts.length} active expert{config.expert_columns.length - config.excluded_experts.length !== 1 ? 's' : ''}, {config.dropped_items.length} dropped item{config.dropped_items.length !== 1 ? 's' : ''}.
            {config.method === 'aiken' && ' Critical V uses a normal approximation.'}
          </p>
        </div>

        {exportError && (
          <div className="flex items-start gap-2 px-4 py-3 bg-error-50 rounded-lg">
            <AlertCircle className="w-5 h-5 text-error-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-error-700">{exportError}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────

function ExportCard({ icon, title, description, badge, badgeColor, disabled, onExportCSV, onExportXLSX, exporting, exportKey, fileName }: {
  icon: React.ReactNode;
  title: string;
  description: string;
  badge: string;
  badgeColor: 'success' | 'neutral';
  disabled?: boolean;
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
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${disabled ? 'bg-secondary-100 text-secondary-400' : 'bg-accent-100 text-accent-600'}`}>
            {icon}
          </div>
          <div>
            <h3 className="text-sm font-bold text-secondary-900">{title}</h3>
            <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full border ${badgeClasses[badgeColor]}`}>{badge}</span>
          </div>
        </div>
      </div>
      <p className="text-xs text-secondary-500 mb-4 flex-1 leading-relaxed">{description}</p>
      {disabled ? (
        <div className="flex items-center gap-2 px-3 py-2.5 bg-secondary-50 rounded-lg">
          <AlertCircle className="w-4 h-4 text-secondary-400 flex-shrink-0" />
          <span className="text-xs text-secondary-500">Not available with current configuration.</span>
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
