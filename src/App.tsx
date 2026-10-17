import { useEffect, useState, useCallback } from 'react';
import { ProjectList } from '@/components/ProjectList';
import { ConfigScreen } from '@/components/ConfigScreen';
import { DataQualityScreen } from '@/components/DataQualityScreen';
import { ExportScreen } from '@/components/ExportScreen';
import { ReportScreen } from '@/components/ReportScreen';
import type { Project } from '@/types/domain';
import { datasetRepository, exclusionRepository } from '@/storage/repositories';
import { ArrowLeft, FlaskConical, Settings2, ShieldCheck, FileDown, FileText } from 'lucide-react';
import type { ScoreColumnSettings } from '@/lib/scoredColumns';

type View = 'list' | 'config' | 'quality' | 'export' | 'report';

export default function App() {
  const [view, setView] = useState<View>('list');
  const [project, setProject] = useState<Project | null>(null);
  const [highlightRowIndex, setHighlightRowIndex] = useState<number | null>(null);
  const [excludedRows, setExcludedRows] = useState<Set<number>>(new Set());
  const [activeDatasetId, setActiveDatasetId] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [showSummarySum, setShowSummarySum] = useState(false);
  const [showSummaryMean, setShowSummaryMean] = useState(false);
  const [scoreColumnSettings, setScoreColumnSettings] = useState<ScoreColumnSettings>({
    sum: false,
    mean: false,
    overall: true,
  });

  const changeActiveDataset = useCallback((datasetId: string | null) => {
    setExcludedRows(new Set());
    setActiveDatasetId(datasetId);
    setStorageError(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!activeDatasetId) {
      setExcludedRows(new Set());
      setStorageError(null);
      return;
    }
    exclusionRepository.getExcludedIndices(activeDatasetId)
      .then((indices) => {
        if (!cancelled) {
          setExcludedRows(new Set(indices));
          setStorageError(null);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setExcludedRows(new Set());
          setStorageError(`Failed to load row exclusions: ${(error as Error).message}`);
        }
      });
    return () => { cancelled = true; };
  }, [activeDatasetId]);

  const persistExcludedRows = useCallback(async (rows: Set<number>) => {
    if (!activeDatasetId) {
      setExcludedRows(rows);
      return;
    }
    try {
      const dataset = await datasetRepository.get(activeDatasetId);
      if (!dataset) throw new Error(`Dataset "${activeDatasetId}" was not found.`);
      const rowIds = [...rows].map((index) => dataset.row_ids[index]);
      if (rowIds.some((rowId) => rowId === undefined)) {
        throw new Error('One or more excluded rows have no stable ID.');
      }
      await exclusionRepository.replace(
        activeDatasetId,
        rowIds.filter((rowId): rowId is string => rowId !== undefined),
      );
      setExcludedRows(rows);
      setStorageError(null);
    } catch (error) {
      setStorageError(`Failed to save row exclusions: ${(error as Error).message}`);
      throw error;
    }
  }, [activeDatasetId]);

  const openProject = (p: Project) => {
    setProject(p);
    setView('config');
  };

  const goToList = () => {
    setProject(null);
    setView('list');
    setExcludedRows(new Set());
    setActiveDatasetId(null);
    setStorageError(null);
  };

  const goToConfig = useCallback((rowIndex?: number) => {
    if (rowIndex != null) setHighlightRowIndex(rowIndex);
    setView('config');
  }, []);

  const goToQuality = useCallback(() => {
    setView('quality');
  }, []);

  const goToExport = useCallback(() => {
    setView('export');
  }, []);

  const goToReport = useCallback(() => {
    setView('report');
  }, []);

  const toggleRowExclusion = useCallback(async (rowIndex: number) => {
    const next = new Set(excludedRows);
    if (next.has(rowIndex)) next.delete(rowIndex);
    else next.add(rowIndex);
    await persistExcludedRows(next);
  }, [excludedRows, persistExcludedRows]);

  const bulkExclude = useCallback(async (indices: number[]) => {
    const next = new Set(excludedRows);
    for (const index of indices) next.add(index);
    await persistExcludedRows(next);
  }, [excludedRows, persistExcludedRows]);

  const setExcludedRowsDirect = useCallback((rows: Set<number>) => (
    persistExcludedRows(rows)
  ), [persistExcludedRows]);
  const toggleScoreColumn = useCallback((key: keyof ScoreColumnSettings) => {
    setScoreColumnSettings((current) => ({ ...current, [key]: !current[key] }));
  }, []);

  if (view === 'list' || !project) {
    return <ProjectList onOpenProject={openProject} />;
  }

  return (
    <div className="h-screen flex flex-col bg-secondary-50">
      {/* App header */}
      <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-secondary-200">
        <div className="flex items-center gap-3">
          <button onClick={goToList} className="flex items-center gap-2 text-secondary-600 hover:text-secondary-900 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm font-medium">Projects</span>
          </button>
          <div className="w-px h-6 bg-secondary-200" />
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center">
              <FlaskConical className="w-5 h-5 text-white" />
            </div>
            <span className="font-semibold text-secondary-900">{project.name}</span>
          </div>
        </div>

        <div className="flex items-center gap-1 bg-secondary-100 rounded-lg p-0.5">
          <button
            onClick={() => goToConfig()}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-all ${view === 'config' ? 'bg-white text-primary-700 shadow-sm' : 'text-secondary-500 hover:text-secondary-700'}`}
          >
            <Settings2 className="w-4 h-4" />
            Configure
          </button>
          <button
            onClick={goToQuality}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-all ${view === 'quality' ? 'bg-white text-primary-700 shadow-sm' : 'text-secondary-500 hover:text-secondary-700'}`}
          >
            <ShieldCheck className="w-4 h-4" />
            Data Quality
          </button>
          <button
            onClick={goToExport}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-all ${view === 'export' ? 'bg-white text-primary-700 shadow-sm' : 'text-secondary-500 hover:text-secondary-700'}`}
          >
            <FileDown className="w-4 h-4" />
            Export
          </button>
          <button
            onClick={goToReport}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-all ${view === 'report' ? 'bg-white text-primary-700 shadow-sm' : 'text-secondary-500 hover:text-secondary-700'}`}
          >
            <FileText className="w-4 h-4" />
            Report
          </button>
        </div>
      </div>

      {/* Screen content */}
      <div className="flex-1 overflow-hidden">
        {storageError && (
          <div role="alert" className="px-4 py-2 bg-error-50 text-sm text-error-700 border-b border-error-200">
            {storageError}
          </div>
        )}
        {view === 'config' && (
          <ConfigScreen
            project={project}
            highlightRowIndex={highlightRowIndex}
            onClearHighlight={() => setHighlightRowIndex(null)}
            excludedRows={excludedRows}
            onToggleRowExclusion={toggleRowExclusion}
            onSetExcludedRows={setExcludedRowsDirect}
            onGoToQuality={goToQuality}
            sharedDatasetId={activeDatasetId}
            onDatasetChange={changeActiveDataset}
            showSummarySum={showSummarySum}
            showSummaryMean={showSummaryMean}
            onToggleSummarySum={() => setShowSummarySum((v) => !v)}
            onToggleSummaryMean={() => setShowSummaryMean((v) => !v)}
            scoreColumnSettings={scoreColumnSettings}
            onToggleScoreColumn={toggleScoreColumn}
          />
        )}
        {view === 'quality' && (
          <DataQualityScreen
            project={project}
            excludedRows={excludedRows}
            onToggleRow={toggleRowExclusion}
            onBulkExclude={bulkExclude}
            onSetExcludedRows={setExcludedRowsDirect}
            onInspectRow={(rowIndex) => goToConfig(rowIndex)}
            onGoToExport={goToExport}
            sharedDatasetId={activeDatasetId}
            onDatasetChange={changeActiveDataset}
          />
        )}
        {view === 'export' && (
          <ExportScreen
            project={project}
            excludedRows={excludedRows}
            sharedDatasetId={activeDatasetId}
            onDatasetChange={changeActiveDataset}
            scoreColumnSettings={scoreColumnSettings}
          />
        )}
        {view === 'report' && (
          <ReportScreen
            project={project}
            excludedRows={excludedRows}
            sharedDatasetId={activeDatasetId}
            onDatasetChange={changeActiveDataset}
          />
        )}
      </div>
    </div>
  );
}
