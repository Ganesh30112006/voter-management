import { describe, expect, it } from 'vitest';
import { paymentSchema, isValidIndianMobile, loginSchema, normalizeMobile, normalizeVoterStatus, voterSchema } from './validation';

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
    expect(normalizeVoterStatus('NOT   ACTIVE')).toBe('Dead');
    expect(normalizeVoterStatus('dead')).toBe('Dead');
    expect(normalizeVoterStatus('Deceased')).toBe('Dead');
    expect(normalizeVoterStatus('shifted')).toBe('Shifted');
  });

  it('never invents a status', () => {
    expect(normalizeVoterStatus('')).toBeNull();
    expect(normalizeVoterStatus('inactive')).toBeNull();
    expect(normalizeVoterStatus(undefined)).toBeNull();
  });

  it('requires an explicit status in the voter form', () => {
    const base = { voterId: 'ABC1', fullName: 'Ravi Kumar', wardId: 'W1', boothId: '', houseNumber: '1', householdId: '', address: '', age: '', gender: '' };
    expect(voterSchema.safeParse({ ...base, status: '' }).success).toBe(false);
    expect(voterSchema.safeParse({ ...base, status: 'Active' }).success).toBe(true);
    // Age and gender are optional; when given they must be sensible.
    expect(voterSchema.parse({ ...base, status: 'Active', age: '44', gender: 'Female' })).toMatchObject({ age: 44, gender: 'Female' });
    expect(voterSchema.safeParse({ ...base, status: 'Active', age: '7' }).success).toBe(false);
  });
});

describe('payment form', () => {
  it('requires amount, receiver name, receiver mobile and the giver name', () => {
    expect(paymentSchema.safeParse({ amount: '2000', receiverName: 'Ravi', receiverMobile: '9876543210', givenByName: 'Lakshmi' }).success).toBe(true);
    expect(paymentSchema.safeParse({ amount: '', receiverName: 'Ravi', receiverMobile: '9876543210', givenByName: 'Lakshmi' }).success).toBe(false);
    expect(paymentSchema.safeParse({ amount: '0', receiverName: 'Ravi', receiverMobile: '9876543210', givenByName: 'Lakshmi' }).success).toBe(false);
    expect(paymentSchema.safeParse({ amount: '20.5', receiverName: 'Ravi', receiverMobile: '9876543210', givenByName: 'Lakshmi' }).success).toBe(false);
    expect(paymentSchema.safeParse({ amount: '2000', receiverName: '', receiverMobile: '9876543210', givenByName: 'Lakshmi' }).success).toBe(false);
    expect(paymentSchema.safeParse({ amount: '2000', receiverName: 'Ravi', receiverMobile: '12345', givenByName: 'Lakshmi' }).success).toBe(false);
    expect(paymentSchema.safeParse({ amount: '2000', receiverName: 'Ravi', receiverMobile: '9876543210', givenByName: ' ' }).success).toBe(false);
  });
});

describe('login form', () => {
  it('signs in with a mobile number or a full name', () => {
    const r = loginSchema.safeParse({ identifier: '+91 9876543210', password: 'x', remember: false });
    expect(r.success && r.data.identifier).toBe('9876543210');
    const byName = loginSchema.safeParse({ identifier: '  Ramesh   Babu ', password: 'x', remember: false });
    expect(byName.success && byName.data.identifier).toBe('Ramesh Babu');
    expect(loginSchema.safeParse({ identifier: '   ', password: 'x', remember: false }).success).toBe(false);
  });
});
