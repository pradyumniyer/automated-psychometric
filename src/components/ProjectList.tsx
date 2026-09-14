import React, { useState, useEffect, useCallback } from 'react';
import { supabase, Project, ProjectType } from '@/lib/supabase';
import { Button, Card, Modal, EmptyState } from './ui';
import { Plus, FolderOpen, Trash2, FlaskConical, FileText, Calendar, ClipboardCheck, BarChart3 } from 'lucide-react';

export function ProjectList({ onOpenProject }: { onOpenProject: (p: Project) => void }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newType, setNewType] = useState<ProjectType>('survey_scoring');

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('projects').select('*').order('updated_at', { ascending: false });
    if (!error && data) setProjects(data as Project[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const createProject = async () => {
    if (!newName.trim()) return;
    const { data, error } = await supabase.from('projects').insert({
      name: newName.trim(), description: newDesc.trim(), project_type: newType,
    }).select().single();
    if (!error && data) {
      setShowCreate(false); setNewName(''); setNewDesc(''); setNewType('survey_scoring');
      onOpenProject(data as Project);
    }
  };

  const deleteProject = async (id: string) => {
    await supabase.from('projects').delete().eq('id', id);
    setProjects(projects.filter((p) => p.id !== id));
  };

  const typeLabel = (t: ProjectType) => t === 'content_validity' ? 'Content Validity' : 'Survey Scoring';
  const typeIcon = (t: ProjectType) => t === 'content_validity' ? ClipboardCheck : FlaskConical;
  const typeColor = (t: ProjectType) => t === 'content_validity' ? 'text-accent-700 bg-accent-100 border-accent-300' : 'text-primary-700 bg-primary-100 border-primary-300';

  return (
    <div className="min-h-screen bg-gradient-to-br from-secondary-50 to-primary-50/30">
      <div className="max-w-5xl mx-auto px-6 py-16">
        {/* Header */}
        <div className="flex items-center gap-3 mb-12">
          <div className="w-12 h-12 rounded-xl bg-primary-600 flex items-center justify-center shadow-lg shadow-primary-600/20">
            <FlaskConical className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-secondary-900">Psychometric Workbench</h1>
            <p className="text-sm text-secondary-500">Survey scoring &amp; content validity analysis — R-accurate</p>
          </div>
        </div>

        {/* Create button */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-secondary-800">Projects</h2>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4" /> New Project
          </Button>
        </div>

        {/* Project grid */}
        {loading ? (
          <div className="text-center py-16 text-secondary-400">Loading...</div>
        ) : projects.length === 0 ? (
          <EmptyState
            icon={FolderOpen}
            title="No projects yet"
            description="Create a new project to import data, configure scales, score responses, or run content validity analysis."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {projects.map((p) => {
              const Icon = typeIcon(p.project_type ?? 'survey_scoring');
              return (
                <Card key={p.id} className="p-5 hover:shadow-md transition-shadow cursor-pointer group">
                  <div onClick={() => onOpenProject(p)} className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${typeColor(p.project_type ?? 'survey_scoring')}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <h3 className="font-semibold text-secondary-900 group-hover:text-primary-700 transition-colors">{p.name}</h3>
                      </div>
                      {p.description && <p className="text-sm text-secondary-500 mt-1 line-clamp-2">{p.description}</p>}
                      <div className="flex items-center gap-3 mt-3 text-xs text-secondary-400">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border ${typeColor(p.project_type ?? 'survey_scoring')}`}>
                          {typeLabel(p.project_type ?? 'survey_scoring')}
                        </span>
                        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(p.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteProject(p.id); }}
                      className="p-1.5 text-secondary-300 hover:text-error-600 hover:bg-error-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Create modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Project" maxWidth="max-w-lg">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-secondary-700 mb-1">Project Name</label>
            <input
              value={newName} onChange={(e) => setNewName(e.target.value)}
              className="w-full px-4 py-2 border border-secondary-200 rounded-lg focus:outline-none focus:border-primary-400"
              placeholder="e.g., GAD-7 Validation Study"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && createProject()}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-secondary-700 mb-1">Description (optional)</label>
            <textarea
              value={newDesc} onChange={(e) => setNewDesc(e.target.value)}
              className="w-full px-4 py-2 border border-secondary-200 rounded-lg focus:outline-none focus:border-primary-400 resize-none"
              rows={2}
              placeholder="Brief description of the study or instrument"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-secondary-700 mb-2">Project Type</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setNewType('survey_scoring')}
                className={`flex flex-col items-start gap-2 p-4 rounded-xl border-2 transition-all text-left ${newType === 'survey_scoring' ? 'border-primary-500 bg-primary-50' : 'border-secondary-200 hover:border-secondary-300'}`}
              >
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${newType === 'survey_scoring' ? 'bg-primary-600 text-white' : 'bg-secondary-100 text-secondary-500'}`}>
                    <FlaskConical className="w-5 h-5" />
                  </div>
                  <span className="text-sm font-semibold text-secondary-900">Survey Scoring</span>
                </div>
                <span className="text-xs text-secondary-500 leading-relaxed">Import respondent data, configure scales, check data quality, score responses, and export results.</span>
              </button>
              <button
                onClick={() => setNewType('content_validity')}
                className={`flex flex-col items-start gap-2 p-4 rounded-xl border-2 transition-all text-left ${newType === 'content_validity' ? 'border-accent-500 bg-accent-50' : 'border-secondary-200 hover:border-secondary-300'}`}
              >
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${newType === 'content_validity' ? 'bg-accent-600 text-white' : 'bg-secondary-100 text-secondary-500'}`}>
                    <ClipboardCheck className="w-5 h-5" />
                  </div>
                  <span className="text-sm font-semibold text-secondary-900">Content Validity</span>
                </div>
                <span className="text-xs text-secondary-500 leading-relaxed">Import expert ratings of draft items, compute Lawshe CVR or Aiken&apos;s V, and decide which items to keep.</span>
              </button>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={createProject} disabled={!newName.trim()}><Plus className="w-4 h-4" /> Create</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
