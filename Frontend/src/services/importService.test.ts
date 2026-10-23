import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { readImportFile, sheetRows, validateImportFile } from './importService';

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

  it('accepts real PDFs and rejects renamed files', async () => {
    expect(await validateImportFile(new File(['%PDF-1.4\n...'], 'roll.pdf'))).toBeNull();
    expect(await validateImportFile(new File(['Voter ID,Name'], 'roll.pdf'))).toBe('This file is not a valid PDF.');
    expect(await validateImportFile(new File(['%PDF-1.4'], 'voters.csv'))).toBe('This file is not a plain-text CSV file.');
    expect(await validateImportFile(new File(['x'], 'voters.docx'))).toMatch(/Unsupported file type/);
  });
});
