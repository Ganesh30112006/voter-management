import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/common/PageHeader';
import { VoterWorkspace } from '../../components/voters/VoterWorkspace';
import { useCurrentAdmin } from '../../hooks/useAuth';
import { isSuperAdmin } from '../../utils/permissions';

export function VotersPage() {
  const admin = useCurrentAdmin();
  const [params] = useSearchParams();
  const superAdmin = isSuperAdmin(admin);

  return (
    <>
      <PageHeader
        title={superAdmin ? 'Voter Management' : 'My Voters'}
        description={
          superAdmin
            ? 'Search, add and edit voters. Click Pay to record a payment.'
            : admin.role === 'BLO'
              ? 'Voters in your assigned booths. Click Pay to record a payment.'
              : 'Voters in your wards. Click Pay to record a payment.'
        }
      />
      <VoterWorkspace
        key={params.toString()}
        manage={superAdmin}
        initialWardId={params.get('ward') ?? ''}
        initialBoothId={params.get('booth') ?? ''}
      />
    </>
  );
}
