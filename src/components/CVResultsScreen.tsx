import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { supabase, Project, CVDataset, CVConfig } from '@/lib/supabase';
import { Button, Card } from './ui';
import {
  BarChart3, Loader2, AlertCircle, Info, Check, X, Play,
  TrendingUp, AlertTriangle, ChevronDown, ChevronRight,
} from 'lucide-react';
import {
  analyseLawshe, analyseAiken,
  type ContentValidityResult, type LawsheItemResult, type AikenItemResult,
  type ItemResult,
} from '@/scientific/contentValidity';

interface Props {
  project: Project;
  sharedDatasetId: string | null;
  onDatasetChange: (id: string | null) => void;
}

export function CVResultsScreen({ project, sharedDatasetId, onDatasetChange }: Props) {
  const [datasets, setDatasets] = useState<CVDataset[]>([]);
  const [config, setConfig] = useState<CVConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [analysing, setAnalysing] = useState(false);
  const [result, setResult] = useState<ContentValidityResult | null>(null);
  const [showSummary, setShowSummary] = useState(true);

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

  // ── Validation before analyse ──
  const validationError = useMemo(() => {
    if (!activeDataset || !config) return 'No data available.';
    if (config.expert_columns.length === 0) return 'No expert columns selected. Assign expert columns on the Data tab.';
    if (config.excluded_experts.length === config.expert_columns.length) return 'All experts are excluded. Include at least one expert on the Data tab.';
    if (config.method === 'aiken') {
      if ((config.scale_hi ?? 0) <= (config.scale_lo ?? 0)) return 'Scale maximum must be greater than minimum. Fix on the Data tab.';
    }
    return null;
  }, [activeDataset, config]);

  const unmappedValues = useMemo(() => {
    if (!activeDataset || !config || config.expert_columns.length === 0) return [];
    const itemIndices: number[] = [];
    for (let i = 0; i < activeDataset.rows.length; i++) {
      if ((config.row_types[i] ?? 'item') === 'item') itemIndices.push(i);
    }
    const set = new Set<string>();
    for (const idx of itemIndices) {
      const row = activeDataset.rows[idx];
      for (const col of config.expert_columns) {
        const val = row[col];
        if (val != null && String(val).trim() !== '') {
          const v = String(val).trim();
          if (!(v in config.value_mapping)) set.add(v);
        }
      }
    }
    return Array.from(set);
  }, [activeDataset, config]);

  // ── Analyse ──
  const handleAnalyse = useCallback(async () => {
    if (!activeDataset || !config || validationError || unmappedValues.length > 0) return;
    setAnalysing(true);
    try {
      let res: ContentValidityResult;
      if (config.method === 'lawshe') {
        res = analyseLawshe({
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
        res = analyseAiken({
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
      setResult(res);

      // Save to DB
      await supabase.from('cv_results').upsert({
        project_id: project.id,
        dataset_id: activeDataset.id,
        results: res.itemResults as unknown as Record<string, unknown>[],
        summary: res.summary as Record<string, unknown>,
        config_snapshot: { ...config, method: config.method },
      }, { onConflict: 'dataset_id' });
    } catch {
      // ignore
    }
    setAnalysing(false);
  }, [activeDataset, config, validationError, unmappedValues, project.id]);

  // ── Drop / undrop item ──
  const toggleDropItem = useCallback(async (rowIndex: number) => {
    if (!config) return;
    const dropped = new Set(config.dropped_items);
    if (dropped.has(rowIndex)) dropped.delete(rowIndex);
    else dropped.add(rowIndex);
    const next = Array.from(dropped);
    const updated = { ...config, dropped_items: next };
    setConfig(updated);
    await supabase.from('cv_config').update({ dropped_items: next }).eq('id', config.id);
  }, [config]);

  const bulkDropRejected = useCallback(async () => {
    if (!config || !result) return;
    const toDrop = result.itemResults.filter(
      (r) => r.decision === 'reject' && !config.dropped_items.includes(r.rowIndex),
    ).map((r) => r.rowIndex);
    const next = [...config.dropped_items, ...toDrop];
    const updated = { ...config, dropped_items: next };
    setConfig(updated);
    await supabase.from('cv_config').update({ dropped_items: next }).eq('id', config.id);
  }, [config, result]);

  const droppedSet = useMemo(() => new Set(config?.dropped_items ?? []), [config]);

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
            <BarChart3 className="w-8 h-8 text-secondary-400" />
          </div>
          <h3 className="text-lg font-semibold text-secondary-900 mb-1">No data yet</h3>
          <p className="text-sm text-secondary-500">Import expert ratings on the Data tab first, then return here to analyse.</p>
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
        {/* Header + analyse button */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-secondary-900">Analysis Results</h1>
            <p className="text-sm text-secondary-500 mt-0.5">
              {config.method === 'lawshe' ? 'Lawshe CVR' : 'Aiken\'s V'} · {config.expert_columns.length - config.excluded_experts.length} active expert{config.expert_columns.length - config.excluded_experts.length !== 1 ? 's' : ''}
            </p>
          </div>
          <Button onClick={handleAnalyse} disabled={!!validationError || unmappedValues.length > 0 || analysing}
            className="bg-accent-600 hover:bg-accent-700 active:bg-accent-800">
            {analysing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {analysing ? 'Analysing...' : 'Analyse'}
          </Button>
        </div>

        {/* Validation errors */}
        {validationError && (
          <div className="flex items-center gap-2 px-4 py-3 bg-error-50 rounded-lg">
            <AlertCircle className="w-5 h-5 text-error-600 flex-shrink-0" />
            <p className="text-sm text-error-700">{validationError}</p>
          </div>
        )}

        {!validationError && unmappedValues.length > 0 && (
          <div className="flex items-start gap-2 px-4 py-3 bg-warning-50 rounded-lg">
            <AlertCircle className="w-5 h-5 text-warning-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-warning-700">
              <span className="font-medium">{unmappedValues.length} unmapped value{unmappedValues.length > 1 ? 's' : ''}:</span> {unmappedValues.slice(0, 10).join(', ')}{unmappedValues.length > 10 ? '...' : ''}
              <br />Map all values on the Data tab before analysing.
            </div>
          </div>
        )}

        {/* Results */}
        {result && (
          <>
            {/* Summary */}
            <Card className="overflow-hidden">
              <button onClick={() => setShowSummary(!showSummary)}
                className="w-full flex items-center justify-between px-5 py-3 hover:bg-secondary-50 transition-colors">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-accent-600" />
                  <span className="text-sm font-semibold text-secondary-700">Summary</span>
                </div>
                {showSummary ? <ChevronDown className="w-4 h-4 text-secondary-400" /> : <ChevronRight className="w-4 h-4 text-secondary-400" />}
              </button>
              {showSummary && (
                <div className="px-5 pb-5 border-t border-secondary-100">
                  <div className="grid grid-cols-5 gap-4 pt-4">
                    <SummaryStat label="Total items" value={String(result.summary.totalItems)} />
                    <SummaryStat label="Accepted" value={String(result.summary.accepted)} accent="success" />
                    <SummaryStat label="Rejected" value={String(result.summary.rejected)} accent="error" />
                    <SummaryStat label="Reject/refine" value={String(result.summary.rejectRefine)} accent="warning" />
                    <SummaryStat label="Dropped" value={String(result.summary.dropped)} accent="error" />
                  </div>

                  {result.method === 'lawshe' && result.summary.meanCvrAccepted != null && (
                    <div className="mt-4 flex items-center gap-2 px-3 py-2 bg-info-50 rounded-lg">
                      <Info className="w-4 h-4 text-info-600 flex-shrink-0" />
                      <span className="text-sm text-info-700">
                        S-CVI/Ave (mean CVR of accepted items): <strong>{result.summary.meanCvrAccepted.toFixed(3)}</strong>
                      </span>
                    </div>
                  )}

                  {result.method === 'lawshe' && (
                    <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-secondary-50 rounded-lg">
                      <Info className="w-4 h-4 text-secondary-500 flex-shrink-0" />
                      <span className="text-xs text-secondary-600">
                        Critical values: Ayre &amp; Scally (2014), exact binomial, alpha = .05, one-tailed.
                        {result.activeExpertCount < 5 || result.activeExpertCount > 40
                          ? ` N=${result.activeExpertCount} is outside the critical value table (5–40). CVR is computed but decisions are n/a.`
                          : ''}
                      </span>
                    </div>
                  )}

                  {result.method === 'aiken' && (
                    <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-secondary-50 rounded-lg">
                      <Info className="w-4 h-4 text-secondary-500 flex-shrink-0" />
                      <span className="text-xs text-secondary-600">
                        Critical V uses a normal approximation (not a full reprint of Aiken 1985 tables). Borderline results with small expert panels should be interpreted cautiously.
                      </span>
                    </div>
                  )}
                </div>
              )}
            </Card>

            {/* Dimension rows */}
            {result.dimensionRows.length > 0 && (
              <Card className="p-4">
                <h3 className="text-sm font-semibold text-secondary-900 mb-2">Dimension / Section Rows (not analysed)</h3>
                <div className="flex flex-wrap gap-2">
                  {result.dimensionRows.map((d) => (
                    <span key={d.rowIndex} className="inline-flex items-center gap-1 px-2.5 py-1 bg-info-50 text-info-700 text-xs rounded-full border border-info-200">
                      <span className="font-mono text-info-400">#{d.rowIndex + 1}</span>
                      {d.label}
                    </span>
                  ))}
                </div>
              </Card>
            )}

            {/* Results table */}
            <Card className="overflow-hidden">
              <div className="px-5 py-3 border-b border-secondary-200 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-secondary-900">Item Results</h2>
                <div className="flex items-center gap-2">
                  {result.summary.rejected > 0 && (
                    <Button variant="outline" size="sm" onClick={bulkDropRejected}>
                      Drop all rejected
                    </Button>
                  )}
                </div>
              </div>

              {result.method === 'lawshe' ? (
                <LawsheResultsTable
                  items={result.itemResults as LawsheItemResult[]}
                  droppedSet={droppedSet}
                  onToggleDrop={toggleDropItem}
                />
              ) : (
                <AikenResultsTable
                  items={result.itemResults as AikenItemResult[]}
                  droppedSet={droppedSet}
                  onToggleDrop={toggleDropItem}
                />
              )}
            </Card>
          </>
        )}

        {/* No result yet */}
        {!result && !validationError && unmappedValues.length === 0 && (
          <Card className="p-12 text-center">
            <div className="w-12 h-12 rounded-xl bg-accent-50 flex items-center justify-center mx-auto mb-3">
              <Play className="w-6 h-6 text-accent-600" />
            </div>
            <p className="text-sm text-secondary-500">Click Analyse to compute {config.method === 'lawshe' ? 'Lawshe CVR' : 'Aiken\'s V'} for all item rows.</p>
          </Card>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────

function SummaryStat({ label, value, accent }: { label: string; value: string; accent?: 'success' | 'error' | 'warning' }) {
  const colors: Record<string, string> = {
    success: 'text-success-700 bg-success-50',
    error: 'text-error-700 bg-error-50',
    warning: 'text-warning-700 bg-warning-50',
  };
  return (
    <div className={`px-4 py-3 rounded-lg border border-secondary-200 ${accent ? colors[accent] : 'bg-white'}`}>
      <div className="text-xs font-medium text-secondary-500 mb-1">{label}</div>
      <div className="text-lg font-bold text-secondary-900">{value}</div>
    </div>
  );
}

function DecisionBadge({ decision }: { decision: string }) {
  const map: Record<string, { label: string; className: string }> = {
    accept: { label: 'Accept', className: 'bg-success-100 text-success-700 border-success-300' },
    reject: { label: 'Reject', className: 'bg-error-100 text-error-700 border-error-300' },
    'reject/refine': { label: 'Reject/Refine', className: 'bg-warning-100 text-warning-700 border-warning-300' },
    'n/a': { label: 'N/A', className: 'bg-secondary-100 text-secondary-500 border-secondary-300' },
  };
  const d = map[decision] ?? map['n/a'];
  return <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full border ${d.className}`}>{d.label}</span>;
}

function LawsheResultsTable({ items, droppedSet, onToggleDrop }: {
  items: LawsheItemResult[];
  droppedSet: Set<number>;
  onToggleDrop: (rowIndex: number) => void;
}) {
  return (
    <div className="overflow-auto max-h-[600px]">
      <table className="w-full text-sm border-collapse">
        <thead className="sticky top-0 bg-secondary-50 z-10">
          <tr>
            <th className="px-3 py-2 text-left font-medium text-secondary-500 text-xs uppercase tracking-wide border-b border-secondary-200">#</th>
            <th className="px-3 py-2 text-left font-medium text-secondary-500 text-xs uppercase tracking-wide border-b border-secondary-200">Item</th>
            <th className="px-3 py-2 text-right font-medium text-secondary-500 text-xs uppercase tracking-wide border-b border-secondary-200">n_e</th>
            <th className="px-3 py-2 text-right font-medium text-secondary-500 text-xs uppercase tracking-wide border-b border-secondary-200">N</th>
            <th className="px-3 py-2 text-right font-medium text-secondary-500 text-xs uppercase tracking-wide border-b border-secondary-200">CVR</th>
            <th className="px-3 py-2 text-right font-medium text-secondary-500 text-xs uppercase tracking-wide border-b border-secondary-200">CVR crit.</th>
            <th className="px-3 py-2 text-center font-medium text-secondary-500 text-xs uppercase tracking-wide border-b border-secondary-200">Decision</th>
            <th className="px-3 py-2 text-center font-medium text-secondary-500 text-xs uppercase tracking-wide border-b border-secondary-200">Drop</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-secondary-100">
          {items.map((item) => {
            const dropped = droppedSet.has(item.rowIndex);
            return (
              <tr key={item.rowIndex} className={dropped ? 'bg-error-50/50' : 'bg-white'}>
                <td className="px-3 py-2 text-secondary-400 font-mono text-xs">{item.rowIndex + 1}</td>
                <td className="px-3 py-2 text-secondary-900">
                  {item.itemLabel}
                  {item.dimensionLabel && (
                    <span className="ml-2 text-xs text-info-600">[{item.dimensionLabel}]</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right text-secondary-700 font-mono">{item.nEssential}</td>
                <td className="px-3 py-2 text-right text-secondary-700 font-mono">{item.nExperts}</td>
                <td className="px-3 py-2 text-right font-mono font-medium text-secondary-900">
                  {item.cvr != null ? item.cvr.toFixed(3) : '—'}
                </td>
                <td className="px-3 py-2 text-right font-mono text-secondary-500">
                  {item.cvrCritical != null ? item.cvrCritical.toFixed(3) : 'n/a'}
                </td>
                <td className="px-3 py-2 text-center"><DecisionBadge decision={item.decision} /></td>
                <td className="px-3 py-2 text-center">
                  <button onClick={() => onToggleDrop(item.rowIndex)}
                    className={`px-2 py-0.5 text-xs rounded-full transition-colors ${dropped ? 'bg-success-100 text-success-700 hover:bg-success-200' : 'bg-secondary-100 text-secondary-600 hover:bg-secondary-200'}`}>
                    {dropped ? 'Keep' : 'Drop'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AikenResultsTable({ items, droppedSet, onToggleDrop }: {
  items: AikenItemResult[];
  droppedSet: Set<number>;
  onToggleDrop: (rowIndex: number) => void;
}) {
  return (
    <div className="overflow-auto max-h-[600px]">
      <table className="w-full text-sm border-collapse">
        <thead className="sticky top-0 bg-secondary-50 z-10">
          <tr>
            <th className="px-3 py-2 text-left font-medium text-secondary-500 text-xs uppercase tracking-wide border-b border-secondary-200">#</th>
            <th className="px-3 py-2 text-left font-medium text-secondary-500 text-xs uppercase tracking-wide border-b border-secondary-200">Item</th>
            <th className="px-3 py-2 text-right font-medium text-secondary-500 text-xs uppercase tracking-wide border-b border-secondary-200">V</th>
            <th className="px-3 py-2 text-left font-medium text-secondary-500 text-xs uppercase tracking-wide border-b border-secondary-200">Band</th>
            <th className="px-3 py-2 text-right font-medium text-secondary-500 text-xs uppercase tracking-wide border-b border-secondary-200">V crit.</th>
            <th className="px-3 py-2 text-right font-medium text-secondary-500 text-xs uppercase tracking-wide border-b border-secondary-200">n</th>
            <th className="px-3 py-2 text-center font-medium text-secondary-500 text-xs uppercase tracking-wide border-b border-secondary-200">Decision</th>
            <th className="px-3 py-2 text-center font-medium text-secondary-500 text-xs uppercase tracking-wide border-b border-secondary-200">Drop</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-secondary-100">
          {items.map((item) => {
            const dropped = droppedSet.has(item.rowIndex);
            const bandColor: Record<string, string> = {
              'Weakly Valid': 'text-error-600',
              'Adequately Valid': 'text-warning-600',
              'Strongly Valid': 'text-success-600',
            };
            return (
              <tr key={item.rowIndex} className={dropped ? 'bg-error-50/50' : 'bg-white'}>
                <td className="px-3 py-2 text-secondary-400 font-mono text-xs">{item.rowIndex + 1}</td>
                <td className="px-3 py-2 text-secondary-900">
                  {item.itemLabel}
                  {item.dimensionLabel && (
                    <span className="ml-2 text-xs text-info-600">[{item.dimensionLabel}]</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right font-mono font-medium text-secondary-900">
                  {item.v != null ? item.v.toFixed(3) : '—'}
                </td>
                <td className="px-3 py-2">
                  <span className={`text-xs font-medium ${item.bandLabel ? bandColor[item.bandLabel] ?? '' : ''}`}>
                    {item.bandLabel ?? '—'}
                  </span>
                </td>
                <td className="px-3 py-2 text-right font-mono text-secondary-500">
                  {item.vCritical != null ? item.vCritical.toFixed(3) : 'n/a'}
                </td>
                <td className="px-3 py-2 text-right font-mono text-secondary-500">{item.n}</td>
                <td className="px-3 py-2 text-center"><DecisionBadge decision={item.decision} /></td>
                <td className="px-3 py-2 text-center">
                  <button onClick={() => onToggleDrop(item.rowIndex)}
                    className={`px-2 py-0.5 text-xs rounded-full transition-colors ${dropped ? 'bg-success-100 text-success-700 hover:bg-success-200' : 'bg-secondary-100 text-secondary-600 hover:bg-secondary-200'}`}>
                    {dropped ? 'Keep' : 'Drop'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
