// Analysis Dashboard — report-style psychometric results screen.
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart3, FileDown, ArrowLeft, AlertTriangle, Check, Info, Loader2,
  Activity, ScanLine, GitCompare, FileSpreadsheet,
} from 'lucide-react';
import {
  Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ScatterChart, Scatter, ReferenceLine, Legend, ComposedChart,
} from 'recharts';
import {
  supabase, Project, Dataset, SubscaleGroup, InterpretationBand,
  ResponseScale, DemographicColumn, ScoringResultDB,
} from '@/lib/supabase';
import { runFullAnalysis, FullAnalysis, SubscaleAnalysis } from '@/scientific/analysis';
import { SubscaleConfig, BandConfig } from '@/scientific/scoring';
import { NormalityTestResult } from '@/scientific/normalityTest';
import { DescriptiveStats } from '@/scientific/descriptives';
import { ReliabilityResult } from '@/scientific/reliability';
import { OutlierFlag, MahalanobisResult } from '@/scientific/outliers';
import { exportToCSV, exportToXLSX } from '@/lib/fileParser';
import { qnorm, pnorm } from '@/scientific/distributions';
import { Button, Card, StatusBadge, EmptyState } from './ui';

const fmt = (n: number | null | undefined): string =>
  n == null || isNaN(n as number) ? '—' : (n as number).toFixed(4);

const fmtP = (n: number | null | undefined): string => {
  if (n == null || isNaN(n as number)) return '—';
  const v = n as number;
  if (v < 0.0001) return v.toExponential(2);
  return v.toFixed(4);
};

function downloadBlob(content: string, fileName: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fileName;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function buildSubscaleConfigs(groups: SubscaleGroup[], scales: ResponseScale[]): SubscaleConfig[] {
  return groups.map((g) => {
    const scale = scales.find((s) => s.subscale_id === g.id);
    return {
      id: g.id, name: g.name,
      items: g.items.map((it) => ({ column: it.column, order: it.order, reverse: it.reverse })),
      scoringMethod: g.scoring_method,
      responseScale: {
        scaleType: scale?.scale_type ?? 'numeric',
        minValue: scale?.min_value ?? undefined,
        maxValue: scale?.max_value ?? undefined,
        labelMap: scale?.label_map?.map((l) => ({ label: l.label, value: l.value })) ?? undefined,
      },
    };
  });
}

function buildBands(bands: InterpretationBand[], groups: SubscaleGroup[]): Record<string, BandConfig[]> {
  const out: Record<string, BandConfig[]> = {};
  for (const g of groups) {
    const matched = bands
      .filter((b) => b.subscale_id === g.id)
      .sort((a, b) => a.display_order - b.display_order)
      .map((b) => ({ name: b.name, minScore: b.min_score, maxScore: b.max_score, color: b.color }));
    if (matched.length) out[g.name] = matched;
  }
  return out;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'no-dataset' }
  | { kind: 'no-scoring' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; dataset: Dataset; scoring: ScoringResultDB; analysis: FullAnalysis };

export function AnalysisScreen({
  project, onGoToConfig, highlightRowIndex, onClearHighlight,
}: {
  project: Project;
  onGoToConfig: (rowIndex?: number) => void;
  highlightRowIndex: number | null;
  onClearHighlight: () => void;
}) {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [activeDatasetId, setActiveDatasetId] = useState<string | null>(null);
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  // Load datasets for this project
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('datasets').select('*').eq('project_id', project.id).order('created_at', { ascending: true });
      const dsList = (data || []) as Dataset[];
      setDatasets(dsList);
      if (dsList.length > 0 && !activeDatasetId) setActiveDatasetId(dsList[0].id);
      if (dsList.length === 0) setState({ kind: 'no-dataset' });
    })();
  }, [project.id, activeDatasetId]);

  const load = useCallback(async () => {
    if (!activeDatasetId) return;
    setState({ kind: 'loading' });
    try {
      const { data: ds, error: dsErr } = await supabase
        .from('datasets').select('*').eq('id', activeDatasetId).maybeSingle();
      if (dsErr) throw dsErr;
      if (!ds) { setState({ kind: 'no-dataset' }); return; }
      const dataset = ds as Dataset;

      const { data: sc, error: scErr } = await supabase
        .from('scoring_results').select('*').eq('dataset_id', activeDatasetId)
        .order('version', { ascending: false }).limit(1).maybeSingle();
      if (scErr) throw scErr;
      if (!sc) { setState({ kind: 'no-scoring' }); return; }
      const scoring = sc as ScoringResultDB;

      const [gRes, rsRes, bRes, dcRes] = await Promise.all([
        supabase.from('subscale_groups').select('*').eq('dataset_id', activeDatasetId),
        supabase.from('response_scales').select('*').eq('dataset_id', activeDatasetId),
        supabase.from('interpretation_bands').select('*').eq('dataset_id', activeDatasetId),
        supabase.from('demographic_columns').select('*').eq('dataset_id', activeDatasetId),
      ]);
      if (gRes.error) throw gRes.error;
      if (rsRes.error) throw rsRes.error;
      if (bRes.error) throw bRes.error;
      if (dcRes.error) throw dcRes.error;

      const groups = (gRes.data ?? []) as SubscaleGroup[];
      const scales = (rsRes.data ?? []) as ResponseScale[];
      const bands = (bRes.data ?? []) as InterpretationBand[];
      const demoCols = ((dcRes.data ?? []) as DemographicColumn[]).map((d) => d.column_name);

      const subscaleConfigs = buildSubscaleConfigs(groups, scales);
      const bandConfigs = buildBands(bands, groups);

      const excluded = (scoring.excluded_rows ?? []) as number[];
      const { analysis } = runFullAnalysis(
        dataset.rows, dataset.headers,
        subscaleConfigs, bandConfigs, excluded, demoCols,
      );
      setState({ kind: 'ready', dataset, scoring, analysis });
    } catch (e) {
      setState({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }, [activeDatasetId]);

  useEffect(() => { if (activeDatasetId) void load(); }, [load, activeDatasetId]);

  if (state.kind === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Loader2 className="w-8 h-8 text-primary-600 animate-spin mb-3" />
        <p className="text-sm text-secondary-500">Running analysis…</p>
      </div>
    );
  }

  if (state.kind === 'no-dataset') {
    return (
      <EmptyState icon={BarChart3} title="No data imported" description="Import a dataset for this project before running analysis."
        action={<Button onClick={() => onGoToConfig()}>Back to Configuration</Button>} />
    );
  }

  if (state.kind === 'no-scoring') {
    return (
      <div className="p-6">
        {datasets.length > 1 && <SheetSelector datasets={datasets} activeDatasetId={activeDatasetId} onSelect={setActiveDatasetId} />}
        <EmptyState icon={Activity} title="No scored data yet" description="Run the scoring engine in the Configuration screen to generate scored data for analysis."
          action={<Button onClick={() => onGoToConfig()}>Back to Configuration</Button>} />
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <EmptyState icon={AlertTriangle} title="Analysis failed" description={state.message}
        action={<Button onClick={() => onGoToConfig()}>Back to Configuration</Button>} />
    );
  }

  const { dataset, scoring, analysis } = state;
  const sheetLabel = dataset.sheet_name || dataset.file_name;

  const exportCSV = () => exportToCSV(scoring.headers, scoring.rows, `${project.name}_${sheetLabel}_scored.csv`);
  const exportXLSX = () => exportToXLSX(scoring.headers, scoring.rows, `${project.name}_${sheetLabel}_scored.xlsx`);
  const exportHTML = () => downloadBlob(buildHTMLReport(project.name, analysis), `${project.name}_${sheetLabel}_analysis_report.html`, 'text/html');

  return (
    <div className="space-y-4">
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-4">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="outline" size="sm" onClick={() => onGoToConfig()}>
            <ArrowLeft className="w-4 h-4" /> Configuration
          </Button>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-secondary-900 truncate">{project.name}</h1>
            <p className="text-xs text-secondary-500">
              N={analysis.overallN} · included {analysis.includedN} · excluded {analysis.excludedN}
              {analysis.usedAutoScale ? ' · auto-scale' : ` · ${analysis.subscales.length} subscale${analysis.subscales.length === 1 ? '' : 's'}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV}><FileDown className="w-4 h-4" /> CSV</Button>
          <Button variant="outline" size="sm" onClick={exportXLSX}><FileDown className="w-4 h-4" /> XLSX</Button>
          <Button variant="primary" size="sm" onClick={exportHTML}><FileDown className="w-4 h-4" /> HTML Report</Button>
        </div>
      </div>

      {/* sheet selector */}
      {datasets.length > 1 && (
        <div className="px-6">
          <SheetSelector datasets={datasets} activeDatasetId={activeDatasetId} onSelect={(id) => { setActiveDatasetId(id); }} />
        </div>
      )}

      {/* per-subscale sections */}
      <div className="px-6 space-y-6 pb-6">
        {analysis.subscales.map((sub, i) => (
          <SubscaleSection key={sub.subscaleName + i} sub={sub} index={i}
            highlightRowIndex={highlightRowIndex} onGoToConfig={onGoToConfig} onClearHighlight={onClearHighlight} />
        ))}
        <MultivariateSection mv={analysis.multivariateOutliers} onGoToConfig={onGoToConfig} />
      </div>
    </div>
  );
}

function SheetSelector({ datasets, activeDatasetId, onSelect }: {
  datasets: Dataset[]; activeDatasetId: string | null; onSelect: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-1 py-2 overflow-x-auto">
      {datasets.map((ds) => (
        <button key={ds.id} onClick={() => onSelect(ds.id)}
          className={`flex items-center gap-1.5 px-3 py-1 text-sm rounded-md whitespace-nowrap transition-colors ${activeDatasetId === ds.id ? 'bg-primary-100 text-primary-700 border border-primary-300' : 'text-secondary-600 hover:bg-secondary-100 border border-transparent'}`}>
          <FileSpreadsheet className="w-3.5 h-3.5" />
          {ds.sheet_name || ds.file_name}
        </button>
      ))}
    </div>
  );
}

function SubscaleSection({ sub, index, highlightRowIndex, onGoToConfig, onClearHighlight }: {
  sub: SubscaleAnalysis; index: number; highlightRowIndex: number | null;
  onGoToConfig: (rowIndex?: number) => void; onClearHighlight: () => void;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="px-5 py-4 border-b border-secondary-200 bg-secondary-50">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-primary-600" />
          <h2 className="text-base font-semibold text-secondary-900">{index + 1}. {sub.subscaleName}</h2>
          <span className="text-xs text-secondary-500">({sub.scoreValues.length} valid scores)</span>
        </div>
      </div>
      <div className="p-5 space-y-6">
        <DescriptivesTable d={sub.descriptives} />
        <NormalityPanel n={sub.normality} />
        <ChartsPanel sub={sub} />
        <OutliersPanel sub={sub} highlightRowIndex={highlightRowIndex} onGoToConfig={onGoToConfig} onClearHighlight={onClearHighlight} />
        <ReliabilityPanel r={sub.reliability} />
      </div>
    </Card>
  );
}

function DescriptivesTable({ d }: { d: DescriptiveStats }) {
  const rows: [string, string][] = [
    ['N', fmt(d.n)], ['Valid N', fmt(d.validN)], ['Missing', fmt(d.missing)],
    ['Mean', fmt(d.mean)], ['Std. Deviation', fmt(d.sd)], ['Variance', fmt(d.variance)],
    ['Std. Error', fmt(d.se)], ['Minimum', fmt(d.min)], ['Maximum', fmt(d.max)],
    ['Range', fmt(d.range)], ['Median', fmt(d.median)], ['Mode', fmt(d.mode)],
    ['Sum', fmt(d.sum)], ['Skewness', fmt(d.skewness)], ['Kurtosis', fmt(d.kurtosis)],
    ['Q1 (25%)', fmt(d.q1)], ['Q3 (75%)', fmt(d.q3)], ['IQR', fmt(d.iqr)],
    ['95% CI Lower', fmt(d.ci95Lower)], ['95% CI Upper', fmt(d.ci95Upper)],
  ];
  return (
    <div>
      <SectionTitle icon={Activity}>Descriptive Statistics</SectionTitle>
      <div className="overflow-hidden rounded-lg border border-secondary-200">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-secondary-100">
            {rows.map(([k, v], i) => (
              <tr key={k} className={i % 2 ? 'bg-secondary-50/50' : 'bg-white'}>
                <td className="px-4 py-1.5 text-secondary-600 w-1/2">{k}</td>
                <td className="px-4 py-1.5 font-mono text-secondary-900 text-right">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function NormalityPanel({ n }: { n: NormalityTestResult }) {
  const verdict = (
    <StatusBadge status={n.isNormal ? 'success' : 'warning'}>
      {n.isNormal ? <><Check className="w-3 h-3" /> Normal</> : <><AlertTriangle className="w-3 h-3" /> Non-normal</>}
    </StatusBadge>
  );
  const testRows: { name: string; stat: number | null; p: number | null }[] = [];
  if (n.shapiroWilk) testRows.push({ name: 'Shapiro-Wilk', stat: n.shapiroWilk.W, p: n.shapiroWilk.pValue });
  if (n.lilliefors) testRows.push({ name: 'Lilliefors (KS)', stat: n.lilliefors.D, p: n.lilliefors.pValue });
  if (n.kolmogorovSmirnov) testRows.push({ name: 'Kolmogorov-Smirnov', stat: n.kolmogorovSmirnov.D, p: n.kolmogorovSmirnov.pValue });
  return (
    <div className="space-y-3">
      <SectionTitle icon={GitCompare}>Normality Testing</SectionTitle>
      <div className="flex flex-wrap items-start gap-3 text-sm">
        <div className="flex-1 min-w-[220px] rounded-lg bg-info-50 border border-info-200 p-3">
          <div className="flex items-center gap-1.5 text-info-700 font-medium mb-1"><Info className="w-4 h-4" /> Test selection</div>
          <p className="text-info-800 text-xs leading-relaxed">{n.primaryReason}</p>
        </div>
        <div className="flex items-center gap-2"><span className="text-xs text-secondary-500">Verdict (α={n.alpha}):</span>{verdict}</div>
      </div>
      {testRows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-secondary-200">
          <table className="w-full text-sm">
            <thead className="bg-secondary-50 text-secondary-600"><tr><Th>Test</Th><Th>Statistic</Th><Th>p-value</Th><Th>α=0.05</Th></tr></thead>
            <tbody className="divide-y divide-secondary-100">
              {testRows.map((t) => { const isNormal = (t.p ?? NaN) > n.alpha; return (
                <tr key={t.name}>
                  <Td className="font-medium">{t.name}</Td><Td className="font-mono text-right">{fmt(t.stat)}</Td>
                  <Td className="font-mono text-right">{fmtP(t.p)}</Td>
                  <Td><StatusBadge status={isNormal ? 'success' : 'warning'}>{isNormal ? 'Normal' : 'Non-normal'}</StatusBadge></Td>
                </tr>
              ); })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-secondary-600 italic leading-relaxed">{n.recommendation}</p>
    </div>
  );
}

function ChartsPanel({ sub }: { sub: SubscaleAnalysis }) {
  const histData = useMemo(() => buildHistogramData(sub.scoreValues), [sub]);
  const qq = useMemo(() => buildQQData(sub.scoreValues), [sub]);
  const pp = useMemo(() => buildPPData(sub.scoreValues), [sub]);
  return (
    <div className="space-y-4">
      <SectionTitle icon={BarChart3}>Distribution Charts</SectionTitle>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-lg border border-secondary-200 p-3">
          <p className="text-xs font-medium text-secondary-600 mb-2">Histogram with Normal Overlay</p>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={histData} margin={{ top: 5, right: 10, bottom: 20, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={50} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10 }} /><Tooltip /><Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="count" name="Frequency" fill="#0d9488" opacity={0.6} />
              <Line dataKey="expected" name="Normal" type="monotone" stroke="#d97706" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="rounded-lg border border-secondary-200 p-3">
          <p className="text-xs font-medium text-secondary-600 mb-2">Q-Q Plot</p>
          <ResponsiveContainer width="100%" height={220}>
            <ScatterChart margin={{ top: 5, right: 10, bottom: 20, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
              <XAxis dataKey="theoretical" name="Theoretical" type="number" tick={{ fontSize: 10 }} domain={['auto', 'auto']} />
              <YAxis dataKey="sample" name="Sample" type="number" tick={{ fontSize: 10 }} domain={['auto', 'auto']} />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} />
              <ReferenceLine segment={[{ x: qq.minT, y: qq.minS }, { x: qq.maxT, y: qq.maxS }]} stroke="#dc2626" strokeDasharray="5 5" ifOverflow="extendDomain" />
              <Scatter data={qq.data} fill="#0d9488" />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
        <div className="rounded-lg border border-secondary-200 p-3">
          <p className="text-xs font-medium text-secondary-600 mb-2">P-P Plot</p>
          <ResponsiveContainer width="100%" height={220}>
            <ScatterChart margin={{ top: 5, right: 10, bottom: 20, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
              <XAxis dataKey="theoretical" name="Theoretical CDF" type="number" domain={[0, 1]} tick={{ fontSize: 10 }} />
              <YAxis dataKey="empirical" name="Empirical CDF" type="number" domain={[0, 1]} tick={{ fontSize: 10 }} />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} />
              <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 1, y: 1 }]} stroke="#dc2626" strokeDasharray="5 5" />
              <Scatter data={pp} fill="#0d9488" />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function buildHistogramData(values: number[]): { label: string; count: number; expected: number }[] {
  const v = values.filter((x) => x != null && !isNaN(x));
  if (v.length < 2) return [];
  const n = v.length, min = Math.min(...v), max = Math.max(...v);
  const bins = Math.min(15, Math.max(5, Math.ceil(Math.sqrt(n))));
  const width = (max - min) / bins || 1;
  const m = v.reduce((s, x) => s + x, 0) / n;
  const s = Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (n - 1)) || 1;
  const data: { label: string; count: number; expected: number }[] = [];
  for (let i = 0; i < bins; i++) {
    const left = min + i * width; const right = i === bins - 1 ? max : min + (i + 1) * width;
    const count = v.filter((x) => x >= left && (x < right || (i === bins - 1 && x <= right))).length;
    const expected = (pnorm(right, m, s) - pnorm(left, m, s)) * n;
    data.push({ label: left.toFixed(1), count, expected });
  }
  return data;
}

function buildQQData(values: number[]) {
  const sorted = values.filter((x) => x != null && !isNaN(x)).sort((a, b) => a - b);
  const n = sorted.length;
  if (n < 2) return { data: [] as { theoretical: number; sample: number }[], minT: 0, minS: 0, maxT: 1, maxS: 1 };
  const data = sorted.map((x, i) => ({ theoretical: qnorm((i + 0.5) / n), sample: x }));
  return { data, minT: data[0].theoretical, maxT: data[n - 1].theoretical, minS: data[0].sample, maxS: data[n - 1].sample };
}

function buildPPData(values: number[]) {
  const sorted = values.filter((x) => x != null && !isNaN(x)).sort((a, b) => a - b);
  const n = sorted.length;
  if (n < 2) return [] as { theoretical: number; empirical: number }[];
  const m = sorted.reduce((s, x) => s + x, 0) / n;
  const s = Math.sqrt(sorted.reduce((sum, x) => sum + (x - m) ** 2, 0) / (n - 1)) || 1;
  return sorted.map((x, i) => ({ empirical: (i + 1) / n, theoretical: pnorm(x, m, s) }));
}

function OutliersPanel({ sub, highlightRowIndex, onGoToConfig, onClearHighlight }: {
  sub: SubscaleAnalysis; highlightRowIndex: number | null;
  onGoToConfig: (rowIndex?: number) => void; onClearHighlight: () => void;
}) {
  return (
    <div className="space-y-4">
      <SectionTitle icon={ScanLine}>Outlier Analysis</SectionTitle>
      <OutlierTable title="IQR Method" flags={sub.outliers.iqr.flags} highlightRowIndex={highlightRowIndex} onGoToConfig={onGoToConfig} onClearHighlight={onClearHighlight} />
      <OutlierTable title="Z-Score Method" flags={sub.outliers.zscore.flags} highlightRowIndex={highlightRowIndex} onGoToConfig={onGoToConfig} onClearHighlight={onClearHighlight} />
      <OutlierTable title="MAD (Modified Z-Score)" flags={sub.outliers.mad.flags} highlightRowIndex={highlightRowIndex} onGoToConfig={onGoToConfig} onClearHighlight={onClearHighlight} />
    </div>
  );
}

function OutlierTable({ title, flags, highlightRowIndex, onGoToConfig, onClearHighlight }: {
  title: string; flags: OutlierFlag[]; highlightRowIndex: number | null;
  onGoToConfig: (rowIndex?: number) => void; onClearHighlight: () => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-xs font-medium text-secondary-600">{title}</p>
        {highlightRowIndex != null && <button onClick={onClearHighlight} className="text-xs text-primary-600 hover:underline">Clear highlight</button>}
      </div>
      {flags.length === 0 ? (
        <p className="text-xs text-secondary-400 italic px-3 py-2 rounded bg-secondary-50 border border-secondary-200">No outliers detected.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-secondary-200">
          <table className="w-full text-sm">
            <thead className="bg-secondary-50 text-secondary-600"><tr><Th>Row #</Th><Th>Severity</Th><Th>Detail</Th><Th> </Th></tr></thead>
            <tbody className="divide-y divide-secondary-100">
              {flags.map((f, i) => { const active = highlightRowIndex === f.rowIndex; return (
                <tr key={i} className={active ? 'bg-accent-100' : i % 2 ? 'bg-secondary-50/40' : 'bg-white'}>
                  <Td className="font-mono">{f.rowIndex + 1}</Td>
                  <Td><StatusBadge status={f.severity === 'extreme' ? 'error' : 'warning'}>{f.severity}</StatusBadge></Td>
                  <Td className="font-mono text-xs text-secondary-700">{f.detail}</Td>
                  <Td><Button size="sm" variant="ghost" onClick={() => onGoToConfig(f.rowIndex)}>View in Data</Button></Td>
                </tr>
              ); })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ReliabilityPanel({ r }: { r: ReliabilityResult }) {
  const summary: [string, string][] = [
    ['Cronbach\'s α', fmt(r.alpha)], ['Standardized α', fmt(r.standardizedAlpha)],
    ['N Items', fmt(r.nItems)], ['N Cases', fmt(r.nCases)],
    ['Scale Mean', fmt(r.mean)], ['Scale SD', fmt(r.sd)],
  ];
  return (
    <div className="space-y-3">
      <SectionTitle icon={Activity}>Reliability — Cronbach\'s Alpha</SectionTitle>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {summary.map(([k, v]) => (
          <div key={k} className="rounded-lg border border-secondary-200 px-3 py-2 bg-white">
            <p className="text-[11px] text-secondary-500">{k}</p>
            <p className="font-mono text-sm text-secondary-900">{v}</p>
          </div>
        ))}
      </div>
      {r.itemStats.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-secondary-200">
          <table className="w-full text-sm">
            <thead className="bg-secondary-50 text-secondary-600"><tr><Th>Item</Th><Th>N</Th><Th>Mean</Th><Th>SD</Th><Th>r.drop</Th><Th>α if deleted</Th></tr></thead>
            <tbody className="divide-y divide-secondary-100">
              {r.itemStats.map((it, i) => (
                <tr key={it.itemName + i} className={i % 2 ? 'bg-secondary-50/40' : 'bg-white'}>
                  <Td className="font-medium">{it.itemName}</Td><Td className="font-mono text-right">{fmt(it.n)}</Td>
                  <Td className="font-mono text-right">{fmt(it.itemMean)}</Td><Td className="font-mono text-right">{fmt(it.itemSd)}</Td>
                  <Td className="font-mono text-right">{fmt(it.dropR)}</Td><Td className="font-mono text-right">{fmt(it.alphaIfDeleted)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="text-xs text-secondary-400 italic">Insufficient items or cases for item-level reliability.</p>}
    </div>
  );
}

function MultivariateSection({ mv, onGoToConfig }: { mv: MahalanobisResult; onGoToConfig: (rowIndex?: number) => void; }) {
  const flagged = mv.flaggedIndices.map((idx) => ({ idx, d: mv.distances[idx], p: mv.pValues[idx] }));
  return (
    <Card className="overflow-hidden">
      <div className="px-5 py-4 border-b border-secondary-200 bg-secondary-50 flex items-center gap-2">
        <ScanLine className="w-5 h-5 text-primary-600" />
        <h2 className="text-base font-semibold text-secondary-900">Multivariate Outliers — Mahalanobis Distance</h2>
      </div>
      <div className="p-5 space-y-3">
        <p className="text-xs text-secondary-600">{mv.method}. {flagged.length} row{flagged.length === 1 ? '' : 's'} flagged (p &lt; 0.001).</p>
        {flagged.length === 0 ? (
          <p className="text-xs text-secondary-400 italic px-3 py-2 rounded bg-secondary-50 border border-secondary-200">No multivariate outliers detected.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-secondary-200">
            <table className="w-full text-sm">
              <thead className="bg-secondary-50 text-secondary-600"><tr><Th>Row #</Th><Th>Distance</Th><Th>p-value</Th><Th> </Th></tr></thead>
              <tbody className="divide-y divide-secondary-100">
                {flagged.map((f, i) => (
                  <tr key={i} className={i % 2 ? 'bg-secondary-50/40' : 'bg-white'}>
                    <Td className="font-mono">{f.idx + 1}</Td><Td className="font-mono text-right">{fmt(f.d)}</Td>
                    <Td className="font-mono text-right">{fmtP(f.p)}</Td>
                    <Td><Button size="sm" variant="ghost" onClick={() => onGoToConfig(f.idx)}>View in Data</Button></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Card>
  );
}

function SectionTitle({ icon: Icon, children }: { icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return <div className="flex items-center gap-1.5 text-sm font-semibold text-secondary-800"><Icon className="w-4 h-4 text-primary-600" /> {children}</div>;
}
function Th({ children }: { children: React.ReactNode }) { return <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide">{children}</th>; }
function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) { return <td className={`px-3 py-1.5 ${className}`}>{children}</td>; }

function buildHTMLReport(projectName: string, analysis: FullAnalysis): string {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
  const f = (n: number | null | undefined) => (n == null || isNaN(n as number) ? '—' : (n as number).toFixed(4));
  const fp = (n: number | null | undefined) => (n == null || isNaN(n as number) ? '—' : (n as number) < 0.0001 ? (n as number).toExponential(2) : (n as number).toFixed(4));
  const descRows = (d: DescriptiveStats) => `
    <tr><td>N</td><td>${f(d.n)}</td></tr><tr><td>Valid N</td><td>${f(d.validN)}</td></tr>
    <tr><td>Missing</td><td>${f(d.missing)}</td></tr><tr><td>Mean</td><td>${f(d.mean)}</td></tr>
    <tr><td>Std. Deviation</td><td>${f(d.sd)}</td></tr><tr><td>Variance</td><td>${f(d.variance)}</td></tr>
    <tr><td>Std. Error</td><td>${f(d.se)}</td></tr><tr><td>Minimum</td><td>${f(d.min)}</td></tr>
    <tr><td>Maximum</td><td>${f(d.max)}</td></tr><tr><td>Range</td><td>${f(d.range)}</td></tr>
    <tr><td>Median</td><td>${f(d.median)}</td></tr><tr><td>Mode</td><td>${f(d.mode)}</td></tr>
    <tr><td>Sum</td><td>${f(d.sum)}</td></tr><tr><td>Skewness</td><td>${f(d.skewness)}</td></tr>
    <tr><td>Kurtosis</td><td>${f(d.kurtosis)}</td></tr><tr><td>Q1</td><td>${f(d.q1)}</td></tr>
    <tr><td>Q3</td><td>${f(d.q3)}</td></tr><tr><td>IQR</td><td>${f(d.iqr)}</td></tr>
    <tr><td>95% CI Lower</td><td>${f(d.ci95Lower)}</td></tr><tr><td>95% CI Upper</td><td>${f(d.ci95Upper)}</td></tr>`;
  const normalityRows = (n: NormalityTestResult) => {
    const rows: string[] = [];
    if (n.shapiroWilk) rows.push(`<tr><td>Shapiro-Wilk</td><td>W = ${f(n.shapiroWilk.W)}</td><td>${fp(n.shapiroWilk.pValue)}</td><td>${n.shapiroWilk.pValue > n.alpha ? 'Normal' : 'Non-normal'}</td></tr>`);
    if (n.lilliefors) rows.push(`<tr><td>Lilliefors (KS)</td><td>D = ${f(n.lilliefors.D)}</td><td>${fp(n.lilliefors.pValue)}</td><td>${n.lilliefors.pValue > n.alpha ? 'Normal' : 'Non-normal'}</td></tr>`);
    if (n.kolmogorovSmirnov) rows.push(`<tr><td>Kolmogorov-Smirnov</td><td>D = ${f(n.kolmogorovSmirnov.D)}</td><td>${fp(n.kolmogorovSmirnov.pValue)}</td><td>${n.kolmogorovSmirnov.pValue > n.alpha ? 'Normal' : 'Non-normal'}</td></tr>`);
    return rows.join('\n');
  };
  const outlierRows = (flags: OutlierFlag[]) => flags.length === 0 ? '<tr><td colspan="3" style="color:#888;font-style:italic">No outliers detected.</td></tr>' : flags.map((fl) => `<tr><td>${fl.rowIndex + 1}</td><td>${fl.severity}</td><td>${esc(fl.detail)}</td></tr>`).join('\n');
  const itemRows = (r: ReliabilityResult) => r.itemStats.length === 0 ? '<tr><td colspan="6" style="color:#888;font-style:italic">Insufficient data for item-level reliability.</td></tr>' : r.itemStats.map((it) => `<tr><td>${esc(it.itemName)}</td><td>${f(it.n)}</td><td>${f(it.itemMean)}</td><td>${f(it.itemSd)}</td><td>${f(it.dropR)}</td><td>${f(it.alphaIfDeleted)}</td></tr>`).join('\n');
  const mvRows = (mv: MahalanobisResult) => mv.flaggedIndices.length === 0 ? '<tr><td colspan="3" style="color:#888;font-style:italic">No multivariate outliers detected.</td></tr>' : mv.flaggedIndices.map((idx) => `<tr><td>${idx + 1}</td><td>${f(mv.distances[idx])}</td><td>${fp(mv.pValues[idx])}</td></tr>`).join('\n');
  const subscaleBlocks = analysis.subscales.map((s, i) => `
    <section class="subscale">
      <h2>${i + 1}. ${esc(s.subscaleName)}</h2>
      <h3>Descriptive Statistics</h3><table><tbody>${descRows(s.descriptives)}</tbody></table>
      <h3>Normality Testing</h3><p class="reason">${esc(s.normality.primaryReason)}</p>
      <table><thead><tr><th>Test</th><th>Statistic</th><th>p-value</th><th>Verdict (α=0.05)</th></tr></thead><tbody>${normalityRows(s.normality)}</tbody></table>
      <p class="reason"><em>${esc(s.normality.recommendation)}</em></p>
      <h3>Outliers — IQR</h3><table><thead><tr><th>Row #</th><th>Severity</th><th>Detail</th></tr></thead><tbody>${outlierRows(s.outliers.iqr.flags)}</tbody></table>
      <h3>Outliers — Z-Score</h3><table><thead><tr><th>Row #</th><th>Severity</th><th>Detail</th></tr></thead><tbody>${outlierRows(s.outliers.zscore.flags)}</tbody></table>
      <h3>Outliers — MAD</h3><table><thead><tr><th>Row #</th><th>Severity</th><th>Detail</th></tr></thead><tbody>${outlierRows(s.outliers.mad.flags)}</tbody></table>
      <h3>Reliability — Cronbach's Alpha</h3>
      <table class="summary"><tbody>
        <tr><td>Cronbach's α</td><td>${f(s.reliability.alpha)}</td><td>N Items</td><td>${f(s.reliability.nItems)}</td></tr>
        <tr><td>Standardized α</td><td>${f(s.reliability.standardizedAlpha)}</td><td>N Cases</td><td>${f(s.reliability.nCases)}</td></tr>
        <tr><td>Scale Mean</td><td>${f(s.reliability.mean)}</td><td>Scale SD</td><td>${f(s.reliability.sd)}</td></tr>
      </tbody></table>
      <table><thead><tr><th>Item</th><th>N</th><th>Mean</th><th>SD</th><th>r.drop</th><th>α if deleted</th></tr></thead><tbody>${itemRows(s.reliability)}</tbody></table>
    </section>`).join('\n');
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(projectName)} — Analysis Report</title>
<style>
  *{box-sizing:border-box} body{font-family:'Inter',Arial,sans-serif;color:#1c1917;margin:32px;line:1.5}
  h1{color:#0f766e;border-bottom:2px solid #0d9488;padding-bottom:8px}
  h2{color:#134e4a;margin-top:32px;border-left:4px solid #14b8a6;padding-left:10px}
  h3{color:#0f766e;margin-top:20px;font-size:14px}
  table{border-collapse:collapse;width:100%;margin:8px 0 16px;font-size:12px}
  th,td{border:1px solid #d6d3d1;padding:5px 8px;text-align:left}
  th{background:#f5f5f4} tr:nth-child(even){background:#fafaf9}
  td:nth-child(n+2),th:nth-child(n+2){text-align:right;font-family:'JetBrains Mono',monospace}
  .meta{color:#78716c;font-size:12px;margin-bottom:24px}
  .reason{font-size:12px;color:#44403c;margin:6px 0}
  .summary td:nth-child(odd){font-weight:600;background:#f0fdfa}
  .subscale{page-break-inside:avoid;margin-bottom:24px}
  @media print{body{margin:12mm} .subscale{page-break-inside:avoid}}
</style></head><body>
<h1>${esc(projectName)} — Analysis Report</h1>
<p class="meta">Generated ${new Date().toLocaleString()} · N=${analysis.overallN} · Included ${analysis.includedN} · Excluded ${analysis.excludedN}${analysis.usedAutoScale ? ' · Auto-scale' : ''}</p>
${subscaleBlocks}
<h2>Multivariate Outliers — Mahalanobis Distance</h2>
<p class="reason">${esc(analysis.multivariateOutliers.method)} · ${analysis.multivariateOutliers.flaggedIndices.length} flagged (p &lt; 0.001)</p>
<table><thead><tr><th>Row #</th><th>Distance</th><th>p-value</th></tr></thead><tbody>${mvRows(analysis.multivariateOutliers)}</tbody></table>
</body></html>`;
}
