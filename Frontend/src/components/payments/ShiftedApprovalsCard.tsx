import { Check, X } from 'lucide-react';
import { useState } from 'react';
import { useQuery } from '../../hooks/useQuery';
import { useToast } from '../../hooks/useToast';
import { useWards } from '../../hooks/useWards';
import { approvalService } from '../../services/approvalService';
import { errorMessage } from '../../services/apiError';
import { formatDateTime } from '../../utils/format';

/** Corporator / Super Admin: BLO requests to pay Shifted voters, with Allow / Refuse. */
export function ShiftedApprovalsCard({ onChanged }: { onChanged?: () => void }) {
  const toast = useToast();
  const { wardLabel, boothLabel } = useWards();
  const [refreshKey, setRefreshKey] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const { data } = useQuery(() => approvalService.list('Pending'), `shifted-pending-${refreshKey}`);

  if (!data?.length) return null;

  const decide = async (recordId: string, name: string, decision: 'Approved' | 'Rejected') => {
    setBusy(recordId);
    try {
      await approvalService.decide(recordId, decision);
      toast.success(decision === 'Approved' ? `Payment to ${name} allowed.` : `Payment to ${name} refused.`);
      setRefreshKey((k) => k + 1);
      onChanged?.();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="card" style={{ marginBottom: 16 }}>
      <div className="card-header">
        <h2>Permission requests · Shifted voters ({data.length})</h2>
      </div>
      <div className="table-wrap">
        <table className="table">
          <caption className="sr-only">BLO requests to pay Shifted voters</caption>
          <thead>
            <tr>
              <th scope="col">Voter</th>
              <th scope="col">Ward / Booth</th>
              <th scope="col">Asked by</th>
              <th scope="col">Asked at</th>
              <th scope="col" className="text-right">Decision</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.recordId}>
                <td data-label="Voter">
                  {r.fullName} <span className="mono muted small">{r.voterId}</span>
                </td>
                <td data-label="Ward / Booth">
                  {wardLabel(r.wardId)}
                  {r.boothId ? ` · ${boothLabel(r.boothId)}` : ''}
                </td>
                <td data-label="Asked by">{r.requestedBy || '—'}</td>
                <td data-label="Asked at" className="nowrap">{r.requestedAt ? formatDateTime(r.requestedAt) : '—'}</td>
                <td data-label="Decision" className="text-right">
                  <div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                    <button type="button" className="btn btn-primary btn-sm" disabled={busy !== null} onClick={() => decide(r.recordId, r.fullName, 'Approved')}>
                      <Check size={15} aria-hidden="true" /> Allow
                    </button>
                    <button type="button" className="btn btn-secondary btn-sm" disabled={busy !== null} onClick={() => decide(r.recordId, r.fullName, 'Rejected')}>
                      <X size={15} aria-hidden="true" /> Refuse
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
