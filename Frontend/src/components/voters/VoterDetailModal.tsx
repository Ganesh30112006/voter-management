import { Pencil, UserPlus } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useQuery } from '../../hooks/useQuery';
import { useWards } from '../../hooks/useWards';
import { voterService } from '../../services/voterService';
import type { Voter, VoterListItem } from '../../types';
import { formatCurrency, formatDateTime, givenByLabel } from '../../utils/format';
import { canManageWardData } from '../../utils/permissions';
import { PaymentStatusBadge, TransactionStatusBadge, VoterStatusBadge } from '../common/Badges';
import { Modal } from '../common/Modal';
import { ErrorState, SkeletonLines } from '../common/States';
import { PaymentAction } from '../payments/PaymentAction';
import '../payments/Payments.css';

interface Props {
  recordId: string;
  /** Changes whenever data may have changed elsewhere, so the modal refetches. */
  refreshKey: number;
  onClose: () => void;
  onPay: (voter: VoterListItem) => void;
  onViewTransaction: (id: string) => void;
  onEdit: (voter: Voter) => void;
  onAddHouseholdMember: (voter: Voter) => void;
}

export function VoterDetailModal({ recordId, refreshKey, onClose, onPay, onViewTransaction, onEdit, onAddHouseholdMember }: Props) {
  const { admin } = useAuth();
  const { wardLabel, boothLabel } = useWards();
  const { data, error, reload } = useQuery(() => voterService.get(recordId), `${recordId}:${refreshKey}`);
  const v = data?.voter;
  const canEdit = canManageWardData(admin);

  const footer = v && (
    <>
      {canEdit && (
        <>
          <button type="button" className="btn btn-secondary" onClick={() => onAddHouseholdMember(v)}>
            <UserPlus size={16} aria-hidden="true" /> Add household member
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => onEdit(v)}>
            <Pencil size={16} aria-hidden="true" /> Edit
          </button>
        </>
      )}
      <PaymentAction voter={v} onPay={onPay} onViewReceipt={onViewTransaction} />
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
              <PaymentStatusBadge status={v.paymentStatus} />
            </div>
          </div>

          <dl className="detail-grid">
            <div>
              <dt>Ward / Booth</dt>
              <dd>
                {wardLabel(v.wardId)} · {boothLabel(v.boothId)}
              </dd>
            </div>
            <div>
              <dt>House / door number</dt>
              <dd>{v.houseNumber}</dd>
            </div>
            <div>
              <dt>Age / Gender</dt>
              <dd>{[v.age ?? '', v.gender].filter((x) => x !== '').join(' · ') || '—'}</dd>
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

          {v.latestPayment && (
            <div className="alert alert-success">
              <div>
                <strong>✓ Received</strong> — {formatCurrency(v.latestPayment.amount)} to {v.latestPayment.receiverName} ({v.latestPayment.receiverMobile})
                <br />
                <span className="small">
                  {formatDateTime(v.latestPayment.timestamp)}
                  {v.latestPayment.adminId && ` · recorded by ${v.latestPayment.adminId}`}
                </span>
              </div>
            </div>
          )}

          <div>
            <h3 style={{ marginBottom: 8 }}>Payment history</h3>
            {data.transactions.length === 0 ? (
              <p className="muted small">No payments recorded for this voter.</p>
            ) : (
              <div className="tx-history">
                {data.transactions.map((t) => (
                  <button type="button" key={t.id} className="tx-history-item" onClick={() => onViewTransaction(t.id)}>
                    <span>
                      <strong className="small">{formatDateTime(t.timestamp)}</strong>
                      <span className="small muted" style={{ display: 'block' }}>
                        To {t.receiverName}
                        {t.adminId && ` · given by ${givenByLabel(t)}`}
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
