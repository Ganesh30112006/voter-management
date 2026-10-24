import type { Booth, VoterInput, Ward } from '../types';
import { HOUSEHOLD_ID_PATTERN, normalizeGender, normalizeVoterStatus } from './validation';

export type ImportField =
  | 'voterId'
  | 'fullName'
  | 'wardNumber'
  | 'boothNumber'
  | 'houseNumber'
  | 'householdId'
  | 'address'
  | 'status'
  | 'age'
  | 'gender';

export const IMPORT_FIELDS: { key: ImportField; label: string; required: boolean; synonyms: string[] }[] = [
  { key: 'voterId', label: 'Voter ID', required: true, synonyms: ['voter id', 'voterid', 'epic', 'epic no', 'epic number', 'electoral id', 'voter id no'] },
  { key: 'fullName', label: 'Full Name', required: true, synonyms: ['full name', 'name', 'voter name', 'fullname'] },
  { key: 'wardNumber', label: 'Ward Number', required: true, synonyms: ['ward number', 'ward', 'ward no', 'ward_no'] },
  { key: 'boothNumber', label: 'Booth Number', required: false, synonyms: ['booth number', 'booth', 'booth no', 'polling booth'] },
  {
    key: 'houseNumber',
    label: 'House / Door Number',
    required: true,
    synonyms: ['house / door number', 'house number', 'house no', 'house', 'door no', 'door number', 'ఇంటి సంఖ్య', 'ఇంటి సంఖ', 'ఇంటి నంబర్'],
  },
  { key: 'householdId', label: 'Household ID', required: false, synonyms: ['household id', 'household', 'family id', 'household no'] },
  { key: 'address', label: 'Address', required: false, synonyms: ['address', 'full address', 'street'] },
  { key: 'status', label: 'Status', required: true, synonyms: ['status', 'voter status'] },
  { key: 'age', label: 'Age', required: false, synonyms: ['age', 'వయస్సు', 'వయసు'] },
  { key: 'gender', label: 'Gender', required: false, synonyms: ['gender', 'sex', 'లింగము', 'లింగం'] },
];

export const TEMPLATE_HEADERS = IMPORT_FIELDS.map((f) => f.label);

export type ColumnMapping = Record<ImportField, number>; // -1 = not mapped

function normHeader(h: string): string {
  return h.toLowerCase().replace(/[_.#:]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function autoDetectMapping(headers: string[]): ColumnMapping {
  const normalized = headers.map((h) => normHeader(String(h ?? '')));
  const used = new Set<number>();
  const mapping = {} as ColumnMapping;
  for (const field of IMPORT_FIELDS) {
    let idx = -1;
    // Prefer the most specific synonym first (they are ordered).
    for (const syn of field.synonyms) {
      const found = normalized.findIndex((h, i) => !used.has(i) && h === syn);
      if (found !== -1) {
        idx = found;
        break;
      }
    }
    if (idx !== -1) used.add(idx);
    mapping[field.key] = idx;
  }
  return mapping;
}

/** Index of the heading row: the row among the first 20 that names the most import fields (title rows may come first). */
export function findHeaderRow(rows: string[][]): number {
  let best = 0;
  let bestScore = 1;
  rows.slice(0, 20).forEach((row, i) => {
    const m = autoDetectMapping(row);
    const score = IMPORT_FIELDS.filter((f) => m[f.key] !== -1).length;
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  });
  return best;
}

export function mappingErrors(mapping: ColumnMapping): string[] {
  const errors: string[] = [];
  for (const f of IMPORT_FIELDS) {
    if (f.required && mapping[f.key] === -1) errors.push(`${f.label} must be mapped to a column`);
  }
  const seen = new Map<number, string>();
  for (const f of IMPORT_FIELDS) {
    const col = mapping[f.key];
    if (col === -1) continue;
    const other = seen.get(col);
    if (other) errors.push(`${f.label} and ${other} are mapped to the same column`);
    else seen.set(col, f.label);
  }
  return errors;
}

export type RowValues = Record<ImportField, string>;

export interface RawRow {
  /** 1-based row number in the spreadsheet (header is row 1). */
  rowNumber: number;
  values: RowValues;
}

export function extractRows(dataRows: unknown[][], mapping: ColumnMapping, firstRowNumber = 2): RawRow[] {
  const rows: RawRow[] = [];
  dataRows.forEach((cells, i) => {
    const values = {} as RowValues;
    for (const f of IMPORT_FIELDS) {
      const col = mapping[f.key];
      // Values are kept as text so identifiers keep their leading zeros.
      values[f.key] = col === -1 ? '' : String(cells[col] ?? '').trim();
    }
    const blank = Object.values(values).every((v) => v === '');
    if (!blank) rows.push({ rowNumber: firstRowNumber + i, values });
  });
  return rows;
}

export interface RowIssue {
  field: ImportField | 'row';
  message: string;
}

export type RowCategory = 'valid' | 'invalid' | 'duplicate';

export interface ValidatedRow {
  rowNumber: number;
  values: RowValues;
  issues: RowIssue[];
  category: RowCategory;
  voter: VoterInput | null;
  /** The Voter ID already exists and the user chose to replace that voter's details. */
  replaces: boolean;
  /** The Booth Number is not a booth of the row's ward: booth is optional, so the voter is added without one. */
  boothNotFound: boolean;
}

export interface ValidationContext {
  wards: Ward[];
  booths: Booth[];
  existingVoterIds: Set<string>;
  /** householdId -> wardId for households already in the system */
  existingHouseholds: Map<string, string>;
  /**
   * What to do with rows whose Voter ID already exists: keep the existing voter (the row is a duplicate and
   * skipped) or replace that voter's details with the row.
   */
  existingVoters?: 'keep' | 'replace';
}

/** "3", "03", "Ward 3", "W3" -> 3 */
export function parseUnitNumber(raw: string, prefix: 'ward' | 'booth'): number | null {
  const short = prefix === 'ward' ? 'w' : 'b';
  const m = raw.trim().match(new RegExp(`^(?:${prefix}\\s*(?:no\\.?\\s*)?|${short})?\\s*0*(\\d+)$`, 'i'));
  if (!m) return null;
  return Number(m[1]);
}

export function voterIdKey(id: string): string {
  return id.trim().toUpperCase();
}

export function validateRows(rows: RawRow[], ctx: ValidationContext): ValidatedRow[] {
  const firstSeen = new Map<string, number>();
  const fileHouseholds = new Map<string, { wardId: string; rowNumber: number }>();

  return rows.map(({ rowNumber, values }) => {
    const issues: RowIssue[] = [];
    let duplicate = false;
    let replaces = false;

    for (const f of IMPORT_FIELDS) {
      if (f.required && f.key !== 'status' && values[f.key] === '') {
        issues.push({ field: f.key, message: `${f.label} is required` });
      }
    }

    const age = values.age === '' ? null : /^\d+$/.test(values.age) ? Number(values.age) : NaN;
    if (age !== null && !(age >= 18 && age <= 120)) issues.push({ field: 'age', message: `"${values.age}" is not a valid age (18 to 120)` });
    const gender = normalizeGender(values.gender);
    if (gender === null) issues.push({ field: 'gender', message: `"${values.gender}" is not a valid gender (Male, Female, Other)` });

    const status = normalizeVoterStatus(values.status);
    if (values.status === '') issues.push({ field: 'status', message: 'Status is missing' });
    else if (!status) issues.push({ field: 'status', message: `"${values.status}" is not a valid status (Active, Not Active, Shifted)` });

    let ward: Ward | undefined;
    let booth: Booth | undefined;
    let boothNotFound = false;
    if (values.wardNumber !== '') {
      const n = parseUnitNumber(values.wardNumber, 'ward');
      ward = n === null ? undefined : ctx.wards.find((w) => w.number === n);
      if (!ward) issues.push({ field: 'wardNumber', message: `Ward "${values.wardNumber}" does not exist` });
    }
    if (values.boothNumber !== '' && ward) {
      const n = parseUnitNumber(values.boothNumber, 'booth');
      booth = n === null ? undefined : ctx.booths.find((b) => b.wardId === ward!.id && b.number === n);
      boothNotFound = !booth;
    }

    if (values.householdId !== '') {
      if (!HOUSEHOLD_ID_PATTERN.test(values.householdId)) {
        issues.push({ field: 'householdId', message: 'Household ID may only contain letters, numbers, - or /' });
      } else if (ward) {
        const key = values.householdId.toUpperCase();
        const existingWard = ctx.existingHouseholds.get(key);
        const inFile = fileHouseholds.get(key);
        if (existingWard && existingWard !== ward.id) {
          issues.push({ field: 'householdId', message: 'Household already exists in a different ward' });
        } else if (inFile && inFile.wardId !== ward.id) {
          issues.push({ field: 'householdId', message: `Household is in a different ward on row ${inFile.rowNumber}` });
        } else if (!inFile) {
          fileHouseholds.set(key, { wardId: ward.id, rowNumber });
        }
      }
    }

    if (values.voterId !== '') {
      const key = voterIdKey(values.voterId);
      if (firstSeen.has(key)) {
        duplicate = true;
        issues.push({ field: 'voterId', message: `Duplicate of row ${firstSeen.get(key)} in this file` });
      } else {
        firstSeen.set(key, rowNumber);
        if (ctx.existingVoterIds.has(key) && ctx.existingVoters === 'replace') replaces = true;
        else if (ctx.existingVoterIds.has(key)) {
          duplicate = true;
          issues.push({ field: 'voterId', message: 'Voter ID already exists in the system' });
        }
      }
    }

    const category: RowCategory = duplicate ? 'duplicate' : issues.length ? 'invalid' : 'valid';
    const voter: VoterInput | null =
      category === 'valid' && ward && status && gender !== null
        ? {
            voterId: values.voterId,
            fullName: values.fullName,
            wardId: ward.id,
            // Booth is optional (ward rolls have none).
            boothId: booth?.id ?? '',
            houseNumber: values.houseNumber,
            householdId: values.householdId,
            address: values.address,
            status,
            age,
            gender,
          }
        : null;

    return { rowNumber, values, issues, category, voter, replaces: replaces && category === 'valid', boothNotFound };
  });
}
