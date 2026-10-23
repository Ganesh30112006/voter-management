import { Pencil, UserPlus } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useQuery } from '../../hooks/useQuery';
import { useWards } from '../../hooks/useWards';
import { voterService } from '../../services/voterService';
import type { Voter, VoterListItem } from '../../types';
import { formatCurrency, formatDateTime } from '../../utils/format';
import { isSuperAdmin } from '../../utils/permissions';
import { DonationStatusBadge, TransactionStatusBadge, VoterStatusBadge } from '../common/Badges';
import { Modal } from '../common/Modal';
import { ErrorState, SkeletonLines } from '../common/States';
import { DonationAction } from '../donations/DonationAction';
import '../donations/Donations.css';

interface Props {
  recordId: string;
  /** Changes whenever data may have changed elsewhere, so the modal refetches. */
  refreshKey: number;
  onClose: () => void;
  onDonate: (voter: VoterListItem) => void;
  onViewTransaction: (id: string) => void;
  onEdit: (voter: Voter) => void;
  onAddHouseholdMember: (voter: Voter) => void;
}

export function VoterDetailModal({ recordId, refreshKey, onClose, onDonate, onViewTransaction, onEdit, onAddHouseholdMember }: Props) {
  const { admin } = useAuth();
  const { wardLabel, boothLabel } = useWards();
  const { data, error, reload } = useQuery(() => voterService.get(recordId), `${recordId}:${refreshKey}`);
  const v = data?.voter;
  const superAdmin = isSuperAdmin(admin);

  const footer = v && (
    <>
      {superAdmin && (
        <>
          <button type="button" className="btn btn-secondary" onClick={() => onAddHouseholdMember(v)}>
            <UserPlus size={16} aria-hidden="true" /> Add household member
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => onEdit(v)}>
            <Pencil size={16} aria-hidden="true" /> Edit
          </button>
        </>
      )}
      <DonationAction voter={v} onDonate={onDonate} onViewReceipt={onViewTransaction} />
    </>
  );

  return (
    <Modal title="Voter details" onClose={onClose} footer={footer} size="lg">
      {error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !v ? (
        <SkeletonLines rows={6} />
      ) : (
        <div className="stack">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontWeight: 600, fontSize: '1.0625rem' }}>{v.fullName}</p>
              <p className="muted small">
                {v.voterId} · Record {v.recordId}
              </p>
            </div>
            <div className="row">
              <VoterStatusBadge status={v.status} />
              <DonationStatusBadge status={v.donationStatus} />
            </div>
          </div>

          <dl className="detail-grid">
            <div>
              <dt>Mobile number</dt>
              <dd>{v.mobile || '—'}</dd>
            </div>
            <div>
              <dt>Ward / Booth</dt>
              <dd>
                {wardLabel(v.wardId)} · {boothLabel(v.boothId)}
              </dd>
            </div>
            <div>
              <dt>House number</dt>
              <dd>{v.houseNumber}</dd>
            </div>
            <div>
              <dt>Household ID</dt>
              <dd>{v.householdId || '—'}</dd>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <dt>Address</dt>
              <dd>{v.address || '—'}</dd>
            </div>
          </dl>

          {v.latestDonation && (
            <div className="alert alert-success">
              <div>
                <strong>✓ Received</strong> — {formatCurrency(v.latestDonation.amount)} to {v.latestDonation.receiverName} ({v.latestDonation.receiverMobile})
                <br />
                <span className="small">
                  {formatDateTime(v.latestDonation.timestamp)} · recorded by {v.latestDonation.adminId}
                </span>
              </div>
            </div>
          )}

          <div>
            <h3 style={{ marginBottom: 8 }}>Donation history</h3>
            {data.transactions.length === 0 ? (
              <p className="muted small">No donations recorded for this voter.</p>
            ) : (
              <div className="tx-history">
                {data.transactions.map((t) => (
                  <button type="button" key={t.id} className="tx-history-item" onClick={() => onViewTransaction(t.id)}>
                    <span>
                      <strong className="small">{t.id}</strong>
                      <span className="small muted" style={{ display: 'block' }}>
                        {formatDateTime(t.timestamp)} · {t.receiverName}
                      </span>
                    </span>
                    <span className="row">
                      <span className="small">{formatCurrency(t.amount)}</span>
                      <TransactionStatusBadge status={t.status} />
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
