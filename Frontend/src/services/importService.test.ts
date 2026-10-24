import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { readImportFile, readVoterIdList, sheetRows, validateImportFile } from './importService';

describe('import files', () => {
  it('keeps long whole numbers that Excel would show as 9.19877E+11', async () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Voter ID', 'Mobile Number'],
      [123, 919876543210],
    ]);
    ws.A2.z = '00000';
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Voters');
    const file = new File([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })], 'voters.xlsx');
    const source = await readImportFile(file);
    expect(source.kind).toBe('sheets');
    if (source.kind !== 'sheets') return;
    expect(sheetRows(source.workbook, 'Voters')[1]).toEqual(['00123', '919876543210']);
  });

  it('keeps spreadsheet row numbers across blank rows and a used range that starts lower', () => {
    const ws = XLSX.utils.sheet_add_aoa({} as XLSX.WorkSheet, [['Voter list'], [], ['Voter ID', 'Name'], ['V1', 'A'], [], ['V2', 'B']], { origin: 'B2' });
    ws['!ref'] = 'B2:C7'; // as Excel saves a sheet whose first used cell is B2
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'S');
    const rows = sheetRows(wb, 'S');
    expect(rows[3]).toEqual(['Voter ID', 'Name']);
    expect(rows[4]).toEqual(['V1', 'A']);
    expect(rows[6]).toEqual(['V2', 'B']);
  });

  it('allows PDFs up to 2 GB, Excel up to 100 MB and CSV up to 200 MB', async () => {
    // Only the first bytes are read for checks, so a stand-in with a large `size` is enough.
    const big = (name: string, size: number, head: string) => {
      const real = new File([head], name);
      return { name, size, slice: (a?: number, b?: number) => real.slice(a, b) } as unknown as File;
    };
    const GB = 1024 * 1024 * 1024;
    expect(await validateImportFile(big('roll.pdf', 2 * GB, '%PDF-1.7'))).toBeNull();
    expect(await validateImportFile(big('roll.pdf', 2 * GB + 1, '%PDF-1.7'))).toBe('PDF files can be at most 2 GB. Split it into smaller files.');
    expect(await validateImportFile(big('voters.xlsx', 101 * 1024 * 1024, 'PK\u0003\u0004'))).toBe('XLSX files can be at most 100 MB. Split it into smaller files.');
    expect(await validateImportFile(big('voters.csv', 150 * 1024 * 1024, 'Voter ID,Name'))).toBeNull();
  });

  it('reads voter IDs from a CSV status list: EPIC numbers and existing IDs in any column', async () => {
    const csv = ['S.No,Name,Voter ID,Reason', '1,Ravi,ndx3549268,Deceased', '2,Sita,00123,Shifted', '3,Gopal,UNKNOWN-9,Shifted'].join('\n');
    const ids = await readVoterIdList(new File([csv], 'deaths.csv'), new Set(['00123']));
    expect(ids).toEqual(['NDX3549268', '00123']);
  });

  it('accepts real PDFs and rejects renamed files', async () => {
    expect(await validateImportFile(new File(['%PDF-1.4\n...'], 'roll.pdf'))).toBeNull();
    expect(await validateImportFile(new File(['Voter ID,Name'], 'roll.pdf'))).toBe('This file is not a valid PDF.');
    expect(await validateImportFile(new File(['%PDF-1.4'], 'voters.csv'))).toBe('This file is not a plain-text CSV file.');
    expect(await validateImportFile(new File(['x'], 'voters.docx'))).toMatch(/Unsupported file type/);
  });
});
