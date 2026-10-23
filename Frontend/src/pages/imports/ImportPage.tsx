import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Loader2, Pencil, RotateCcw, UploadCloud } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import type { WorkBook } from 'xlsx';
import { PageHeader } from '../../components/common/PageHeader';
import { ErrorState, SkeletonLines } from '../../components/common/States';
import { Pagination } from '../../components/tables/Pagination';
import { useConfirm } from '../../hooks/useConfirm';
import { useQuery } from '../../hooks/useQuery';
import { useToast } from '../../hooks/useToast';
import { useWards } from '../../hooks/useWards';
import { errorMessage } from '../../services/apiError';
import { ACCEPT_ATTR, downloadTemplate, hasDataRows, ImportFileError, importService, readImportFile, sheetRows, validateImportFile } from '../../services/importService';
import { VOTER_STATUSES, type ImportResult } from '../../types';
import { downloadCsv } from '../../utils/download';
import { formatNumber } from '../../utils/format';
import {
  autoDetectMapping,
  extractRows,
  findHeaderRow,
  IMPORT_FIELDS,
  mappingErrors,
  validateRows,
  type ColumnMapping,
  type ImportField,
  type RowCategory,
  type RowValues,
  type ValidatedRow,
} from '../../utils/importParser';
import { rollRows, type ElectoralRoll } from '../../utils/pdfLayout';
import './ImportPage.css';

type Step = 'upload' | 'map' | 'preview' | 'importing' | 'done';
const PREVIEW_PAGE = 25;

export function ImportPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const { wards, booths, loaded: wardsLoaded } = useWards();
  const ctxQuery = useQuery(() => importService.context(), 'import-context');
  const inputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [workbook, setWorkbook] = useState<WorkBook | null>(null);
  const [sheet, setSheet] = useState('');
  const [fromPdf, setFromPdf] = useState(false);
  const [roll, setRoll] = useState<ElectoralRoll | null>(null);
  const [rollChoice, setRollChoice] = useState({ wardId: '', boothId: '', status: '' });
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [edits, setEdits] = useState<Record<number, Partial<RowValues>>>({});
  const [tab, setTab] = useState<RowCategory>('valid');
  const [page, setPage] = useState(1);
  // Fields stay fixed while editing so an input does not vanish the moment its value becomes valid.
  const [editing, setEditing] = useState<{ rowNumber: number; fields: ImportField[] } | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<ImportResult | null>(null);

  const rollWard = wards.find((w) => w.id === rollChoice.wardId);
  const rollBooth = booths.find((b) => b.id === rollChoice.boothId);
  const sheetData = useMemo(() => {
    if (roll) return rollRows(roll, rollWard ? String(rollWard.number) : '', rollBooth ? String(rollBooth.number) : '', rollChoice.status);
    return workbook && sheet ? sheetRows(workbook, sheet) : [];
  }, [workbook, sheet, roll, rollWard, rollBooth, rollChoice.status]);
  const headerIndex = useMemo(() => findHeaderRow(sheetData), [sheetData]);
  const headers = sheetData[headerIndex] ?? [];
  const dataRows = sheetData.slice(headerIndex + 1);
  const dataRowCount = dataRows.filter((r) => r.some((c) => c.trim() !== '')).length;
  const sampleRow = dataRows.find((r) => r.some((c) => c.trim() !== ''));
  // Spreadsheet rows keep their real row numbers; PDF voters are numbered from 1.
  const firstRowNumber = roll || fromPdf ? 1 : headerIndex + 2;

  // Re-detect the mapping only when a different sheet is loaded.
  useEffect(() => {
    if (headers.length) setMapping(autoDetectMapping(headers));
  }, [sheetData]); // eslint-disable-line react-hooks/exhaustive-deps

  const validated = useMemo<ValidatedRow[]>(() => {
    if (!mapping || step === 'upload' || step === 'map' || !ctxQuery.data) return [];
    const raw = extractRows(dataRows, mapping, firstRowNumber).map((r) => ({ ...r, values: { ...r.values, ...edits[r.rowNumber] } }));
    return validateRows(raw, {
      wards,
      booths,
      existingVoterIds: new Set(ctxQuery.data.existingVoterIds),
      existingHouseholds: new Map(ctxQuery.data.households),
    });
  }, [mapping, step, ctxQuery.data, sheetData, edits, wards, booths]); // eslint-disable-line react-hooks/exhaustive-deps -- dataRows and firstRowNumber derive from sheetData

  const counts = useMemo(() => {
    const c = { valid: 0, invalid: 0, duplicate: 0 };
    for (const r of validated) c[r.category]++;
    return c;
  }, [validated]);
  const tabRows = validated.filter((r) => r.category === tab || r.rowNumber === editing?.rowNumber);
  // A corrected row leaves its tab, so keep the page inside the remaining rows.
  const currentPage = Math.min(page, Math.max(1, Math.ceil(tabRows.length / PREVIEW_PAGE)));
  const pageRows = tabRows.slice((currentPage - 1) * PREVIEW_PAGE, currentPage * PREVIEW_PAGE);

  const reset = () => {
    setStep('upload');
    setFile(null);
    setFileError(null);
    setWorkbook(null);
    setSheet('');
    setFromPdf(false);
    setRoll(null);
    setRollChoice({ wardId: '', boothId: '', status: '' });
    setMapping(null);
    setEdits({});
    setTab('valid');
    setPage(1);
    setEditing(null);
    setResult(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const acceptFile = async (f: File) => {
    setFileError(null);
    setReading(true);
    try {
      const problem = await validateImportFile(f);
      if (problem) {
        setFileError(problem);
        return;
      }
      const source = await readImportFile(f);
      if (source.kind === 'roll') {
        setWorkbook(null);
        setSheet('');
        setFromPdf(true);
        setRoll(source.roll);
        setRollChoice({ wardId: '', boothId: '', status: '' });
      } else {
        const wb = source.workbook;
        const firstWithData = wb.SheetNames.find((n) => hasDataRows(sheetRows(wb, n))) ?? wb.SheetNames[0];
        if (!firstWithData || !hasDataRows(sheetRows(wb, firstWithData))) {
          setFileError('No data rows found. The file needs a row of column headings, followed by voter rows.');
          return;
        }
        setRoll(null);
        setFromPdf(source.fromPdf);
        setWorkbook(wb);
        setSheet(firstWithData);
      }
      setFile(f);
      setEdits({});
      setStep('map');
    } catch (e) {
      setFileError(e instanceof ImportFileError ? e.message : 'The file could not be read. Make sure it is a valid Excel, CSV or PDF file.');
    } finally {
      setReading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (e.dataTransfer.files.length > 1) setFileError('Drop one file at a time.');
    else if (f) acceptFile(f);
  };

  const mapErrors = mapping ? mappingErrors(mapping) : [];

  const editValue = (rowNumber: number, field: ImportField, value: string) =>
    setEdits((e) => ({ ...e, [rowNumber]: { ...e[rowNumber], [field]: value } }));

  const downloadReport = () => {
    downloadCsv(
      'import-validation-report.csv',
      ['Row', ...IMPORT_FIELDS.map((f) => f.label), 'Result', 'Issues'],
      validated.map((r) => [r.rowNumber, ...IMPORT_FIELDS.map((f) => r.values[f.key]), r.category, r.issues.map((i) => i.message).join('; ')]),
    );
  };

  const runImport = async () => {
    const rows = validated.filter((r) => r.voter).map((r) => ({ rowNumber: r.rowNumber, voter: r.voter! }));
    const skipped = validated.length - rows.length;
    const ok = await confirm({
      title: `Import ${formatNumber(rows.length)} voters?`,
      message:
        skipped > 0
          ? `${formatNumber(skipped)} invalid or duplicate rows will be skipped. You can still correct them before importing.`
          : 'All rows passed validation.',
      confirmLabel: 'Import',
    });
    if (!ok) return;
    setStep('importing');
    setProgress({ done: 0, total: rows.length });
    try {
      const res = await importService.run(file?.name ?? 'import', rows, skipped, (done, total) => setProgress({ done, total }));
      setResult(res);
      setStep('done');
      ctxQuery.reload();
      toast.success(`Imported ${res.imported} voters.`);
    } catch (e) {
      toast.error(errorMessage(e));
      setStep('preview');
    }
  };

  if (ctxQuery.error && !ctxQuery.data) {
    return (
      <>
        <PageHeader title="Import Voters" />
        <div className="card">
          <ErrorState message={ctxQuery.error} onRetry={ctxQuery.reload} />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Import Voters"
        description="Upload an Excel (.xlsx, .xls), CSV or PDF file. Every row is checked before anything is saved."
        actions={
          <button type="button" className="btn btn-secondary" onClick={downloadTemplate}>
            <Download size={16} aria-hidden="true" /> Download template
          </button>
        }
      />

      <ol className="import-steps" aria-label="Import progress">
        {(['Upload', 'Map columns', 'Review', 'Import'] as const).map((label, i) => {
          const order: Step[] = ['upload', 'map', 'preview', 'importing'];
          const current = step === 'done' ? 3 : order.indexOf(step);
          return (
            <li key={label} className={i < current || step === 'done' ? 'is-done' : i === current ? 'is-current' : ''} aria-current={i === current ? 'step' : undefined}>
              <span className="step-dot">{i + 1}</span>
              {label}
            </li>
          );
        })}
      </ol>

      {step === 'upload' && (
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
              <strong>Drag and drop</strong> a file here, or
            </p>
            <button type="button" className="btn btn-primary" onClick={() => inputRef.current?.click()} disabled={reading || !ctxQuery.data}>
              <FileSpreadsheet size={16} aria-hidden="true" /> Choose file
            </button>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT_ATTR}
              className="sr-only"
              aria-label="Choose voter file"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) acceptFile(f);
              }}
            />
            <p className="small muted">Accepted: .xlsx, .xls, .csv, .pdf · up to 10 MB</p>
            <p className="small muted">PDF: a typed table with column headings, or an Election Commission electoral roll. Scanned PDFs cannot be read.</p>
          </div>
          {fileError && (
            <div className="alert alert-error" role="alert" style={{ marginTop: 12 }}>
              <AlertTriangle size={18} aria-hidden="true" />
              {fileError}
            </div>
          )}
        </div>
      )}

      {step === 'map' && mapping && roll && (
        <div className="card">
          <div className="card-header">
            <div>
              <h2>Electoral roll</h2>
              <p className="small muted">
                {file?.name} · {formatNumber(roll.records.length)} voters found. Voter ID (EPIC), name and house number were read from the PDF.
              </p>
            </div>
          </div>
          <div className="card-body stack">
            {roll.unreadBoxes > 0 && (
              <div className="alert alert-warning">
                <AlertTriangle size={18} aria-hidden="true" />
                {roll.unreadBoxes === 1 ? '1 voter box' : `${formatNumber(roll.unreadBoxes)} voter boxes`} had no readable EPIC number and{' '}
                {roll.unreadBoxes === 1 ? 'was' : 'were'} left out. Add them by hand or from Excel.
              </div>
            )}
            <p className="small">
              The roll has no ward or status. Choose them for all {formatNumber(roll.records.length)} voters; you can still correct single rows in the next step.
              {roll.partNumber !== null && ` The PDF says Part No. ${roll.partNumber}.`}
            </p>
            <div className="mapping-grid">
              <label className="field">
                <span className="field-label">
                  Ward<span className="req" aria-hidden="true">*</span>
                </span>
                <select
                  className="select"
                  value={rollChoice.wardId}
                  onChange={(e) => {
                    const wardId = e.target.value;
                    // The roll's part number is usually the booth number.
                    const match = booths.find((b) => b.wardId === wardId && b.number === roll.partNumber);
                    setRollChoice({ ...rollChoice, wardId, boothId: match?.id ?? '' });
                    setEdits({});
                  }}
                >
                  <option value="">Select ward</option>
                  {wards.map((w) => (
                    <option key={w.id} value={w.id}>
                      Ward {w.number} · {w.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field-label">
                  Booth<span className="req" aria-hidden="true">*</span>
                </span>
                <select
                  className="select"
                  value={rollChoice.boothId}
                  disabled={!rollChoice.wardId}
                  onChange={(e) => {
                    setRollChoice({ ...rollChoice, boothId: e.target.value });
                    setEdits({});
                  }}
                >
                  <option value="">{rollChoice.wardId ? 'Select booth' : 'Choose a ward first'}</option>
                  {booths
                    .filter((b) => b.wardId === rollChoice.wardId)
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        Booth {b.number} · {b.name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="field">
                <span className="field-label">
                  Status<span className="req" aria-hidden="true">*</span>
                </span>
                <select
                  className="select"
                  value={rollChoice.status}
                  onChange={(e) => {
                    setRollChoice({ ...rollChoice, status: e.target.value });
                    setEdits({});
                  }}
                >
                  <option value="">Select status</option>
                  {VOTER_STATUSES.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={reset}>
              <RotateCcw size={16} aria-hidden="true" /> Choose another file
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!rollChoice.wardId || !rollChoice.boothId || !rollChoice.status || !wardsLoaded}
              onClick={() => {
                setTab('valid');
                setPage(1);
                setStep('preview');
              }}
            >
              Validate rows
            </button>
          </div>
        </div>
      )}

      {step === 'map' && mapping && workbook && (
        <div className="card">
          <div className="card-header">
            <div>
              <h2>Map columns</h2>
              <p className="small muted">
                {file?.name} · {formatNumber(dataRowCount)} {dataRowCount === 1 ? 'data row' : 'data rows'}. Columns were matched automatically; adjust if needed.
              </p>
            </div>
            {workbook.SheetNames.length > 1 && !fromPdf && (
              <label className="field" style={{ minWidth: 180 }}>
                <span className="field-label">Worksheet</span>
                <select
                  className="select"
                  value={sheet}
                  onChange={(e) => {
                    setSheet(e.target.value);
                    setEdits({});
                  }}
                >
                  {workbook.SheetNames.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <div className="card-body">
            {fromPdf && (
              <div className="alert alert-warning" style={{ marginBottom: 12 }}>
                <AlertTriangle size={18} aria-hidden="true" />
                Columns were read from the PDF page layout. Check the example under each field before validating.
              </div>
            )}
            {dataRowCount === 0 && (
              <div className="alert alert-warning" style={{ marginBottom: 12 }}>
                <AlertTriangle size={18} aria-hidden="true" />
                This worksheet has no data rows.
              </div>
            )}
            <div className="mapping-grid">
              {IMPORT_FIELDS.map((f) => (
                <label key={f.key} className="field">
                  <span className="field-label">
                    {f.label}
                    {f.required && (
                      <span className="req" aria-hidden="true">
                        *
                      </span>
                    )}
                  </span>
                  <select className="select" value={mapping[f.key]} onChange={(e) => setMapping({ ...mapping, [f.key]: Number(e.target.value) })}>
                    <option value={-1}>— Not mapped —</option>
                    {headers.map((h, i) => (
                      <option key={i} value={i}>
                        {h || `Column ${i + 1}`}
                      </option>
                    ))}
                  </select>
                  <span className="field-hint">{mapping[f.key] >= 0 ? `e.g. ${sampleRow?.[mapping[f.key]] || '(empty)'}` : f.required ? 'Required' : 'Optional'}</span>
                </label>
              ))}
            </div>
            {mapErrors.length > 0 && (
              <div className="alert alert-warning" style={{ marginTop: 16 }}>
                <AlertTriangle size={18} aria-hidden="true" />
                <span>{mapErrors.join('. ')}.</span>
              </div>
            )}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={reset}>
              <RotateCcw size={16} aria-hidden="true" /> Choose another file
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={mapErrors.length > 0 || dataRowCount === 0 || !wardsLoaded}
              onClick={() => {
                setTab('valid');
                setPage(1);
                setStep('preview');
              }}
            >
              Validate rows
            </button>
          </div>
        </div>
      )}

      {step === 'preview' && (
        <div className="card">
          {!ctxQuery.data ? (
            <SkeletonLines rows={6} />
          ) : (
            <>
              <div className="card-header">
                <div className="import-counts">
                  <span className="badge badge-success">{formatNumber(counts.valid)} valid</span>
                  <span className="badge badge-danger">{formatNumber(counts.invalid)} invalid</span>
                  <span className="badge badge-warning">{formatNumber(counts.duplicate)} duplicate</span>
                </div>
                <button type="button" className="btn btn-secondary btn-sm" onClick={downloadReport}>
                  <Download size={14} aria-hidden="true" /> Validation report
                </button>
              </div>
              <div className="tabs" role="tablist" style={{ padding: '0 12px' }}>
                {(['valid', 'invalid', 'duplicate'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="tab"
                    className="tab"
                    aria-selected={tab === t}
                    onClick={() => {
                      setTab(t);
                      setPage(1);
                      setEditing(null);
                    }}
                  >
                    {t[0].toUpperCase() + t.slice(1)}
                    <span className="count">{counts[t]}</span>
                  </button>
                ))}
              </div>

              {tabRows.length === 0 ? (
                <p className="muted small" style={{ padding: 20 }}>
                  No {tab} rows.
                </p>
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <caption className="sr-only">{tab} rows</caption>
                    <thead>
                      <tr>
                        <th scope="col">Row</th>
                        <th scope="col">Voter ID</th>
                        <th scope="col">Name</th>
                        <th scope="col">Mobile</th>
                        <th scope="col">Ward</th>
                        <th scope="col">Booth</th>
                        <th scope="col">House</th>
                        <th scope="col">Status</th>
                        {tab !== 'valid' && <th scope="col">Issues</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((r) => (
                        <RowView
                          key={r.rowNumber}
                          row={r}
                          editingFields={editing?.rowNumber === r.rowNumber ? editing.fields : null}
                          onToggleEdit={() =>
                            setEditing(
                              editing?.rowNumber === r.rowNumber
                                ? null
                                : {
                                    rowNumber: r.rowNumber,
                                    fields: IMPORT_FIELDS.filter((f) => r.issues.some((i) => i.field === f.key) || (f.required && !r.values[f.key])).map((f) => f.key),
                                  },
                            )
                          }
                          onEdit={(field, value) => editValue(r.rowNumber, field, value)}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {tabRows.length > PREVIEW_PAGE && <Pagination page={currentPage} pageSize={PREVIEW_PAGE} total={tabRows.length} onPageChange={setPage} />}
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setStep('map')}>
                  Back to mapping
                </button>
                <button type="button" className="btn btn-primary" onClick={runImport} disabled={counts.valid === 0}>
                  Import {formatNumber(counts.valid)} valid rows
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {step === 'importing' && (
        <div className="card card-body import-progress" role="status" aria-live="polite">
          <Loader2 size={28} className="spinner" aria-hidden="true" />
          <p>
            Importing {formatNumber(progress.done)} of {formatNumber(progress.total)}…
          </p>
          <div className="progress-bar" aria-hidden="true">
            <span style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
          </div>
          <p className="small muted">Keep this page open until the import finishes.</p>
        </div>
      )}

      {step === 'done' && result && (
        <div className="card card-body stack">
          <div className="row">
            <CheckCircle2 size={28} style={{ color: 'var(--color-success)' }} aria-hidden="true" />
            <h2>Import complete</h2>
          </div>
          <div className="import-summary">
            <div>
              <strong>{formatNumber(result.imported)}</strong>
              <span>Imported</span>
            </div>
            <div>
              <strong>{formatNumber(result.skipped)}</strong>
              <span>Skipped</span>
            </div>
            <div>
              <strong>{formatNumber(result.failed)}</strong>
              <span>Failed</span>
            </div>
          </div>
          {result.errors.length > 0 && (
            <div>
              <h3 style={{ marginBottom: 6 }}>Rows rejected by the server</h3>
              <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
                {result.errors.slice(0, 20).map((e) => (
                  <li key={e.rowNumber}>
                    Row {e.rowNumber}: {e.message}
                  </li>
                ))}
              </ul>
              {result.errors.length > 20 && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => downloadCsv('import-errors.csv', ['Row', 'Error'], result.errors.map((e) => [e.rowNumber, e.message]))}
                >
                  <Download size={14} aria-hidden="true" /> Download all {result.errors.length} errors
                </button>
              )}
            </div>
          )}
          <div>
            <button type="button" className="btn btn-primary" onClick={reset}>
              <UploadCloud size={16} aria-hidden="true" /> Import another file
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function RowView({
  row,
  editingFields,
  onToggleEdit,
  onEdit,
}: {
  row: ValidatedRow;
  editingFields: ImportField[] | null;
  onToggleEdit: () => void;
  onEdit: (field: ImportField, value: string) => void;
}) {
  const v = row.values;
  const bad = new Set(row.issues.map((i) => i.field));
  const cell = (field: ImportField) => <span className={bad.has(field) ? 'cell-bad' : undefined}>{v[field] || '—'}</span>;
  const editing = editingFields !== null;
  const editable = row.category !== 'valid' || editing;

  return (
    <>
      <tr>
        <td data-label="Row">{row.rowNumber}</td>
        <td data-label="Voter ID" className="mono">
          {cell('voterId')}
        </td>
        <td data-label="Name">{cell('fullName')}</td>
        <td data-label="Mobile">{cell('mobile')}</td>
        <td data-label="Ward">{cell('wardNumber')}</td>
        <td data-label="Booth">{cell('boothNumber')}</td>
        <td data-label="House">{cell('houseNumber')}</td>
        <td data-label="Status">{cell('status')}</td>
        {editable && (
          <td data-label="Issues">
            <div className="issue-cell">
              {row.issues.length === 0 && <span className="badge badge-success">Fixed</span>}
              <ul>
                {row.issues.map((i, idx) => (
                  <li key={idx}>{i.message}</li>
                ))}
              </ul>
              <button type="button" className="btn btn-ghost btn-sm" onClick={onToggleEdit} aria-expanded={editing}>
                <Pencil size={14} aria-hidden="true" /> {editing ? 'Done' : 'Correct'}
              </button>
            </div>
          </td>
        )}
      </tr>
      {editable && editing && (
        <tr className="row-editor">
          <td colSpan={9}>
            <div className="row-editor-grid">
              {IMPORT_FIELDS.filter((f) => editingFields?.includes(f.key)).map((f) => (
                <label key={f.key} className="field">
                  <span className="field-label">{f.label}</span>
                  {f.key === 'status' ? (
                    <select className="select" value={v.status} onChange={(e) => onEdit('status', e.target.value)}>
                      <option value="">Select status</option>
                      {VOTER_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input className="input" value={v[f.key]} onChange={(e) => onEdit(f.key, e.target.value)} />
                  )}
                </label>
              ))}
            </div>
            <p className="small muted" style={{ marginTop: 6 }}>
              Corrections are checked again instantly. A corrected row moves to the Valid tab.
            </p>
          </td>
        </tr>
      )}
    </>
  );
}
