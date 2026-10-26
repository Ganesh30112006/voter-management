import { CheckCircle2, Clock, HandCoins, ShieldQuestion } from 'lucide-react';
import { useState } from 'react';
import { useCurrentAdmin } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { approvalService } from '../../services/approvalService';
import { errorMessage } from '../../services/apiError';
import type { VoterListItem } from '../../types';
import './Payments.css';

interface Props {
  voter: VoterListItem;
  onPay: (voter: VoterListItem) => void;
  onViewReceipt: (transactionId: string) => void;
  /** Called after a BLO asks for permission, so the list refreshes. */
  onChanged?: () => void;
}

/**
 * A "Pay" button, a green tick once the voter has received a payment, or "Dead" for dead voters (never paid).
 * Shifted voters can be paid, but a BLO first asks its Corporator for permission.
 */
export function PaymentAction({ voter, onPay, onViewReceipt, onChanged }: Props) {
  const me = useCurrentAdmin();
  const toast = useToast();
  const [asking, setAsking] = useState(false);

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
  if (voter.status === 'Dead') {
    return (
      <span className="small muted" title="Dead voters cannot be paid.">
        Dead · no payment
      </span>
    );
  }
  if (voter.status === 'Shifted' && me.role === 'BLO' && voter.shiftedApproval !== 'Approved') {
    if (voter.shiftedApproval === 'Pending') {
      return (
        <span className="small muted nowrap" title="Your Corporator has not answered yet.">
          <Clock size={14} aria-hidden="true" /> Waiting for permission
        </span>
      );
    }
    const ask = async () => {
      setAsking(true);
      try {
        await approvalService.request(voter.recordId);
        toast.success(`Permission asked for ${voter.fullName}.`);
        onChanged?.();
      } catch (e) {
        toast.error(errorMessage(e));
      } finally {
        setAsking(false);
      }
    };
    return (
      <button
        type="button"
        className="btn btn-secondary btn-sm nowrap"
        onClick={ask}
        disabled={asking}
        title="This voter has shifted. Your Corporator must allow the payment."
      >
        <ShieldQuestion size={15} aria-hidden="true" /> {voter.shiftedApproval === 'Rejected' ? 'Refused · ask again' : 'Ask permission'}
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
