import { z } from 'zod';
import { VOTER_STATUSES, type VoterStatus } from '../types';

/** Strips spaces/dashes and a leading +91, 91 or 0 from an Indian mobile number. */
export function normalizeMobile(raw: string): string {
  let v = (raw ?? '').replace(/[\s\-()]/g, '');
  if (v.startsWith('+91')) v = v.slice(3);
  else if (v.length === 12 && v.startsWith('91')) v = v.slice(2);
  else if (v.length === 11 && v.startsWith('0')) v = v.slice(1);
  return v;
}

export function isValidIndianMobile(raw: string): boolean {
  return /^[6-9]\d{9}$/.test(normalizeMobile(raw));
}

/** Accepts harmless differences in case and whitespace; returns null if not a known status. */
export function normalizeVoterStatus(raw: unknown): VoterStatus | null {
  const v = String(raw ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  return VOTER_STATUSES.find((s) => s.toLowerCase() === v) ?? null;
}

export const HOUSEHOLD_ID_PATTERN = /^[A-Za-z0-9\-/]+$/;

export const mobileSchema = z
  .string()
  .trim()
  .min(1, 'Mobile number is required')
  .refine(isValidIndianMobile, 'Enter a valid 10-digit Indian mobile number')
  .transform(normalizeMobile);

export const optionalMobileSchema = z
  .string()
  .trim()
  .refine((v) => v === '' || isValidIndianMobile(v), 'Enter a valid 10-digit Indian mobile number')
  .transform((v) => (v === '' ? '' : normalizeMobile(v)));

export const loginSchema = z.object({
  mobile: mobileSchema,
  password: z.string().min(1, 'Password is required'),
  remember: z.boolean(),
});
export type LoginForm = z.input<typeof loginSchema>;

export const PASSWORD_RULES = 'At least 8 characters with letters and numbers';

export const newPasswordSchema = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(64, 'Use at most 64 characters')
  .regex(/[A-Za-z]/, 'Include at least one letter')
  .regex(/\d/, 'Include at least one number');

export function isValidPassword(p: string): boolean {
  return newPasswordSchema.safeParse(p).success;
}

/** Super Admin setting a password for another admin. */
export const setPasswordSchema = z
  .object({ password: newPasswordSchema, confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, { message: 'Passwords do not match', path: ['confirmPassword'] });
export type SetPasswordValues = z.infer<typeof setPasswordSchema>;

export const voterSchema = z.object({
  voterId: z.string().trim().min(1, 'Voter ID is required').max(30, 'Voter ID is too long'),
  fullName: z.string().trim().min(2, 'Full name is required').max(100),
  mobile: optionalMobileSchema,
  wardId: z.string().min(1, 'Select a ward'),
  boothId: z.string().min(1, 'Select a booth'),
  houseNumber: z.string().trim().min(1, 'House number is required').max(30),
  householdId: z
    .string()
    .trim()
    .max(30)
    .refine((v) => v === '' || HOUSEHOLD_ID_PATTERN.test(v), 'Use letters, numbers, - or / only'),
  address: z.string().trim().max(250),
  // No default: the admin must choose a status explicitly.
  status: z.enum(VOTER_STATUSES, { errorMap: () => ({ message: 'Select a voter status' }) }),
});
/** Status starts empty: the admin must choose it (no default is ever assigned). */
export type VoterFormValues = Omit<z.input<typeof voterSchema>, "status"> & { status: VoterStatus | "" };

export const adminSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name is required').max(100),
  mobile: mobileSchema,
  wardIds: z.array(z.string()).min(1, 'Assign at least one ward'),
  boothIds: z.array(z.string()),
});
export type AdminFormValues = z.input<typeof adminSchema> & { password?: string; confirmPassword?: string };

export const adminCreateSchema = adminSchema
  .extend({ password: newPasswordSchema, confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, { message: 'Passwords do not match', path: ['confirmPassword'] });

export const MAX_DONATION_AMOUNT = 100000;

const amountSchema = z.coerce
  .number({ invalid_type_error: 'Enter an amount' })
  .int('Amount must be a whole number of rupees')
  .positive('Amount must be greater than zero')
  .max(MAX_DONATION_AMOUNT, `Amount cannot exceed ₹${MAX_DONATION_AMOUNT.toLocaleString('en-IN')}`);

export const donationSchema = z.object({
  amount: amountSchema,
  receiverName: z.string().trim().min(2, 'Receiver name is required').max(100),
  receiverMobile: mobileSchema,
});
/** Form state keeps numeric inputs as text; the schema converts them on submit. */
export type DonationFormValues = { amount: string; receiverName: string; receiverMobile: string };

export const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: newPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    message: 'New password must be different from the current one',
    path: ['newPassword'],
  });
export type PasswordFormValues = z.infer<typeof passwordSchema>;

export const settingsSchema = z.object({
  defaultAmount: amountSchema,
  effectiveDate: z.string().min(1, 'Effective date is required'),
  allowAmountOverride: z.boolean(),
});
export type SettingsFormValues = { defaultAmount: string; effectiveDate: string; allowAmountOverride: boolean };

export const wardSchema = z.object({
  number: z.coerce.number({ invalid_type_error: 'Enter a ward number' }).int('Use a whole number').positive('Enter a ward number'),
  name: z.string().trim().min(2, 'Ward name is required').max(80),
});
export type WardFormValues = { number: string; name: string };

export const boothSchema = z.object({
  wardId: z.string().min(1, 'Select a ward'),
  number: z.coerce.number({ invalid_type_error: 'Enter a booth number' }).int('Use a whole number').positive('Enter a booth number'),
  name: z.string().trim().min(2, 'Booth name is required').max(80),
});
export type BoothFormValues = { wardId: string; number: string; name: string };
