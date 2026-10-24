import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, CheckCircle2, Loader2, UserCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useCurrentAdmin } from '../../hooks/useAuth';
import { useWards } from '../../hooks/useWards';
import { ApiError, errorMessage } from '../../services/apiError';
import { paymentService } from '../../services/paymentService';
import type { PaymentContext, PaymentTransaction, VoterListItem } from '../../types';
import { formatCurrency, formatDateTime, givenByLabel } from '../../utils/format';
import { randomId } from '../../utils/id';
import { paymentSchema, type PaymentFormValues } from '../../utils/validation';
import { PaymentStatusBadge, VoterStatusBadge } from '../common/Badges';
import { FormField } from '../common/FormField';
import { Modal } from '../common/Modal';
import { SkeletonLines } from '../common/States';
import './Payments.css';

interface Props {
  voter: VoterListItem;
  onClose: () => void;
  /** Called once the backend has confirmed the transaction. */
  onRecorded: (tx: PaymentTransaction) => void;
}

type Step = 'form' | 'confirm' | 'done';

export function RecordPaymentModal({ voter, onClose, onRecorded }: Props) {
  const { wardLabel, boothLabel } = useWards();
  // The account recording the payment is the one handing over the money.
  const me = useCurrentAdmin();
  const [ctx, setCtx] = useState<PaymentContext | null>(null);
  const [ctxError, setCtxError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('form');
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [saved, setSaved] = useState<PaymentTransaction | null>(null);
  // One key per modal: a retry after a network error can never create a second transaction.
  const idempotencyKey = useRef(randomId());

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    getValues,
    formState: { errors },
  } = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentSchema),
    defaultValues: { amount: '', receiverName: '', receiverMobile: '', givenByName: me.fullName },
  });

  useEffect(() => {
    let active = true;
    paymentService
      .context()
      .then((c) => {
        if (!active) return;
        setCtx(c);
        setValue('amount', String(c.suggestedAmount));
      })
      .catch((e) => active && setCtxError(errorMessage(e)));
    return () => {
      active = false;
    };
  }, [setValue]);

  const alreadyReceived = voter.paymentStatus === 'Received';

  // Only on request: the receiver may be someone other than the voter.
  const fillFromVoter = () => {
    setValue('receiverName', voter.fullName, { shouldValidate: true });
  };

  const save = async () => {
    const values = paymentSchema.parse(getValues());
    setSubmitting(true);
    setServerError(null);
    try {
      const tx = await paymentService.record({
        voterRecordId: voter.recordId,
        amount: values.amount,
        receiverName: values.receiverName,
        receiverMobile: values.receiverMobile,
        givenByName: values.givenByName,
        idempotencyKey: idempotencyKey.current,
      });
      setSaved(tx);
      setStep('done');
      onRecorded(tx);
    } catch (e) {
      if (e instanceof ApiError && e.fieldErrors) {
        for (const [field, msg] of Object.entries(e.fieldErrors)) {
          if (field === 'amount' || field === 'receiverName' || field === 'receiverMobile' || field === 'givenByName') setError(field, { message: msg });
        }
        setStep('form');
      }
      setServerError(errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  const values = getValues();
  const amountNumber = Number(values.amount);

  const footer =
    step === 'done' ? (
      <button type="button" className="btn btn-primary" onClick={onClose} autoFocus>
        Done
      </button>
    ) : step === 'confirm' ? (
      <>
        <button type="button" className="btn btn-secondary" onClick={() => setStep('form')} disabled={submitting}>
          Back
        </button>
        <button type="button" className="btn btn-success" onClick={save} disabled={submitting}>
          {submitting ? <Loader2 size={16} className="spinner" aria-hidden="true" /> : <CheckCircle2 size={16} aria-hidden="true" />}
          {submitting ? 'Saving…' : 'Confirm & Save'}
        </button>
      </>
    ) : (
      <>
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" form="payment-form" className="btn btn-primary" disabled={!ctx || alreadyReceived}>
          Save Payment
        </button>
      </>
    );

  return (
    <Modal title={step === 'done' ? 'Payment recorded' : 'Record payment'} onClose={onClose} footer={footer} locked={submitting}>
      {step === 'done' && saved ? (
        <div className="payment-success">
          <CheckCircle2 size={52} className="payment-success-icon" aria-hidden="true" />
          <p className="payment-success-title">✓ Received</p>
          <p className="muted small">Saved by the server. The voter is now marked as Received.</p>
          <dl className="detail-grid payment-receipt">
            <div>
              <dt>Amount</dt>
              <dd>{formatCurrency(saved.amount)}</dd>
            </div>
            <div>
              <dt>Receiver</dt>
              <dd>{saved.receiverName}</dd>
            </div>
            <div>
              <dt>Receiver mobile</dt>
              <dd>{saved.receiverMobile}</dd>
            </div>
            <div>
              <dt>Recorded at</dt>
              <dd>{formatDateTime(saved.timestamp)}</dd>
            </div>
            <div>
              <dt>Given by</dt>
              <dd>{givenByLabel(saved)}</dd>
            </div>
          </dl>
        </div>
      ) : (
        <div className="stack">
          <div className="voter-summary">
            <div className="voter-summary-head">
              <div>
                <p className="voter-summary-name">{voter.fullName}</p>
                <p className="muted small">{voter.voterId}</p>
              </div>
              <PaymentStatusBadge status={voter.paymentStatus} />
            </div>
            <dl className="voter-summary-meta">
              <div>
                <dt>Ward</dt>
                <dd>{wardLabel(voter.wardId)}</dd>
              </div>
              <div>
                <dt>Booth</dt>
                <dd>{boothLabel(voter.boothId)}</dd>
              </div>
              <div>
                <dt>Voter status</dt>
                <dd>
                  <VoterStatusBadge status={voter.status} />
                </dd>
              </div>
            </dl>
          </div>

          {alreadyReceived && (
            <div className="alert alert-warning">
              <AlertTriangle size={18} aria-hidden="true" />
              This voter has already received a payment. A second payment cannot be recorded.
            </div>
          )}
          {serverError && (
            <div className="alert alert-error" role="alert">
              <AlertTriangle size={18} aria-hidden="true" />
              {serverError}
            </div>
          )}
          {ctxError && (
            <div className="alert alert-error" role="alert">
              <AlertTriangle size={18} aria-hidden="true" />
              {ctxError}
            </div>
          )}

          {step === 'confirm' ? (
            <div className="confirm-box">
              <p className="small muted">Please confirm the details before saving.</p>
              <dl className="detail-grid">
                <div>
                  <dt>Amount</dt>
                  <dd>{formatCurrency(amountNumber)}</dd>
                </div>
                <div>
                  <dt>Voter</dt>
                  <dd>{voter.fullName}</dd>
                </div>
                <div>
                  <dt>Receiver</dt>
                  <dd>{values.receiverName.trim()}</dd>
                </div>
                <div>
                  <dt>Receiver mobile</dt>
                  <dd>{values.receiverMobile.trim()}</dd>
                </div>
                <div>
                  <dt>Given by</dt>
                  <dd>
                    {values.givenByName.trim()} ({me.id})
                  </dd>
                </div>
              </dl>
            </div>
          ) : !ctx && !ctxError ? (
            <SkeletonLines rows={3} />
          ) : (
            <form id="payment-form" className="stack" noValidate onSubmit={handleSubmit(() => setStep('confirm'))}>
              <FormField
                label="Amount (₹)"
                error={errors.amount?.message}
                required
                hint={ctx?.amountEditable ? 'Prefilled with the configured amount. You may change it.' : 'Fixed by the configured payment amount.'}
              >
                <input className="input" type="number" inputMode="numeric" min={1} step={1} readOnly={!ctx?.amountEditable} {...register('amount')} />
              </FormField>

              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="small muted">Who is receiving the payment?</span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={fillFromVoter}>
                  <UserCheck size={14} aria-hidden="true" /> Receiver is the voter
                </button>
              </div>

              <FormField label="Receiver name" error={errors.receiverName?.message} required>
                <input className="input" autoComplete="off" autoFocus {...register('receiverName')} />
              </FormField>

              <FormField label="Receiver mobile number" error={errors.receiverMobile?.message} required>
                <input className="input" type="tel" inputMode="numeric" autoComplete="off" placeholder="10-digit mobile" maxLength={14} {...register('receiverMobile')} />
              </FormField>

              <FormField
                label="Given by (your name)"
                error={errors.givenByName?.message}
                required
                hint={`Who is handing over the money. Saved with your account ${me.id}; the date and time are recorded automatically.`}
              >
                <input className="input" autoComplete="off" {...register('givenByName')} />
              </FormField>
            </form>
          )}
        </div>
      )}
    </Modal>
  );
}
