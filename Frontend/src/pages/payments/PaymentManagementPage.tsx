import { HandCoins } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { VoterWorkspace } from '../../components/voters/VoterWorkspace';
import { useCurrentAdmin } from '../../hooks/useAuth';
import { useQuery } from '../../hooks/useQuery';
import { paymentService } from '../../services/paymentService';
import { formatCurrency } from '../../utils/format';

export function PaymentManagementPage() {
  const admin = useCurrentAdmin();
  const { data: ctx } = useQuery(() => paymentService.context(), 'payment-context');

  return (
    <>
      <PageHeader title="Payment Management" description="Find the voter, click Pay, and enter who received it. Voters who already received show a green tick." />

      <div className="alert alert-info" style={{ marginBottom: 16 }}>
        <HandCoins size={18} aria-hidden="true" />
        <span>
          Payment amount: <strong>{ctx ? formatCurrency(ctx.suggestedAmount) : '…'}</strong>
          {ctx && (ctx.amountEditable ? ' (can be changed per payment)' : ' (fixed)')}
        </span>
      </div>

      {admin.role !== 'SUPER_ADMIN' && (
        <p className="small muted" style={{ marginBottom: 16 }}>
          {admin.role === 'BLO' ? 'Showing voters in your assigned booths.' : 'Showing voters in your wards.'}
        </p>
      )}

      {/* No default payment filter: a voter must stay visible after paying so the tick shows. */}
      <VoterWorkspace />
    </>
  );
}
