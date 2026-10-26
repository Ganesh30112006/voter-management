import { HandCoins } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '../../components/common/PageHeader';
import { ShiftedApprovalsCard } from '../../components/payments/ShiftedApprovalsCard';
import { VoterWorkspace } from '../../components/voters/VoterWorkspace';
import { useCurrentAdmin } from '../../hooks/useAuth';
import { useQuery } from '../../hooks/useQuery';
import { useWards } from '../../hooks/useWards';
import { paymentService } from '../../services/paymentService';
import { formatCurrency } from '../../utils/format';

export function PaymentManagementPage() {
  const admin = useCurrentAdmin();
  const { wardLabel } = useWards();
  const [listKey, setListKey] = useState(0);
  const { data: ctx } = useQuery(() => paymentService.context(), 'payment-context');

  return (
    <>
      <PageHeader title="Payment Management" description="Find the voter, click Pay, and enter who received it. Voters who already received show a green tick." />

      <div className="alert alert-info" style={{ marginBottom: 16 }}>
        <HandCoins size={18} aria-hidden="true" />
        <span>
          Payment amount: <strong>{ctx ? formatCurrency(ctx.defaultAmount) : '…'}</strong>
          {ctx && (ctx.amountEditable ? ' (can be changed per payment)' : ' (fixed)')}
          {ctx && ctx.wardAmounts.length > 0 && (
            <> · Ward amounts: {ctx.wardAmounts.map((w) => `${wardLabel(w.wardId)} ${formatCurrency(w.amount)}`).join(', ')}</>
          )}
        </span>
      </div>

      {ctx && ctx.cashLeft !== null && (
        <div className={`alert ${ctx.cashLeft > 0 ? 'alert-info' : 'alert-warning'}`} style={{ marginBottom: 16 }}>
          <HandCoins size={18} aria-hidden="true" />
          <span>
            Money left with you: <strong>{formatCurrency(ctx.cashLeft)}</strong> (given by your Corporator, minus the payments you made)
          </span>
        </div>
      )}

      {admin.role !== 'SUPER_ADMIN' && (
        <p className="small muted" style={{ marginBottom: 16 }}>
          {admin.role === 'BLO' ? 'Showing voters in your assigned booths.' : 'Showing voters in your wards.'}
        </p>
      )}

      {admin.role !== 'BLO' && <ShiftedApprovalsCard onChanged={() => setListKey((k) => k + 1)} />}

      {/* No default payment filter: a voter must stay visible after paying so the tick shows. */}
      <VoterWorkspace key={listKey} />
    </>
  );
}
