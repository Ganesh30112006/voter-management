import { AlertTriangle, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useQuery } from '../../hooks/useQuery';
import { useToast } from '../../hooks/useToast';
import { useWards } from '../../hooks/useWards';
import { ApiError, errorMessage } from '../../services/apiError';
import { paymentService } from '../../services/paymentService';
import type { CancelPaymentInput, PaymentTransaction } from '../../types';
import { formatCurrency, formatDateTime, givenByLabel } from '../../utils/format';
import { canManageWardData } from '../../utils/permissions';
import { TransactionStatusBadge } from '../common/Badges';
import { FormField } from '../common/FormField';
import { Modal } from '../common/Modal';
import { ErrorState, SkeletonLines } from '../common/States';
import './Payments.css';

interface Props {
  transactionId: string;
  onClose: () => void;
  /** Called after the Super Admin cancels or reverses the transaction. */
  onChanged?: (tx: PaymentTransaction) => void;
}

export function TransactionDetailModal({ transactionId, onClose, onChanged }: Props) {
  const { admin } = useAuth();
  const toast = useToast();
  const { wardLabel, boothLabel } = useWards();
  const { data, loading, error, reload } = useQuery(() => paymentService.get(transactionId), transactionId);
  const [voidKind, setVoidKind] = useState<CancelPaymentInput['kind'] | null>(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const tx = data?.transaction;
  // The Super Admin, or a Corporator for payments in its wards (the server checks the ward).
  const canVoid = canManageWardData(admin) && tx?.status === 'Success';

  const submitVoid = async () => {
    if (!voidKind || !tx) return;
    if (reason.trim().length < 3) {
      setReasonError('Enter a reason (at least 3 characters)');
      return;
    }
    setReasonError(undefined);
    setSubmitting(true);
    setServerError(null);
    try {
      const updated = await paymentService.cancel(tx.id, { kind: voidKind, reason: reason.trim() });
      toast.success(`Payment ${updated.status.toLowerCase()}. The voter is now Not Received.`);
      setVoidKind(null);
      setReason('');
      reload();
      onChanged?.(updated);
    } catch (e) {
      if (e instanceof ApiError && e.fieldErrors?.reason) setReasonError(e.fieldErrors.reason);
      setServerError(errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  const footer = voidKind ? (
    <>
      <button type="button" className="btn btn-secondary" onClick={() => setVoidKind(null)} disabled={submitting}>
        Back
      </button>
      <button type="button" className="btn btn-danger" onClick={submitVoid} disabled={submitting}>
        {submitting && <Loader2 size={16} className="spinner" aria-hidden="true" />}
        {voidKind === 'Cancelled' ? 'Cancel payment' : 'Reverse payment'}
      </button>
    </>
  ) : (
    <>
      {canVoid && (
        <>
          <button type="button" className="btn btn-secondary" onClick={() => setVoidKind('Reversed')}>
            Reverse
          </button>
          <button type="button" className="btn btn-danger" onClick={() => setVoidKind('Cancelled')}>
            Cancel payment
          </button>
        </>
      )}
      <button type="button" className="btn btn-primary" onClick={onClose}>
        Close
      </button>
    </>
  );

  return (
    <Modal title="Payment details" onClose={onClose} footer={footer} locked={submitting}>
      {error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !tx || (loading && !data) ? (
        <SkeletonLines rows={5} />
      ) : (
        <div className="stack">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <strong>{formatCurrency(tx.amount)} · {formatDateTime(tx.timestamp)}</strong>
            <TransactionStatusBadge status={tx.status} />
          </div>
          <dl className="detail-grid">
            <div>
              <dt>Voter</dt>
              <dd>
                {tx.voterName} ({tx.voterId})
              </dd>
            </div>
            <div>
              <dt>Ward / Booth</dt>
              <dd>
                {wardLabel(tx.wardId)} · {boothLabel(tx.boothId)}
              </dd>
            </div>
            <div>
              <dt>Amount</dt>
              <dd>{formatCurrency(tx.amount)}</dd>
            </div>
            <div>
              <dt>Recorded at</dt>
              <dd>{formatDateTime(tx.timestamp)}</dd>
            </div>
            <div>
              <dt>Receiver name</dt>
              <dd>{tx.receiverName}</dd>
            </div>
            <div>
              <dt>Receiver mobile</dt>
              <dd>{tx.receiverMobile}</dd>
            </div>
            {tx.adminId && (
              <div>
                <dt>Given by</dt>
                <dd>{givenByLabel(tx)}</dd>
              </div>
            )}
            {tx.statusReason && (
              <div>
                <dt>Reason</dt>
                <dd>{tx.statusReason}</dd>
              </div>
            )}
          </dl>

          {voidKind && (
            <div className="stack">
              <div className="alert alert-warning">
                <AlertTriangle size={18} aria-hidden="true" />
                {voidKind === 'Cancelled' ? 'Cancelling' : 'Reversing'} keeps this record in the history but it will no longer count as a payment. The voter will
                show Not Received again.
              </div>
              <FormField label="Reason" error={reasonError} required>
                <textarea className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus maxLength={250} />
              </FormField>
            </div>
          )}
          {serverError && (
            <div className="alert alert-error" role="alert">
              <AlertTriangle size={18} aria-hidden="true" />
              {serverError}
            </div>
          )}

          {data.audit.length > 0 && (
            <div>
              <h3 style={{ marginBottom: 8 }}>Audit history</h3>
              <ul className="audit-trail">
                {data.audit.map((a) => (
                  <li key={a.id}>
                    <p className="small">
                      <strong>{a.action}</strong>
                      {a.adminId && ` by ${a.adminId}`}
                    </p>
                    <p className="small muted">
                      {formatDateTime(a.timestamp)} · {a.summary}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
