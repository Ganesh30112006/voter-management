/**
 * Development-only in-browser data store used by the mock backend.
 * Never bundled into production calls: services only load it when VITE_USE_MOCK=true.
 */
import type {
  Admin,
  AuditLog,
  Booth,
  DonationSettings,
  DonationTransaction,
  SettingsHistoryEntry,
  Voter,
  VoterStatus,
  Ward,
} from '../types';

export interface MockSession {
  id: string;
  token: string;
  adminId: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  device: string;
}

export interface MockDb {
  version: number;
  admins: Admin[];
  /** adminId -> password hash. Missing entry means the seeded dev password applies. */
  passwords: Record<string, string>;
  sessions: MockSession[];
  wards: Ward[];
  booths: Booth[];
  voters: Voter[];
  transactions: DonationTransaction[];
  audit: AuditLog[];
  settings: DonationSettings;
  settingsHistory: SettingsHistoryEntry[];
  idempotency: Record<string, string>;
  counters: { admin: number; voter: number; txn: number; audit: number; ward: number; booth: number; settings: number };
}

const STORAGE_KEY = 'vms-mock-db';
const DB_VERSION = 4;

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = ['Ravi', 'Lakshmi', 'Suresh', 'Anitha', 'Mohan', 'Priya', 'Karthik', 'Divya', 'Ganesh', 'Meena', 'Arjun', 'Kavya', 'Rajesh', 'Sita', 'Vijay', 'Pooja', 'Naveen', 'Revathi', 'Prakash', 'Swathi', 'Imran', 'Fathima', 'Joseph', 'Mary'];
const LAST = ['Kumar', 'Reddy', 'Sharma', 'Naidu', 'Rao', 'Patel', 'Iyer', 'Pillai', 'Khan', 'Das', 'Singh', 'Varma', 'Chowdary', 'Nair'];
const STREETS = ['Gandhi Road', 'Market Street', 'Temple Street', 'Lake View Road', 'Station Road', 'Nehru Nagar', 'MG Road'];

export function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

export function seedDb(): MockDb {
  const rand = mulberry32(20261023);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
  const now = Date.now();
  const day = 86400000;
  const iso = (msAgo: number) => new Date(now - msAgo).toISOString();

  const wards: Ward[] = [
    { id: 'W1', number: 1, name: 'Gandhi Nagar' },
    { id: 'W2', number: 2, name: 'Rajiv Colony' },
    { id: 'W3', number: 3, name: 'Old Town' },
    { id: 'W4', number: 4, name: 'Lake View' },
    { id: 'W5', number: 5, name: 'Station Area' },
  ];
  const booths: Booth[] = [];
  for (const w of wards) {
    for (let b = 1; b <= 3; b++) {
      booths.push({ id: `B${w.number}-${b}`, wardId: w.id, number: w.number * 10 + b, name: `${w.name} Booth ${b}` });
    }
  }

  const admins: Admin[] = [
    { id: 'SA-1', fullName: 'Super Administrator', mobile: '9000000001', role: 'SUPER_ADMIN', wardIds: [], boothIds: [], status: 'Active', createdAt: iso(90 * day) },
    { id: 'BL-1', fullName: 'Ramesh Babu', mobile: '9876543210', role: 'BL_ADMIN', wardIds: ['W1', 'W2'], boothIds: [], status: 'Active', createdAt: iso(60 * day) },
    { id: 'BL-2', fullName: 'Sunitha Devi', mobile: '9876500011', role: 'BL_ADMIN', wardIds: ['W3'], boothIds: [], status: 'Active', createdAt: iso(55 * day) },
    { id: 'BL-3', fullName: 'Abdul Rahman', mobile: '9123456780', role: 'BL_ADMIN', wardIds: ['W4'], boothIds: ['B4-1', 'B4-2'], status: 'Active', createdAt: iso(40 * day) },
    { id: 'BL-4', fullName: 'Kiran Kumar', mobile: '8098765432', role: 'BL_ADMIN', wardIds: ['W5'], boothIds: [], status: 'Inactive', createdAt: iso(30 * day) },
  ];

  const statuses: VoterStatus[] = ['Active', 'Active', 'Active', 'Active', 'Active', 'Active', 'Not Active', 'Shifted'];
  const voters: Voter[] = [];
  const usedVoterIds = new Set<string>();
  let voterSeq = 0;
  let houseSeq = 0;
  for (const booth of booths) {
    const houses = 5 + Math.floor(rand() * 4);
    for (let h = 0; h < houses; h++) {
      houseSeq++;
      const houseNumber = `${booth.number}-${pad(h + 1, 2)}`;
      const householdId = `HH-${pad(houseSeq, 4)}`;
      const last = pick(LAST);
      const address = `${houseNumber}, ${pick(STREETS)}, Ward ${booth.wardId.slice(1)}`;
      const members = 1 + Math.floor(rand() * 4);
      for (let m = 0; m < members; m++) {
        voterSeq++;
        const created = iso((80 - Math.floor(rand() * 20)) * day);
        let voterId: string;
        do {
          voterId = `ABC${pad(Math.floor(rand() * 9_000_000) + 100, 7)}`;
        } while (usedVoterIds.has(voterId));
        usedVoterIds.add(voterId);
        voters.push({
          recordId: `VR-${pad(voterSeq, 6)}`,
          voterId,
          fullName: `${pick(FIRST)} ${last}`,
          mobile: rand() < 0.85 ? `${pick(['9', '8', '7', '6'])}${pad(Math.floor(rand() * 1_000_000_000), 9)}` : '',
          wardId: booth.wardId,
          boothId: booth.id,
          houseNumber,
          householdId,
          address,
          status: pick(statuses),
          createdAt: created,
          updatedAt: created,
        });
      }
    }
  }

  const settings: DonationSettings = {
    defaultAmount: 2000,
    currency: 'INR',
    effectiveDate: new Date(now - 45 * day).toISOString().slice(0, 10),
    allowAmountOverride: true,
  };
  const settingsHistory: SettingsHistoryEntry[] = [
    { id: 'CFG-1', changedAt: iso(45 * day), changedBy: 'SA-1', defaultAmount: 2000, effectiveDate: settings.effectiveDate, summary: 'Initial donation amount set to ₹2,000' },
  ];

  // Donations recorded by BL admins for voters in their own wards over the last 30 days.
  const transactions: DonationTransaction[] = [];
  const audit: AuditLog[] = [];
  let txnSeq = 0;
  let auditSeq = 0;
  const recorders = admins.filter((a) => a.role === 'BL_ADMIN' && a.status === 'Active');
  const received = new Set<string>();
  for (let i = 0; i < 70; i++) {
    const admin = pick(recorders);
    const pool = voters.filter(
      (v) => admin.wardIds.includes(v.wardId) && (admin.boothIds.length === 0 || admin.boothIds.includes(v.boothId)) && !received.has(v.recordId),
    );
    if (!pool.length) continue;
    const voter = pick(pool);
    received.add(voter.recordId);
    txnSeq++;
    const ts = iso(Math.floor(rand() * 30 * day));
    const self = rand() < 0.7;
    const tx: DonationTransaction = {
      id: `TXN-${pad(txnSeq, 6)}`,
      voterRecordId: voter.recordId,
      voterId: voter.voterId,
      voterName: voter.fullName,
      wardId: voter.wardId,
      boothId: voter.boothId,
      amount: 2000,
      receiverName: self ? voter.fullName : `${pick(FIRST)} ${voter.fullName.split(' ').slice(-1)[0]}`,
      receiverMobile: voter.mobile && self ? voter.mobile : `9${pad(Math.floor(rand() * 1_000_000_000), 9)}`,
      timestamp: ts,
      adminId: admin.id,
      adminName: admin.fullName,
      status: i % 23 === 7 ? 'Cancelled' : 'Success',
      statusReason: i % 23 === 7 ? 'Entered for wrong voter' : undefined,
    };
    if (tx.status === 'Cancelled') received.delete(voter.recordId);
    transactions.push(tx);
    auditSeq++;
    audit.push({
      id: `AUD-${pad(auditSeq, 6)}`,
      timestamp: ts,
      adminId: admin.id,
      adminName: admin.fullName,
      action: 'Donation recorded',
      entity: 'Donation',
      recordRef: tx.id,
      result: 'Success',
      summary: `₹${tx.amount.toLocaleString('en-IN')} to ${tx.receiverName} for voter ${voter.voterId}`,
    });
  }
  transactions.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  audit.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  return {
    version: DB_VERSION,
    admins,
    passwords: {},
    sessions: [],
    wards,
    booths,
    voters,
    transactions,
    audit,
    settings,
    settingsHistory,
    idempotency: {},
    counters: { admin: 4, voter: voterSeq, txn: txnSeq, audit: auditSeq, ward: wards.length, booth: booths.length, settings: 1 },
  };
}

let memory: MockDb | null = null;

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadDb(): MockDb {
  if (memory) return memory;
  const raw = storage()?.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as MockDb;
      if (parsed.version === DB_VERSION) {
        memory = parsed;
        return memory;
      }
    } catch {
      // fall through to a fresh seed
    }
  }
  memory = seedDb();
  saveDb();
  return memory;
}

export function saveDb(): void {
  if (!memory) return;
  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify(memory));
  } catch {
    // Storage full or blocked: keep working from memory.
  }
}

export function resetDb(): void {
  memory = seedDb();
  saveDb();
}
