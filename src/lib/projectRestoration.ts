import {
  DEFAULT_PROJECT_VIEW_SETTINGS,
  parseProjectViewSettings,
  type ProjectTab,
  type ProjectViewSettings,
} from './appRoute';
import {
  datasetRepository,
  projectRepository,
  settingsRepository,
} from '../storage/repositories';
import type { Project } from '../types/domain';

export interface RestoredProjectView {
  project: Project | null;
  datasetId: string | null;
  tab: ProjectTab;
  settings: ProjectViewSettings;
}

export async function restoreProjectView(
  projectId: string,
  requestedTab?: ProjectTab,
): Promise<RestoredProjectView> {
  const project = (await projectRepository.list()).find((candidate) => candidate.id === projectId) ?? null;
  if (!project) {
    return {
      project: null,
      datasetId: null,
      tab: DEFAULT_PROJECT_VIEW_SETTINGS.tab,
      settings: DEFAULT_PROJECT_VIEW_SETTINGS,
    };
  }

  const [savedValue, datasets] = await Promise.all([
    settingsRepository.get<unknown>(`project-view:${projectId}`),
    datasetRepository.list(projectId),
  ]);
  const settings = parseProjectViewSettings(savedValue);
  const datasetId = datasets.some((dataset) => dataset.id === settings.activeDatasetId)
    ? settings.activeDatasetId
    : datasets[0]?.id ?? null;

  return {
    project,
    datasetId,
    tab: requestedTab ?? settings.tab,
    settings,
  };
}
