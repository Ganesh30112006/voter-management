import type { PdfTextItem } from '../utils/pdfLayout';

export const MAX_PDF_PAGES = 300;

/** The part of a pdf.js document this module uses (also satisfied by the Node build in tests). */
export interface PdfDocumentLike {
  numPages: number;
  getPage(n: number): Promise<{
    getViewport(o: { scale: number }): { height: number };
    getTextContent(): Promise<{ items: unknown[] }>;
  }>;
}

export class PdfReadError extends Error {}

/** Every text run in the document, with positions measured from each page's top-left. */
export async function pdfTextItems(doc: PdfDocumentLike): Promise<PdfTextItem[]> {
  if (doc.numPages > MAX_PDF_PAGES) throw new PdfReadError(`The PDF has more than ${MAX_PDF_PAGES} pages. Split it into smaller files.`);
  const out: PdfTextItem[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const height = page.getViewport({ scale: 1 }).height;
    const content = await page.getTextContent();
    for (const raw of content.items) {
      const item = raw as { str?: string; transform?: number[]; width?: number; height?: number };
      if (typeof item.str !== 'string' || !item.transform) continue;
      const [, , c, d, e, f] = item.transform;
      out.push({ page: n, str: item.str, x: e, y: height - f, width: item.width ?? 0, size: Math.hypot(c, d) || item.height || 10 });
    }
  }
  return out;
}

let worker: Worker | null = null;

/** Loads pdf.js only when a PDF is chosen, so it stays out of the main bundle. */
export async function readPdfItems(data: ArrayBuffer): Promise<PdfTextItem[]> {
  const pdfjs = await import('pdfjs-dist');
  if (!worker) {
    // Bundled by Vite as a plain .js file, so static hosting serves it with a JavaScript type.
    const { default: PdfWorker } = await import('pdfjs-dist/build/pdf.worker.min.mjs?worker');
    worker = new PdfWorker();
    pdfjs.GlobalWorkerOptions.workerPort = worker;
  }
  let doc;
  try {
    doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
  } catch (e) {
    if ((e as { name?: string }).name === 'PasswordException') throw new PdfReadError('This PDF is password-protected. Remove the password and try again.');
    throw new PdfReadError('The PDF could not be opened. It may be damaged.');
  }
  try {
    return await pdfTextItems(doc);
  } finally {
    void doc.destroy();
  }
}
