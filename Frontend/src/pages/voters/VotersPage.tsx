import { NavLink, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/common/PageHeader';
import { VoterWorkspace } from '../../components/voters/VoterWorkspace';
import { useCurrentAdmin } from '../../hooks/useAuth';
import { isSuperAdmin } from '../../utils/permissions';

export function VotersPage({ scope }: { scope: 'all' | 'mine' }) {
  const admin = useCurrentAdmin();
  const [params] = useSearchParams();
  const superAdmin = isSuperAdmin(admin);

  return (
    <>
      <PageHeader
        title={superAdmin ? 'Voter Management' : scope === 'mine' ? 'My Ward Voters' : 'All Voters'}
        description={
          superAdmin
            ? 'Search, add and edit voters. Click Donate to record a donation.'
            : scope === 'mine'
              ? 'Voters in your assigned wards.'
              : 'Every voter in the system. Click Donate to record a donation.'
        }
      />
      {!superAdmin && (
        <div className="tabs" role="tablist" style={{ marginBottom: 16 }}>
          <NavLink to="/voters" end className="tab" role="tab" aria-selected={scope === 'all'}>
            All Voters
          </NavLink>
          <NavLink to="/voters/my-ward" className="tab" role="tab" aria-selected={scope === 'mine'}>
            My Ward Voters
          </NavLink>
        </div>
      )}
      <VoterWorkspace
        key={`${scope}-${params.toString()}`}
        scope={scope}
        manage={superAdmin}
        initialWardId={params.get('ward') ?? ''}
        initialBoothId={params.get('booth') ?? ''}
      />
    </>
  );
}
