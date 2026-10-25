import { AlertTriangle, Loader2, Plus } from 'lucide-react';
import { useState } from 'react';
import { useQuery } from '../../hooks/useQuery';
import { useToast } from '../../hooks/useToast';
import { errorMessage } from '../../services/apiError';
import { cashService } from '../../services/cashService';
import type { BloCash } from '../../types';
import { formatCurrency, formatDateTime } from '../../utils/format';
import { FormField } from '../common/FormField';

/**
 * Cash a Corporator gave a BLO, what the BLO paid out and what it has left. Only the BLO's own
 * Corporator (canEdit) can add money or take it back.
 */
export function BloCashPanel({ bloId, canEdit }: { bloId: string; canEdit: boolean }) {
  const toast = useToast();
  const [refreshKey, setRefreshKey] = useState(0);
  const [saved, setSaved] = useState<BloCash | null>(null);
  const { data: loaded, error } = useQuery(() => cashService.get(bloId), `cash-${bloId}-${refreshKey}`);
  const data = saved ?? loaded;
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(amount.trim());
    if (!amount.trim() || !Number.isInteger(n) || n === 0) {
      setFormError('Enter a whole amount. Use a minus sign (e.g. -500) for money taken back.');
      return;
    }
    setFormError(null);
    setBusy(true);
    try {
      setSaved(await cashService.add(bloId, n, note));
      setAmount('');
      setNote('');
      toast.success(n > 0 ? `${formatCurrency(n)} given to ${bloId}.` : `${formatCurrency(-n)} taken back from ${bloId}.`);
    } catch (err) {
      setFormError(errorMessage(err));
      setSaved(null);
      setRefreshKey((k) => k + 1);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="cash-panel">
      <h3 className="cash-title">Cash with this BLO</h3>
      {error && !data ? (
        <p className="small muted">{error}</p>
      ) : !data ? (
        <p className="small muted">Loading…</p>
      ) : (
        <>
          <dl className="detail-grid">
            <div>
              <dt>Given by Corporator</dt>
              <dd>{formatCurrency(data.given)}</dd>
            </div>
            <div>
              <dt>Paid to voters</dt>
              <dd>{formatCurrency(data.spent)}</dd>
            </div>
            <div>
              <dt>Left with BLO</dt>
              <dd className={data.left < 0 ? 'text-danger' : 'text-success'}>
                <strong>{formatCurrency(data.left)}</strong>
              </dd>
            </div>
          </dl>
          {canEdit && (
            <form className="stack" noValidate onSubmit={submit} style={{ marginTop: 12 }}>
              {formError && (
                <div className="alert alert-error" role="alert">
                  <AlertTriangle size={18} aria-hidden="true" />
                  {formError}
                </div>
              )}
              <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <FormField label="Add money (₹)" hint="Minus for money taken back">
                  <input className="input" type="number" inputMode="numeric" step={1} value={amount} onChange={(e) => setAmount(e.target.value)} style={{ maxWidth: 160 }} />
                </FormField>
                <FormField label="Note (optional)">
                  <input className="input" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
                </FormField>
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  {busy ? <Loader2 size={16} className="spinner" aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />} Save
                </button>
              </div>
            </form>
          )}
          {data.history.length > 0 && (
            <div className="table-wrap" style={{ marginTop: 12, maxHeight: 220, overflowY: 'auto' }}>
              <table className="table">
                <caption className="sr-only">Cash given to this BLO</caption>
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col" className="text-right">Amount</th>
                    <th scope="col">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {data.history.map((h) => (
                    <tr key={h.id}>
                      <td data-label="Date" className="nowrap">{formatDateTime(h.givenAt)}</td>
                      <td data-label="Amount" className={`text-right mono ${h.amount < 0 ? 'text-danger' : ''}`}>
                        {h.amount < 0 ? `− ${formatCurrency(-h.amount)}` : formatCurrency(h.amount)}
                      </td>
                      <td data-label="Note">{h.note || <span className="muted">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
