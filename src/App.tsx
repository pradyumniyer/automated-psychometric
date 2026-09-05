import { useState } from 'react';
import { ProjectList } from '@/components/ProjectList';
import { ConfigScreen } from '@/components/ConfigScreen';
import { Project } from '@/lib/supabase';
import { ArrowLeft, FlaskConical, Settings2 } from 'lucide-react';

type View = 'list' | 'config';

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
      </div>

      {/* Screen content */}
      <div className="flex-1 overflow-hidden">
        <ConfigScreen
          project={project}
          highlightRowIndex={highlightRowIndex}
          onClearHighlight={() => setHighlightRowIndex(null)}
        />
      </div>
    </div>
  );
}
