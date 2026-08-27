import React, { useState, useEffect, useCallback } from 'react';
import { supabase, Project } from '@/lib/supabase';
import { Button, Card, Modal, EmptyState } from './ui';
import { Plus, FolderOpen, Trash2, FlaskConical, FileText, Calendar } from 'lucide-react';

export function ProjectList({ onOpenProject }: { onOpenProject: (p: Project) => void }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('projects').select('*').order('updated_at', { ascending: false });
    if (!error && data) setProjects(data as Project[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const createProject = async () => {
    if (!newName.trim()) return;
    const { data, error } = await supabase.from('projects').insert({
      name: newName.trim(), description: newDesc.trim(),
    }).select().single();
    if (!error && data) {
      setShowCreate(false); setNewName(''); setNewDesc('');
      onOpenProject(data as Project);
    }
  };

  const deleteProject = async (id: string) => {
    await supabase.from('projects').delete().eq('id', id);
    setProjects(projects.filter((p) => p.id !== id));
  };

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
            <p className="text-sm text-secondary-500">Data preprocessing, scoring, reliability & normality analysis — R-accurate</p>
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
            description="Create a new project to import data, configure subscales, score responses, and run psychometric analysis."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {projects.map((p) => (
              <Card key={p.id} className="p-5 hover:shadow-md transition-shadow cursor-pointer group" >
                <div onClick={() => onOpenProject(p)} className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-secondary-900 group-hover:text-primary-700 transition-colors">{p.name}</h3>
                    {p.description && <p className="text-sm text-secondary-500 mt-1 line-clamp-2">{p.description}</p>}
                    <div className="flex items-center gap-3 mt-3 text-xs text-secondary-400">
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
            ))}
          </div>
        )}
      </div>

      {/* Create modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Project" maxWidth="max-w-md">
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
              rows={3}
              placeholder="Brief description of the study or instrument"
            />
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
