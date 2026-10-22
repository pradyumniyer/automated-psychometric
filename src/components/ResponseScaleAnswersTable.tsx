import React, { useState } from 'react';
import { normalizeResponseText, type ResponseScaleLabelSetting } from '@/scientific/responseScales';
import type { AnswerTableRow } from '@/lib/responseScaleAnswers';

interface Props {
  rows: AnswerTableRow[];
  labels: ResponseScaleLabelSetting[];
  allowAdd?: boolean;
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

export function ResponseScaleAnswersTable({ rows, labels, allowAdd = true, onSetNumber, onChoose, onCountsAs, onRemove, onEditLabel, onAddLabel, onHighlightCell }: Props) {
  const [aliasFor, setAliasFor] = useState<string | null>(null);
  const [numberDrafts, setNumberDrafts] = useState<Record<string, string>>({});
  const [labelDrafts, setLabelDrafts] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newValue, setNewValue] = useState('');
  const [message, setMessage] = useState('');

  const rowKey = (row: AnswerTableRow) => `${row.kind}:${normalizeResponseText(row.answer)}`;
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
        <button key={`${cell.column}-${cell.rowIndex}`} type="button" className="underline" onClick={() => onHighlightCell(cell.rowIndex, cell.column)}>{cellLocation(cell)}</button>
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
    if (onAddLabel(newLabel, value)) {
      setNewLabel(''); setNewValue(''); setAdding(false); setMessage('');
    } else setMessage('That label could not be added.');
  };

  return (
    <>
      {rows.length > 0 && <table className="w-full table-fixed text-xs mb-2">
        <colgroup><col className="w-[54%]" /><col className="w-[14%]" /><col className="w-[32%]" /></colgroup>
        <thead><tr className="text-left text-secondary-500"><th className="py-1 px-2 align-middle font-normal">Answer</th><th className="py-1 px-2 align-middle font-normal">Found</th><th className="py-1 px-2 align-middle font-normal">Counts as</th></tr></thead>
        <tbody>
          {rows.map((row) => {
            const key = rowKey(row);
            const editable = row.kind === 'scale' && row.manualLabel;
            const displayName = row.answer;
            const targets = rows.filter((candidate) => candidate.kind === 'scale' && rowKey(candidate) !== key);
            const numberValue = numberDrafts[key] ?? (row.countsAs == null ? '' : String(row.countsAs));
            return <React.Fragment key={key}>
              <tr className={row.review ? 'bg-warning-50 text-warning-800' : row.grey ? 'text-secondary-400' : 'text-secondary-700'}>
                <td className="py-1 px-2 align-middle">
                  {editable ? <input type="text" aria-label={`Edit label ${displayName}`} value={labelDrafts[key] ?? displayName} onChange={(event) => setLabelDrafts((current) => ({ ...current, [key]: event.target.value }))} onBlur={(event) => {
                    const next = event.currentTarget.value.trim();
                    if (next !== displayName && !onEditLabel(row, next)) {
                      setMessage('That label is already listed.');
                      setLabelDrafts((current) => ({ ...current, [key]: displayName }));
                    } else setLabelDrafts((current) => { const copy = { ...current }; delete copy[key]; return copy; });
                  }} className="max-w-full bg-transparent border-b border-secondary-200" /> : displayName}
                  {row.cells.length > 0 && <span className="ml-1">{cellLinks(row)}</span>}
                  {row.excludedOnly && <span className="ml-1 text-secondary-400">only in excluded respondents</span>}
                </td>
                <td className="py-1 px-2 align-middle">{row.found}</td>
                <td className="py-1 px-2 align-middle">
                  <input type="text" inputMode="decimal" value={numberValue} aria-label={`Counts as ${displayName}`} onChange={(event) => {
                    const draft = event.target.value;
                    setNumberDrafts((current) => ({ ...current, [key]: draft }));
                    const validNumber = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(draft.trim());
                    if (draft.trim() === '') onSetNumber(row, null);
                    else if (validNumber && Number.isFinite(Number(draft))) onSetNumber(row, Number(draft));
                  }} onBlur={() => commitNumber(row, key)} onKeyDown={(event) => {
                    if (event.key === 'Enter') { event.preventDefault(); commitNumber(row, key); }
                  }} className={`w-20 px-1 py-1 text-sm border rounded ${row.review ? 'border-warning-400 bg-warning-50' : 'border-secondary-200'}`} placeholder={row.notScored ? 'Not scored' : row.kind === 'special' ? 'Not scored' : 'Choose…'} />
                  {row.kind === 'out_of_range' || row.kind === 'unknown' ? <select aria-label={`${displayName} action`} value={row.decision === 'widen' ? 'widen' : row.notScored || row.decision === 'missing' ? 'missing' : ''} onChange={(event) => {
                    const choice = event.target.value;
                    if (choice === 'missing' || choice === 'widen') onChoose(row, choice);
                  }} className="ml-1 w-32 max-w-full px-1 py-1 text-sm border border-secondary-200 rounded">
                    {row.review && <option value="">Choose…</option>}
                    <option value="missing">Not scored</option>
                    {row.kind === 'out_of_range' && <option value="widen">Widen scale</option>}
                  </select> : row.kind === 'scale' && <select aria-label={`${displayName} action`} value={row.notScored ? 'not-scored' : row.aliasOf ? 'alias' : ''} onChange={(event) => {
                    const choice = event.target.value;
                    if (choice === 'not-scored') onChoose(row, 'missing');
                    else if (choice === 'alias') setAliasFor(key);
                    else if (choice === 'remove') onRemove(row);
                  }} className="ml-1 w-28 max-w-full px-1 py-1 text-sm border border-secondary-200 rounded">
                    {row.review && <option value="">Choose…</option>}
                    <option value="alias">Counts as…</option>
                    <option value="not-scored">Not scored</option>
                    {row.manualLabel && <option value="remove">Remove</option>}
                  </select>}
                  {row.kind === 'scale' && (aliasFor === key || row.aliasOf) && <select aria-label={`${displayName} counts-as target`} value={row.aliasOf ?? ''} onChange={(event) => {
                    if (event.target.value) onCountsAs(row, event.target.value);
                    setAliasFor(null);
                  }} className="ml-1 w-32 max-w-full px-1 py-1 text-sm border border-secondary-200 rounded">
                    <option value="">Choose label…</option>
                    {targets.map((candidate) => <option key={rowKey(candidate)} value={candidate.answer}>{candidate.answer}</option>)}
                  </select>}
                </td>
              </tr>
              {row.review && <tr className="bg-warning-50 text-warning-800"><td colSpan={3} className="px-2 pb-2 text-[11px]">
                <span>“{displayName}” appears {row.found === 1 ? 'once' : `${row.found} times`}{row.cells.length ? ` (${cellLocation(row.cells[0])})` : ''}. It is not scored until you give it a number, say what it counts as, or mark it Not scored.</span>
                {row.cells.length > 0 && <span className="ml-1">{cellLinks(row)}</span>}
                {row.suggestion && <span className="ml-2">Looks like ‘{row.suggestion}’?</span>}
                {row.suggestion && <button type="button" className="ml-1 underline" onClick={() => onCountsAs(row, row.suggestion!)}>Counts as {row.suggestion}</button>}
              </td></tr>}
            </React.Fragment>;
          })}
        </tbody>
      </table>}
      {message && <p role="status" className="mb-2 text-xs text-error-600">{message}</p>}
      {allowAdd && <div className="flex items-center gap-2 mb-2">
        {!adding ? <button type="button" onClick={() => { setAdding(true); setMessage(''); }} className="text-xs text-primary-600 hover:underline">+ Add a label</button> : <>
          <input type="text" aria-label="New label" value={newLabel} onChange={(event) => setNewLabel(event.target.value)} className="w-36 px-2 py-1 text-xs border border-secondary-200 rounded" placeholder="Label" />
          <input type="text" inputMode="decimal" aria-label="New label number" value={newValue} onChange={(event) => setNewValue(event.target.value)} className="w-20 px-2 py-1 text-xs border border-secondary-200 rounded" placeholder="Number" />
          <button type="button" onClick={addLabel} className="text-xs text-primary-600 hover:underline">Add</button>
          <button type="button" onClick={() => { setAdding(false); setNewLabel(''); setNewValue(''); }} className="text-xs text-secondary-500 hover:underline">Cancel</button>
        </>}
      </div>}
    </>
  );
}
