import React, { useEffect, useState } from 'react';
import { normalizeResponseText, type ResponseScaleLabelSetting } from '@/scientific/responseScales';
import type { AnswerTableRow } from '@/lib/responseScaleAnswers';

interface Props {
  rows: AnswerTableRow[];
  labels: ResponseScaleLabelSetting[];
  widenRange?: { min: number; max: number } | null;
  allowAdd?: boolean;
  splitOtherAnswers?: boolean;
  onSetNumber: (row: AnswerTableRow, value: number | null) => void;
  onChoose: (row: AnswerTableRow, choice: 'missing' | 'widen') => void;
  onCountsAs: (row: AnswerTableRow, target: string) => void;
  onRemove: (row: AnswerTableRow) => void;
  onEditLabel: (row: AnswerTableRow, label: string) => boolean;
  onAddLabel: (label: string, value: number | null) => boolean;
  onHighlightCell: (rowIndex: number, column: string) => void;
}

function cellLocation(cell: AnswerTableRow['cells'][number]): string {
  return `${cell.column}: ${cell.displayId ?? `row ${cell.rowIndex + 1}`}`;
}


function sanitizeNumberDraft(raw: string): string {
  // Allow leading minus, digits, one dot — strip everything else.
  let next = raw.replace(/[^0-9.+\-]/g, '');
  // Keep only the first dot.
  const dot = next.indexOf('.');
  if (dot !== -1) {
    next = next.slice(0, dot + 1) + next.slice(dot + 1).replace(/\./g, '');
  }
  // Keep minus only at start.
  next = next.replace(/(?!^)-/g, '');
  return next;
}

function rowKey(row: AnswerTableRow): string {
  return `${row.kind}:${normalizeResponseText(row.answer)}`;
}

export function ResponseScaleAnswersTable({
  rows,
  labels,
  widenRange,
  allowAdd = true,
  splitOtherAnswers = true,
  onSetNumber,
  onChoose,
  onRemove,
  onEditLabel,
  onAddLabel,
  onHighlightCell,
}: Props) {
  const [numberDrafts, setNumberDrafts] = useState<Record<string, string>>({});
  const [labelDrafts, setLabelDrafts] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newValue, setNewValue] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    setNumberDrafts((current) => {
      let changed = false;
      const next = { ...current };
      for (const row of rows) {
        const key = rowKey(row);
        const draft = next[key];
        if (draft === undefined) continue;
        const draftValue = draft.trim() === '' ? null : Number(draft);
        if (draftValue !== row.countsAs) {
          delete next[key];
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [rows]);

  const commitNumber = (row: AnswerTableRow, key: string) => {
    const draft = numberDrafts[key] ?? (row.countsAs == null ? '' : String(row.countsAs));
    const value = draft.trim() === '' ? null : Number(draft);
    if (value !== null && !Number.isFinite(value)) {
      setNumberDrafts((current) => ({ ...current, [key]: row.countsAs == null ? '' : String(row.countsAs) }));
      return;
    }
    setNumberDrafts((current) => ({ ...current, [key]: value == null ? '' : String(value) }));
    if (value !== row.countsAs) onSetNumber(row, value);
  };

  const cellLinks = (row: AnswerTableRow) => (
    <span className="inline-flex flex-wrap items-center gap-x-1 text-secondary-500">
      {row.cells.slice(0, 3).map((cell) => (
        <button key={`${cell.column}-${cell.rowIndex}`} type="button" className="underline" onClick={() => onHighlightCell(cell.rowIndex, cell.column)}>
          {cellLocation(cell)}
        </button>
      ))}
      {row.cells.length > 3 && <span>and {row.cells.length - 3} more</span>}
    </span>
  );

  const addLabel = () => {
    if (!newLabel.trim()) { setMessage('Enter a label first.'); return; }
    const key = normalizeResponseText(newLabel);
    if (labels.some((entry) => normalizeResponseText(entry.label) === key)) { setMessage('That label is already listed.'); return; }
    const value = newValue.trim() === '' ? null : Number(newValue);
    if (value !== null && !Number.isFinite(value)) { setMessage('Enter a finite number or leave the number blank.'); return; }
    if (onAddLabel(newLabel, value)) { setNewLabel(''); setNewValue(''); setAdding(false); setMessage(''); }
    else setMessage('That label could not be added.');
  };

  const scaleRows = splitOtherAnswers ? rows.filter((row) => row.kind === 'scale') : rows;
  const otherRows = splitOtherAnswers ? rows.filter((row) => row.kind !== 'scale') : [];

  const renderNumberBox = (row: AnswerTableRow, key: string, numberValue: string) => {
    // Unused scale points (Found 0): show as unused, not as a scored answer.
    if (row.kind === 'scale' && row.found === 0 && !row.manualLabel) {
      return (
        <span className="inline-block w-20 px-1.5 py-1 text-sm text-secondary-400" title="Defined by the scale but not observed in the data">
          Unused
        </span>
      );
    }
    const isEmpty = numberValue.trim() === '';
    const isGrey = !row.review && (row.grey || isEmpty);
    return (
      <input
        type="text"
        inputMode="decimal"
        value={numberValue}
        aria-label={`Counts as ${row.answer}`}
        placeholder={row.kind === 'scale' ? 'Needs a number' : 'Not scored'}
        onChange={(event) => {
          const draft = sanitizeNumberDraft(event.target.value);
          setNumberDrafts((current) => ({ ...current, [key]: draft }));
          if (draft.trim() === '' || draft === '-' || draft === '.' || draft === '-.') {
            onSetNumber(row, null);
            return;
          }
          const validNumber = /^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(draft.trim());
          if (validNumber && Number.isFinite(Number(draft))) onSetNumber(row, Number(draft));
        }}
        onBlur={() => commitNumber(row, key)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commitNumber(row, key);
          }
        }}
        className={`w-20 px-1.5 py-1 text-sm border rounded ${
          row.review
            ? 'border-warning-400 bg-warning-50 text-warning-900'
            : isGrey
              ? 'border-secondary-200 text-secondary-400 bg-secondary-50'
              : 'border-secondary-200 text-secondary-800'
        }`}
      />
    );
  };

  const renderOutOfRangeControl = (row: AnswerTableRow) => {
    const rawAnswer = row.answer.replace(/ \(outside .+\)$/, '');
    const numericAnswer = Number(rawAnswer);
    const widenTarget =
      row.kind === 'out_of_range' && widenRange && Number.isFinite(numericAnswer)
        ? `${Math.min(widenRange.min, numericAnswer)}-${Math.max(widenRange.max, numericAnswer)}`
        : null;
    return (
      <select
        aria-label={`${row.answer} action`}
        value={row.decision === 'widen' ? 'widen' : row.notScored || row.decision === 'missing' ? 'missing' : ''}
        onChange={(event) => {
          const choice = event.target.value;
          if (choice === 'missing' || choice === 'widen') onChoose(row, choice);
        }}
        className={`w-36 max-w-full px-1 py-1 text-sm border rounded ${
          row.review ? 'border-warning-400 bg-warning-50' : 'border-secondary-200'
        }`}
      >
        {row.review && <option value="">Choose…</option>}
        <option value="missing">Not scored</option>
        {row.kind === 'out_of_range' && (
          <option value="widen">{widenTarget ? `Widen to ${widenTarget}` : 'Widen scale'}</option>
        )}
      </select>
    );
  };

  const renderRow = (row: AnswerTableRow) => {
    const key = rowKey(row);
    const editable = row.kind === 'scale' && row.manualLabel;
    const displayName = row.answer;
    const numberValue = numberDrafts[key] ?? (row.countsAs == null ? '' : String(row.countsAs));
    const isOutOfRange = row.kind === 'out_of_range';

    return (
      <React.Fragment key={key}>
        <tr
          className={
            row.review
              ? 'bg-warning-50 text-warning-800'
              : row.grey || (row.countsAs == null && row.kind !== 'scale')
                ? 'text-secondary-400'
                : 'text-secondary-700'
          }
        >
          <td className="py-1.5 px-2 align-middle">
            {editable ? (
              <input
                type="text"
                aria-label={`Edit label ${displayName}`}
                value={labelDrafts[key] ?? displayName}
                onChange={(event) => setLabelDrafts((current) => ({ ...current, [key]: event.target.value }))}
                onBlur={(event) => {
                  const next = event.currentTarget.value.trim();
                  if (next !== displayName && !onEditLabel(row, next)) {
                    setMessage('That label is already listed.');
                    setLabelDrafts((current) => ({ ...current, [key]: displayName }));
                  } else {
                    setLabelDrafts((current) => {
                      const copy = { ...current };
                      delete copy[key];
                      return copy;
                    });
                  }
                }}
                className="max-w-full bg-transparent border-b border-secondary-200"
              />
            ) : (
              displayName
            )}
            {row.excludedOnly && <span className="ml-1 text-secondary-400">only in excluded respondents</span>}
            {row.manualLabel && (
              <button type="button" className="ml-2 text-[11px] text-secondary-400 hover:text-danger-600" onClick={() => onRemove(row)}>
                Remove
              </button>
            )}
          </td>
          <td className="py-1.5 px-2 align-middle tabular-nums">{row.found}</td>
          <td className="py-1.5 px-2 align-middle">
            {isOutOfRange ? renderOutOfRangeControl(row) : renderNumberBox(row, key, numberValue)}
          </td>
        </tr>
        {row.review && !isOutOfRange && (
          <tr className="bg-warning-50 text-warning-800">
            <td colSpan={3} className="px-2 pb-2 text-[11px]">
              {row.found === 1 ? 'appears once' : `appears ${row.found} times`}
              {row.cells.length > 0 && <> ({cellLinks(row)})</>}
              {row.suggestion && <span className="ml-1">Looks like &lsquo;{row.suggestion}&rsquo;?</span>}
            </td>
          </tr>
        )}
        {row.review && isOutOfRange && row.cells.length > 0 && (
          <tr className="bg-warning-50 text-warning-800">
            <td colSpan={3} className="px-2 pb-2 text-[11px]">{cellLinks(row)}</td>
          </tr>
        )}
      </React.Fragment>
    );
  };

  const tableHead = (
    <thead>
      <tr className="text-left text-secondary-500">
        <th className="py-1 px-2 align-middle font-normal">Answer</th>
        <th className="py-1 px-2 align-middle font-normal">Found</th>
        <th className="py-1 px-2 align-middle font-normal">Counts as</th>
      </tr>
    </thead>
  );

  return (
    <>
      {scaleRows.length > 0 && (
        <table className="w-full table-fixed text-xs mb-2">
          <colgroup>
            <col className="w-[54%]" />
            <col className="w-[14%]" />
            <col className="w-[32%]" />
          </colgroup>
          {tableHead}
          <tbody>{scaleRows.map(renderRow)}</tbody>
        </table>
      )}

      {otherRows.length > 0 && (
        <div className="mb-2">
          <div className="text-[11px] font-medium text-secondary-500 mb-1 px-1">Other answers</div>
          <table className="w-full table-fixed text-xs">
            <colgroup>
              <col className="w-[54%]" />
              <col className="w-[14%]" />
              <col className="w-[32%]" />
            </colgroup>
            <tbody>{otherRows.map(renderRow)}</tbody>
          </table>
        </div>
      )}

      {allowAdd && (
        <div className="mt-1 mb-2">
          {!adding ? (
            <button type="button" className="text-xs text-primary-600 hover:underline" onClick={() => setAdding(true)}>
              + Add label
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <input type="text" value={newLabel} onChange={(event) => setNewLabel(event.target.value)} placeholder="Label" aria-label="New label text" className="px-2 py-1 border border-secondary-200 rounded" />
              <input type="text" inputMode="decimal" value={newValue} onChange={(event) => setNewValue(sanitizeNumberDraft(event.target.value))} placeholder="Not scored" aria-label="New label number" className="w-20 px-2 py-1 border border-secondary-200 rounded" />
              <button type="button" className="px-2 py-1 rounded-md bg-primary-600 text-white" onClick={addLabel}>Add</button>
              <button type="button" className="text-secondary-500 hover:underline" onClick={() => { setAdding(false); setMessage(''); }}>Cancel</button>
            </div>
          )}
          {message && <p className="text-[11px] text-warning-700 mt-1">{message}</p>}
        </div>
      )}
    </>
  );
}
