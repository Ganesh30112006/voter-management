import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, it } from 'vitest';
import { readPdfLayoutFromFile, readPdfVoterIdsFromFile, type PdfJsLike } from '../services/pdfReader';
import { autoDetectMapping, extractRows, findHeaderRow, mappingErrors, validateRows } from './importParser';
import { pageRanges, readPdfLayout, rollRows, voterIdsInText, type PdfTextItem } from './pdfLayout';

/** Text placed at (x, top) in points, top measured from the page's top edge; `rotated` draws it at 45°. */
type Text = [x: number, top: number, text: string, size?: number, rotated?: boolean];

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
    const stream = texts
      .map(([x, top, text, size = 8, rotated]) =>
        rotated
          ? `BT /F1 ${size} Tf 0.7071 0.7071 -0.7071 0.7071 ${x} ${height - top} Tm (${esc(text)}) Tj ET`
          : `BT /F1 ${size} Tf ${x} ${height - top} Td (${esc(text)}) Tj ET`,
      )
      .join('\n');
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

/** Reads the PDF as a file, in byte ranges, exactly as the browser does. */
function layoutOf(pdf: Uint8Array, onProgress?: (page: number, pages: number) => void) {
  return readPdfLayoutFromFile(pdfjs as unknown as PdfJsLike, new Blob([pdf]), onProgress);
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
    expect(layout.textlessPages).toEqual([]);
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
      [...text].forEach((ch, i) => items.push({ str: ch, x: x + i * 5, y, width: 5, size: 9 }));
    ['Voter ID', 'Name', 'Ward', 'Booth', 'House No', 'Status'].forEach((h, i) => put(20 + i * 90, 50, h));
    ['V1', 'Ravi', '1', '11', '2', 'Active'].forEach((v, i) => put(20 + i * 90, 70, v));
    const layout = readPdfLayout([items]);
    expect(layout).toEqual({
      kind: 'table',
      rows: [
        ['Voter ID', 'Name', 'Ward', 'Booth', 'House No', 'Status'],
        ['V1', 'Ravi', '1', '11', '2', 'Active'],
      ],
      textlessPages: [],
      failedPages: [],
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
          // Diagonal watermark across the boxes: rotated text is ignored.
          [150, 260, 'ANDHRA PRADESH', 40, true],
        ],
      ],
      595,
      842,
    );
    const layout = await layoutOf(pdf);
    expect(layout.kind).toBe('roll');
    if (layout.kind !== 'roll') return;
    expect(layout.roll.unreadBoxes).toBe(1);
    expect(layout.roll.records).toEqual(
      expect.arrayContaining([
        { voterId: 'ABC1234561', fullName: 'RAMESH KUMAR', houseNumber: '12-3/A', age: '45', gender: 'Male', serialNumber: '1' },
        { voterId: 'ABC1234562', fullName: 'SITA DEVI', houseNumber: '12-4', age: '45', gender: 'Male', serialNumber: '2' },
        { voterId: 'AP/12/123/456789', fullName: 'ANIL', houseNumber: '7', age: '45', gender: 'Male', serialNumber: '3' },
        { voterId: 'XYZ7654321', fullName: 'LAKSHMI', houseNumber: '8', age: '45', gender: 'Male', serialNumber: '4' },
        { voterId: 'XYZ7654322', fullName: 'GOPAL', houseNumber: '9', age: '45', gender: 'Male', serialNumber: '5' },
      ]),
    );
    expect(layout.roll.records.map((r) => r.voterId)).toEqual(['ABC1234561', 'ABC1234562', 'AP/12/123/456789', 'XYZ7654321', 'XYZ7654322']);
    const rows = rollRows(layout.roll, '4', '', 'Active');
    expect(mappingErrors(autoDetectMapping(rows[0]))).toEqual([]);
    expect(rows[1].slice(3)).toEqual(['4', '', 'Active', '45', 'Male', '1']);
    expect(autoDetectMapping(rows[0]).serialNumber).toBe(8);
  });

  it('lists scanned pages that were skipped', async () => {
    const pdf = makePdf([[...box(30, 100, 1, 'AAA0000001', 'ONE', '1')], [], [...box(30, 100, 2, 'AAA0000002', 'TWO', '2')], [], []], 595, 842);
    const seen: number[] = [];
    const layout = await layoutOf(pdf, (page) => seen.push(page));
    expect(seen).toEqual([1, 2, 3, 4, 5]);
    expect(layout.kind).toBe('roll');
    if (layout.kind !== 'roll') return;
    expect(layout.textlessPages).toEqual([2, 4, 5]);
    expect(pageRanges(layout.textlessPages)).toBe('2, 4–5');
    expect(layout.roll.records.map((r) => r.voterId)).toEqual(['AAA0000001', 'AAA0000002']);
  });

  it('reads the Telugu ward roll: labels in Telugu, EPIC at the bottom of each box', () => {
    // Same layout as the Andhra Pradesh ward rolls: three boxes across, fields found by their Telugu labels.
    const item = (x: number, y: number, str: string): PdfTextItem => ({ str, x, y, width: str.length * 4, size: 8 });
    const teluguBox = (
      x: number,
      top: number,
      serial: string,
      ref: string,
      name: string,
      relation: string,
      house: string,
      epic: string,
      houseLabel = 'ఇంటి సంఖ్య',
      age = '43',
      gender = 'పు',
    ) => [
      item(x, top, 'వార్డు.ఓ.జా.వ.సం..'),
      item(x + 75, top, serial),
      item(x + 165, top, `అ.ఓ.జా.వ.సం.${ref}`),
      item(x, top + 18, 'ఓటరు పేరు'),
      item(x + 70, top + 18, `: ${name}`),
      item(x, top + 36, relation),
      item(x + 70, top + 36, ': సయ్యద్'),
      item(x, top + 54, 'వయస్సు'),
      item(x + 70, top + 54, `: ${age}`),
      item(x + 120, top + 54, 'లింగము :'),
      item(x + 175, top + 54, gender),
      item(x, top + 72, houseLabel),
      item(x + 70, top + 72, `: ${house}`),
      item(x, top + 90, 'ఓటరు ఐడి. కార్డు నెం. :'),
      ...(epic ? [item(x + 95, top + 90, epic)] : []),
    ];
    const page = [
      // Margins a browser prints when the roll page is saved as PDF.
      item(5, -40, '21/09/2026, 18:37'),
      item(170, -40, 'sec-ems.ap.gov.in/apsec/getULGWiseTeluguVotersListSlnoWiseWithoutAc?election_id=NDE%3D&district_id=NTA2&ulg_code=Mj...'),
      ...teluguBox(5, 16, '163', '94 - 194 - 529', 'హిదాయతుల్లా సయ్యద్', 'తండ్రి పేరు', '92-25-1949', 'NDX3549268'),
      ...teluguBox(285, 16, '164', '94 - 194 - 530', 'అస్మ సయ్యద్', 'భర్త పేరు', '92-25-1949', 'NDX3549250', 'ఇంటి సంఖ్య', '30', 'స్త్రీ'),
      ...teluguBox(565, 16, '165', '94 - 194 - 531', 'అశ్రుఫున పఠాన్', 'భర్త పేరు', '92-25-1975', 'NDX3230158'),
      ...teluguBox(5, 127, '166', '94 - 194 - 532', 'అనీల్ దండిభొట్ల', 'తండ్రి పేరు', '92-25-2044', 'SOT0898421'),
      ...teluguBox(285, 127, '167', '94 - 195 - 210', 'శల్మా షేక్', 'భర్త పేరు', '92-23-188', 'NDX2529600', 'ఇంటి సంఖ'),
      ...teluguBox(565, 127, '168', '94 - 194 - 534', 'చదవలేని పెట్టె', 'భర్త పేరు', '92-25-2134', ''),
      item(50, 320, 'https://sec-ems.ap.gov.in/apsec/getULGWiseTeluguVotersListSlnoWiseWithoutAc?election_id=NDE%3D&district_id=NTA2&ulg_code=MjUxNzU3&...'),
      item(730, 320, '64/101'),
    ];
    const layout = readPdfLayout([page]);
    expect(layout.kind).toBe('roll');
    if (layout.kind !== 'roll') return;
    expect(layout.roll.records).toEqual([
      { voterId: 'NDX3549268', fullName: 'హిదాయతుల్లా సయ్యద్', houseNumber: '92-25-1949', age: '43', gender: 'పు', serialNumber: '163' },
      { voterId: 'NDX3549250', fullName: 'అస్మ సయ్యద్', houseNumber: '92-25-1949', age: '30', gender: 'స్త్రీ', serialNumber: '164' },
      { voterId: 'NDX3230158', fullName: 'అశ్రుఫున పఠాన్', houseNumber: '92-25-1975', age: '43', gender: 'పు', serialNumber: '165' },
      { voterId: 'SOT0898421', fullName: 'అనీల్ దండిభొట్ల', houseNumber: '92-25-2044', age: '43', gender: 'పు', serialNumber: '166' },
      { voterId: 'NDX2529600', fullName: 'శల్మా షేక్', houseNumber: '92-23-188', age: '43', gender: 'పు', serialNumber: '167' },
    ]);
    // The box without an EPIC number is counted, not silently dropped.
    expect(layout.roll.unreadBoxes).toBe(1);
  });
});

describe('status lists', () => {
  it('collects every EPIC number in a deaths / shifted list PDF, once each', async () => {
    const pdf = makePdf([
      [[20, 40, 'Deleted voters - Ward 4'], [20, 60, '1  NDX3549268  Deceased'], [20, 72, '2  SOT0898421  Shifted']],
      [[20, 40, '3  NDX3549268  repeated'], [20, 52, 'AP/12/123/456789 Shifted']],
    ]);
    const ids = await readPdfVoterIdsFromFile(pdfjs as unknown as PdfJsLike, new Blob([pdf]));
    expect(ids).toEqual(['NDX3549268', 'SOT0898421', 'AP/12/123/456789']);
  });
});

describe('large PDFs', () => {
  it('reads a file bigger than one read piece, page by page', async () => {
    // About 2.5 MB: more than two 1 MB ranges, so pdf.js must fetch several pieces of the file.
    const filler = 'x'.repeat(60);
    const pages: Text[][] = Array.from({ length: 400 }, (_, p) => [
      ...row(40, HEADERS),
      ...Array.from({ length: 40 }, (_, r) => row(60 + r * 12, [`V${p * 40 + r}`, `Name ${filler}`, '', '1', '11', String(r), '', '', 'Active'])).flat(),
    ]);
    const pdf = makePdf(pages);
    expect(pdf.byteLength).toBeGreaterThan(2 * 1024 * 1024);
    const layout = await layoutOf(pdf);
    expect(layout.kind).toBe('table');
    if (layout.kind !== 'table') return;
    expect(layout.rows).toHaveLength(1 + 400 * 40);
    expect(layout.rows[layout.rows.length - 1][0]).toBe('V15999');
  }, 60000);
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

describe('rolls with unreadable letters and photos', () => {
  it('reads EPIC numbers whose digits come out split', () => {
    expect(voterIdsInText('ఓటరు ఐడి : NDX270831 1\nNDX3678273 and AP/12/123/456789')).toEqual(['NDX2708311', 'NDX3678273', 'AP/12/123/456789']);
  });

  it('joins wrapped names and house numbers, and leaves out the photo frame text', () => {
    // As in the AP photo rolls: a long value wraps onto two lines and its label is printed between them.
    const item = (x: number, y: number, str: string): PdfTextItem => ({ str, x, y, width: str.length * 4, size: 8 });
    const box = (x: number, top: number, epic: string, house: PdfTextItem[], name: PdfTextItem[]) => [
      item(x, top, 'వార్డు.ఓ.జా.వ.సం.. 341'),
      ...name,
      item(x, top + 30, 'తండ్రి పేరు'),
      item(x + 70, top + 30, ': వెంకట శివ'),
      item(x, top + 42, 'వయసు'),
      item(x + 70, top + 42, ': 20'),
      item(x + 110, top + 42, 'లింగము :'),
      item(x + 150, top + 42, 'పు'),
      ...house,
      item(x, top + 66, 'ఓటరు ఐడి. కార్డు నెం. :'),
      item(x + 95, top + 66, epic),
    ];
    const page = [
      ...box(
        5,
        10,
        'NDX3779972',
        [item(5, 64, 'ఇంటి సంఖ్య'), item(75, 61, ': 91-1-6, 1st floor SriSai Sadan'), item(75, 67, 'Apartment'), item(220, 50, 'Photo'), item(215, 61, 'Not Available')],
        [item(75, 21, ': జర్రేముదీ ధనుశ్ శివ నాగమణికాంత'), item(5, 25, 'ఓటరు పేరు'), item(75, 29, 'జమరేముదీ')],
      ),
      // A door number with dots and a slash, on the page's last line: not a web address printed in the margin.
      ...box(285, 10, 'NDX2583672', [item(285, 64, 'ఇంటి సంఖ్య'), item(355, 64, ': D.NO.26-39-6/2A')], [item(285, 22, 'ఓటరు పేరు'), item(355, 22, ': సాయి అనిరుధ్')]),
    ];
    const layout = readPdfLayout([page]);
    expect(layout.kind).toBe('roll');
    if (layout.kind !== 'roll') return;
    expect(layout.roll.records).toEqual([
      { voterId: 'NDX3779972', fullName: 'జర్రేముదీ ధనుశ్ శివ నాగమణికాంత జమరేముదీ', houseNumber: '91-1-6, 1st floor SriSai Sadan Apartment', age: '20', gender: 'పు', serialNumber: '341' },
      { voterId: 'NDX2583672', fullName: 'సాయి అనిరుధ్', houseNumber: 'D.NO.26-39-6/2A', age: '20', gender: 'పు', serialNumber: '341' },
    ]);
  });
});

describe('PDFs the browser cannot read', () => {
  /** A stand-in for pdf.js whose text reading fails on the given pages, as on an old phone browser. */
  const failingPdfJs = (fails: (page: number) => boolean): PdfJsLike => ({
    PDFDataRangeTransport: class {
      onDataRange() {}
      requestDataRange() {}
    },
    getDocument: () => ({
      promise: Promise.resolve({
        numPages: 2,
        getPage: async (n: number) => ({
          getViewport: () => ({ height: 595 }),
          getTextContent: async () => {
            if (fails(n)) throw new Error('Promise.withResolvers is not a function');
            return { items: [{ str: 'NDX3549268', transform: [8, 0, 0, 8, 20, 500], width: 40 }] };
          },
          cleanup: () => undefined,
        }),
        destroy: async () => undefined,
      }),
    }),
  });

  it('says the browser failed instead of calling the PDF scanned', async () => {
    expect(await readPdfLayoutFromFile(failingPdfJs(() => true), new Blob(['%PDF']))).toEqual({
      kind: 'read-error',
      reason: 'Promise.withResolvers is not a function',
    });
  });

  it('reports a page that draws text but gives none (pdf.js hid an error); a page drawing no text is scanned', async () => {
    const OPS = { setFont: 37, showText: 44 };
    const silentPdfJs = (drawsText: boolean): PdfJsLike => ({
      OPS,
      PDFDataRangeTransport: class {
        onDataRange() {}
        requestDataRange() {}
      },
      getDocument: () => ({
        promise: Promise.resolve({
          numPages: 1,
          getPage: async () => ({
            getViewport: () => ({ height: 595 }),
            getTextContent: async () => ({ items: [] }),
            getOperatorList: async () => ({
              fnArray: drawsText ? [OPS.showText] : [],
              argsArray: drawsText ? [[[{ originalCharCode: 40, unicode: 'E' }]]] : [],
            }),
            cleanup: () => undefined,
          }),
          destroy: async () => undefined,
        }),
      }),
    });
    expect(await readPdfLayoutFromFile(silentPdfJs(true), new Blob(['%PDF']))).toEqual({ kind: 'read-error', reason: 'the text of the page could not be read' });
    expect(await readPdfLayoutFromFile(silentPdfJs(false), new Blob(['%PDF']))).toEqual({ kind: 'no-text' });
  });

  it('refuses a status list with pages it could not read', async () => {
    await expect(readPdfVoterIdsFromFile(failingPdfJs((n) => n === 2), new Blob(['%PDF']))).rejects.toThrow('Page 2 of this PDF could not be read');
    expect(await readPdfVoterIdsFromFile(failingPdfJs(() => false), new Blob(['%PDF']))).toEqual(['NDX3549268']);
  });
});
