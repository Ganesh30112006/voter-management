export type Role = 'SUPER_ADMIN' | 'CORPORATOR' | 'BLO';

/** Roles an account can be created with: a Super Admin creates any role (Super Admins too), a Corporator only BLOs. */
export type ManagedRole = Role;

export type AccountStatus = 'Active' | 'Inactive';

export interface Admin {
  id: string;
  fullName: string;
  mobile: string;
  role: Role;
  /** The Corporator a BLO belongs to (fixed at creation); null for other roles. */
  corporatorId: string | null;
  /** Where a Corporator is based (free text entered by the Super Admin); empty for other roles. */
  location: string;
  wardIds: string[];
  /** Booths narrowing a ward (BLOs only; Corporators always cover whole wards). */
  boothIds: string[];
  status: AccountStatus;
  createdAt: string;
}

/** Small account summary for filters and assignment pickers. */
export type AdminOption = Pick<Admin, 'id' | 'fullName' | 'role' | 'corporatorId' | 'wardIds'>;

export interface AdminInput {
  fullName: string;
  mobile: string;
  /** Corporators only; ignored for other roles. */
  location?: string;
  wardIds: string[];
  boothIds: string[];
  /** Corporators: take wards that another Corporator already has (after the user chose "Move"). */
  moveWards?: boolean;
}

export interface AdminQuery {
  role?: ManagedRole;
  /** BLOs of one Corporator (Super Admin filter; Corporators always see only their own). */
  corporatorId?: string;
  search?: string;
  wardId?: string;
  status?: AccountStatus | '';
  sortBy?: 'id' | 'fullName' | 'createdAt' | 'status';
  sortDir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface AdminCreateInput extends AdminInput {
  role: ManagedRole;
  /** Required when the Super Admin creates a BLO; a Corporator always creates BLOs for itself. */
  corporatorId?: string;
  /** Initial password chosen by the creator. */
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
  /** The ward's own payment amount; null uses the overall amount. */
  paymentAmount: number | null;
  voterCount: number;
  adminIds: string[];
  booths: (Booth & { voterCount: number; adminIds: string[] })[];
}

export const VOTER_STATUSES = ['Active', 'Not Active', 'Shifted'] as const;
export type VoterStatus = (typeof VOTER_STATUSES)[number];

export const GENDERS = ['Male', 'Female', 'Other'] as const;
/** '' when the roll does not say. */
export type Gender = (typeof GENDERS)[number] | '';

export type PaymentStatus = 'Received' | 'Not Received';

export interface Voter {
  recordId: string;
  voterId: string;
  fullName: string;
  wardId: string;
  /** Optional: '' when the voter has no booth (ward rolls have none). */
  boothId: string;
  /** House / door number (ఇంటి సంఖ్య). */
  houseNumber: string;
  householdId: string;
  address: string;
  status: VoterStatus;
  /** As printed on the roll (వయస్సు); null when unknown. */
  age: number | null;
  /** As printed on the roll (లింగము); '' when unknown. */
  gender: Gender;
  createdAt: string;
  updatedAt: string;
}

export interface VoterInput {
  voterId: string;
  fullName: string;
  wardId: string;
  /** '' for no booth. */
  boothId: string;
  houseNumber: string;
  householdId: string;
  address: string;
  status: VoterStatus;
  age: number | null;
  gender: Gender;
}

export interface VoterListItem extends Voter {
  paymentStatus: PaymentStatus;
  latestPayment: PaymentTransaction | null;
  /** Whether the logged-in admin may record a payment for this voter (server decided). */
  canRecordPayment: boolean;
}

export interface VoterQuery {
  search?: string;
  wardId?: string;
  boothId?: string;
  status?: VoterStatus | '';
  paymentStatus?: PaymentStatus | '';
  sortBy?: 'voterId' | 'fullName' | 'ward' | 'booth' | 'houseNumber' | 'status';
  sortDir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface DuplicateCheckResult {
  voterIdExists: boolean;
  /** The voter that already has this Voter ID; `canReplace` when it is in the caller's wards. */
  existing: { recordId: string; fullName: string; wardId: string; canReplace: boolean } | null;
  similar: Pick<Voter, 'recordId' | 'voterId' | 'fullName' | 'houseNumber'>[];
}

export type TransactionStatus = 'Success' | 'Cancelled' | 'Reversed';

export interface PaymentTransaction {
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
  /** Who handed over the cash, as entered on the payment form (prefilled with the account name). */
  givenByName: string;
  status: TransactionStatus;
  statusReason?: string;
}

export interface PaymentInput {
  voterRecordId: string;
  amount: number;
  receiverName: string;
  receiverMobile: string;
  givenByName: string;
  /** Client-generated key so a retried request cannot create two transactions. */
  idempotencyKey: string;
}

export interface CancelPaymentInput {
  kind: 'Cancelled' | 'Reversed';
  reason: string;
}

export interface PaymentQuery {
  search?: string;
  from?: string;
  to?: string;
  wardId?: string;
  boothId?: string;
  adminId?: string;
  status?: TransactionStatus | '';
  sortBy?: 'timestamp' | 'amount' | 'voterName' | 'receiverName';
  sortDir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface PaymentSettings {
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
  settings: PaymentSettings;
  history: SettingsHistoryEntry[];
  /** Amount in effect today for new payments. */
  currentAmount: number;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  adminId: string;
  adminName: string;
  action: string;
  entity: 'Admin' | 'Ward' | 'Booth' | 'Voter' | 'Import' | 'Payment' | 'Settings' | 'Export' | 'Auth';
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

export interface PaymentContext {
  /** The ward's own amount when it has one, otherwise the overall amount. */
  suggestedAmount: number;
  /** Whether the prefilled amount may be changed (Settings). */
  amountEditable: boolean;
  /** The overall amount from Settings. */
  defaultAmount: number;
  /** Wards in the caller's area that have their own amount. */
  wardAmounts: { wardId: string; amount: number }[];
  /** BLO only: cash left from what its Corporator gave it (null for other roles). */
  cashLeft: number | null;
}

/** Cash a Corporator gave a BLO, what the BLO paid out and what it has left. */
export interface BloCash {
  given: number;
  spent: number;
  left: number;
  history: { id: string; amount: number; note: string; givenBy: string; givenAt: string }[];
}

export interface VoterDetail {
  voter: VoterListItem;
  transactions: PaymentTransaction[];
}

export interface TransactionDetail {
  transaction: PaymentTransaction;
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
  /** Super Admin only. */
  totalCorporators: number | null;
  /** Super Admin: all BLOs; Corporator: their own BLOs; BLO: null. */
  totalBlos: number | null;
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
  recentTransactions: PaymentTransaction[];
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
  /** Money given out by each BLO (Super Admin: every BLO; Corporator: its own BLOs; BLO: empty). */
  byBlo: {
    adminId: string;
    adminName: string;
    corporatorId: string;
    status: AccountStatus;
    transactions: number;
    amount: number;
    uniqueVoters: number;
    /** All-time cash given by the Corporator and what is left. */
    cashGiven: number;
    cashLeft: number;
  }[];
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
  /** Overwrite the existing voter with this Voter ID instead of skipping the row. */
  replace?: boolean;
}

export interface ImportResult {
  imported: number;
  /** Existing voters whose details were replaced by the file. */
  replaced: number;
  skipped: number;
  failed: number;
  errors: { rowNumber: number; message: string }[];
}
