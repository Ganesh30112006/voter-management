import { Link } from 'react-router-dom';
import { useQuery } from '../../hooks/useQuery';
import { wardService } from '../../services/wardService';
import { formatNumber } from '../../utils/format';

/** Total voters and the count per ward: every ward for the Super Admin, its own wards for a Corporator. */
export function VoterCounts({ refreshKey }: { refreshKey: number }) {
  const { data } = useQuery(() => wardService.summaries(), `voter-counts-${refreshKey}`);
  if (!data) return null;
  const total = data.reduce((n, w) => n + w.voterCount, 0);
  return (
    <div className="card voter-counts" style={{ marginBottom: 16 }}>
      <div className="card-body row" style={{ flexWrap: 'wrap', gap: 8 }}>
        <span className="badge badge-info">
          Total voters: <strong>{formatNumber(total)}</strong>
        </span>
        {data.map((w) => (
          <Link key={w.id} to={`/voters?ward=${encodeURIComponent(w.id)}`} className="badge badge-neutral" title={`Show voters of Ward ${w.number}`}>
            Ward {w.number}: <strong>{formatNumber(w.voterCount)}</strong>
          </Link>
        ))}
      </div>
    </div>
  );
}
