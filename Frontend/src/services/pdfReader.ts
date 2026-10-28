import { PdfLayoutReader, voterIdsInText, pageText, unreadablePagesMessage, type PdfLayout, type PdfTextItem } from '../utils/pdfLayout';
import { placeGlyphPieces, unmappedGlyphTexts, withoutAddedSpaces, type ShownGlyph } from '../utils/teluguGlyphs';

/** Read in pieces of this size, so even a 2 GB file never has to be in memory at once. */
const CHUNK_BYTES = 1024 * 1024;

/** The part of pdf.js this module uses (the browser build, or the Node build in tests). */
export interface PdfJsLike {
  PDFDataRangeTransport: new (length: number, initialData: Uint8Array | null) => {
    onDataRange(begin: number, chunk: Uint8Array): void;
    requestDataRange(begin: number, end: number): void;
  };
  getDocument(params: Record<string, unknown>): { promise: Promise<PdfDocumentLike> };
  /** Operator codes, to find drawn glyphs in an operator list. */
  OPS?: { setFont: number; showText: number };
}

interface PdfPageLike {
  getViewport(o: { scale: number }): { height: number };
  getTextContent(): Promise<{ items: unknown[] }>;
  getOperatorList?(): Promise<{ fnArray: number[]; argsArray: unknown[][] }>;
  commonObjs?: { get(id: string): unknown };
  cleanup(): unknown;
}

export interface PdfDocumentLike {
  numPages: number;
  getPage(n: number): Promise<PdfPageLike>;
  destroy(): Promise<void>;
}

export class PdfReadError extends Error {}

/** Every glyph drawn on a page, in content order, with its font and glyph number. */
async function shownGlyphs(page: PdfPageLike, ops: { setFont: number; showText: number }): Promise<ShownGlyph[]> {
  const list = await page.getOperatorList!();
  const glyphs: ShownGlyph[] = [];
  let font = '';
  list.fnArray.forEach((fn, i) => {
    const args = list.argsArray[i];
    if (fn === ops.setFont) {
      try {
        font = (page.commonObjs?.get(String(args[0])) as { name?: string } | undefined)?.name ?? '';
      } catch {
        font = '';
      }
    } else if (fn === ops.showText) {
      for (const g of args[0] as unknown[]) {
        const glyph = g as { originalCharCode?: number; unicode?: string } | null;
        if (glyph && typeof glyph === 'object') glyphs.push({ font, gid: glyph.originalCharCode ?? -1, unicode: glyph.unicode ?? '' });
      }
    }
  });
  return glyphs;
}

/**
 * Telugu (or other Indian script) pieces drawn one after another with no space between are one word, however
 * wide pdf.js thinks the gap is (it gives some pieces no width). Used only when the page's spaces are known to be
 * drawn.
 */
function joinWordPieces(items: PdfTextItem[]): PdfTextItem[] {
  const out: PdfTextItem[] = [];
  // Where the last piece joined to the word before started.
  let lastX = -Infinity;
  for (const item of items) {
    const prev = out[out.length - 1];
    const joins =
      prev &&
      /[\u0900-\u0dff]$/.test(prev.str) &&
      /^[\u0900-\u0dff]/.test(item.str) &&
      Math.abs(item.y - prev.y) <= Math.max(item.size, prev.size) * 0.6 &&
      item.x >= lastX - 1 &&
      item.x - lastX <= item.size * 6;
    if (joins) {
      prev.str += item.str;
      prev.width = Math.max(prev.width, item.x + item.width - prev.x);
    } else {
      out.push({ ...item });
    }
    lastX = item.x;
  }
  return out;
}

/** Text runs of one page, with positions measured from the page's top-left. */
async function pageItems(pdfjs: PdfJsLike, doc: PdfDocumentLike, n: number): Promise<PdfTextItem[]> {
  const page = await doc.getPage(n);
  const height = page.getViewport({ scale: 1 }).height;
  const content = await page.getTextContent();
  let raws = content.items as { str?: string; transform?: number[]; width?: number; height?: number }[];
  // pdf.js hides errors and returns an empty page, which looked like a scanned page. A page that draws text
  // but gives none could not be read (for example in an old browser): report it.
  if (!raws.some((r) => typeof r.str === 'string' && r.str.trim()) && pdfjs.OPS && page.getOperatorList) {
    if ((await shownGlyphs(page, pdfjs.OPS)).some((g) => g.unicode.trim())) {
      page.cleanup();
      throw new Error('the text of the page could not be read');
    }
  }
  // Glyphs without text (Telugu conjuncts): look them up by glyph number. This reads the page's drawing
  // operations, which takes longer, so only for pages that need it.
  const blanks = raws.reduce((sum, r) => sum + (typeof r.str === 'string' ? r.str.split('\0').length - 1 : 0), 0);
  let spaced = false;
  if (blanks && pdfjs.OPS && page.getOperatorList) {
    const glyphs = await shownGlyphs(page, pdfjs.OPS);
    const texts = unmappedGlyphTexts(glyphs);
    // Both lists are in content order; if they do not line up, the glyphs are left out as before.
    if (texts.length === blanks) {
      const strs = withoutAddedSpaces(
        raws.map((r) => (typeof r.str === 'string' ? r.str : '')),
        glyphs,
      );
      spaced = strs !== null;
      let k = 0;
      raws = raws.map((r, i) => {
        if (typeof r.str !== 'string') return r;
        const str = strs ? strs[i] : r.str;
        return { ...r, str: str.replace(/\0/g, () => texts[k++]) };
      });
    }
  }
  const out: PdfTextItem[] = [];
  for (const item of raws) {
    if (typeof item.str !== 'string' || !item.transform) continue;
    const [a, b, c, d, e, f] = item.transform;
    // Rotated text (diagonal watermarks such as "ANDHRA PRADESH") is not part of the voter data.
    if (Math.abs(b) > Math.abs(a) * 0.05 || Math.abs(c) > Math.abs(d) * 0.05) continue;
    out.push({ str: item.str, x: e, y: height - f, width: item.width ?? 0, size: Math.hypot(c, d) || item.height || 10, ...(spaced && { spaced }) });
  }
  // Free the page's resources (fonts, images of the operator list) before the next one.
  page.cleanup();
  const placed = placeGlyphPieces(out);
  if (!spaced) return placed;
  // A space drawn on its own becomes a leading space of the next text, so it is not lost with empty items.
  const words = placed.flatMap((item, i) => {
    if (item.str === '') return [];
    const next = placed[i + 1];
    if (item.str.trim() || !next) return [item];
    next.str = ' ' + next.str;
    return [];
  });
  return joinWordPieces(words);
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
  onPageError?: (page: number, reason: string) => void,
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
      // Fonts are only looked at for their names, never drawn.
      disableFontFace: true,
      // Photos are skipped: no image is ever decoded, only the voters' text is read.
      maxImageSize: 1,
      verbosity: 0,
    }).promise;
  } catch (e) {
    if ((e as { name?: string }).name === 'PasswordException') throw new PdfReadError('This PDF is password-protected. Remove the password and try again.');
    throw new PdfReadError('The PDF could not be opened. It may be damaged.');
  }
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      let items: PdfTextItem[] | null = null;
      try {
        items = await pageItems(pdfjs, doc, n);
      } catch (e) {
        if (!onPageError) throw e;
        onPageError(n, e instanceof Error ? e.message : String(e));
      }
      if (items) onPage(n, items);
      onProgress?.(n, doc.numPages);
    }
  } finally {
    void doc.destroy();
  }
}

/** Reads a voter table or electoral roll from a PDF file. */
export async function readPdfLayoutFromFile(pdfjs: PdfJsLike, file: Blob, onProgress?: (page: number, pages: number) => void): Promise<PdfLayout> {
  const reader = new PdfLayoutReader();
  await readPdfPagesFromFile(pdfjs, file, (n, items) => reader.addPage(n, items), onProgress, (n, reason) => reader.pageFailed(n, reason));
  return reader.finish();
}

/** Every EPIC (voter ID) number printed in a PDF, in order, without repeats. */
export async function readPdfVoterIdsFromFile(pdfjs: PdfJsLike, file: Blob, onProgress?: (page: number, pages: number) => void): Promise<string[]> {
  const ids = new Set<string>();
  const failed: number[] = [];
  let reason = '';
  await readPdfPagesFromFile(pdfjs, file, (_n, items) => voterIdsInText(pageText(items)).forEach((id) => ids.add(id)), onProgress, (n, r) => {
    failed.push(n);
    reason ||= r;
  });
  // A list with missing pages would leave voters unchanged without saying so.
  if (failed.length) throw new PdfReadError(`${unreadablePagesMessage(failed)} (${reason})`);
  return [...ids];
}

let worker: Worker | null = null;

/**
 * Loads pdf.js only when a PDF is chosen, so it stays out of the main bundle. The legacy build also works in
 * older phone browsers; the modern build fails there on every page.
 */
async function loadPdfJs(): Promise<PdfJsLike> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  if (!worker) {
    // Bundled by Vite as a plain .js file, so static hosting serves it with a JavaScript type.
    const { default: PdfWorker } = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?worker');
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
