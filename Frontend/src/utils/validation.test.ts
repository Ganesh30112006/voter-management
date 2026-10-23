import { describe, expect, it } from 'vitest';
import { donationSchema, isValidIndianMobile, loginSchema, normalizeMobile, normalizeVoterStatus, voterSchema } from './validation';

describe('Indian mobile numbers', () => {
  it('accepts 10 digits starting with 6-9, with common prefixes', () => {
    expect(isValidIndianMobile('9876543210')).toBe(true);
    expect(isValidIndianMobile('+91 98765 43210')).toBe(true);
    expect(isValidIndianMobile('09876543210')).toBe(true);
    expect(normalizeMobile('+91-98765-43210')).toBe('9876543210');
  });

  it('rejects wrong length or leading digit', () => {
    expect(isValidIndianMobile('5876543210')).toBe(false);
    expect(isValidIndianMobile('98765')).toBe(false);
    expect(isValidIndianMobile('98765432101')).toBe(false);
    expect(isValidIndianMobile('')).toBe(false);
  });
});

describe('voter status', () => {
  it('normalizes case and whitespace only', () => {
    expect(normalizeVoterStatus('  active ')).toBe('Active');
    expect(normalizeVoterStatus('NOT   ACTIVE')).toBe('Not Active');
    expect(normalizeVoterStatus('shifted')).toBe('Shifted');
  });

  it('never invents a status', () => {
    expect(normalizeVoterStatus('')).toBeNull();
    expect(normalizeVoterStatus('inactive')).toBeNull();
    expect(normalizeVoterStatus(undefined)).toBeNull();
  });

  it('requires an explicit status in the voter form', () => {
    const base = { voterId: 'ABC1', fullName: 'Ravi Kumar', mobile: '', wardId: 'W1', boothId: 'B1-1', houseNumber: '1', householdId: '', address: '' };
    expect(voterSchema.safeParse({ ...base, status: '' }).success).toBe(false);
    expect(voterSchema.safeParse({ ...base, status: 'Active' }).success).toBe(true);
  });
});

describe('donation form', () => {
  it('requires amount, receiver name and receiver mobile', () => {
    expect(donationSchema.safeParse({ amount: '2000', receiverName: 'Ravi', receiverMobile: '9876543210' }).success).toBe(true);
    expect(donationSchema.safeParse({ amount: '', receiverName: 'Ravi', receiverMobile: '9876543210' }).success).toBe(false);
    expect(donationSchema.safeParse({ amount: '0', receiverName: 'Ravi', receiverMobile: '9876543210' }).success).toBe(false);
    expect(donationSchema.safeParse({ amount: '20.5', receiverName: 'Ravi', receiverMobile: '9876543210' }).success).toBe(false);
    expect(donationSchema.safeParse({ amount: '2000', receiverName: '', receiverMobile: '9876543210' }).success).toBe(false);
    expect(donationSchema.safeParse({ amount: '2000', receiverName: 'Ravi', receiverMobile: '12345' }).success).toBe(false);
  });
});

describe('login form', () => {
  it('signs in with a mobile number', () => {
    const r = loginSchema.safeParse({ mobile: '+91 9876543210', password: 'x', remember: false });
    expect(r.success && r.data.mobile).toBe('9876543210');
    expect(loginSchema.safeParse({ mobile: 'BL-1', password: 'x', remember: false }).success).toBe(false);
  });
});
