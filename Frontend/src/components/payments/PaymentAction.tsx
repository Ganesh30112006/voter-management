import { CheckCircle2, HandCoins } from 'lucide-react';
import type { VoterListItem } from '../../types';
import './Payments.css';

interface Props {
  voter: VoterListItem;
  onPay: (voter: VoterListItem) => void;
  onViewReceipt: (transactionId: string) => void;
}

/** A "Pay" button, or a green tick once the voter has received a payment. */
export function PaymentAction({ voter, onPay, onViewReceipt }: Props) {
  if (voter.paymentStatus === 'Received' && voter.latestPayment) {
    const tx = voter.latestPayment;
    return (
      <button
        type="button"
        className="received-tick"
        onClick={() => onViewReceipt(tx.id)}
        aria-label={`Received by ${tx.receiverName}. View payment details`}
        title="View transaction details"
      >
        <CheckCircle2 size={16} aria-hidden="true" /> Received
      </button>
    );
  }
  if (!voter.canRecordPayment) return null;
  return (
    <button type="button" className="btn btn-primary btn-sm" onClick={() => onPay(voter)}>
      <HandCoins size={15} aria-hidden="true" /> Pay
    </button>
  );
}
