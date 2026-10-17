export type ProjectTab = 'config' | 'quality' | 'export' | 'report';

export interface ProjectRoute {
  projectId: string;
  tab: ProjectTab;
}

export interface ProjectViewSettings {
  activeDatasetId: string | null;
  tab: ProjectTab;
  showSummarySum: boolean;
  showSummaryMean: boolean;
}

const projectTabs = new Set<ProjectTab>(['config', 'quality', 'export', 'report']);

export const DEFAULT_PROJECT_VIEW_SETTINGS: ProjectViewSettings = {
  activeDatasetId: null,
  tab: 'config',
  showSummarySum: false,
  showSummaryMean: false,
};

export function buildProjectHash(projectId: string, tab: ProjectTab): string {
  return `#/project/${encodeURIComponent(projectId)}/${tab}`;
}

export function parseProjectHash(hash: string): ProjectRoute | null {
  const match = /^#\/project\/([^/]+)\/([^/]+)$/.exec(hash);
  if (!match) return null;

  try {
    const projectId = decodeURIComponent(match[1]);
    const tab = match[2] as ProjectTab;
    if (!projectId || !projectTabs.has(tab)) return null;
    return { projectId, tab };
  } catch {
    return null;
  }
}

export function parseProjectViewSettings(value: unknown): ProjectViewSettings {
  if (!value || typeof value !== 'object') return DEFAULT_PROJECT_VIEW_SETTINGS;
  const saved = value as Partial<ProjectViewSettings>;
  return {
    activeDatasetId: typeof saved.activeDatasetId === 'string' ? saved.activeDatasetId : null,
    tab: saved.tab && projectTabs.has(saved.tab) ? saved.tab : DEFAULT_PROJECT_VIEW_SETTINGS.tab,
    showSummarySum: saved.showSummarySum === true,
    showSummaryMean: saved.showSummaryMean === true,
  };
}
