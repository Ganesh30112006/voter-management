import { CheckCircle2, Download, FileSpreadsheet, IndianRupee, Receipt, Users, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ChartCard, CHART, SimpleBarChart, StatusDonut, TrendLineChart } from '../../components/charts/Charts';
import { PageHeader } from '../../components/common/PageHeader';
import { StatCard, StatGrid } from '../../components/common/StatCard';
import { ErrorState } from '../../components/common/States';
import { useCurrentAdmin } from '../../hooks/useAuth';
import { useQuery } from '../../hooks/useQuery';
import { useToast } from '../../hooks/useToast';
import { useWards } from '../../hooks/useWards';
import { adminService, type AdminOption } from '../../services/adminService';
import { errorMessage } from '../../services/apiError';
import { reportService } from '../../services/reportService';
import type { GroupRow, ReportData, ReportFilters } from '../../types';
import { downloadCsv, downloadXlsx, type Cell } from '../../utils/download';
import { formatCurrency, formatNumber } from '../../utils/format';
import { boothsInArea, isSuperAdmin, wardsInArea } from '../../utils/permissions';
import './ReportsPage.css';

const GROUP_HEADERS = ['Name', 'Voters', 'Active', 'Not Active', 'Shifted', 'Received', 'Not Received', 'Transactions', 'Amount (INR)'];
const groupRow = (r: GroupRow): Cell[] => [r.label, r.voters, r.active, r.notActive, r.shifted, r.received, r.notReceived, r.transactions, r.amount];

function sheetsFor(d: ReportData) {
  return [
    {
      name: 'Summary',
      headers: ['Metric', 'Value'],
      rows: [
        ['Total voters', d.summary.totalVoters],
        ['Active', d.summary.active],
        ['Not Active', d.summary.notActive],
        ['Shifted', d.summary.shifted],
        ['Voters received (unique)', d.summary.votersReceived],
        ['Voters not received (unique)', d.summary.votersNotReceived],
        ['Successful transactions', d.summary.transactions],
        ['Amount distributed (INR)', d.summary.amount],
      ] as Cell[][],
    },
    { name: 'By ward', headers: GROUP_HEADERS, rows: d.byWard.map(groupRow) },
    { name: 'By booth', headers: GROUP_HEADERS, rows: d.byBooth.map(groupRow) },
    {
      name: 'By admin',
      headers: ['Admin ID', 'Admin name', 'Transactions', 'Unique voters', 'Amount (INR)'],
      rows: d.byAdmin.map((a) => [a.adminId, a.adminName, a.transactions, a.uniqueVoters, a.amount] as Cell[]),
    },
    { name: 'Daily', headers: ['Date', 'Transactions', 'Unique voters', 'Amount (INR)'], rows: d.daily.map((r) => [r.date, r.transactions, r.uniqueVoters, r.amount] as Cell[]) },
    { name: 'Monthly', headers: ['Month', 'Transactions', 'Unique voters', 'Amount (INR)'], rows: d.monthly.map((r) => [r.month, r.transactions, r.uniqueVoters, r.amount] as Cell[]) },
  ];
}

function GroupTable({ rows, caption }: { rows: GroupRow[]; caption: string }) {
  if (!rows.length) return <p className="muted small" style={{ padding: 16 }}>No data.</p>;
  const total = rows.reduce(
    (t, r) => ({ voters: t.voters + r.voters, received: t.received + r.received, notReceived: t.notReceived + r.notReceived, transactions: t.transactions + r.transactions, amount: t.amount + r.amount }),
    { voters: 0, received: 0, notReceived: 0, transactions: 0, amount: 0 },
  );
  return (
    <div className="table-wrap">
      <table className="table report-table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col" className="text-right">Voters</th>
            <th scope="col" className="text-right">Active</th>
            <th scope="col" className="text-right">Not Active</th>
            <th scope="col" className="text-right">Shifted</th>
            <th scope="col" className="text-right">Received</th>
            <th scope="col" className="text-right">Not Received</th>
            <th scope="col" className="text-right">Transactions</th>
            <th scope="col" className="text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td data-label="Name">{r.label}</td>
              <td data-label="Voters" className="text-right mono">{formatNumber(r.voters)}</td>
              <td data-label="Active" className="text-right mono">{formatNumber(r.active)}</td>
              <td data-label="Not Active" className="text-right mono">{formatNumber(r.notActive)}</td>
              <td data-label="Shifted" className="text-right mono">{formatNumber(r.shifted)}</td>
              <td data-label="Received" className="text-right mono">{formatNumber(r.received)}</td>
              <td data-label="Not Received" className="text-right mono">{formatNumber(r.notReceived)}</td>
              <td data-label="Transactions" className="text-right mono">{formatNumber(r.transactions)}</td>
              <td data-label="Amount" className="text-right mono">{formatCurrency(r.amount)}</td>
            </tr>
          ))}
          <tr className="report-total">
            <td data-label="Name">Total</td>
            <td data-label="Voters" className="text-right mono">{formatNumber(total.voters)}</td>
            <td data-label="Active" />
            <td data-label="Not Active" />
            <td data-label="Shifted" />
            <td data-label="Received" className="text-right mono">{formatNumber(total.received)}</td>
            <td data-label="Not Received" className="text-right mono">{formatNumber(total.notReceived)}</td>
            <td data-label="Transactions" className="text-right mono">{formatNumber(total.transactions)}</td>
            <td data-label="Amount" className="text-right mono">{formatCurrency(total.amount)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function ReportsPage() {
  const admin = useCurrentAdmin();
  const superAdmin = isSuperAdmin(admin);
  const toast = useToast();
  const { wards, booths } = useWards();
  const [filters, setFilters] = useState<ReportFilters>({ from: '', to: '', wardId: '', boothId: '', adminId: '' });
  const [admins, setAdmins] = useState<AdminOption[]>([]);
  const [exporting, setExporting] = useState(false);
  const { data, loading, error, reload } = useQuery(() => reportService.report(filters), JSON.stringify(filters));
  const set = (patch: Partial<ReportFilters>) => setFilters((f) => ({ ...f, ...patch }));

  useEffect(() => {
    if (!superAdmin) return;
    adminService
      .options()
      .then(setAdmins)
      .catch(() => setAdmins([]));
  }, [superAdmin]);

  const exportAs = async (format: 'CSV' | 'Excel') => {
    if (!data) return;
    setExporting(true);
    try {
      // The backend logs the export in the audit trail before the file is produced.
      await reportService.logExport('Payment & voter report', format);
      const sheets = sheetsFor(data);
      if (format === 'Excel') {
        downloadXlsx('report.xlsx', sheets);
      } else {
        // One CSV with each section titled and separated by a blank line.
        const rows: Cell[][] = [];
        sheets.forEach((sheet, i) => {
          if (i > 0) rows.push([], [sheet.name]);
          rows.push(...(i > 0 ? [sheet.headers] : []), ...sheet.rows);
        });
        downloadCsv('report.csv', sheets[0].headers, rows);
      }
      toast.success(`Report exported as ${format}.`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setExporting(false);
    }
  };

  const busy = loading && !data;
  const s = data?.summary;

  return (
    <>
      <PageHeader
        title={superAdmin ? 'Reports & Analytics' : 'Reports'}
        description={superAdmin ? 'Voter and payment reports across all wards.' : 'Reports for your assigned area.'}
        actions={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => exportAs('CSV')} disabled={!data || exporting}>
              <Download size={16} aria-hidden="true" /> CSV
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => exportAs('Excel')} disabled={!data || exporting}>
              <FileSpreadsheet size={16} aria-hidden="true" /> Excel
            </button>
          </>
        }
      />

      <div className="card report-filters">
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
            {wardsInArea(admin, wards).map((w) => (
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
            {(filters.wardId ? boothsInArea(admin, filters.wardId, booths) : []).map((b) => (
              <option key={b.id} value={b.id}>
                Booth {b.number}
              </option>
            ))}
          </select>
        </label>
        {superAdmin && (
          <label className="field">
            <span className="field-label">Administrator</span>
            <select className="select" value={filters.adminId} onChange={(e) => set({ adminId: e.target.value })}>
              <option value="">All admins</option>
              {admins.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.id} – {a.fullName}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {error && !data ? (
        <div className="card">
          <ErrorState message={error} onRetry={reload} />
        </div>
      ) : (
        <div className="stack">
          <StatGrid>
            <StatCard label="Total voters" value={formatNumber(s?.totalVoters ?? 0)} hint={s ? `${formatNumber(s.active)} active · ${formatNumber(s.notActive)} not active · ${formatNumber(s.shifted)} shifted` : undefined} icon={Users} loading={busy} />
            <StatCard label="Voters received" hint="Unique voters" value={formatNumber(s?.votersReceived ?? 0)} icon={CheckCircle2} tone="green" loading={busy} />
            <StatCard label="Voters not received" hint="Unique voters" value={formatNumber(s?.votersNotReceived ?? 0)} icon={XCircle} tone="gray" loading={busy} />
            <StatCard label="Successful transactions" value={formatNumber(s?.transactions ?? 0)} icon={Receipt} loading={busy} />
            <StatCard label="Amount distributed" value={formatCurrency(s?.amount ?? 0)} icon={IndianRupee} tone="green" loading={busy} />
          </StatGrid>

          {data && (
            <>
              <div className="chart-grid">
                <ChartCard title="Voter status" empty={!data.summary.totalVoters}>
                  <StatusDonut
                    data={[
                      { name: 'Active', value: data.summary.active, color: CHART.green },
                      { name: 'Not Active', value: data.summary.notActive, color: CHART.gray },
                      { name: 'Shifted', value: data.summary.shifted, color: CHART.amber },
                    ]}
                  />
                </ChartCard>
                <ChartCard title="Payment status" subtitle="Unique voters" empty={!data.summary.totalVoters}>
                  <StatusDonut
                    data={[
                      { name: 'Received', value: data.summary.votersReceived, color: CHART.green },
                      { name: 'Not Received', value: data.summary.votersNotReceived, color: CHART.gray },
                    ]}
                  />
                </ChartCard>
                <ChartCard title="Amount distributed by ward" empty={!data.byWard.length}>
                  <SimpleBarChart data={data.byWard as unknown as Record<string, unknown>[]} dataKey="amount" nameKey="label" valueLabel="Amount" format="currency" />
                </ChartCard>
                <ChartCard title="Amount distributed by booth" empty={!data.byBooth.length}>
                  <SimpleBarChart data={data.byBooth as unknown as Record<string, unknown>[]} dataKey="amount" nameKey="label" valueLabel="Amount" format="currency" />
                </ChartCard>
                <ChartCard title="Daily amount distributed" empty={!data.daily.length}>
                  <TrendLineChart data={[...data.daily].reverse()} dataKey="amount" nameKey="date" valueLabel="Amount" format="currency" />
                </ChartCard>
                <ChartCard title="Amount by administrator" empty={!data.byAdmin.length}>
                  <SimpleBarChart data={data.byAdmin as unknown as Record<string, unknown>[]} dataKey="amount" nameKey="adminId" valueLabel="Amount" format="currency" />
                </ChartCard>
              </div>

              <section className="card">
                <div className="card-header">
                  <h2>By ward</h2>
                </div>
                <GroupTable rows={data.byWard} caption="Report by ward" />
              </section>
              <section className="card">
                <div className="card-header">
                  <h2>By booth</h2>
                </div>
                <GroupTable rows={data.byBooth} caption="Report by booth" />
              </section>

              <div className="chart-grid">
                <section className="card">
                  <div className="card-header">
                    <h2>By administrator</h2>
                  </div>
                  <SimpleTable
                    caption="By administrator"
                    headers={['Admin', 'Transactions', 'Unique voters', 'Amount']}
                    rows={data.byAdmin.map((a) => [`${a.adminId} · ${a.adminName}`, formatNumber(a.transactions), formatNumber(a.uniqueVoters), formatCurrency(a.amount)])}
                  />
                </section>
                <section className="card">
                  <div className="card-header">
                    <h2>Monthly summary</h2>
                  </div>
                  <SimpleTable
                    caption="Monthly summary"
                    headers={['Month', 'Transactions', 'Unique voters', 'Amount']}
                    rows={data.monthly.map((m) => [m.month, formatNumber(m.transactions), formatNumber(m.uniqueVoters), formatCurrency(m.amount)])}
                  />
                </section>
              </div>

              <section className="card">
                <div className="card-header">
                  <h2>Daily summary</h2>
                </div>
                <SimpleTable
                  caption="Daily summary"
                  headers={['Date', 'Transactions', 'Unique voters', 'Amount']}
                  rows={data.daily.map((d) => [d.date, formatNumber(d.transactions), formatNumber(d.uniqueVoters), formatCurrency(d.amount)])}
                />
              </section>
            </>
          )}
        </div>
      )}
    </>
  );
}

function SimpleTable({ caption, headers, rows }: { caption: string; headers: string[]; rows: string[][] }) {
  if (!rows.length) return <p className="muted small" style={{ padding: 16 }}>No data.</p>;
  return (
    <div className="table-wrap report-scroll">
      <table className="table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={h} scope="col" className={i > 0 ? 'text-right' : undefined}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri}>
              {r.map((c, i) => (
                <td key={i} data-label={headers[i]} className={i > 0 ? 'text-right mono' : undefined}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
