import * as XLSX from 'xlsx';
import type { ImportContext, ImportResult, ImportRow } from '../types';
import { downloadXlsx } from '../utils/download';
import { IMPORT_FIELDS, TEMPLATE_HEADERS } from '../utils/importParser';
import { readPdfLayout, type ElectoralRoll } from '../utils/pdfLayout';
import { apiClient, mockCall, USE_MOCK } from './apiClient';
import { PdfReadError, readPdfItems } from './pdfReader';

export const ACCEPTED_EXTENSIONS = ['.xlsx', '.xls', '.csv', '.pdf'] as const;
export const ACCEPT_ATTR = '.xlsx,.xls,.csv,.pdf';
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
const BATCH_SIZE = 100;

function extensionOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i === -1 ? '' : name.slice(i).toLowerCase();
}

/** Checks extension, size and the file's real signature. Returns an error message or null. */
export async function validateImportFile(file: File): Promise<string | null> {
  const ext = extensionOf(file.name);
  if (!(ACCEPTED_EXTENSIONS as readonly string[]).includes(ext)) {
    return 'Unsupported file type. Upload an Excel (.xlsx, .xls), CSV (.csv) or PDF (.pdf) file.';
  }
  if (file.size === 0) return 'The file is empty.';
  if (file.size > MAX_FILE_BYTES) return 'The file is larger than 10 MB. Split it into smaller files.';
  const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const isZip = head[0] === 0x50 && head[1] === 0x4b; // PK.. (xlsx)
  const isOle = head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0; // legacy xls
  const isPdf = head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46;
  if (ext === '.xlsx' && !isZip) return 'This file is not a valid .xlsx workbook.';
  if (ext === '.xls' && !isOle) return 'This file is not a valid .xls workbook.';
  if (ext === '.pdf') {
    // The %PDF- marker may follow a few junk bytes.
    const start = new TextDecoder('latin1').decode(await file.slice(0, 1024).arrayBuffer());
    if (!start.includes('%PDF-')) return 'This file is not a valid PDF.';
  }
  if (ext === '.csv') {
    if (isZip || isOle || isPdf) return 'This file is not a plain-text CSV file.';
    const sample = new Uint8Array(await file.slice(0, 4096).arrayBuffer());
    if (sample.includes(0)) return 'This file is not a plain-text CSV file.';
  }
  return null;
}

/** What a chosen file holds: worksheets (Excel, CSV or a table PDF) or an Election Commission roll. */
export type ImportSource = { kind: 'sheets'; workbook: XLSX.WorkBook; fromPdf: boolean } | { kind: 'roll'; roll: ElectoralRoll };

/** A problem with the file's contents, worded for the user. */
export class ImportFileError extends Error {}

export async function readImportFile(file: File): Promise<ImportSource> {
  const ext = extensionOf(file.name);
  if (ext === '.pdf') return readPdf(file);
  if (ext === '.csv') {
    // raw: keep every value as typed so identifiers such as 00123 keep their leading zeros.
    return { kind: 'sheets', workbook: XLSX.read(await file.text(), { type: 'string', raw: true }), fromPdf: false };
  }
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  for (const name of workbook.SheetNames) fullIntegers(workbook.Sheets[name]);
  return { kind: 'sheets', workbook, fromPdf: false };
}

/** Excel shows long whole numbers such as 919876543210 as "9.19877E+11"; use the full number instead. */
function fullIntegers(ws: XLSX.WorkSheet | undefined): void {
  if (!ws) return;
  for (const [ref, cell] of Object.entries(ws)) {
    if (ref.startsWith('!')) continue;
    const c = cell as XLSX.CellObject;
    if (c.t === 'n' && typeof c.v === 'number' && Number.isSafeInteger(c.v) && /e[+-]/i.test(c.w ?? XLSX.utils.format_cell(c))) {
      c.w = String(c.v);
    }
  }
}

async function readPdf(file: File): Promise<ImportSource> {
  let items;
  try {
    items = await readPdfItems(await file.arrayBuffer());
  } catch (e) {
    throw e instanceof PdfReadError ? new ImportFileError(e.message) : e;
  }
  const layout = readPdfLayout(items);
  switch (layout.kind) {
    case 'table': {
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(layout.rows), 'PDF table');
      return { kind: 'sheets', workbook, fromPdf: true };
    }
    case 'roll':
      return { kind: 'roll', roll: layout.roll };
    case 'no-text':
      throw new ImportFileError('This PDF has no readable text: it looks scanned or photographed. Use a typed PDF, or an Excel or CSV file.');
    default:
      throw new ImportFileError(
        'No voter table was found in this PDF. It needs a table with column headings (like the template), or the Election Commission roll layout.',
      );
  }
}

/**
 * Returns the sheet as rows of display text. Index i is spreadsheet row i + 1: blank rows and rows above
 * the used range are kept (as empty rows) so reported row numbers match the file.
 */
export function sheetRows(wb: XLSX.WorkBook, sheetName: string): string[][] {
  const ws = wb.Sheets[sheetName];
  if (!ws || !ws['!ref']) return [];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: '', blankrows: true });
  const firstRow = XLSX.utils.decode_range(ws['!ref']).s.r;
  return [...Array.from({ length: firstRow }, () => [] as string[]), ...rows.map((r) => r.map((c) => String(c ?? '')))];
}

/** True when the sheet has a row with content after its first non-empty row. */
export function hasDataRows(rows: string[][]): boolean {
  return rows.filter((r) => r.some((c) => c.trim() !== '')).length > 1;
}

export function downloadTemplate(): void {
  downloadXlsx('voter-import-template.xlsx', [
    { name: 'Voters', headers: TEMPLATE_HEADERS, rows: [] },
    {
      name: 'Instructions',
      headers: ['Column', 'Required', 'Notes'],
      rows: [
        ...IMPORT_FIELDS.map((f) => [f.label, f.required ? 'Yes' : 'No', notesFor(f.key)]),
        [],
        ['Tip', '', 'Format the Voter ID and Household ID columns as Text so leading zeros are kept.'],
      ],
    },
  ]);
}

function notesFor(key: string): string {
  switch (key) {
    case 'mobile':
      return '10-digit Indian mobile number, optional';
    case 'wardNumber':
      return 'Must match an existing ward number';
    case 'boothNumber':
      return 'Must be a booth in that ward';
    case 'status':
      return 'Exactly one of: Active, Not Active, Shifted';
    case 'householdId':
      return 'Optional; members of one household share the same ID';
    default:
      return '';
  }
}

export const importService = {
  context(): Promise<ImportContext> {
    if (USE_MOCK) return mockCall((s, t) => s.importContext(t));
    return apiClient.get<ImportContext>('/imports/context').then((r) => r.data);
  },

  /** Uploads validated rows in batches so large files are processed by the backend incrementally. */
  async run(
    fileName: string,
    rows: ImportRow[],
    skippedBeforeUpload: number,
    onProgress: (done: number, total: number) => void,
  ): Promise<ImportResult> {
    const { importId } = USE_MOCK
      ? await mockCall((s, t) => s.startImport(t, fileName))
      : (await apiClient.post<{ importId: string }>('/imports', { fileName })).data;
    onProgress(0, rows.length);
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      if (USE_MOCK) await mockCall((s, t) => s.importBatch(t, importId, batch));
      else await apiClient.post(`/imports/${encodeURIComponent(importId)}/rows`, { rows: batch });
      onProgress(Math.min(i + BATCH_SIZE, rows.length), rows.length);
    }
    if (USE_MOCK) return mockCall((s, t) => s.finishImport(t, importId, skippedBeforeUpload));
    return (await apiClient.post<ImportResult>(`/imports/${encodeURIComponent(importId)}/complete`, { skippedBeforeUpload })).data;
  },
};
