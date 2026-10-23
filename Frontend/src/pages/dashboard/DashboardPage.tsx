import {
  CheckCircle2,
  CircleSlash,
  FileUp,
  HandCoins,
  History,
  IndianRupee,
  MapPin,
  MapPinned,
  Receipt,
  Search,
  ShieldCheck,
  Truck,
  UserCheck,
  Users,
  UsersRound,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChartCard, CHART, SimpleBarChart, StatusDonut, TrendLineChart } from '../../components/charts/Charts';
import { TransactionStatusBadge } from '../../components/common/Badges';
import { PageHeader } from '../../components/common/PageHeader';
import { StatCard, StatGrid } from '../../components/common/StatCard';
import { ErrorState } from '../../components/common/States';
import { TransactionDetailModal } from '../../components/donations/TransactionDetailModal';
import { useCurrentAdmin } from '../../hooks/useAuth';
import { useQuery } from '../../hooks/useQuery';
import { useWards } from '../../hooks/useWards';
import { reportService } from '../../services/reportService';
import type { DashboardStats, ReportFilters } from '../../types';
import { formatCurrency, formatDateTime, formatNumber } from '../../utils/format';
import { isSuperAdmin } from '../../utils/permissions';
import './Dashboard.css';

export function DashboardPage() {
  const admin = useCurrentAdmin();
  const superAdmin = isSuperAdmin(admin);
  const { wards, boothsForWard, wardLabel, boothLabel } = useWards();
  const [filters, setFilters] = useState<ReportFilters>({ from: '', to: '', wardId: '', boothId: '' });
  const [txId, setTxId] = useState<string | null>(null);
  const { data: s, loading, error, reload } = useQuery(() => reportService.dashboard(filters), JSON.stringify(filters));

  const wardOptions = superAdmin ? wards : wards.filter((w) => admin.wardIds.includes(w.id));
  const set = (patch: Partial<ReportFilters>) => setFilters((f) => ({ ...f, ...patch }));
  const busy = loading && !s;

  return (
    <>
      <PageHeader
        title={superAdmin ? 'Dashboard' : `Welcome, ${admin.fullName.split(' ')[0]}`}
        description={superAdmin ? 'Overview of voters, administrators and donations.' : `Your wards: ${admin.wardIds.map(wardLabel).join(', ') || 'none assigned'}`}
      />

      <div className="card dashboard-filters">
        <label className="field">
          <span className="field-label">From</span>
          <input type="date" className="input" value={filters.from} max={filters.to || undefined} onChange={(e) => set({ from: e.target.value })} />
        </label>
        <label className="field">
          <span className="field-label">To</span>
          <input type="date" className="input" value={filters.to} min={filters.from || undefined} onChange={(e) => set({ to: e.target.value })} />
        </label>
        <label className="field">
          <span className="field-label">Ward</span>
          <select className="select" value={filters.wardId} onChange={(e) => set({ wardId: e.target.value, boothId: '' })}>
            <option value="">{superAdmin ? 'All wards' : 'All my wards'}</option>
            {wardOptions.map((w) => (
              <option key={w.id} value={w.id}>
                Ward {w.number}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Booth</span>
          <select className="select" value={filters.boothId} disabled={!filters.wardId} onChange={(e) => set({ boothId: e.target.value })}>
            <option value="">{filters.wardId ? 'All booths' : 'Select a ward first'}</option>
            {(filters.wardId ? boothsForWard(filters.wardId) : []).map((b) => (
              <option key={b.id} value={b.id}>
                Booth {b.number}
              </option>
            ))}
          </select>
        </label>
        {(filters.from || filters.to || filters.wardId) && (
          <button type="button" className="btn btn-ghost" onClick={() => setFilters({ from: '', to: '', wardId: '', boothId: '' })}>
            Clear filters
          </button>
        )}
      </div>

      {error && !s ? (
        <div className="card">
          <ErrorState message={error} onRetry={reload} />
        </div>
      ) : (
        <div className="stack">
          <QuickActions superAdmin={superAdmin} />

          <h2 className="section-title">Voters {superAdmin ? '' : 'in your wards'}</h2>
          <StatGrid>
            {superAdmin && <StatCard label="Total Administrators" hint="BL Admin accounts" value={formatNumber(s?.totalAdmins ?? 0)} icon={ShieldCheck} tone="navy" loading={busy} />}
            <StatCard label={superAdmin ? 'Total Voters' : 'Voters in Assigned Wards'} value={formatNumber(s?.totalVoters ?? 0)} icon={Users} loading={busy} />
            {superAdmin && <StatCard label="Total Wards" value={formatNumber(s?.totalWards ?? 0)} icon={MapPinned} tone="navy" loading={busy} />}
            {superAdmin && <StatCard label="Total Booths" value={formatNumber(s?.totalBooths ?? 0)} icon={MapPin} tone="navy" loading={busy} />}
            <StatCard label="Active Voters" value={formatNumber(s?.activeVoters ?? 0)} icon={UserCheck} tone="green" loading={busy} />
            <StatCard label="Not Active Voters" value={formatNumber(s?.notActiveVoters ?? 0)} icon={CircleSlash} tone="gray" loading={busy} />
            <StatCard label="Shifted Voters" value={formatNumber(s?.shiftedVoters ?? 0)} icon={Truck} tone="amber" loading={busy} />
          </StatGrid>

          <h2 className="section-title">Donations</h2>
          <StatGrid>
            <StatCard label="Voters Received" hint="Unique voters" value={formatNumber(s?.votersReceived ?? 0)} icon={CheckCircle2} tone="green" loading={busy} />
            <StatCard label="Voters Not Received" hint="Unique voters" value={formatNumber(s?.votersNotReceived ?? 0)} icon={XCircle} tone="gray" loading={busy} />
            <StatCard label={superAdmin ? 'Donation Transactions' : 'Transactions in My Wards'} hint="Successful transactions" value={formatNumber(s?.totalTransactions ?? 0)} icon={Receipt} loading={busy} />
            <StatCard label="Total Amount Distributed" value={formatCurrency(s?.totalAmount ?? 0)} icon={IndianRupee} tone="green" loading={busy} />
            {!superAdmin && <StatCard label="Donations Recorded by Me" hint={formatCurrency(s?.myAmount ?? 0)} value={formatNumber(s?.myTransactions ?? 0)} icon={HandCoins} loading={busy} />}
          </StatGrid>

          {s && <DashboardCharts s={s} superAdmin={superAdmin} />}

          <div className="dashboard-columns">
            <section className="card">
              <div className="card-header">
                <h2>Recent donations</h2>
                <Link to="/donations/history" className="small">
                  View all
                </Link>
              </div>
              {s?.recentTransactions.length ? (
                <ul className="recent-list">
                  {s.recentTransactions.map((t) => (
                    <li key={t.id}>
                      <button type="button" className="recent-item" onClick={() => setTxId(t.id)}>
                        <span>
                          <strong>{t.voterName}</strong>
                          <span className="muted small recent-meta">
                            {wardLabel(t.wardId)} · {boothLabel(t.boothId)} · to {t.receiverName} · {formatDateTime(t.timestamp)} · {t.adminId}
                          </span>
                        </span>
                        <span className="recent-right">
                          <span className="mono">{formatCurrency(t.amount)}</span>
                          <TransactionStatusBadge status={t.status} />
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted small" style={{ padding: 18 }}>
                  {busy ? 'Loading…' : 'No donations yet.'}
                </p>
              )}
            </section>

            <section className="card">
              <div className="card-header">
                <h2>{superAdmin ? 'Recent activity' : 'My recent activity'}</h2>
                {superAdmin && (
                  <Link to="/audit" className="small">
                    Audit logs
                  </Link>
                )}
              </div>
              {s?.recentActivity.length ? (
                <ul className="activity-list">
                  {s.recentActivity.map((a) => (
                    <li key={a.id}>
                      <p className="small">
                        <strong>{a.action}</strong> · {a.adminId}
                      </p>
                      <p className="muted small">{a.summary}</p>
                      <p className="small" style={{ color: 'var(--color-text-subtle)' }}>
                        {formatDateTime(a.timestamp)}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted small" style={{ padding: 18 }}>
                  {busy ? 'Loading…' : 'No activity yet.'}
                </p>
              )}
            </section>
          </div>
        </div>
      )}

      {txId && <TransactionDetailModal transactionId={txId} onClose={() => setTxId(null)} onChanged={reload} />}
    </>
  );
}

function QuickActions({ superAdmin }: { superAdmin: boolean }) {
  const actions = superAdmin
    ? [
        { to: '/donations', label: 'Record Donation', icon: HandCoins },
        { to: '/voters', label: 'Voter Management', icon: Users },
        { to: '/import', label: 'Import Voters', icon: FileUp },
        { to: '/administrators', label: 'Administrators', icon: ShieldCheck },
      ]
    : [
        { to: '/voters', label: 'Search Voters', icon: Search },
        { to: '/voters/my-ward', label: 'My Ward Voters', icon: UsersRound },
        { to: '/donations', label: 'Record Donation', icon: HandCoins },
        { to: '/donations/history', label: 'Donation History', icon: History },
      ];
  return (
    <div className="quick-actions">
      {actions.map((a) => (
        <Link key={a.to} to={a.to} className="quick-action card">
          <a.icon size={20} aria-hidden="true" />
          <span>{a.label}</span>
        </Link>
      ))}
    </div>
  );
}

function shortDate(d: string): string {
  const [, m, day] = d.split('-');
  return `${Number(day)}/${Number(m)}`;
}

function DashboardCharts({ s, superAdmin }: { s: DashboardStats; superAdmin: boolean }) {
  const voterStatus = [
    { name: 'Active', value: s.activeVoters, color: CHART.green },
    { name: 'Not Active', value: s.notActiveVoters, color: CHART.gray },
    { name: 'Shifted', value: s.shiftedVoters, color: CHART.amber },
  ];
  const donationStatus = [
    { name: 'Received', value: s.votersReceived, color: CHART.green },
    { name: 'Not Received', value: s.votersNotReceived, color: CHART.gray },
  ];
  const overTime = s.overTime.map((d) => ({ ...d, label: shortDate(d.date) }));
  return (
    <div className="chart-grid">
      <ChartCard title="Voters by ward" empty={!s.byWard.length}>
        <SimpleBarChart data={s.byWard as unknown as Record<string, unknown>[]} dataKey="voters" nameKey="label" valueLabel="Voters" />
      </ChartCard>
      <ChartCard title="Voters by booth" empty={!s.byBooth.length}>
        <SimpleBarChart data={s.byBooth as unknown as Record<string, unknown>[]} dataKey="voters" nameKey="label" valueLabel="Voters" />
      </ChartCard>
      <ChartCard title="Voter status" empty={!s.totalVoters}>
        <StatusDonut data={voterStatus} />
      </ChartCard>
      <ChartCard title="Donation status" subtitle="Unique voters" empty={!s.totalVoters}>
        <StatusDonut data={donationStatus} />
      </ChartCard>
      <ChartCard title="Amount distributed over time" subtitle="Daily total of successful donations" empty={!overTime.length}>
        <TrendLineChart data={overTime} dataKey="amount" nameKey="label" valueLabel="Amount" format="currency" />
      </ChartCard>
      {superAdmin ? (
        <ChartCard title="Donations recorded by administrator" subtitle="Successful transactions" empty={!s.byAdmin.length}>
          <SimpleBarChart data={s.byAdmin as unknown as Record<string, unknown>[]} dataKey="transactions" nameKey="adminId" valueLabel="Transactions" />
        </ChartCard>
      ) : (
        <ChartCard title="Amount distributed by ward" empty={!s.byWard.length}>
          <SimpleBarChart data={s.byWard as unknown as Record<string, unknown>[]} dataKey="amount" nameKey="label" valueLabel="Amount" format="currency" />
        </ChartCard>
      )}
    </div>
  );
}
