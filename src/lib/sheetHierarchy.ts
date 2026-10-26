import type { Dataset } from '@/types/domain';

export function sortDatasetsForTabs(datasets: Dataset[]): Dataset[] {
  const byId = new Map(datasets.map((d) => [d.id, d]));
  const children = new Map<string, Dataset[]>();
  const roots: Dataset[] = [];
  for (const d of datasets) {
    const parent = d.parent_dataset_id ?? d.import_meta?.parent_dataset_id;
    if (parent && byId.has(parent)) {
      const list = children.get(parent) ?? [];
      list.push(d);
      children.set(parent, list);
    } else {
      roots.push(d);
    }
  }
  const out: Dataset[] = [];
  for (const root of roots) {
    out.push(root);
    const kids = (children.get(root.id) ?? []).slice().sort((a, b) =>
      (a.sheet_name ?? '').localeCompare(b.sheet_name ?? ''),
    );
    out.push(...kids);
  }
  for (const d of datasets) {
    if (!out.includes(d)) out.push(d);
  }
  return out;
}

export function datasetTabLabel(ds: Dataset): string {
  const name = ds.sheet_name || ds.file_name;
  const role = ds.role ?? ds.import_meta?.role;
  const sourceLabel = ds.source_sheet_label ?? ds.import_meta?.source_sheet_label;
  if (role === 'instrument' && sourceLabel) return `${sourceLabel} / ${name}`;
  const plan = ds.split_plan ?? ds.import_meta?.split_plan;
  if (role !== 'instrument' && plan?.groups?.some((g) => g.childDatasetId)) {
    return `${name} (source)`;
  }
  return name;
}

export function isInstrumentSheet(ds: Dataset | null | undefined): boolean {
  return (ds?.role ?? ds?.import_meta?.role) === 'instrument';
}

export function isSourceAlreadySplit(ds: Dataset | null | undefined): boolean {
  if (!ds || isInstrumentSheet(ds)) return false;
  const plan = ds.split_plan ?? ds.import_meta?.split_plan;
  return !!plan?.groups?.some((g) => g.childDatasetId);
}

export function displaySheetName(fileName: string, sheetName: string): string {
  const base = fileName.replace(/\.(csv|xlsx|xls)$/i, '');
  if (!sheetName || /^sheet\s*1$/i.test(sheetName.trim())) return base || sheetName || 'Data';
  return sheetName;
}

export function getSplitPlan(ds: Dataset | null | undefined) {
  return ds?.split_plan ?? ds?.import_meta?.split_plan ?? null;
}
