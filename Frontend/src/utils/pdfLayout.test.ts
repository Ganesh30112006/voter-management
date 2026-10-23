import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, it } from 'vitest';
import { pdfTextItems } from '../services/pdfReader';
import { autoDetectMapping, extractRows, findHeaderRow, mappingErrors, validateRows } from './importParser';
import { readPdfLayout, rollRows, type PdfTextItem } from './pdfLayout';

/** Text placed at (x, top) in points, top measured from the page's top edge. */
type Text = [x: number, top: number, text: string, size?: number];

/** Builds a minimal PDF with Helvetica text, one entry per page. */
function makePdf(pages: Text[][], width = 842, height = 595): Uint8Array {
  const objects: string[] = [];
  const add = (body: string) => objects.push(body) - 1 + 1;
  const esc = (t: string) => t.replace(/[\\()]/g, (c) => `\\${c}`);
  add('<< /Type /Catalog /Pages 2 0 R >>');
  add(''); // pages, filled in below
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const kids: number[] = [];
  for (const texts of pages) {
    const stream = texts.map(([x, top, text, size = 8]) => `BT /F1 ${size} Tf ${x} ${height - top} Td (${esc(text)}) Tj ET`).join('\n');
    const content = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${content} 0 R >>`));
  }
  objects[1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}

async function layoutOf(pdf: Uint8Array) {
  const doc = await getDocument({ data: pdf, isEvalSupported: false, verbosity: 0 }).promise;
  try {
    return readPdfLayout(await pdfTextItems(doc));
  } finally {
    await doc.destroy();
  }
}

const HEADERS = ['Voter ID', 'Full Name', 'Mobile Number', 'Ward Number', 'Booth Number', 'House Number', 'Household ID', 'Address', 'Status'];
const COL_X = [20, 105, 190, 275, 360, 445, 530, 615, 760];
const row = (top: number, values: string[]): Text[] =>
  values.flatMap((v, i) => (v ? [[COL_X[i], top, v, 7] as Text] : []));

describe('PDF tables', () => {
  it('reads a typed table across pages: title, wrapped cells, repeated headings and footers', async () => {
    const pdf = makePdf([
      [
        [20, 30, 'Voter list - Ward 1', 12],
        ...row(60, HEADERS),
        ...row(80, ['0001234', 'Ravi Kumar', '9876543210', '1', '11', '12-A', 'HH-01', '12 Main Road,', 'Active']),
        ...row(88.4, ['', '', '', '', '', '', '', 'Near Temple', '']),
        ...row(105, ['ABC1234567', 'Sita Devi', '', 'Ward 1', 'Booth 12', '4', '', '', 'Not Active']),
        [400, 570, 'Page 1 of 2', 7],
      ],
      [...row(40, HEADERS), ...row(60, ['V-3', 'Anil', '', '2', '21', '7', '', '', 'Shifted']), [400, 570, 'Page 2 of 2', 7]],
    ]);
    const layout = await layoutOf(pdf);
    expect(layout.kind).toBe('table');
    if (layout.kind !== 'table') return;
    expect(layout.rows[0]).toEqual(HEADERS);
    expect(layout.rows.slice(1)).toEqual([
      ['0001234', 'Ravi Kumar', '9876543210', '1', '11', '12-A', 'HH-01', '12 Main Road, Near Temple', 'Active'],
      ['ABC1234567', 'Sita Devi', '', 'Ward 1', 'Booth 12', '4', '', '', 'Not Active'],
      ['V-3', 'Anil', '', '2', '21', '7', '', '', 'Shifted'],
    ]);
    // The rows go through the normal mapping and checks.
    const mapping = autoDetectMapping(layout.rows[0]);
    expect(mappingErrors(mapping)).toEqual([]);
    const checked = validateRows(extractRows(layout.rows.slice(1), mapping, 1), {
      wards: [
        { id: 'W1', number: 1, name: 'One' },
        { id: 'W2', number: 2, name: 'Two' },
      ],
      booths: [
        { id: 'B11', wardId: 'W1', number: 11, name: '' },
        { id: 'B12', wardId: 'W1', number: 12, name: '' },
        { id: 'B21', wardId: 'W2', number: 21, name: '' },
      ],
      existingVoterIds: new Set(),
      existingHouseholds: new Map(),
    });
    expect(checked.map((r) => r.category)).toEqual(['valid', 'valid', 'valid']);
    expect(checked[0].voter).toMatchObject({ voterId: '0001234', boothId: 'B11', address: '12 Main Road, Near Temple' });
  });

  it('joins letters that a PDF stores one by one', () => {
    const items: PdfTextItem[] = [];
    const put = (x: number, y: number, text: string) =>
      [...text].forEach((ch, i) => items.push({ page: 1, str: ch, x: x + i * 5, y, width: 5, size: 9 }));
    ['Voter ID', 'Name', 'Ward', 'Booth', 'House No', 'Status'].forEach((h, i) => put(20 + i * 90, 50, h));
    ['V1', 'Ravi', '1', '11', '2', 'Active'].forEach((v, i) => put(20 + i * 90, 70, v));
    const layout = readPdfLayout(items);
    expect(layout).toEqual({
      kind: 'table',
      rows: [
        ['Voter ID', 'Name', 'Ward', 'Booth', 'House No', 'Status'],
        ['V1', 'Ravi', '1', '11', '2', 'Active'],
      ],
    });
  });
});

describe('Election Commission rolls', () => {
  // Three voter boxes across, two rows; the last box has no EPIC number.
  const box = (x: number, top: number, serial: number, epic: string, name: string, house: string): Text[] => [
    [x, top, String(serial)],
    ...(epic ? [[x + 110, top, epic] as Text] : []),
    [x, top + 15, 'Name :'],
    [x + 45, top + 15, name],
    [x, top + 28, "Father's"],
    [x + 31, top + 28, 'Name :'],
    [x + 60, top + 28, 'SOMEONE'],
    [x, top + 41, `House Number : ${house}`],
    [x, top + 54, 'Age : 45'],
    [x + 60, top + 54, 'Gender : Male'],
  ];

  it('reads EPIC, name and house number from each box', async () => {
    const pdf = makePdf(
      [
        [[30, 40, 'ELECTORAL ROLL 2026 - Cover page', 12]],
        [
          [30, 40, 'Assembly Constituency No and Name : 123-Sample'],
          [420, 40, 'Part No. : 41'],
          ...box(30, 100, 1, 'ABC1234561', 'RAMESH KUMAR', '12-3/A'),
          ...box(220, 100, 2, 'ABC1234562', 'SITA DEVI', '12-4'),
          ...box(410, 100, 3, 'AP/12/123/456789', 'ANIL', '7'),
          ...box(30, 200, 4, 'XYZ7654321', 'LAKSHMI', '8'),
          ...box(220, 200, 5, 'XYZ7654322', 'GOPAL', '9'),
          ...box(410, 200, 6, '', 'NO EPIC PERSON', '10'),
        ],
      ],
      595,
      842,
    );
    const layout = await layoutOf(pdf);
    expect(layout.kind).toBe('roll');
    if (layout.kind !== 'roll') return;
    expect(layout.roll.partNumber).toBe(41);
    expect(layout.roll.unreadBoxes).toBe(1);
    expect(layout.roll.records).toEqual(
      expect.arrayContaining([
        { voterId: 'ABC1234561', fullName: 'RAMESH KUMAR', houseNumber: '12-3/A' },
        { voterId: 'ABC1234562', fullName: 'SITA DEVI', houseNumber: '12-4' },
        { voterId: 'AP/12/123/456789', fullName: 'ANIL', houseNumber: '7' },
        { voterId: 'XYZ7654321', fullName: 'LAKSHMI', houseNumber: '8' },
        { voterId: 'XYZ7654322', fullName: 'GOPAL', houseNumber: '9' },
      ]),
    );
    expect(layout.roll.records.map((r) => r.voterId)).toEqual(['ABC1234561', 'ABC1234562', 'AP/12/123/456789', 'XYZ7654321', 'XYZ7654322']);
    const rows = rollRows(layout.roll, '4', '41', 'Active');
    expect(mappingErrors(autoDetectMapping(rows[0]))).toEqual([]);
    expect(rows[1].slice(3)).toEqual(['4', '41', 'Active']);
  });
});

describe('other PDFs', () => {
  it('reports a PDF without text (scanned) and one without a voter table', async () => {
    expect(await layoutOf(makePdf([[]]))).toEqual({ kind: 'no-text' });
    expect(await layoutOf(makePdf([[[20, 40, 'Semester results'], [20, 60, 'Roll 12 Pass']]]))).toEqual({ kind: 'unknown' });
  });
});

describe('heading row', () => {
  it('finds headings below title rows', () => {
    expect(findHeaderRow([['Voter list'], ['Ward 3', ''], ['Voter ID', 'Name', 'Ward', 'Booth'], ['V1', 'A', '3', '31']])).toBe(2);
    expect(findHeaderRow([['V1', 'A'], ['V2', 'B']])).toBe(0);
  });
});
