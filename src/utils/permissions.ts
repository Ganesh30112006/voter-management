import type { Admin } from '../types';

/**
 * Access model: every BL Admin can view all voters, record donations for any voter,
 * and view donation history and reports. Only the Super Admin manages administrators,
 * wards, voters, imports, settings and audit logs. The backend enforces the same rules.
 */
export function isSuperAdmin(admin: Admin | null | undefined): boolean {
  return admin?.role === 'SUPER_ADMIN';
}

/**
 * Whether a voter location is inside the admin's assignment (used for "My Ward Voters").
 * Booth assignments narrow a ward only when the admin has booths in that ward.
 */
export function coversVoter(
  admin: Admin,
  wardId: string,
  boothId: string,
  boothWardOf: (boothId: string) => string | undefined,
): boolean {
  if (admin.role === 'SUPER_ADMIN') return true;
  if (!admin.wardIds.includes(wardId)) return false;
  const boothsInWard = admin.boothIds.filter((b) => boothWardOf(b) === wardId);
  return boothsInWard.length === 0 || boothsInWard.includes(boothId);
}
