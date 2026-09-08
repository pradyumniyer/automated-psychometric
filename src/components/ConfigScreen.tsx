// Configuration & Scoring screen — the single-screen workbench.
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Upload, FileSpreadsheet, BarChart3, History as HistoryIcon, Plus, Trash2, ArrowRight,
  Check, AlertTriangle, FileDown, Sparkles,
  Tag, X, Info, Loader2, Search,
  Link2, Unlink, Calculator, Layers, Sliders, Users,
  PanelLeftOpen, Sigma, TrendingUp, ShieldCheck,
} from 'lucide-react';
import {
  supabase, Project, Dataset, DemographicColumn, SubscaleGroup, SubscaleItem,
  ResponseScale, InterpretationBand, Template, TemplateDefinition,
  ActionHistory,
} from '@/lib/supabase';
import { logAction, fetchHistory, deleteAction } from '@/lib/history';
import { getSheetInfo, parseSheet, exportToCSV, exportToXLSX } from '@/lib/fileParser';
import { scoreDataset, SubscaleConfig, BandConfig } from '@/scientific/scoring';
import { detectDemographics, detectScale, COMMON_LIKERT_SCALES, LikertCategory } from '@/scientific/detection';
import { evaluateFormula, validateFormula } from '@/scientific/formula';
import { validateBands, suggestBands } from '@/scientific/bandValidation';
import {
  buildTemplateDefinition,
  matchTemplateToHeaders,
  formatMatchSummary,
  type TemplateMatchReport,
} from '@/lib/templates';
import { Button, Card, Modal, ConfidenceBadge, StatusBadge, EmptyState, Tooltip } from './ui';
import { LiveGrid, GridColumn, GridGroup } from './LiveGrid';

interface SubscaleState {
  id: string; name: string; items: SubscaleItem[];
  scoringMethod: 'sum' | 'mean' | 'custom';
  customFormula: string;
  scaleType: 'numeric' | 'categorical';
  minValue: number | null; maxValue: number | null;
  labelMap: { label: string; value: number }[];
  displayOrder: number;
}
interface BandState { name: string; minScore: number; maxScore: number; color: string; }
interface SheetInfo { name: string; rows: number; cols: number; }

type SaveState = 'idle' | 'saving' | 'saved';

export function ConfigScreen({
  project, highlightRowIndex, onClearHighlight,
  excludedRows: sharedExcludedRows, onToggleRowExclusion, onSetExcludedRows,
  onGoToQuality, sharedDatasetId, onDatasetChange,
}: {
  project: Project;
  highlightRowIndex: number | null;
  onClearHighlight: () => void;
  excludedRows: Set<number>;
  onToggleRowExclusion: (rowIndex: number) => void;
  onSetExcludedRows: (rows: Set<number>) => void;
  onGoToQuality: () => void;
  sharedDatasetId: string | null;
  onDatasetChange: (id: string | null) => void;
}) {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [activeDatasetIdState, setActiveDatasetIdState] = useState<string | null>(null);
  const activeDatasetId = sharedDatasetId ?? activeDatasetIdState;
  const setActiveDatasetId = (id: string | null) => {
    setActiveDatasetIdState(id);
    onDatasetChange(id);
  };
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [demoCols, setDemoCols] = useState<DemographicColumn[]>([]);
  const [subscaleStates, setSubscaleStates] = useState<SubscaleState[]>([]);
  const [bandStates, setBandStates] = useState<Record<string, BandState[]>>({});
  const [scoringResult, setScoringResult] = useState<ReturnType<typeof scoreDataset> | null>(null);
  const [overallScale, setOverallScale] = useState<SubscaleState>({
    id: 'overall', name: 'Overall Scale', items: [], scoringMethod: 'sum', customFormula: '',
    scaleType: 'numeric', minValue: 1, maxValue: 5, labelMap: [], displayOrder: 0,
  });
  const [history, setHistory] = useState<ActionHistory[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [linkedTemplate, setLinkedTemplate] = useState<Template | null>(null);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [showExcludedOnly, setShowExcludedOnly] = useState(false);
  const [importing, setImporting] = useState(false);
  const [scoring, setScoring] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [sheetInfos, setSheetInfos] = useState<SheetInfo[] | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [checkedSheets, setCheckedSheets] = useState<Set<string>>(new Set());
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [activeSubscaleId, setActiveSubscaleId] = useState<string | null>(null);
  const [showSummarySum, setShowSummarySum] = useState(false);
  const [showSummaryMean, setShowSummaryMean] = useState(false);
  const [activeStep, setActiveStep] = useState<'demographics' | 'subscales' | 'scales' | 'bands' | 'scoring'>('demographics');
  const [leftPanelWidth, setLeftPanelWidth] = useState(280);
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [collapsedWidth, setCollapsedWidth] = useState(280);
  const [configDirty, setConfigDirty] = useState(false);
  const [showUpdateTemplate, setShowUpdateTemplate] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const highlightRef = useRef<HTMLTableRowElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveStateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (highlightRowIndex != null && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const timer = setTimeout(() => onClearHighlight(), 5000);
      return () => clearTimeout(timer);
    }
  }, [highlightRowIndex, onClearHighlight]);

  // ── Load datasets ──
  const loadDatasets = useCallback(async () => {
    const { data } = await supabase.from('datasets').select('*').eq('project_id', project.id).order('created_at', { ascending: true });
    const dsList = (data || []) as Dataset[];
    setDatasets(dsList);
    if (dsList.length > 0 && !activeDatasetId) setActiveDatasetId(dsList[0].id);
    const { data: tmplData } = await supabase.from('templates').select('*').order('name');
    if (tmplData) setTemplates(tmplData as Template[]);
  }, [project.id, activeDatasetId]);

  useEffect(() => { loadDatasets(); }, [loadDatasets]);

  // ── Load config for active dataset ──
  const loadDatasetConfig = useCallback(async () => {
    if (!activeDatasetId) { setDataset(null); return; }
    const ds = datasets.find((d) => d.id === activeDatasetId);
    if (!ds) { setDataset(null); return; }
    setDataset(ds);
    setConfigDirty(false);
    setShowUpdateTemplate(false);

    // Load linked template
    if (ds.linked_template_id) {
      const { data: tmpl } = await supabase.from('templates').select('*').eq('id', ds.linked_template_id).maybeSingle();
      setLinkedTemplate(tmpl as Template | null);
    } else {
      setLinkedTemplate(null);
    }

    const [{ data: demoData }, { data: subData }, { data: scoreData }] = await Promise.all([
      supabase.from('demographic_columns').select('*').eq('dataset_id', activeDatasetId),
      supabase.from('subscale_groups').select('*').eq('dataset_id', activeDatasetId).order('display_order'),
      supabase.from('scoring_results').select('*').eq('dataset_id', activeDatasetId).order('version', { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (demoData) setDemoCols(demoData as DemographicColumn[]);
    else setDemoCols([]);
    if (subData) {
      const subs = subData as SubscaleGroup[];
      const states: SubscaleState[] = [];
      const bands: Record<string, BandState[]> = {};
      for (const sub of subs) {
        const [{ data: scaleData }, { data: bandData }] = await Promise.all([
          supabase.from('response_scales').select('*').eq('subscale_id', sub.id).maybeSingle(),
          supabase.from('interpretation_bands').select('*').eq('subscale_id', sub.id).order('display_order'),
        ]);
        const scale = scaleData as ResponseScale | null;
        states.push({
          id: sub.id, name: sub.name, items: sub.items || [],
          scoringMethod: (sub.scoring_method as 'sum' | 'mean' | 'custom') || 'sum',
          customFormula: sub.custom_formula || '',
          scaleType: (scale?.scale_type as 'numeric' | 'categorical') || 'numeric',
          minValue: scale?.min_value ?? null, maxValue: scale?.max_value ?? null,
          labelMap: scale?.label_map || [],
          displayOrder: sub.display_order || 0,
        });
        if (bandData) bands[sub.name] = (bandData as InterpretationBand[]).map((b) => ({ name: b.name, minScore: b.min_score, maxScore: b.max_score, color: b.color }));
      }
      setSubscaleStates(states);
      setBandStates(bands);
    } else {
      setSubscaleStates([]);
      setBandStates({});
    }
    if (scoreData) {
      const sr = scoreData as { headers: string[]; rows: Record<string, unknown>[]; excluded_rows: number[] };
      onSetExcludedRows(new Set(sr.excluded_rows || []));
      setScoringResult({ headers: sr.headers, rows: sr.rows as Record<string, number | string | null>[], subscaleScores: {}, interpretationLabels: {}, excludedRowIndices: sr.excluded_rows || [], configSnapshot: { subscales: [], bands: {} } });
    } else {
      onSetExcludedRows(new Set());
      setScoringResult(null);
    }
    if (subData && (subData as SubscaleGroup[]).length === 0 && ds) {
      const demoNames = new Set((demoData || []).map((d) => d.column_name));
      const itemCols = ds.headers.filter((h) => !demoNames.has(h));
      if (itemCols.length > 0) {
        const det = detectScale(ds.headers, ds.rows as Record<string, unknown>[], itemCols);
        setOverallScale({
          id: 'overall', name: 'Overall Scale', items: itemCols.map((col, i) => ({ column: col, order: i, reverse: false })),
          scoringMethod: 'sum', customFormula: '', scaleType: det.scaleType, minValue: det.minValue, maxValue: det.maxValue,
          labelMap: det.scaleType === 'categorical' ? det.uniqueValues.map((label, i) => ({ label, value: i + 1 })) : [], displayOrder: 0,
        });
      }
    }
    const hist = await fetchHistory(activeDatasetId);
    setHistory(hist);
  }, [activeDatasetId, datasets]);

  useEffect(() => { loadDatasetConfig(); }, [loadDatasetConfig]);

  // ── Derived state ──
  const demoColumnNames = useMemo(() => new Set(demoCols.map((d) => d.column_name)), [demoCols]);
  const allColumns = dataset?.headers || [];
  const itemColumns = allColumns.filter((c) => !demoColumnNames.has(c));
  const unassignedItems = itemColumns.filter((col) => !subscaleStates.some((s) => s.items.some((item) => item.column === col)));

  // ── Auto-save (debounced) ──
  const performAutoSave = useCallback(async () => {
    if (!dataset || !configDirty) return;
    setSaveState('saving');
    try {
      for (const sub of subscaleStates) {
        await supabase.from('subscale_groups').update({
          name: sub.name, items: sub.items, scoring_method: sub.scoringMethod,
          custom_formula: sub.scoringMethod === 'custom' ? sub.customFormula : null,
          display_order: sub.displayOrder,
        }).eq('id', sub.id);
        const { data: es } = await supabase.from('response_scales').select('id').eq('subscale_id', sub.id).maybeSingle();
        const sd = { project_id: project.id, dataset_id: dataset.id, subscale_id: sub.id, scale_type: sub.scaleType, min_value: sub.minValue, max_value: sub.maxValue, label_map: sub.labelMap };
        if (es) await supabase.from('response_scales').update(sd).eq('id', es.id);
        else await supabase.from('response_scales').insert(sd);
        await supabase.from('interpretation_bands').delete().eq('subscale_id', sub.id);
        const bands = bandStates[sub.name] || [];
        for (let i = 0; i < bands.length; i++) {
          await supabase.from('interpretation_bands').insert({ project_id: project.id, dataset_id: dataset.id, subscale_id: sub.id, name: bands[i].name, min_score: bands[i].minScore, max_score: bands[i].maxScore, color: bands[i].color, display_order: i });
        }
      }
      // Save excluded rows to the latest scoring result if it exists
      setConfigDirty(false);
      setShowUpdateTemplate(!!linkedTemplate);
      setSaveState('saved');
      if (saveStateTimerRef.current) clearTimeout(saveStateTimerRef.current);
      saveStateTimerRef.current = setTimeout(() => setSaveState('idle'), 2000);
    } catch {
      setSaveState('idle');
      setStatusMsg({ type: 'error', text: 'Auto-save failed. Your changes may not be persisted.' });
    }
  }, [dataset, configDirty, subscaleStates, bandStates, project.id, linkedTemplate]);

  // Debounce auto-save: trigger 1s after configDirty becomes true
  useEffect(() => {
    if (!configDirty) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSaveState('saving');
    saveTimerRef.current = setTimeout(() => { performAutoSave(); }, 1000);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [configDirty, performAutoSave]);

  const markDirty = useCallback(() => {
    setConfigDirty(true);
  }, []);

  // ── File import ──
  const handleFileSelected = async (file: File) => {
    setImporting(true); setStatusMsg(null);
    try {
      const info = await getSheetInfo(file);
      if (info.sheets.length > 1) {
        setPendingFile(file); setSheetInfos(info.sheets);
        setCheckedSheets(new Set(info.sheets.map((s) => s.name))); setImporting(false);
      } else if (info.sheets.length === 1) {
        await doImport(file, info.sheets[0].name);
      } else { setStatusMsg({ type: 'error', text: 'No sheets found in file.' }); setImporting(false); }
    } catch (e) { setStatusMsg({ type: 'error', text: `Failed to read file: ${(e as Error).message}` }); setImporting(false); }
  };

  const doImport = async (file: File, sheetName: string) => {
    setImporting(true); setSheetInfos(null); setPendingFile(null);
    try {
      const parsed = await parseSheet(file, sheetName);
      if (parsed.rows.length === 0) { setStatusMsg({ type: 'error', text: 'No data rows found.' }); setImporting(false); return; }
      const { data: newDs, error } = await supabase.from('datasets').insert({
        project_id: project.id, file_name: file.name, sheet_name: sheetName,
        headers: parsed.headers, rows: parsed.rows, column_meta: {},
        row_count: parsed.rowCount, col_count: parsed.colCount,
      }).select().single();
      if (error) throw error;
      const newDataset = newDs as Dataset;
      const demoSuggestions = detectDemographics(parsed.headers, parsed.rows);
      for (const s of demoSuggestions) await supabase.from('demographic_columns').insert({ project_id: project.id, dataset_id: newDataset.id, column_name: s.column, detected_by: s.rule, confidence: s.confidence, confirmed: s.confidence >= 0.5 });
      await logAction(project.id, 'import', `Imported ${file.name} [${sheetName}] (${parsed.rowCount} rows, ${parsed.colCount} cols)`, { fileName: file.name, sheetName }, null, newDataset.id);
      setStatusMsg({ type: 'success', text: `Imported ${parsed.rowCount} rows × ${parsed.colCount} columns from sheet "${sheetName}".` });
      await loadDatasets(); setActiveDatasetId(newDataset.id);
    } catch (e) { setStatusMsg({ type: 'error', text: `Import failed: ${(e as Error).message}` }); }
    setImporting(false);
  };

  const importSelectedSheets = async () => {
    if (!pendingFile || checkedSheets.size === 0) return;
    setImporting(true); setSheetInfos(null);
    try {
      for (const sheetName of checkedSheets) {
        const parsed = await parseSheet(pendingFile, sheetName);
        if (parsed.rows.length === 0) continue;
        const { data: newDs, error } = await supabase.from('datasets').insert({
          project_id: project.id, file_name: pendingFile.name, sheet_name: sheetName,
          headers: parsed.headers, rows: parsed.rows, column_meta: {},
          row_count: parsed.rowCount, col_count: parsed.colCount,
        }).select().single();
        if (error) throw error;
        const newDataset = newDs as Dataset;
        const demoSuggestions = detectDemographics(parsed.headers, parsed.rows);
        for (const s of demoSuggestions) await supabase.from('demographic_columns').insert({ project_id: project.id, dataset_id: newDataset.id, column_name: s.column, detected_by: s.rule, confidence: s.confidence, confirmed: s.confidence >= 0.5 });
        await logAction(project.id, 'import', `Imported ${pendingFile.name} [${sheetName}] (${parsed.rowCount} rows, ${parsed.colCount} cols)`, { fileName: pendingFile.name, sheetName }, null, newDataset.id);
      }
      setStatusMsg({ type: 'success', text: `Imported ${checkedSheets.size} sheet${checkedSheets.size > 1 ? 's' : ''} successfully.` });
      await loadDatasets();
    } catch (e) { setStatusMsg({ type: 'error', text: `Import failed: ${(e as Error).message}` }); }
    setPendingFile(null); setImporting(false);
  };

  // ── Demographics ──
  const toggleDemographic = async (col: string, isDemo: boolean) => {
    if (!dataset) return;
    if (isDemo) {
      const existing = demoCols.find((d) => d.column_name === col);
      if (existing) await supabase.from('demographic_columns').delete().eq('id', existing.id);
    } else {
      await supabase.from('demographic_columns').insert({ project_id: project.id, dataset_id: dataset.id, column_name: col, detected_by: 'manual', confidence: 1.0, confirmed: true });
    }
    await logAction(project.id, 'demographic_toggle', `${isDemo ? 'Removed' : 'Added'} demographic: ${col}`, { column: col, action: isDemo ? 'remove' : 'add' }, null, dataset.id);
    await loadDatasetConfig();
  };

  const markAllAsItems = async () => {
    if (!dataset) return;
    await supabase.from('demographic_columns').delete().eq('dataset_id', dataset.id);
    await logAction(project.id, 'demographic_bulk', 'Marked all columns as items', {}, null, dataset.id);
    await loadDatasetConfig();
  };

  const deleteDataset = async (dsId: string) => {
    const ds = datasets.find((d) => d.id === dsId);
    if (!ds) return;
    if (!window.confirm(`Delete sheet "${ds.sheet_name || ds.file_name}"? This removes all its configuration and scoring data.`)) return;
    await supabase.from('datasets').delete().eq('id', dsId);
    await logAction(project.id, 'sheet_delete', `Deleted sheet: ${ds.sheet_name || ds.file_name}`, { datasetId: dsId }, null, dsId);
    const remaining = datasets.filter((d) => d.id !== dsId);
    setDatasets(remaining);
    if (activeDatasetId === dsId) setActiveDatasetId(remaining.length > 0 ? remaining[0].id : null);
    setStatusMsg({ type: 'info', text: `Deleted sheet "${ds.sheet_name || ds.file_name}".` });
  };

  // ── Subscales ──
  const addSubscale = async () => {
    if (!dataset) return;
    const name = `Subscale ${subscaleStates.length + 1}`;
    const order = subscaleStates.length;
    const { data, error } = await supabase.from('subscale_groups').insert({ project_id: project.id, dataset_id: dataset.id, name, items: [], scoring_method: 'sum', display_order: order }).select().single();
    if (error) return;
    const newSub = data as SubscaleGroup;
    setSubscaleStates([...subscaleStates, { id: newSub.id, name, items: [], scoringMethod: 'sum', customFormula: '', scaleType: 'numeric', minValue: 1, maxValue: 5, labelMap: [], displayOrder: order }]);
    await logAction(project.id, 'subscale_create', `Created subscale: ${name}`, {}, null, dataset.id);
    const hist = await fetchHistory(dataset.id); setHistory(hist);
  };

  const deleteSubscale = async (id: string) => {
    if (!dataset) return;
    const sub = subscaleStates.find((s) => s.id === id);
    await supabase.from('subscale_groups').delete().eq('id', id);
    const updated = subscaleStates.filter((s) => s.id !== id).map((s, i) => ({ ...s, displayOrder: i }));
    setSubscaleStates(updated);
    if (sub) { const nb = { ...bandStates }; delete nb[sub.name]; setBandStates(nb); }
    await logAction(project.id, 'subscale_delete', `Deleted subscale: ${sub?.name || id}`, {}, null, dataset.id);
    const hist = await fetchHistory(dataset.id); setHistory(hist);
    markDirty();
  };

  const renameSubscale = (id: string, name: string) => {
    const oldName = subscaleStates.find((s) => s.id === id)?.name;
    setSubscaleStates(subscaleStates.map((s) => s.id === id ? { ...s, name } : s));
    if (oldName && bandStates[oldName]) {
      const nb = { ...bandStates };
      nb[name] = nb[oldName]; delete nb[oldName];
      setBandStates(nb);
    }
    markDirty();
  };

  const addItemToSubscale = (subscaleId: string, column: string) => {
    setSubscaleStates(subscaleStates.map((s) => {
      if (s.id !== subscaleId) return s;
      if (s.items.some((i) => i.column === column)) return s;
      return { ...s, items: [...s.items, { column, order: s.items.length, reverse: false }] };
    }));
    markDirty();
  };

  const batchAddItems = (subscaleId: string, columns: string[]) => {
    setSubscaleStates(subscaleStates.map((s) => {
      if (s.id !== subscaleId) return s;
      const existing = new Set(s.items.map((i) => i.column));
      const newItems = columns.filter((c) => !existing.has(c)).map((c) => ({ column: c, order: s.items.length, reverse: false }));
      return { ...s, items: [...s.items, ...newItems] };
    }));
    setSelectedItems(new Set());
    markDirty();
  };

  const removeItemFromSubscale = (subscaleId: string, column: string) => {
    setSubscaleStates(subscaleStates.map((s) => s.id !== subscaleId ? s : { ...s, items: s.items.filter((i) => i.column !== column).map((i, idx) => ({ ...i, order: idx })) }));
    markDirty();
  };

  const toggleReverse = (subscaleId: string, column: string) => {
    setSubscaleStates(subscaleStates.map((s) => s.id !== subscaleId ? s : { ...s, items: s.items.map((i) => i.column === column ? { ...i, reverse: !i.reverse } : i) }));
    markDirty();
  };

  const moveItem = (subscaleId: string, index: number, dir: 'up' | 'down') => {
    setSubscaleStates(subscaleStates.map((s) => {
      if (s.id !== subscaleId) return s;
      const items = [...s.items]; const si = dir === 'up' ? index - 1 : index + 1;
      if (si < 0 || si >= items.length) return s;
      [items[index], items[si]] = [items[si], items[index]];
      return { ...s, items: items.map((i, idx) => ({ ...i, order: idx })) };
    }));
    markDirty();
  };

  const setScoringMethod = (id: string, m: 'sum' | 'mean' | 'custom') => { setSubscaleStates(subscaleStates.map((s) => s.id === id ? { ...s, scoringMethod: m } : s)); markDirty(); };
  const setCustomFormula = (id: string, f: string) => { setSubscaleStates(subscaleStates.map((s) => s.id === id ? { ...s, customFormula: f } : s)); markDirty(); };
  const setScaleType = (id: string, t: 'numeric' | 'categorical') => { setSubscaleStates((prev) => prev.map((s) => s.id === id ? { ...s, scaleType: t } : s)); markDirty(); };
  const setScaleRange = (id: string, min: number | null, max: number | null) => { setSubscaleStates((prev) => prev.map((s) => s.id === id ? { ...s, minValue: min, maxValue: max } : s)); markDirty(); };
  const setLabelMap = (id: string, lm: { label: string; value: number }[]) => { setSubscaleStates((prev) => prev.map((s) => s.id === id ? { ...s, labelMap: lm } : s)); markDirty(); };

  const autoDetectScale = (subscaleId: string) => {
    const sub = subscaleStates.find((s) => s.id === subscaleId);
    if (!sub || !dataset) return;
    const det = detectScale(dataset.headers, dataset.rows as Record<string, unknown>[], sub.items.map((i) => i.column));
    setSubscaleStates((prev) => prev.map((s) => s.id !== subscaleId ? s : {
      ...s, scaleType: det.scaleType, minValue: det.minValue, maxValue: det.maxValue,
      labelMap: det.scaleType === 'categorical' ? det.uniqueValues.map((label, i) => ({ label, value: i + 1 })) : [],
    }));
    setStatusMsg({ type: 'success', text: det.suggestion });
    markDirty();
  };

  const applyScaleToAll = () => {
    if (subscaleStates.length === 0) return;
    const first = subscaleStates[0];
    setSubscaleStates((prev) => prev.map((s) => ({
      ...s, scaleType: first.scaleType, minValue: first.minValue, maxValue: first.maxValue,
      labelMap: first.labelMap.map((lm) => ({ ...lm })), scoringMethod: first.scoringMethod,
    })));
    setStatusMsg({ type: 'success', text: `Applied "${first.name}" scale config to all ${subscaleStates.length} subscales.` });
    markDirty();
  };

  // ── Bands ──
  const addBand = (sn: string) => { setBandStates({ ...bandStates, [sn]: [...(bandStates[sn] || []), { name: 'New Band', minScore: 0, maxScore: 0, color: '#14b8a6' }] }); markDirty(); };
  const updateBand = (sn: string, i: number, f: keyof BandState, v: string | number) => { setBandStates({ ...bandStates, [sn]: (bandStates[sn] || []).map((b, j) => j === i ? { ...b, [f]: v } : b) }); markDirty(); };
  const removeBand = (sn: string, i: number) => { setBandStates({ ...bandStates, [sn]: (bandStates[sn] || []).filter((_, j) => j !== i) }); markDirty(); };

  const autoSuggestBands = (sn: string, maxScore: number) => {
    const suggested = suggestBands(maxScore, 3);
    setBandStates({ ...bandStates, [sn]: suggested });
    markDirty();
  };

  // ── Row exclusion (delegates to shared state in App) ──
  const toggleRowExclusion = async (rowIndex: number) => {
    if (!dataset) return;
    const wasExcluded = sharedExcludedRows.has(rowIndex);
    onToggleRowExclusion(rowIndex);
    await logAction(project.id, 'row_exclude_toggle',
      `${wasExcluded ? 'Included' : 'Excluded'} row ${rowIndex + 1}`,
      { rowIndex, action: wasExcluded ? 'include' : 'exclude' },
      { rowIndex, wasExcluded },
      dataset.id,
    );
    const hist = await fetchHistory(dataset.id); setHistory(hist);
  };

  // ── Scoring ──
  const runScoring = async () => {
    if (!dataset) return;
    setScoring(true); setStatusMsg(null);
    try {
      let subConfigs: SubscaleConfig[] = subscaleStates.map((s) => ({
        id: s.id, name: s.name, items: s.items, scoringMethod: s.scoringMethod,
        customFormula: s.scoringMethod === 'custom' ? s.customFormula : null,
        responseScale: { scaleType: s.scaleType, minValue: s.minValue ?? undefined, maxValue: s.maxValue ?? undefined, labelMap: s.labelMap },
      }));
      const bandConfigs: Record<string, BandConfig[]> = {};
      if (subConfigs.length === 0) {
        subConfigs = [{
          id: overallScale.id, name: overallScale.name,
          items: overallScale.items, scoringMethod: overallScale.scoringMethod,
          customFormula: overallScale.scoringMethod === 'custom' ? overallScale.customFormula : null,
          responseScale: { scaleType: overallScale.scaleType, minValue: overallScale.minValue ?? undefined, maxValue: overallScale.maxValue ?? undefined, labelMap: overallScale.labelMap },
        }];
        bandConfigs[overallScale.name] = (bandStates[overallScale.name] || []).map((b) => ({ name: b.name, minScore: b.minScore, maxScore: b.maxScore, color: b.color }));
      } else {
        for (const sub of subscaleStates) bandConfigs[sub.name] = (bandStates[sub.name] || []).map((b) => ({ name: b.name, minScore: b.minScore, maxScore: b.maxScore, color: b.color }));
      }
      const result = scoreDataset(dataset.rows as Record<string, unknown>[], dataset.headers, subConfigs, bandConfigs, Array.from(sharedExcludedRows));
      setScoringResult(result);
      const { data: ls } = await supabase.from('scoring_results').select('version').eq('dataset_id', dataset.id).order('version', { ascending: false }).limit(1).maybeSingle();
      const nv = (ls?.version || 0) + 1;
      await supabase.from('scoring_results').insert({ project_id: project.id, dataset_id: dataset.id, version: nv, headers: result.headers, rows: result.rows, config_snapshot: { subscales: subConfigs, bands: bandConfigs }, excluded_rows: Array.from(sharedExcludedRows) });
      await logAction(project.id, 'scoring', `Scored data (v${nv}, ${result.rows.length} rows, ${sharedExcludedRows.size} excluded)`, { version: nv, excludedCount: sharedExcludedRows.size }, null, dataset.id);
      setStatusMsg({ type: 'success', text: `Scoring complete (v${nv}). ${sharedExcludedRows.size} rows excluded.` });
      const hist = await fetchHistory(dataset.id); setHistory(hist);
    } catch (e) { setStatusMsg({ type: 'error', text: `Scoring failed: ${(e as Error).message}` }); }
    setScoring(false);
  };

  // ── Templates ──
  const saveAsTemplate = async (name: string, description: string, instrument: string) => {
    if (subscaleStates.length === 0) {
      setStatusMsg({ type: 'error', text: 'Add at least one subscale before saving a template.' });
      return;
    }
    const def = buildTemplateDefinition(subscaleStates, bandStates);
    const { error } = await supabase.from('templates').insert({
      name: name.trim(),
      description: description.trim(),
      instrument: instrument.trim(),
      definition: def,
      version: 1,
    });
    if (error) { setStatusMsg({ type: 'error', text: `Failed: ${error.message}` }); return; }
    await logAction(project.id, 'template_save', `Saved template: ${name.trim()}`);
    const { data: tmplData } = await supabase.from('templates').select('*').order('name');
    if (tmplData) setTemplates(tmplData as Template[]);
    setStatusMsg({
      type: 'success',
      text: `Template "${name.trim()}" saved (instrument behaviour only — demographics stay dataset-specific).`,
    });
    setShowTemplateModal(false);
  };

  const applyTemplate = async (template: Template) => {
    if (!dataset) return;
    const def = template.definition as TemplateDefinition;
    if (!def?.subscales?.length) {
      setStatusMsg({ type: 'error', text: 'This template has no subscales to apply.' });
      return;
    }

    // Match report first (does not write yet)
    const report: TemplateMatchReport = matchTemplateToHeaders(template.name, def, dataset.headers);
    if (report.matchedCount === 0) {
      setStatusMsg({
        type: 'error',
        text: `Could not map any items from "${template.name}" to this dataset's columns. Check item names/aliases.`,
      });
      return;
    }
    if (report.unmatchedCount > 0) {
      const ok = window.confirm(
        `${formatMatchSummary(report)}\n\nApply anyway? Unmatched items will be omitted from subscales.`,
      );
      if (!ok) return;
    } else if (subscaleStates.length > 0) {
      const ok = window.confirm(
        `Apply template "${template.name}"? This replaces the current subscale configuration for this dataset.\n\nDemographics will be re-detected independently (not taken from the template).`,
      );
      if (!ok) return;
    }

    // Demographics: always re-detect for this dataset (never copy from template)
    await supabase.from('demographic_columns').delete().eq('dataset_id', dataset.id);
    const demoSuggestions = detectDemographics(dataset.headers, dataset.rows as Record<string, unknown>[]);
    for (const s of demoSuggestions) {
      await supabase.from('demographic_columns').insert({
        project_id: project.id,
        dataset_id: dataset.id,
        column_name: s.column,
        detected_by: s.rule,
        confidence: s.confidence,
        confirmed: s.confidence >= 0.5,
      });
    }

    // Replace subscales for this dataset
    await supabase.from('subscale_groups').delete().eq('dataset_id', dataset.id);
    // response_scales / bands cascade via subscale_id in many setups; delete orphans if tables allow
    const ns: SubscaleState[] = [];
    const nextBands: Record<string, { name: string; minScore: number; maxScore: number; color: string }[]> = {};

    for (const sd of def.subscales) {
      const matched = report.matchedBySubscale[sd.name] || [];
      const { data: ng } = await supabase
        .from('subscale_groups')
        .insert({
          project_id: project.id,
          dataset_id: dataset.id,
          name: sd.name,
          items: matched,
          scoring_method: sd.scoringMethod,
          custom_formula: sd.customFormula || null,
          display_order: ns.length,
        })
        .select()
        .single();
      if (!ng) continue;
      const nid = (ng as SubscaleGroup).id;
      const scaleDef = def.responseScales?.find((rs) => rs.subscaleName === sd.name);
      const bandDef = def.interpretationBands?.find((ib) => ib.subscaleName === sd.name);
      ns.push({
        id: nid,
        name: sd.name,
        items: matched,
        scoringMethod: sd.scoringMethod,
        customFormula: sd.customFormula || '',
        scaleType: scaleDef?.scaleType || 'numeric',
        minValue: scaleDef?.minValue ?? null,
        maxValue: scaleDef?.maxValue ?? null,
        labelMap: scaleDef?.labelMap || [],
        displayOrder: ns.length,
      });
      if (scaleDef) {
        await supabase.from('response_scales').insert({
          project_id: project.id,
          dataset_id: dataset.id,
          subscale_id: nid,
          scale_type: scaleDef.scaleType,
          min_value: scaleDef.minValue,
          max_value: scaleDef.maxValue,
          label_map: scaleDef.labelMap,
        });
      }
      if (bandDef?.bands?.length) {
        for (let i = 0; i < bandDef.bands.length; i++) {
          await supabase.from('interpretation_bands').insert({
            project_id: project.id,
            dataset_id: dataset.id,
            subscale_id: nid,
            name: bandDef.bands[i].name,
            min_score: bandDef.bands[i].minScore,
            max_score: bandDef.bands[i].maxScore,
            color: bandDef.bands[i].color,
            display_order: i,
          });
        }
        nextBands[sd.name] = bandDef.bands.map((b) => ({
          name: b.name,
          minScore: b.minScore,
          maxScore: b.maxScore,
          color: b.color,
        }));
      }
    }

    setSubscaleStates(ns);
    setBandStates(nextBands);
    await supabase.from('datasets').update({ linked_template_id: template.id }).eq('id', dataset.id);
    setLinkedTemplate(template);
    await logAction(
      project.id,
      'template_apply',
      `Applied template: ${template.name} (v${template.version}) — ${report.matchedCount}/${report.totalItems} items matched`,
      { templateId: template.id, matchReport: { matched: report.matchedCount, total: report.totalItems, unmatched: report.unmatchedNames } },
      null,
      dataset.id,
    );
    setStatusMsg({
      type: report.unmatchedCount === 0 ? 'success' : 'info',
      text: formatMatchSummary(report),
    });
    setShowTemplateModal(false);
    await loadDatasetConfig();
  };

  const updateLinkedTemplate = async () => {
    if (!dataset || !linkedTemplate) return;
    if (subscaleStates.length === 0) {
      setStatusMsg({ type: 'error', text: 'Cannot update template with zero subscales.' });
      return;
    }
    const def = buildTemplateDefinition(subscaleStates, bandStates);
    const nextVersion = linkedTemplate.version + 1;
    await supabase.from('templates').update({ definition: def, version: nextVersion, updated_at: new Date().toISOString() }).eq('id', linkedTemplate.id);
    await logAction(project.id, 'template_update', `Updated template: ${linkedTemplate.name} (v${nextVersion})`, { templateId: linkedTemplate.id }, null, dataset.id);
    setLinkedTemplate({ ...linkedTemplate, version: nextVersion, definition: def });
    setShowUpdateTemplate(false);
    const { data: tmplData } = await supabase.from('templates').select('*').order('name');
    if (tmplData) setTemplates(tmplData as Template[]);
    setStatusMsg({ type: 'success', text: `Template "${linkedTemplate.name}" updated to v${nextVersion}.` });
  };

  const unlinkTemplate = async () => {
    if (!dataset) return;
    await supabase.from('datasets').update({ linked_template_id: null }).eq('id', dataset.id);
    setLinkedTemplate(null);
    setShowUpdateTemplate(false);
    setStatusMsg({ type: 'info', text: 'Template unlinked. Changes will no longer update the template.' });
  };

  const handleExport = (fmt: 'csv' | 'xlsx') => {
    if (!scoringResult || !dataset) return;
    const fn = `${project.name}_${dataset.sheet_name || 'data'}_scored.${fmt}`;
    if (fmt === 'csv') exportToCSV(scoringResult.headers, scoringResult.rows, fn);
    else exportToXLSX(scoringResult.headers, scoringResult.rows, fn);
  };

  const undoAction = async (action: ActionHistory) => {
    if (!dataset) return;
    if (action.action_type === 'row_exclude_toggle' && action.undo_data) {
      const rowIndex = action.undo_data.rowIndex as number;
      const newSet = new Set(sharedExcludedRows);
      if (newSet.has(rowIndex)) newSet.delete(rowIndex); else newSet.add(rowIndex);
      onSetExcludedRows(newSet);
      await deleteAction(action.id);
      const hist = await fetchHistory(dataset.id); setHistory(hist);
      setStatusMsg({ type: 'info', text: `Undid: ${action.description}` });
    } else if (action.action_type === 'demographic_toggle' && action.payload) {
      const col = action.payload.column as string;
      const wasAdd = action.payload.action === 'add';
      if (wasAdd) {
        const existing = demoCols.find((d) => d.column_name === col);
        if (existing) await supabase.from('demographic_columns').delete().eq('id', existing.id);
      } else {
        await supabase.from('demographic_columns').insert({ project_id: project.id, dataset_id: dataset.id, column_name: col, detected_by: 'manual', confidence: 1.0, confirmed: true });
      }
      await deleteAction(action.id);
      await loadDatasetConfig();
      setStatusMsg({ type: 'info', text: `Undid: ${action.description}` });
    } else {
      await loadDatasetConfig();
      await deleteAction(action.id);
      setStatusMsg({ type: 'info', text: `Undid: ${action.description}` });
    }
  };

  // ── Grid construction: regrouped columns with merged headers ──
  const { groups, summary } = useMemo(() => {
    const grps: GridGroup[] = [];
    const sums: Record<string, number | null> = {};
    const means: Record<string, number | null> = {};

    if (!dataset) return { groups: grps, summary: { sums, means } };

    // Use scoring result rows if available, else raw rows
    const gridRows = scoringResult
      ? scoringResult.rows as Record<string, unknown>[]
      : dataset.rows as Record<string, unknown>[];

    // Filter out excluded rows for summary calculations
    const includedRows = gridRows.filter((_, i) => !sharedExcludedRows.has(i));

    // Demographics group
    const demoColsList = demoCols.map((d) => d.column_name).filter((c) => dataset.headers.includes(c));
    if (demoColsList.length > 0) {
      const cols: GridColumn[] = demoColsList.map((c) => ({ key: c, label: c, group: 'ID', type: 'demo' as const }));
      grps.push({ name: 'ID', columns: cols });
      for (const c of demoColsList) {
        const vals = includedRows.map((r) => Number(r[c])).filter((v) => !isNaN(v));
        sums[c] = vals.length > 0 ? vals.reduce((s, v) => s + v, 0) : null;
        means[c] = vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
      }
    }

    // Subscale groups (in display order)
    for (const sub of subscaleStates) {
      const cols: GridColumn[] = sub.items.map((item) => ({ key: item.column, label: item.column, group: sub.name, type: 'data' as const }));
      // Add score column inline
      const scoreKey = `${sub.name} Score`;
      cols.push({ key: scoreKey, label: 'Score', group: sub.name, type: 'score' as const });
      // Add interpretation column inline
      const interpKey = `${sub.name} Interpretation`;
      cols.push({ key: interpKey, label: 'Interpretation', group: sub.name, type: 'interpretation' as const });
      grps.push({ name: sub.name, columns: cols });
      // Summaries for item columns
      for (const item of sub.items) {
        const vals = includedRows.map((r) => Number(r[item.column])).filter((v) => !isNaN(v));
        sums[item.column] = vals.length > 0 ? vals.reduce((s, v) => s + v, 0) : null;
        means[item.column] = vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
      }
      // Summary for score column
      const scoreVals = includedRows.map((r) => Number(r[scoreKey])).filter((v) => !isNaN(v));
      sums[scoreKey] = scoreVals.length > 0 ? scoreVals.reduce((s, v) => s + v, 0) : null;
      means[scoreKey] = scoreVals.length > 0 ? scoreVals.reduce((s, v) => s + v, 0) / scoreVals.length : null;
    }

    // Unassigned items group
    if (unassignedItems.length > 0) {
      const cols: GridColumn[] = unassignedItems.map((c) => ({ key: c, label: c, group: 'Unassigned', type: 'data' as const }));
      grps.push({ name: 'Unassigned', columns: cols });
      for (const c of unassignedItems) {
        const vals = includedRows.map((r) => Number(r[c])).filter((v) => !isNaN(v));
        sums[c] = vals.length > 0 ? vals.reduce((s, v) => s + v, 0) : null;
        means[c] = vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
      }
    }

    // Overall Scale score at the far right (if scoring has been run with no subscales)
    if (scoringResult && subscaleStates.length === 0) {
      const overallScoreKey = 'Overall Scale Score';
      const overallInterpKey = 'Overall Scale Interpretation';
      if (scoringResult.headers.includes(overallScoreKey)) {
        grps.push({
          name: 'Overall Scale',
          columns: [
            { key: overallScoreKey, label: 'Overall Score', group: 'Overall Scale', type: 'score' as const },
            ...(scoringResult.headers.includes(overallInterpKey)
              ? [{ key: overallInterpKey, label: 'Interpretation', group: 'Overall Scale', type: 'interpretation' as const }]
              : []),
          ],
        });
        const vals = includedRows.map((r) => Number(r[overallScoreKey])).filter((v) => !isNaN(v));
        sums[overallScoreKey] = vals.length > 0 ? vals.reduce((s, v) => s + v, 0) : null;
        means[overallScoreKey] = vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
      }
    }
    // Overall Scale score when subscales exist (combined overall score)
    if (scoringResult && subscaleStates.length > 0) {
      const overallKey = 'Overall Scale Score';
      if (scoringResult.headers.includes(overallKey)) {
        grps.push({ name: 'Overall Scale', columns: [{ key: overallKey, label: 'Overall Score', group: 'Overall Scale', type: 'score' as const }] });
        const vals = includedRows.map((r) => Number(r[overallKey])).filter((v) => !isNaN(v));
        sums[overallKey] = vals.length > 0 ? vals.reduce((s, v) => s + v, 0) : null;
        means[overallKey] = vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
      }
    }

    return { groups: grps, summary: { sums, means } };
  }, [dataset, scoringResult, demoCols, subscaleStates, unassignedItems, sharedExcludedRows]);

  const displayRows = dataset ? (
    scoringResult
      ? (showExcludedOnly ? (scoringResult.rows as Record<string, unknown>[]).filter((_, i) => sharedExcludedRows.has(i)) : scoringResult.rows as Record<string, unknown>[])
      : (showExcludedOnly ? (dataset.rows as Record<string, unknown>[]).filter((_, i) => sharedExcludedRows.has(i)) : dataset.rows as Record<string, unknown>[])
  ) : [];
  const canScore = !!dataset && (subscaleStates.length === 0 || subscaleStates.every((s) => s.items.length > 0 || s.scoringMethod === 'custom'));
  const originalColCount = dataset?.col_count ?? 0;
  const computedColCount = scoringResult ? scoringResult.headers.length - originalColCount : 0;

  // Batch selection handlers
  const toggleItemSelection = (col: string) => {
    const ns = new Set(selectedItems);
    if (ns.has(col)) ns.delete(col); else ns.add(col);
    setSelectedItems(ns);
  };
  const selectAllUnassigned = () => setSelectedItems(new Set(unassignedItems));
  const clearSelection = () => setSelectedItems(new Set());

  // Formula preview for the first row
  const formulaPreview = (formula: string, itemCols: string[]): string => {
    if (!formula.trim() || !dataset) return '';
    const firstRow = dataset.rows[0] as Record<string, unknown>;
    if (!firstRow) return '';
    const valueMap: Record<string, number | null> = {};
    for (const col of itemCols) {
      const v = Number(firstRow[col]);
      valueMap[col] = isNaN(v) ? null : v;
    }
    const result = evaluateFormula(formula, valueMap);
    return result.error ? `Error: ${result.error}` : `= ${result.value?.toFixed(2)}`;
  };

  return (
    <div className="h-full flex flex-col">
      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between px-5 py-2.5 bg-white border-b border-secondary-200">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setShowHistoryPanel(!showHistoryPanel)}><HistoryIcon className="w-4 h-4" /> History</Button>
          <Button variant="ghost" size="sm" onClick={() => setShowTemplateModal(true)}><Sparkles className="w-4 h-4" /> Templates</Button>
          {linkedTemplate && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-primary-50 border border-primary-200 rounded-lg">
              <Link2 className="w-3.5 h-3.5 text-primary-600" />
              <span className="text-xs font-medium text-primary-700">Linked: {linkedTemplate.name} (v{linkedTemplate.version})</span>
              <button onClick={unlinkTemplate} className="ml-1 text-primary-400 hover:text-primary-700" title="Unlink template"><Unlink className="w-3 h-3" /></button>
            </div>
          )}
          {showUpdateTemplate && linkedTemplate && (
            <Button variant="outline" size="sm" onClick={updateLinkedTemplate}><Check className="w-3.5 h-3.5" /> Update Template</Button>
          )}
          <div className="w-px h-6 bg-secondary-200" />
          <Button variant="outline" size="sm" onClick={onGoToQuality}><ShieldCheck className="w-4 h-4" /> Data Quality</Button>
        </div>
        <div className="flex items-center gap-3">
          {/* Auto-save indicator */}
          <div className="flex items-center gap-1.5 text-sm">
            {saveState === 'saving' && <><Loader2 className="w-3.5 h-3.5 text-secondary-400 animate-spin" /><span className="text-secondary-500">Saving...</span></>}
            {saveState === 'saved' && <><Check className="w-3.5 h-3.5 text-success-600" /><span className="text-success-600">Saved</span></>}
          </div>
          <div className="w-px h-6 bg-secondary-200" />
          {/* Summary toggles */}
          <div className="flex items-center gap-1 bg-secondary-100 rounded-lg p-0.5">
            {([
              { key: 'sum' as const, icon: Sigma, label: 'Sum', active: showSummarySum, toggle: () => setShowSummarySum((v) => !v) },
              { key: 'mean' as const, icon: TrendingUp, label: 'Mean', active: showSummaryMean, toggle: () => setShowSummaryMean((v) => !v) },
            ] as const).map(({ key, icon: Icon, label, active, toggle }) => (
              <button
                key={key}
                onClick={toggle}
                disabled={!scoringResult}
                className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md transition-all ${active && scoringResult ? 'bg-white text-primary-700 shadow-sm' : 'text-secondary-500 hover:text-secondary-700'} ${!scoringResult ? 'opacity-40 cursor-not-allowed' : ''}`}
                title={`Show ${label} row${!scoringResult ? ' (available after scoring)' : ''}`}
              >
                <Icon className="w-3.5 h-3.5" /> {label}
              </button>
            ))}
          </div>
          <div className="w-px h-6 bg-secondary-200" />
          {scoringResult && (
            <>
              <Button variant="outline" size="sm" onClick={() => handleExport('csv')}><FileDown className="w-3.5 h-3.5" /> CSV</Button>
              <Button variant="outline" size="sm" onClick={() => handleExport('xlsx')}><FileDown className="w-3.5 h-3.5" /> XLSX</Button>
            </>
          )}
        </div>
      </div>

      {/* ── Sheet tabs ── */}
      {datasets.length > 0 && (
        <div className="flex items-center gap-1 px-5 py-1.5 bg-secondary-50 border-b border-secondary-200 overflow-x-auto">
          {datasets.map((ds) => (
            <div key={ds.id} className={`flex items-center gap-1.5 px-3 py-1 text-sm rounded-md whitespace-nowrap transition-colors ${activeDatasetId === ds.id ? 'bg-primary-100 text-primary-700 border border-primary-300' : 'text-secondary-600 hover:bg-secondary-100 border border-transparent'}`}>
              <button onClick={() => setActiveDatasetId(ds.id)} className="flex items-center gap-1.5">
                <FileSpreadsheet className="w-3.5 h-3.5" />
                {ds.sheet_name || ds.file_name}
                <span className="text-xs text-secondary-400">{ds.row_count}r</span>
              </button>
              <button onClick={() => deleteDataset(ds.id)} className="text-secondary-400 hover:text-error-600 transition-colors" title="Delete sheet"><X className="w-3.5 h-3.5" /></button>
            </div>
          ))}
          <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1 px-3 py-1 text-sm rounded-md text-secondary-500 hover:bg-secondary-100 border border-dashed border-secondary-300 whitespace-nowrap">
            <Plus className="w-3.5 h-3.5" /> Add Sheet
          </button>
        </div>
      )}

      <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelected(f); e.target.value = ''; }} />

      {statusMsg && (
        <div className={`px-5 py-2 text-sm flex items-center gap-2 ${statusMsg.type === 'success' ? 'bg-success-50 text-success-700' : statusMsg.type === 'error' ? 'bg-error-50 text-error-700' : 'bg-info-50 text-info-700'}`}>
          {statusMsg.type === 'success' ? <Check className="w-4 h-4" /> : statusMsg.type === 'error' ? <AlertTriangle className="w-4 h-4" /> : <Info className="w-4 h-4" />}
          {statusMsg.text}
          <button onClick={() => setStatusMsg(null)} className="ml-auto"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* ── Main workbench: step rail | config panel | divider | grid ── */}
      <div className="flex-1 flex overflow-hidden">
        {datasets.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <ImportZone onImport={handleFileSelected} importing={importing} fileInputRef={fileInputRef} />
          </div>
        ) : dataset ? (
          <>
            {/* Step rail */}
            <StepRail activeStep={activeStep} onStepClick={setActiveStep} stepStatuses={{
              demographics: demoCols.length > 0 ? 'done' : 'pending',
              subscales: subscaleStates.length > 0 ? (subscaleStates.every((s) => s.items.length > 0) ? 'done' : 'active') : 'pending',
              scales: subscaleStates.length > 0 ? (subscaleStates.some((s) => s.scaleType === 'categorical' && s.labelMap.length > 0) ? 'done' : 'active') : (overallScale.scaleType === 'categorical' && overallScale.labelMap.length > 0 ? 'done' : 'active'),
              bands: Object.values(bandStates).some((bs) => bs.length > 0) ? 'done' : 'pending',
              scoring: scoringResult ? 'done' : 'pending',
            }} />

            {/* Config panel */}
            {!leftPanelCollapsed && (
              <div style={{ width: leftPanelWidth }} className="border-r border-secondary-200 bg-white overflow-y-auto flex-shrink-0">
                <div className="px-3 py-2 border-b border-secondary-200 bg-secondary-50/50">
                  <span className="text-xs font-semibold text-secondary-500 uppercase tracking-wide">
                    {activeStep === 'demographics' && 'ID Columns'}
                    {activeStep === 'subscales' && 'Subscale Groups'}
                    {activeStep === 'scales' && 'Response Scales'}
                    {activeStep === 'bands' && 'Interpretation Bands'}
                    {activeStep === 'scoring' && 'Scoring'}
                  </span>
                </div>
                {activeStep === 'demographics' && (
                  <DemographicsPanel allColumns={allColumns} demoCols={demoCols} onToggle={toggleDemographic} onMarkAllItems={markAllAsItems} />
                )}
                {activeStep === 'subscales' && (
                  <SubscalesPanel
                    subscales={subscaleStates} unassignedItems={unassignedItems}
                    onAddSubscale={addSubscale} onDeleteSubscale={deleteSubscale} onRenameSubscale={renameSubscale}
                    onRemoveItem={removeItemFromSubscale} onToggleReverse={toggleReverse} onMoveItem={moveItem}
                    selectedItems={selectedItems} onToggleSelection={toggleItemSelection}
                    onSelectAll={selectAllUnassigned} onClearSelection={clearSelection}
                    onBatchAdd={batchAddItems} activeSubscaleId={activeSubscaleId} onSetActiveSubscale={setActiveSubscaleId}
                  />
                )}
                {activeStep === 'scales' && (
                  <ScalesPanel
                    subscales={subscaleStates}
                    onSetScaleType={setScaleType} onSetScaleRange={setScaleRange}
                    onSetLabelMap={setLabelMap} onSetScoringMethod={setScoringMethod}
                    onSetCustomFormula={setCustomFormula} onAutoDetect={autoDetectScale}
                    onApplyToAll={applyScaleToAll}
                    overallScale={overallScale} onSetOverallScale={(patch) => { setOverallScale((prev) => ({ ...prev, ...patch })); markDirty(); }}
                    onAutoDetectOverall={() => {
                      if (!dataset) return;
                      const itemCols = allColumns.filter((c) => !demoColumnNames.has(c));
                      if (itemCols.length === 0) return;
                      const det = detectScale(dataset.headers, dataset.rows as Record<string, unknown>[], itemCols);
                      setOverallScale({ ...overallScale, scaleType: det.scaleType, minValue: det.minValue, maxValue: det.maxValue, labelMap: det.scaleType === 'categorical' ? det.uniqueValues.map((label, i) => ({ label, value: i + 1 })) : [] });
                      setStatusMsg({ type: 'success', text: det.suggestion }); markDirty();
                    }}
                    formulaPreviewFn={formulaPreview}
                  />
                )}
                {activeStep === 'bands' && (
                  <BandsPanel
                    subscales={subscaleStates} bandStates={bandStates}
                    onAddBand={addBand} onUpdateBand={updateBand} onRemoveBand={removeBand}
                    onAutoSuggest={autoSuggestBands}
                    overallScale={overallScale}
                  />
                )}
                {activeStep === 'scoring' && (
                  <ScoringPanel
                    canScore={canScore} scoring={scoring} onRunScoring={runScoring}
                    scoringResult={scoringResult} onExport={handleExport}
                    excludedCount={sharedExcludedRows.size} subscaleCount={subscaleStates.length || (itemColumns.length > 0 ? 1 : 0)}
                    usedAutoScale={subscaleStates.length === 0 && !!dataset}
                    originalColCount={originalColCount} computedColCount={computedColCount}
                  />
                )}
              </div>
            )}

            {/* Resizable divider */}
            {!leftPanelCollapsed && (
              <div
                onMouseDown={(e) => {
                  e.preventDefault();
                  const startX = e.clientX;
                  const startW = leftPanelWidth;
                  const onMove = (ev: MouseEvent) => {
                    const newW = Math.max(200, Math.min(480, startW + (ev.clientX - startX)));
                    setLeftPanelWidth(newW);
                  };
                  const onUp = () => {
                    document.removeEventListener('mousemove', onMove);
                    document.removeEventListener('mouseup', onUp);
                    document.body.style.cursor = '';
                    document.body.style.userSelect = '';
                  };
                  document.addEventListener('mousemove', onMove);
                  document.addEventListener('mouseup', onUp);
                  document.body.style.cursor = 'col-resize';
                  document.body.style.userSelect = 'none';
                }}
                onDoubleClick={() => { setCollapsedWidth(leftPanelWidth); setLeftPanelCollapsed(true); }}
                className="w-1.5 bg-secondary-200 hover:bg-primary-400 cursor-col-resize flex-shrink-0 transition-colors relative group"
              >
                <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-0.5 bg-white/60 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            )}

            {/* Collapsed panel toggle button */}
            {leftPanelCollapsed && (
              <button
                onClick={() => { setLeftPanelWidth(collapsedWidth); setLeftPanelCollapsed(false); }}
                className="w-7 border-r border-secondary-200 bg-white hover:bg-secondary-50 flex items-center justify-center flex-shrink-0 transition-colors"
                title="Show config panel"
              >
                <PanelLeftOpen className="w-4 h-4 text-secondary-400" />
              </button>
            )}

            {/* Center — live grid */}
            <div className="flex-1 overflow-auto p-4 bg-secondary-50/30 flex flex-col">
              <LiveGrid
                groups={groups}
                rows={displayRows}
                realRowCount={dataset.row_count}
                excludedRows={sharedExcludedRows}
                onToggleRow={toggleRowExclusion}
                showExcludedOnly={showExcludedOnly}
                onToggleFilter={() => setShowExcludedOnly(!showExcludedOnly)}
                highlightRowIndex={highlightRowIndex}
                highlightRef={highlightRef}
                summary={summary}
                showSummarySum={showSummarySum}
                showSummaryMean={showSummaryMean}
                hasScoring={!!scoringResult}
              />
              {scoringResult && (
                <Card className="mt-3 p-4 border-success-300 bg-success-50/30 flex-shrink-0">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 text-success-800 font-medium"><Check className="w-4 h-4" /> Scoring complete ({scoringResult.headers.length} cols, {scoringResult.rows.length} rows)</div>
                    <div className="text-sm text-secondary-500">{sharedExcludedRows.size} excluded · +{computedColCount} computed columns</div>
                  </div>
                </Card>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-secondary-400">Loading...</div>
        )}
      </div>

      {/* History panel */}
      {showHistoryPanel && (
        <div className="w-72 border-l border-secondary-200 bg-white overflow-auto flex-shrink-0 absolute right-0 top-0 bottom-0 z-30 shadow-lg">
          <div className="px-4 py-3 border-b border-secondary-200 flex items-center justify-between">
            <h3 className="font-semibold text-secondary-800 flex items-center gap-2"><HistoryIcon className="w-4 h-4" /> Action History</h3>
            <button onClick={() => setShowHistoryPanel(false)} className="text-secondary-400 hover:text-secondary-700"><X className="w-4 h-4" /></button>
          </div>
          <div className="divide-y divide-secondary-100">
            {history.length === 0 && <div className="px-4 py-8 text-center text-sm text-secondary-400">No actions yet</div>}
            {history.map((h) => (
              <div key={h.id} className="px-4 py-3 hover:bg-secondary-50 group">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-secondary-100 text-secondary-600">{h.action_type}</span>
                  <span className="text-xs text-secondary-400">{new Date(h.created_at).toLocaleTimeString()}</span>
                  {h.undo_data && (
                    <button onClick={() => undoAction(h)} className="ml-auto opacity-0 group-hover:opacity-100 text-xs text-primary-600 hover:underline transition-opacity">Undo</button>
                  )}
                </div>
                <p className="text-sm text-secondary-700">{h.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sheet selector modal */}
      <Modal open={!!sheetInfos} onClose={() => { setSheetInfos(null); setPendingFile(null); }} title="Import Sheets" maxWidth="max-w-lg">
        <p className="text-sm text-secondary-600 mb-4">This spreadsheet has multiple tabs. Select which sheets to import — each will be configured independently:</p>
        <div className="space-y-2 mb-4">
          {sheetInfos?.map((s) => (
            <label key={s.name} className="flex items-center gap-3 p-3 border border-secondary-200 rounded-lg hover:bg-secondary-50 cursor-pointer">
              <input type="checkbox" checked={checkedSheets.has(s.name)}
                onChange={(e) => { const ns = new Set(checkedSheets); if (e.target.checked) ns.add(s.name); else ns.delete(s.name); setCheckedSheets(ns); }}
                className="w-4 h-4 rounded border-secondary-300 text-primary-600 focus:ring-primary-500" />
              <div className="flex-1">
                <span className="font-medium text-secondary-800">{s.name}</span>
                <span className="text-sm text-secondary-400 ml-2">{s.rows} rows × {s.cols} cols</span>
              </div>
            </label>
          ))}
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => { setSheetInfos(null); setPendingFile(null); }}>Cancel</Button>
          <Button size="sm" onClick={importSelectedSheets} disabled={checkedSheets.size === 0 || importing}>
            {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Import {checkedSheets.size} Sheet{checkedSheets.size !== 1 ? 's' : ''}
          </Button>
        </div>
      </Modal>

      {/* Template modal */}
      <TemplateModal open={showTemplateModal} onClose={() => setShowTemplateModal(false)}
        templates={templates} onSaveAsTemplate={saveAsTemplate} onApplyTemplate={applyTemplate} hasDataset={!!dataset} />
    </div>
  );
}

// ── Panel Tab ──
// ── Step Rail ──
type StepName = 'demographics' | 'subscales' | 'scales' | 'bands' | 'scoring';
type StepStatus = 'pending' | 'active' | 'done';

function StepRail({ activeStep, onStepClick, stepStatuses }: {
  activeStep: StepName;
  onStepClick: (s: StepName) => void;
  stepStatuses: Record<StepName, StepStatus>;
}) {
  const steps: { name: StepName; icon: React.ComponentType<{ className?: string }>; label: string }[] = [
    { name: 'demographics', icon: Users, label: 'ID' },
    { name: 'subscales', icon: Layers, label: 'Subscales' },
    { name: 'scales', icon: Sliders, label: 'Scales' },
    { name: 'bands', icon: Tag, label: 'Bands' },
    { name: 'scoring', icon: Calculator, label: 'Scoring' },
  ];
  return (
    <div className="w-16 bg-white border-r border-secondary-200 flex flex-col items-center py-3 gap-1 flex-shrink-0">
      {steps.map((s) => {
        const status = stepStatuses[s.name];
        const isActive = activeStep === s.name;
        const Icon = s.icon;
        return (
          <button
            key={s.name}
            onClick={() => onStepClick(s.name)}
            className={`relative flex flex-col items-center gap-1 w-14 py-2 rounded-lg transition-all ${isActive ? 'bg-primary-50 text-primary-700' : 'text-secondary-400 hover:text-secondary-600 hover:bg-secondary-50'}`}
            title={s.label}
          >
            {isActive && <div className="absolute -left-0.5 top-1/2 -translate-y-1/2 w-1 h-8 bg-primary-600 rounded-full" />}
            <div className="relative">
              <Icon className="w-5 h-5" />
              {status === 'done' && (
                <div className="absolute -top-1 -right-1.5 w-3.5 h-3.5 rounded-full bg-success-500 border-2 border-white flex items-center justify-center">
                  <Check className="w-2 h-2 text-white" strokeWidth={3} />
                </div>
              )}
            </div>
            <span className="text-[9px] font-medium leading-none text-center break-words">{s.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── Import Zone ──
function ImportZone({ onImport, importing, fileInputRef }: { onImport: (f: File) => void; importing: boolean; fileInputRef: React.RefObject<HTMLInputElement> }) {
  const [dragging, setDragging] = useState(false);
  return (
    <div onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) onImport(f); }}
      className={`w-full max-w-xl border-2 border-dashed rounded-2xl p-12 text-center transition-all ${dragging ? 'border-primary-500 bg-primary-50' : 'border-secondary-300 bg-white hover:border-primary-400'}`}>
      <div className="w-16 h-16 rounded-2xl bg-primary-100 flex items-center justify-center mx-auto mb-4">
        {importing ? <Loader2 className="w-8 h-8 text-primary-600 animate-spin" /> : <Upload className="w-8 h-8 text-primary-600" />}
      </div>
      <h3 className="text-lg font-semibold text-secondary-900 mb-2">{importing ? 'Importing...' : 'Import your dataset'}</h3>
      <p className="text-sm text-secondary-500 mb-4">Drag & drop a CSV or XLSX file, or click to browse. Multi-tab spreadsheets supported.</p>
      <Button onClick={() => fileInputRef.current?.click()} disabled={importing}><FileSpreadsheet className="w-4 h-4" /> Choose File</Button>
    </div>
  );
}

// ── Demographics Panel ──
function DemographicsPanel({ allColumns, demoCols, onToggle, onMarkAllItems }: {
  allColumns: string[]; demoCols: DemographicColumn[]; onToggle: (col: string, isDemo: boolean) => void; onMarkAllItems: () => void;
}) {
  const [search, setSearch] = useState('');
  const demoNames = new Set(demoCols.map((d) => d.column_name));
  const filtered = allColumns.filter((c) => c.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-secondary-500 uppercase tracking-wide">ID Columns</span>
        <button onClick={onMarkAllItems} className="text-xs text-primary-600 hover:underline">Mark all as items</button>
      </div>
      <div className="relative mb-3">
        <Search className="w-4 h-4 text-secondary-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." className="w-full pl-9 pr-3 py-1.5 text-sm border border-secondary-200 rounded-lg focus:outline-none focus:border-primary-400" />
      </div>
      <div className="space-y-0.5">
        {filtered.map((col) => {
          const isDemo = demoNames.has(col);
          const info = demoCols.find((d) => d.column_name === col);
          return (
            <div key={col} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md border transition-colors ${isDemo ? 'border-primary-200 bg-primary-50/40' : 'border-secondary-100 bg-white hover:bg-secondary-50'}`}>
              <span className="flex-1 text-sm text-secondary-800 truncate" title={col}>{col}</span>
              {isDemo && info && info.detected_by !== 'manual' && <ConfidenceBadge confidence={info.confidence} />}
              <button onClick={() => onToggle(col, isDemo)}
                className={`px-2 py-0.5 text-xs font-medium rounded-full transition-colors whitespace-nowrap ${isDemo ? 'bg-primary-600 text-white' : 'bg-secondary-200 text-secondary-600 hover:bg-secondary-300'}`}>
                {isDemo ? 'Demo' : 'Item'}
              </button>
            </div>
          );
        })}
      </div>
      {filtered.length === 0 && <p className="text-sm text-secondary-400 text-center py-4">No columns match "{search}"</p>}
    </div>
  );
}

// ── Subscales Panel — with batch selection ──
function SubscalesPanel({ subscales, unassignedItems, onAddSubscale, onDeleteSubscale, onRenameSubscale, onRemoveItem, onToggleReverse, onMoveItem, selectedItems, onToggleSelection, onSelectAll, onClearSelection, onBatchAdd, activeSubscaleId, onSetActiveSubscale }: {
  subscales: SubscaleState[]; unassignedItems: string[];
  onAddSubscale: () => void; onDeleteSubscale: (id: string) => void; onRenameSubscale: (id: string, name: string) => void;
  onRemoveItem: (id: string, col: string) => void; onToggleReverse: (id: string, col: string) => void; onMoveItem: (id: string, idx: number, dir: 'up' | 'down') => void;
  selectedItems: Set<string>; onToggleSelection: (col: string) => void; onSelectAll: () => void; onClearSelection: () => void;
  onBatchAdd: (subscaleId: string, cols: string[]) => void; activeSubscaleId: string | null; onSetActiveSubscale: (id: string | null) => void;
}) {
  const [batchTarget, setBatchTarget] = useState<string>('');
  const [search, setSearch] = useState('');
  const selectedArr = Array.from(selectedItems);
  const filteredUnassigned = unassignedItems.filter((c) => c.toLowerCase().includes(search.toLowerCase()));

  const handleBatchAdd = () => {
    const targetId = activeSubscaleId || batchTarget;
    if (!targetId || selectedArr.length === 0) return;
    onBatchAdd(targetId, selectedArr);
  };

  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-secondary-500 uppercase tracking-wide">Subscale Groups</span>
        <Button onClick={onAddSubscale} size="sm" className="px-2 py-1 text-xs"><Plus className="w-3 h-3" /> Add</Button>
      </div>

      {/* Unassigned items — searchable scrollable list */}
      <div className="mb-3 p-2.5 rounded-xl border border-secondary-200 bg-secondary-50">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-secondary-500">Unassigned ({unassignedItems.length})</span>
          {unassignedItems.length > 0 && (
            <div className="flex items-center gap-2">
              <button onClick={onSelectAll} className="text-xs text-primary-600 hover:underline">Select all</button>
              {selectedItems.size > 0 && <button onClick={onClearSelection} className="text-xs text-secondary-500 hover:underline">Clear</button>}
            </div>
          )}
        </div>
        {unassignedItems.length === 0 ? (
          <p className="text-sm text-secondary-400 py-2 text-center">All items assigned.</p>
        ) : (
          <>
            <div className="relative mb-2">
              <Search className="w-3.5 h-3.5 text-secondary-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search items..." className="w-full pl-8 pr-3 py-1.5 text-xs border border-secondary-200 rounded-lg focus:outline-none focus:border-primary-400 bg-white" />
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
              {filteredUnassigned.map((col) => (
                <button
                  key={col}
                  onClick={() => onToggleSelection(col)}
                  className={`px-2.5 py-1 text-sm rounded-lg border transition-all ${selectedItems.has(col) ? 'border-primary-500 bg-primary-100 text-primary-700 font-medium' : 'border-secondary-200 bg-white text-secondary-700 hover:border-primary-300'}`}
                >
                  {col}
                </button>
              ))}
              {filteredUnassigned.length === 0 && <p className="text-xs text-secondary-400 py-2 text-center w-full">No items match "{search}"</p>}
            </div>
          </>
        )}
      </div>

      {/* Batch assignment bar */}
      {selectedArr.length > 0 && (
        <div className="mb-3 p-2.5 bg-primary-50 border border-primary-200 rounded-lg">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-primary-700 whitespace-nowrap flex-shrink-0">{selectedArr.length} selected</span>
            <select value={batchTarget} onChange={(e) => setBatchTarget(e.target.value)} className="flex-1 min-w-0 px-2 py-1 text-xs border border-secondary-200 rounded bg-white">
              <option value="">Choose subscale...</option>
              {subscales.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <Button size="sm" className="px-2 py-1 text-xs" onClick={handleBatchAdd} disabled={!batchTarget && !activeSubscaleId}><ArrowRight className="w-3 h-3" /> Add</Button>
          </div>
        </div>
      )}

      {/* Subscale cards */}
      <div className="space-y-2.5">
        {subscales.map((sub) => (
          <div key={sub.id}
            onClick={() => onSetActiveSubscale(sub.id)}
            className={`p-3 rounded-xl border bg-white transition-all cursor-pointer ${activeSubscaleId === sub.id ? 'border-primary-400 ring-1 ring-primary-300' : 'border-secondary-200 hover:border-secondary-300'}`}>
            <div className="flex items-center justify-between mb-2">
              <input value={sub.name} onChange={(e) => onRenameSubscale(sub.id, e.target.value)} onClick={(e) => e.stopPropagation()} className="text-sm font-semibold text-secondary-900 bg-transparent border-none outline-none flex-1 min-w-0 focus:underline" />
              <button onClick={(e) => { e.stopPropagation(); onDeleteSubscale(sub.id); }} className="p-1 text-error-400 hover:text-error-600 flex-shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
            {sub.items.length === 0 ? (
              <p className="text-xs text-secondary-400 py-2 text-center border border-dashed border-secondary-100 rounded">Select items above and add them here</p>
            ) : (
              <div className="space-y-0.5">
                {sub.items.map((item, idx) => (
                  <div key={item.column} onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-1.5 px-2 py-1 bg-secondary-50 rounded text-xs group">
                    <span className="text-secondary-400 font-mono w-4 flex-shrink-0">{idx + 1}.</span>
                    <span className="flex-1 min-w-0 text-secondary-700 truncate" title={item.column}>{item.column}</span>
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      <button onClick={() => onMoveItem(sub.id, idx, 'up')} disabled={idx === 0} className="p-0.5 text-secondary-400 hover:text-secondary-700 disabled:opacity-30"><ArrowRight className="w-3 h-3 rotate-[-90deg]" /></button>
                      <button onClick={() => onMoveItem(sub.id, idx, 'down')} disabled={idx === sub.items.length - 1} className="p-0.5 text-secondary-400 hover:text-secondary-700 disabled:opacity-30"><ArrowRight className="w-3 h-3 rotate-90" /></button>
                      <button onClick={() => onToggleReverse(sub.id, item.column)} className={`px-1.5 py-0.5 text-xs rounded-full font-medium transition-colors ${item.reverse ? 'bg-warning-100 text-warning-700 border border-warning-300' : 'bg-secondary-100 text-secondary-400 border border-secondary-200 hover:text-secondary-600'}`}>Rev</button>
                      <button onClick={() => onRemoveItem(sub.id, item.column)} className="p-0.5 text-error-400 hover:text-error-600"><X className="w-3 h-3" /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Scales Panel — with custom formula support ──
function ScalesPanel({ subscales, onSetScaleType, onSetScaleRange, onSetLabelMap, onSetScoringMethod, onSetCustomFormula, onAutoDetect, onApplyToAll, overallScale, onSetOverallScale, onAutoDetectOverall, formulaPreviewFn }: {
  subscales: SubscaleState[];
  onSetScaleType: (id: string, t: 'numeric' | 'categorical') => void;
  onSetScaleRange: (id: string, min: number | null, max: number | null) => void;
  onSetLabelMap: (id: string, lm: { label: string; value: number }[]) => void;
  onSetScoringMethod: (id: string, m: 'sum' | 'mean' | 'custom') => void;
  onSetCustomFormula: (id: string, f: string) => void;
  onAutoDetect: (id: string) => void;
  onApplyToAll: () => void;
  overallScale: SubscaleState;
  onSetOverallScale: (patch: Partial<SubscaleState>) => void;
  onAutoDetectOverall: () => void;
  formulaPreviewFn: (formula: string, itemCols: string[]) => string;
}) {
  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-secondary-500 uppercase tracking-wide">Response Scales</span>
        {subscales.length >= 2 && <button onClick={onApplyToAll} className="text-xs text-primary-600 hover:underline">Apply first to all</button>}
      </div>
      <div className="space-y-3">
        {subscales.length === 0 && (
          <ScaleCardCompact name={overallScale.name} scaleType={overallScale.scaleType} scoringMethod={overallScale.scoringMethod} customFormula={overallScale.customFormula}
            minValue={overallScale.minValue} maxValue={overallScale.maxValue} labelMap={overallScale.labelMap}
            itemCols={overallScale.items.map((i) => i.column)}
            onSetScoringMethod={(m) => onSetOverallScale({ scoringMethod: m })}
            onSetCustomFormula={(f) => onSetOverallScale({ customFormula: f })}
            onSetScaleType={(t) => onSetOverallScale({ scaleType: t })}
            onSetScaleRange={(min, max) => onSetOverallScale({ minValue: min, maxValue: max })}
            onSetLabelMap={(lm) => onSetOverallScale({ labelMap: lm })}
            onAutoDetect={onAutoDetectOverall}
            formulaPreviewFn={formulaPreviewFn}
          />
        )}
        {subscales.map((sub) => (
          <ScaleCardCompact key={sub.id} name={sub.name} scaleType={sub.scaleType} scoringMethod={sub.scoringMethod} customFormula={sub.customFormula}
            minValue={sub.minValue} maxValue={sub.maxValue} labelMap={sub.labelMap}
            itemCols={sub.items.map((i) => i.column)}
            onSetScoringMethod={(m) => onSetScoringMethod(sub.id, m)}
            onSetCustomFormula={(f) => onSetCustomFormula(sub.id, f)}
            onSetScaleType={(t) => onSetScaleType(sub.id, t)}
            onSetScaleRange={(min, max) => onSetScaleRange(sub.id, min, max)}
            onSetLabelMap={(lm) => onSetLabelMap(sub.id, lm)}
            onAutoDetect={() => onAutoDetect(sub.id)}
            formulaPreviewFn={formulaPreviewFn}
          />
        ))}
      </div>
    </div>
  );
}

function ScaleCardCompact({ name, scaleType, scoringMethod, customFormula, minValue, maxValue, labelMap, itemCols, onSetScoringMethod, onSetCustomFormula, onSetScaleType, onSetScaleRange, onSetLabelMap, onAutoDetect, formulaPreviewFn }: {
  name: string; scaleType: 'numeric' | 'categorical'; scoringMethod: 'sum' | 'mean' | 'custom'; customFormula: string;
  minValue: number | null; maxValue: number | null; labelMap: { label: string; value: number }[]; itemCols: string[];
  onSetScoringMethod: (m: 'sum' | 'mean' | 'custom') => void;
  onSetCustomFormula: (f: string) => void;
  onSetScaleType: (t: 'numeric' | 'categorical') => void;
  onSetScaleRange: (min: number | null, max: number | null) => void;
  onSetLabelMap: (lm: { label: string; value: number }[]) => void;
  onAutoDetect: () => void;
  formulaPreviewFn: (formula: string, itemCols: string[]) => string;
}) {
  const formulaError = scoringMethod === 'custom' && customFormula ? validateFormula(customFormula, itemCols) : null;
  const preview = scoringMethod === 'custom' && customFormula ? formulaPreviewFn(customFormula, itemCols) : '';
  return (
    <Card className="p-3">
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-semibold text-sm text-secondary-900 truncate">{name}</h4>
        <button onClick={onAutoDetect} className="text-xs text-primary-600 hover:underline flex items-center gap-1"><Sparkles className="w-3 h-3" /> Auto</button>
      </div>
      {/* Scoring method: sum | mean | custom */}
      <div className="flex items-center gap-1 mb-2">
        {(['sum', 'mean', 'custom'] as const).map((m) => (
          <button key={m} onClick={() => onSetScoringMethod(m)} className={`px-2 py-0.5 text-xs rounded-md transition-colors ${scoringMethod === m ? 'bg-primary-600 text-white' : 'bg-secondary-100 text-secondary-600 hover:bg-secondary-200'}`}>{m === 'sum' ? 'Sum' : m === 'mean' ? 'Mean' : 'Custom'}</button>
        ))}
      </div>
      {scoringMethod === 'custom' && (
        <div className="mb-2">
          <div className="flex items-center gap-1.5 mb-1">
            <input value={customFormula} onChange={(e) => onSetCustomFormula(e.target.value)} placeholder="e.g. (Q1 + Q2) / 2 * Q3" className="flex-1 min-w-0 px-2 py-1 text-xs border border-secondary-200 rounded focus:outline-none focus:border-primary-400 font-mono" />
            <Tooltip text="Use +, -, *, /, parentheses, and column names. Example: (Q1 + Q2 + Q3) / 3">
              <Info className="w-3.5 h-3.5 text-secondary-400" />
            </Tooltip>
          </div>
          {formulaError && <p className="text-xs text-error-600 mb-1">{formulaError}</p>}
          {preview && !formulaError && <p className="text-xs text-success-600 mb-1">Preview: {preview}</p>}
        </div>
      )}
      {/* Scale type */}
      <div className="flex items-center gap-1 mb-2">
        <span className="text-xs text-secondary-500">Type:</span>
        {(['numeric', 'categorical'] as const).map((t) => (
          <button key={t} onClick={() => onSetScaleType(t)} className={`px-2 py-0.5 text-xs rounded-md transition-colors ${scaleType === t ? 'bg-primary-600 text-white' : 'bg-secondary-100 text-secondary-600 hover:bg-secondary-200'}`}>{t === 'numeric' ? 'Numeric' : 'Categorical'}</button>
        ))}
      </div>
      {/* Likert preset picker (categorical only) */}
      {scaleType === 'categorical' && (
      <div className="mb-2">
        <label className="text-xs text-secondary-500 block mb-1">Preset scale:</label>
        <select
          value=""
          onChange={(e) => {
            const preset = COMMON_LIKERT_SCALES.find((p) => p.name === e.target.value);
            if (preset) {
              onSetLabelMap(preset.labels.map((l) => ({ label: l.label, value: l.value })));
              onSetScaleRange(Math.min(...preset.labels.map((l) => l.value)), Math.max(...preset.labels.map((l) => l.value)));
            }
          }}
          className="w-full px-2 py-1 text-xs border border-secondary-200 rounded focus:outline-none focus:border-primary-400 bg-white"
        >
          <option value="">Choose a preset…</option>
          {(['agreement', 'frequency', 'satisfaction', 'quality', 'importance', 'likelihood', 'severity'] as LikertCategory[]).map((cat) => (
            <optgroup key={cat} label={cat.charAt(0).toUpperCase() + cat.slice(1)}>
              {COMMON_LIKERT_SCALES.filter((p) => p.category === cat).map((p) => (
                <option key={p.name} value={p.name}>{p.name}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      )}
      {scaleType === 'numeric' && (
        <div className="flex items-center gap-2">
          <input type="number" value={minValue ?? ''} onChange={(e) => onSetScaleRange(e.target.value ? Number(e.target.value) : null, maxValue)} className="w-16 px-2 py-1 text-xs border border-secondary-200 rounded focus:outline-none focus:border-primary-400" placeholder="Min" />
          <span className="text-secondary-400 text-xs">to</span>
          <input type="number" value={maxValue ?? ''} onChange={(e) => onSetScaleRange(minValue, e.target.value ? Number(e.target.value) : null)} className="w-16 px-2 py-1 text-xs border border-secondary-200 rounded focus:outline-none focus:border-primary-400" placeholder="Max" />
        </div>
      )}
      {scaleType === 'categorical' && (
        <div className="space-y-1">
          {labelMap.map((e, i) => (
            <div key={i} className="flex items-center gap-1 w-full">
              <input value={e.label} onChange={(ev) => onSetLabelMap(labelMap.map((lm, j) => j === i ? { ...lm, label: ev.target.value } : lm))} className="flex-1 min-w-0 px-2 py-1 text-xs border border-secondary-200 rounded focus:outline-none focus:border-primary-400" />
              <ArrowRight className="w-3 h-3 text-secondary-400 flex-shrink-0" />
              <input type="number" value={e.value} onChange={(ev) => onSetLabelMap(labelMap.map((lm, j) => j === i ? { ...lm, value: Number(ev.target.value) } : lm))} className="w-12 flex-shrink-0 px-2 py-1 text-xs border border-secondary-200 rounded focus:outline-none focus:border-primary-400" />
              <button onClick={() => onSetLabelMap(labelMap.filter((_, j) => j !== i))} className="p-0.5 text-error-400 hover:text-error-600 flex-shrink-0"><X className="w-3 h-3" /></button>
            </div>
          ))}
          <button onClick={() => onSetLabelMap([...labelMap, { label: '', value: 0 }])} className="text-xs text-primary-600 hover:underline flex items-center gap-1"><Plus className="w-3 h-3" /> Add label</button>
        </div>
      )}
    </Card>
  );
}

// ── Bands Panel — with validation warnings ──
function BandsPanel({ subscales, bandStates, onAddBand, onUpdateBand, onRemoveBand, onAutoSuggest, overallScale }: {
  subscales: SubscaleState[]; bandStates: Record<string, BandState[]>;
  onAddBand: (n: string) => void; onUpdateBand: (n: string, i: number, f: keyof BandState, v: string | number) => void; onRemoveBand: (n: string, i: number) => void;
  onAutoSuggest: (n: string, maxScore: number) => void; overallScale: SubscaleState;
}) {
  const names = subscales.length > 0 ? subscales.map((s) => s.name) : [overallScale.name];
  return (
    <div className="p-3">
      <span className="text-xs font-semibold text-secondary-500 uppercase tracking-wide mb-2 block">Interpretation Bands</span>
      <div className="space-y-3">
        {names.map((name) => {
          const sub = subscales.find((s) => s.name === name) || overallScale;
          const bands = bandStates[name] || [];
          const maxPossible = sub.items.length > 0 && sub.maxValue ? sub.items.length * sub.maxValue : 100;
          const warnings = validateBands(bands, maxPossible);
          return (
            <Card key={name} className="p-3">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-semibold text-sm text-secondary-900 truncate">{name}</h4>
                <div className="flex items-center gap-1">
                  <button onClick={() => onAutoSuggest(name, maxPossible)} className="text-xs text-primary-600 hover:underline flex items-center gap-1"><Sparkles className="w-3 h-3" /> Suggest</button>
                  <button onClick={() => onAddBand(name)} className="text-xs text-primary-600 hover:underline flex items-center gap-1"><Plus className="w-3 h-3" /> Add</button>
                </div>
              </div>
              {/* Validation warnings */}
              {warnings.length > 0 && (
                <div className="mb-2 space-y-1">
                  {warnings.map((w, i) => (
                    <div key={i} className={`flex items-start gap-1.5 px-2 py-1 rounded text-xs ${w.type === 'gap' ? 'bg-warning-50 text-warning-700' : 'bg-error-50 text-error-700'}`}>
                      <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                      <span>{w.message}</span>
                    </div>
                  ))}
                </div>
              )}
              {bands.length === 0 ? (
                <p className="text-xs text-secondary-400 py-1">No bands defined.</p>
              ) : (
                <div className="space-y-1">
                  {bands.map((band, i) => (
                    <div key={i} className="flex items-center gap-1 w-full">
                      <input value={band.name} onChange={(e) => onUpdateBand(name, i, 'name', e.target.value)} className="flex-1 min-w-0 px-2 py-1 text-xs border border-secondary-200 rounded focus:outline-none focus:border-primary-400" placeholder="Name" />
                      <input type="number" value={band.minScore} onChange={(e) => onUpdateBand(name, i, 'minScore', Number(e.target.value))} className="w-14 flex-shrink-0 px-1.5 py-1 text-xs border border-secondary-200 rounded focus:outline-none focus:border-primary-400" />
                      <span className="text-secondary-400 text-xs flex-shrink-0">–</span>
                      <input type="number" value={band.maxScore} onChange={(e) => onUpdateBand(name, i, 'maxScore', Number(e.target.value))} className="w-14 flex-shrink-0 px-1.5 py-1 text-xs border border-secondary-200 rounded focus:outline-none focus:border-primary-400" />
                      <button onClick={() => onRemoveBand(name, i)} className="p-0.5 text-error-400 hover:text-error-600 flex-shrink-0"><X className="w-3 h-3" /></button>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ── Scoring Panel ──
function ScoringPanel({ canScore, scoring, onRunScoring, scoringResult, onExport, excludedCount, subscaleCount, usedAutoScale, originalColCount, computedColCount }: {
  canScore: boolean; scoring: boolean; onRunScoring: () => void;
  scoringResult: ReturnType<typeof scoreDataset> | null; onExport: (f: 'csv' | 'xlsx') => void;
  excludedCount: number; subscaleCount: number; usedAutoScale: boolean;
  originalColCount: number; computedColCount: number;
}) {
  return (
    <div className="p-3">
      <span className="text-xs font-semibold text-secondary-500 uppercase tracking-wide mb-3 block">Scoring</span>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="p-2 bg-secondary-50 rounded-lg text-center">
          <div className="text-lg font-bold text-primary-600">{subscaleCount}</div>
          <div className="text-xs text-secondary-500">{usedAutoScale ? 'Overall Scale' : 'Subscales'}</div>
        </div>
        <div className="p-2 bg-secondary-50 rounded-lg text-center">
          <div className="text-lg font-bold text-warning-600">{excludedCount}</div>
          <div className="text-xs text-secondary-500">Excluded Rows</div>
        </div>
        <div className="p-2 bg-secondary-50 rounded-lg text-center">
          <div className="text-lg font-bold text-secondary-800">{originalColCount}</div>
          <div className="text-xs text-secondary-500">Original Cols</div>
        </div>
        <div className="p-2 bg-secondary-50 rounded-lg text-center">
          <div className="text-lg font-bold text-accent-600">+{computedColCount}</div>
          <div className="text-xs text-secondary-500">Computed Cols</div>
        </div>
      </div>
      {!canScore && (
        <Card className="p-2.5 mb-3 border-warning-300 bg-warning-50/50">
          <div className="flex items-center gap-2 text-warning-700 text-xs"><AlertTriangle className="w-3.5 h-3.5" /> All subscales must have items assigned.</div>
        </Card>
      )}
      <Button onClick={onRunScoring} disabled={!canScore || scoring} className="w-full mb-3">
        {scoring ? <Loader2 className="w-4 h-4 animate-spin" /> : <BarChart3 className="w-4 h-4" />}
        {scoring ? 'Scoring...' : 'Run Scoring'}
      </Button>
      {scoringResult && (
        <Card className="p-3 border-success-300 bg-success-50/30 mb-3">
          <div className="flex items-center gap-2 text-success-800 text-sm font-medium mb-2"><Check className="w-4 h-4" /> Complete</div>
          <div className="text-xs text-secondary-600 space-y-0.5 mb-2">
            <div>{scoringResult.rows.length} rows scored</div>
            <div>{originalColCount + computedColCount} total columns</div>
            <div>{scoringResult.excludedRowIndices.length} excluded</div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onExport('csv')} className="flex-1 text-xs"><FileDown className="w-3 h-3" /> CSV</Button>
            <Button variant="outline" size="sm" onClick={() => onExport('xlsx')} className="flex-1 text-xs"><FileDown className="w-3 h-3" /> XLSX</Button>
          </div>
        </Card>
      )}
    </div>
  );
}

// ── Template Modal ──
function TemplateModal({ open, onClose, templates, onSaveAsTemplate, onApplyTemplate, hasDataset }: {
  open: boolean; onClose: () => void; templates: Template[];
  onSaveAsTemplate: (n: string, d: string, i: string) => void; onApplyTemplate: (t: Template) => void; hasDataset: boolean;
}) {
  const [mode, setMode] = useState<'list' | 'create'>('list');
  const [name, setName] = useState(''), [desc, setDesc] = useState(''), [instrument, setInstrument] = useState('');
  return (
    <Modal open={open} onClose={onClose} title="Templates" maxWidth="max-w-3xl">
      <p className="text-sm text-secondary-500 mb-4">
        Templates store instrument behaviour only: subscales, reverse items, response scales, and interpretation bands.
        Demographics and data-quality exclusions stay dataset-specific and are never copied from a template.
      </p>
      <div className="flex gap-2 mb-4">
        <button onClick={() => setMode('list')} className={`px-4 py-2 text-sm rounded-lg ${mode === 'list' ? 'bg-primary-600 text-white' : 'bg-secondary-100 text-secondary-600'}`}>Browse Templates</button>
        <button onClick={() => setMode('create')} className={`px-4 py-2 text-sm rounded-lg ${mode === 'create' ? 'bg-primary-600 text-white' : 'bg-secondary-100 text-secondary-600'}`}>Save Current as Template</button>
      </div>
      {mode === 'list' && (
        <div className="space-y-3">
          {templates.length === 0 && <EmptyState icon={Tag} title="No templates yet" description="Save your current configuration as a reusable template." />}
          {templates.map((t) => (
            <Card key={t.id} className="p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="font-semibold text-secondary-900">{t.name}</h4>
                  <p className="text-sm text-secondary-500">{t.description}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <StatusBadge status="info">v{t.version}</StatusBadge>
                    {t.instrument && <StatusBadge status="neutral">{t.instrument}</StatusBadge>}
                    <span className="text-xs text-secondary-400">{(t.definition as TemplateDefinition)?.subscales?.length || 0} subscales</span>
                  </div>
                </div>
                <Button size="sm" disabled={!hasDataset} onClick={() => onApplyTemplate(t)}><Sparkles className="w-4 h-4" /> Apply</Button>
              </div>
            </Card>
          ))}
          {!hasDataset && templates.length > 0 && (
            <p className="text-xs text-amber-700">Import a dataset before applying a template.</p>
          )}
        </div>
      )}
      {mode === 'create' && (
        <div className="space-y-4">
          <p className="text-xs text-secondary-500">
            Saves the current subscales, reverse flags, scales, and bands. Does not save demographics or exclusions.
          </p>
          <div><label className="block text-sm font-medium text-secondary-700 mb-1">Template Name</label><input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-4 py-2 border border-secondary-200 rounded-lg focus:outline-none focus:border-primary-400" placeholder="e.g., GAD-7 Anxiety Scale" /></div>
          <div><label className="block text-sm font-medium text-secondary-700 mb-1">Description</label><input value={desc} onChange={(e) => setDesc(e.target.value)} className="w-full px-4 py-2 border border-secondary-200 rounded-lg focus:outline-none focus:border-primary-400" placeholder="Brief description" /></div>
          <div><label className="block text-sm font-medium text-secondary-700 mb-1">Instrument</label><input value={instrument} onChange={(e) => setInstrument(e.target.value)} className="w-full px-4 py-2 border border-secondary-200 rounded-lg focus:outline-none focus:border-primary-400" placeholder="e.g., GAD-7" /></div>
          <Button onClick={() => { onSaveAsTemplate(name, desc, instrument); setName(''); setDesc(''); setInstrument(''); }} disabled={!name.trim()}>Save Template</Button>
        </div>
      )}
    </Modal>
  );
}
