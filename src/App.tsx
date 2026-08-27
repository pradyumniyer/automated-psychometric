import { useState } from 'react';
import { ProjectList } from '@/components/ProjectList';
import { ConfigScreen } from '@/components/ConfigScreen';
import { AnalysisScreen } from '@/components/AnalysisScreen';
import { Project } from '@/lib/supabase';
import { ArrowLeft, FlaskConical, Settings2, BarChart3 } from 'lucide-react';

type View = 'list' | 'config' | 'analysis';

export default function App() {
  const [view, setView] = useState<View>('list');
  const [project, setProject] = useState<Project | null>(null);
  const [highlightRowIndex, setHighlightRowIndex] = useState<number | null>(null);

  const openProject = (p: Project) => {
    setProject(p);
    setView('config');
  };

  const goToList = () => {
    setProject(null);
    setView('list');
  };

  const goToAnalysis = () => {
    setHighlightRowIndex(null);
    setView('analysis');
  };

  const goToConfig = (rowIndex?: number) => {
    if (rowIndex != null) setHighlightRowIndex(rowIndex);
    setView('config');
  };

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

        {/* Screen toggle */}
        <div className="flex items-center gap-1 bg-secondary-100 rounded-lg p-1">
          <button
            onClick={() => goToConfig()}
            className={`flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
              view === 'config' ? 'bg-white text-primary-700 shadow-sm' : 'text-secondary-600 hover:text-secondary-900'
            }`}
          >
            <Settings2 className="w-4 h-4" />
            Configure & Score
          </button>
          <button
            onClick={goToAnalysis}
            className={`flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
              view === 'analysis' ? 'bg-white text-primary-700 shadow-sm' : 'text-secondary-600 hover:text-secondary-900'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            Analysis Dashboard
          </button>
        </div>
      </div>

      {/* Screen content */}
      <div className="flex-1 overflow-hidden">
        {view === 'config' && (
          <ConfigScreen
            project={project}
            onGoToAnalysis={goToAnalysis}
            highlightRowIndex={highlightRowIndex}
            onClearHighlight={() => setHighlightRowIndex(null)}
          />
        )}
        {view === 'analysis' && (
          <AnalysisScreen
            project={project}
            onGoToConfig={goToConfig}
            highlightRowIndex={highlightRowIndex}
            onClearHighlight={() => setHighlightRowIndex(null)}
          />
        )}
      </div>
    </div>
  );
}
