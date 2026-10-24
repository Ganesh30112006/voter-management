import { PdfLayoutReader, voterIdsInText, pageText, type PdfLayout, type PdfTextItem } from '../utils/pdfLayout';

/** Read in pieces of this size, so even a 2 GB file never has to be in memory at once. */
const CHUNK_BYTES = 1024 * 1024;

/** The part of pdf.js this module uses (the browser build, or the Node build in tests). */
export interface PdfJsLike {
  PDFDataRangeTransport: new (length: number, initialData: Uint8Array | null) => {
    onDataRange(begin: number, chunk: Uint8Array): void;
    requestDataRange(begin: number, end: number): void;
  };
  getDocument(params: Record<string, unknown>): { promise: Promise<PdfDocumentLike> };
}

export interface PdfDocumentLike {
  numPages: number;
  getPage(n: number): Promise<{
    getViewport(o: { scale: number }): { height: number };
    getTextContent(): Promise<{ items: unknown[] }>;
    cleanup(): unknown;
  }>;
  destroy(): Promise<void>;
}

export class PdfReadError extends Error {}

/** Text runs of one page, with positions measured from the page's top-left. */
async function pageItems(doc: PdfDocumentLike, n: number): Promise<PdfTextItem[]> {
  const page = await doc.getPage(n);
  const height = page.getViewport({ scale: 1 }).height;
  const content = await page.getTextContent();
  const out: PdfTextItem[] = [];
  for (const raw of content.items) {
    const item = raw as { str?: string; transform?: number[]; width?: number; height?: number };
    if (typeof item.str !== 'string' || !item.transform) continue;
    const [a, b, c, d, e, f] = item.transform;
    // Rotated text (diagonal watermarks such as "ANDHRA PRADESH") is not part of the voter data.
    if (Math.abs(b) > Math.abs(a) * 0.05 || Math.abs(c) > Math.abs(d) * 0.05) continue;
    out.push({ str: item.str, x: e, y: height - f, width: item.width ?? 0, size: Math.hypot(c, d) || item.height || 10 });
  }
  // Images are never decoded (only text is read); free the page's resources before the next one.
  page.cleanup();
  return out;
}

/**
 * Reads a PDF file page by page, handing each page's text to `onPage`. pdf.js asks for byte ranges, which
 * are sliced from the file on demand, so memory stays small however large the file is.
 */
export async function readPdfPagesFromFile(
  pdfjs: PdfJsLike,
  file: Blob,
  onPage: (page: number, items: PdfTextItem[]) => void,
  onProgress?: (page: number, pages: number) => void,
): Promise<void> {
  const first = new Uint8Array(await file.slice(0, CHUNK_BYTES).arrayBuffer());
  const transport = new pdfjs.PDFDataRangeTransport(file.size, first);
  transport.requestDataRange = (begin: number, end: number) => {
    void file
      .slice(begin, end)
      .arrayBuffer()
      .then((buf) => transport.onDataRange(begin, new Uint8Array(buf)));
  };
  let doc: PdfDocumentLike;
  try {
    doc = await pdfjs.getDocument({
      range: transport,
      rangeChunkSize: CHUNK_BYTES,
      disableAutoFetch: true,
      disableStream: true,
      isEvalSupported: false,
      verbosity: 0,
    }).promise;
  } catch (e) {
    if ((e as { name?: string }).name === 'PasswordException') throw new PdfReadError('This PDF is password-protected. Remove the password and try again.');
    throw new PdfReadError('The PDF could not be opened. It may be damaged.');
  }
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      onPage(n, await pageItems(doc, n));
      onProgress?.(n, doc.numPages);
    }
  } finally {
    void doc.destroy();
  }
}

/** Reads a voter table or electoral roll from a PDF file. */
export async function readPdfLayoutFromFile(pdfjs: PdfJsLike, file: Blob, onProgress?: (page: number, pages: number) => void): Promise<PdfLayout> {
  const reader = new PdfLayoutReader();
  await readPdfPagesFromFile(pdfjs, file, (n, items) => reader.addPage(n, items), onProgress);
  return reader.finish();
}

/** Every EPIC (voter ID) number printed in a PDF, in order, without repeats. */
export async function readPdfVoterIdsFromFile(pdfjs: PdfJsLike, file: Blob, onProgress?: (page: number, pages: number) => void): Promise<string[]> {
  const ids = new Set<string>();
  await readPdfPagesFromFile(pdfjs, file, (_n, items) => voterIdsInText(pageText(items)).forEach((id) => ids.add(id)), onProgress);
  return [...ids];
}

let worker: Worker | null = null;

/** Loads pdf.js only when a PDF is chosen, so it stays out of the main bundle. */
async function loadPdfJs(): Promise<PdfJsLike> {
  const pdfjs = await import('pdfjs-dist');
  if (!worker) {
    // Bundled by Vite as a plain .js file, so static hosting serves it with a JavaScript type.
    const { default: PdfWorker } = await import('pdfjs-dist/build/pdf.worker.min.mjs?worker');
    worker = new PdfWorker();
    pdfjs.GlobalWorkerOptions.workerPort = worker;
  }
  return pdfjs as unknown as PdfJsLike;
}

export async function readPdfLayout(file: File, onProgress?: (page: number, pages: number) => void): Promise<PdfLayout> {
  return readPdfLayoutFromFile(await loadPdfJs(), file, onProgress);
}

export async function readPdfVoterIds(file: File, onProgress?: (page: number, pages: number) => void): Promise<string[]> {
  return readPdfVoterIdsFromFile(await loadPdfJs(), file, onProgress);
}
