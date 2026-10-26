import { describe, expect, it } from 'vitest';
import { columnsForGroup, projectRows, rangeFromClicks, validateSplitPlan } from '../src/lib/masterSheetSplit';
import { datasetTabLabel, sortDatasetsForTabs } from '../src/lib/sheetHierarchy';
import type { Dataset } from '../src/types/domain';

describe('masterSheetSplit (P4b)', () => {
  const headers = ['ID', 'Age', 'Q1', 'Q2', 'Q3', 'Q4', 'Timestamp'];

  it('builds demo + item columns for a group', () => {
    const cols = columnsForGroup(headers, ['ID', 'Age'], {
      id: '1', name: 'Anxiety', startIndex: 2, endIndex: 4,
    });
    expect(cols).toEqual(['ID', 'Age', 'Q1', 'Q2', 'Q3']);
  });

  it('projects rows to selected columns', () => {
    const rows = [{ ID: 'P1', Age: 20, Q1: 1, Q2: 2, Q3: 3, Q4: 4, Timestamp: 'x' }];
    expect(projectRows(rows, ['ID', 'Q1', 'Q2'])[0]).toEqual({ ID: 'P1', Q1: 1, Q2: 2 });
  });

  it('validates plans', () => {
    expect(validateSplitPlan(headers, { demoColumns: ['ID'], groups: [] })).toBeTruthy();
    expect(validateSplitPlan(headers, {
      demoColumns: ['ID'],
      groups: [{ id: '1', name: 'A', startIndex: 2, endIndex: 4 }],
    })).toBeNull();
  });

  it('rangeFromClicks is order-independent', () => {
    expect(rangeFromClicks(5, 2)).toEqual({ startIndex: 2, endIndex: 5 });
  });
});

describe('sheetHierarchy (P4b-fix)', () => {
  const base = {
    project_id: 'p', file_name: 'f', headers: [], rows: [], column_meta: {},
    row_ids: [], row_count: 0, col_count: 0, linked_template_id: null, created_at: '',
  };

  it('sorts instruments under their source', () => {
    const source: Dataset = { ...base, id: 's', sheet_name: 'Sheet2', role: 'source' };
    const c1: Dataset = { ...base, id: 'c1', sheet_name: 'Scale 1', role: 'instrument', parent_dataset_id: 's', source_sheet_label: 'Sheet2' };
    const c2: Dataset = { ...base, id: 'c2', sheet_name: 'Scale 2', role: 'instrument', parent_dataset_id: 's', source_sheet_label: 'Sheet2' };
    const other: Dataset = { ...base, id: 'o', sheet_name: 'Sheet1', role: 'source' };
    const sorted = sortDatasetsForTabs([c2, other, c1, source]);
    expect(sorted.map((d) => d.id)).toEqual(['o', 's', 'c1', 'c2']);
  });

  it('labels instruments with source prefix', () => {
    const ds = {
      ...base, id: 'c', sheet_name: 'Anxiety', role: 'instrument' as const,
      parent_dataset_id: 's', source_sheet_label: 'Sheet2',
    };
    expect(datasetTabLabel(ds)).toBe('Sheet2 / Anxiety');
  });
});
