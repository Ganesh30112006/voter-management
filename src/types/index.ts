export type Role = 'SUPER_ADMIN' | 'BL_ADMIN';

export type AccountStatus = 'Active' | 'Inactive';

export interface Admin {
  id: string;
  fullName: string;
  mobile: string;
  role: Role;
  wardIds: string[];
  boothIds: string[];
  status: AccountStatus;
  createdAt: string;
}

export interface AdminInput {
  fullName: string;
  mobile: string;
  wardIds: string[];
  boothIds: string[];
}

export interface AdminQuery {
  search?: string;
  wardId?: string;
  status?: AccountStatus | '';
  sortBy?: 'id' | 'fullName' | 'createdAt' | 'status';
  sortDir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface AdminCreateInput extends AdminInput {
  /** Initial password chosen by the Super Admin. */
  password: string;
}

export interface Ward {
  id: string;
  number: number;
  name: string;
}

export interface Booth {
  id: string;
  wardId: string;
  number: number;
  name: string;
}

export interface WardSummary extends Ward {
  voterCount: number;
  adminIds: string[];
  booths: (Booth & { voterCount: number; adminIds: string[] })[];
}

export const VOTER_STATUSES = ['Active', 'Not Active', 'Shifted'] as const;
export type VoterStatus = (typeof VOTER_STATUSES)[number];

export type DonationStatus = 'Received' | 'Not Received';

export interface Voter {
  recordId: string;
  voterId: string;
  fullName: string;
  mobile: string;
  wardId: string;
  boothId: string;
  houseNumber: string;
  householdId: string;
  address: string;
  status: VoterStatus;
  createdAt: string;
  updatedAt: string;
}

export interface VoterInput {
  voterId: string;
  fullName: string;
  mobile: string;
  wardId: string;
  boothId: string;
  houseNumber: string;
  householdId: string;
  address: string;
  status: VoterStatus;
}

export interface VoterListItem extends Voter {
  donationStatus: DonationStatus;
  latestDonation: DonationTransaction | null;
  /** Whether the logged-in admin may record a donation for this voter (server decided). */
  canRecordDonation: boolean;
  /** True when the voter belongs to one of the logged-in admin's assigned wards. */
  inMyWards: boolean;
}

export interface VoterQuery {
  search?: string;
  wardId?: string;
  boothId?: string;
  status?: VoterStatus | '';
  donationStatus?: DonationStatus | '';
  scope?: 'all' | 'mine';
  sortBy?: 'voterId' | 'fullName' | 'ward' | 'booth' | 'houseNumber' | 'status';
  sortDir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface DuplicateCheckResult {
  voterIdExists: boolean;
  similar: Pick<Voter, 'recordId' | 'voterId' | 'fullName' | 'houseNumber'>[];
}

export type TransactionStatus = 'Success' | 'Cancelled' | 'Reversed';

export interface DonationTransaction {
  id: string;
  voterRecordId: string;
  voterId: string;
  voterName: string;
  wardId: string;
  boothId: string;
  amount: number;
  receiverName: string;
  receiverMobile: string;
  timestamp: string;
  adminId: string;
  adminName: string;
  status: TransactionStatus;
  statusReason?: string;
}

export interface DonationInput {
  voterRecordId: string;
  amount: number;
  receiverName: string;
  receiverMobile: string;
  /** Client-generated key so a retried request cannot create two transactions. */
  idempotencyKey: string;
}

export interface CancelDonationInput {
  kind: 'Cancelled' | 'Reversed';
  reason: string;
}

export interface DonationQuery {
  search?: string;
  from?: string;
  to?: string;
  wardId?: string;
  boothId?: string;
  adminId?: string;
  status?: TransactionStatus | '';
  sortBy?: 'timestamp' | 'amount' | 'voterName' | 'id' | 'receiverName';
  sortDir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface DonationSettings {
  defaultAmount: number;
  currency: 'INR';
  effectiveDate: string;
  allowAmountOverride: boolean;
}

export interface SettingsHistoryEntry {
  id: string;
  changedAt: string;
  changedBy: string;
  defaultAmount: number;
  effectiveDate: string;
  summary: string;
}

export interface SettingsResponse {
  settings: DonationSettings;
  history: SettingsHistoryEntry[];
  /** Amount in effect today for new donations. */
  currentAmount: number;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  adminId: string;
  adminName: string;
  action: string;
  entity: 'Admin' | 'Ward' | 'Booth' | 'Voter' | 'Import' | 'Donation' | 'Settings' | 'Export' | 'Auth';
  recordRef: string;
  result: 'Success' | 'Failure';
  summary: string;
}

export interface AuditQuery {
  search?: string;
  entity?: AuditLog['entity'] | '';
  adminId?: string;
  from?: string;
  to?: string;
  recordRef?: string;
  page?: number;
  pageSize?: number;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Session {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  device: string;
  current: boolean;
}

export interface LoginResponse {
  token: string;
  admin: Admin;
  expiresAt: string;
}

export interface ReportFilters {
  from?: string;
  to?: string;
  wardId?: string;
  boothId?: string;
  adminId?: string;
}

export interface DonationContext {
  suggestedAmount: number;
  /** Whether the prefilled amount may be changed (Settings). */
  amountEditable: boolean;
}

export interface VoterDetail {
  voter: VoterListItem;
  transactions: DonationTransaction[];
}

export interface TransactionDetail {
  transaction: DonationTransaction;
  audit: AuditLog[];
}

export interface ImportContext {
  existingVoterIds: string[];
  households: [householdId: string, wardId: string][];
}

export interface NameValue {
  name: string;
  value: number;
}

export interface GroupRow {
  key: string;
  label: string;
  voters: number;
  active: number;
  notActive: number;
  shifted: number;
  received: number;
  notReceived: number;
  transactions: number;
  amount: number;
}

export interface DashboardStats {
  totalAdmins: number | null;
  totalVoters: number;
  totalWards: number;
  totalBooths: number;
  activeVoters: number;
  notActiveVoters: number;
  shiftedVoters: number;
  votersReceived: number;
  votersNotReceived: number;
  totalTransactions: number;
  totalAmount: number;
  myTransactions: number;
  myAmount: number;
  byWard: GroupRow[];
  byBooth: GroupRow[];
  byAdmin: { adminId: string; adminName: string; transactions: number; amount: number }[];
  overTime: { date: string; amount: number; transactions: number }[];
  recentTransactions: DonationTransaction[];
  recentActivity: AuditLog[];
}

export interface ReportData {
  summary: {
    totalVoters: number;
    active: number;
    notActive: number;
    shifted: number;
    votersReceived: number;
    votersNotReceived: number;
    transactions: number;
    amount: number;
  };
  byWard: GroupRow[];
  byBooth: GroupRow[];
  byAdmin: { adminId: string; adminName: string; transactions: number; amount: number; uniqueVoters: number }[];
  daily: { date: string; transactions: number; uniqueVoters: number; amount: number }[];
  monthly: { month: string; transactions: number; uniqueVoters: number; amount: number }[];
}

export interface Notification {
  id: string;
  title: string;
  body: string;
  timestamp: string;
}

/** A single row ready to be sent to the import endpoint. */
export interface ImportRow {
  rowNumber: number;
  voter: VoterInput;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  failed: number;
  errors: { rowNumber: number; message: string }[];
}
