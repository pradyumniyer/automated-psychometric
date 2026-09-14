import { useState, useCallback } from 'react';
import { ProjectList } from '@/components/ProjectList';
import { ConfigScreen } from '@/components/ConfigScreen';
import { DataQualityScreen } from '@/components/DataQualityScreen';
import { ExportScreen } from '@/components/ExportScreen';
import { ReportScreen } from '@/components/ReportScreen';
import { Project } from '@/lib/supabase';
import { ArrowLeft, FlaskConical, Settings2, ShieldCheck, FileDown, FileText } from 'lucide-react';

type View = 'list' | 'config' | 'quality' | 'export' | 'report';

export default function App() {
  const [view, setView] = useState<View>('list');
  const [project, setProject] = useState<Project | null>(null);
  const [highlightRowIndex, setHighlightRowIndex] = useState<number | null>(null);
  const [excludedRows, setExcludedRows] = useState<Set<number>>(new Set());
  const [activeDatasetId, setActiveDatasetId] = useState<string | null>(null);

  const openProject = (p: Project) => {
    setProject(p);
    setView('config');
  };

  const goToList = () => {
    setProject(null);
    setView('list');
    setExcludedRows(new Set());
    setActiveDatasetId(null);
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

  const toggleRowExclusion = useCallback((rowIndex: number) => {
    setExcludedRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowIndex)) next.delete(rowIndex);
      else next.add(rowIndex);
      return next;
    });
  }, []);

  const bulkExclude = useCallback((indices: number[]) => {
    setExcludedRows((prev) => {
      const next = new Set(prev);
      for (const idx of indices) next.add(idx);
      return next;
    });
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
        {view === 'config' && (
          <ConfigScreen
            project={project}
            highlightRowIndex={highlightRowIndex}
            onClearHighlight={() => setHighlightRowIndex(null)}
            excludedRows={excludedRows}
            onToggleRowExclusion={toggleRowExclusion}
            onSetExcludedRows={setExcludedRows}
            onGoToQuality={goToQuality}
            sharedDatasetId={activeDatasetId}
            onDatasetChange={setActiveDatasetId}
          />
        )}
        {view === 'quality' && (
          <DataQualityScreen
            project={project}
            excludedRows={excludedRows}
            onToggleRow={toggleRowExclusion}
            onBulkExclude={bulkExclude}
            onInspectRow={(rowIndex) => goToConfig(rowIndex)}
            onGoToExport={goToExport}
          />
        )}
        {view === 'export' && (
          <ExportScreen
            project={project}
            excludedRows={excludedRows}
            sharedDatasetId={activeDatasetId}
            onDatasetChange={setActiveDatasetId}
          />
        )}
        {view === 'report' && (
          <ReportScreen
            project={project}
            excludedRows={excludedRows}
            sharedDatasetId={activeDatasetId}
            onDatasetChange={setActiveDatasetId}
          />
        )}
      </div>
    </div>
  );
}
