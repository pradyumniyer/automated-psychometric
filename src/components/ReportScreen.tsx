import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, Download, FileText, Loader2 } from 'lucide-react';
import { Button, Card } from './ui';
import type { Project } from '@/types/domain';
import {
  datasetRepository,
  surveyConfigRepository,
  scoreRepository,
} from '@/storage/repositories';
import { buildMethodsReport, reportFilename } from '@/lib/reportFromProvenance';

type Props = {
  project: Project;
  excludedRows: Record<string, Set<number>>;
  sharedDatasetId: string | null;
  onDatasetChange: (id: string) => void;
};

function demoNames(cfg: Record<string, unknown>): string[] {
  const raw = cfg.demographic_columns;
  if (!Array.isArray(raw)) return [];
  return raw.map((d) => {
    if (typeof d === 'string') return d;
    if (d && typeof d === 'object' && 'column' in d) return String((d as { column: string }).column);
    if (d && typeof d === 'object' && 'name' in d) return String((d as { name: string }).name);
    return String(d);
  }).filter(Boolean);
}

function scaleListFromConfig(cfg: Record<string, unknown>): {
  name: string;
  itemColumns: string[];
  reversedColumns: string[];
  scoreType?: string;
}[] {
  const raw = (cfg.subscales as unknown[]) ?? [];
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    const s = entry as {
      name?: string;
      items?: { column?: string; reversed?: boolean }[];
      score_type?: string;
      scoreType?: string;
    };
    const items = Array.isArray(s.items) ? s.items : [];
    return {
      name: s.name || 'Scale',
      itemColumns: items.map((i) => i.column || '').filter(Boolean),
      reversedColumns: items.filter((i) => i.reversed).map((i) => i.column || '').filter(Boolean),
      scoreType: s.score_type || s.scoreType,
    };
  });
}

export function ReportScreen({
  project,
  excludedRows,
  sharedDatasetId,
  onDatasetChange,
}: Props) {
  const [datasetId, setDatasetId] = useState<string | null>(sharedDatasetId);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reportText, setReportText] = useState('');
  const [sheetName, setSheetName] = useState('');
  const [copyFlash, setCopyFlash] = useState(false);

  const datasets = (project as { datasets?: { id: string; name?: string; sheet_name?: string }[] }).datasets
    ?? [];

  useEffect(() => {
    if (sharedDatasetId) setDatasetId(sharedDatasetId);
  }, [sharedDatasetId]);

  const load = useCallback(async () => {
    if (!datasetId) {
      setLoading(false);
      setReportText('');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const dataset = await datasetRepository.get(datasetId);
      if (!dataset) {
        setError('Sheet not found.');
        setReportText('');
        return;
      }
      const ds = dataset as {
        name?: string;
        sheet_name?: string;
        rows?: unknown[];
        import_meta?: { file_name?: string };
        source_file_name?: string;
        original_filename?: string;
      };
      const name = ds.name || ds.sheet_name || 'Sheet';
      setSheetName(name);

      const configRec = await surveyConfigRepository.get(datasetId);
      const cfg = (configRec ?? {}) as Record<string, unknown>;

      const excluded = excludedRows[datasetId] ?? new Set<number>();
      const prorationEnabled = cfg.proration_enabled === true;
      const prorationMaxMissingPct =
        cfg.proration_max_missing_pct === 25 || cfg.proration_max_missing_pct === 50
          ? (cfg.proration_max_missing_pct as 25 | 50)
          : 20;

      let scored = false;
      let scoredRowCount: number | undefined;
      let proratedScoreCount: number | undefined;
      let scoreColumnNames: string[] | undefined;

      try {
        const latest = await scoreRepository.getLatest(datasetId);
        const payload = (latest?.payload ?? null) as null | {
          rows?: unknown[];
          scaleScores?: Record<string, Record<string, { prorated?: boolean }>>;
          scoreColumns?: string[];
        };
        if (payload) {
          scored = true;
          scoredRowCount = payload.rows?.length;
          scoreColumnNames = payload.scoreColumns;
          if (payload.scaleScores) {
            proratedScoreCount = Object.values(payload.scaleScores).reduce((n, byRow) => (
              n + Object.values(byRow).filter((d) => d?.prorated).length
            ), 0);
          }
        }
      } catch {
        // score cache optional
      }

      const text = buildMethodsReport({
        projectName: project.name,
        sheetName: name,
        sourceFileName: ds.import_meta?.file_name ?? ds.source_file_name ?? ds.original_filename ?? null,
        rowCount: ds.rows?.length ?? 0,
        excludedCount: excluded.size,
        demographics: demoNames(cfg),
        scales: scaleListFromConfig(cfg),
        prorationEnabled,
        prorationMaxMissingPct,
        scored,
        scoredRowCount,
        proratedScoreCount,
        scoreColumnNames,
      });
      setReportText(text);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not build report');
      setReportText('');
    } finally {
      setLoading(false);
    }
  }, [datasetId, excludedRows, project.name]);

  useEffect(() => {
    void load();
  }, [load]);

  const filename = useMemo(
    () => reportFilename(project.name, sheetName || 'sheet'),
    [project.name, sheetName],
  );

  const copy = async () => {
    if (!reportText) return;
    try {
      await navigator.clipboard.writeText(reportText);
      setCopyFlash(true);
      window.setTimeout(() => setCopyFlash(false), 1500);
    } catch {
      setError('Clipboard blocked by the browser');
    }
  };

  const download = () => {
    if (!reportText) return;
    const blob = new Blob([reportText], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-1 overflow-auto p-4 md:p-6">
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-lg font-semibold text-secondary-900 flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary-600" />
              Report
            </h1>
            <p className="text-xs text-secondary-500 mt-0.5">
              Methods-style summary from this sheet’s configuration and last score run. Edit before pasting into a paper.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => void copy()} disabled={!reportText}>
              <Copy className="w-3.5 h-3.5" />
              {copyFlash ? 'Copied' : 'Copy'}
            </Button>
            <Button variant="outline" size="sm" onClick={download} disabled={!reportText}>
              <Download className="w-3.5 h-3.5" />
              Download .md
            </Button>
          </div>
        </div>

        {datasets.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {datasets.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => {
                  setDatasetId(d.id);
                  onDatasetChange(d.id);
                }}
                className={`px-2.5 py-1 text-xs rounded-md border ${
                  d.id === datasetId
                    ? 'border-primary-500 bg-primary-50 text-primary-800 font-medium'
                    : 'border-secondary-200 text-secondary-600 hover:border-primary-300'
                }`}
              >
                {d.name || d.sheet_name || d.id.slice(0, 8)}
              </button>
            ))}
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-2 text-sm text-secondary-500">
            <Loader2 className="w-4 h-4 animate-spin" /> Building report…
          </div>
        )}
        {error && (
          <Card className="p-3 border-warning-300 bg-warning-50/50 text-sm text-warning-800">{error}</Card>
        )}
        {!loading && !error && reportText && (
          <Card className="p-4 border-secondary-200">
            <pre className="text-xs text-secondary-800 whitespace-pre-wrap font-sans leading-relaxed">
              {reportText}
            </pre>
          </Card>
        )}
        {!loading && !error && !reportText && (
          <Card className="p-4 text-sm text-secondary-500">Select a sheet to build a report.</Card>
        )}
      </div>
    </div>
  );
}
