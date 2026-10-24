import type { Admin, Booth, Role, Ward } from '../types';

/**
 * Access model: Super Admin → Corporators (C-n) → BLOs (C-n-BLOm).
 * - The Super Admin sees everything and manages accounts, wards, voters, imports, settings and audit logs.
 * - A Corporator has full control inside its own wards: voters (add, edit, import, status lists), booths, its
 *   own BLOs, and payments (record, cancel). It never sees Super Admin accounts.
 * - A BLO sees and records payments for voters in their assigned booths (or whole wards without booths).
 * The backend enforces the same rules.
 */
export function isSuperAdmin(admin: Admin | null | undefined): boolean {
  return admin?.role === 'SUPER_ADMIN';
}

export function canManageBlos(admin: Admin | null | undefined): boolean {
  return admin?.role === 'SUPER_ADMIN' || admin?.role === 'CORPORATOR';
}

/** Voters, imports, booths and payment cancellations: the Super Admin anywhere, a Corporator in its own wards. */
export function canManageWardData(admin: Admin | null | undefined): boolean {
  return admin?.role === 'SUPER_ADMIN' || admin?.role === 'CORPORATOR';
}

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: 'Super Admin',
  CORPORATOR: 'Corporator',
  BLO: 'BLO',
};

/**
 * Whether a voter location is inside the admin's assignment.
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

/** Wards the admin may pick in filters (all for the Super Admin). */
export function wardsInArea(admin: Admin, wards: Ward[]): Ward[] {
  return admin.role === 'SUPER_ADMIN' ? wards : wards.filter((w) => admin.wardIds.includes(w.id));
}

/** Booths of a ward that the admin covers (all of them for the Super Admin and for whole-ward assignments). */
export function boothsInArea(admin: Admin, wardId: string, booths: Booth[]): Booth[] {
  const boothWardOf = (id: string) => booths.find((b) => b.id === id)?.wardId;
  return booths.filter((b) => b.wardId === wardId && coversVoter(admin, wardId, b.id, boothWardOf));
}
