import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { supabase, Project, CVDataset, CVConfig } from '@/lib/supabase';
import { Button, Card, Modal } from './ui';
import {
  Upload, Table as TableIcon, Loader2, AlertCircle, Info, Check,
  ClipboardCheck, Users, Tag, ChevronDown, ChevronRight, Eye, EyeOff,
} from 'lucide-react';
import {
  getSheetInfo, getRawSheet, parseSheetConfigurable,
  type ParsedSheet, type SheetInfo,
} from '@/lib/fileParser';
import {
  discoverDistinctValues, suggestLawsheMapping, suggestAikenMapping,
  computeExpertQuality,
  type CVMethod, type RowType,
} from '@/scientific/contentValidity';

interface Props {
  project: Project;
  sharedDatasetId: string | null;
  onDatasetChange: (id: string | null) => void;
}

export function CVDataScreen({ project, sharedDatasetId, onDatasetChange }: Props) {
  const [datasets, setDatasets] = useState<CVDataset[]>([]);
  const [config, setConfig] = useState<CVConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [sheetInfo, setSheetInfo] = useState<SheetInfo[] | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [showSheetPicker, setShowSheetPicker] = useState(false);
  const [showSettings, setShowSettings] = useState(true);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeDataset = datasets.find((d) => d.id === sharedDatasetId) ?? datasets[0] ?? null;

  // ── Load datasets ──
  const loadDatasets = useCallback(async () => {
    const { data, error } = await supabase
      .from('cv_datasets')
      .select('*')
      .eq('project_id', project.id)
      .order('created_at', { ascending: true });
    if (!error && data) {
      const ds = data as CVDataset[];
      setDatasets(ds);
      if (ds.length > 0 && !sharedDatasetId) {
        onDatasetChange(ds[0].id);
      }
    }
    setLoading(false);
  }, [project.id, sharedDatasetId, onDatasetChange]);

  // ── Load config for active dataset ──
  const loadConfig = useCallback(async () => {
    if (!activeDataset) { setConfig(null); return; }
    const { data, error } = await supabase
      .from('cv_config')
      .select('*')
      .eq('dataset_id', activeDataset.id)
      .maybeSingle();
    if (!error && data) {
      setConfig(data as CVConfig);
    } else if (!error) {
      // Create default config
      const newConfig = {
        project_id: project.id,
        dataset_id: activeDataset.id,
        method: 'lawshe' as CVMethod,
        item_label_column: null,
        expert_columns: [] as string[],
        dimension_column: null,
        row_types: {} as Record<number, RowType>,
        value_mapping: {} as Record<string, string | number>,
        scale_lo: 1,
        scale_hi: 5,
        alpha: 0.05,
        empty_as_essential: false,
        excluded_experts: [] as string[],
        dropped_items: [] as number[],
      };
      const { data: created } = await supabase
        .from('cv_config')
        .insert(newConfig)
        .select()
        .maybeSingle();
      if (created) setConfig(created as CVConfig);
    }
  }, [activeDataset, project.id]);

  useEffect(() => { loadDatasets(); }, [loadDatasets]);
  useEffect(() => { loadConfig(); }, [loadConfig]);

  // ── Upload flow ──
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const info = await getSheetInfo(file);
      if (info.sheets.length === 1) {
        await importSheet(file, info.sheets[0].name);
      } else {
        setPendingFile(file);
        setSheetInfo(info.sheets);
        setShowSheetPicker(true);
      }
    } catch (err) {
      setUploadError(
        err instanceof Error
          ? `Could not read this file: ${err.message}`
          : 'Could not read this file. Make sure it is a valid Excel or CSV file.',
      );
    }
    setUploading(false);
    e.target.value = '';
  };

  const importSheet = async (file: File, sheetName: string) => {
    setUploading(true);
    setUploadError(null);
    try {
      const rawRows = await getRawSheet(file, sheetName);
      const parsed: ParsedSheet = parseSheetConfigurable(rawRows, {
        sheetName, headerRow: 0, labelRow: null, dataStartRow: 1, removeEmptyRows: false,
      });
      if (parsed.rows.length === 0) {
        setUploadError('The selected sheet has no data rows. Check that your file has a header row followed by data.');
        setShowSheetPicker(false);
        setPendingFile(null);
        setSheetInfo(null);
        setUploading(false);
        return;
      }

      const { data, error: insertError } = await supabase
        .from('cv_datasets')
        .insert({
          project_id: project.id,
          file_name: file.name,
          sheet_name: sheetName,
          headers: parsed.headers,
          rows: parsed.rows,
          row_count: parsed.rows.length,
          col_count: parsed.colCount,
        })
        .select()
        .maybeSingle();

      if (insertError) throw new Error(insertError.message);

      if (data) {
        const newDs = data as CVDataset;
        setDatasets([...datasets, newDs]);
        onDatasetChange(newDs.id);
      }

      setShowSheetPicker(false);
      setPendingFile(null);
      setSheetInfo(null);
    } catch (err) {
      setUploadError(
        err instanceof Error
          ? `Import failed: ${err.message}`
          : 'Import failed. Please try again.',
      );
      setShowSheetPicker(false);
      setPendingFile(null);
      setSheetInfo(null);
    }
    setUploading(false);
  };

  // ── Config update helper ──
  const updateConfig = useCallback(async (patch: Partial<CVConfig>) => {
    if (!config) return;
    const updated = { ...config, ...patch, updated_at: new Date().toISOString() };
    setConfig(updated);
    await supabase.from('cv_config').update(patch).eq('id', config.id);
  }, [config]);

  // ── Auto-detect dimension rows ──
  const autoDetectDimensionRows = useCallback(() => {
    if (!activeDataset || !config) return;
    const { headers, rows } = activeDataset;
    const expertCols = config.expert_columns;
    if (expertCols.length === 0) return;
    const rowTypes: Record<number, RowType> = {};
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const allExpertEmpty = expertCols.every(
        (col) => row[col] == null || String(row[col]).trim() === '',
      );
      if (allExpertEmpty) {
        rowTypes[i] = 'dimension';
      }
    }
    updateConfig({ row_types: rowTypes });
  }, [activeDataset, config, updateConfig]);

  // ── Computed values ──
  const itemRowIndices = useMemo(() => {
    if (!activeDataset || !config) return [];
    const indices: number[] = [];
    for (let i = 0; i < activeDataset.rows.length; i++) {
      if ((config.row_types[i] ?? 'item') === 'item') indices.push(i);
    }
    return indices;
  }, [activeDataset, config]);

  const distinctValues = useMemo(() => {
    if (!activeDataset || !config || config.expert_columns.length === 0) return [];
    return discoverDistinctValues(activeDataset.rows, config.expert_columns, itemRowIndices);
  }, [activeDataset, config, itemRowIndices]);

  const unmappedValues = useMemo(() => {
    if (!config) return [];
    return distinctValues.filter((v) => {
      if (v in config.value_mapping) return false;
      if (config.method === 'aiken' && !isNaN(Number(v))) return false;
      return true;
    });
  }, [distinctValues, config]);

  const expertQuality = useMemo(() => {
    if (!activeDataset || !config || config.expert_columns.length === 0 || itemRowIndices.length === 0) return [];
    return computeExpertQuality(activeDataset.rows, config.expert_columns, itemRowIndices);
  }, [activeDataset, config, itemRowIndices]);

  const allExpertsExcluded = config ? config.excluded_experts.length === config.expert_columns.length && config.expert_columns.length > 0 : false;

  // ── Empty states ──
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
          <div className="w-16 h-16 rounded-2xl bg-accent-100 flex items-center justify-center mx-auto mb-4">
            <Upload className="w-8 h-8 text-accent-600" />
          </div>
          <h3 className="text-lg font-semibold text-secondary-900 mb-1">Import expert ratings</h3>
          <p className="text-sm text-secondary-500 mb-6">
            Upload a spreadsheet where rows are draft items and columns are expert ratings.
            You can use Excel or CSV.
          </p>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileSelect} className="hidden" />
          <Button onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? 'Reading file...' : 'Choose file'}
          </Button>
          {uploadError && (
            <div className="mt-4 flex items-start gap-2 px-4 py-3 bg-error-50 rounded-lg text-left">
              <AlertCircle className="w-4 h-4 text-error-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-error-700">{uploadError}</p>
            </div>
          )}
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

  const { headers, rows } = activeDataset;
  const displayRows = rows.slice(0, 100);

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

      {/* Upload button */}
      <div className="px-5 py-2 bg-white border-b border-secondary-200 flex-shrink-0">
        <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileSelect} className="hidden" />
        <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          {uploading ? 'Importing...' : 'Import another sheet'}
        </Button>
        {uploadError && (
          <div className="mt-2 flex items-start gap-2 px-3 py-2 bg-error-50 rounded-lg">
            <AlertCircle className="w-4 h-4 text-error-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-error-700">{uploadError}</p>
          </div>
        )}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-secondary-900">Expert Rating Data</h1>
            <p className="text-sm text-secondary-500 mt-0.5">
              {rows.length} rows · {headers.length} columns · {config.expert_columns.length} expert{config.expert_columns.length !== 1 ? 's' : ''} · {itemRowIndices.length} item row{itemRowIndices.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        {/* Config panel */}
        <Card className="overflow-hidden">
          <button onClick={() => setShowSettings(!showSettings)}
            className="w-full flex items-center justify-between px-5 py-3 hover:bg-secondary-50 transition-colors">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="w-4 h-4 text-accent-600" />
              <span className="text-sm font-semibold text-secondary-700">Structure & Method Configuration</span>
            </div>
            {showSettings ? <ChevronDown className="w-4 h-4 text-secondary-400" /> : <ChevronRight className="w-4 h-4 text-secondary-400" />}
          </button>

          {showSettings && (
            <div className="px-5 pb-5 border-t border-secondary-100 space-y-5">
              {/* Method choice */}
              <div className="pt-4">
                <div className="text-xs font-semibold text-secondary-500 uppercase tracking-wide mb-2">Analysis Method</div>
                <div className="flex gap-3">
                  <button
                    onClick={() => updateConfig({ method: 'lawshe' })}
                    className={`flex-1 p-3 rounded-lg border-2 text-left transition-all ${config.method === 'lawshe' ? 'border-accent-500 bg-accent-50' : 'border-secondary-200 hover:border-secondary-300'}`}
                  >
                    <div className="text-sm font-semibold text-secondary-900">Lawshe CVR</div>
                    <div className="text-xs text-secondary-500 mt-0.5">Experts rate items as Essential or Not essential. Computes Content Validity Ratio with Ayre &amp; Scally (2014) critical values.</div>
                  </button>
                  <button
                    onClick={() => updateConfig({ method: 'aiken' })}
                    className={`flex-1 p-3 rounded-lg border-2 text-left transition-all ${config.method === 'aiken' ? 'border-accent-500 bg-accent-50' : 'border-secondary-200 hover:border-secondary-300'}`}
                  >
                    <div className="text-sm font-semibold text-secondary-900">Aiken&apos;s V</div>
                    <div className="text-xs text-secondary-500 mt-0.5">Experts rate items on an ordinal scale (e.g. 1–5). Computes Aiken&apos;s V with normal-approximation critical values.</div>
                  </button>
                </div>
              </div>

              {/* Column roles */}
              <div>
                <div className="text-xs font-semibold text-secondary-500 uppercase tracking-wide mb-2">Column Roles</div>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-secondary-600 mb-1 block">Item label / ID column</label>
                    <select
                      value={config.item_label_column ?? ''}
                      onChange={(e) => updateConfig({ item_label_column: e.target.value || null })}
                      className="w-full px-3 py-1.5 text-sm border border-secondary-200 rounded-lg focus:outline-none focus:border-accent-400"
                    >
                      <option value="">— None (use row numbers) —</option>
                      {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-secondary-600 mb-1 block">Expert rating columns ({config.expert_columns.length} selected)</label>
                    <div className="flex flex-wrap gap-2">
                      {headers.map((h) => {
                        const isExpert = config.expert_columns.includes(h);
                        return (
                          <button key={h}
                            onClick={() => {
                              const next = isExpert
                                ? config.expert_columns.filter((c) => c !== h)
                                : [...config.expert_columns, h];
                              updateConfig({ expert_columns: next });
                            }}
                            className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${isExpert ? 'bg-accent-100 text-accent-700 border-accent-300' : 'bg-white text-secondary-600 border-secondary-200 hover:border-secondary-300'}`}>
                            {h}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-secondary-600 mb-1 block">Dimension label column (optional, for inline dimension labels)</label>
                    <select
                      value={config.dimension_column ?? ''}
                      onChange={(e) => updateConfig({ dimension_column: e.target.value || null })}
                      className="w-full px-3 py-1.5 text-sm border border-secondary-200 rounded-lg focus:outline-none focus:border-accent-400"
                    >
                      <option value="">— None —</option>
                      {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Dimension row tagging */}
              <div>
                <div className="text-xs font-semibold text-secondary-500 uppercase tracking-wide mb-2 flex items-center gap-2">
                  <Tag className="w-3.5 h-3.5" /> Dimension Row Tagging
                </div>
                <p className="text-xs text-secondary-400 mb-2">
                  Rows where all expert cells are empty are auto-detected as dimension (section title) rows. Dimension rows are never analysed but remain visible in the grid and exports. You can manually toggle any row below.
                </p>
                <Button variant="outline" size="sm" onClick={autoDetectDimensionRows}>
                  Auto-detect dimension rows
                </Button>
              </div>

              {/* Lawshe-specific settings */}
              {config.method === 'lawshe' && (
                <div>
                  <div className="text-xs font-semibold text-secondary-500 uppercase tracking-wide mb-2">Lawshe Settings</div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={config.empty_as_essential}
                      onChange={(e) => updateConfig({ empty_as_essential: e.target.checked })}
                      className="w-4 h-4 rounded border-secondary-300 text-accent-600 focus:ring-accent-500" />
                    <span className="text-sm text-secondary-700">Treat empty/missing cells as Essential (default: empty = Not essential)</span>
                  </label>
                </div>
              )}

              {/* Aiken-specific settings */}
              {config.method === 'aiken' && (
                <div>
                  <div className="text-xs font-semibold text-secondary-500 uppercase tracking-wide mb-2">Aiken Settings</div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="text-xs text-secondary-600 mb-1 block">Scale minimum (lo)</label>
                      <input type="number" value={config.scale_lo ?? 1}
                        onChange={(e) => updateConfig({ scale_lo: Number(e.target.value) })}
                        className="w-full px-3 py-1.5 text-sm border border-secondary-200 rounded-lg focus:outline-none focus:border-accent-400" />
                    </div>
                    <div>
                      <label className="text-xs text-secondary-600 mb-1 block">Scale maximum (hi)</label>
                      <input type="number" value={config.scale_hi ?? 5}
                        onChange={(e) => updateConfig({ scale_hi: Number(e.target.value) })}
                        className="w-full px-3 py-1.5 text-sm border border-secondary-200 rounded-lg focus:outline-none focus:border-accent-400" />
                    </div>
                    <div>
                      <label className="text-xs text-secondary-600 mb-1 block">Significance level (alpha)</label>
                      <select value={config.alpha}
                        onChange={(e) => updateConfig({ alpha: Number(e.target.value) })}
                        className="w-full px-3 py-1.5 text-sm border border-secondary-200 rounded-lg focus:outline-none focus:border-accent-400">
                        <option value={0.05}>0.05 (default)</option>
                        <option value={0.01}>0.01 (stricter)</option>
                      </select>
                    </div>
                  </div>
                  {(config.scale_hi ?? 0) <= (config.scale_lo ?? 0) && (
                    <div className="flex items-center gap-2 mt-2 px-3 py-2 bg-error-50 rounded-lg">
                      <AlertCircle className="w-4 h-4 text-error-600 flex-shrink-0" />
                      <span className="text-xs text-error-700">Scale maximum must be greater than minimum.</span>
                    </div>
                  )}
                </div>
              )}

              {/* Value mapping */}
              {config.expert_columns.length > 0 && distinctValues.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-secondary-500 uppercase tracking-wide mb-2">Value Mapping</div>
                  {config.method === 'lawshe' ? (
                    <>
                      <p className="text-xs text-secondary-400 mb-2">Map each distinct value found in expert cells to Essential or Not essential.</p>
                      <div className="space-y-1.5">
                        {distinctValues.map((v) => (
                          <div key={v} className="flex items-center gap-3">
                            <span className="text-sm font-mono text-secondary-700 w-32 truncate" title={v}>{v}</span>
                            <div className="flex gap-1.5">
                              {(['essential', 'not_essential'] as const).map((role) => (
                                <button key={role}
                                  onClick={() => updateConfig({ value_mapping: { ...config.value_mapping, [v]: role } })}
                                  className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                                    config.value_mapping[v] === role
                                      ? role === 'essential' ? 'bg-success-100 text-success-700 border-success-300' : 'bg-error-100 text-error-700 border-error-300'
                                      : 'bg-white text-secondary-500 border-secondary-200 hover:border-secondary-300'
                                  }`}>
                                  {role === 'essential' ? 'Essential' : 'Not essential'}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                      <Button variant="ghost" size="sm" className="mt-2"
                        onClick={() => {
                          const suggested = suggestLawsheMapping(distinctValues);
                          const merged = { ...config.value_mapping, ...suggested };
                          updateConfig({ value_mapping: merged });
                        }}>
                        Auto-suggest common patterns (1/yes = Essential, 0/no = Not essential)
                      </Button>
                    </>
                  ) : (
                    <>
                      <p className="text-xs text-secondary-400 mb-2">
                        Map each distinct value to its ordinal rank. Numeric values are used directly if no mapping is set.
                      </p>
                      <div className="space-y-1.5">
                        {distinctValues.map((v) => (
                          <div key={v} className="flex items-center gap-3">
                            <span className="text-sm font-mono text-secondary-700 w-32 truncate" title={v}>{v}</span>
                            <input type="number"
                              value={config.value_mapping[v] != null ? String(config.value_mapping[v]) : ''}
                              placeholder={isNaN(Number(v)) ? 'Map to...' : String(Number(v))}
                              onChange={(e) => {
                                const num = e.target.value === '' ? null : Number(e.target.value);
                                const next = { ...config.value_mapping };
                                if (num != null && !isNaN(num)) next[v] = num;
                                else delete next[v];
                                updateConfig({ value_mapping: next });
                              }}
                              className="w-24 px-2 py-1 text-sm border border-secondary-200 rounded-lg focus:outline-none focus:border-accent-400" />
                          </div>
                        ))}
                      </div>
                      <Button variant="ghost" size="sm" className="mt-2"
                        onClick={() => {
                          const suggested = suggestAikenMapping(distinctValues);
                          const merged = { ...config.value_mapping, ...suggested };
                          updateConfig({ value_mapping: merged });
                        }}>
                        Auto-fill from numeric values
                      </Button>
                    </>
                  )}
                </div>
              )}

              {/* Expert quality + exclusion */}
              {expertQuality.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-secondary-500 uppercase tracking-wide mb-2 flex items-center gap-2">
                    <Users className="w-3.5 h-3.5" /> Expert Quality & Exclusion
                  </div>
                  <p className="text-xs text-secondary-400 mb-2">
                    Exclude experts whose ratings are unreliable (high missingness or near-constant). Excluding an expert removes them from all calculations but preserves their raw data.
                  </p>
                  {allExpertsExcluded && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-error-50 rounded-lg mb-2">
                      <AlertCircle className="w-4 h-4 text-error-600 flex-shrink-0" />
                      <span className="text-xs text-error-700">All experts are excluded. You cannot analyse until at least one expert is active.</span>
                    </div>
                  )}
                  <div className="overflow-auto max-h-[200px]">
                    <table className="w-full text-xs border-collapse">
                      <thead className="sticky top-0 bg-secondary-50">
                        <tr>
                          <th className="px-2 py-1.5 text-left font-medium text-secondary-500 border-b border-secondary-200">Expert</th>
                          <th className="px-2 py-1.5 text-right font-medium text-secondary-500 border-b border-secondary-200">Missing %</th>
                          <th className="px-2 py-1.5 text-right font-medium text-secondary-500 border-b border-secondary-200">Variance</th>
                          <th className="px-2 py-1.5 text-center font-medium text-secondary-500 border-b border-secondary-200">Flag</th>
                          <th className="px-2 py-1.5 text-center font-medium text-secondary-500 border-b border-secondary-200">Exclude</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-secondary-100">
                        {expertQuality.map((eq) => {
                          const excluded = config.excluded_experts.includes(eq.column);
                          return (
                            <tr key={eq.column} className={excluded ? 'bg-error-50/50' : ''}>
                              <td className="px-2 py-1.5 text-secondary-700 font-mono">{eq.column}</td>
                              <td className="px-2 py-1.5 text-right">
                                <span className={eq.missingRate > 0.5 ? 'text-error-600 font-medium' : 'text-secondary-600'}>
                                  {(eq.missingRate * 100).toFixed(1)}%
                                </span>
                              </td>
                              <td className="px-2 py-1.5 text-right">
                                <span className={eq.variance < 0.01 ? 'text-warning-600 font-medium' : 'text-secondary-600'}>
                                  {eq.variance.toFixed(3)}
                                </span>
                              </td>
                              <td className="px-2 py-1.5 text-center">
                                {eq.flagged ? <span className="text-warning-600 text-xs">Flagged</span> : <span className="text-success-600 text-xs">OK</span>}
                              </td>
                              <td className="px-2 py-1.5 text-center">
                                <button
                                  onClick={() => {
                                    const next = excluded
                                      ? config.excluded_experts.filter((c) => c !== eq.column)
                                      : [...config.excluded_experts, eq.column];
                                    updateConfig({ excluded_experts: next });
                                  }}
                                  className={`px-2 py-0.5 text-xs rounded-full transition-colors ${excluded ? 'bg-success-100 text-success-700 hover:bg-success-200' : 'bg-error-100 text-error-700 hover:bg-error-200'}`}>
                                  {excluded ? 'Include' : 'Exclude'}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Unmapped values warning */}
              {unmappedValues.length > 0 && config.expert_columns.length > 0 && (
                <div className="flex items-start gap-2 px-3 py-2.5 bg-warning-50 rounded-lg">
                  <AlertCircle className="w-4 h-4 text-warning-600 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-warning-700">
                    <span className="font-medium">{unmappedValues.length} unmapped value{unmappedValues.length > 1 ? 's' : ''}:</span> {unmappedValues.slice(0, 10).join(', ')}{unmappedValues.length > 10 ? '...' : ''}
                    <br />Analyse will be blocked until all values are mapped.
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Data grid */}
        <Card className="overflow-hidden">
          <div className="px-5 py-3 border-b border-secondary-200 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-secondary-900">Data Grid</h2>
            <div className="flex items-center gap-2">
              <span className="text-xs text-secondary-400">
                Showing first {Math.min(100, rows.length)} of {rows.length} rows
              </span>
            </div>
          </div>
          <div className="overflow-auto max-h-[500px]">
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 bg-secondary-50 z-10">
                <tr>
                  <th className="px-2 py-2 text-left font-medium text-secondary-500 border-b border-r border-secondary-200 sticky left-0 bg-secondary-50">#</th>
                  <th className="px-2 py-2 text-center font-medium text-secondary-500 border-b border-r border-secondary-200">Type</th>
                  {headers.map((h) => {
                    const isExpert = config.expert_columns.includes(h);
                    const isLabel = config.item_label_column === h;
                    const isDim = config.dimension_column === h;
                    return (
                      <th key={h} className={`px-2 py-2 text-left font-medium text-xs whitespace-nowrap border-b border-r border-secondary-200 last:border-r-0 ${
                        isExpert ? 'bg-accent-50 text-accent-700' :
                        isLabel ? 'bg-primary-50 text-primary-700' :
                        isDim ? 'bg-info-50 text-info-700' : 'bg-secondary-50 text-secondary-600'
                      }`}>
                        {h}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-secondary-100">
                {displayRows.map((row, i) => {
                  const rowType = config.row_types[i] ?? 'item';
                  const isDim = rowType === 'dimension';
                  return (
                    <tr key={i} className={isDim ? 'bg-info-50/30' : i % 2 ? 'bg-secondary-50/20' : 'bg-white'}>
                      <td className="px-2 py-1.5 text-secondary-400 font-mono text-xs sticky left-0 bg-inherit border-r border-secondary-100">{i + 1}</td>
                      <td className="px-2 py-1.5 text-center border-r border-secondary-100">
                        <button
                          onClick={() => {
                            const next = { ...config.row_types };
                            if (isDim) delete next[i];
                            else next[i] = 'dimension';
                            updateConfig({ row_types: next });
                          }}
                          className={`px-1.5 py-0.5 text-xs rounded-full transition-colors ${isDim ? 'bg-info-100 text-info-700 hover:bg-info-200' : 'bg-secondary-100 text-secondary-600 hover:bg-secondary-200'}`}>
                          {isDim ? 'Dim' : 'Item'}
                        </button>
                      </td>
                      {headers.map((h) => {
                        const val = row[h];
                        return (
                          <td key={h} className="px-2 py-1.5 whitespace-nowrap max-w-[180px] truncate border-r border-secondary-100 last:border-r-0 text-secondary-700">
                            {val != null && val !== '' ? String(val) : <span className="text-secondary-300">—</span>}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Sheet picker modal */}
      <Modal open={showSheetPicker} onClose={() => setShowSheetPicker(false)} title="Select Sheet" maxWidth="max-w-md">
        <div className="space-y-2">
          <p className="text-sm text-secondary-500 mb-3">Found {sheetInfo?.length ?? 0} sheet{sheetInfo?.length !== 1 ? 's' : ''}. Choose which to import:</p>
          {sheetInfo?.map((s) => (
            <button key={s.name}
              onClick={() => pendingFile && importSheet(pendingFile, s.name)}
              className="w-full flex items-center justify-between px-4 py-3 border border-secondary-200 rounded-lg hover:border-accent-300 hover:bg-accent-50 transition-colors text-left">
              <div>
                <div className="text-sm font-medium text-secondary-900">{s.name}</div>
                <div className="text-xs text-secondary-400">{s.rows} rows · {s.cols} columns</div>
              </div>
              <Upload className="w-4 h-4 text-accent-600" />
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}
