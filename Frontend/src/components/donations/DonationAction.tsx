import { CheckCircle2, HandCoins } from 'lucide-react';
import type { VoterListItem } from '../../types';
import './Donations.css';

interface Props {
  voter: VoterListItem;
  onDonate: (voter: VoterListItem) => void;
  onViewReceipt: (transactionId: string) => void;
}

/** A "Donate" button, or a green tick once the voter has received a donation. */
export function DonationAction({ voter, onDonate, onViewReceipt }: Props) {
  if (voter.donationStatus === 'Received' && voter.latestDonation) {
    const tx = voter.latestDonation;
    return (
      <button
        type="button"
        className="received-tick"
        onClick={() => onViewReceipt(tx.id)}
        aria-label={`Received by ${tx.receiverName}. View transaction ${tx.id}`}
        title="View transaction details"
      >
        <CheckCircle2 size={16} aria-hidden="true" /> Received
      </button>
    );
  }
  if (!voter.canRecordDonation) return null;
  return (
    <button type="button" className="btn btn-primary btn-sm" onClick={() => onDonate(voter)}>
      <HandCoins size={15} aria-hidden="true" /> Donate
    </button>
  );
}
