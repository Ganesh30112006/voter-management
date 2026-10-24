import * as XLSX from 'xlsx';
import type { ImportContext, ImportResult, ImportRow } from '../types';
import { downloadXlsx } from '../utils/download';
import { IMPORT_FIELDS, TEMPLATE_HEADERS } from '../utils/importParser';
import { voterIdsInText, type ElectoralRoll } from '../utils/pdfLayout';
import { apiClient } from './apiClient';
import { PdfReadError, readPdfLayout, readPdfVoterIds } from './pdfReader';

export const ACCEPTED_EXTENSIONS = ['.xlsx', '.xls', '.csv', '.pdf'] as const;
export const ACCEPT_ATTR = '.xlsx,.xls,.csv,.pdf';
const MB = 1024 * 1024;
/**
 * Largest file per type. PDFs are read in small pieces, page by page, so they can be very large. Excel and
 * CSV files are read whole by the browser; Excel cannot hold more than about 10 lakh rows anyway (~100 MB).
 */
export const MAX_BYTES: Record<string, number> = { '.pdf': 2048 * MB, '.xlsx': 100 * MB, '.xls': 100 * MB, '.csv': 200 * MB };
/** Rows per upload request (the server accepts at most 500). */
const BATCH_SIZE = 500;

const sizeLabel = (bytes: number) => (bytes >= 1024 * MB ? `${bytes / (1024 * MB)} GB` : `${bytes / MB} MB`);

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
  if (file.size > MAX_BYTES[ext]) return `${ext.slice(1).toUpperCase()} files can be at most ${sizeLabel(MAX_BYTES[ext])}. Split it into smaller files.`;
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
/** `textlessPages`: PDF pages with no readable text (scanned), which were skipped. */
export type ImportSource =
  | { kind: 'sheets'; workbook: XLSX.WorkBook; fromPdf: boolean; textlessPages: number[] }
  | { kind: 'roll'; roll: ElectoralRoll; textlessPages: number[] };

/** A problem with the file's contents, worded for the user. */
export class ImportFileError extends Error {}

/** `onPdfProgress` reports pages read so far for PDFs (large rolls take a while). */
export async function readImportFile(file: File, onPdfProgress?: (page: number, pages: number) => void): Promise<ImportSource> {
  const ext = extensionOf(file.name);
  if (ext === '.pdf') return readPdf(file, onPdfProgress);
  if (ext === '.csv') {
    // raw: keep every value as typed so identifiers such as 00123 keep their leading zeros.
    return { kind: 'sheets', workbook: XLSX.read(await file.text(), { type: 'string', raw: true }), fromPdf: false, textlessPages: [] };
  }
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  for (const name of workbook.SheetNames) fullIntegers(workbook.Sheets[name]);
  return { kind: 'sheets', workbook, fromPdf: false, textlessPages: [] };
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

async function readPdf(file: File, onProgress?: (page: number, pages: number) => void): Promise<ImportSource> {
  let layout;
  try {
    layout = await readPdfLayout(file, onProgress);
  } catch (e) {
    throw e instanceof PdfReadError ? new ImportFileError(e.message) : e;
  }
  switch (layout.kind) {
    case 'table': {
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(layout.rows), 'PDF table');
      return { kind: 'sheets', workbook, fromPdf: true, textlessPages: layout.textlessPages };
    }
    case 'roll':
      return { kind: 'roll', roll: layout.roll, textlessPages: layout.textlessPages };
    case 'no-text':
      throw new ImportFileError('This PDF has no readable text: it looks scanned or photographed. Use a typed PDF, or an Excel or CSV file.');
    default:
      throw new ImportFileError(
        'No voter table was found in this PDF. It needs a table with column headings (like the template), or the Election Commission roll layout.',
      );
  }
}

/**
 * Voter IDs listed in a file (a deaths / shifted list), in order, without repeats. PDFs: every EPIC number
 * printed. Excel/CSV: every cell that is an EPIC number or an existing Voter ID (any case).
 */
export async function readVoterIdList(file: File, existingIds: Set<string>, onPdfProgress?: (page: number, pages: number) => void): Promise<string[]> {
  if (extensionOf(file.name) === '.pdf') {
    try {
      return await readPdfVoterIds(file, onPdfProgress);
    } catch (e) {
      throw e instanceof PdfReadError ? new ImportFileError(e.message) : e;
    }
  }
  const source = await readImportFile(file);
  if (source.kind !== 'sheets') return [];
  const ids = new Set<string>();
  for (const name of source.workbook.SheetNames) {
    for (const row of sheetRows(source.workbook, name)) {
      for (const cell of row) {
        const value = cell.trim();
        if (!value) continue;
        if (existingIds.has(value.toUpperCase())) ids.add(value.toUpperCase());
        else voterIdsInText(value.toUpperCase()).forEach((id) => ids.add(id));
      }
    }
  }
  return [...ids];
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
    case 'wardNumber':
      return 'Must match an existing ward number';
    case 'boothNumber':
      return 'Optional; a booth number in that ward. Anything else is ignored and the voter is added without a booth';
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
    return apiClient.get<ImportContext>('/imports/context').then((r) => r.data);
  },

  /** Uploads validated rows in batches so large files are processed by the backend incrementally. */
  async run(
    fileName: string,
    rows: ImportRow[],
    skippedBeforeUpload: number,
    onProgress: (done: number, total: number) => void,
  ): Promise<ImportResult> {
    const { importId } = (await apiClient.post<{ importId: string }>('/imports', { fileName })).data;
    onProgress(0, rows.length);
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      await apiClient.post(`/imports/${encodeURIComponent(importId)}/rows`, { rows: batch });
      onProgress(Math.min(i + BATCH_SIZE, rows.length), rows.length);
    }
    return (await apiClient.post<ImportResult>(`/imports/${encodeURIComponent(importId)}/complete`, { skippedBeforeUpload })).data;
  },
};
