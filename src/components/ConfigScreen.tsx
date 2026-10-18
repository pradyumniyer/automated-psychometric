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
  ActionHistory,
  Dataset,
  DemographicColumn,
  Project,
  SubscaleItem,
  Template,
  TemplateDefinition,
  ScoreOutput,
} from '@/types/domain';
import {
  datasetRepository,
  exclusionRepository,
  scoreRepository,
  surveyConfigRepository,
  templateRepository,
} from '@/storage/repositories';
import { createScoreHashes } from '@/storage/scoreHashes';
import { fromSurveyConfigRecord, toSurveyConfigRecord } from '@/storage/viewAdapters';
import { logAction, logOutOfRangeAction, fetchHistory, deleteAction } from '@/lib/history';
import { getSheetInfo, exportToCSV, exportToXLSX } from '@/lib/fileParser';
import { ImportPreviewModal, type ImportPreviewRequest, type ImportPreviewResult } from './ImportPreviewModal';
import { buildTemplateDefinition, templateSubscaleScoreSettings, validateTemplateConfig, matchTemplateToHeaders, formatMatchSummary, TemplateMatchReport } from '@/lib/templates';
import { scoreDataset, SubscaleConfig, BandConfig } from '@/scientific/scoring';
import { detectDemographics, detectScale, COMMON_LIKERT_SCALES, LikertCategory } from '@/scientific/detection';
import { applyOutOfRangeAction, assessRangeOutliers, copyFirstResponseScaleSettings, detectConventionalRange, detectMixedRanges } from '@/scientific/responseScales';
import { evaluateFormula, validateFormula } from '@/scientific/formula';
import { getOutputRange, validateBands, suggestBands, type OutputRange } from '@/scientific/bandValidation';
import { Button, Card, Modal, ConfidenceBadge, StatusBadge, EmptyState, Tooltip } from './ui';
import { LiveGrid, GridGroup } from './LiveGrid';
import { getOutOfBandSummary, getUnassignedItemCount, getUnscoredRowSummary } from '@/lib/scoringStatus';
import { buildScoredColumnData } from '@/lib/scoredColumns';
import { buildSummaryExportContent, buildSummaryStatistics } from '@/lib/summaryStatistics';
import { SCORE_OUTPUT_ORDER, scoreOutputLabel, shownScoreOutputs } from '@/lib/scoreOutputs';

interface SubscaleState {
  id: string; name: string; items: SubscaleItem[];
  scoringMethod: 'sum' | 'mean' | 'custom';
  showOutputs?: ScoreOutput[];
  customFormula: string;
  scaleType: 'numeric' | 'categorical';
  minValue: number | null; maxValue: number | null;
  labelMap: { label: string; value: number }[];
  confirmed?: boolean;
  outOfRange?: 'missing' | 'widen';
  displayOrder: number;
}
interface BandState { name: string; minScore: number; maxScore: number; color: string; }
interface OverallSettings {
  enabled: boolean;
  basedOn: 'sums' | 'means' | 'custom';
  combineBy: 'sum' | 'mean' | 'custom';
  customFormula: string;
}
interface SheetInfo { name: string; rows: number; cols: number; }

type SaveState = 'idle' | 'saving' | 'saved';

export function ConfigScreen({
  project, highlightRowIndex, onHighlightRow, onClearHighlight,
  excludedRows: sharedExcludedRows, onToggleRowExclusion, onSetExcludedRows,
  onGoToQuality, sharedDatasetId, onDatasetChange,
  showSummarySum, showSummaryMean, onToggleSummarySum, onToggleSummaryMean,
}: {
  project: Project;
  highlightRowIndex: number | null;
  onHighlightRow: (rowIndex: number) => void;
  onClearHighlight: () => void;
  excludedRows: Set<number>;
  onToggleRowExclusion: (rowIndex: number) => Promise<void>;
  onSetExcludedRows: (rows: Set<number>) => Promise<void>;
  onGoToQuality: () => void;
  sharedDatasetId: string | null;
  onDatasetChange: (id: string | null) => void;
  showSummarySum: boolean;
  showSummaryMean: boolean;
  onToggleSummarySum: () => void;
  onToggleSummaryMean: () => void;
}) {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [activeDatasetIdState, setActiveDatasetIdState] = useState<string | null>(null);
  const activeDatasetId = sharedDatasetId ?? activeDatasetIdState;
  const setActiveDatasetId = (id: string | null) => {
    if (id !== activeDatasetId && configDirty) {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      performAutoSaveRef.current();
    }
    setActiveDatasetIdState(id);
    onDatasetChange(id);
  };
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [demoCols, setDemoCols] = useState<DemographicColumn[]>([]);
  const [subscaleStates, setSubscaleStates] = useState<SubscaleState[]>([]);
  const [bandStates, setBandStates] = useState<Record<string, BandState[]>>({});
  const [bandStatesByOutput, setBandStatesByOutput] = useState<Record<string, Partial<Record<ScoreOutput, BandState[]>>>>({});
  const [selectedBandOutputs, setSelectedBandOutputs] = useState<Record<string, ScoreOutput>>({});
  const [scoringResult, setScoringResult] = useState<ReturnType<typeof scoreDataset> | null>(null);
  const [overallScale, setOverallScale] = useState<SubscaleState>({
    id: 'overall', name: 'Overall Scale', items: [], scoringMethod: 'sum', customFormula: '',
    scaleType: 'numeric', minValue: 1, maxValue: 5, labelMap: [], confirmed: true, displayOrder: 0,
  });
  const [overallSettings, setOverallSettings] = useState<OverallSettings>({
    enabled: true, basedOn: 'sums', combineBy: 'sum', customFormula: '',
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
  const performAutoSaveRef = useRef<() => Promise<void>>(async () => {});
  const persistSurveyConfig = async (overrides: {
    demographicColumns?: DemographicColumn[];
    subscales?: SubscaleState[];
    bands?: Record<string, BandState[]>;
    bandsByOutput?: Record<string, Partial<Record<ScoreOutput, BandState[]>>>;
    overallScale?: SubscaleState | null;
    overallSettings?: OverallSettings;
    linkedTemplateId?: string | null;
  } = {}) => {
    if (!dataset) throw new Error('No active dataset to save.');
    const existing = await surveyConfigRepository.get(dataset.id);
    const config = toSurveyConfigRecord({
      datasetId: dataset.id,
      projectId: project.id,
      headers: dataset.headers,
      demographicColumns: overrides.demographicColumns ?? demoCols,
      subscales: overrides.subscales ?? subscaleStates,
      bands: overrides.bands ?? bandStates,
      bandsByOutput: overrides.bandsByOutput ?? bandStatesByOutput,
      overallScale: overrides.overallScale === undefined
        ? overallScale
        : overrides.overallScale,
      overallSettings: overrides.overallSettings ?? overallSettings,
      linkedTemplateId: overrides.linkedTemplateId,
    }, existing);
    return surveyConfigRepository.save(dataset.id, config);
  };

  // ── Import preview state ──
  const [importPreviewRequest, setImportPreviewRequest] = useState<ImportPreviewRequest | null>(null);
  const [importSheetQueue, setImportSheetQueue] = useState<string[]>([]);

  useEffect(() => {
    if (highlightRowIndex != null && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const timer = setTimeout(() => onClearHighlight(), 5000);
      return () => clearTimeout(timer);
    }
  }, [highlightRowIndex, onClearHighlight]);

  // ── Load datasets ──
  const loadDatasets = useCallback(async () => {
    try {
      const [dsList, tmplData] = await Promise.all([
        datasetRepository.list(project.id),
        templateRepository.list(),
      ]);
      setDatasets(dsList);
      setTemplates(tmplData);
      setStatusMsg(null);
      if (dsList.length > 0 && !activeDatasetId) setActiveDatasetId(dsList[0].id);
    } catch (error) {
      setStatusMsg({ type: 'error', text: `Failed to load project data: ${(error as Error).message}` });
    }
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

    try {
      const config = await surveyConfigRepository.get(activeDatasetId);
      if (!config) throw new Error('Dataset configuration is missing.');
      const adapted = fromSurveyConfigRecord(config);
      setDemoCols(adapted.demographicColumns);
      setSubscaleStates(adapted.subscales);
      setBandStates(adapted.bands);
      setBandStatesByOutput(adapted.bandsByOutput);
      setOverallScale(adapted.overallScale ?? {
        id: 'overall', name: 'Overall Scale', items: [], scoringMethod: 'sum', customFormula: '',
        scaleType: 'numeric', minValue: 1, maxValue: 5, labelMap: [], confirmed: true, displayOrder: 0,
      });
      setOverallSettings(adapted.overallSettings);
      const linked = config.linked_template_id
        ? await templateRepository.get(config.linked_template_id)
        : null;
      setLinkedTemplate(linked);

      const excludedRowIds = (await exclusionRepository.get(activeDatasetId))?.excluded_row_ids ?? [];
      const excludedIndices = await exclusionRepository.getExcludedIndices(activeDatasetId);
      await onSetExcludedRows(new Set(excludedIndices));

      const effectiveOverall = adapted.overallScale ?? (() => {
        const itemColumns = ds.headers.filter((header) =>
          !adapted.demographicColumns.some((column) => column.column_name === header),
        );
        const detected = detectScale(ds.headers, ds.rows, itemColumns);
        return {
          id: 'overall', name: 'Overall Scale',
          items: itemColumns.map((column, order) => ({ column, order, reverse: false })),
          scoringMethod: 'sum' as const, customFormula: '',
          scaleType: detected.scaleType, minValue: detected.minValue, maxValue: detected.maxValue,
          labelMap: detected.scaleType === 'categorical'
            ? detected.uniqueValues.map((label, index) => ({ label, value: index + 1 }))
            : [],
          confirmed: true,
          displayOrder: 0,
        };
      })();
      if (adapted.subscales.length === 0) setOverallScale(effectiveOverall);
      const configs: SubscaleConfig[] = (adapted.subscales.length ? adapted.subscales : [effectiveOverall]).map((sub) => ({
        id: sub.id,
        name: sub.name,
        items: sub.items,
        scoringMethod: sub.scoringMethod,
        customFormula: sub.customFormula || null,
        responseScale: {
          scaleType: sub.scaleType,
          minValue: sub.minValue ?? undefined,
          maxValue: sub.maxValue ?? undefined,
          labelMap: sub.labelMap,
          confirmed: sub.confirmed === true,
        },
      }));
      const hashes = await createScoreHashes(ds, config, configs, excludedRowIds);
      const cached = await scoreRepository.getCurrent(activeDatasetId, hashes);
      setScoringResult(cached?.payload.result as ReturnType<typeof scoreDataset> | null ?? null);
      const hist = await fetchHistory(activeDatasetId);
      setHistory(hist);
      setStatusMsg(null);
    } catch (error) {
      setStatusMsg({ type: 'error', text: `Failed to load dataset configuration: ${(error as Error).message}` });
      setScoringResult(null);
    }
  }, [activeDatasetId, datasets, onSetExcludedRows]);

  useEffect(() => { loadDatasetConfig(); }, [loadDatasetConfig]);

  useEffect(() => {
    if (!dataset) return;
    setSubscaleStates((previous) => previous.map((subscale) => {
      if (subscale.confirmed || subscale.scaleType !== 'numeric' || subscale.items.length === 0) return subscale;
      const values = subscale.items.flatMap((item) => dataset.rows.map((row) => row[item.column]));
      try {
        const detected = detectConventionalRange(values);
        if (detected.range.min === subscale.minValue && detected.range.max === subscale.maxValue) return subscale;
        return { ...subscale, minValue: detected.range.min, maxValue: detected.range.max };
      } catch {
        return subscale;
      }
    }));
  }, [dataset, subscaleStates.map((subscale) => `${subscale.id}:${subscale.items.map((item) => item.column).join(',')}:${subscale.confirmed}`).join('|')]);

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
      await persistSurveyConfig();
      setConfigDirty(false);
      setShowUpdateTemplate(!!linkedTemplate);
      setSaveState('saved');
      if (saveStateTimerRef.current) clearTimeout(saveStateTimerRef.current);
      saveStateTimerRef.current = setTimeout(() => setSaveState('idle'), 2000);
    } catch (error) {
      setSaveState('idle');
      setStatusMsg({ type: 'error', text: `Auto-save failed. Your changes may not be persisted. ${(error as Error).message}` });
    }
  }, [dataset, configDirty, subscaleStates, bandStates, bandStatesByOutput, project.id, linkedTemplate, demoCols, overallScale, overallSettings]);
  performAutoSaveRef.current = performAutoSave;

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
        // Single sheet — open preview directly
        setPendingFile(file);
        setImportPreviewRequest({ file, sheetName: info.sheets[0].name, queueIndex: 0, queueTotal: 1 });
        setImporting(false);
      } else { setStatusMsg({ type: 'error', text: 'No sheets found in file.' }); setImporting(false); }
    } catch (e) { setStatusMsg({ type: 'error', text: `Failed to read file: ${(e as Error).message}` }); setImporting(false); }
  };

  const importSelectedSheets = () => {
    if (!pendingFile || checkedSheets.size === 0) return;
    const queue = Array.from(checkedSheets);
    setSheetInfos(null);
    setImportSheetQueue(queue);
    setImportPreviewRequest({ file: pendingFile, sheetName: queue[0], queueIndex: 0, queueTotal: queue.length });
  };

  const handlePreviewConfirm = async (result: ImportPreviewResult) => {
    if (!pendingFile) return;
    setImporting(true);
    const currentRequest = importPreviewRequest;
    const queueIdx = currentRequest?.queueIndex ?? 0;
    const queueTotal = currentRequest?.queueTotal ?? 1;
    try {
      const parsed = result.parsed;
      const suggestions = detectDemographics(parsed.headers, parsed.rows);
      const newDataset = await datasetRepository.import({
        projectId: project.id,
        fileName: pendingFile.name,
        sheetName: result.sheetName,
        headers: parsed.headers,
        rows: parsed.rows,
        columnMeta: parsed.columnMeta || {},
        demographicColumns: suggestions.map((suggestion) => ({
          column_name: suggestion.column,
          detected_by: suggestion.rule,
          confidence: suggestion.confidence,
          confirmed: suggestion.confidence >= 0.5,
        })),
      });

      // Build success message with empty-row info
      const emptyNote = result.emptyRowsKept > 0 ? ` (${result.emptyRowsKept} empty row${result.emptyRowsKept > 1 ? 's' : ''} kept)` : '';

      // Check if there are more sheets in the queue
      if (currentRequest && queueTotal > 1 && queueIdx < queueTotal - 1) {
        const nextIdx = queueIdx + 1;
        const nextSheet = importSheetQueue[nextIdx];
        setImportPreviewRequest({ file: pendingFile, sheetName: nextSheet, queueIndex: nextIdx, queueTotal });
        setStatusMsg({ type: 'success', text: `Imported "${result.sheetName}" (${parsed.rowCount} rows)${emptyNote}. Next sheet...` });
      } else {
        // All done
        setImportPreviewRequest(null);
        setImportSheetQueue([]);
        setPendingFile(null);
        if (queueTotal > 1) {
          setStatusMsg({ type: 'success', text: `Imported ${queueTotal} sheets successfully${emptyNote ? ` — last sheet had ${result.emptyRowsKept} empty row${result.emptyRowsKept > 1 ? 's' : ''} kept` : ''}.` });
        } else {
          setStatusMsg({ type: 'success', text: `Imported ${parsed.rowCount} rows × ${parsed.colCount} columns from "${result.sheetName}"${emptyNote}.` });
        }
      }
      await loadDatasets(); setActiveDatasetId(newDataset.id);
    } catch (e) {
      const failedSheet = result.sheetName;
      const importedBefore = queueIdx > 0 ? `${queueIdx} sheet${queueIdx > 1 ? 's' : ''} already imported successfully. ` : '';
      const remaining = queueTotal - queueIdx - 1;
      const remainingNote = remaining > 0 ? ` ${remaining} sheet${remaining > 1 ? 's' : ''} not imported.` : '';
      setImportPreviewRequest(null);
      setImportSheetQueue([]);
      setPendingFile(null);
      setStatusMsg({ type: 'error', text: `Import failed on "${failedSheet}": ${(e as Error).message}. ${importedBefore}${remainingNote}` });
    }
    setImporting(false);
  };

  const handlePreviewCancel = () => {
    setImportPreviewRequest(null);
    setImportSheetQueue([]);
    setPendingFile(null);
  };

  // ── Demographics ──
  const toggleDemographic = async (col: string, isDemo: boolean) => {
    if (!dataset) return;
    try {
      const nextDemoCols = isDemo
        ? demoCols.filter((demographic) => demographic.column_name !== col)
        : [...demoCols, {
            id: crypto.randomUUID(),
            project_id: project.id,
            dataset_id: dataset.id,
            column_name: col,
            detected_by: 'manual',
            confidence: 1,
            confirmed: true,
            created_at: new Date().toISOString(),
          }];
      await persistSurveyConfig({ demographicColumns: nextDemoCols });
      setDemoCols(nextDemoCols);
      await logAction(project.id, 'demographic_toggle', `${isDemo ? 'Removed' : 'Added'} demographic: ${col}`, { column: col, action: isDemo ? 'remove' : 'add' }, null, dataset.id);
      await loadDatasetConfig();
    } catch (error) {
      setStatusMsg({ type: 'error', text: `Failed to save demographic settings: ${(error as Error).message}` });
    }
  };

  const markAllAsItems = async () => {
    if (!dataset) return;
    try {
      await persistSurveyConfig({ demographicColumns: [] });
      setDemoCols([]);
      await logAction(project.id, 'demographic_bulk', 'Marked all columns as items', {}, null, dataset.id);
      await loadDatasetConfig();
    } catch (error) {
      setStatusMsg({ type: 'error', text: `Failed to save demographic settings: ${(error as Error).message}` });
    }
  };

  const deleteDataset = async (dsId: string) => {
    const ds = datasets.find((d) => d.id === dsId);
    if (!ds) return;
    if (!window.confirm(`Delete sheet "${ds.sheet_name || ds.file_name}"? This removes all its configuration and scoring data.`)) return;
    try {
      await datasetRepository.delete(dsId);
      await logAction(project.id, 'sheet_delete', `Deleted sheet: ${ds.sheet_name || ds.file_name}`, { datasetId: dsId });
      const remaining = datasets.filter((d) => d.id !== dsId);
      setDatasets(remaining);
      if (activeDatasetId === dsId) setActiveDatasetId(remaining.length > 0 ? remaining[0].id : null);
      setStatusMsg({ type: 'info', text: `Deleted sheet "${ds.sheet_name || ds.file_name}".` });
    } catch (error) {
      setStatusMsg({ type: 'error', text: `Failed to delete sheet: ${(error as Error).message}` });
    }
  };

  // ── Subscales ──
  const addSubscale = async () => {
    if (!dataset) return;
    const name = `Subscale ${subscaleStates.length + 1}`;
    const order = subscaleStates.length;
    const newSub = { id: crypto.randomUUID(), name, items: [], scoringMethod: 'sum' as const, showOutputs: ['sum'] as ScoreOutput[], customFormula: '', scaleType: 'numeric' as const, minValue: 1, maxValue: 5, labelMap: [], displayOrder: order };
    try {
      await persistSurveyConfig({ subscales: [...subscaleStates, newSub] });
      setSubscaleStates([...subscaleStates, newSub]);
      setActiveSubscaleId(newSub.id);
      setActiveStep('subscales');
      await logAction(project.id, 'subscale_create', `Created subscale: ${name}`, {}, null, dataset.id);
      const hist = await fetchHistory(dataset.id); setHistory(hist);
      setTimeout(() => {
        const el = document.querySelector(`[data-subscale-id="${newSub.id}"]`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    } catch (error) {
      setStatusMsg({ type: 'error', text: `Failed to create subscale: ${(error as Error).message}` });
    }
  };

  const deleteSubscale = async (id: string) => {
    if (!dataset) return;
    const sub = subscaleStates.find((s) => s.id === id);
    const updated = subscaleStates.filter((s) => s.id !== id).map((s, i) => ({ ...s, displayOrder: i }));
    const nextBands = { ...bandStates };
    const nextBandsByOutput = { ...bandStatesByOutput };
    if (sub) delete nextBands[sub.name];
    if (sub) delete nextBandsByOutput[sub.name];
    try {
      await persistSurveyConfig({ subscales: updated, bands: nextBands, bandsByOutput: nextBandsByOutput });
      setSubscaleStates(updated);
      setBandStates(nextBands);
      setBandStatesByOutput(nextBandsByOutput);
      await logAction(project.id, 'subscale_delete', `Deleted subscale: ${sub?.name || id}`, {}, null, dataset.id);
      const hist = await fetchHistory(dataset.id); setHistory(hist);
    } catch (error) {
      setStatusMsg({ type: 'error', text: `Failed to delete subscale: ${(error as Error).message}` });
    }
  };

  const renameSubscale = (id: string, name: string) => {
    const oldName = subscaleStates.find((s) => s.id === id)?.name;
    setSubscaleStates(subscaleStates.map((s) => s.id === id ? { ...s, name } : s));
    if (oldName && bandStates[oldName]) {
      const nb = { ...bandStates };
      nb[name] = nb[oldName]; delete nb[oldName];
      setBandStates(nb);
    }
    if (oldName && bandStatesByOutput[oldName]) {
      const next = { ...bandStatesByOutput };
      next[name] = next[oldName]; delete next[oldName];
      setBandStatesByOutput(next);
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

  const toggleScoreOutput = (id: string, output: ScoreOutput) => {
    setSubscaleStates((previous) => previous.map((subscale) => {
      if (subscale.id !== id) return subscale;
      const current = shownScoreOutputs(subscale.showOutputs, subscale.scoringMethod);
      if (current.includes(output) && current.length === 1) return subscale;
      const next = current.includes(output)
        ? current.filter((candidate) => candidate !== output)
        : [...current, output];
      const ordered = SCORE_OUTPUT_ORDER.filter((candidate) => next.includes(candidate));
      return { ...subscale, showOutputs: ordered, scoringMethod: ordered[0] };
    }));
    markDirty();
  };
  const setCustomFormula = (id: string, f: string) => { setSubscaleStates(subscaleStates.map((s) => s.id === id ? { ...s, customFormula: f } : s)); markDirty(); };
  const setScaleType = (id: string, t: 'numeric' | 'categorical') => { setSubscaleStates((prev) => prev.map((s) => s.id === id ? { ...s, scaleType: t } : s)); markDirty(); };
  const setScaleRange = (id: string, min: number | null, max: number | null) => { setSubscaleStates((prev) => prev.map((s) => s.id === id ? { ...s, minValue: min, maxValue: max, confirmed: true } : s)); markDirty(); };
  const confirmScaleRange = (id: string) => { setSubscaleStates((prev) => prev.map((s) => s.id === id ? { ...s, confirmed: true } : s)); markDirty(); };
  const setLabelMap = (id: string, lm: { label: string; value: number }[]) => { setSubscaleStates((prev) => prev.map((s) => s.id === id ? { ...s, labelMap: lm } : s)); markDirty(); };

  const autoDetectScale = (subscaleId: string) => {
    const sub = subscaleStates.find((s) => s.id === subscaleId);
    if (!sub || !dataset) return;
    const det = detectScale(dataset.headers, dataset.rows as Record<string, unknown>[], sub.items.map((i) => i.column));
    setSubscaleStates((prev) => prev.map((s) => s.id !== subscaleId ? s : {
      ...s, scaleType: det.scaleType, minValue: det.minValue, maxValue: det.maxValue,
      labelMap: det.scaleType === 'categorical' ? det.uniqueValues.map((label, i) => ({ label, value: i + 1 })) : [],
      confirmed: false,
    }));
    setStatusMsg({ type: 'success', text: det.suggestion });
    markDirty();
  };

  const applyScaleToAll = () => {
    if (subscaleStates.length === 0) return;
    const first = subscaleStates[0];
    setSubscaleStates((prev) => copyFirstResponseScaleSettings(first, prev).map((s) => ({
      ...s,
      scaleType: first.scaleType,
    })));
    setStatusMsg({ type: 'success', text: `Applied "${first.name}" scale config to all ${subscaleStates.length} subscales.` });
    markDirty();
  };

  // ── Bands ──
  const changeBands = (
    name: string,
    output: ScoreOutput | undefined,
    update: (current: BandState[]) => BandState[],
  ) => {
    if (output) {
      setBandStatesByOutput((current) => ({
        ...current,
        [name]: { ...current[name], [output]: update(current[name]?.[output] ?? []) },
      }));
    } else {
      setBandStates((current) => ({ ...current, [name]: update(current[name] ?? []) }));
    }
    markDirty();
  };
  const addBand = (name: string, output?: ScoreOutput) => changeBands(name, output, (current) => [
    ...current,
    { name: 'New Band', minScore: 0, maxScore: 0, color: '#14b8a6' },
  ]);
  const updateBand = (name: string, output: ScoreOutput | undefined, index: number, field: keyof BandState, value: string | number) =>
    changeBands(name, output, (current) => current.map((band, currentIndex) =>
      currentIndex === index ? { ...band, [field]: value } : band,
    ));
  const removeBand = (name: string, output: ScoreOutput | undefined, index: number) =>
    changeBands(name, output, (current) => current.filter((_, currentIndex) => currentIndex !== index));

  const autoSuggestBands = (name: string, output: ScoreOutput | undefined, range: OutputRange) => {
    const suggested = suggestBands(range, 3);
    changeBands(name, output, () => suggested);
  };

  // ── Row exclusion (delegates to shared state in App) ──
  const toggleRowExclusion = async (rowIndex: number) => {
    if (!dataset) return;
    const rowId = dataset.row_ids[rowIndex];
    if (!rowId) {
      setStatusMsg({ type: 'error', text: 'Cannot save this exclusion because the row has no stable ID.' });
      return;
    }
    const wasExcluded = sharedExcludedRows.has(rowIndex);
    try {
      await onToggleRowExclusion(rowIndex);
      await logAction(project.id, 'row_exclude_toggle',
        `${wasExcluded ? 'Included' : 'Excluded'} row ${rowIndex + 1}`,
        { rowId, action: wasExcluded ? 'include' : 'exclude' },
        { rowId, wasExcluded },
        dataset.id,
      );
      const hist = await fetchHistory(dataset.id); setHistory(hist);
    } catch (error) {
      setStatusMsg({ type: 'error', text: `Failed to save row exclusion: ${(error as Error).message}` });
    }
  };

  // ── Scoring ──
  const runScoring = async () => {
    if (!dataset) return;
    setScoring(true); setStatusMsg(null);
    try {
      let subConfigs: SubscaleConfig[] = subscaleStates.map((s) => ({
        id: s.id, name: s.name, items: s.items, scoringMethod: s.scoringMethod,
        showOutputs: shownScoreOutputs(s.showOutputs, s.scoringMethod),
        customFormula: s.customFormula || null,
        responseScale: { scaleType: s.scaleType, minValue: s.minValue ?? undefined, maxValue: s.maxValue ?? undefined, labelMap: s.labelMap, confirmed: s.confirmed === true },
      }));
      const bandConfigs: Record<string, BandConfig[]> = {};
      const bandConfigsByOutput: Record<string, Partial<Record<ScoreOutput, BandConfig[]>>> = {};
      if (subConfigs.length === 0) {
        subConfigs = [{
          id: overallScale.id, name: overallScale.name,
          items: overallScale.items, scoringMethod: overallScale.scoringMethod,
          showOutputs: shownScoreOutputs(overallScale.showOutputs, overallScale.scoringMethod),
          customFormula: overallScale.customFormula || null,
          responseScale: { scaleType: overallScale.scaleType, minValue: overallScale.minValue ?? undefined, maxValue: overallScale.maxValue ?? undefined, labelMap: overallScale.labelMap, confirmed: overallScale.confirmed === true },
        }];
        bandConfigs[overallScale.name] = (bandStates[overallScale.name] || []).map((b) => ({ name: b.name, minScore: b.minScore, maxScore: b.maxScore, color: b.color }));
      } else {
        for (const sub of subscaleStates) {
          const outputBands: Partial<Record<ScoreOutput, BandConfig[]>> = {};
          for (const output of SCORE_OUTPUT_ORDER) {
            const bands = bandStatesByOutput[sub.name]?.[output];
            if (bands) {
              outputBands[output] = bands.map((band) => ({
                name: band.name,
                minScore: band.minScore,
                maxScore: band.maxScore,
                color: band.color,
              }));
            }
          }
          bandConfigsByOutput[sub.id] = outputBands;
        }
        const overallBands = bandStates[overallScale.name] ?? [];
        if (overallBands.length > 0) {
          bandConfigsByOutput.overall = {
            [overallSettings.combineBy === 'custom' ? 'custom' : overallSettings.combineBy]: overallBands.map((band) => ({
              name: band.name,
              minScore: band.minScore,
              maxScore: band.maxScore,
              color: band.color,
            })),
          };
        }
      }
      const config = await persistSurveyConfig();
      const excludedRowIds = [...sharedExcludedRows].map((index) => dataset.row_ids[index]).filter((id): id is string => !!id);
      const result = scoreDataset(
        dataset.rows,
        dataset.headers,
        subConfigs,
        bandConfigs,
        Array.from(sharedExcludedRows),
        {
          rowIds: dataset.row_ids,
          bandsByOutput: bandConfigsByOutput,
          legacyScoreColumnIds: subscaleStates.length === 0 ? [overallScale.id] : [],
          overall: subscaleStates.length > 0 ? {
            enabled: overallSettings.enabled,
            basedOn: overallSettings.basedOn,
            combineBy: overallSettings.combineBy,
            customFormula: overallSettings.customFormula || null,
          } : undefined,
        },
      );
      const hashes = await createScoreHashes(dataset, config, subConfigs, excludedRowIds);
      const saved = await scoreRepository.save(dataset.id, {
        ...hashes,
        computed_at: Date.now(),
        payload: { result },
      });
      setScoringResult(result);
      const nv = saved.version;
      await logAction(project.id, 'scoring', `Scored data (v${nv}, ${result.rows.length} rows, ${sharedExcludedRows.size} excluded)`, { version: nv, excludedCount: sharedExcludedRows.size }, null, dataset.id);
      const idColumn = demoCols.find((column) => /\bID\b/i.test(column.detected_by))?.column_name;
      const displayIds = idColumn
        ? result.rowIds.map((_, index) => {
            const value = dataset.rows[index][idColumn];
            return value == null || String(value).trim() === '' ? undefined : String(value);
          })
        : undefined;
      const unscoredSummary = getUnscoredRowSummary(result, displayIds);
      const outOfBandSummary = getOutOfBandSummary(result, displayIds);
      setStatusMsg({
        type: 'success',
        text: `Scoring complete (v${nv}). ${sharedExcludedRows.size} rows excluded.${unscoredSummary ? ` ${unscoredSummary}` : ''}${outOfBandSummary ? ` ${outOfBandSummary}` : ''}`,
      });
      const hist = await fetchHistory(dataset.id); setHistory(hist);
    } catch (e) { setStatusMsg({ type: 'error', text: `Scoring failed: ${(e as Error).message}` }); }
    setScoring(false);
  };

  // ── Templates ──
  const saveAsTemplate = async (name: string, description: string, instrument: string): Promise<string | null> => {
    const validation = validateTemplateConfig(subscaleStates);
    if (!validation.valid) return validation.error;
    const def = buildTemplateDefinition(subscaleStates, bandStates, bandStatesByOutput, {
      ...overallSettings,
      bands: bandStates[overallScale.name] ?? [],
    });
    try {
      await templateRepository.save({ name, description, instrument, definition: def, version: 1 });
      await logAction(project.id, 'template_save', `Saved template: ${name}`);
      setStatusMsg({ type: 'success', text: `Template "${name}" saved.` });
      setShowTemplateModal(false);
      await loadDatasets();
      return null;
    } catch (error) {
      const message = `Failed to save: ${(error as Error).message}`;
      setStatusMsg({ type: 'error', text: message });
      return message;
    }
  };

  const [pendingApplyTemplate, setPendingApplyTemplate] = useState<Template | null>(null);
  const [applyMatchReport, setApplyMatchReport] = useState<TemplateMatchReport | null>(null);

  const previewApplyTemplate = (template: Template) => {
    if (!dataset) return;
    const def = template.definition as TemplateDefinition;
    const report = matchTemplateToHeaders(template.name, def, dataset.headers);
    if (report.matchedCount === 0) {
      setStatusMsg({ type: 'error', text: `No items from "${template.name}" matched columns in this dataset. Check that the column names are compatible.` });
      return;
    }
    setPendingApplyTemplate(template);
    setApplyMatchReport(report);
  };

  const confirmApplyTemplate = async () => {
    const template = pendingApplyTemplate;
    const report = applyMatchReport;
    if (!dataset || !template || !report) return;

    if (subscaleStates.length > 0) {
      if (!window.confirm('This will replace the current scale configuration. Continue?')) return;
    }

    const def = template.definition as TemplateDefinition;
    const nextBands: Record<string, BandState[]> = {};
    const nextBandsByOutput: Record<string, Partial<Record<ScoreOutput, BandState[]>>> = {};
    const nextSubscales: SubscaleState[] = [];
    for (const definition of def.subscales) {
      const matched = report.matchedBySubscale[definition.name] || [];
      if (matched.length === 0) continue;
      const scale = def.responseScales.find((item) => item.subscaleName === definition.name);
      const scoreSettings = templateSubscaleScoreSettings(def, definition.name);
      nextSubscales.push({
        id: crypto.randomUUID(),
        name: definition.name,
        items: matched,
        scoringMethod: scoreSettings.showOutputs[0],
        showOutputs: scoreSettings.showOutputs,
        customFormula: definition.customFormula || '',
        scaleType: scale?.scaleType || 'numeric',
        minValue: scale?.minValue ?? null,
        maxValue: scale?.maxValue ?? null,
        labelMap: scale?.labelMap || [],
        displayOrder: nextSubscales.length,
      });
      nextBandsByOutput[definition.name] = scoreSettings.bandsByOutput;
      const firstBands = scoreSettings.bandsByOutput[scoreSettings.showOutputs[0]] ?? [];
      if (firstBands.length) nextBands[definition.name] = firstBands;
    }
    const nextDemographics = detectDemographics(dataset.headers, dataset.rows).map((suggestion) => ({
      id: crypto.randomUUID(),
      project_id: project.id,
      dataset_id: dataset.id,
      column_name: suggestion.column,
      detected_by: suggestion.rule,
      confidence: suggestion.confidence,
      confirmed: suggestion.confidence >= 0.5,
      created_at: new Date().toISOString(),
    }));
    const nextOverallSettings = def.overall
      ? {
          enabled: def.overall.enabled,
          basedOn: def.overall.basedOn,
          combineBy: def.overall.combineBy,
          customFormula: def.overall.customFormula,
        }
      : overallSettings;
    const nextBandsWithOverall = def.overall?.bands.length
      ? { ...nextBands, [overallScale.name]: def.overall.bands }
      : nextBands;
    try {
      const existing = await surveyConfigRepository.get(dataset.id);
      const config = toSurveyConfigRecord({
        datasetId: dataset.id,
        projectId: project.id,
        headers: dataset.headers,
        demographicColumns: nextDemographics,
        subscales: nextSubscales,
        bands: nextBandsWithOverall,
        bandsByOutput: nextBandsByOutput,
        overallScale,
        overallSettings: nextOverallSettings,
        linkedTemplateId: template.id,
      }, existing);
      await templateRepository.applyToDataset(template.id, dataset.id, config);
      setDemoCols(nextDemographics);
      setSubscaleStates(nextSubscales);
      setBandStates(nextBandsWithOverall);
      setBandStatesByOutput(nextBandsByOutput);
      setOverallSettings(nextOverallSettings);
      setLinkedTemplate(template);
      setStatusMsg({ type: 'success', text: formatMatchSummary(report) });
      setPendingApplyTemplate(null);
      setApplyMatchReport(null);
      setShowTemplateModal(false);
      await loadDatasetConfig();
    } catch (error) {
      setStatusMsg({ type: 'error', text: `Failed to apply template: ${(error as Error).message}` });
    }
  };

  const cancelApplyTemplate = () => {
    setPendingApplyTemplate(null);
    setApplyMatchReport(null);
  };

  const updateLinkedTemplate = async () => {
    if (!dataset || !linkedTemplate) return;
    const validation = validateTemplateConfig(subscaleStates);
    if (!validation.valid) { setStatusMsg({ type: 'error', text: validation.error! }); return; }
    const def = buildTemplateDefinition(subscaleStates, bandStates, bandStatesByOutput, {
      ...overallSettings,
      bands: bandStates[overallScale.name] ?? [],
    });
    try {
      await templateRepository.update(linkedTemplate.id, { definition: def, version: linkedTemplate.version + 1 });
      await logAction(project.id, 'template_update', `Updated template: ${linkedTemplate.name} (v${linkedTemplate.version + 1})`, { templateId: linkedTemplate.id }, null, dataset.id);
      setLinkedTemplate({ ...linkedTemplate, version: linkedTemplate.version + 1, definition: def });
      setShowUpdateTemplate(false);
      setStatusMsg({ type: 'success', text: `Template "${linkedTemplate.name}" updated to v${linkedTemplate.version + 1}.` });
      await loadDatasets();
    } catch (error) {
      setStatusMsg({ type: 'error', text: `Failed to update template: ${(error as Error).message}` });
    }
  };

  const unlinkTemplate = async () => {
    if (!dataset) return;
    try {
      await persistSurveyConfig({ linkedTemplateId: null });
      setLinkedTemplate(null);
      setShowUpdateTemplate(false);
      setStatusMsg({ type: 'info', text: 'Template unlinked. Changes will no longer update the template.' });
    } catch (error) {
      setStatusMsg({ type: 'error', text: `Failed to unlink template: ${(error as Error).message}` });
    }
  };

  const handleExport = async (fmt: 'csv' | 'xlsx') => {
    if (!scoringResult || !dataset) return;
    const fn = `${project.name}_${dataset.sheet_name || 'data'}_scored.${fmt}`;
    try {
      const data = buildScoredColumnData({
        result: scoringResult,
        rawHeaders: dataset.headers,
        rawRows: dataset.rows as Record<string, unknown>[],
        demographicColumns: demoCols.map((column) => column.column_name),
        idColumns: demoCols
          .filter((column) => /\bID\b/i.test(column.detected_by))
          .map((column) => column.column_name),
        subscales: subscaleStates,
      });
      const headers = [...data.headers, 'Excluded'];
      const rows = data.rows.map((row, index) => ({
        ...row,
        Excluded: sharedExcludedRows.has(index),
      }));
      const columns = [
        ...data.groups.flatMap((group) => group.columns),
        { key: 'Excluded', label: 'Excluded', group: 'Export', type: 'demo' as const },
      ];
      const summary = buildSummaryExportContent(
        headers,
        columns,
        rows,
        sharedExcludedRows,
        new Set(demoCols
          .filter((column) => /\bID\b/i.test(column.detected_by))
          .map((column) => column.column_name)),
        { sum: showSummarySum, mean: showSummaryMean },
        scoringResult.normalizedMatrix.states,
      );
      const exportOptions = {
        excludedRows: sharedExcludedRows,
        keepExcluded: true,
        numericColumns: data.numericColumns,
        summary: summary ?? undefined,
      };
      if (fmt === 'csv') exportToCSV(data.headers, data.rows, fn, exportOptions);
      else await exportToXLSX(data.headers, data.rows, fn, exportOptions);
    } catch (error) {
      setStatusMsg({ type: 'error', text: `Export failed: ${(error as Error).message}` });
    }
  };

  const undoAction = async (action: ActionHistory) => {
    if (!dataset) return;
    try {
      if (action.action_type === 'row_exclude_toggle' && action.undo_data) {
        const rowId = action.undo_data.rowId;
        if (!rowId) {
          setStatusMsg({ type: 'error', text: 'Cannot undo: this history event has no stable row ID.' });
          return;
        }
        const rowIndex = dataset.row_ids.indexOf(rowId);
        if (rowIndex < 0) {
          setStatusMsg({ type: 'error', text: 'Cannot undo: the affected row no longer exists in this dataset.' });
          return;
        }
        const newSet = new Set(sharedExcludedRows);
        if (newSet.has(rowIndex)) newSet.delete(rowIndex); else newSet.add(rowIndex);
        await onSetExcludedRows(newSet);
        await deleteAction(action.id);
        const hist = await fetchHistory(dataset.id); setHistory(hist);
        setStatusMsg({ type: 'info', text: `Undid: ${action.description}` });
      } else if (action.action_type === 'demographic_toggle' && action.payload) {
        const col = action.payload.column as string;
        const wasAdd = action.payload.action === 'add';
        const nextDemographics = wasAdd
          ? demoCols.filter((demographic) => demographic.column_name !== col)
          : [...demoCols, {
              id: crypto.randomUUID(),
              project_id: project.id,
              dataset_id: dataset.id,
              column_name: col,
              detected_by: 'manual',
              confidence: 1,
              confirmed: true,
              created_at: new Date().toISOString(),
            }];
        await persistSurveyConfig({ demographicColumns: nextDemographics });
        setDemoCols(nextDemographics);
        await deleteAction(action.id);
        await loadDatasetConfig();
        setStatusMsg({ type: 'info', text: `Undid: ${action.description}` });
      } else {
        await loadDatasetConfig();
        await deleteAction(action.id);
        setStatusMsg({ type: 'info', text: `Undid: ${action.description}` });
      }
    } catch (error) {
      setStatusMsg({ type: 'error', text: `Failed to undo action: ${(error as Error).message}` });
    }
  };

  const scoredColumnData = useMemo(() => buildScoredColumnData({
    result: scoringResult,
    rawHeaders: dataset?.headers ?? [],
    rawRows: dataset?.rows as Record<string, unknown>[] ?? [],
    demographicColumns: demoCols.map((column) => column.column_name),
    idColumns: demoCols
      .filter((column) => /\bID\b/i.test(column.detected_by))
      .map((column) => column.column_name),
    subscales: subscaleStates,
  }), [dataset, scoringResult, demoCols, subscaleStates]);
  const groups: GridGroup[] = scoredColumnData.groups;
  const summaryItemStates = scoringResult?.normalizedMatrix.states;
  const summary = useMemo(() => {
    const sums: Record<string, number | null> = {};
    const means: Record<string, number | null> = {};
    const statistics = buildSummaryStatistics(
      groups.flatMap((group) => group.columns),
      scoredColumnData.rows,
      sharedExcludedRows,
      new Set(demoCols
        .filter((column) => /\bID\b/i.test(column.detected_by))
        .map((column) => column.column_name)),
      summaryItemStates,
    );
    for (const [key, column] of Object.entries(statistics.columns)) {
      sums[key] = column.sum;
      means[key] = column.mean;
    }
    return { sums, means, numericColumns: statistics.numericColumns };
  }, [scoredColumnData, sharedExcludedRows, groups, demoCols, summaryItemStates]);

  const displayRows = showExcludedOnly
    ? scoredColumnData.rows.filter((_, index) => sharedExcludedRows.has(index))
    : scoredColumnData.rows;
  const canScore = !!dataset && (subscaleStates.length === 0 || subscaleStates.every((s) => s.items.length > 0 || (shownScoreOutputs(s.showOutputs, s.scoringMethod).length === 1 && s.scoringMethod === 'custom'))) && itemColumns.length > 0;
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
          <div className="flex items-center gap-1 bg-secondary-100 rounded-lg p-0.5" aria-label="Summary rows">
            <span
              className="px-2 text-xs font-medium text-secondary-500 whitespace-nowrap"
              title="Adds rows at the bottom of the grid with the sum / mean of each column across respondents. Blank and invalid cells are ignored."
            >
              Summary rows
            </span>
            {([
              { key: 'sum' as const, icon: Sigma, label: 'Sum', active: showSummarySum, toggle: onToggleSummarySum },
              { key: 'mean' as const, icon: TrendingUp, label: 'Mean', active: showSummaryMean, toggle: onToggleSummaryMean },
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

      <input ref={fileInputRef} type="file" accept=".csv,.xlsx" className="hidden"
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
              bands: Object.values(bandStates).some((bs) => bs.length > 0)
                || Object.values(bandStatesByOutput).some((outputs) =>
                  Object.values(outputs).some((bs) => (bs?.length ?? 0) > 0))
                ? 'done' : 'pending',
              scoring: scoringResult ? 'done' : 'pending',
            }} />

            {/* Config panel */}
            {!leftPanelCollapsed && (
              <div style={{ width: leftPanelWidth }} className="border-r border-secondary-200 bg-white overflow-y-auto flex-shrink-0">
                <div className="px-3 py-2 border-b border-secondary-200 bg-secondary-50/50">
                  <span className="text-xs font-semibold text-secondary-500 uppercase tracking-wide">
                    {activeStep === 'demographics' && 'ID Columns'}
                    {activeStep === 'subscales' && 'Scale Groups'}
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
                    subscales={subscaleStates} rows={dataset?.rows ?? []} rowIds={dataset?.row_ids ?? []}
                    onSetScaleType={setScaleType} onSetScaleRange={setScaleRange}
                    onConfirmRange={confirmScaleRange}
                    onApplyOutOfRange={async (id, action, values) => {
                      if (!dataset) return;
                      const subscale = subscaleStates.find((candidate) => candidate.id === id);
                      if (!subscale || subscale.minValue === null || subscale.maxValue === null) return;
                      const result = applyOutOfRangeAction({
                        min: subscale.minValue, max: subscale.maxValue, rangeSource: 'manual',
                        confirmed: subscale.confirmed === true, flipped: false, startsAtZero: false,
                        labels: [], outOfRange: action,
                      }, values, action);
                      setSubscaleStates((previous) => previous.map((candidate) => candidate.id === id ? {
                        ...candidate,
                        minValue: result.scale.min,
                        maxValue: result.scale.max,
                        confirmed: result.scale.confirmed,
                        outOfRange: action,
                      } : candidate));
                      await logOutOfRangeAction(project.id, dataset.id, result.log);
                      setHistory(await fetchHistory(dataset.id));
                      markDirty();
                    }}
                    onHighlightCell={(rowIndex) => {
                      onHighlightRow(rowIndex);
                      window.setTimeout(onClearHighlight, 4000);
                    }}
                    onSetLabelMap={setLabelMap} onToggleOutput={toggleScoreOutput}
                    onSetCustomFormula={setCustomFormula} onAutoDetect={autoDetectScale}
                    onApplyToAll={applyScaleToAll}
                    overallScale={overallScale} onSetOverallScale={(patch) => { setOverallScale((prev) => ({ ...prev, ...patch })); markDirty(); }}
                    overallSettings={overallSettings}
                    onSetOverallSettings={(patch) => { setOverallSettings((prev) => ({ ...prev, ...patch })); markDirty(); }}
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
                    bandStatesByOutput={bandStatesByOutput}
                    selectedBandOutputs={selectedBandOutputs}
                    onSelectBandOutput={(id, output) => setSelectedBandOutputs((current) => ({ ...current, [id]: output }))}
                    onAddBand={addBand} onUpdateBand={updateBand} onRemoveBand={removeBand}
                    onAutoSuggest={autoSuggestBands}
                    overallScale={overallScale}
                    overallSettings={overallSettings}
                  />
                )}
                {activeStep === 'scoring' && (
                  <ScoringPanel
                    canScore={canScore} scoring={scoring} onRunScoring={runScoring}
                    scoringResult={scoringResult} onExport={handleExport}
                    excludedCount={sharedExcludedRows.size} subscaleCount={subscaleStates.length || (itemColumns.length > 0 ? 1 : 0)}
                    usedAutoScale={subscaleStates.length === 0 && !!dataset}
                    originalColCount={originalColCount} computedColCount={computedColCount}
                    hasSubscaleItems={subscaleStates.length > 0 && subscaleStates.some((s) => s.items.length === 0 && s.scoringMethod !== 'custom')}
                    unassignedItemCount={subscaleStates.length > 0 ? getUnassignedItemCount(itemColumns, subscaleStates) : 0}
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

      {/* Import preview modal */}
      <ImportPreviewModal
        open={!!importPreviewRequest}
        request={importPreviewRequest}
        onConfirm={handlePreviewConfirm}
        onCancel={handlePreviewCancel}
      />

      {/* Template modal */}
      <TemplateModal open={showTemplateModal} onClose={() => { setShowTemplateModal(false); cancelApplyTemplate(); }}
        templates={templates} onSaveAsTemplate={saveAsTemplate} onPreviewApply={previewApplyTemplate}
        onConfirmApply={confirmApplyTemplate} onCancelApply={cancelApplyTemplate}
        hasDataset={!!dataset} hasScales={subscaleStates.some((s) => s.items.length > 0)}
        matchReport={applyMatchReport} pendingTemplate={pendingApplyTemplate} />
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
    { name: 'scales', icon: Sliders, label: 'Response scales' },
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
      <p className="text-sm text-secondary-500 mb-4">Drag & drop a CSV or XLSX file, or click to browse. Works with Qualtrics, SurveyMonkey, REDCap, Google Forms, and general spreadsheet exports. You'll preview the layout before importing.</p>
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
        <span className="text-xs font-semibold text-secondary-500 uppercase tracking-wide">Scale Groups</span>
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
          <div key={sub.id} data-subscale-id={sub.id}
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
function ScalesPanel({ subscales, rows, rowIds, onSetScaleType, onSetScaleRange, onConfirmRange, onApplyOutOfRange, onHighlightCell, onSetLabelMap, onToggleOutput, onSetCustomFormula, onAutoDetect, onApplyToAll, overallScale, overallSettings, onSetOverallSettings, onSetOverallScale, onAutoDetectOverall, formulaPreviewFn }: {
  subscales: SubscaleState[];
  rows: Record<string, unknown>[];
  rowIds: string[];
  onSetScaleType: (id: string, t: 'numeric' | 'categorical') => void;
  onSetScaleRange: (id: string, min: number | null, max: number | null) => void;
  onConfirmRange: (id: string) => void;
  onApplyOutOfRange: (id: string, action: 'missing' | 'widen', values: number[]) => Promise<void>;
  onHighlightCell: (rowIndex: number) => void;
  onSetLabelMap: (id: string, lm: { label: string; value: number }[]) => void;
  onToggleOutput: (id: string, output: ScoreOutput) => void;
  onSetCustomFormula: (id: string, f: string) => void;
  onAutoDetect: (id: string) => void;
  onApplyToAll: () => void;
  overallScale: SubscaleState;
  overallSettings: OverallSettings;
  onSetOverallSettings: (patch: Partial<OverallSettings>) => void;
  onSetOverallScale: (patch: Partial<SubscaleState>) => void;
  onAutoDetectOverall: () => void;
  formulaPreviewFn: (formula: string, itemCols: string[]) => string;
}) {
  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-secondary-500 uppercase tracking-wide">Response Scales</span>
        <div className="flex items-center gap-3">
          {subscales.length >= 2 && <button onClick={onApplyToAll} className="text-xs text-primary-600 hover:underline">Apply first to all</button>}
          {subscales.length >= 2 && (
            <button
              type="button"
              role="switch"
              aria-checked={overallSettings.enabled}
              onClick={() => onSetOverallSettings({ enabled: !overallSettings.enabled })}
              className={`text-xs px-2 py-1 rounded-md ${overallSettings.enabled ? 'bg-primary-600 text-white' : 'bg-secondary-100 text-secondary-600'}`}
            >
              Overall scale
            </button>
          )}
        </div>
      </div>
      <div className="space-y-3">
        {subscales.length >= 2 && overallSettings.enabled && (
          <Card className="p-3">
            <h4 className="font-semibold text-sm text-secondary-900 mb-2">Overall Scale</h4>
            <div className="text-xs text-secondary-500 mb-1">Based on</div>
            <div className="flex items-center gap-1 mb-2">
              {([
                ['sums', 'Subscale Sums'],
                ['means', 'Means'],
                ['custom', 'Custom scores'],
              ] as const).map(([value, label]) => {
                const customDisabled = value === 'custom' && !subscales.every((subscale) => !!subscale.customFormula.trim());
                return (
                  <button
                    key={value}
                    type="button"
                    disabled={customDisabled}
                    title={customDisabled ? 'Every subscale needs a custom formula.' : undefined}
                    onClick={() => onSetOverallSettings({ basedOn: value })}
                    className={`px-2 py-0.5 text-xs rounded-md ${overallSettings.basedOn === value ? 'bg-primary-600 text-white' : 'bg-secondary-100 text-secondary-600'} disabled:opacity-50`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <div className="text-xs text-secondary-500 mb-1">Combine by</div>
            <div className="flex items-center gap-1">
              {([
                ['sum', 'Sum'],
                ['mean', 'Mean'],
                ['custom', 'Custom formula'],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => onSetOverallSettings({ combineBy: value })}
                  className={`px-2 py-0.5 text-xs rounded-md ${overallSettings.combineBy === value ? 'bg-primary-600 text-white' : 'bg-secondary-100 text-secondary-600'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            {overallSettings.combineBy === 'custom' && (
              <input
                value={overallSettings.customFormula}
                onChange={(event) => onSetOverallSettings({ customFormula: event.target.value })}
                placeholder="e.g. Stress + Coping"
                className="w-full mt-2 px-2 py-1 text-xs border border-secondary-200 rounded font-mono"
              />
            )}
          </Card>
        )}
        {subscales.length === 0 && (
          <ScaleCardCompact name={overallScale.name} scaleType={overallScale.scaleType} scoringMethod={overallScale.scoringMethod} customFormula={overallScale.customFormula}
            showOutputs={shownScoreOutputs(overallScale.showOutputs, overallScale.scoringMethod)}
            minValue={overallScale.minValue} maxValue={overallScale.maxValue} labelMap={overallScale.labelMap} confirmed={overallScale.confirmed}
            itemCols={overallScale.items.map((i) => i.column)}
            onSetScoringMethod={(m) => onSetOverallScale({ scoringMethod: m })}
            onToggleOutput={() => {}}
            multipleOutputs={false}
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
            showOutputs={shownScoreOutputs(sub.showOutputs, sub.scoringMethod)}
            minValue={sub.minValue} maxValue={sub.maxValue} labelMap={sub.labelMap} confirmed={sub.confirmed}
            itemCols={sub.items.map((i) => i.column)}
            onSetScoringMethod={() => {}}
            onToggleOutput={(output) => onToggleOutput(sub.id, output)}
            multipleOutputs
            onSetCustomFormula={(f) => onSetCustomFormula(sub.id, f)}
            onSetScaleType={(t) => onSetScaleType(sub.id, t)}
            onSetScaleRange={(min, max) => onSetScaleRange(sub.id, min, max)}
            onConfirmRange={() => onConfirmRange(sub.id)}
            rows={rows}
            rowIds={rowIds}
            onApplyOutOfRange={(action, values) => onApplyOutOfRange(sub.id, action, values)}
            onHighlightCell={onHighlightCell}
            onSetLabelMap={(lm) => onSetLabelMap(sub.id, lm)}
            onAutoDetect={() => onAutoDetect(sub.id)}
            formulaPreviewFn={formulaPreviewFn}
          />
        ))}
      </div>
    </div>
  );
}

function ScaleCardCompact({ name, scaleType, scoringMethod, showOutputs, customFormula, minValue, maxValue, labelMap, confirmed, itemCols, rows = [], rowIds = [], onApplyOutOfRange, onHighlightCell, onSetScoringMethod, onToggleOutput, multipleOutputs, onSetCustomFormula, onSetScaleType, onSetScaleRange, onConfirmRange, onSetLabelMap, onAutoDetect, formulaPreviewFn }: {
  name: string; scaleType: 'numeric' | 'categorical'; scoringMethod: 'sum' | 'mean' | 'custom'; showOutputs: ScoreOutput[]; customFormula: string;
  multipleOutputs: boolean;
  minValue: number | null; maxValue: number | null; labelMap: { label: string; value: number }[]; itemCols: string[];
  confirmed?: boolean;
  rows?: Record<string, unknown>[];
  rowIds?: string[];
  onApplyOutOfRange?: (action: 'missing' | 'widen', values: number[]) => Promise<void>;
  onHighlightCell?: (rowIndex: number) => void;
  onSetScoringMethod: (m: 'sum' | 'mean' | 'custom') => void;
  onToggleOutput: (output: ScoreOutput) => void;
  onSetCustomFormula: (f: string) => void;
  onSetScaleType: (t: 'numeric' | 'categorical') => void;
  onSetScaleRange: (min: number | null, max: number | null) => void;
  onConfirmRange?: () => void;
  onSetLabelMap: (lm: { label: string; value: number }[]) => void;
  onAutoDetect: () => void;
  formulaPreviewFn: (formula: string, itemCols: string[]) => string;
}) {
  const customVisible = multipleOutputs ? showOutputs.includes('custom') : scoringMethod === 'custom';
  const formulaError = customVisible && customFormula ? validateFormula(customFormula, itemCols) : null;
  const preview = customVisible && customFormula ? formulaPreviewFn(customFormula, itemCols) : '';
  const rangeOutliers = scaleType === 'numeric' && minValue !== null && maxValue !== null
    ? assessRangeOutliers(itemCols.flatMap((column) => rows.map((row) => row[column])), { min: minValue, max: maxValue })
    : null;
  const affectedCells = rangeOutliers && minValue !== null && maxValue !== null
    ? rows.flatMap((row, rowIndex) => itemCols.flatMap((column) => {
        const value = typeof row[column] === 'number' ? row[column] : Number(row[column]);
        return Number.isFinite(value) && (value < minValue || value > maxValue)
          ? [{ column, rowIndex, value }] : [];
      }))
    : [];
  const mixedRanges = multipleOutputs && itemCols.length > 1
    ? (() => {
        try {
          return detectMixedRanges(Object.fromEntries(itemCols.map((column) => [column, rows.map((row) => row[column])])));
        } catch {
          return null;
        }
      })()
    : null;
  return (
    <Card className="p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <h4 className="font-semibold text-sm text-secondary-900 truncate">{name}</h4>
          {multipleOutputs && scaleType === 'numeric' && minValue !== null && maxValue !== null && (
            <span className="text-xs text-secondary-500 whitespace-nowrap">
              Detected: {minValue}-{maxValue} scale
            </span>
          )}
          {mixedRanges?.mixed && (
            <div className="mb-2 p-2 rounded-md border border-warning-200 bg-warning-50 text-xs text-warning-800">
              Observed ranges differ by item: {mixedRanges.items.map(({ item, range }) => `${item} ${range.min}-${range.max}`).join(', ')}. Confirm the intended range.
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {multipleOutputs && (
            <button
              type="button"
              onClick={onConfirmRange}
              className={`text-xs px-2 py-1 rounded-md border ${confirmed ? 'border-secondary-200 text-secondary-500' : 'border-primary-300 text-primary-700 bg-primary-50'}`}
            >
              {confirmed ? 'Range confirmed' : 'Confirm range'}
            </button>
          )}
          <button onClick={onAutoDetect} className="text-xs text-primary-600 hover:underline flex items-center gap-1"><Sparkles className="w-3 h-3" /> Auto</button>
        </div>
      </div>
      {multipleOutputs && scaleType === 'numeric' && minValue !== null && maxValue !== null && (
        <div className="text-xs text-secondary-500 mb-2">
          <span className={confirmed ? 'text-success-700' : 'text-warning-700'}>
            {confirmed ? 'confirmed' : 'not confirmed'}
          </span>
          {!confirmed && <span> — suggestions can be changed before confirming.</span>}
        </div>
      )}
      {multipleOutputs && rangeOutliers && rangeOutliers.count > 0 && (
        <div className="mb-2 p-2 rounded-md border border-warning-200 bg-warning-50 text-xs text-warning-800">
          <div className="mb-1">
            {minValue}-{maxValue} detected. {rangeOutliers.count} value{rangeOutliers.count === 1 ? '' : 's'} outside (
            {affectedCells.map((cell, index) => (
              <React.Fragment key={`${cell.column}-${cell.rowIndex}`}>
                {index > 0 && ', '}
                <button
                  type="button"
                  className="underline hover:text-warning-950"
                  onClick={() => onHighlightCell?.(cell.rowIndex)}
                >
                  {cell.column}: {rowIds[cell.rowIndex] ?? `row ${cell.rowIndex + 1}`}
                </button>
              </React.Fragment>
            ))}
            ).
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={`px-2 py-1 rounded ${rangeOutliers.suggestedAction === 'missing' ? 'bg-warning-200 font-semibold' : 'bg-white border border-warning-200'}`}
              onClick={() => onApplyOutOfRange?.('missing', rangeOutliers.values)}
            >
              Treat as missing
            </button>
            <button
              type="button"
              className={`px-2 py-1 rounded ${rangeOutliers.suggestedAction === 'widen' ? 'bg-warning-200 font-semibold' : 'bg-white border border-warning-200'}`}
              onClick={() => onApplyOutOfRange?.('widen', rangeOutliers.values)}
            >
              Widen range
            </button>
          </div>
        </div>
      )}
      <div className="flex items-center gap-1 mb-2">
        {multipleOutputs && <span className="text-xs text-secondary-500">Show:</span>}
        {(multipleOutputs ? ['sum', 'mean', 'custom'] as const : ['sum', 'mean', 'custom'] as const).map((output) => (
          <button
            key={output}
            onClick={() => multipleOutputs ? onToggleOutput(output) : onSetScoringMethod(output)}
            disabled={multipleOutputs && showOutputs.length === 1 && showOutputs.includes(output)}
            aria-pressed={multipleOutputs ? showOutputs.includes(output) : scoringMethod === output}
            className={`px-2 py-0.5 text-xs rounded-md transition-colors ${(multipleOutputs ? showOutputs.includes(output) : scoringMethod === output) ? 'bg-primary-600 text-white' : 'bg-secondary-100 text-secondary-600 hover:bg-secondary-200'} disabled:opacity-60`}
          >
            {output === 'sum' ? 'Sum' : output === 'mean' ? 'Mean' : multipleOutputs ? 'Custom formula' : 'Custom'}
          </button>
        ))}
      </div>
      {customVisible && (
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
          <input type="number" value={minValue ?? ''} onChange={(e) => onSetScaleRange(e.target.value ? Number(e.target.value) : null, maxValue)} className="w-16 px-2 py-1 text-xs border border-secondary-200 rounded focus:outline-none focus:border-primary-400" placeholder="Min" aria-label={`${name} minimum`} />
          <span className="text-secondary-400 text-xs">to</span>
          <input type="number" value={maxValue ?? ''} onChange={(e) => onSetScaleRange(minValue, e.target.value ? Number(e.target.value) : null)} className="w-16 px-2 py-1 text-xs border border-secondary-200 rounded focus:outline-none focus:border-primary-400" placeholder="Max" aria-label={`${name} maximum`} />
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

function getOverallOutputRange(
  subscales: SubscaleState[],
  settings: OverallSettings,
): OutputRange | null {
  if (settings.basedOn === 'custom' || settings.combineBy === 'custom' || subscales.length < 2) return null;
  const ranges = subscales.map((subscale) => {
    if (subscale.minValue === null || subscale.maxValue === null) return null;
    return settings.basedOn === 'sums'
      ? { min: subscale.items.length * subscale.minValue, max: subscale.items.length * subscale.maxValue }
      : { min: subscale.minValue, max: subscale.maxValue };
  });
  if (ranges.some((range) => range === null)) return null;
  const min = ranges.reduce((total, range) => total + range!.min, 0);
  const max = ranges.reduce((total, range) => total + range!.max, 0);
  return {
    min: settings.combineBy === 'mean' ? min / ranges.length : min,
    max: settings.combineBy === 'mean' ? max / ranges.length : max,
    kind: settings.basedOn === 'sums' && settings.combineBy === 'sum'
      && subscales.every((subscale) => Number.isInteger(subscale.minValue) && Number.isInteger(subscale.maxValue))
      ? 'integer'
      : 'continuous',
  };
}

// ── Bands Panel — with validation warnings ──
function BandsPanel({ subscales, bandStates, bandStatesByOutput, selectedBandOutputs, onSelectBandOutput, onAddBand, onUpdateBand, onRemoveBand, onAutoSuggest, overallScale, overallSettings }: {
  subscales: SubscaleState[];
  bandStates: Record<string, BandState[]>;
  bandStatesByOutput: Record<string, Partial<Record<ScoreOutput, BandState[]>>>;
  selectedBandOutputs: Record<string, ScoreOutput>;
  onSelectBandOutput: (id: string, output: ScoreOutput) => void;
  onAddBand: (name: string, output?: ScoreOutput) => void;
  onUpdateBand: (name: string, output: ScoreOutput | undefined, index: number, field: keyof BandState, value: string | number) => void;
  onRemoveBand: (name: string, output: ScoreOutput | undefined, index: number) => void;
  onAutoSuggest: (name: string, output: ScoreOutput | undefined, range: OutputRange) => void;
  overallScale: SubscaleState;
  overallSettings: OverallSettings;
}) {
  const scales = subscales.length > 0
    ? (overallSettings.enabled ? [...subscales, overallScale] : subscales)
    : [overallScale];
  return (
    <div className="p-3">
      <span className="text-xs font-semibold text-secondary-500 uppercase tracking-wide mb-2 block">Interpretation Bands</span>
      <div className="space-y-3">
        {scales.map((sub) => {
          const isOverall = sub.id === overallScale.id && subscales.length > 0;
          const isSubscale = subscales.length > 0 && !isOverall;
          const outputs = isSubscale ? shownScoreOutputs(sub.showOutputs, sub.scoringMethod) : [];
          const chosenOutput = selectedBandOutputs[sub.id];
          const output = isSubscale
            ? (chosenOutput && outputs.includes(chosenOutput) ? chosenOutput : outputs[0])
            : undefined;
          const scaleRange = sub.minValue !== null && sub.maxValue !== null
            ? { min: sub.minValue, max: sub.maxValue }
            : sub.labelMap.length
              ? {
                  min: Math.min(...sub.labelMap.map((entry) => entry.value)),
                  max: Math.max(...sub.labelMap.map((entry) => entry.value)),
                }
              : null;
          const outputRange = isSubscale && output
            ? getOutputRange(output, sub.items.length, scaleRange)
            : isOverall
              ? getOverallOutputRange(subscales, overallSettings)
              : null;
          const bands = isSubscale
            ? (output ? bandStatesByOutput[sub.name]?.[output] ?? [] : [])
            : bandStates[sub.name] || [];
          const warnings = validateBands(bands, outputRange
            ? { outputKind: outputRange.kind, possibleRange: outputRange }
            : null);
          return (
            <Card key={sub.id} className="p-3">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-semibold text-sm text-secondary-900 truncate">{sub.name}</h4>
                <div className="flex items-center gap-1">
                  {outputRange !== null && (
                    <button onClick={() => onAutoSuggest(sub.name, output, outputRange)} className="text-xs text-primary-600 hover:underline flex items-center gap-1"><Sparkles className="w-3 h-3" /> Suggest</button>
                  )}
                  {((isSubscale && output === 'custom')
                    || (isOverall && (overallSettings.basedOn === 'custom' || overallSettings.combineBy === 'custom'))) && (
                    <span className="text-xs text-secondary-500">Suggest unavailable: custom scores have no known range.</span>
                  )}
                  <button onClick={() => onAddBand(sub.name, output)} className="text-xs text-primary-600 hover:underline flex items-center gap-1"><Plus className="w-3 h-3" /> Add</button>
                </div>
              </div>
              {isSubscale && output && (
                <label className="flex items-center gap-2 mb-2 text-xs text-secondary-600">
                  <span>Cut-offs for</span>
                  <select
                    value={output}
                    onChange={(event) => onSelectBandOutput(sub.id, event.target.value as ScoreOutput)}
                    className="px-2 py-1 border border-secondary-200 rounded bg-white"
                  >
                    {outputs.map((candidate) => (
                      <option key={candidate} value={candidate}>{scoreOutputLabel(candidate)}</option>
                    ))}
                  </select>
                </label>
              )}
              {outputRange?.kind === 'continuous' && (
                <p className="text-xs text-secondary-500 mb-2">
                  Lower limit included, upper limit not included (the last band includes its upper limit).
                </p>
              )}
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
                <p className="text-xs text-secondary-400 py-1">
                  {output ? `No bands set for ${scoreOutputLabel(output)}.` : 'No bands defined.'}
                </p>
              ) : (
                <div className="space-y-1">
                  {bands.map((band, i) => (
                    <div key={i} className="flex items-center gap-1 w-full">
                      <input value={band.name} onChange={(e) => onUpdateBand(sub.name, output, i, 'name', e.target.value)} className="flex-1 min-w-0 px-2 py-1 text-xs border border-secondary-200 rounded focus:outline-none focus:border-primary-400" placeholder="Name" />
                      <input type="number" value={band.minScore} onChange={(e) => onUpdateBand(sub.name, output, i, 'minScore', Number(e.target.value))} className="w-14 flex-shrink-0 px-1.5 py-1 text-xs border border-secondary-200 rounded focus:outline-none focus:border-primary-400" />
                      <span className="text-secondary-400 text-xs flex-shrink-0">–</span>
                      <input type="number" value={band.maxScore} onChange={(e) => onUpdateBand(sub.name, output, i, 'maxScore', Number(e.target.value))} className="w-14 flex-shrink-0 px-1.5 py-1 text-xs border border-secondary-200 rounded focus:outline-none focus:border-primary-400" />
                      <button onClick={() => onRemoveBand(sub.name, output, i)} className="p-0.5 text-error-400 hover:text-error-600 flex-shrink-0"><X className="w-3 h-3" /></button>
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
function ScoringPanel({ canScore, scoring, onRunScoring, scoringResult, onExport, excludedCount, subscaleCount, usedAutoScale, originalColCount, computedColCount, hasSubscaleItems, unassignedItemCount }: {
  canScore: boolean; scoring: boolean; onRunScoring: () => void;
  scoringResult: ReturnType<typeof scoreDataset> | null; onExport: (f: 'csv' | 'xlsx') => void;
  excludedCount: number; subscaleCount: number; usedAutoScale: boolean;
  originalColCount: number; computedColCount: number;
  hasSubscaleItems: boolean;
  unassignedItemCount: number;
}) {
  return (
    <div className="p-3">
      <span className="text-xs font-semibold text-secondary-500 uppercase tracking-wide mb-3 block">Scoring</span>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="p-2 bg-secondary-50 rounded-lg text-center">
          <div className="text-lg font-bold text-primary-600">{subscaleCount}</div>
          <div className="text-xs text-secondary-500">{usedAutoScale ? 'Overall Scale' : 'Scales'}</div>
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
          <div className="flex items-center gap-2 text-warning-700 text-xs"><AlertTriangle className="w-3.5 h-3.5" /> {hasSubscaleItems ? 'All scales must have items assigned.' : 'No item columns available. Add non-demographic columns or assign items to a scale.'}</div>
        </Card>
      )}
      {unassignedItemCount > 0 && (
        <Card className="p-2.5 mb-3 border-warning-300 bg-warning-50/50">
          <div className="flex items-center gap-2 text-warning-700 text-xs">
            <AlertTriangle className="w-3.5 h-3.5" />
            {unassignedItemCount} item{unassignedItemCount === 1 ? '' : 's'} {unassignedItemCount === 1 ? 'is' : 'are'} not in any subscale and will not be scored.
          </div>
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
function TemplateModal({ open, onClose, templates, onSaveAsTemplate, onPreviewApply, onConfirmApply, onCancelApply, hasDataset, hasScales, matchReport, pendingTemplate }: {
  open: boolean; onClose: () => void; templates: Template[];
  onSaveAsTemplate: (n: string, d: string, i: string) => Promise<string | null>;
  onPreviewApply: (t: Template) => void;
  onConfirmApply: () => void;
  onCancelApply: () => void;
  hasDataset: boolean;
  hasScales: boolean;
  matchReport: TemplateMatchReport | null;
  pendingTemplate: Template | null;
}) {
  const [mode, setMode] = useState<'list' | 'create'>('list');
  const [name, setName] = useState(''), [desc, setDesc] = useState(''), [instrument, setInstrument] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    const err = await onSaveAsTemplate(name, desc, instrument);
    if (err) { setSaveError(err); setSaving(false); return; }
    setName(''); setDesc(''); setInstrument('');
    setSaving(false);
  };

  const scaleCount = (def: TemplateDefinition) => def.subscales?.length || 0;
  const itemCount = (def: TemplateDefinition) => (def.subscales || []).reduce((sum, s) => sum + s.items.length, 0);

  return (
    <Modal open={open} onClose={onClose} title="Templates" maxWidth="max-w-3xl">
      <div className="flex gap-2 mb-4">
        <button onClick={() => { setMode('list'); onCancelApply(); }} className={`px-4 py-2 text-sm rounded-lg ${mode === 'list' ? 'bg-primary-600 text-white' : 'bg-secondary-100 text-secondary-600'}`}>Browse Templates</button>
        <button onClick={() => { setMode('create'); onCancelApply(); }} className={`px-4 py-2 text-sm rounded-lg ${mode === 'create' ? 'bg-primary-600 text-white' : 'bg-secondary-100 text-secondary-600'}`}>Save Current as Template</button>
      </div>
      {mode === 'list' && !matchReport && (
        <div className="space-y-3">
          {templates.length === 0 && <EmptyState icon={Tag} title="No templates yet" description="Save your current configuration as a reusable template." />}
          {templates.map((t) => {
            const def = t.definition as TemplateDefinition;
            const sc = scaleCount(def);
            const ic = itemCount(def);
            return (
              <Card key={t.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold text-secondary-900">{t.name}</h4>
                    <p className="text-sm text-secondary-500">{t.description}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <StatusBadge status="info">v{t.version}</StatusBadge>
                      {t.instrument && <StatusBadge status="neutral">{t.instrument}</StatusBadge>}
                      <span className="text-xs text-secondary-400">{sc} {sc === 1 ? 'scale' : 'scales'} · {ic} {ic === 1 ? 'item' : 'items'}</span>
                    </div>
                  </div>
                  <Button size="sm" disabled={!hasDataset} onClick={() => onPreviewApply(t)}><Sparkles className="w-4 h-4" /> Apply</Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {mode === 'list' && matchReport && pendingTemplate && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-secondary-900">Match Report: {pendingTemplate.name}</h3>
          </div>
          <Card className={`p-4 ${matchReport.unmatchedCount === 0 ? 'border-success-300 bg-success-50/30' : 'border-warning-300 bg-warning-50/30'}`}>
            <div className="flex items-center gap-2 mb-2">
              {matchReport.unmatchedCount === 0 ? <Check className="w-4 h-4 text-success-600" /> : <AlertTriangle className="w-4 h-4 text-warning-600" />}
              <span className="font-medium text-secondary-900">
                Matched {matchReport.matchedCount} of {matchReport.totalItems} items
              </span>
            </div>
            {matchReport.unmatchedCount > 0 && (
              <div className="mt-2">
                <p className="text-xs font-medium text-secondary-600 mb-1">Unmatched items (will be skipped):</p>
                <div className="flex flex-wrap gap-1">
                  {matchReport.unmatchedNames.map((n) => (
                    <span key={n} className="px-2 py-0.5 text-xs bg-warning-100 text-warning-700 rounded-full border border-warning-200">{n}</span>
                  ))}
                </div>
              </div>
            )}
          </Card>
          <div className="max-h-60 overflow-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-secondary-200 text-secondary-500">
                  <th className="py-1.5 px-2 text-left font-medium">Scale</th>
                  <th className="py-1.5 px-2 text-left font-medium">Template Item</th>
                  <th className="py-1.5 px-2 text-left font-medium">Matched Column</th>
                  <th className="py-1.5 px-2 text-center font-medium">Rev</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-secondary-100">
                {matchReport.details.map((d, i) => (
                  <tr key={i} className={d.matchedColumn ? '' : 'bg-warning-50/50'}>
                    <td className="py-1 px-2 text-secondary-600">{d.subscaleName}</td>
                    <td className="py-1 px-2 text-secondary-800 font-mono">{d.itemName}</td>
                    <td className="py-1 px-2">{d.matchedColumn ? <span className="text-success-700 font-mono">{d.matchedColumn}</span> : <span className="text-warning-600 italic">no match</span>}</td>
                    <td className="py-1 px-2 text-center">{d.reverse ? <span className="text-warning-600 font-medium">R</span> : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-secondary-200">
            <Button variant="outline" size="sm" onClick={onCancelApply}>Cancel</Button>
            <Button size="sm" onClick={onConfirmApply}>
              <Check className="w-3.5 h-3.5" />
              {matchReport.unmatchedCount > 0 ? `Apply ${matchReport.matchedCount} Matched Items` : 'Apply Template'}
            </Button>
          </div>
        </div>
      )}
      {mode === 'create' && (
        <div className="space-y-4">
          <div className="flex items-start gap-2 px-3 py-2.5 bg-info-50 rounded-lg">
            <Info className="w-4 h-4 text-info-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-info-700">Templates store scales, items, reverse flags, response scales, and bands. Demographics and exclusions stay with the dataset.</p>
          </div>
          {saveError && (
            <div className="flex items-center gap-2 px-3 py-2.5 bg-error-50 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-error-600 flex-shrink-0" />
              <p className="text-xs text-error-700">{saveError}</p>
            </div>
          )}
          {!hasScales && (
            <div className="flex items-center gap-2 px-3 py-2.5 bg-warning-50 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-warning-600 flex-shrink-0" />
              <p className="text-xs text-warning-700">Add at least one scale with items before saving as a template.</p>
            </div>
          )}
          <div><label className="block text-sm font-medium text-secondary-700 mb-1">Template Name</label><input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-4 py-2 border border-secondary-200 rounded-lg focus:outline-none focus:border-primary-400" placeholder="e.g., GAD-7 Anxiety Scale" /></div>
          <div><label className="block text-sm font-medium text-secondary-700 mb-1">Description</label><input value={desc} onChange={(e) => setDesc(e.target.value)} className="w-full px-4 py-2 border border-secondary-200 rounded-lg focus:outline-none focus:border-primary-400" placeholder="Brief description" /></div>
          <div><label className="block text-sm font-medium text-secondary-700 mb-1">Instrument</label><input value={instrument} onChange={(e) => setInstrument(e.target.value)} className="w-full px-4 py-2 border border-secondary-200 rounded-lg focus:outline-none focus:border-primary-400" placeholder="e.g., GAD-7" /></div>
          <Button onClick={handleSave} disabled={!name || !hasScales || saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Save Template
          </Button>
        </div>
      )}
    </Modal>
  );
}
