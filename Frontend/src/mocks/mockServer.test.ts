import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../services/apiError';
import * as api from './mockServer';

const PASSWORD = 'test-pass-1';
const SUPER_MOBILE = '9000000001';
const C1_MOBILE = '9876543210'; // Corporator C-1: wards W1, W2
const C2_MOBILE = '9876500011'; // Corporator C-2: ward W3
const BLO_MOBILE = '9876543211'; // C-1-BLO1: ward W1, booths B1-1 and B1-2

function loginAs(mobile: string, password = PASSWORD) {
  return api.login(mobile, password, false, 'test').token;
}

function expectError(fn: () => unknown, status: number) {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ApiError);
    expect((e as ApiError).status).toBe(status);
    return e as ApiError;
  }
  throw new Error(`Expected an error with status ${status}`);
}

/** A voter (visible to this admin) who has not received a payment yet. */
function notReceivedVoter(token: string, wardId?: string) {
  const page = api.listVoters(token, { wardId, paymentStatus: 'Not Received', pageSize: 1 });
  return page.items[0];
}

const pay = (voterRecordId: string, idempotencyKey: string) => ({ voterRecordId, amount: 2000, receiverName: 'Ravi', receiverMobile: '9123412345', idempotencyKey });

beforeEach(() => {
  vi.stubEnv('VITE_MOCK_PASSWORD', PASSWORD);
  api.resetMockDb();
});

describe('authentication', () => {
  it('logs in with mobile number and password', () => {
    expect(api.login(`+91 ${C1_MOBILE}`, PASSWORD, false, 'test').admin.id).toBe('C-1');
    expect(api.login(BLO_MOBILE, PASSWORD, false, 'test').admin).toMatchObject({ id: 'C-1-BLO1', role: 'BLO', corporatorId: 'C-1' });
  });

  it('rejects wrong passwords and deactivated accounts', () => {
    expectError(() => api.login(C1_MOBILE, 'wrong', false, 'test'), 401);
    expectError(() => api.login('8098765432', PASSWORD, false, 'test'), 403); // C-4 is inactive
  });

  it('also signs in with the full name, ignoring case and extra spaces', () => {
    expect(api.login('  ramesh   BABU ', PASSWORD, false, 'test').admin.id).toBe('C-1');
    expect(api.login('Super Administrator', PASSWORD, false, 'test').admin.id).toBe('SA-1');
    expectError(() => api.login('Ramesh Babu', 'wrong', false, 'test'), 401);
    expectError(() => api.login('Nobody Here', PASSWORD, false, 'test'), 401);
  });

  it('same names are told apart by password, and a name + password pair cannot repeat', () => {
    const sa = loginAs(SUPER_MOBILE);
    const base = { fullName: 'Ravi Kumar', wardIds: ['W1'], boothIds: [], role: 'CORPORATOR' as const };
    const first = api.createAdmin(sa, { ...base, mobile: '9988776601', password: 'firstPass1' });
    const second = api.createAdmin(sa, { ...base, mobile: '9988776602', password: 'secondPass2' });
    expect(api.login('Ravi Kumar', 'firstPass1', false, 'test').admin.id).toBe(first.id);
    expect(api.login('ravi kumar', 'secondPass2', false, 'test').admin.id).toBe(second.id);
    // Creating, resetting or changing to a password another "Ravi Kumar" already uses is refused.
    expect(expectError(() => api.createAdmin(sa, { ...base, mobile: '9988776603', password: 'firstPass1' }), 400).fieldErrors?.password).toMatch(/already uses this password/);
    expect(expectError(() => api.setAdminPassword(sa, second.id, 'firstPass1'), 400).fieldErrors?.password).toBeDefined();
    const token = api.login('9988776602', 'secondPass2', false, 'test').token;
    expect(expectError(() => api.changePassword(token, 'secondPass2', 'firstPass1'), 400).fieldErrors?.newPassword).toBeDefined();
    // A different name may reuse the password.
    expect(api.createAdmin(sa, { ...base, fullName: 'Ravi Teja', mobile: '9988776604', password: 'firstPass1' }).id).toBeDefined();
  });

  it('rejects missing or unknown tokens', () => {
    expect(expectError(() => api.me('nope'), 401).code).toBe('SESSION_EXPIRED');
  });
});

describe('payments', () => {
  it('records the transaction with server data and marks the voter Received', () => {
    const token = loginAs(C1_MOBILE);
    const voter = notReceivedVoter(token);
    const before = Date.now();
    const tx = api.recordPayment(token, { ...pay(voter.recordId, 'k1'), receiverName: 'Someone Else' });
    expect(tx.id).toMatch(/^TXN-\d+$/);
    expect(tx.adminId).toBe('C-1');
    expect(new Date(tx.timestamp).getTime()).toBeGreaterThanOrEqual(before);
    const detail = api.getVoter(token, voter.recordId);
    expect(detail.voter.paymentStatus).toBe('Received');
    expect(detail.voter.latestPayment?.receiverName).toBe('Someone Else');
    // Receiver details never overwrite the voter's own details, and voter status is untouched.
    expect(detail.voter.fullName).toBe(voter.fullName);
    expect(detail.voter.mobile).toBe(voter.mobile);
    expect(detail.voter.status).toBe(voter.status);
  });

  it('blocks a second payment to the same voter', () => {
    const token = loginAs(C1_MOBILE);
    const voter = notReceivedVoter(token);
    api.recordPayment(token, pay(voter.recordId, 'a'));
    expect(expectError(() => api.recordPayment(token, pay(voter.recordId, 'b')), 409).code).toBe('CONFLICT');
  });

  it('one person may receive for every member of a household, but each voter is paid only once', () => {
    const sa = loginAs(SUPER_MOBILE);
    const voters = api.listVoters(sa, { paymentStatus: 'Not Received', pageSize: 500 }).items;
    const byHousehold = new Map<string, typeof voters>();
    for (const v of voters) byHousehold.set(v.householdId, [...(byHousehold.get(v.householdId) ?? []), v]);
    const members = [...byHousehold.values()].find((m) => m.length >= 2)!;
    expect(members).toBeDefined();
    const receiver = { receiverName: 'Head of Family', receiverMobile: '9123412345' };
    members.forEach((m, i) => {
      const tx = api.recordPayment(sa, { ...pay(m.recordId, `hh-${i}`), ...receiver });
      expect(tx.receiverMobile).toBe('9123412345');
    });
    expect(members.every((m) => api.getVoter(sa, m.recordId).voter.paymentStatus === 'Received')).toBe(true);
    expectError(() => api.recordPayment(sa, { ...pay(members[0].recordId, 'hh-again'), ...receiver }), 409);
  });

  it('returns the original transaction when a request is retried', () => {
    const token = loginAs(C1_MOBILE);
    const voter = notReceivedVoter(token);
    const first = api.recordPayment(token, pay(voter.recordId, 'same'));
    const second = api.recordPayment(token, pay(voter.recordId, 'same'));
    expect(second.id).toBe(first.id);
    expect(api.getVoter(token, voter.recordId).transactions).toHaveLength(1);
  });

  it('Corporators and BLOs cannot see or pay voters outside their area', () => {
    const sa = loginAs(SUPER_MOBILE);
    const inW5 = notReceivedVoter(sa, 'W5');
    const inB13 = api.listVoters(sa, { boothId: 'B1-3', paymentStatus: 'Not Received', pageSize: 1 }).items[0];
    const c1 = loginAs(C1_MOBILE);
    expectError(() => api.getVoter(c1, inW5.recordId), 404);
    expect(expectError(() => api.recordPayment(c1, pay(inW5.recordId, 'x')), 403).code).toBe('FORBIDDEN');
    // C-1 covers all of W1, but its BLO only booths B1-1 and B1-2.
    expect(api.getVoter(c1, inB13.recordId).voter.canRecordPayment).toBe(true);
    const blo = loginAs(BLO_MOBILE);
    expectError(() => api.recordPayment(blo, pay(inB13.recordId, 'y')), 403);
  });

  it('a BLO only sees payments for its booths', () => {
    const blo = loginAs(BLO_MOBILE);
    const all = api.listPayments(blo, { pageSize: 500 }).items;
    expect(all.every((t) => t.wardId === 'W1' && ['B1-1', 'B1-2'].includes(t.boothId))).toBe(true);
  });

  it('cancelled payments do not count, and the voter can receive again', () => {
    const sa = loginAs(SUPER_MOBILE);
    const voter = notReceivedVoter(sa);
    const tx = api.recordPayment(sa, pay(voter.recordId, 'c1'));
    api.cancelPayment(sa, tx.id, { kind: 'Cancelled', reason: 'Wrong voter' });
    expect(api.getVoter(sa, voter.recordId).voter.paymentStatus).toBe('Not Received');
    const again = api.recordPayment(sa, pay(voter.recordId, 'c2'));
    expect(again.status).toBe('Success');
    expect(api.getPayment(sa, tx.id).audit.map((a) => a.action)).toContain('Payment cancelled');
  });

  it('only the Super Admin can cancel a payment', () => {
    const c1 = loginAs(C1_MOBILE);
    const tx = api.recordPayment(c1, pay(notReceivedVoter(c1).recordId, 'cx'));
    expectError(() => api.cancelPayment(c1, tx.id, { kind: 'Cancelled', reason: 'Mistake' }), 403);
  });

  it('enforces the configured amount when changes are not allowed', () => {
    const sa = loginAs(SUPER_MOBILE);
    api.updateSettings(sa, { defaultAmount: 1500, effectiveDate: '2000-01-01', allowAmountOverride: false });
    const token = loginAs(C1_MOBILE);
    expect(api.paymentContext(token)).toEqual({ suggestedAmount: 1500, amountEditable: false });
    const voter = notReceivedVoter(token);
    const err = expectError(() => api.recordPayment(token, { ...pay(voter.recordId, 'amt'), amount: 9999 }), 400);
    expect(err.fieldErrors?.amount).toBeDefined();
  });

  it('applies a future-dated amount only from its effective date', () => {
    const sa = loginAs(SUPER_MOBILE);
    api.updateSettings(sa, { defaultAmount: 3000, effectiveDate: '2999-01-01', allowAmountOverride: true });
    expect(api.getSettings(sa).currentAmount).toBe(2000);
  });

  it('keeps unique voter counts separate from transaction counts', () => {
    const sa = loginAs(SUPER_MOBILE);
    const voter = notReceivedVoter(sa);
    const before = api.dashboard(sa);
    const tx = api.recordPayment(sa, pay(voter.recordId, 'u1'));
    api.cancelPayment(sa, tx.id, { kind: 'Reversed', reason: 'Returned' });
    api.recordPayment(sa, pay(voter.recordId, 'u2'));
    const after = api.dashboard(sa);
    expect(after.votersReceived).toBe(before.votersReceived + 1);
    expect(after.totalTransactions).toBe(before.totalTransactions + 1); // reversed one excluded
    expect(after.votersReceived + after.votersNotReceived).toBe(after.totalVoters);
  });
});

describe('Corporators and BLOs', () => {
  const corporator = { fullName: 'New Corporator', mobile: '9988776655', wardIds: ['W1'], boothIds: [], password: 'secret123', role: 'CORPORATOR' as const };

  it('generates C-n IDs for Corporators and C-n-BLOm IDs for BLOs, and they can sign in', () => {
    const sa = loginAs(SUPER_MOBILE);
    expect(api.createAdmin(sa, corporator).id).toBe('C-5');
    expect(api.createAdmin(sa, { ...corporator, fullName: 'Second Corporator', mobile: '9988776656' }).id).toBe('C-6');
    const blo = api.createAdmin(sa, { ...corporator, fullName: 'New BLO', role: 'BLO', corporatorId: 'C-1', mobile: '9988776657', boothIds: ['B1-3'] });
    expect(blo).toMatchObject({ id: 'C-1-BLO3', corporatorId: 'C-1', boothIds: ['B1-3'] });
    expect(api.login('9988776655', 'secret123', false, 'test').admin.id).toBe('C-5');
  });

  it('a Super Admin creates Super Admins (SA-n) who manage every account but their own', () => {
    const sa = loginAs(SUPER_MOBILE);
    const input = { fullName: 'Second Admin', mobile: '9988776600', password: 'secret123', role: 'SUPER_ADMIN' as const, wardIds: ['W1'], boothIds: ['B1-1'], location: 'x' };
    expect(api.createAdmin(sa, input)).toMatchObject({ id: 'SA-2', role: 'SUPER_ADMIN', wardIds: [], boothIds: [], location: '' });
    expectError(() => api.createAdmin(loginAs(C1_MOBILE), { ...input, mobile: '9988776601' }), 403);
    const sa2 = api.login('9988776600', 'secret123', false, 'test').token;
    expect(api.listAdmins(sa2, { role: 'SUPER_ADMIN' }).items.map((a) => a.id)).toEqual(['SA-1']);
    expectError(() => api.getAdmin(sa2, 'SA-2'), 404);
    api.setAdminPassword(sa2, 'SA-1', 'changed99');
    expectError(() => api.me(sa), 401);
  });

  it('stores a location for Corporators only', () => {
    const sa = loginAs(SUPER_MOBILE);
    const created = api.createAdmin(sa, { ...corporator, location: '  Gandhi Nagar office  ' });
    expect(created.location).toBe('Gandhi Nagar office');
    const blo = api.createAdmin(sa, { ...corporator, fullName: 'Another Person', role: 'BLO', corporatorId: created.id, mobile: '9988776650', location: 'ignored' });
    expect(blo.location).toBe('');
    const updated = api.updateAdmin(sa, created.id, { ...corporator, location: 'Market Street' });
    expect(updated.location).toBe('Market Street');
    expect(api.listAudit(sa, { recordRef: created.id }).items.some((a) => a.summary.includes('location'))).toBe(true);
  });

  it('a Corporator creates BLOs only for itself and only inside its wards', () => {
    const c1 = loginAs(C1_MOBILE);
    const blo = api.createAdmin(c1, { ...corporator, role: 'BLO', corporatorId: 'C-2', wardIds: ['W2'] });
    expect(blo).toMatchObject({ id: 'C-1-BLO3', corporatorId: 'C-1' });
    expect(expectError(() => api.createAdmin(c1, { ...corporator, role: 'BLO', mobile: '9988776658', wardIds: ['W3'] }), 400).fieldErrors?.wardIds).toBeDefined();
    expectError(() => api.createAdmin(c1, { ...corporator, mobile: '9988776659' }), 403);
  });

  it('a Corporator manages only its own BLOs', () => {
    const c1 = loginAs(C1_MOBILE);
    expect(api.listAdmins(c1, { pageSize: 50 }).items.map((a) => a.id)).toEqual(['C-1-BLO1', 'C-1-BLO2']);
    api.setAdminPassword(c1, 'C-1-BLO1', 'bloPass99');
    expect(api.login(BLO_MOBILE, 'bloPass99', false, 'test').admin.id).toBe('C-1-BLO1');
    expectError(() => api.setAdminStatus(c1, 'C-2-BLO1', 'Inactive'), 404);
    expectError(() => api.getAdmin(c1, 'C-2'), 404);
  });

  it('removing a ward from a Corporator removes it from its BLOs', () => {
    const sa = loginAs(SUPER_MOBILE);
    api.updateAdmin(sa, 'C-1', { fullName: 'Ramesh Babu', mobile: C1_MOBILE, wardIds: ['W2'], boothIds: [] });
    const blo1 = api.getAdmin(sa, 'C-1-BLO1');
    expect(blo1.wardIds).toEqual([]);
    expect(blo1.boothIds).toEqual([]);
    expect(api.getAdmin(sa, 'C-1-BLO2').wardIds).toEqual(['W2']);
  });

  it('a BLO can be put on a booth only inside its Corporator wards', () => {
    const sa = loginAs(SUPER_MOBILE);
    expectError(() => api.setBoothAdmins(sa, 'B3-2', ['C-1-BLO1']), 400);
    api.setBoothAdmins(sa, 'B1-3', ['C-1-BLO1']);
    expect(api.getAdmin(sa, 'C-1-BLO1').boothIds).toContain('B1-3');
  });

  it('rejects a duplicate mobile number', () => {
    const sa = loginAs(SUPER_MOBILE);
    expectError(() => api.createAdmin(sa, { ...corporator, mobile: C1_MOBILE }), 400);
  });

  it('a password change by the Super Admin signs the account out everywhere', () => {
    const c1 = loginAs(C1_MOBILE);
    const sa = loginAs(SUPER_MOBILE);
    api.setAdminPassword(sa, 'C-1', 'newpass99');
    expectError(() => api.me(c1), 401);
    expectError(() => api.login(C1_MOBILE, PASSWORD, false, 'test'), 401);
    expect(api.login(C1_MOBILE, 'newpass99', false, 'test').admin.id).toBe('C-1');
  });

  it('Corporators and BLOs can change their own password', () => {
    const blo = loginAs(BLO_MOBILE);
    api.changePassword(blo, PASSWORD, 'mynewpass1');
    expect(api.login(BLO_MOBILE, 'mynewpass1', false, 'test').admin.id).toBe('C-1-BLO1');
  });

  it('Corporators and BLOs cannot use Super Admin endpoints', () => {
    for (const token of [loginAs(C2_MOBILE), loginAs(BLO_MOBILE)]) {
      expectError(() => api.listAudit(token), 403);
      expectError(() => api.getSettings(token), 403);
      const voter = notReceivedVoter(token);
      expectError(() => api.updateVoter(token, voter.recordId, { ...voter }), 403);
    }
    expectError(() => api.listAdmins(loginAs(BLO_MOBILE)), 403);
  });

  it('deactivating an account ends its sessions', () => {
    const c1 = loginAs(C1_MOBILE);
    const sa = loginAs(SUPER_MOBILE);
    api.setAdminStatus(sa, 'C-1', 'Inactive');
    expectError(() => api.me(c1), 401);
  });
});

describe('voters', () => {
  it('rejects a duplicate voter ID and requires a valid booth for the ward', () => {
    const sa = loginAs(SUPER_MOBILE);
    const existing = api.listVoters(sa, { pageSize: 1 }).items[0];
    const base = { fullName: 'Test', mobile: '', wardId: 'W1', boothId: 'B1-1', houseNumber: '1', householdId: '', address: '', status: 'Active' as const };
    expectError(() => api.createVoter(sa, { ...base, voterId: existing.voterId.toLowerCase() }), 409);
    expectError(() => api.createVoter(sa, { ...base, voterId: 'NEW1', boothId: 'B2-1' }), 400);
    expect(api.createVoter(sa, { ...base, voterId: '000NEW' }).voterId).toBe('000NEW');
  });

  it('lists only the admin\'s own area', () => {
    const corporatorVoters = api.listVoters(loginAs(C1_MOBILE), { pageSize: 500 }).items;
    expect(corporatorVoters.length).toBeGreaterThan(0);
    expect(corporatorVoters.every((v) => ['W1', 'W2'].includes(v.wardId))).toBe(true);
    const bloVoters = api.listVoters(loginAs(BLO_MOBILE), { pageSize: 500 }).items;
    expect(bloVoters.length).toBeGreaterThan(0);
    expect(bloVoters.every((v) => ['B1-1', 'B1-2'].includes(v.boothId))).toBe(true);
  });
});
