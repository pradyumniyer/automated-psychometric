import { useEffect, useState, useCallback } from 'react';
import { ProjectList } from '@/components/ProjectList';
import { ConfigScreen } from '@/components/ConfigScreen';
import { DataQualityScreen } from '@/components/DataQualityScreen';
import { ExportScreen } from '@/components/ExportScreen';
import { ReportScreen } from '@/components/ReportScreen';
import type { ActionHistory, Project } from '@/types/domain';
import { datasetRepository, exclusionRepository, historyRepository, settingsRepository, surveyConfigRepository } from '@/storage/repositories';
import { ArrowLeft, FlaskConical, Settings2, ShieldCheck, FileDown, FileText, History, Redo2, Undo2 } from 'lucide-react';
import { fetchHistory, logUndoable } from '@/lib/history';
import { actionLabel } from '@/lib/phaseA';
import { describeExclusionChange, historySlice } from '@/lib/historySlice';
import {
  buildProjectHash,
  parseProjectHash,
  type ProjectTab,
  type ProjectViewSettings,
} from '@/lib/appRoute';
import { restoreProjectView } from '@/lib/projectRestoration';

type View = 'list' | 'config' | 'quality' | 'export' | 'report';

export default function App() {
  const [view, setView] = useState<View>(() => parseProjectHash(window.location.hash)?.tab ?? 'list');
  const [project, setProject] = useState<Project | null>(null);
  const [highlightRowIndex, setHighlightRowIndex] = useState<number | null>(null);
  const [excludedRows, setExcludedRows] = useState<Set<number>>(new Set());
  const [activeDatasetId, setActiveDatasetId] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [showSummarySum, setShowSummarySum] = useState(false);
  const [showSummaryMean, setShowSummaryMean] = useState(false);
  const [routeReady, setRouteReady] = useState(false);
  const [loadedProjectId, setLoadedProjectId] = useState<string | null>(null);
  const [history, setHistory] = useState<ActionHistory[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [historyEpoch, setHistoryEpoch] = useState(0);

  const restoreProjectState = useCallback(async (projectId: string, requestedTab?: ProjectTab) => {
    const restored = await restoreProjectView(projectId, requestedTab);
    if (!restored.project) {
      setProject(null);
      setView('list');
      setActiveDatasetId(null);
      setLoadedProjectId(null);
      return;
    }

    setProject(restored.project);
    setView(restored.tab);
    setActiveDatasetId(restored.datasetId);
    setShowSummarySum(restored.settings.showSummarySum);
    setShowSummaryMean(restored.settings.showSummaryMean);
    setLoadedProjectId(projectId);
  }, []);

  useEffect(() => {
    const route = parseProjectHash(window.location.hash);
    if (!route) {
      setRouteReady(true);
      return;
    }
    let cancelled = false;
    restoreProjectState(route.projectId, route.tab)
      .catch((error: unknown) => {
        if (!cancelled) setStorageError(`Failed to restore project: ${(error as Error).message}`);
      })
      .finally(() => {
        if (!cancelled) setRouteReady(true);
      });
    return () => { cancelled = true; };
  }, [restoreProjectState]);

  useEffect(() => {
    if (!routeReady) return;
    const nextHash = project && view !== 'list'
      ? buildProjectHash(project.id, view)
      : '#/';
    if (window.location.hash !== nextHash) window.location.hash = nextHash;
  }, [project, routeReady, view]);

  useEffect(() => {
    if (!routeReady || !project || loadedProjectId !== project.id) return;
    const saved: ProjectViewSettings = {
      activeDatasetId,
      tab: view === 'list' ? 'config' : view,
      showSummarySum,
      showSummaryMean,
    };
    settingsRepository.set(`project-view:${project.id}`, saved)
      .catch((error: unknown) => {
        setStorageError(`Failed to save project view settings: ${(error as Error).message}`);
      });
  }, [
    activeDatasetId,
    loadedProjectId,
    project,
    routeReady,
    showSummaryMean,
    showSummarySum,
    view,
  ]);

  useEffect(() => {
    const handleHashChange = () => {
      const route = parseProjectHash(window.location.hash);
      if (!route) {
        setProject(null);
        setView('list');
        setActiveDatasetId(null);
        setLoadedProjectId(null);
        return;
      }
      setView(route.tab);
      if (route.projectId !== project?.id) {
        setLoadedProjectId(null);
        restoreProjectState(route.projectId, route.tab)
          .catch((error: unknown) => {
            setStorageError(`Failed to restore project: ${(error as Error).message}`);
          });
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [project?.id, restoreProjectState]);

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
      const nextIds = rowIds.filter((rowId): rowId is string => rowId !== undefined);
      const previousIds = (await exclusionRepository.get(activeDatasetId))?.excluded_row_ids ?? [];
      const same = previousIds.length === nextIds.length && previousIds.every((id) => nextIds.includes(id));
      if (!same) {
        const config = project ? await surveyConfigRepository.get(activeDatasetId) : null;
        await exclusionRepository.replace(activeDatasetId, nextIds);
        if (config && project) {
          await logUndoable({
            projectId: project.id,
            datasetId: activeDatasetId,
            actionType: 'row_exclude_toggle',
            description: describeExclusionChange(previousIds, nextIds, dataset.row_ids),
            before: historySlice(config, previousIds),
            after: historySlice(config, nextIds),
          });
          setHistory(await fetchHistory(activeDatasetId));
        }
      }
      setExcludedRows(rows);
      setStorageError(null);
    } catch (error) {
      setStorageError(`Failed to save row exclusions: ${(error as Error).message}`);
      throw error;
    }
  }, [activeDatasetId, project]);

  const openProject = (p: Project) => {
    setLoadedProjectId(null);
    restoreProjectState(p.id)
      .catch((error: unknown) => {
        setStorageError(`Failed to open project: ${(error as Error).message}`);
      });
  };

  const goToList = () => {
    setProject(null);
    setView('list');
    setLoadedProjectId(null);
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

  const refreshHistory = useCallback(async () => {
    if (!activeDatasetId) {
      setHistory([]);
      return;
    }
    setHistory(await fetchHistory(activeDatasetId));
  }, [activeDatasetId]);

  useEffect(() => { void refreshHistory(); }, [refreshHistory]);

  const restoreHistory = useCallback(async (direction: 'undo' | 'redo') => {
    if (!activeDatasetId) return;
    try {
      const summary = direction === 'undo'
        ? await historyRepository.undo(activeDatasetId)
        : await historyRepository.redo(activeDatasetId);
      if (!summary) return;
      const indices = await exclusionRepository.getExcludedIndices(activeDatasetId);
      setExcludedRows(new Set(indices));
      setHistoryEpoch((epoch) => epoch + 1);
      setHistory(await fetchHistory(activeDatasetId));
      setStorageError(null);
    } catch (error) {
      setStorageError(`Could not ${direction}: ${(error as Error).message}`);
    }
  }, [activeDatasetId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (!(event.metaKey || event.ctrlKey)) return;
      const key = event.key.toLowerCase();
      if (key === 'z') {
        event.preventDefault();
        void restoreHistory(event.shiftKey ? 'redo' : 'undo');
      } else if (key === 'y') {
        event.preventDefault();
        void restoreHistory('redo');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [restoreHistory]);

  const canUndo = history.some((entry) => entry.stack === 'undo' && !!entry.undo_data && 'kind' in entry.undo_data);
  const canRedo = history.some((entry) => entry.stack === 'redo' && !!entry.undo_data && 'kind' in entry.undo_data);

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

        <div className="flex items-center gap-1">
          <button type="button" onClick={() => void restoreHistory('undo')} disabled={!canUndo} title="Undo (Ctrl+Z)" className="p-1.5 rounded-md text-secondary-600 hover:bg-secondary-100 disabled:opacity-30 disabled:hover:bg-transparent"><Undo2 className="w-4 h-4" /></button>
          <button type="button" onClick={() => void restoreHistory('redo')} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)" className="p-1.5 rounded-md text-secondary-600 hover:bg-secondary-100 disabled:opacity-30 disabled:hover:bg-transparent"><Redo2 className="w-4 h-4" /></button>
          <button type="button" onClick={() => setShowHistory((open) => !open)} className={`flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium rounded-md ${showHistory ? 'bg-secondary-200 text-secondary-900' : 'text-secondary-600 hover:bg-secondary-100'}`}><History className="w-4 h-4" /> History</button>
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
            historyEpoch={historyEpoch}
            onHistoryChanged={() => { void refreshHistory(); }}
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
            onGoToConfig={() => goToConfig()}
            sharedDatasetId={activeDatasetId}
            onDatasetChange={changeActiveDataset}
            historyEpoch={historyEpoch}
            onHistoryChanged={() => { void refreshHistory(); }}
          />
        )}
        {view === 'export' && (
          <ExportScreen
            project={project}
            excludedRows={excludedRows}
            sharedDatasetId={activeDatasetId}
            onDatasetChange={changeActiveDataset}
            showSummarySum={showSummarySum}
            showSummaryMean={showSummaryMean}
            onHistoryChanged={() => { void refreshHistory(); }}
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
      {showHistory && (
        <div className="fixed top-0 right-0 bottom-0 w-80 bg-white border-l border-secondary-200 shadow-lg z-40 flex flex-col">
          <div className="px-4 py-3 border-b border-secondary-200 flex items-center justify-between">
            <h3 className="font-semibold text-secondary-800">History</h3>
            <button type="button" onClick={() => setShowHistory(false)} className="text-sm text-secondary-500 hover:text-secondary-800">Close</button>
          </div>
          <p className="px-4 py-2 text-xs text-secondary-500 border-b border-secondary-100">Newest first. Undo and redo use the latest change only, not a row you pick.</p>
          <div className="flex-1 overflow-auto divide-y divide-secondary-100">
            {history.length === 0 && <div className="px-4 py-8 text-center text-sm text-secondary-400">No actions yet on this sheet</div>}
            {history.map((entry) => (
              <div key={entry.id} className={`px-4 py-3 ${entry.stack === 'redo' ? 'opacity-50' : ''}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-secondary-100 text-secondary-600">{actionLabel(entry.action_type)}</span>
                  <span className="text-xs text-secondary-400">{new Date(entry.created_at).toLocaleString()}</span>
                </div>
                <p className="text-sm text-secondary-700">{entry.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
