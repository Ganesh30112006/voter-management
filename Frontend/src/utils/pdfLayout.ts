import { autoDetectMapping, IMPORT_FIELDS } from './importParser';

/** One run of text on a PDF page. x/y are in points from the page's top-left; y is the text baseline. */
export interface PdfTextItem {
  page: number;
  str: string;
  x: number;
  y: number;
  width: number;
  /** Font size in points. */
  size: number;
}

/** A voter read from an Election Commission electoral roll. */
export interface RollRecord {
  voterId: string;
  fullName: string;
  houseNumber: string;
}

export interface ElectoralRoll {
  records: RollRecord[];
  /** "Part No." printed on the roll, usually the polling booth number. */
  partNumber: number | null;
  /** Voter boxes whose EPIC number could not be read (they are left out). */
  unreadBoxes: number;
}

export type PdfLayout =
  | { kind: 'table'; rows: string[][] }
  | { kind: 'roll'; roll: ElectoralRoll }
  | { kind: 'no-text' }
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

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

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
  for (const item of items) {
    const text = clean(item.str);
    const last = out[out.length - 1];
    const gap = last ? item.x - last.x1 : Infinity;
    if (last && gap <= item.size * gapFactor) {
      // Some PDFs store every letter separately; only add a space where there is a visible gap.
      last.text += (gap > item.size * 0.15 ? ' ' : '') + text;
      last.x1 = Math.max(last.x1, item.x + item.width);
    } else {
      out.push({ text, x0: item.x, x1: item.x + item.width });
    }
  }
  return out;
}

const lineText = (items: PdfTextItem[]) => cells(items, 1.5).map((c) => c.text).join(' ');

function pages(items: PdfTextItem[]): PdfTextItem[][] {
  const byPage = new Map<number, PdfTextItem[]>();
  for (const i of items) {
    const list = byPage.get(i.page) ?? [];
    list.push(i);
    byPage.set(i.page, list);
  }
  return [...byPage.entries()].sort((a, b) => a[0] - b[0]).map(([, list]) => list);
}

/** A heading row names at least three import fields, including Voter ID or Name. */
function isHeaderRow(texts: string[]): boolean {
  const m = autoDetectMapping(texts);
  const found = IMPORT_FIELDS.filter((f) => m[f.key] !== -1).length;
  return found >= 3 && (m.voterId !== -1 || m.fullName !== -1);
}

/**
 * Reads a table: the first line whose cells are column headings sets the columns, and every later line
 * (on any page) becomes a row, with each text placed in the column its left edge falls under.
 */
export function readTable(items: PdfTextItem[]): string[][] | null {
  let columns: Cell[] | null = null;
  let headerKey = '';
  const rows: string[][] = [];
  let prev: { y: number; size: number; page: number } | null = null;

  pages(items).forEach((pageItems, pageIndex) => {
    for (const line of groupLines(pageItems)) {
      const lineCells = cells(line.items, 0.6);
      if (!columns) {
        if (isHeaderRow(lineCells.map((c) => c.text))) {
          columns = lineCells;
          headerKey = lineCells.map((c) => c.text.toLowerCase()).join('|');
          prev = null;
        }
        continue;
      }
      // Headings repeated at the top of later pages.
      if (lineCells.map((c) => c.text.toLowerCase()).join('|') === headerKey) {
        prev = null;
        continue;
      }
      const cols: Cell[] = columns;
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
      const last = rows[rows.length - 1];
      // A wrapped cell continues on a tight line underneath, with most columns empty.
      const continuation =
        last && prev && prev.page === pageIndex && filled < cols.length / 2 && line.y - prev.y <= line.size * 1.35;
      if (continuation) {
        row.forEach((v, i) => {
          if (v) last[i] = last[i] ? `${last[i]} ${v}` : v;
        });
      } else if (filled >= 2) {
        // Single texts (page numbers, footers) are not rows.
        rows.push(row);
      }
      prev = { y: line.y, size: line.size, page: pageIndex };
    }
  });

  const header = columns as Cell[] | null;
  return header ? [header.map((c) => c.text), ...rows] : null;
}

const EPIC = /\b([A-Z]{3}\d{7}|[A-Z]{2}\/\d{2}\/\d{2,3}\/\d{5,7})\b/;
const RELATION = /(father|husband|mother|wife|guardian|relative|other)'?s?\s*$/i;
const NAME_LABEL = /^(?:elector'?s\s+)?name\s*[:\-]?\s*(.*)$/i;
const HOUSE_LABEL = /\bhouse\s*(?:number|no\.?)\s*[:\-]?\s*(.*)$/i;

/** Left edges of the voter-box columns on a page, from where the "Name" labels start. */
function boxColumns(lines: Line[]): number[] {
  const xs: number[] = [];
  for (const line of lines) {
    line.items.forEach((item, i) => {
      const before = line.items[i - 1];
      const joinedToBefore = before && item.x - (before.x + before.width) < item.size;
      if (/^(?:elector'?s\s+)?name\b/i.test(clean(item.str)) && !(joinedToBefore && RELATION.test(clean(before.str)))) xs.push(item.x);
    });
  }
  xs.sort((a, b) => a - b);
  const columns: number[] = [];
  for (const x of xs) if (!columns.length || x - columns[columns.length - 1] > 50) columns.push(x);
  return columns;
}

/**
 * Reads the Election Commission roll layout: pages of voter boxes (usually three across), each with the
 * serial and EPIC number on top, then "Name", the relative's name, "House Number", age and gender.
 */
export function readElectoralRoll(items: PdfTextItem[]): ElectoralRoll {
  const records: RollRecord[] = [];
  let partNumber: number | null = null;
  let nameLabels = 0;

  for (const pageItems of pages(items)) {
    const onPage: { record: RollRecord; column: number; y: number; size: number }[] = [];
    const lines = groupLines(pageItems);
    if (partNumber === null) {
      const m = lines.map((l) => lineText(l.items)).join('\n').match(/part\s*(?:no\.?|number)\s*[:\-.]?\s*(\d+)/i);
      if (m) partNumber = Number(m[1]);
    }
    const columns = boxColumns(lines);
    if (!columns.length) continue; // cover and summary pages
    const tol = 10;
    for (let c = 0; c < columns.length; c++) {
      const left = c === 0 ? -Infinity : columns[c] - tol;
      const right = c + 1 < columns.length ? columns[c + 1] - tol : Infinity;
      const columnLines = groupLines(pageItems.filter((i) => i.x >= left && i.x < right));
      let current: RollRecord | null = null;
      for (const line of columnLines) {
        let text = lineText(line.items);
        const epic = text.match(EPIC);
        if (epic) {
          current = { voterId: epic[1], fullName: '', houseNumber: '' };
          onPage.push({ record: current, column: c, y: line.y, size: line.size });
          text = clean(text.replace(epic[0], ''));
        }
        const name = text.match(NAME_LABEL);
        if (name) {
          nameLabels++;
          if (current && !current.fullName) current.fullName = clean(name[1]);
          continue;
        }
        const house = text.match(HOUSE_LABEL);
        if (house && current && !current.houseNumber) current.houseNumber = clean(house[1].split(/\s+(?:age|gender|photo)\b/i)[0]);
      }
    }
    // Boxes in one row share their top line; read each row left to right, as the serial numbers run.
    onPage.sort((a, b) => (Math.abs(a.y - b.y) > Math.max(a.size, b.size) ? a.y - b.y : a.column - b.column));
    records.push(...onPage.map((r) => r.record));
  }
  return { records, partNumber, unreadBoxes: Math.max(0, nameLabels - records.length) };
}

export function readPdfLayout(items: PdfTextItem[]): PdfLayout {
  if (!items.some((i) => clean(i.str) !== '')) return { kind: 'no-text' };
  const table = readTable(items);
  if (table && table.length > 1) return { kind: 'table', rows: table };
  const roll = readElectoralRoll(items);
  if (roll.records.length) return { kind: 'roll', roll };
  return { kind: 'unknown' };
}

/** Sheet rows for a roll, with the ward, booth and status chosen for the whole file. */
export function rollRows(roll: ElectoralRoll, wardNumber: string, boothNumber: string, status: string): string[][] {
  return [
    ['Voter ID', 'Full Name', 'House Number', 'Ward Number', 'Booth Number', 'Status'],
    ...roll.records.map((r) => [r.voterId, r.fullName, r.houseNumber, wardNumber, boothNumber, status]),
  ];
}
