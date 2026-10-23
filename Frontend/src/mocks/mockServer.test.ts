import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../services/apiError';
import * as api from './mockServer';

const PASSWORD = 'test-pass-1';
const SUPER_MOBILE = '9000000001';
const BL1_MOBILE = '9876543210';

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

/** A voter who has not received a donation yet. */
function notReceivedVoter(token: string) {
  const page = api.listVoters(token, { donationStatus: 'Not Received', pageSize: 1 });
  return page.items[0];
}

beforeEach(() => {
  vi.stubEnv('VITE_MOCK_PASSWORD', PASSWORD);
  api.resetMockDb();
});

describe('authentication', () => {
  it('logs in with mobile number and password', () => {
    const res = api.login(`+91 ${BL1_MOBILE}`, PASSWORD, false, 'test');
    expect(res.admin.id).toBe('BL-1');
  });

  it('rejects wrong passwords and deactivated admins', () => {
    expectError(() => api.login(BL1_MOBILE, 'wrong', false, 'test'), 401);
    expectError(() => api.login('8098765432', PASSWORD, false, 'test'), 403); // BL-4 is inactive
  });

  it('rejects missing or unknown tokens', () => {
    expect(expectError(() => api.me('nope'), 401).code).toBe('SESSION_EXPIRED');
  });
});

describe('donations', () => {
  it('records the transaction with server data and marks the voter Received', () => {
    const token = loginAs(BL1_MOBILE);
    const voter = notReceivedVoter(token);
    const before = Date.now();
    const tx = api.recordDonation(token, {
      voterRecordId: voter.recordId,
      amount: 2000,
      receiverName: 'Someone Else',
      receiverMobile: '9123412345',
      idempotencyKey: 'k1',
    });
    expect(tx.id).toMatch(/^TXN-\d+$/);
    expect(tx.adminId).toBe('BL-1');
    expect(new Date(tx.timestamp).getTime()).toBeGreaterThanOrEqual(before);
    const detail = api.getVoter(token, voter.recordId);
    expect(detail.voter.donationStatus).toBe('Received');
    expect(detail.voter.latestDonation?.receiverName).toBe('Someone Else');
    // Receiver details never overwrite the voter's own details, and voter status is untouched.
    expect(detail.voter.fullName).toBe(voter.fullName);
    expect(detail.voter.mobile).toBe(voter.mobile);
    expect(detail.voter.status).toBe(voter.status);
  });

  it('blocks a second donation to the same voter', () => {
    const token = loginAs(BL1_MOBILE);
    const voter = notReceivedVoter(token);
    const input = { voterRecordId: voter.recordId, amount: 2000, receiverName: 'Ravi', receiverMobile: '9123412345' };
    api.recordDonation(token, { ...input, idempotencyKey: 'a' });
    expect(expectError(() => api.recordDonation(token, { ...input, idempotencyKey: 'b' }), 409).code).toBe('CONFLICT');
  });

  it('returns the original transaction when a request is retried', () => {
    const token = loginAs(BL1_MOBILE);
    const voter = notReceivedVoter(token);
    const input = { voterRecordId: voter.recordId, amount: 2000, receiverName: 'Ravi', receiverMobile: '9123412345', idempotencyKey: 'same' };
    const first = api.recordDonation(token, input);
    const second = api.recordDonation(token, input);
    expect(second.id).toBe(first.id);
    expect(api.getVoter(token, voter.recordId).transactions).toHaveLength(1);
  });

  it('lets a BL Admin donate to a voter outside their wards', () => {
    const token = loginAs(BL1_MOBILE); // wards W1, W2
    const outside = api.listVoters(token, { wardId: 'W5', donationStatus: 'Not Received', pageSize: 1 }).items[0];
    expect(outside.inMyWards).toBe(false);
    expect(outside.canRecordDonation).toBe(true);
    const tx = api.recordDonation(token, { voterRecordId: outside.recordId, amount: 2000, receiverName: 'Ravi', receiverMobile: '9123412345', idempotencyKey: 'x' });
    expect(tx.wardId).toBe('W5');
  });

  it('cancelled donations do not count, and the voter can receive again', () => {
    const sa = loginAs(SUPER_MOBILE);
    const voter = notReceivedVoter(sa);
    const tx = api.recordDonation(sa, { voterRecordId: voter.recordId, amount: 2000, receiverName: 'Ravi', receiverMobile: '9123412345', idempotencyKey: 'c1' });
    api.cancelDonation(sa, tx.id, { kind: 'Cancelled', reason: 'Wrong voter' });
    expect(api.getVoter(sa, voter.recordId).voter.donationStatus).toBe('Not Received');
    const again = api.recordDonation(sa, { voterRecordId: voter.recordId, amount: 2000, receiverName: 'Ravi', receiverMobile: '9123412345', idempotencyKey: 'c2' });
    expect(again.status).toBe('Success');
    expect(api.getDonation(sa, tx.id).audit.map((a) => a.action)).toContain('Donation cancelled');
  });

  it('enforces the configured amount when changes are not allowed', () => {
    const sa = loginAs(SUPER_MOBILE);
    api.updateSettings(sa, { defaultAmount: 1500, effectiveDate: '2000-01-01', allowAmountOverride: false });
    const token = loginAs(BL1_MOBILE);
    expect(api.donationContext(token)).toEqual({ suggestedAmount: 1500, amountEditable: false });
    const voter = notReceivedVoter(token);
    const err = expectError(
      () => api.recordDonation(token, { voterRecordId: voter.recordId, amount: 9999, receiverName: 'Ravi', receiverMobile: '9123412345', idempotencyKey: 'amt' }),
      400,
    );
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
    const tx = api.recordDonation(sa, { voterRecordId: voter.recordId, amount: 2000, receiverName: 'Ravi', receiverMobile: '9123412345', idempotencyKey: 'u1' });
    api.cancelDonation(sa, tx.id, { kind: 'Reversed', reason: 'Returned' });
    api.recordDonation(sa, { voterRecordId: voter.recordId, amount: 2000, receiverName: 'Ravi', receiverMobile: '9123412345', idempotencyKey: 'u2' });
    const after = api.dashboard(sa);
    expect(after.votersReceived).toBe(before.votersReceived + 1);
    expect(after.totalTransactions).toBe(before.totalTransactions + 1); // reversed one excluded
    expect(after.votersReceived + after.votersNotReceived).toBe(after.totalVoters);
  });
});

describe('administrators', () => {
  it('generates sequential BL IDs and the new admin can sign in', () => {
    const sa = loginAs(SUPER_MOBILE);
    const created = api.createAdmin(sa, { fullName: 'New Admin', mobile: '9988776655', wardIds: ['W1'], boothIds: [], password: 'secret123' });
    expect(created.id).toBe('BL-5');
    const next = api.createAdmin(sa, { fullName: 'Another', mobile: '9988776656', wardIds: ['W2'], boothIds: [], password: 'secret123' });
    expect(next.id).toBe('BL-6');
    expect(api.login('9988776655', 'secret123', false, 'test').admin.id).toBe('BL-5');
  });

  it('rejects a duplicate mobile number', () => {
    const sa = loginAs(SUPER_MOBILE);
    expectError(() => api.createAdmin(sa, { fullName: 'Dup', mobile: BL1_MOBILE, wardIds: ['W1'], boothIds: [], password: 'secret123' }), 400);
  });

  it('Super Admin password change signs the admin out everywhere', () => {
    const bl = loginAs(BL1_MOBILE);
    const sa = loginAs(SUPER_MOBILE);
    api.setAdminPassword(sa, 'BL-1', 'newpass99');
    expectError(() => api.me(bl), 401);
    expectError(() => api.login(BL1_MOBILE, PASSWORD, false, 'test'), 401);
    expect(api.login(BL1_MOBILE, 'newpass99', false, 'test').admin.id).toBe('BL-1');
  });

  it('BL Admins can change their own password', () => {
    const bl = loginAs(BL1_MOBILE);
    api.changePassword(bl, PASSWORD, 'mynewpass1');
    expect(api.login(BL1_MOBILE, 'mynewpass1', false, 'test').admin.id).toBe('BL-1');
  });

  it('BL Admins cannot use Super Admin endpoints', () => {
    const bl = loginAs(BL1_MOBILE);
    expectError(() => api.listAdmins(bl), 403);
    expectError(() => api.listAudit(bl), 403);
    expectError(() => api.getSettings(bl), 403);
    const voter = notReceivedVoter(bl);
    expectError(() => api.updateVoter(bl, voter.recordId, { ...voter }), 403);
  });

  it('deactivating an admin ends their sessions', () => {
    const bl = loginAs(BL1_MOBILE);
    const sa = loginAs(SUPER_MOBILE);
    api.setAdminStatus(sa, 'BL-1', 'Inactive');
    expectError(() => api.me(bl), 401);
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

  it('My Ward scope returns only assigned wards', () => {
    const bl = loginAs('9123456780'); // BL-3: ward W4, booths B4-1 and B4-2
    const mine = api.listVoters(bl, { scope: 'mine', pageSize: 500 }).items;
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((v) => v.wardId === 'W4' && ['B4-1', 'B4-2'].includes(v.boothId))).toBe(true);
  });
});
