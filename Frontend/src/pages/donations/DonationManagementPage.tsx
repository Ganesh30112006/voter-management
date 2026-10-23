import { HandCoins } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '../../components/common/PageHeader';
import { VoterWorkspace } from '../../components/voters/VoterWorkspace';
import { useCurrentAdmin } from '../../hooks/useAuth';
import { useQuery } from '../../hooks/useQuery';
import { donationService } from '../../services/donationService';
import { formatCurrency } from '../../utils/format';
import { isSuperAdmin } from '../../utils/permissions';

export function DonationManagementPage() {
  const admin = useCurrentAdmin();
  const superAdmin = isSuperAdmin(admin);
  const [scope, setScope] = useState<'all' | 'mine'>(superAdmin ? 'all' : 'mine');
  const { data: ctx } = useQuery(() => donationService.context(), 'donation-context');

  return (
    <>
      <PageHeader title="Donation Management" description="Find the voter, click Donate, and enter who received it. Voters who already received show a green tick." />

      <div className="alert alert-info" style={{ marginBottom: 16 }}>
        <HandCoins size={18} aria-hidden="true" />
        <span>
          Donation amount: <strong>{ctx ? formatCurrency(ctx.suggestedAmount) : '…'}</strong>
          {ctx && (ctx.amountEditable ? ' (can be changed per donation)' : ' (fixed)')}
        </span>
      </div>

      {!superAdmin && (
        <div className="tabs" role="tablist" style={{ marginBottom: 16 }}>
          <button type="button" className="tab" role="tab" aria-selected={scope === 'mine'} onClick={() => setScope('mine')}>
            My Ward Voters
          </button>
          <button type="button" className="tab" role="tab" aria-selected={scope === 'all'} onClick={() => setScope('all')}>
            All Voters
          </button>
        </div>
      )}

      {/* No default donation filter: a voter must stay visible after donating so the tick shows. */}
      <VoterWorkspace key={scope} scope={scope} />
    </>
  );
}
