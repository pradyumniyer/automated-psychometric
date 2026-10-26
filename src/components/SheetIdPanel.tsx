import React, { useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import type { Dataset, DemographicColumn } from '@/types/domain';
import { rangeFromClicks, type ScaleColumnGroup } from '@/lib/masterSheetSplit';
import { getSplitPlan, isInstrumentSheet, isSourceAlreadySplit } from '@/lib/sheetHierarchy';
import { Button, ConfidenceBadge } from './ui';

export function SheetIdPanel({
  dataset,
  allColumns,
  demoCols,
  onToggle,
  onMarkAllItems,
  onCreateSheets,
  onRemoveOrganizedSheets,
  onOpenChild,
  creatingSheets,
  removingSheets,
}: {
  dataset: Dataset;
  allColumns: string[];
  demoCols: DemographicColumn[];
  onToggle: (col: string, isDemo: boolean) => void;
  onMarkAllItems: () => void;
  onCreateSheets: (groups: ScaleColumnGroup[], demoNames: string[]) => void;
  onRemoveOrganizedSheets: () => void;
  onOpenChild: (datasetId: string) => void;
  creatingSheets: boolean;
  removingSheets: boolean;
}) {
  const instrument = isInstrumentSheet(dataset);
  const alreadySplit = isSourceAlreadySplit(dataset);
  const splitPlan = getSplitPlan(dataset);
  const sourceLabel = dataset.source_sheet_label ?? dataset.import_meta?.source_sheet_label;

  const [search, setSearch] = useState('');
  const [structureMode, setStructureMode] = useState<'one' | 'several'>('one');
  const [groups, setGroups] = useState<ScaleColumnGroup[]>([
    { id: 'g1', name: 'Scale 1', startIndex: -1, endIndex: -1 },
  ]);
  const [activeTarget, setActiveTarget] = useState<'demos' | number>('demos');
  const [rangeAnchor, setRangeAnchor] = useState<number | null>(null);

  const demoNames = new Set(demoCols.map((d) => d.column_name));
  const filtered = allColumns.filter((c) => c.toLowerCase().includes(search.toLowerCase()));
  const sampleRow = (dataset.rows?.[0] as Record<string, unknown> | undefined) ?? null;
  const allowSeveral = !instrument && !alreadySplit;

  const paintRange = (colIndex: number) => {
    if (activeTarget === 'demos') {
      const col = allColumns[colIndex];
      if (!col) return;
      onToggle(col, demoNames.has(col));
      return;
    }
    const gIdx = activeTarget;
    if (rangeAnchor == null) {
      setRangeAnchor(colIndex);
      setGroups((prev) => prev.map((g, i) => (i === gIdx ? { ...g, startIndex: colIndex, endIndex: colIndex } : g)));
      return;
    }
    const { startIndex, endIndex } = rangeFromClicks(rangeAnchor, colIndex);
    setGroups((prev) => prev.map((g, i) => (i === gIdx ? { ...g, startIndex, endIndex } : g)));
    setRangeAnchor(null);
  };

  const colColor = (idx: number): string => {
    const name = allColumns[idx];
    if (demoNames.has(name)) return 'bg-primary-200 border-primary-400 text-primary-900';
    for (let gi = 0; gi < groups.length; gi++) {
      const g = groups[gi];
      if (g.startIndex < 0) continue;
      const a = Math.min(g.startIndex, g.endIndex);
      const b = Math.max(g.startIndex, g.endIndex);
      if (idx >= a && idx <= b) {
        const palette = ['bg-accent-100 border-accent-400', 'bg-success-100 border-success-400', 'bg-warning-100 border-warning-400', 'bg-info-100 border-info-400'];
        return `${palette[gi % palette.length]} text-secondary-900`;
      }
    }
    return 'bg-secondary-50 border-secondary-200 text-secondary-600';
  };

  const canCreate = structureMode === 'several' && groups.every((g) => g.name.trim() && g.startIndex >= 0);

  // ── Source already organized: summary only (not full workflow) ──
  if (alreadySplit && splitPlan) {
    const named = splitPlan.groups.filter((g) => g.childDatasetId);
    return (
      <div className="p-3 space-y-3">
        <div className="px-3 py-3 rounded-lg border border-primary-200 bg-primary-50/60 text-sm text-secondary-800">
          <div className="text-xs font-semibold text-primary-900 uppercase tracking-wide mb-1">Source sheet</div>
          <p className="text-[12px] text-secondary-700 mb-2">
            This file was organized into <strong>{named.length}</strong> instrument sheet{named.length === 1 ? '' : 's'}.
            Work on those tabs (scales, scoring, export). This tab is only for reference and re-organization.
          </p>
          <ul className="text-[12px] space-y-1 mb-3">
            {named.map((g) => (
              <li key={g.name} className="flex items-center justify-between gap-2">
                <span className="font-medium">{g.name}</span>
                {g.childDatasetId && (
                  <button type="button" className="text-primary-700 hover:underline text-[11px]"
                    onClick={() => onOpenChild(g.childDatasetId!)}>
                    Open
                  </button>
                )}
              </li>
            ))}
          </ul>
          <Button
            size="sm"
            variant="outline"
            disabled={removingSheets}
            onClick={() => {
              if (window.confirm('Remove all instrument sheets created from this source? You can organize again afterward.')) {
                onRemoveOrganizedSheets();
              }
            }}
          >
            {removingSheets ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            Remove organized sheets…
          </Button>
          <p className="text-[10px] text-secondary-500 mt-2">
            Tip: to fix column assignments, remove organized sheets, then use Several scales again.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-secondary-500 uppercase tracking-wide">ID Columns</span>
        <button type="button" onClick={onMarkAllItems} className="text-xs text-primary-600 hover:underline">Mark all as items</button>
      </div>

      {instrument && (
        <div className="px-2.5 py-2 rounded-lg border border-secondary-200 bg-secondary-50 text-[11px] text-secondary-600">
          Instrument sheet{sourceLabel ? <> from <strong>{sourceLabel}</strong></> : null}.
          Mark ID/demographics only — splitting again is not available.
        </div>
      )}

      {allowSeveral && (
        <div className="flex rounded-lg border border-secondary-200 p-0.5 bg-secondary-50">
          <button type="button" onClick={() => setStructureMode('one')}
            className={`flex-1 px-2 py-1.5 text-xs rounded-md ${structureMode === 'one' ? 'bg-white text-primary-700 shadow-sm font-medium' : 'text-secondary-600'}`}>
            One scale
          </button>
          <button type="button" onClick={() => setStructureMode('several')}
            className={`flex-1 px-2 py-1.5 text-xs rounded-md ${structureMode === 'several' ? 'bg-white text-primary-700 shadow-sm font-medium' : 'text-secondary-600'}`}>
            Several scales
          </button>
        </div>
      )}

      {(structureMode === 'one' || !allowSeveral) && (
        <>
          <p className="text-[11px] text-secondary-500">Mark ID and demographics. Everything else stays as items on this sheet.</p>
          <div className="relative">
            <Search className="w-4 h-4 text-secondary-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." className="w-full pl-9 pr-3 py-1.5 text-sm border border-secondary-200 rounded-lg focus:outline-none focus:border-primary-400" />
          </div>
          <div className="space-y-0.5 max-h-80 overflow-y-auto">
            {filtered.map((col) => {
              const isDemo = demoNames.has(col);
              const info = demoCols.find((d) => d.column_name === col);
              return (
                <div key={col} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md border ${isDemo ? 'border-primary-200 bg-primary-50/40' : 'border-secondary-100 bg-white'}`}>
                  <span className="flex-1 text-sm truncate" title={col}>{col}</span>
                  {isDemo && info && info.detected_by !== 'manual' && <ConfidenceBadge confidence={info.confidence} />}
                  <button type="button" onClick={() => onToggle(col, isDemo)}
                    className={`px-2 py-0.5 text-xs font-medium rounded-full ${isDemo ? 'bg-primary-600 text-white' : 'bg-secondary-200 text-secondary-600'}`}>
                    {isDemo ? 'Demo' : 'Item'}
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}

      {allowSeveral && structureMode === 'several' && (
        <div className="space-y-3">
          <p className="text-[11px] text-secondary-500">
            Click columns to assign. Demographics first, then each scale (first column, then last).
          </p>
          <div className="flex flex-wrap gap-1">
            <button type="button" onClick={() => { setActiveTarget('demos'); setRangeAnchor(null); }}
              className={`px-2 py-1 text-[11px] rounded-md border ${activeTarget === 'demos' ? 'border-primary-500 bg-primary-50 font-medium' : 'border-secondary-200'}`}>
              Demographics
            </button>
            {groups.map((g, i) => (
              <button key={g.id} type="button" onClick={() => { setActiveTarget(i); setRangeAnchor(null); }}
                className={`px-2 py-1 text-[11px] rounded-md border ${activeTarget === i ? 'border-primary-500 bg-primary-50 font-medium' : 'border-secondary-200'}`}>
                {g.name.trim() || `Scale ${i + 1}`}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1 max-h-40 overflow-y-auto p-1 border rounded-lg bg-white">
            {allColumns.map((col, idx) => (
              <button key={col} type="button" title={sampleRow?.[col] != null ? `${col}: ${String(sampleRow[col])}` : col}
                onClick={() => paintRange(idx)}
                className={`px-1.5 py-1 text-[10px] font-mono rounded border max-w-[7rem] truncate ${colColor(idx)}`}>
                {col}
              </button>
            ))}
          </div>
          <div className="space-y-2">
            {groups.map((g, i) => (
              <div key={g.id} className="flex items-center gap-2">
                <input value={g.name}
                  onChange={(e) => setGroups((prev) => prev.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                  className="flex-1 min-w-0 px-2 py-1 text-xs border rounded-md" placeholder={`Scale ${i + 1}`} />
                <span className="text-[10px] text-secondary-500 whitespace-nowrap">
                  {g.startIndex >= 0
                    ? `${allColumns[Math.min(g.startIndex, g.endIndex)]} → ${allColumns[Math.max(g.startIndex, g.endIndex)]}`
                    : 'No columns'}
                </span>
                {groups.length > 1 && (
                  <button type="button" className="text-xs text-secondary-400" onClick={() => setGroups((prev) => prev.filter((_, j) => j !== i))}>×</button>
                )}
              </div>
            ))}
            <button type="button" className="text-xs text-primary-700 hover:underline"
              onClick={() => setGroups((prev) => [...prev, { id: `g${Date.now()}`, name: `Scale ${prev.length + 1}`, startIndex: -1, endIndex: -1 }])}>
              + Add scale
            </button>
          </div>
          <Button size="sm" className="w-full" disabled={!canCreate || creatingSheets}
            onClick={() => onCreateSheets(groups.filter((g) => g.startIndex >= 0), [...demoNames])}>
            {creatingSheets ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            Create {groups.filter((g) => g.startIndex >= 0).length} sheet{groups.filter((g) => g.startIndex >= 0).length === 1 ? '' : 's'}
          </Button>
        </div>
      )}
    </div>
  );
}
