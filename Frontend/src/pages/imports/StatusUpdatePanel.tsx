import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Loader2, RotateCcw, UploadCloud } from 'lucide-react';
import { useRef, useState, type DragEvent } from 'react';
import { useConfirm } from '../../hooks/useConfirm';
import { useToast } from '../../hooks/useToast';
import { errorMessage } from '../../services/apiError';
import { ACCEPT_ATTR, ImportFileError, readVoterIdList, validateImportFile } from '../../services/importService';
import { voterService } from '../../services/voterService';
import { VOTER_STATUSES, type VoterStatus } from '../../types';
import { downloadXlsx } from '../../utils/download';
import { formatNumber } from '../../utils/format';

interface Props {
  /** Upper-case Voter IDs already in Voter Desk (from the import context). */
  existingVoterIds: string[];
  onUpdated: () => void;
}

type Result = { updated: number; unchanged: number; notFound: string[]; outsideArea: string[] };

/**
 * Updates voter status from a list such as deceased or shifted voters: every Voter ID (EPIC) in the file is
 * matched to existing voters, and the chosen status is applied to all of them. Only Active voters can be paid.
 */
export function StatusUpdatePanel({ existingVoterIds, onUpdated }: Props) {
  const toast = useToast();
  const confirm = useConfirm();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [ids, setIds] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState<{ page: number; pages: number } | null | 'busy'>(null);
  const [dragOver, setDragOver] = useState(false);
  const [status, setStatus] = useState<VoterStatus | ''>('');
  const [saving, setSaving] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const existing = new Set(existingVoterIds);
  const matched = (ids ?? []).filter((id) => existing.has(id.toUpperCase()));
  const missing = (ids ?? []).filter((id) => !existing.has(id.toUpperCase()));

  const reset = () => {
    setFile(null);
    setIds(null);
    setError(null);
    setStatus('');
    setResult(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const accept = async (f: File) => {
    reset();
    setReading('busy');
    try {
      const problem = await validateImportFile(f);
      if (problem) {
        setError(problem);
        return;
      }
      const found = await readVoterIdList(f, existing, (page, pages) => setReading({ page, pages }));
      if (!found.length) {
        setError('No voter IDs (EPIC numbers) were found in this file.');
        return;
      }
      setFile(f);
      setIds(found);
    } catch (e) {
      setError(e instanceof ImportFileError ? e.message : 'The file could not be read. Make sure it is a valid PDF, Excel or CSV file.');
    } finally {
      setReading(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (e.dataTransfer.files.length > 1) setError('Drop one file at a time.');
    else if (f) void accept(f);
  };

  const apply = async () => {
    if (!status || !file) return;
    const ok = await confirm({
      title: `Mark ${formatNumber(matched.length)} voters as ${status}?`,
      message:
        status === 'Active'
          ? 'These voters become Active and can receive a payment again.'
          : `${status} voters cannot receive a payment. Payments already made are kept.`,
      confirmLabel: 'Update status',
      tone: status === 'Active' ? 'primary' : 'danger',
    });
    if (!ok) return;
    setSaving({ done: 0, total: matched.length });
    try {
      const r = await voterService.setStatus(matched, status, file.name, (done, total) => setSaving({ done, total }));
      setResult(r);
      onUpdated();
      toast.success(`${formatNumber(r.updated)} voters marked ${status}.`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(null);
    }
  };

  const downloadMissing = (list: string[]) =>
    downloadXlsx('voter-ids-not-found.xlsx', [{ name: 'Voter IDs', headers: ['Voter ID'], rows: list.map((id) => [id]) }]);

  if (result) {
    return (
      <div className="card card-body stack">
        <div className="row">
          <CheckCircle2 size={28} style={{ color: 'var(--color-success)' }} aria-hidden="true" />
          <h2>Status updated</h2>
        </div>
        <div className="import-summary">
          <div>
            <strong>{formatNumber(result.updated)}</strong>
            <span>Changed to {status}</span>
          </div>
          <div>
            <strong>{formatNumber(result.unchanged)}</strong>
            <span>Already {status}</span>
          </div>
          <div>
            <strong>{formatNumber(missing.length + result.notFound.length)}</strong>
            <span>Not in Voter Desk</span>
          </div>
          {result.outsideArea.length > 0 && (
            <div>
              <strong>{formatNumber(result.outsideArea.length)}</strong>
              <span>In wards not assigned to you</span>
            </div>
          )}
        </div>
        {result.outsideArea.length > 0 && (
          <div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => downloadMissing(result.outsideArea)}>
              <Download size={14} aria-hidden="true" /> Download voters outside your wards
            </button>
          </div>
        )}
        <div>
          <button type="button" className="btn btn-primary" onClick={reset}>
            <UploadCloud size={16} aria-hidden="true" /> Update from another file
          </button>
        </div>
      </div>
    );
  }

  if (ids && file) {
    return (
      <div className="card">
        <div className="card-header">
          <div>
            <h2>Update voter status</h2>
            <p className="small muted">
              {file.name} · {formatNumber(ids.length)} voter IDs found in the file.
            </p>
          </div>
        </div>
        <div className="card-body stack">
          <div className="import-counts">
            <span className="badge badge-success">{formatNumber(matched.length)} match voters in Voter Desk</span>
            <span className="badge badge-warning">{formatNumber(missing.length)} not in Voter Desk</span>
          </div>
          {missing.length > 0 && (
            <div className="alert alert-warning">
              <AlertTriangle size={18} aria-hidden="true" />
              <span>
                {formatNumber(missing.length)} voter IDs in the file are not in Voter Desk and will be skipped.{' '}
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => downloadMissing(missing)}>
                  <Download size={14} aria-hidden="true" /> Download list
                </button>
              </span>
            </div>
          )}
          <label className="field" style={{ maxWidth: 320 }}>
            <span className="field-label">
              New status for these voters<span className="req" aria-hidden="true">*</span>
            </span>
            <select className="select" value={status} onChange={(e) => setStatus(e.target.value as VoterStatus | '')}>
              <option value="">Select status</option>
              {VOTER_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s === 'Not Active' ? 'Not Active (deceased)' : s}
                </option>
              ))}
            </select>
            <span className="field-hint">Only Active voters can receive a payment.</span>
          </label>
          {saving && (
            <p className="small" role="status" aria-live="polite">
              Updating {formatNumber(saving.done)} of {formatNumber(saving.total)}…
            </p>
          )}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={reset} disabled={!!saving}>
            <RotateCcw size={16} aria-hidden="true" /> Choose another file
          </button>
          <button type="button" className="btn btn-primary" onClick={apply} disabled={!status || matched.length === 0 || !!saving}>
            {saving && <Loader2 size={16} className="spinner" aria-hidden="true" />}
            Update {formatNumber(matched.length)} voters
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card card-body">
      <div
        className={`dropzone ${dragOver ? 'is-over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        {reading ? <Loader2 size={36} className="spinner" aria-hidden="true" /> : <UploadCloud size={36} aria-hidden="true" />}
        <p>
          <strong>Drop a list of deceased or shifted voters</strong>, or
        </p>
        {reading && reading !== 'busy' && (
          <p className="small" role="status" aria-live="polite">
            Reading page {formatNumber(reading.page)} of {formatNumber(reading.pages)}…
          </p>
        )}
        <button type="button" className="btn btn-primary" onClick={() => inputRef.current?.click()} disabled={!!reading}>
          <FileSpreadsheet size={16} aria-hidden="true" /> Choose file
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_ATTR}
          className="sr-only"
          aria-label="Choose status list file"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void accept(f);
          }}
        />
        <p className="small muted">Every voter ID (EPIC number) in the file is matched to voters already in Voter Desk. PDF, Excel or CSV.</p>
      </div>
      {error && (
        <div className="alert alert-error" role="alert" style={{ marginTop: 12 }}>
          <AlertTriangle size={18} aria-hidden="true" />
          {error}
        </div>
      )}
    </div>
  );
}
