/**
 * Development-only mock of the REST backend. It enforces the same rules a real server must:
 * authentication, role permissions, ward scoping, ID/timestamp generation and duplicate prevention.
 */
import { ApiError, type ApiErrorCode } from '../services/apiError';
import type {
  AccountStatus,
  Admin,
  AdminInput,
  AdminQuery,
  AuditLog,
  AuditQuery,
  Booth,
  CancelDonationInput,
  AdminCreateInput,
  DashboardStats,
  DonationContext,
  DonationInput,
  DonationQuery,
  DonationSettings,
  DonationTransaction,
  DuplicateCheckResult,
  GroupRow,
  ImportContext,
  ImportResult,
  ImportRow,
  LoginResponse,
  Notification,
  Paginated,
  ReportData,
  ReportFilters,
  Session,
  SettingsResponse,
  TransactionDetail,
  Voter,
  VoterDetail,
  VoterInput,
  VoterListItem,
  VoterQuery,
  Ward,
  WardSummary,
} from '../types';
import { VOTER_STATUSES } from '../types';
import { toDateInput } from '../utils/format';
import { randomId } from '../utils/id';
import { coversVoter } from '../utils/permissions';
import { HOUSEHOLD_ID_PATTERN, MAX_DONATION_AMOUNT, PASSWORD_RULES, isValidIndianMobile, isValidPassword, normalizeMobile } from '../utils/validation';
import { loadDb, pad, resetDb, saveDb, type MockDb } from './db';

const SESSION_HOURS = 8;
const REMEMBER_DAYS = 7;

export { resetDb as resetMockDb };

function fail(status: number, code: ApiErrorCode, message: string, fieldErrors?: Record<string, string>): never {
  throw new ApiError(status, code, message, fieldErrors);
}

function nowIso(): string {
  return new Date().toISOString();
}

/** Non-cryptographic hash: acceptable only because this mock never leaves the developer's browser. */
function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

function seedPassword(): string {
  return (import.meta.env.VITE_MOCK_PASSWORD as string | undefined) ?? '';
}

function checkPassword(db: MockDb, adminId: string, password: string): boolean {
  const stored = db.passwords[adminId];
  if (stored) return stored === hash(password);
  const seed = seedPassword();
  return seed !== '' && password === seed;
}

function paginate<T>(items: T[], page = 1, pageSize = 20): Paginated<T> {
  const size = Math.min(Math.max(1, Math.floor(pageSize) || 20), 500);
  const pages = Math.max(1, Math.ceil(items.length / size));
  const p = Math.min(Math.max(1, Math.floor(page) || 1), pages);
  return { items: items.slice((p - 1) * size, p * size), total: items.length, page: p, pageSize: size };
}

function authenticate(db: MockDb, token: string | null): Admin {
  const session = token ? db.sessions.find((s) => s.token === token) : undefined;
  if (!session || new Date(session.expiresAt).getTime() <= Date.now()) {
    if (session) {
      db.sessions = db.sessions.filter((s) => s !== session);
      saveDb();
    }
    fail(401, 'SESSION_EXPIRED', 'Your session has expired. Please log in again.');
  }
  const admin = db.admins.find((a) => a.id === session.adminId);
  if (!admin || admin.status !== 'Active') {
    db.sessions = db.sessions.filter((s) => s !== session);
    saveDb();
    fail(401, 'SESSION_EXPIRED', 'Your account is no longer active. Contact the Super Admin.');
  }
  session.lastSeenAt = nowIso();
  return admin;
}

function requireSuper(admin: Admin): void {
  if (admin.role !== 'SUPER_ADMIN') fail(403, 'FORBIDDEN', 'Only the Super Admin can perform this action.');
}

function addAudit(
  db: MockDb,
  admin: Pick<Admin, 'id' | 'fullName'>,
  action: string,
  entity: AuditLog['entity'],
  recordRef: string,
  summary: string,
  result: AuditLog['result'] = 'Success',
): void {
  db.counters.audit++;
  db.audit.push({
    id: `AUD-${pad(db.counters.audit, 6)}`,
    timestamp: nowIso(),
    adminId: admin.id,
    adminName: admin.fullName,
    action,
    entity,
    recordRef,
    result,
    summary,
  });
}

function boothWardOf(db: MockDb) {
  return (boothId: string) => db.booths.find((b) => b.id === boothId)?.wardId;
}

function covers(db: MockDb, admin: Admin, loc: { wardId: string; boothId: string }): boolean {
  return coversVoter(admin, loc.wardId, loc.boothId, boothWardOf(db));
}

function localDate(iso: string): string {
  return toDateInput(new Date(iso));
}

function inDateRange(iso: string, from?: string, to?: string): boolean {
  const d = localDate(iso);
  return (!from || d >= from) && (!to || d <= to);
}

/** Latest successful transaction per voter. Cancelled/reversed transactions never count. */
function latestSuccessByVoter(db: MockDb): Map<string, DonationTransaction> {
  const map = new Map<string, DonationTransaction>();
  for (const t of db.transactions) {
    if (t.status !== 'Success') continue;
    const prev = map.get(t.voterRecordId);
    if (!prev || prev.timestamp < t.timestamp) map.set(t.voterRecordId, t);
  }
  return map;
}

function toListItem(db: MockDb, admin: Admin, voter: Voter, latest: Map<string, DonationTransaction>): VoterListItem {
  const tx = latest.get(voter.recordId) ?? null;
  return {
    ...voter,
    donationStatus: tx ? 'Received' : 'Not Received',
    latestDonation: tx ? { ...tx } : null,
    // Any active admin may record a donation for any voter who has not received one.
    canRecordDonation: !tx,
    inMyWards: covers(db, admin, voter),
  };
}

function today(): string {
  return toDateInput(new Date());
}

/** The most recently saved amount whose effective date has arrived; a future-dated change waits its turn. */
function currentAmount(db: MockDb): number {
  const t = today();
  const effective = db.settingsHistory.filter((h) => h.effectiveDate <= t).sort((a, b) => b.changedAt.localeCompare(a.changedAt));
  return effective[0]?.defaultAmount ?? db.settings.defaultAmount;
}

function wardNumber(db: MockDb, wardId: string): number {
  return db.wards.find((w) => w.id === wardId)?.number ?? 0;
}

function boothNumber(db: MockDb, boothId: string): number {
  return db.booths.find((b) => b.id === boothId)?.number ?? 0;
}

// ---------------------------------------------------------------- Auth

export function login(mobile: string, password: string, remember: boolean, device: string): LoginResponse {
  const db = loadDb();
  const number = normalizeMobile(mobile ?? '');
  const admin = db.admins.find((a) => a.mobile === number);
  if (!admin || !checkPassword(db, admin.id, password)) {
    if (admin) {
      addAudit(db, admin, 'Login failed', 'Auth', admin.id, 'Incorrect password', 'Failure');
      saveDb();
    }
    fail(401, 'INVALID_CREDENTIALS', 'Invalid mobile number or password.');
  }
  if (admin.status !== 'Active') fail(403, 'FORBIDDEN', 'This account has been deactivated. Contact the Super Admin.');
  const created = nowIso();
  const expiresAt = new Date(Date.now() + (remember ? REMEMBER_DAYS * 24 : SESSION_HOURS) * 3600_000).toISOString();
  const token = `${randomId()}.${randomId()}`;
  db.sessions.push({ id: randomId(), token, adminId: admin.id, createdAt: created, lastSeenAt: created, expiresAt, device });
  addAudit(db, admin, 'Logged in', 'Auth', admin.id, device);
  saveDb();
  return { token, admin: { ...admin }, expiresAt };
}

export function logout(token: string | null): void {
  const db = loadDb();
  db.sessions = db.sessions.filter((s) => s.token !== token);
  saveDb();
}

export function me(token: string | null): Admin {
  const db = loadDb();
  const admin = authenticate(db, token);
  saveDb();
  return { ...admin };
}

export function changePassword(token: string | null, currentPassword: string, newPassword: string): void {
  const db = loadDb();
  const admin = authenticate(db, token);
  if (!checkPassword(db, admin.id, currentPassword)) {
    fail(400, 'VALIDATION', 'Current password is incorrect.', { currentPassword: 'Current password is incorrect' });
  }
  if (!isValidPassword(newPassword)) {
    fail(400, 'VALIDATION', 'Password does not meet the requirements.', { newPassword: PASSWORD_RULES });
  }
  db.passwords[admin.id] = hash(newPassword);
  db.sessions = db.sessions.filter((s) => s.adminId !== admin.id || s.token === token);
  addAudit(db, admin, 'Password changed', 'Auth', admin.id, 'Other sessions signed out');
  saveDb();
}

export function listSessions(token: string | null): Session[] {
  const db = loadDb();
  const admin = authenticate(db, token);
  saveDb();
  return db.sessions
    .filter((s) => s.adminId === admin.id && new Date(s.expiresAt).getTime() > Date.now())
    .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))
    .map((s) => ({ id: s.id, createdAt: s.createdAt, lastSeenAt: s.lastSeenAt, device: s.device, current: s.token === token }));
}

export function revokeSession(token: string | null, sessionId: string): void {
  const db = loadDb();
  const admin = authenticate(db, token);
  const target = db.sessions.find((s) => s.id === sessionId && s.adminId === admin.id);
  if (!target) fail(404, 'NOT_FOUND', 'Session not found.');
  if (target.token === token) fail(400, 'VALIDATION', 'Use Log out to end the current session.');
  db.sessions = db.sessions.filter((s) => s !== target);
  saveDb();
}

export function revokeOtherSessions(token: string | null): number {
  const db = loadDb();
  const admin = authenticate(db, token);
  const before = db.sessions.length;
  db.sessions = db.sessions.filter((s) => s.adminId !== admin.id || s.token === token);
  saveDb();
  return before - db.sessions.length;
}

// ---------------------------------------------------------------- Administrators

function validateAdminInput(db: MockDb, input: AdminInput, excludeId?: string): AdminInput {
  const errors: Record<string, string> = {};
  const fullName = (input.fullName ?? '').trim();
  if (fullName.length < 2) errors.fullName = 'Full name is required';
  if (!isValidIndianMobile(input.mobile ?? '')) errors.mobile = 'Enter a valid 10-digit Indian mobile number';
  const mobile = normalizeMobile(input.mobile ?? '');
  if (!errors.mobile && db.admins.some((a) => a.id !== excludeId && a.mobile === mobile)) {
    errors.mobile = 'Another administrator already uses this mobile number';
  }
  const wardIds = [...new Set(input.wardIds ?? [])];
  if (!wardIds.length) errors.wardIds = 'Assign at least one ward';
  if (wardIds.some((id) => !db.wards.some((w) => w.id === id))) errors.wardIds = 'One or more wards do not exist';
  const boothIds = [...new Set(input.boothIds ?? [])];
  if (boothIds.some((id) => !wardIds.includes(boothWardOf(db)(id) ?? ''))) errors.boothIds = 'Booths must belong to the selected wards';
  if (Object.keys(errors).length) fail(400, 'VALIDATION', 'Please correct the highlighted fields.', errors);
  return { fullName, mobile, wardIds, boothIds };
}

export function listAdmins(token: string | null, q: AdminQuery = {}): Paginated<Admin> {
  const db = loadDb();
  requireSuper(authenticate(db, token));
  const search = (q.search ?? '').trim().toLowerCase();
  let items = db.admins.filter((a) => a.role === 'BL_ADMIN');
  if (search) items = items.filter((a) => a.id.toLowerCase().includes(search) || a.fullName.toLowerCase().includes(search) || a.mobile.includes(search));
  if (q.wardId) items = items.filter((a) => a.wardIds.includes(q.wardId!));
  if (q.status) items = items.filter((a) => a.status === q.status);
  const dir = q.sortDir === 'desc' ? -1 : 1;
  const sortBy = q.sortBy ?? 'id';
  items = [...items].sort((a, b) => {
    if (sortBy === 'id') return (Number(a.id.split('-')[1]) - Number(b.id.split('-')[1])) * dir;
    return String(a[sortBy]).localeCompare(String(b[sortBy])) * dir;
  });
  return paginate(items, q.page, q.pageSize);
}

/** Lightweight list used by filters (Super Admin only). */
export function adminOptions(token: string | null): Pick<Admin, 'id' | 'fullName'>[] {
  const db = loadDb();
  requireSuper(authenticate(db, token));
  return db.admins.map((a) => ({ id: a.id, fullName: a.fullName }));
}

export function getAdmin(token: string | null, id: string): Admin {
  const db = loadDb();
  requireSuper(authenticate(db, token));
  const admin = db.admins.find((a) => a.id === id);
  if (!admin) fail(404, 'NOT_FOUND', 'Administrator not found.');
  return { ...admin };
}

export function createAdmin(token: string | null, input: AdminCreateInput): Admin {
  const db = loadDb();
  const actor = authenticate(db, token);
  requireSuper(actor);
  if (!isValidPassword(input.password ?? '')) {
    fail(400, 'VALIDATION', 'Please correct the highlighted fields.', { password: PASSWORD_RULES });
  }
  const clean = validateAdminInput(db, input);
  db.counters.admin++;
  const admin: Admin = { id: `BL-${db.counters.admin}`, role: 'BL_ADMIN', status: 'Active', createdAt: nowIso(), ...clean };
  db.admins.push(admin);
  db.passwords[admin.id] = hash(input.password);
  addAudit(db, actor, 'Administrator created', 'Admin', admin.id, `${admin.fullName}, wards ${wardList(db, admin.wardIds)}`);
  saveDb();
  return { ...admin };
}

function wardList(db: MockDb, ids: string[]): string {
  return ids.map((id) => wardNumber(db, id)).sort((a, b) => a - b).join(', ') || 'none';
}

export function updateAdmin(token: string | null, id: string, input: AdminInput): Admin {
  const db = loadDb();
  const actor = authenticate(db, token);
  requireSuper(actor);
  const admin = db.admins.find((a) => a.id === id);
  if (!admin || admin.role !== 'BL_ADMIN') fail(404, 'NOT_FOUND', 'Administrator not found.');
  const clean = validateAdminInput(db, input, id);
  const changes: string[] = [];
  if (admin.fullName !== clean.fullName) changes.push(`name "${admin.fullName}" → "${clean.fullName}"`);
  if (admin.mobile !== clean.mobile) changes.push('mobile changed');
  const assignmentChanged = admin.wardIds.slice().sort().join() !== clean.wardIds.slice().sort().join() || admin.boothIds.slice().sort().join() !== clean.boothIds.slice().sort().join();
  Object.assign(admin, clean);
  if (changes.length) addAudit(db, actor, 'Administrator updated', 'Admin', id, changes.join('; '));
  if (assignmentChanged) addAudit(db, actor, 'Assignment changed', 'Admin', id, `Wards ${wardList(db, clean.wardIds)}; booths ${clean.boothIds.length ? clean.boothIds.map((b) => boothNumber(db, b)).join(', ') : 'all in ward'}`);
  saveDb();
  return { ...admin };
}

export function setAdminStatus(token: string | null, id: string, status: AccountStatus): Admin {
  const db = loadDb();
  const actor = authenticate(db, token);
  requireSuper(actor);
  const admin = db.admins.find((a) => a.id === id);
  if (!admin || admin.role !== 'BL_ADMIN') fail(404, 'NOT_FOUND', 'Administrator not found.');
  if (admin.status !== status) {
    admin.status = status;
    if (status === 'Inactive') db.sessions = db.sessions.filter((s) => s.adminId !== id);
    addAudit(db, actor, status === 'Active' ? 'Administrator activated' : 'Administrator deactivated', 'Admin', id, admin.fullName);
    saveDb();
  }
  return { ...admin };
}

/** Super Admin sets a new password for a BL Admin; that admin is signed out everywhere. */
export function setAdminPassword(token: string | null, id: string, password: string): void {
  const db = loadDb();
  const actor = authenticate(db, token);
  requireSuper(actor);
  const admin = db.admins.find((a) => a.id === id);
  if (!admin || admin.role !== 'BL_ADMIN') fail(404, 'NOT_FOUND', 'Administrator not found.');
  if (!isValidPassword(password ?? '')) fail(400, 'VALIDATION', 'Password does not meet the requirements.', { password: PASSWORD_RULES });
  db.passwords[id] = hash(password);
  db.sessions = db.sessions.filter((s) => s.adminId !== id);
  addAudit(db, actor, 'Password changed', 'Admin', id, `Password for ${admin.fullName} changed by Super Admin`);
  saveDb();
}

// ---------------------------------------------------------------- Wards & booths

export function listWards(token: string | null): { wards: Ward[]; booths: Booth[] } {
  const db = loadDb();
  authenticate(db, token);
  return {
    wards: [...db.wards].sort((a, b) => a.number - b.number),
    booths: [...db.booths].sort((a, b) => a.number - b.number),
  };
}

export function wardSummaries(token: string | null): WardSummary[] {
  const db = loadDb();
  requireSuper(authenticate(db, token));
  const bl = db.admins.filter((a) => a.role === 'BL_ADMIN');
  return [...db.wards]
    .sort((a, b) => a.number - b.number)
    .map((w) => ({
      ...w,
      voterCount: db.voters.filter((v) => v.wardId === w.id).length,
      adminIds: bl.filter((a) => a.wardIds.includes(w.id)).map((a) => a.id),
      booths: db.booths
        .filter((b) => b.wardId === w.id)
        .sort((a, b) => a.number - b.number)
        .map((b) => ({
          ...b,
          voterCount: db.voters.filter((v) => v.boothId === b.id).length,
          adminIds: bl.filter((a) => a.boothIds.includes(b.id)).map((a) => a.id),
        })),
    }));
}

function validateWard(db: MockDb, input: { number: number; name: string }, excludeId?: string) {
  const number = Number(input.number);
  const name = (input.name ?? '').trim();
  const errors: Record<string, string> = {};
  if (!Number.isInteger(number) || number <= 0) errors.number = 'Enter a valid ward number';
  else if (db.wards.some((w) => w.id !== excludeId && w.number === number)) errors.number = `Ward ${number} already exists`;
  if (name.length < 2) errors.name = 'Ward name is required';
  if (Object.keys(errors).length) fail(400, 'VALIDATION', 'Please correct the highlighted fields.', errors);
  return { number, name };
}

export function createWard(token: string | null, input: { number: number; name: string }): Ward {
  const db = loadDb();
  const actor = authenticate(db, token);
  requireSuper(actor);
  const clean = validateWard(db, input);
  db.counters.ward++;
  const ward: Ward = { id: `W${db.counters.ward}`, ...clean };
  // Guard against an id clash with a manually numbered ward.
  while (db.wards.some((w) => w.id === ward.id)) ward.id = `W${++db.counters.ward}`;
  db.wards.push(ward);
  addAudit(db, actor, 'Ward created', 'Ward', ward.id, `Ward ${ward.number} – ${ward.name}`);
  saveDb();
  return { ...ward };
}

export function updateWard(token: string | null, id: string, input: { number: number; name: string }): Ward {
  const db = loadDb();
  const actor = authenticate(db, token);
  requireSuper(actor);
  const ward = db.wards.find((w) => w.id === id);
  if (!ward) fail(404, 'NOT_FOUND', 'Ward not found.');
  const clean = validateWard(db, input, id);
  const summary = `Ward ${ward.number} – ${ward.name} → Ward ${clean.number} – ${clean.name}`;
  Object.assign(ward, clean);
  addAudit(db, actor, 'Ward updated', 'Ward', id, summary);
  saveDb();
  return { ...ward };
}

function validateBooth(db: MockDb, input: { wardId: string; number: number; name: string }, excludeId?: string) {
  const number = Number(input.number);
  const name = (input.name ?? '').trim();
  const errors: Record<string, string> = {};
  if (!db.wards.some((w) => w.id === input.wardId)) errors.wardId = 'Select a valid ward';
  if (!Number.isInteger(number) || number <= 0) errors.number = 'Enter a valid booth number';
  else if (db.booths.some((b) => b.id !== excludeId && b.wardId === input.wardId && b.number === number)) errors.number = `Booth ${number} already exists in this ward`;
  if (name.length < 2) errors.name = 'Booth name is required';
  if (Object.keys(errors).length) fail(400, 'VALIDATION', 'Please correct the highlighted fields.', errors);
  return { wardId: input.wardId, number, name };
}

export function createBooth(token: string | null, input: { wardId: string; number: number; name: string }): Booth {
  const db = loadDb();
  const actor = authenticate(db, token);
  requireSuper(actor);
  const clean = validateBooth(db, input);
  db.counters.booth++;
  let id = `B-${db.counters.booth}`;
  while (db.booths.some((b) => b.id === id)) id = `B-${++db.counters.booth}`;
  const booth: Booth = { id, ...clean };
  db.booths.push(booth);
  addAudit(db, actor, 'Booth created', 'Booth', booth.id, `Booth ${booth.number} in ward ${wardNumber(db, booth.wardId)}`);
  saveDb();
  return { ...booth };
}

export function updateBooth(token: string | null, id: string, input: { number: number; name: string }): Booth {
  const db = loadDb();
  const actor = authenticate(db, token);
  requireSuper(actor);
  const booth = db.booths.find((b) => b.id === id);
  if (!booth) fail(404, 'NOT_FOUND', 'Booth not found.');
  // A booth stays in its ward so existing voter records remain consistent.
  const clean = validateBooth(db, { ...input, wardId: booth.wardId }, id);
  const summary = `Booth ${booth.number} – ${booth.name} → Booth ${clean.number} – ${clean.name}`;
  Object.assign(booth, clean);
  addAudit(db, actor, 'Booth updated', 'Booth', id, summary);
  saveDb();
  return { ...booth };
}

/** Sets exactly which BL admins are assigned to a ward. Removing a ward also removes its booth assignments. */
export function setWardAdmins(token: string | null, wardId: string, adminIds: string[]): void {
  const db = loadDb();
  const actor = authenticate(db, token);
  requireSuper(actor);
  if (!db.wards.some((w) => w.id === wardId)) fail(404, 'NOT_FOUND', 'Ward not found.');
  const wardOf = boothWardOf(db);
  const changed: string[] = [];
  for (const a of db.admins.filter((x) => x.role === 'BL_ADMIN')) {
    const has = a.wardIds.includes(wardId);
    const want = adminIds.includes(a.id);
    if (want && !has) {
      a.wardIds = [...a.wardIds, wardId];
      changed.push(`+${a.id}`);
    } else if (!want && has) {
      a.wardIds = a.wardIds.filter((w) => w !== wardId);
      a.boothIds = a.boothIds.filter((b) => wardOf(b) !== wardId);
      changed.push(`-${a.id}`);
    }
  }
  if (changed.length) addAudit(db, actor, 'Ward assignment changed', 'Ward', wardId, `Ward ${wardNumber(db, wardId)}: ${changed.join(', ')}`);
  saveDb();
}

/** Sets which BL admins are limited to this booth. Assigning a booth also assigns its ward. */
export function setBoothAdmins(token: string | null, boothId: string, adminIds: string[]): void {
  const db = loadDb();
  const actor = authenticate(db, token);
  requireSuper(actor);
  const booth = db.booths.find((b) => b.id === boothId);
  if (!booth) fail(404, 'NOT_FOUND', 'Booth not found.');
  const changed: string[] = [];
  for (const a of db.admins.filter((x) => x.role === 'BL_ADMIN')) {
    const has = a.boothIds.includes(boothId);
    const want = adminIds.includes(a.id);
    if (want && !has) {
      a.boothIds = [...a.boothIds, boothId];
      if (!a.wardIds.includes(booth.wardId)) a.wardIds = [...a.wardIds, booth.wardId];
      changed.push(`+${a.id}`);
    } else if (!want && has) {
      a.boothIds = a.boothIds.filter((b) => b !== boothId);
      changed.push(`-${a.id}`);
    }
  }
  if (changed.length) addAudit(db, actor, 'Booth assignment changed', 'Booth', boothId, `Booth ${booth.number}: ${changed.join(', ')}`);
  saveDb();
}

// ---------------------------------------------------------------- Voters

function validateVoterInput(db: MockDb, input: VoterInput, excludeRecordId?: string): VoterInput {
  const errors: Record<string, string> = {};
  const voterId = (input.voterId ?? '').trim();
  const fullName = (input.fullName ?? '').trim();
  const houseNumber = (input.houseNumber ?? '').trim();
  const householdId = (input.householdId ?? '').trim();
  const address = (input.address ?? '').trim();
  const mobileRaw = (input.mobile ?? '').trim();
  if (!voterId) errors.voterId = 'Voter ID is required';
  if (fullName.length < 2) errors.fullName = 'Full name is required';
  if (!houseNumber) errors.houseNumber = 'House number is required';
  if (mobileRaw && !isValidIndianMobile(mobileRaw)) errors.mobile = 'Enter a valid 10-digit Indian mobile number';
  if (!db.wards.some((w) => w.id === input.wardId)) errors.wardId = 'Select a valid ward';
  else if (!db.booths.some((b) => b.id === input.boothId && b.wardId === input.wardId)) errors.boothId = 'Select a booth in this ward';
  if (!VOTER_STATUSES.includes(input.status)) errors.status = 'Select a voter status';
  if (householdId) {
    if (!HOUSEHOLD_ID_PATTERN.test(householdId)) errors.householdId = 'Use letters, numbers, - or / only';
    else {
      const other = db.voters.find((v) => v.recordId !== excludeRecordId && v.householdId.toUpperCase() === householdId.toUpperCase());
      if (other && other.wardId !== input.wardId) errors.householdId = 'This household belongs to a different ward';
    }
  }
  if (Object.keys(errors).length) fail(400, 'VALIDATION', 'Please correct the highlighted fields.', errors);
  if (db.voters.some((v) => v.recordId !== excludeRecordId && v.voterId.toUpperCase() === voterId.toUpperCase())) {
    fail(409, 'CONFLICT', 'A voter with this Voter ID already exists.', { voterId: 'This Voter ID already exists' });
  }
  return {
    voterId,
    fullName,
    mobile: mobileRaw ? normalizeMobile(mobileRaw) : '',
    wardId: input.wardId,
    boothId: input.boothId,
    houseNumber,
    householdId,
    address,
    status: input.status,
  };
}

function filterVoters(db: MockDb, admin: Admin, q: VoterQuery, latest: Map<string, DonationTransaction>): Voter[] {
  const search = (q.search ?? '').trim().toLowerCase();
  const digits = search.replace(/\D/g, '');
  return db.voters.filter((v) => {
    const mine = covers(db, admin, v);
    if (q.scope === 'mine' && !mine) return false;
    if (q.wardId && v.wardId !== q.wardId) return false;
    if (q.boothId && v.boothId !== q.boothId) return false;
    if (q.status && v.status !== q.status) return false;
    if (q.donationStatus) {
      const received = latest.has(v.recordId);
      if ((q.donationStatus === 'Received') !== received) return false;
    }
    if (search) {
      const hit =
        v.fullName.toLowerCase().includes(search) ||
        v.voterId.toLowerCase().includes(search) ||
        v.householdId.toLowerCase().includes(search) ||
        v.houseNumber.toLowerCase().includes(search) ||
        (digits.length >= 3 && v.mobile.includes(digits));
      if (!hit) return false;
    }
    return true;
  });
}

function sortVoters(db: MockDb, items: Voter[], q: VoterQuery): Voter[] {
  const dir = q.sortDir === 'desc' ? -1 : 1;
  const by = q.sortBy ?? 'ward';
  const key = (v: Voter): string | number => {
    switch (by) {
      case 'ward':
        return wardNumber(db, v.wardId) * 100000 + boothNumber(db, v.boothId);
      case 'booth':
        return boothNumber(db, v.boothId);
      default:
        return v[by].toLowerCase();
    }
  };
  return [...items].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    const c = typeof ka === 'number' && typeof kb === 'number' ? ka - kb : String(ka).localeCompare(String(kb), 'en', { numeric: true });
    return c !== 0 ? c * dir : a.recordId.localeCompare(b.recordId);
  });
}

export function listVoters(token: string | null, q: VoterQuery = {}): Paginated<VoterListItem> {
  const db = loadDb();
  const admin = authenticate(db, token);
  const latest = latestSuccessByVoter(db);
  const sorted = sortVoters(db, filterVoters(db, admin, q, latest), q);
  const page = paginate(sorted, q.page, q.pageSize);
  return { ...page, items: page.items.map((v) => toListItem(db, admin, v, latest)) };
}

export function exportVoters(token: string | null, q: VoterQuery = {}): VoterListItem[] {
  const db = loadDb();
  const admin = authenticate(db, token);
  requireSuper(admin);
  const latest = latestSuccessByVoter(db);
  const rows = sortVoters(db, filterVoters(db, admin, q, latest), q).map((v) => toListItem(db, admin, v, latest));
  addAudit(db, admin, 'Voters exported', 'Export', 'voters', `${rows.length} voter records`);
  saveDb();
  return rows;
}

export function getVoter(token: string | null, recordId: string): VoterDetail {
  const db = loadDb();
  const admin = authenticate(db, token);
  const voter = db.voters.find((v) => v.recordId === recordId);
  if (!voter) fail(404, 'NOT_FOUND', 'Voter not found.');
  const item = toListItem(db, admin, voter, latestSuccessByVoter(db));
  const transactions = db.transactions
    .filter((t) => t.voterRecordId === recordId)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .map((t) => ({ ...t }));
  return { voter: item, transactions };
}

export function checkVoterDuplicate(
  token: string | null,
  p: { voterId: string; fullName: string; houseNumber: string; wardId: string; excludeRecordId?: string },
): DuplicateCheckResult {
  const db = loadDb();
  requireSuper(authenticate(db, token));
  const id = p.voterId.trim().toUpperCase();
  const name = p.fullName.trim().toLowerCase();
  const house = p.houseNumber.trim().toLowerCase();
  const others = db.voters.filter((v) => v.recordId !== p.excludeRecordId);
  return {
    voterIdExists: !!id && others.some((v) => v.voterId.toUpperCase() === id),
    similar:
      name && house
        ? others
            .filter((v) => v.wardId === p.wardId && v.fullName.toLowerCase() === name && v.houseNumber.toLowerCase() === house)
            .slice(0, 5)
            .map((v) => ({ recordId: v.recordId, voterId: v.voterId, fullName: v.fullName, houseNumber: v.houseNumber }))
        : [],
  };
}

export function createVoter(token: string | null, input: VoterInput): Voter {
  const db = loadDb();
  const actor = authenticate(db, token);
  requireSuper(actor);
  const clean = validateVoterInput(db, input);
  db.counters.voter++;
  const ts = nowIso();
  const voter: Voter = { recordId: `VR-${pad(db.counters.voter, 6)}`, ...clean, createdAt: ts, updatedAt: ts };
  db.voters.push(voter);
  addAudit(db, actor, 'Voter created', 'Voter', voter.voterId, `${voter.fullName}, ward ${wardNumber(db, voter.wardId)}, booth ${boothNumber(db, voter.boothId)}, ${voter.status}`);
  saveDb();
  return { ...voter };
}

export function updateVoter(token: string | null, recordId: string, input: VoterInput): Voter {
  const db = loadDb();
  const actor = authenticate(db, token);
  requireSuper(actor);
  const voter = db.voters.find((v) => v.recordId === recordId);
  if (!voter) fail(404, 'NOT_FOUND', 'Voter not found.');
  const clean = validateVoterInput(db, input, recordId);
  const labels: Record<keyof VoterInput, string> = {
    voterId: 'Voter ID', fullName: 'name', mobile: 'mobile', wardId: 'ward', boothId: 'booth',
    houseNumber: 'house number', householdId: 'household ID', address: 'address', status: 'status',
  };
  const changed = (Object.keys(labels) as (keyof VoterInput)[]).filter((k) => k !== 'status' && voter[k] !== clean[k]).map((k) => labels[k]);
  const statusChange = voter.status !== clean.status ? `${voter.status} → ${clean.status}` : '';
  Object.assign(voter, clean, { updatedAt: nowIso() });
  if (changed.length) addAudit(db, actor, 'Voter updated', 'Voter', voter.voterId, `Changed ${changed.join(', ')}`);
  if (statusChange) addAudit(db, actor, 'Voter status changed', 'Voter', voter.voterId, statusChange);
  saveDb();
  return { ...voter };
}

// ---------------------------------------------------------------- Imports

interface ImportJob {
  adminId: string;
  fileName: string;
  imported: number;
  skipped: number;
  failed: number;
  errors: { rowNumber: number; message: string }[];
}
const importJobs = new Map<string, ImportJob>();

export function importContext(token: string | null): ImportContext {
  const db = loadDb();
  requireSuper(authenticate(db, token));
  const households = new Map<string, string>();
  for (const v of db.voters) if (v.householdId) households.set(v.householdId.toUpperCase(), v.wardId);
  return { existingVoterIds: db.voters.map((v) => v.voterId.toUpperCase()), households: [...households.entries()] };
}

export function startImport(token: string | null, fileName: string): { importId: string } {
  const db = loadDb();
  const admin = authenticate(db, token);
  requireSuper(admin);
  const importId = randomId();
  importJobs.set(importId, { adminId: admin.id, fileName, imported: 0, skipped: 0, failed: 0, errors: [] });
  return { importId };
}

export function importBatch(token: string | null, importId: string, rows: ImportRow[]): ImportResult {
  const db = loadDb();
  const admin = authenticate(db, token);
  requireSuper(admin);
  const job = importJobs.get(importId);
  if (!job || job.adminId !== admin.id) fail(404, 'NOT_FOUND', 'Import session not found. Start the import again.');
  const result: ImportResult = { imported: 0, skipped: 0, failed: 0, errors: [] };
  for (const row of rows) {
    try {
      const clean = validateVoterInput(db, row.voter);
      db.counters.voter++;
      const ts = nowIso();
      db.voters.push({ recordId: `VR-${pad(db.counters.voter, 6)}`, ...clean, createdAt: ts, updatedAt: ts });
      result.imported++;
    } catch (e) {
      const err = e as ApiError;
      if (err.code === 'CONFLICT') result.skipped++;
      else result.failed++;
      const detail = err.fieldErrors ? Object.values(err.fieldErrors).join('; ') : err.message;
      result.errors.push({ rowNumber: row.rowNumber, message: detail });
    }
  }
  job.imported += result.imported;
  job.skipped += result.skipped;
  job.failed += result.failed;
  job.errors.push(...result.errors);
  saveDb();
  return result;
}

export function finishImport(token: string | null, importId: string, skippedBeforeUpload: number): ImportResult {
  const db = loadDb();
  const admin = authenticate(db, token);
  requireSuper(admin);
  const job = importJobs.get(importId);
  if (!job || job.adminId !== admin.id) fail(404, 'NOT_FOUND', 'Import session not found.');
  importJobs.delete(importId);
  const total: ImportResult = { imported: job.imported, skipped: job.skipped + Math.max(0, skippedBeforeUpload), failed: job.failed, errors: job.errors };
  addAudit(
    db,
    admin,
    'Voters imported',
    'Import',
    job.fileName,
    `${total.imported} imported, ${total.skipped} skipped, ${total.failed} failed`,
    total.imported > 0 || total.failed === 0 ? 'Success' : 'Failure',
  );
  saveDb();
  return total;
}

// ---------------------------------------------------------------- Settings

export function getSettings(token: string | null): SettingsResponse {
  const db = loadDb();
  requireSuper(authenticate(db, token));
  return {
    settings: { ...db.settings },
    history: [...db.settingsHistory].sort((a, b) => b.changedAt.localeCompare(a.changedAt)),
    currentAmount: currentAmount(db),
  };
}

export function updateSettings(token: string | null, input: Omit<DonationSettings, 'currency'>): SettingsResponse {
  const db = loadDb();
  const actor = authenticate(db, token);
  requireSuper(actor);
  const amount = Number(input.defaultAmount);
  if (!Number.isInteger(amount) || amount <= 0 || amount > MAX_DONATION_AMOUNT) {
    fail(400, 'VALIDATION', 'Enter a valid amount.', { defaultAmount: 'Enter a whole amount between ₹1 and ₹1,00,000' });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveDate ?? '')) fail(400, 'VALIDATION', 'Enter a valid date.', { effectiveDate: 'Enter a valid date' });
  const prev = db.settings;
  const next: DonationSettings = {
    defaultAmount: amount,
    currency: 'INR',
    effectiveDate: input.effectiveDate,
    allowAmountOverride: !!input.allowAmountOverride,
  };
  const changes: string[] = [];
  if (prev.defaultAmount !== next.defaultAmount) changes.push(`amount ₹${prev.defaultAmount.toLocaleString('en-IN')} → ₹${next.defaultAmount.toLocaleString('en-IN')}`);
  if (prev.effectiveDate !== next.effectiveDate) changes.push(`effective ${next.effectiveDate}`);
  if (prev.allowAmountOverride !== next.allowAmountOverride) changes.push(`amount changes ${next.allowAmountOverride ? 'allowed' : 'locked'}`);
  if (changes.length) {
    db.settings = next;
    if (prev.defaultAmount !== next.defaultAmount || prev.effectiveDate !== next.effectiveDate) {
      db.counters.settings++;
      db.settingsHistory.push({
        id: `CFG-${db.counters.settings}`,
        changedAt: nowIso(),
        changedBy: actor.id,
        defaultAmount: next.defaultAmount,
        effectiveDate: next.effectiveDate,
        summary: changes.join('; '),
      });
    }
    addAudit(db, actor, 'Donation settings changed', 'Settings', 'donation-settings', changes.join('; '));
    saveDb();
  }
  return getSettings(token);
}

// ---------------------------------------------------------------- Donations

export function donationContext(token: string | null): DonationContext {
  const db = loadDb();
  authenticate(db, token);
  return {
    suggestedAmount: currentAmount(db),
    amountEditable: db.settings.allowAmountOverride,
  };
}

export function recordDonation(token: string | null, input: DonationInput): DonationTransaction {
  const db = loadDb();
  const admin = authenticate(db, token);

  // A retried request with the same key returns the original transaction instead of creating another.
  const replay = input.idempotencyKey ? db.idempotency[input.idempotencyKey] : undefined;
  if (replay) {
    const tx = db.transactions.find((t) => t.id === replay);
    if (tx) return { ...tx };
  }

  const voter = db.voters.find((v) => v.recordId === input.voterRecordId);
  if (!voter) fail(404, 'NOT_FOUND', 'Voter not found.');

  const errors: Record<string, string> = {};
  const amount = Number(input.amount);
  const receiverName = (input.receiverName ?? '').trim();
  const receiverMobile = (input.receiverMobile ?? '').trim();
  if (!Number.isInteger(amount) || amount <= 0 || amount > MAX_DONATION_AMOUNT) errors.amount = 'Enter a whole amount between ₹1 and ₹1,00,000';
  if (receiverName.length < 2) errors.receiverName = 'Receiver name is required';
  if (!isValidIndianMobile(receiverMobile)) errors.receiverMobile = 'Enter a valid 10-digit Indian mobile number';
  const ctx = donationContext(token);
  if (!errors.amount && !ctx.amountEditable && amount !== ctx.suggestedAmount) {
    errors.amount = `Amount must be ₹${ctx.suggestedAmount.toLocaleString('en-IN')}`;
  }
  if (Object.keys(errors).length) fail(400, 'VALIDATION', 'Please correct the highlighted fields.', errors);

  // One successful donation per voter. A cancelled or reversed one does not count.
  const existing = db.transactions.find((t) => t.voterRecordId === voter.recordId && t.status === 'Success');
  if (existing) fail(409, 'CONFLICT', `This voter has already received a donation (${existing.id}).`);

  db.counters.txn++;
  const tx: DonationTransaction = {
    id: `TXN-${pad(db.counters.txn, 6)}`,
    voterRecordId: voter.recordId,
    voterId: voter.voterId,
    voterName: voter.fullName,
    wardId: voter.wardId,
    boothId: voter.boothId,
    amount,
    receiverName,
    receiverMobile: normalizeMobile(receiverMobile),
    timestamp: nowIso(),
    adminId: admin.id,
    adminName: admin.fullName,
    status: 'Success',
  };
  db.transactions.push(tx);
  if (input.idempotencyKey) db.idempotency[input.idempotencyKey] = tx.id;
  addAudit(db, admin, 'Donation recorded', 'Donation', tx.id, `₹${amount.toLocaleString('en-IN')} to ${receiverName} for voter ${voter.voterId}`);
  saveDb();
  return { ...tx };
}

/** Every admin may view every transaction; kept as one place to tighten the rule later. */
function transactionVisible(_db: MockDb, _admin: Admin, _t: DonationTransaction): boolean {
  return true;
}

function filterTransactions(db: MockDb, admin: Admin, q: DonationQuery): DonationTransaction[] {
  const search = (q.search ?? '').trim().toLowerCase();
  return db.transactions
    .filter((t) => {
      if (!transactionVisible(db, admin, t)) return false;
      if (!inDateRange(t.timestamp, q.from, q.to)) return false;
      if (q.wardId && t.wardId !== q.wardId) return false;
      if (q.boothId && t.boothId !== q.boothId) return false;
      if (q.adminId && admin.role === 'SUPER_ADMIN' && t.adminId !== q.adminId) return false;
      if (q.status && t.status !== q.status) return false;
      if (search) {
        return (
          t.id.toLowerCase().includes(search) ||
          t.voterName.toLowerCase().includes(search) ||
          t.voterId.toLowerCase().includes(search) ||
          t.receiverName.toLowerCase().includes(search) ||
          t.receiverMobile.includes(search)
        );
      }
      return true;
    })
    .sort((a, b) => {
      const by = q.sortBy ?? 'timestamp';
      const dir = (q.sortDir ?? (by === 'timestamp' ? 'desc' : 'asc')) === 'desc' ? -1 : 1;
      const c = by === 'amount' ? a.amount - b.amount : String(a[by]).localeCompare(String(b[by]), 'en', { numeric: true });
      return c !== 0 ? c * dir : b.timestamp.localeCompare(a.timestamp);
    });
}

export function listDonations(token: string | null, q: DonationQuery = {}): Paginated<DonationTransaction> {
  const db = loadDb();
  const admin = authenticate(db, token);
  return paginate(filterTransactions(db, admin, q).map((t) => ({ ...t })), q.page, q.pageSize);
}

export function exportDonations(token: string | null, q: DonationQuery = {}): DonationTransaction[] {
  const db = loadDb();
  const admin = authenticate(db, token);
  const rows = filterTransactions(db, admin, q).map((t) => ({ ...t }));
  addAudit(db, admin, 'Donations exported', 'Export', 'donations', `${rows.length} transactions`);
  saveDb();
  return rows;
}

export function getDonation(token: string | null, id: string): TransactionDetail {
  const db = loadDb();
  const admin = authenticate(db, token);
  const tx = db.transactions.find((t) => t.id === id);
  if (!tx || !transactionVisible(db, admin, tx)) fail(404, 'NOT_FOUND', 'Transaction not found.');
  const audit = db.audit.filter((a) => a.recordRef === id).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return { transaction: { ...tx }, audit };
}

export function cancelDonation(token: string | null, id: string, input: CancelDonationInput): DonationTransaction {
  const db = loadDb();
  const actor = authenticate(db, token);
  requireSuper(actor);
  const tx = db.transactions.find((t) => t.id === id);
  if (!tx) fail(404, 'NOT_FOUND', 'Transaction not found.');
  if (tx.status !== 'Success') fail(409, 'CONFLICT', `This transaction is already ${tx.status.toLowerCase()}.`);
  const reason = (input.reason ?? '').trim();
  if (reason.length < 3) fail(400, 'VALIDATION', 'A reason is required.', { reason: 'Enter a reason (at least 3 characters)' });
  if (input.kind !== 'Cancelled' && input.kind !== 'Reversed') fail(400, 'VALIDATION', 'Choose cancel or reverse.');
  tx.status = input.kind;
  tx.statusReason = reason;
  addAudit(db, actor, input.kind === 'Cancelled' ? 'Donation cancelled' : 'Donation reversed', 'Donation', id, reason);
  saveDb();
  return { ...tx };
}

// ---------------------------------------------------------------- Reports & dashboard

function scopedVoters(db: MockDb, admin: Admin, f: ReportFilters): Voter[] {
  return db.voters.filter(
    (v) => covers(db, admin, v) && (!f.wardId || v.wardId === f.wardId) && (!f.boothId || v.boothId === f.boothId),
  );
}

function scopedSuccessTx(db: MockDb, admin: Admin, voterIds: Set<string>, f: ReportFilters): DonationTransaction[] {
  return db.transactions.filter(
    (t) =>
      t.status === 'Success' &&
      voterIds.has(t.voterRecordId) &&
      inDateRange(t.timestamp, f.from, f.to) &&
      (!f.adminId || admin.role !== 'SUPER_ADMIN' || t.adminId === f.adminId),
  );
}

function groupRows(voters: Voter[], txs: DonationTransaction[], keyOf: (v: { wardId: string; boothId: string }) => string, labelOf: (key: string) => string, keys: string[]): GroupRow[] {
  const rows = new Map<string, GroupRow>();
  for (const k of keys) rows.set(k, { key: k, label: labelOf(k), voters: 0, active: 0, notActive: 0, shifted: 0, received: 0, notReceived: 0, transactions: 0, amount: 0 });
  const receivedIds = new Set(txs.map((t) => t.voterRecordId));
  for (const v of voters) {
    const r = rows.get(keyOf(v));
    if (!r) continue;
    r.voters++;
    if (v.status === 'Active') r.active++;
    else if (v.status === 'Not Active') r.notActive++;
    else r.shifted++;
    if (receivedIds.has(v.recordId)) r.received++;
    else r.notReceived++;
  }
  // Transactions are grouped by the voter's current location so they line up with voter counts.
  const voterLoc = new Map(voters.map((v) => [v.recordId, v]));
  for (const t of txs) {
    const v = voterLoc.get(t.voterRecordId);
    const r = v ? rows.get(keyOf(v)) : undefined;
    if (!r) continue;
    r.transactions++;
    r.amount += t.amount;
  }
  return [...rows.values()];
}

function buildAggregates(db: MockDb, admin: Admin, f: ReportFilters) {
  const voters = scopedVoters(db, admin, f);
  const voterIds = new Set(voters.map((v) => v.recordId));
  const txs = scopedSuccessTx(db, admin, voterIds, f);
  const receivedVoters = new Set(txs.map((t) => t.voterRecordId));
  const wardIds = [...new Set(voters.map((v) => v.wardId))];
  const boothIds = [...new Set(voters.map((v) => v.boothId))];
  // Include assigned/selected wards with zero voters so they still show in charts.
  for (const w of db.wards) {
    const inScope = admin.role === 'SUPER_ADMIN' ? !f.wardId || f.wardId === w.id : admin.wardIds.includes(w.id) && (!f.wardId || f.wardId === w.id);
    if (inScope && !wardIds.includes(w.id) && !f.boothId) wardIds.push(w.id);
  }
  wardIds.sort((a, b) => wardNumber(db, a) - wardNumber(db, b));
  boothIds.sort((a, b) => boothNumber(db, a) - boothNumber(db, b));
  const byWard = groupRows(voters, txs, (v) => v.wardId, (k) => `Ward ${wardNumber(db, k)}`, wardIds);
  const byBooth = groupRows(voters, txs, (v) => v.boothId, (k) => `Booth ${boothNumber(db, k)}`, boothIds);
  const adminMap = new Map<string, { adminId: string; adminName: string; transactions: number; amount: number; voters: Set<string> }>();
  for (const t of txs) {
    const row = adminMap.get(t.adminId) ?? { adminId: t.adminId, adminName: t.adminName, transactions: 0, amount: 0, voters: new Set<string>() };
    row.transactions++;
    row.amount += t.amount;
    row.voters.add(t.voterRecordId);
    adminMap.set(t.adminId, row);
  }
  const byAdmin = [...adminMap.values()]
    .sort((a, b) => b.amount - a.amount)
    .map(({ voters: vs, ...rest }) => ({ ...rest, uniqueVoters: vs.size }));
  return { voters, txs, receivedVoters, byWard, byBooth, byAdmin };
}

export function dashboard(token: string | null, f: ReportFilters = {}): DashboardStats {
  const db = loadDb();
  const admin = authenticate(db, token);
  const isSuper = admin.role === 'SUPER_ADMIN';
  const { voters, txs, receivedVoters, byWard, byBooth, byAdmin } = buildAggregates(db, admin, f);

  const end = f.to ? new Date(`${f.to}T00:00:00`) : new Date();
  const start = f.from ? new Date(`${f.from}T00:00:00`) : new Date(end.getTime() - 29 * 86400000);
  const perDay = new Map<string, { amount: number; transactions: number }>();
  for (const t of txs) {
    const d = localDate(t.timestamp);
    const e = perDay.get(d) ?? { amount: 0, transactions: 0 };
    e.amount += t.amount;
    e.transactions++;
    perDay.set(d, e);
  }
  const overTime: DashboardStats['overTime'] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  for (let i = 0; i < 366 && cursor <= end; i++) {
    const d = toDateInput(cursor);
    overTime.push({ date: d, ...(perDay.get(d) ?? { amount: 0, transactions: 0 }) });
    cursor.setDate(cursor.getDate() + 1);
  }

  // Everything this admin recorded, including donations to voters outside their wards.
  const mine = db.transactions.filter((t) => t.status === 'Success' && t.adminId === admin.id && inDateRange(t.timestamp, f.from, f.to));
  const visibleRecent = db.transactions
    .filter(
      (t) =>
        (isSuper || t.adminId === admin.id || covers(db, admin, t)) &&
        inDateRange(t.timestamp, f.from, f.to) &&
        (!f.wardId || t.wardId === f.wardId) &&
        (!f.boothId || t.boothId === f.boothId),
    )
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 8)
    .map((t) => ({ ...t }));
  const recentActivity = db.audit
    .filter((a) => (isSuper || a.adminId === admin.id) && a.entity !== 'Auth')
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 8);

  return {
    totalAdmins: isSuper ? db.admins.filter((a) => a.role === 'BL_ADMIN').length : null,
    totalVoters: voters.length,
    totalWards: byWard.length,
    totalBooths: isSuper ? db.booths.filter((b) => (!f.wardId || b.wardId === f.wardId) && (!f.boothId || b.id === f.boothId)).length : byBooth.length,
    activeVoters: voters.filter((v) => v.status === 'Active').length,
    notActiveVoters: voters.filter((v) => v.status === 'Not Active').length,
    shiftedVoters: voters.filter((v) => v.status === 'Shifted').length,
    votersReceived: receivedVoters.size,
    votersNotReceived: voters.length - receivedVoters.size,
    totalTransactions: txs.length,
    totalAmount: txs.reduce((s, t) => s + t.amount, 0),
    myTransactions: mine.length,
    myAmount: mine.reduce((s, t) => s + t.amount, 0),
    byWard,
    byBooth,
    byAdmin: isSuper ? byAdmin.map(({ uniqueVoters: _u, ...r }) => r) : [],
    overTime,
    recentTransactions: visibleRecent,
    recentActivity,
  };
}

export function report(token: string | null, f: ReportFilters = {}): ReportData {
  const db = loadDb();
  const admin = authenticate(db, token);
  const { voters, txs, receivedVoters, byWard, byBooth, byAdmin } = buildAggregates(db, admin, f);
  const group = (keyOf: (t: DonationTransaction) => string) => {
    const m = new Map<string, { transactions: number; amount: number; voters: Set<string> }>();
    for (const t of txs) {
      const k = keyOf(t);
      const e = m.get(k) ?? { transactions: 0, amount: 0, voters: new Set<string>() };
      e.transactions++;
      e.amount += t.amount;
      e.voters.add(t.voterRecordId);
      m.set(k, e);
    }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  };
  return {
    summary: {
      totalVoters: voters.length,
      active: voters.filter((v) => v.status === 'Active').length,
      notActive: voters.filter((v) => v.status === 'Not Active').length,
      shifted: voters.filter((v) => v.status === 'Shifted').length,
      votersReceived: receivedVoters.size,
      votersNotReceived: voters.length - receivedVoters.size,
      transactions: txs.length,
      amount: txs.reduce((s, t) => s + t.amount, 0),
    },
    byWard,
    byBooth,
    byAdmin: admin.role === 'SUPER_ADMIN' ? byAdmin : byAdmin.filter((a) => a.adminId === admin.id),
    daily: group((t) => localDate(t.timestamp)).map(([date, e]) => ({ date, transactions: e.transactions, uniqueVoters: e.voters.size, amount: e.amount })),
    monthly: group((t) => localDate(t.timestamp).slice(0, 7)).map(([month, e]) => ({ month, transactions: e.transactions, uniqueVoters: e.voters.size, amount: e.amount })),
  };
}

export function logReportExport(token: string | null, name: string, format: 'CSV' | 'Excel'): void {
  const db = loadDb();
  const admin = authenticate(db, token);
  addAudit(db, admin, 'Report exported', 'Export', name, `${name} exported as ${format}`);
  saveDb();
}

// ---------------------------------------------------------------- Audit & notifications

export function listAudit(token: string | null, q: AuditQuery = {}): Paginated<AuditLog> {
  const db = loadDb();
  requireSuper(authenticate(db, token));
  const search = (q.search ?? '').trim().toLowerCase();
  const items = db.audit
    .filter(
      (a) =>
        (!q.entity || a.entity === q.entity) &&
        (!q.adminId || a.adminId === q.adminId) &&
        (!q.recordRef || a.recordRef === q.recordRef) &&
        inDateRange(a.timestamp, q.from, q.to) &&
        (!search ||
          a.action.toLowerCase().includes(search) ||
          a.recordRef.toLowerCase().includes(search) ||
          a.summary.toLowerCase().includes(search) ||
          a.adminId.toLowerCase().includes(search) ||
          a.adminName.toLowerCase().includes(search)),
    )
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return paginate(items, q.page, q.pageSize);
}

export function notifications(token: string | null): Notification[] {
  const db = loadDb();
  const admin = authenticate(db, token);
  if (admin.role === 'SUPER_ADMIN') {
    return db.audit
      .filter((a) => a.adminId !== admin.id && a.action !== 'Logged in')
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, 10)
      .map((a) => ({ id: a.id, title: `${a.action} · ${a.adminId}`, body: a.summary, timestamp: a.timestamp }));
  }
  const fromTx = db.transactions
    .filter((t) => t.adminId !== admin.id && covers(db, admin, t))
    .map((t) => ({
      id: t.id,
      title: t.status === 'Success' ? `Donation recorded by ${t.adminId}` : `Donation ${t.status.toLowerCase()}`,
      body: `${t.voterName} (${t.voterId}) · ₹${t.amount.toLocaleString('en-IN')}`,
      timestamp: t.timestamp,
    }));
  const fromSettings = db.audit
    .filter((a) => a.entity === 'Settings')
    .map((a) => ({ id: a.id, title: 'Donation settings updated', body: a.summary, timestamp: a.timestamp }));
  return [...fromTx, ...fromSettings].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 10);
}
