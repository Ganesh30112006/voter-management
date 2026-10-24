import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { FormField } from '../../components/common/FormField';
import { PageHeader } from '../../components/common/PageHeader';
import { ErrorState, SkeletonLines } from '../../components/common/States';
import { useConfirm } from '../../hooks/useConfirm';
import { useQuery } from '../../hooks/useQuery';
import { useToast } from '../../hooks/useToast';
import { ApiError, errorMessage } from '../../services/apiError';
import { settingsService } from '../../services/settingsService';
import type { SettingsResponse } from '../../types';
import { formatCurrency, formatDate, formatDateTime } from '../../utils/format';
import { settingsSchema, type SettingsFormValues } from '../../utils/validation';

export function SettingsPage() {
  const { data, error, reload } = useQuery(() => settingsService.get(), 'settings');
  const [latest, setLatest] = useState<SettingsResponse | null>(null);
  const current = latest ?? data;

  return (
    <>
      <PageHeader title="Settings" description="Payment amount configuration." />
      {error && !current ? (
        <div className="card">
          <ErrorState message={error} onRetry={reload} />
        </div>
      ) : !current ? (
        <div className="card">
          <SkeletonLines rows={5} />
        </div>
      ) : (
        <div className="stack">
          <PaymentSettingsForm data={current} onSaved={setLatest} />
          <section className="card">
            <div className="card-header">
              <h2>Configuration history</h2>
            </div>
            <div className="table-wrap">
              <table className="table">
                <caption className="sr-only">Payment amount history</caption>
                <thead>
                  <tr>
                    <th scope="col">Changed</th>
                    <th scope="col">By</th>
                    <th scope="col" className="text-right">Amount</th>
                    <th scope="col">Effective from</th>
                    <th scope="col">Summary</th>
                  </tr>
                </thead>
                <tbody>
                  {current.history.map((h) => (
                    <tr key={h.id}>
                      <td data-label="Changed" className="nowrap">
                        {formatDateTime(h.changedAt)}
                      </td>
                      <td data-label="By">{h.changedBy}</td>
                      <td data-label="Amount" className="text-right mono">
                        {formatCurrency(h.defaultAmount)}
                      </td>
                      <td data-label="Effective from">{formatDate(`${h.effectiveDate}T00:00:00`)}</td>
                      <td data-label="Summary" className="small">
                        {h.summary}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function PaymentSettingsForm({ data, onSaved }: { data: SettingsResponse; onSaved: (r: SettingsResponse) => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      defaultAmount: String(data.settings.defaultAmount),
      effectiveDate: data.settings.effectiveDate,
      allowAmountOverride: data.settings.allowAmountOverride,
    },
  });

  useEffect(() => {
    reset({
      defaultAmount: String(data.settings.defaultAmount),
      effectiveDate: data.settings.effectiveDate,
      allowAmountOverride: data.settings.allowAmountOverride,
    });
  }, [data, reset]);

  const onSubmit = async (values: SettingsFormValues) => {
    const parsed = settingsSchema.parse(values);
    if (parsed.defaultAmount !== data.settings.defaultAmount) {
      const ok = await confirm({
        title: 'Change the payment amount?',
        message: `New payments will default to ${formatCurrency(parsed.defaultAmount)} from ${formatDate(`${parsed.effectiveDate}T00:00:00`)}. Past transactions keep their recorded amounts.`,
        confirmLabel: 'Save',
      });
      if (!ok) return;
    }
    setServerError(null);
    try {
      const res = await settingsService.update(parsed);
      onSaved(res);
      toast.success('Payment settings saved.');
    } catch (e) {
      if (e instanceof ApiError && e.fieldErrors) {
        if (e.fieldErrors.defaultAmount) setError('defaultAmount', { message: e.fieldErrors.defaultAmount });
        if (e.fieldErrors.effectiveDate) setError('effectiveDate', { message: e.fieldErrors.effectiveDate });
      }
      setServerError(errorMessage(e));
    }
  };

  return (
    <section className="card">
      <div className="card-header">
        <div>
          <h2>Payment amount</h2>
          <p className="small muted">
            Amount in effect today: <strong>{formatCurrency(data.currentAmount)}</strong>. It is suggested in the payment form.
          </p>
        </div>
      </div>
      <form className="card-body stack" noValidate onSubmit={handleSubmit(onSubmit)}>
        {serverError && (
          <div className="alert alert-error" role="alert">
            <AlertTriangle size={18} aria-hidden="true" />
            {serverError}
          </div>
        )}
        <div className="form-grid">
          <FormField label="Default payment amount (₹)" error={errors.defaultAmount?.message} required>
            <input className="input" type="number" inputMode="numeric" min={1} step={1} {...register('defaultAmount')} />
          </FormField>
          <FormField label="Currency">
            <input className="input" value="INR (₹)" readOnly />
          </FormField>
          <FormField label="Effective date" error={errors.effectiveDate?.message} required hint="The new amount applies from this date.">
            <input className="input" type="date" {...register('effectiveDate')} />
          </FormField>
          <div className="field" style={{ justifyContent: 'center' }}>
            <label className="check">
              <input type="checkbox" {...register('allowAmountOverride')} /> Allow admins to change the amount per payment
            </label>
          </div>
        </div>
        <div>
          <button type="submit" className="btn btn-primary" disabled={isSubmitting || !isDirty}>
            {isSubmitting && <Loader2 size={16} className="spinner" aria-hidden="true" />}
            Save settings
          </button>
        </div>
      </form>
    </section>
  );
}
