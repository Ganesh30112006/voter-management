import { describe, expect, it } from 'vitest';
import type { Booth, Ward } from '../types';
import { autoDetectMapping, extractRows, mappingErrors, parseUnitNumber, validateRows, type ValidationContext } from './importParser';

const wards: Ward[] = [
  { id: 'W1', number: 1, name: 'One' },
  { id: 'W2', number: 2, name: 'Two' },
];
const booths: Booth[] = [
  { id: 'B1', wardId: 'W1', number: 11, name: 'B11' },
  { id: 'B2', wardId: 'W2', number: 21, name: 'B21' },
];

function ctx(overrides: Partial<ValidationContext> = {}): ValidationContext {
  return { wards, booths, existingVoterIds: new Set(), existingHouseholds: new Map(), ...overrides };
}

// Columns deliberately out of order with alternative headings.
const headers = ['Status', 'EPIC No', 'Name', 'Ward No', 'Booth', 'Door No', 'Phone', 'Family ID', 'Address'];

function run(rows: string[][], c = ctx()) {
  const mapping = autoDetectMapping(headers);
  return validateRows(extractRows(rows, mapping), c);
}

describe('column detection', () => {
  it('maps varied headings in any order', () => {
    const m = autoDetectMapping(headers);
    expect(m).toMatchObject({ status: 0, voterId: 1, fullName: 2, wardNumber: 3, boothNumber: 4, houseNumber: 5, householdId: 7, address: 8 });
    // Voters have no mobile number, so a Phone column is ignored.
    expect(Object.values(m)).not.toContain(6);
    expect(mappingErrors(m)).toEqual([]);
  });

  it('reports unmapped required fields and double mappings', () => {
    const m = autoDetectMapping(['Name', 'Ward']);
    expect(mappingErrors(m).some((e) => e.startsWith('Voter ID'))).toBe(true);
    expect(mappingErrors({ ...m, voterId: 0 }).some((e) => e.includes('same column'))).toBe(true);
  });
});

describe('row validation', () => {
  it('accepts a valid row and keeps leading zeros', () => {
    const [r] = run([['active', '0001234', 'Ravi Kumar', '01', '11', '12-A', '9876543210', 'HH-01', 'Main St']]);
    expect(r.category).toBe('valid');
    expect(r.voter).toMatchObject({ voterId: '0001234', status: 'Active', wardId: 'W1', boothId: 'B1' });
  });

  it('keeps or replaces voters that already exist, as the user chooses', () => {
    const headersAg = ['Voter ID', 'Name', 'Ward', 'House No', 'Status', 'Age', 'Gender'];
    const rows = extractRows([['OLD1', 'New Name', '1', '5', 'Active', '44', 'స్త్రీ']], autoDetectMapping(headersAg));
    const keep = validateRows(rows, ctx({ existingVoterIds: new Set(['OLD1']) }));
    expect(keep[0]).toMatchObject({ category: 'duplicate', replaces: false, voter: null });
    const replace = validateRows(rows, ctx({ existingVoterIds: new Set(['OLD1']), existingVoters: 'replace' }));
    expect(replace[0]).toMatchObject({ category: 'valid', replaces: true, voter: { voterId: 'OLD1', fullName: 'New Name', age: 44, gender: 'Female' } });
  });

  it('reads age and gender (Telugu or English) and flags bad values', () => {
    const headersAg = ['Voter ID', 'Name', 'Ward', 'House No', 'Status', 'వయసు', 'లింగము'];
    const map = autoDetectMapping(headersAg);
    const [ok] = validateRows(extractRows([['V1', 'Ravi', '1', '5', 'Active', '43', 'పు']], map), ctx());
    expect(ok.voter).toMatchObject({ age: 43, gender: 'Male' });
    const [bad] = validateRows(extractRows([['V2', 'Sita', '1', '5', 'Active', '7', 'X']], map), ctx());
    expect(bad.issues.map((i) => i.field)).toEqual(expect.arrayContaining(['age', 'gender']));
  });

  it('accepts a row without a booth (ward rolls have none)', () => {
    const [r] = run([['Active', 'V9', 'Ravi', '1', '', '4-5', '', '', '']]);
    expect(r.category).toBe('valid');
    expect(r.voter).toMatchObject({ wardId: 'W1', boothId: '', houseNumber: '4-5' });
  });

  it('flags a missing status instead of defaulting it', () => {
    const [r] = run([['', 'V1', 'Ravi', '1', '11', '1', '', '', '']]);
    expect(r.category).toBe('invalid');
    expect(r.voter).toBeNull();
    expect(r.issues.map((i) => i.field)).toContain('status');
  });

  it('flags invalid status and ward', () => {
    const [bad] = run([['Moved', 'V1', 'Ravi', '9', '11', '1', '12345', '', '']]);
    const fields = bad.issues.map((i) => i.field);
    expect(fields).toEqual(expect.arrayContaining(['status', 'wardNumber']));
  });

  it('adds the voter without a booth when the Booth Number is not a booth of the ward', () => {
    const [otherWard, notANumber, ok] = run([
      ['Active', 'V2', 'Ravi', '1', '21', '1', '', '', ''],
      ['Active', 'V3', 'Sita', '1', 'BLO1', '2', '', '', ''],
      ['Active', 'V4', 'Anu', '1', '11', '3', '', '', ''],
    ]);
    for (const r of [otherWard, notANumber]) {
      expect(r.category).toBe('valid');
      expect(r.boothNotFound).toBe(true);
      expect(r.voter).toMatchObject({ wardId: 'W1', boothId: '' });
    }
    expect(ok.boothNotFound).toBe(false);
    expect(ok.voter?.boothId).toBe('B1');
  });

  it('separates duplicates within the file and against existing records', () => {
    const rows = run(
      [
        ['Active', 'V1', 'A', '1', '11', '1', '', '', ''],
        ['Active', 'v1', 'B', '1', '11', '2', '', '', ''],
        ['Active', 'OLD1', 'C', '1', '11', '3', '', '', ''],
      ],
      ctx({ existingVoterIds: new Set(['OLD1']) }),
    );
    expect(rows.map((r) => r.category)).toEqual(['valid', 'duplicate', 'duplicate']);
  });

  it('flags a household that spans wards', () => {
    const rows = run(
      [
        ['Active', 'V1', 'A', '1', '11', '1', '', 'HH-9', ''],
        ['Active', 'V2', 'B', '2', '21', '1', '', 'HH-9', ''],
      ],
      ctx(),
    );
    expect(rows[1].issues.map((i) => i.field)).toContain('householdId');
    const [existing] = run([['Active', 'V3', 'C', '2', '21', '1', '', 'HH-5', '']], ctx({ existingHouseholds: new Map([['HH-5', 'W1']]) }));
    expect(existing.category).toBe('invalid');
  });

  it('skips completely blank rows', () => {
    expect(run([['', '', '', '', '', '', '', '', '']])).toHaveLength(0);
  });

  it('parses ward and booth labels', () => {
    expect(parseUnitNumber('Ward 3', 'ward')).toBe(3);
    expect(parseUnitNumber('W03', 'ward')).toBe(3);
    expect(parseUnitNumber('Booth No. 12', 'booth')).toBe(12);
    expect(parseUnitNumber('three', 'ward')).toBeNull();
  });
});
