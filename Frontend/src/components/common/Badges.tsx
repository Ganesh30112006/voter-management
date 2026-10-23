import { CheckCircle2 } from 'lucide-react';
import type { AccountStatus, PaymentStatus, TransactionStatus, VoterStatus } from '../../types';

const VOTER_TONE: Record<VoterStatus, string> = {
  Active: 'badge-success',
  'Not Active': 'badge-neutral',
  Shifted: 'badge-warning',
};

export function VoterStatusBadge({ status }: { status: VoterStatus }) {
  return <span className={`badge ${VOTER_TONE[status]}`}>{status}</span>;
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  if (status === 'Received') {
    return (
      <span className="badge badge-success">
        <CheckCircle2 size={14} aria-hidden="true" /> Received
      </span>
    );
  }
  return <span className="badge badge-neutral">Not Received</span>;
}

const TX_TONE: Record<TransactionStatus, string> = {
  Success: 'badge-success',
  Cancelled: 'badge-danger',
  Reversed: 'badge-warning',
};

export function TransactionStatusBadge({ status }: { status: TransactionStatus }) {
  return <span className={`badge ${TX_TONE[status]}`}>{status}</span>;
}

export function AccountStatusBadge({ status }: { status: AccountStatus }) {
  return <span className={`badge ${status === 'Active' ? 'badge-success' : 'badge-neutral'}`}>{status}</span>;
}
