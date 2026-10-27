import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/common/PageHeader';
import { VoterCounts } from '../../components/voters/VoterCounts';
import { VoterWorkspace } from '../../components/voters/VoterWorkspace';
import { useCurrentAdmin } from '../../hooks/useAuth';
import { canManageWardData, isSuperAdmin } from '../../utils/permissions';

export function VotersPage() {
  const admin = useCurrentAdmin();
  const [params] = useSearchParams();
  const superAdmin = isSuperAdmin(admin);
  const manage = canManageWardData(admin);
  const [countsKey, setCountsKey] = useState(0);

  return (
    <>
      <PageHeader
        title={superAdmin ? 'Voter Management' : 'My Voters'}
        description={
          superAdmin
            ? "Search, add, edit and remove voters. Payments are recorded by each Corporator's team."
            : admin.role === 'BLO'
              ? 'Voters in your assigned booths. Click Pay to record a payment.'
              : 'Voters in your wards. Search, add, edit and remove them; click Pay to record a payment.'
        }
      />
      {manage && <VoterCounts refreshKey={countsKey} />}
      <VoterWorkspace
        key={params.toString()}
        manage={manage}
        onDataChanged={() => setCountsKey((k) => k + 1)}
        initialWardId={params.get('ward') ?? ''}
        initialBoothId={params.get('booth') ?? ''}
      />
    </>
  );
}
