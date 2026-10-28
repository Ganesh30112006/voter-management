import { autoDetectMapping, IMPORT_FIELDS } from './importParser';
import { normalizeGender } from './validation';

/** One run of text on a PDF page. x/y are in points from the page's top-left; y is the text baseline. */
export interface PdfTextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  /** Font size in points. */
  size: number;
  /** Real spaces are part of the text (every glyph was matched), so none are added for gaps. */
  spaced?: boolean;
}

/** A voter read from an Election Commission electoral roll. */
export interface RollRecord {
  voterId: string;
  fullName: string;
  /** House / door number (ఇంటి సంఖ్య). */
  houseNumber: string;
  /** Age as printed (వయస్సు), '' when missing. */
  age: string;
  /** Gender as printed (లింగము: పు / స్త్రీ, or Male / Female), '' when missing. */
  gender: string;
  /** Serial number in the ward roll (వార్డు.ఓ.జా.వ.సం.. 19), '' when missing. */
  serialNumber: string;
}

export interface ElectoralRoll {
  records: RollRecord[];
  /** Voter boxes whose EPIC number could not be read (they are left out). */
  unreadBoxes: number;
}

/** `failedPages`: pages the browser could not read (an error, not a scan); they are skipped. */
export type PdfLayout =
  | { kind: 'table'; rows: string[][]; textlessPages: number[]; failedPages: number[] }
  | { kind: 'roll'; roll: ElectoralRoll; textlessPages: number[]; failedPages: number[] }
  | { kind: 'no-text' }
  | { kind: 'read-error'; reason: string }
  | { kind: 'unknown' };

interface Line {
  y: number;
  size: number;
  items: PdfTextItem[];
}

interface Cell {
  text: string;
  x0: number;
  x1: number;
}

/**
 * Some roll fonts have Telugu letters (conjuncts such as స్త్రీ, స్సు) with no text mapping: pdf.js gives a NUL
 * (or U+FFFD) for them. Those characters are dropped from the values; the database refuses NUL.
 */
const UNREADABLE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\ufffd]/g;
const clean = (s: string) => s.replace(UNREADABLE, '').replace(/\s+/g, ' ').trim();

/** Groups a page's items into lines (top to bottom), each sorted left to right. */
export function groupLines(items: PdfTextItem[]): Line[] {
  const sorted = items.filter((i) => clean(i.str) !== '').sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: Line[] = [];
  for (const item of sorted) {
    const line = lines[lines.length - 1];
    if (line && Math.abs(item.y - line.y) <= Math.max(line.size, item.size) * 0.5) {
      line.items.push(item);
      line.size = Math.max(line.size, item.size);
    } else {
      lines.push({ y: item.y, size: item.size, items: [item] });
    }
  }
  for (const line of lines) line.items.sort((a, b) => a.x - b.x);
  return lines;
}

/** Joins items that are closer than `gapFactor` x font size into cells. */
function cells(items: PdfTextItem[], gapFactor: number): Cell[] {
  const out: Cell[] = [];
  let prev = '';
  for (const item of items) {
    const text = clean(item.str);
    const last = out[out.length - 1];
    const gap = last ? item.x - last.x1 : Infinity;
    if (last && gap <= item.size * gapFactor) {
      // Some PDFs store every letter separately; only add a space where there is a visible gap. When the
      // spaces are part of the text, use those.
      const space = item.spaced ? /^\s/.test(item.str) || /\s$/.test(prev) || gap > item.size : gap > item.size * 0.15;
      last.text += (space ? ' ' : '') + text;
      last.x1 = Math.max(last.x1, item.x + item.width);
    } else {
      out.push({ text, x0: item.x, x1: item.x + item.width });
    }
    prev = item.str;
  }
  return out;
}

const lineText = (items: PdfTextItem[]) => cells(items, 1.5).map((c) => c.text).join(' ');

/** A heading row names at least three import fields, including Voter ID or Name. */
function isHeaderRow(texts: string[]): boolean {
  const m = autoDetectMapping(texts);
  const found = IMPORT_FIELDS.filter((f) => m[f.key] !== -1).length;
  return found >= 3 && (m.voterId !== -1 || m.fullName !== -1);
}

/**
 * Table layout: the first line whose cells are column headings sets the columns, and every later line
 * (on any page) becomes a row, with each text placed in the column its left edge falls under.
 */
class TableReader {
  private columns: Cell[] | null = null;
  private headerKey = '';
  private prev: { y: number; size: number; page: number } | null = null;
  readonly rows: string[][] = [];

  addPage(page: number, lines: Line[]): void {
    for (const line of lines) {
      const lineCells = cells(line.items, 0.6);
      if (!this.columns) {
        if (isHeaderRow(lineCells.map((c) => c.text))) {
          this.columns = lineCells;
          this.headerKey = lineCells.map((c) => c.text.toLowerCase()).join('|');
          this.prev = null;
        }
        continue;
      }
      // Headings repeated at the top of later pages.
      if (lineCells.map((c) => c.text.toLowerCase()).join('|') === this.headerKey) {
        this.prev = null;
        continue;
      }
      const cols = this.columns;
      // Column i starts halfway between heading i-1's end and heading i's start.
      const starts = cols.map((c, i) => (i === 0 ? -Infinity : (cols[i - 1].x1 + c.x0) / 2));
      const values = cols.map(() => [] as PdfTextItem[]);
      for (const item of line.items) {
        let col = 0;
        while (col + 1 < starts.length && item.x >= starts[col + 1]) col++;
        values[col].push(item);
      }
      const row = values.map(lineText);
      const filled = row.filter((v) => v !== '').length;
      const last = this.rows[this.rows.length - 1];
      // A wrapped cell continues on a tight line underneath, with most columns empty.
      const continuation =
        last && this.prev && this.prev.page === page && filled < cols.length / 2 && line.y - this.prev.y <= line.size * 1.35;
      if (continuation) {
        row.forEach((v, i) => {
          if (v) last[i] = last[i] ? `${last[i]} ${v}` : v;
        });
      } else if (filled >= 2) {
        // Single texts (page numbers, footers) are not rows.
        this.rows.push(row);
      }
      this.prev = { y: line.y, size: line.size, page };
    }
  }

  result(): string[][] | null {
    return this.columns && this.rows.length ? [this.columns.map((c) => c.text), ...this.rows] : null;
  }
}

// The digits may come out split ("NDX270831 1"), so a single space between them is allowed and removed.
const EPIC = /\b([A-Z]{3}(?: ?\d){7}(?!\d)|[A-Z]{2}\/\d{2}\/\d{2,3}\/\d{5,7}\b)/;
const epicValue = (m: string) => m.replace(/ /g, '');

/** EPIC (voter ID card) numbers in a text, e.g. NDX3549268 or AP/12/123/456789. */
export function voterIdsInText(text: string): string[] {
  return [...text.matchAll(new RegExp(EPIC.source, 'g'))].map((m) => epicValue(m[1]));
}

/** A page's text, line by line (pieces of one line joined as they appear). */
export function pageText(items: PdfTextItem[]): string {
  return withoutPrintMargins(groupLines(items))
    .map((l) => lineText(l.items))
    .join('\n');
}

/** Text with spaces and zero-width joiners removed, for matching labels (Telugu labels often split oddly). */
const compact = (s: string) => s.normalize('NFC').replace(/[\s\u200b-\u200d]/g, '').toLowerCase();

/** The voter's own name label: English "Name" / "Elector's Name" (not Father's Name etc.) or Telugu "ఓటరు పేరు". */
function isNameLabel(text: string): boolean {
  const c = compact(text);
  return c.startsWith('ఓటరుపేరు') || /^(?:elector'?s)?name(?![a-z])/.test(c);
}
/** House / door number label: English "House Number" / "House No." or Telugu "ఇంటి సంఖ్య" (also extracted as "ఇంటి సంఖ"). */
const isHouseLabel = (text: string) => /^house(number|no)/.test(compact(text)) || compact(text).startsWith('ఇంటిసంఖ');

// Telugu labels may come out split by spaces or with unreadable letters ("వయ సు\0", "లి ం గము").
// The age is the first number after the label on its line (a wrapped name may sit between them).
const AGE = /(?:\bage|వయ)[^\d\n]{0,40}?(\d{1,3})/i;
const GENDER = /(\bgender|\bsex|లి\s*ం\s*గ\s*(?:ము|ం))\s*:?\s*([^\s:]*)/i;

/**
 * Gender value from a box (the word after the label, which may sit on the next line). In Telugu rolls whose
 * font cannot map స్త్రీ, no gender word follows "లింగము :" (unreadable letters are dropped), while male (పు)
 * reads fine; such a box is taken as Female.
 */
function genderValue(boxText: string): string {
  const m = boxText.match(GENDER);
  if (!m) return '';
  const value = clean(m[2]);
  if (value && normalizeGender(value)) return value;
  return /^[a-z]/i.test(m[1]) ? '' : 'స్త్రీ';
}

/** "Photo Not Available" / "Photo" printed in a voter's photo frame: part of the picture area, not voter data. */
const PHOTO_TEXT = /\bphoto\b(?:\s*(?:is\s*)?(?:not\s*)?a\s*v\s*a\s*i\s*l\s*a\s*b\s*l\s*e\b)?|\bnot\s*a\s*v\s*a\s*i\s*l\s*a\s*b\s*l\s*e\b/gi;

const NAME_LABEL = /^\s*(?:(?:elector'?s\s+)?name|ఓ\s*ట\s*రు\s*పే\s*రు)/i;
const HOUSE_LABEL = /^\s*(?:house\s*(?:number|no\.?)|ఇం\s*టి\s*సం\s*ఖ?\S*)/i;

interface BoxLine {
  y: number;
  line: Line;
  text: string;
  /** A line with no label of its own: the wrapped part of a value (the label sits beside another line). */
  valueOnly: boolean;
}

/**
 * The value of a field in a box. A long value wraps onto two lines with its label printed between them (or
 * beside one of them), so lines without a label of their own are joined to the nearest label line.
 */
function fieldValue(rows: BoxLine[], isLabel: (text: string) => boolean, label: RegExp, colonX: number | null): string {
  const own = rows.find((r) => !r.valueOnly && isLabel(r.text));
  if (!own) return '';
  const labels = rows.filter((r) => !r.valueOnly);
  const parts: { y: number; value: string }[] = [];
  const i = own.text.indexOf(':');
  const ownValue =
    i >= 0
      ? own.text.slice(i + 1)
      : colonX !== null
        ? lineText(own.line.items.filter((it) => it.x >= colonX - 2))
        : own.text.replace(label, '');
  parts.push({ y: own.y, value: ownValue });
  for (const r of rows) {
    if (!r.valueOnly || EPIC.test(r.text) || GENDER.test(r.text)) continue;
    const nearest = labels.reduce((a, b) => (Math.abs(b.y - r.y) < Math.abs(a.y - r.y) ? b : a));
    if (nearest === own) parts.push({ y: r.y, value: r.text.replace(/^:/, '') });
  }
  return clean(
    parts
      .sort((a, b) => a.y - b.y)
      .map((p) => p.value.replace(PHOTO_TEXT, ' '))
      .join(' '),
  );
}

/** Reads one voter box; null when it has no EPIC number. */
function readBox(box: Line[]): RollRecord | null {
  const colonXs = box.flatMap((l) => l.items.filter((i) => clean(i.str).startsWith(':')).map((i) => i.x));
  const colonX = colonXs.length >= 2 ? median(colonXs) : null;
  const rows: BoxLine[] = [];
  for (const line of box) {
    const text = clean(lineText(line.items).replace(PHOTO_TEXT, ' '));
    if (!text) continue;
    const first = line.items.find((i) => clean(i.str) !== '');
    rows.push({ y: line.y, line, text, valueOnly: text.startsWith(':') || (colonX !== null && !!first && first.x >= colonX - 2) });
  }
  const all = rows.map((r) => r.text).join('\n');
  const epic = all.match(EPIC);
  if (!epic) return null;
  // The serial line is above the voter's name (the next box's may follow below it).
  const nameRow = rows.findIndex((r) => !r.valueOnly && isNameLabel(r.text));
  const above = rows.slice(0, Math.max(nameRow, 0)).map((r) => r.text);
  const boxText = all.normalize('NFC').replace(/[\u200b-\u200d]/g, '');
  return {
    voterId: epicValue(epic[1]),
    fullName: fieldValue(rows, isNameLabel, NAME_LABEL, colonX),
    houseNumber: fieldValue(rows, isHouseLabel, HOUSE_LABEL, colonX).split(/\s+(?:age|gender)\b/i)[0],
    age: boxText.match(AGE)?.[1] ?? '',
    gender: genderValue(boxText),
    serialNumber: serialNumberIn(above, !/ఓటరు/.test(all)),
  };
}

// "వార్డు.ఓ.జా.వ.సం.. 19 అ.ఓ.జా.వ.సం.94 - 194 - 264": the first number after "వ.సం" is the ward roll serial
// number (the second is the assembly reference, not used).
const SERIAL = /వ\s*\.?\s*సం[\s.]*?(\d{1,6})(?!\d)/;

/** The roll serial number in a box's lines above the name: the Telugu label, or (English rolls only) a leading number. */
function serialNumberIn(texts: string[], english = false): string {
  for (const t of texts) {
    const m = t.match(SERIAL);
    if (m) return String(Number(m[1]));
  }
  if (!english) return '';
  const lead = texts[0]?.match(/^(\d{1,6})(?=\s|$)/);
  return lead ? String(Number(lead[1])) : '';
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

/** Left edges of the voter-box columns on a page, from where the voter-name labels start. */
function boxColumns(lines: Line[]): number[] {
  const xs: number[] = [];
  for (const line of lines) for (const cell of cells(line.items, 1)) if (isNameLabel(cell.text)) xs.push(cell.x0);
  xs.sort((a, b) => a - b);
  const columns: number[] = [];
  for (const x of xs) if (!columns.length || x - columns[columns.length - 1] > 50) columns.push(x);
  return columns;
}

/**
 * Splits one column of a roll page into voter boxes. A box starts on the line just above its voter-name
 * line (the serial line in both the English and the Telugu layouts) and runs until the next box starts.
 */
function columnBoxes(lines: Line[]): Line[][] {
  const anchors = lines.map((l, i) => (cells(l.items, 1).some((c) => isNameLabel(c.text)) ? i : -1)).filter((i) => i >= 0);
  if (!anchors.length) return [];
  const spacing = median(lines.slice(1).map((l, i) => l.y - lines[i].y).filter((d) => d > 0)) || 12;
  const starts = anchors.map((a) => (a > 0 && !anchors.includes(a - 1) && lines[a].y - lines[a - 1].y <= spacing * 1.6 ? a - 1 : a));
  return starts.map((start, k) => {
    let end = k + 1 < starts.length ? starts[k + 1] : lines.length;
    // The last box on a column ends at a wide gap (a footer may follow).
    if (k + 1 === starts.length) {
      for (let j = anchors[k] + 1; j < end; j++) {
        if (lines[j].y - lines[j - 1].y > spacing * 2.5) {
          end = j;
          break;
        }
      }
    }
    return lines.slice(start, end);
  });
}

/**
 * Election Commission roll layouts (English and Telugu): pages of voter boxes, usually three across. Each box
 * holds a serial line, the voter's name, the relative's name, age/gender, house / door number and the EPIC
 * number (at the top in the English layout, at the bottom in the Telugu ward rolls). Fields are found by their
 * labels, so their order inside the box does not matter. Other numbers in the box (serials, the assembly
 * reference such as "94 - 195 - 210") are not used.
 */
class RollReader {
  readonly records: RollRecord[] = [];
  private boxes = 0;

  addPage(items: PdfTextItem[], lines: Line[]): void {
    const columns = boxColumns(lines);
    if (!columns.length) return; // cover and summary pages
    const onPage: { record: RollRecord; column: number; y: number; size: number }[] = [];
    const tol = 10;
    for (let c = 0; c < columns.length; c++) {
      const left = c === 0 ? -Infinity : columns[c] - tol;
      const right = c + 1 < columns.length ? columns[c + 1] - tol : Infinity;
      const columnLines = groupLines(items.filter((i) => i.x >= left && i.x < right));
      for (const box of columnBoxes(columnLines)) {
        this.boxes++;
        const record = readBox(box);
        if (!record) continue;
        if (!record.serialNumber) {
          // A box whose name wraps starts on its first name line; its serial line is just above it.
          const at = columnLines.indexOf(box[0]);
          const before = columnLines.slice(Math.max(0, at - 2), at).map((l) => lineText(l.items));
          record.serialNumber = serialNumberIn(before.filter((t) => SERIAL.test(t)).slice(-1));
        }
        onPage.push({
          record,
          column: c,
          y: box[0].y,
          size: box[0].size,
        });
      }
    }
    // Boxes in one row share their top line; read each row left to right, as the serial numbers run.
    onPage.sort((a, b) => (Math.abs(a.y - b.y) > Math.max(a.size, b.size) ? a.y - b.y : a.column - b.column));
    for (const r of onPage) this.records.push(r.record);
  }

  result(): ElectoralRoll | null {
    if (!this.records.length) return null;
    return { records: this.records, unreadBoxes: this.boxes - this.records.length };
  }
}

/**
 * A web address such as "https://sec-ems.ap.gov.in/apsec/..." or "sec-ems.ap.gov.in/apsec/...". The name must
 * end in letters (".in/"), so door numbers such as "D.NO.26-39-6/2A" are not taken for one.
 */
const WEB_ADDRESS = /https?:\/\/|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}\/\S/i;
/** A line that is only a print date/time and/or a "64/101" page counter. */
const PRINT_STAMP = /^(?:\d{1,2}\/\d{1,2}\/\d{2,4},?\s*\d{1,2}:\d{2}(?:\s*[AP]M)?|\d{1,4}\s*\/\s*\d{1,4}|\s)+$/i;

/**
 * Browsers print the page address, date/time and "page x/y" in the margins of a saved PDF. Those lines are
 * not voter data, so they are left out before reading.
 */
function isPrintMargin(line: Line): boolean {
  const text = lineText(line.items);
  return WEB_ADDRESS.test(text) || PRINT_STAMP.test(text);
}

/** Drops print margins, which are only ever the top two and bottom two lines of a page. */
function withoutPrintMargins(lines: Line[]): Line[] {
  return lines.filter((l, i) => !((i < 2 || i >= lines.length - 2) && isPrintMargin(l)));
}

/**
 * Reads a PDF one page at a time and keeps only what it finds (table rows or roll voters), so very large
 * files do not need all their text in memory. Both layouts are tried on every page.
 */
export class PdfLayoutReader {
  private readonly table = new TableReader();
  private readonly roll = new RollReader();
  private readonly textless: number[] = [];
  private readonly failed: number[] = [];
  private failReason = '';
  private pages = 0;

  /** A page whose text could not be read (pdf.js error). */
  pageFailed(page: number, reason: string): void {
    this.pages++;
    this.failed.push(page);
    this.failReason ||= reason;
  }

  addPage(page: number, items: PdfTextItem[]): void {
    this.pages++;
    const all = groupLines(items);
    if (!all.length) {
      this.textless.push(page);
      return;
    }
    const lines = withoutPrintMargins(all);
    const kept = new Set(lines.flatMap((l) => l.items));
    this.table.addPage(page, lines);
    this.roll.addPage(
      items.filter((i) => kept.has(i)),
      lines,
    );
  }

  finish(): PdfLayout {
    const pages = { textlessPages: this.textless, failedPages: this.failed };
    const rows = this.table.result();
    if (rows) return { kind: 'table', rows, ...pages };
    const roll = this.roll.result();
    if (roll) return { kind: 'roll', roll, ...pages };
    if (this.failed.length) return { kind: 'read-error', reason: this.failReason };
    if (this.textless.length === this.pages) return { kind: 'no-text' };
    return { kind: 'unknown' };
  }
}

/** Reads already-extracted pages (index 0 = page 1). */
export function readPdfLayout(pages: PdfTextItem[][]): PdfLayout {
  const reader = new PdfLayoutReader();
  pages.forEach((items, i) => reader.addPage(i + 1, items));
  return reader.finish();
}

/** Sheet rows for a roll, with the ward, (optional) booth and status chosen for the whole file. */
export function rollRows(roll: ElectoralRoll, wardNumber: string, boothNumber: string, status: string): string[][] {
  return [
    ['Voter ID', 'Full Name', 'House / Door Number', 'Ward Number', 'Booth Number', 'Status', 'Age', 'Gender', 'Serial No.'],
    ...roll.records.map((r) => [r.voterId, r.fullName, r.houseNumber, wardNumber, boothNumber, status, r.age, r.gender, r.serialNumber]),
  ];
}

/** Message for pages the browser could not read. */
export function unreadablePagesMessage(pages: number[]): string {
  return `${pages.length === 1 ? 'Page' : 'Pages'} ${pageRanges(pages)} of this PDF could not be read in this browser`;
}

/** Compact page list for messages: [3, 4, 5, 9] -> "3–5, 9". */
export function pageRanges(pages: number[]): string {
  const out: string[] = [];
  for (let i = 0; i < pages.length; i++) {
    let j = i;
    while (j + 1 < pages.length && pages[j + 1] === pages[j] + 1) j++;
    out.push(i === j ? String(pages[i]) : `${pages[i]}–${pages[j]}`);
    i = j;
  }
  return out.join(', ');
}
