// Report screen — individual score interpretation + group summary from scored data.
// Scoring comes from saved scoring_results or on-the-fly recomputation (same as Export).
// Copy-to-clipboard only; no file downloads.
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FileText, Users, ClipboardCopy, Check, AlertCircle, Info,
  Loader2, AlertTriangle, Search, ChevronDown,
} from 'lucide-react';
import type { Project, Dataset, DemographicColumn, SubscaleGroup, ResponseScale, SubscaleItem } from '@/types/domain';
import { datasetRepository, scoreRepository, surveyConfigRepository } from '@/storage/repositories';
import { buildSubscaleConfigs, createScoreHashes } from '@/storage/scoreHashes';
import { ensureAutomaticSubscale } from '@/storage/viewAdapters';
import { scoreDataset, SubscaleConfig, BandConfig } from '@/scientific/scoring';
import { mean, sd } from '@/scientific/descriptives';
import { Button, Card } from './ui';
import {
  primaryScoreColumnKeys,
  scoreOutputLabel,
  shownScoreOutputs,
  uniqueSubscaleNames,
} from '@/lib/scoreOutputs';

interface Props {
  project: Project;
  excludedRows: Set<number>;
  sharedDatasetId: string | null;
  onDatasetChange: (id: string | null) => void;
}

type ReportTab = 'individual' | 'group';

export function ReportScreen({ project, excludedRows, sharedDatasetId, onDatasetChange }: Props) {
  const [activeTab, setActiveTab] = useState<ReportTab>('individual');
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [demoCols, setDemoCols] = useState<DemographicColumn[]>([]);
  const [subscaleGroups, setSubscaleGroups] = useState<SubscaleGroup[]>([]);
  const [responseScales, setResponseScales] = useState<ResponseScale[]>([]);
  const [savedScoringResult, setSavedScoringResult] = useState<ReturnType<typeof scoreDataset> | null>(null);
  const [scoreCacheStale, setScoreCacheStale] = useState(false);
  const [bandConfigs, setBandConfigs] = useState<Record<string, BandConfig[]>>({});
  const [loading, setLoading] = useState(true);
  const [storageError, setStorageError] = useState<string | null>(null);

  // ── Load datasets ──
  const loadDatasets = useCallback(async () => {
    try {
      const dsList = await datasetRepository.list(project.id);
      setDatasets(dsList);
      if (dsList.length > 0 && !sharedDatasetId) onDatasetChange(dsList[0].id);
      setStorageError(null);
    } catch (error) {
      setStorageError(`Failed to load datasets: ${(error as Error).message}`);
    }
  }, [project.id, sharedDatasetId, onDatasetChange]);

  useEffect(() => { loadDatasets(); }, [loadDatasets]);

  const activeDatasetId = sharedDatasetId;

  useEffect(() => {
    if (!activeDatasetId) { setDataset(null); setLoading(false); return; }
    const ds = datasets.find((d) => d.id === activeDatasetId);
    if (!ds) { setDataset(null); setLoading(false); return; }
    setDataset(ds);
    setLoading(true);

    let cancelled = false;
    (async () => {
      try {
        const savedConfig = await surveyConfigRepository.get(activeDatasetId);
        if (!savedConfig) throw new Error('Dataset configuration is missing.');
        const config = ensureAutomaticSubscale(savedConfig, ds);
        const latest = await scoreRepository.getLatest(activeDatasetId);
        const excludedRowIds = [...excludedRows].map((index) => {
          const rowId = ds.row_ids[index];
          if (!rowId) throw new Error(`Excluded row ${index + 1} has no stable ID.`);
          return rowId;
        });
        const hashes = await createScoreHashes(ds, config, buildSubscaleConfigs(config, ds), excludedRowIds);
        const current = await scoreRepository.getCurrent(activeDatasetId, hashes);
        const result = current?.payload.result as ReturnType<typeof scoreDataset> | undefined;
        const resultIsValid = !!result && Array.isArray(result.headers) && Array.isArray(result.rows);
        if (cancelled) return;

        setDemoCols(config.demographic_columns);
        setSubscaleGroups(config.subscales);
        setResponseScales(config.subscales.flatMap((subscale) => subscale.response_scale ? [subscale.response_scale] : []));
        const bands: Record<string, BandConfig[]> = {};
        for (const subscale of config.subscales) {
          const firstOutput = shownScoreOutputs(subscale.score_outputs, subscale.scoring_method)[0];
          const firstOutputBands = subscale.bands?.filter((band) =>
            (band.score_output ?? firstOutput) === firstOutput,
          ) ?? [];
          if (firstOutputBands.length) {
            bands[subscale.id] = firstOutputBands.map((band) => ({
              name: band.name,
              minScore: band.min_score,
              maxScore: band.max_score,
              color: band.color,
            }));
          }
        }
        setBandConfigs(bands);
        setSavedScoringResult(resultIsValid ? result : null);
        setScoreCacheStale(!!latest && (!current || !resultIsValid));
        setStorageError(null);
      } catch (error) {
        if (!cancelled) {
          setSavedScoringResult(null);
          setScoreCacheStale(false);
          setStorageError(`Failed to load dataset configuration: ${(error as Error).message}`);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [activeDatasetId, datasets, excludedRows]);

  // ── Build subscale configs ──
  const subConfigs = useMemo<SubscaleConfig[]>(() => {
    return subscaleGroups.map((sub) => {
      const scale = responseScales.find((s) => s.subscale_id === sub.id);
      return {
        id: sub.id,
        name: sub.name,
        items: (sub.items || []).map((item: SubscaleItem) => ({ column: item.column, order: item.order, reverse: item.reverse })),
        scoringMethod: shownScoreOutputs(sub.score_outputs, sub.scoring_method)[0],
        showOutputs: shownScoreOutputs(sub.score_outputs, sub.scoring_method),
        customFormula: sub.custom_formula,
        responseScale: {
          scaleType: scale?.scale_type || 'numeric',
          minValue: scale?.min_value ?? undefined,
          maxValue: scale?.max_value ?? undefined,
          labelMap: scale?.label_map,
        },
      };
    });
  }, [subscaleGroups, responseScales]);

  const hasSubscaleConfig = subscaleGroups.length > 0 && subscaleGroups.some((s) => s.items && s.items.length > 0);

  // ── Compute scored result ──
  const scoredResult = useMemo(() => {
    if (!dataset) return null;
    if (savedScoringResult) {
      return {
        headers: savedScoringResult.headers,
        rows: savedScoringResult.rows as Record<string, number | string | null>[],
      };
    }
    if (scoreCacheStale) return null;
    if (hasSubscaleConfig && subConfigs.length > 0) {
      try {
        const result = scoreDataset(
          dataset.rows as Record<string, unknown>[],
          dataset.headers,
          subConfigs,
          bandConfigs,
          Array.from(excludedRows),
        );
        return { headers: result.headers, rows: result.rows };
      } catch {
        return null;
      }
    }
    return null;
  }, [dataset, savedScoringResult, scoreCacheStale, hasSubscaleConfig, subConfigs, bandConfigs, excludedRows]);

  // ── Derived values ──
  const totalRows = dataset?.rows.length ?? 0;
  const excludedCount = excludedRows.size;
  const includedCount = totalRows - excludedCount;
  const allExcluded = includedCount === 0 && totalRows > 0;

  // Find an ID-like demographic column for participant labels
  const idColumn = useMemo(() => {
    const idLike = demoCols.filter((d) => /id|respondent|participant|subject|case|record/i.test(d.detected_by));
    if (idLike.length > 0) return idLike[0].column_name;
    // Fall back to any demographic column that looks like an ID by name
    const byName = demoCols.find((d) => /^(id|pid|uid|rid|sid|respondent|participant|subject|case|record)/i.test(d.column_name));
    return byName?.column_name || null;
  }, [demoCols]);

  // ── Empty / loading states ──
  if (datasets.length === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-secondary-50">
        <div className="text-center">
          {storageError && <p role="alert" className="mb-3 text-sm text-error-700">{storageError}</p>}
          <div className="w-16 h-16 rounded-2xl bg-secondary-100 flex items-center justify-center mx-auto mb-4">
            <FileText className="w-8 h-8 text-secondary-400" />
          </div>
          <h3 className="text-lg font-semibold text-secondary-900 mb-1">No data to report</h3>
          <p className="text-sm text-secondary-500 max-w-md">Import a dataset on the Configure screen first, then return here to generate reports.</p>
        </div>
      </div>
    );
  }

  if (loading || !dataset) {
    return (
      <div className="h-full flex items-center justify-center bg-secondary-50">
        {storageError
          ? <p role="alert" className="text-sm text-error-700">{storageError}</p>
          : <Loader2 className="w-6 h-6 text-secondary-400 animate-spin" />}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-secondary-50 overflow-hidden">
      {/* Dataset tabs */}
      <div className="flex items-center gap-1 px-5 py-1.5 bg-white border-b border-secondary-200 overflow-x-auto flex-shrink-0">
        {datasets.map((ds) => (
          <button key={ds.id} onClick={() => onDatasetChange(ds.id)}
            className={`flex items-center gap-1.5 px-3 py-1 text-sm rounded-md whitespace-nowrap transition-colors ${activeDatasetId === ds.id ? 'bg-primary-100 text-primary-700 border border-primary-300' : 'text-secondary-600 hover:bg-secondary-100 border border-transparent'}`}>
            {ds.sheet_name || ds.file_name}
            <span className="text-xs text-secondary-400">{ds.row_count}r</span>
          </button>
        ))}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-auto">
        {storageError && (
          <div role="alert" className="mx-6 mt-4 px-4 py-2 bg-error-50 text-sm text-error-700 rounded-lg">
            {storageError}
          </div>
        )}
        {/* Header */}
        <div className="px-6 py-4 bg-white border-b border-secondary-200">
          <h1 className="text-xl font-bold text-secondary-900">Report</h1>
          <p className="text-sm text-secondary-500 mt-0.5">
            Generate individual score interpretations or group summaries from your scored data. Exclusions from Data Quality are respected.
          </p>
          <div className="grid grid-cols-4 gap-3 mt-4">
            <SummaryStat label="Source" value={dataset.sheet_name || dataset.file_name} />
            <SummaryStat label="Total rows" value={totalRows.toString()} />
            <SummaryStat label="Included" value={includedCount.toString()} accent="success" />
            <SummaryStat label="Excluded" value={excludedCount.toString()} accent="error" />
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* All-excluded warning */}
          {allExcluded && (
            <div className="flex items-center gap-3 px-4 py-3 bg-error-50 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-error-600 flex-shrink-0" />
              <p className="text-sm text-error-700">All rows are currently excluded. No data available for reporting. Adjust exclusions on the Data Quality screen.</p>
            </div>
          )}

          {/* Report type tabs */}
          <div className="flex items-center gap-1 bg-secondary-100 rounded-lg p-0.5 w-fit">
            <button onClick={() => setActiveTab('individual')}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md transition-all ${activeTab === 'individual' ? 'bg-white text-primary-700 shadow-sm' : 'text-secondary-500 hover:text-secondary-700'}`}>
              <Users className="w-4 h-4" />
              Individual Report
            </button>
            <button onClick={() => setActiveTab('group')}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md transition-all ${activeTab === 'group' ? 'bg-white text-primary-700 shadow-sm' : 'text-secondary-500 hover:text-secondary-700'}`}>
              <FileText className="w-4 h-4" />
              Group Summary
            </button>
          </div>

          {/* Report content */}
          {activeTab === 'individual' && (
            <IndividualReport
              dataset={dataset}
              scoredResult={scoredResult}
              subscaleGroups={subscaleGroups}
              bandConfigs={bandConfigs}
              excludedRows={excludedRows}
              idColumn={idColumn}
              hasSubscaleConfig={hasSubscaleConfig}
              allExcluded={allExcluded}
            />
          )}
          {activeTab === 'group' && (
            <GroupReport
              project={project}
              dataset={dataset}
              scoredResult={scoredResult}
              subscaleGroups={subscaleGroups}
              bandConfigs={bandConfigs}
              excludedRows={excludedRows}
              hasSubscaleConfig={hasSubscaleConfig}
              allExcluded={allExcluded}
              totalRows={totalRows}
              includedCount={includedCount}
              excludedCount={excludedCount}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Individual Report
// ──────────────────────────────────────────────────────────────

interface IndividualReportProps {
  dataset: Dataset;
  scoredResult: { headers: string[]; rows: Record<string, number | string | null>[] } | null;
  subscaleGroups: SubscaleGroup[];
  bandConfigs: Record<string, BandConfig[]>;
  excludedRows: Set<number>;
  idColumn: string | null;
  hasSubscaleConfig: boolean;
  allExcluded: boolean;
}

function IndividualReport({ dataset, scoredResult, subscaleGroups, bandConfigs, excludedRows, idColumn, hasSubscaleConfig, allExcluded }: IndividualReportProps) {
  const [selectedRow, setSelectedRow] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [copied, setCopied] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Build participant list with labels
  const participants = useMemo(() => {
    return dataset.rows.map((row, i) => {
      const idVal = idColumn ? row[idColumn] : null;
      const label = idVal != null && String(idVal).trim() !== '' ? String(idVal) : `Row ${i + 1}`;
      const isExcluded = excludedRows.has(i);
      return { index: i, label, isExcluded };
    });
  }, [dataset.rows, idColumn, excludedRows]);

  const filteredParticipants = useMemo(() => {
    if (!searchQuery.trim()) return participants;
    const q = searchQuery.toLowerCase();
    return participants.filter((p) => p.label.toLowerCase().includes(q));
  }, [participants, searchQuery]);

  // Clamp selected row
  useEffect(() => {
    if (selectedRow >= dataset.rows.length) setSelectedRow(0);
  }, [dataset.rows.length, selectedRow]);

  const currentParticipant = participants[selectedRow] || participants[0];

  // Get scores for the selected participant
  const participantScores = useMemo(() => {
    if (!scoredResult || !currentParticipant) return [];
    const row = scoredResult.rows[currentParticipant.index];
    if (!row) return [];

    const groupNames = uniqueSubscaleNames(
      subscaleGroups.map((subscale) => subscale.name),
      dataset.headers,
    );
    return subscaleGroups.map((sub, index) => {
      const { output, scoreKey, interpretationKey } = primaryScoreColumnKeys(
        groupNames[index],
        sub.score_outputs,
        sub.scoring_method,
      );
      const score = row[scoreKey];
      const bandLabel = row[interpretationKey];
      const bands = bandConfigs[sub.id];
      return {
        scaleName: sub.name,
        score: typeof score === 'number' ? score : null,
        band: typeof bandLabel === 'string' && bandLabel !== 'Excluded'
          ? bandLabel
          : typeof score === 'number' && bands && bands.length > 0
            ? 'No band'
            : null,
        bands: bands || [],
        scoringMethod: scoreOutputLabel(output),
      };
    });
  }, [scoredResult, currentParticipant, subscaleGroups, bandConfigs, dataset]);

  // Generate draft text
  const generateDraft = useCallback(() => {
    if (!currentParticipant) return '';
    const lines: string[] = [];
    lines.push(`Participant: ${currentParticipant.label}`);
    lines.push('');

    if (currentParticipant.isExcluded) {
      lines.push('NOTE: This participant is currently excluded from the analysis dataset.');
      lines.push('');
    }

    if (participantScores.length === 0) {
      lines.push('No scale scores available for this participant.');
    } else {
      for (const s of participantScores) {
        if (s.score === null) {
          lines.push(`${currentParticipant.label} did not have a valid score on ${s.scaleName} (missing or insufficient item responses).`);
        } else {
          const scoreStr = Number.isInteger(s.score) ? s.score.toString() : s.score.toFixed(2);
          if (s.band) {
            lines.push(`${currentParticipant.label} scored ${scoreStr} on ${s.scaleName}, which falls in the "${s.band}" range.`);
          } else {
            lines.push(`${currentParticipant.label} scored ${scoreStr} on ${s.scaleName}.`);
          }
        }
      }
    }

    lines.push('');
    lines.push('Draft for clinician review only. Not a diagnosis.');
    return lines.join('\n');
  }, [currentParticipant, participantScores]);

  // Update draft when participant changes
  useEffect(() => {
    setDraft(generateDraft());
    setCopied(false);
  }, [generateDraft, selectedRow]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may not be available
    }
  };

  // Disabled states
  if (!hasSubscaleConfig) {
    return (
      <Card className="p-8 text-center">
        <div className="w-12 h-12 rounded-xl bg-secondary-100 flex items-center justify-center mx-auto mb-3">
          <Users className="w-6 h-6 text-secondary-400" />
        </div>
        <h3 className="text-sm font-semibold text-secondary-900 mb-1">Individual reports require configured scales</h3>
        <p className="text-sm text-secondary-500 max-w-md mx-auto">
          Configure at least one scale with items on the Configure screen to generate individual score reports.
        </p>
      </Card>
    );
  }

  if (!scoredResult) {
    return (
      <Card className="p-8 text-center">
        <div className="w-12 h-12 rounded-xl bg-secondary-100 flex items-center justify-center mx-auto mb-3">
          <AlertCircle className="w-6 h-6 text-secondary-400" />
        </div>
        <h3 className="text-sm font-semibold text-secondary-900 mb-1">Scoring not available</h3>
        <p className="text-sm text-secondary-500 max-w-md mx-auto">
          Run scoring on the Configure screen, or ensure your scale configuration is complete.
        </p>
      </Card>
    );
  }

  if (allExcluded) {
    return (
      <Card className="p-8 text-center">
        <div className="w-12 h-12 rounded-xl bg-error-50 flex items-center justify-center mx-auto mb-3">
          <AlertTriangle className="w-6 h-6 text-error-400" />
        </div>
        <h3 className="text-sm font-semibold text-secondary-900 mb-1">All participants excluded</h3>
        <p className="text-sm text-secondary-500 max-w-md mx-auto">
          No participants are available for individual reporting. Adjust exclusions on the Data Quality screen.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Participant picker */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold text-secondary-900 mb-3">Select Participant</h3>
        <div className="relative">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary-400" />
              <input
                type="text"
                placeholder="Search by ID or row..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setDropdownOpen(true)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-secondary-200 rounded-lg focus:outline-none focus:border-primary-400"
              />
            </div>
            <button
              onClick={() => setDropdownOpen((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm border border-secondary-200 rounded-lg hover:bg-secondary-50 transition-colors min-w-[200px] justify-between"
            >
              <span className="truncate">
                {currentParticipant ? currentParticipant.label : 'Select...'}
                {currentParticipant?.isExcluded && <span className="text-error-500 ml-1">(excluded)</span>}
              </span>
              <ChevronDown className="w-4 h-4 text-secondary-400 flex-shrink-0" />
            </button>
          </div>

          {dropdownOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setDropdownOpen(false)} />
              <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto bg-white border border-secondary-200 rounded-lg shadow-lg">
                {filteredParticipants.length === 0 ? (
                  <div className="px-3 py-4 text-sm text-secondary-400 text-center">No matches found</div>
                ) : (
                  filteredParticipants.slice(0, 200).map((p) => (
                    <button
                      key={p.index}
                      onClick={() => { setSelectedRow(p.index); setDropdownOpen(false); setSearchQuery(''); }}
                      className={`w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-secondary-50 transition-colors ${p.index === selectedRow ? 'bg-primary-50' : ''}`}
                    >
                      <span className={p.isExcluded ? 'text-secondary-400' : 'text-secondary-700'}>
                        {p.label}
                      </span>
                      {p.isExcluded && <span className="text-xs text-error-400">excluded</span>}
                    </button>
                  ))
                )}
                {filteredParticipants.length > 200 && (
                  <div className="px-3 py-2 text-xs text-secondary-400 text-center border-t border-secondary-100">
                    Showing first 200 matches. Refine your search to see more.
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </Card>

      {/* Excluded warning */}
      {currentParticipant?.isExcluded && (
        <div className="flex items-center gap-2 px-4 py-3 bg-warning-50 rounded-lg">
          <AlertTriangle className="w-4 h-4 text-warning-600 flex-shrink-0" />
          <span className="text-sm text-warning-700">
            This participant is currently marked as excluded. Scores are shown for reference but they are not included in group summaries.
          </span>
        </div>
      )}

      {/* Score table */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold text-secondary-900 mb-3">Scale Scores</h3>
        {participantScores.length === 0 ? (
          <p className="text-sm text-secondary-400">No scale scores available.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-secondary-200">
                  <th className="text-left py-2 px-3 font-medium text-secondary-600">Scale</th>
                  <th className="text-right py-2 px-3 font-medium text-secondary-600">Score</th>
                  <th className="text-left py-2 px-3 font-medium text-secondary-600">Interpretation</th>
                  <th className="text-left py-2 px-3 font-medium text-secondary-600">Method</th>
                </tr>
              </thead>
              <tbody>
                {participantScores.map((s, i) => (
                  <tr key={i} className="border-b border-secondary-100 last:border-0">
                    <td className="py-2.5 px-3 font-medium text-secondary-900">{s.scaleName}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-secondary-700">
                      {s.score === null ? <span className="text-secondary-400">Missing</span> : (
                        Number.isInteger(s.score) ? s.score : s.score.toFixed(2)
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      {s.band ? (
                        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-secondary-100 text-secondary-700">
                          {s.band}
                        </span>
                      ) : (
                        <span className="text-xs text-secondary-400">No band defined</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-xs text-secondary-500 capitalize">{s.scoringMethod}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Editable draft */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-secondary-900">Interpretation Draft</h3>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setDraft(generateDraft())}>
              Regenerate
            </Button>
            <Button variant="outline" size="sm" onClick={handleCopy}>
              {copied ? <Check className="w-3.5 h-3.5" /> : <ClipboardCopy className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
        </div>
        <textarea
          value={draft}
          onChange={(e) => { setDraft(e.target.value); setCopied(false); }}
          rows={Math.max(8, draft.split('\n').length + 1)}
          className="w-full px-3 py-2.5 text-sm font-mono text-secondary-700 border border-secondary-200 rounded-lg focus:outline-none focus:border-primary-400 resize-y leading-relaxed"
          placeholder="Draft will appear here..."
        />
        <div className="flex items-center gap-2 mt-3 px-3 py-2 bg-warning-50 rounded-lg">
          <Info className="w-3.5 h-3.5 text-warning-600 flex-shrink-0" />
          <p className="text-xs text-warning-700">Draft for clinician review only. Not a diagnosis.</p>
        </div>
      </Card>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Group Summary Report
// ──────────────────────────────────────────────────────────────

interface GroupReportProps {
  project: Project;
  dataset: Dataset;
  scoredResult: { headers: string[]; rows: Record<string, number | string | null>[] } | null;
  subscaleGroups: SubscaleGroup[];
  bandConfigs: Record<string, BandConfig[]>;
  excludedRows: Set<number>;
  hasSubscaleConfig: boolean;
  allExcluded: boolean;
  totalRows: number;
  includedCount: number;
  excludedCount: number;
}

function GroupReport({ project, dataset, scoredResult, subscaleGroups, bandConfigs, excludedRows, hasSubscaleConfig, allExcluded, totalRows, includedCount, excludedCount }: GroupReportProps) {
  const [draft, setDraft] = useState('');
  const [copied, setCopied] = useState(false);

  // Compute per-scale group statistics
  const scaleStats = useMemo(() => {
    if (!scoredResult || !hasSubscaleConfig) return [];
    const groupNames = uniqueSubscaleNames(
      subscaleGroups.map((scale) => scale.name),
      dataset.headers,
    );
    return subscaleGroups.map((sub, index) => {
      const { output, scoreKey, interpretationKey } = primaryScoreColumnKeys(
        groupNames[index],
        sub.score_outputs,
        sub.scoring_method,
      );
      const scores: number[] = [];
      const bandCounts: Record<string, number> = {};
      let missingCount = 0;

      scoredResult.rows.forEach((row, i) => {
        if (excludedRows.has(i)) return;
        const score = row[scoreKey];
        const bandLabel = row[interpretationKey];
        if (typeof score === 'number' && !isNaN(score)) {
          scores.push(score);
          if (typeof bandLabel === 'string' && bandLabel !== 'Excluded') {
            bandCounts[bandLabel] = (bandCounts[bandLabel] || 0) + 1;
          }
        } else {
          missingCount++;
        }
      });

      const n = scores.length;
      const stats = n > 0 ? {
        mean: mean(scores),
        sd: sd(scores),
        min: Math.min(...scores),
        max: Math.max(...scores),
      } : null;

      return {
        scaleName: sub.name,
        scoringMethod: scoreOutputLabel(output),
        n,
        missing: missingCount,
        stats,
        bandCounts,
        bands: bandConfigs[sub.id] || [],
      };
    });
  }, [scoredResult, hasSubscaleConfig, subscaleGroups, bandConfigs, excludedRows, dataset]);

  // Generate draft text
  const generateDraft = useCallback(() => {
    const lines: string[] = [];
    lines.push(`Group Summary Report`);
    lines.push(`Project: ${project.name}`);
    lines.push(`Dataset: ${dataset.sheet_name || dataset.file_name}`);
    lines.push('');

    // Cleaning summary
    lines.push(`Sample Composition:`);
    lines.push(`  Total rows: ${totalRows}`);
    lines.push(`  Included: ${includedCount}`);
    lines.push(`  Excluded: ${excludedCount}`);
    lines.push('');

    if (!hasSubscaleConfig || scaleStats.length === 0) {
      lines.push('Scoring has not been configured. No scale statistics are available.');
      lines.push('');
      lines.push('Configure scales on the Configure screen to generate scored group summaries.');
    } else {
      const scaleNames = subscaleGroups.map((s) => s.name).join(', ');
      const methods = [...new Set(subscaleGroups.map((s) => s.scoring_method))].join(', ');
      lines.push(`Scoring was computed using ${methods} scoring across ${subscaleGroups.length} scale${subscaleGroups.length > 1 ? 's' : ''}: ${scaleNames}.`);
      lines.push('');

      lines.push('Scale Statistics (included participants only):');
      lines.push('');
      for (const s of scaleStats) {
        lines.push(`  ${s.scaleName} (method: ${s.scoringMethod}):`);
        if (s.stats) {
          const meanStr = Number.isInteger(s.stats.mean) ? s.stats.mean.toString() : s.stats.mean.toFixed(2);
          const sdStr = s.stats.sd.toFixed(2);
          const minStr = Number.isInteger(s.stats.min) ? s.stats.min.toString() : s.stats.min.toFixed(2);
          const maxStr = Number.isInteger(s.stats.max) ? s.stats.max.toString() : s.stats.max.toFixed(2);
          lines.push(`    N used: ${s.n} (missing: ${s.missing})`);
          lines.push(`    Mean: ${meanStr}, SD: ${sdStr}`);
          lines.push(`    Range: ${minStr} - ${maxStr}`);
          const bandEntries = Object.entries(s.bandCounts);
          if (bandEntries.length > 0) {
            lines.push(`    Band distribution:`);
            for (const [band, count] of bandEntries) {
              lines.push(`      ${band}: ${count}`);
            }
          }
        } else {
          lines.push(`    N used: 0 (no valid scores)`);
        }
        lines.push('');
      }
    }

    lines.push('Generated from cleaned data. Exclusions applied per current Data Quality settings.');
    return lines.join('\n');
  }, [project.name, dataset.sheet_name, dataset.file_name, totalRows, includedCount, excludedCount, hasSubscaleConfig, scaleStats, subscaleGroups]);

  useEffect(() => {
    setDraft(generateDraft());
    setCopied(false);
  }, [generateDraft]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may not be available
    }
  };

  return (
    <div className="space-y-4">
      {/* Cleaning summary card (always shown) */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold text-secondary-900 mb-3">Sample Composition</h3>
        <div className="grid grid-cols-3 gap-3">
          <StatBox label="Total rows" value={totalRows.toString()} />
          <StatBox label="Included" value={includedCount.toString()} accent="success" />
          <StatBox label="Excluded" value={excludedCount.toString()} accent="error" />
        </div>
      </Card>

      {/* Scale statistics (only if scores available) */}
      {hasSubscaleConfig && scaleStats.length > 0 && !allExcluded && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-secondary-900 mb-3">Scale Statistics</h3>
          <div className="space-y-4">
            {scaleStats.map((s, i) => (
              <div key={i} className="border-b border-secondary-100 last:border-0 pb-4 last:pb-0">
                <h4 className="text-sm font-medium text-secondary-900 mb-2">{s.scaleName}</h4>
                {s.stats ? (
                  <>
                    <div className="grid grid-cols-5 gap-2 mb-3">
                      <StatBox label="N" value={s.n.toString()} small />
                      <StatBox label="Mean" value={fmt(s.stats.mean)} small />
                      <StatBox label="SD" value={s.stats.sd.toFixed(2)} small />
                      <StatBox label="Min" value={fmt(s.stats.min)} small />
                      <StatBox label="Max" value={fmt(s.stats.max)} small />
                    </div>
                    {Object.keys(s.bandCounts).length > 0 && (
                      <div>
                        <span className="text-xs font-medium text-secondary-500">Band distribution:</span>
                        <div className="flex flex-wrap gap-2 mt-1.5">
                          {s.bands.map((band) => {
                            const count = s.bandCounts[band.name] || 0;
                            return (
                              <span key={band.name} className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-full bg-secondary-100 text-secondary-700">
                                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: band.color }} />
                                {band.name}: {count}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-secondary-400">No valid scores for this scale.</p>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* No-scores note */}
      {!hasSubscaleConfig && (
        <div className="flex items-center gap-3 px-4 py-3 bg-info-50 rounded-lg">
          <Info className="w-4 h-4 text-info-600 flex-shrink-0" />
          <p className="text-sm text-info-700">
            Scoring has not been configured. The summary below includes cleaning counts only. Configure scales on the Configure screen to add scored statistics.
          </p>
        </div>
      )}

      {/* All-excluded note */}
      {allExcluded && (
        <div className="flex items-center gap-3 px-4 py-3 bg-error-50 rounded-lg">
          <AlertTriangle className="w-4 h-4 text-error-600 flex-shrink-0" />
          <p className="text-sm text-error-700">All rows are excluded. No statistics available.</p>
        </div>
      )}

      {/* Editable draft */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-secondary-900">Summary Draft</h3>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setDraft(generateDraft())}>
              Regenerate
            </Button>
            <Button variant="outline" size="sm" onClick={handleCopy}>
              {copied ? <Check className="w-3.5 h-3.5" /> : <ClipboardCopy className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
        </div>
        <textarea
          value={draft}
          onChange={(e) => { setDraft(e.target.value); setCopied(false); }}
          rows={Math.max(10, draft.split('\n').length + 1)}
          className="w-full px-3 py-2.5 text-sm font-mono text-secondary-700 border border-secondary-200 rounded-lg focus:outline-none focus:border-primary-400 resize-y leading-relaxed"
          placeholder="Summary will appear here..."
        />
      </Card>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Small sub-components
// ──────────────────────────────────────────────────────────────

function SummaryStat({ label, value, accent }: { label: string; value: string; accent?: 'success' | 'error' }) {
  const accentColors: Record<string, string> = {
    success: 'text-success-700 bg-success-50',
    error: 'text-error-700 bg-error-50',
  };
  return (
    <div className={`px-4 py-3 rounded-lg border border-secondary-200 ${accent ? accentColors[accent] : 'bg-white'}`}>
      <div className="text-xs font-medium text-secondary-500 mb-1">{label}</div>
      <div className="text-sm font-bold text-secondary-900 truncate" title={value}>{value}</div>
    </div>
  );
}

function StatBox({ label, value, accent, small }: { label: string; value: string; accent?: 'success' | 'error'; small?: boolean }) {
  const accentColors: Record<string, string> = {
    success: 'text-success-700 bg-success-50',
    error: 'text-error-700 bg-error-50',
  };
  return (
    <div className={`rounded-lg border border-secondary-200 ${accent ? accentColors[accent] : 'bg-white'} ${small ? 'px-2.5 py-2' : 'px-4 py-3'}`}>
      <div className={`${small ? 'text-[10px]' : 'text-xs'} font-medium text-secondary-500 mb-0.5`}>{label}</div>
      <div className={`${small ? 'text-xs' : 'text-sm'} font-bold text-secondary-900 tabular-nums truncate`} title={value}>{value}</div>
    </div>
  );
}

function fmt(n: number): string {
  return Number.isInteger(n) ? n.toString() : n.toFixed(2);
}
