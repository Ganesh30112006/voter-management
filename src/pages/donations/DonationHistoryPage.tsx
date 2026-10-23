import { Download, Eye, FileSpreadsheet } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { TransactionStatusBadge } from '../../components/common/Badges';
import { PageHeader } from '../../components/common/PageHeader';
import { SearchInput } from '../../components/common/SearchInput';
import { TransactionDetailModal } from '../../components/donations/TransactionDetailModal';
import { DataTable, type Column, type SortState } from '../../components/tables/DataTable';
import { Pagination } from '../../components/tables/Pagination';
import { useCurrentAdmin } from '../../hooks/useAuth';
import { useDebounce } from '../../hooks/useDebounce';
import { useQuery } from '../../hooks/useQuery';
import { useToast } from '../../hooks/useToast';
import { useWards } from '../../hooks/useWards';
import { adminService, type AdminOption } from '../../services/adminService';
import { errorMessage } from '../../services/apiError';
import { donationService } from '../../services/donationService';
import type { DonationQuery, DonationTransaction, TransactionStatus } from '../../types';
import { downloadCsv, downloadXlsx, type Cell } from '../../utils/download';
import { formatCurrency, formatDateTime } from '../../utils/format';
import { isSuperAdmin } from '../../utils/permissions';

const HEADERS = ['Transaction ID', 'Voter ID', 'Voter Name', 'Ward', 'Booth', 'Amount (INR)', 'Receiver Name', 'Receiver Mobile', 'Timestamp', 'Recorded By', 'Status'];

export function DonationHistoryPage() {
  const admin = useCurrentAdmin();
  const superAdmin = isSuperAdmin(admin);
  const toast = useToast();
  const { wards, boothsForWard, wardLabel, boothLabel } = useWards();

  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [wardId, setWardId] = useState('');
  const [boothId, setBoothId] = useState('');
  const [adminId, setAdminId] = useState('');
  const [status, setStatus] = useState<TransactionStatus | ''>('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [txId, setTxId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [admins, setAdmins] = useState<AdminOption[]>([]);
  const debouncedSearch = useDebounce(search.trim(), 300);

  useEffect(() => {
    if (!superAdmin) return;
    adminService
      .options()
      .then(setAdmins)
      .catch(() => setAdmins([]));
  }, [superAdmin]);

  const [sort, setSort] = useState<SortState>({ sortBy: 'timestamp', sortDir: 'desc' });
  const query: DonationQuery = {
    search: debouncedSearch,
    from,
    to,
    wardId,
    boothId,
    adminId: superAdmin ? adminId : '',
    status,
    sortBy: sort.sortBy as DonationQuery['sortBy'],
    sortDir: sort.sortDir,
    page,
    pageSize,
  };
  const { data, loading, error, reload } = useQuery(() => donationService.list(query), JSON.stringify(query) + refreshKey);

  const update =
    <T,>(setter: (v: T) => void) =>
    (v: T) => {
      setter(v);
      setPage(1);
    };

  const columns = useMemo<Column<DonationTransaction>[]>(
    () => [
      { key: 'id', header: 'Transaction ID', sortKey: 'id', render: (t) => <span className="mono nowrap">{t.id}</span> },
      { key: 'voterId', header: 'Voter ID', render: (t) => <span className="mono">{t.voterId}</span> },
      { key: 'voterName', header: 'Voter Name', sortKey: 'voterName', render: (t) => t.voterName },
      { key: 'ward', header: 'Ward', render: (t) => wardLabel(t.wardId) },
      { key: 'booth', header: 'Booth', render: (t) => boothLabel(t.boothId) },
      { key: 'amount', header: 'Amount', sortKey: 'amount', align: 'right', render: (t) => <span className="mono">{formatCurrency(t.amount)}</span> },
      { key: 'receiver', header: 'Receiver Name', sortKey: 'receiverName', render: (t) => t.receiverName },
      { key: 'receiverMobile', header: 'Receiver Mobile', render: (t) => <span className="mono">{t.receiverMobile}</span> },
      { key: 'timestamp', header: 'Timestamp', sortKey: 'timestamp', render: (t) => <span className="nowrap">{formatDateTime(t.timestamp)}</span> },
      { key: 'admin', header: 'Recorded By', render: (t) => <span title={t.adminName}>{t.adminId}</span> },
      { key: 'status', header: 'Status', render: (t) => <TransactionStatusBadge status={t.status} /> },
      {
        key: 'actions',
        header: 'Actions',
        hideLabelOnMobile: true,
        render: (t) => (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setTxId(t.id)} aria-label={`View transaction ${t.id}`}>
            <Eye size={15} aria-hidden="true" /> View
          </button>
        ),
      },
    ],
    [wardLabel, boothLabel],
  );

  const toRow = (t: DonationTransaction): Cell[] => [
    t.id,
    t.voterId,
    t.voterName,
    wardLabel(t.wardId),
    boothLabel(t.boothId),
    t.amount,
    t.receiverName,
    t.receiverMobile,
    formatDateTime(t.timestamp),
    `${t.adminId} (${t.adminName})`,
    t.status,
  ];

  const exportAs = async (format: 'csv' | 'xlsx') => {
    setExporting(true);
    try {
      const rows = (await donationService.exportAll({ ...query, page: undefined, pageSize: undefined })).map(toRow);
      if (format === 'csv') downloadCsv('donation-history.csv', HEADERS, rows);
      else downloadXlsx('donation-history.xlsx', [{ name: 'Donations', headers: HEADERS, rows }]);
      toast.success(`Exported ${rows.length} transactions.`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Donation History"
        description="Every donation transaction, including cancelled and reversed ones."
        actions={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => exportAs('csv')} disabled={exporting}>
              <Download size={16} aria-hidden="true" /> CSV
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => exportAs('xlsx')} disabled={exporting}>
              <FileSpreadsheet size={16} aria-hidden="true" /> Excel
            </button>
          </>
        }
      />

      <div className="card">
        <div className="card-body">
          <div className="filters">
            <div className="filter-search">
              <SearchInput value={search} onChange={update(setSearch)} placeholder="Transaction ID, voter name, voter ID or receiver mobile" />
            </div>
            <label className="field">
              <span className="field-label">From</span>
              <input type="date" className="input" value={from} max={to || undefined} onChange={(e) => update(setFrom)(e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">To</span>
              <input type="date" className="input" value={to} min={from || undefined} onChange={(e) => update(setTo)(e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Ward</span>
              <select
                className="select"
                value={wardId}
                onChange={(e) => {
                  setWardId(e.target.value);
                  setBoothId('');
                  setPage(1);
                }}
              >
                <option value="">All wards</option>
                {wards.map((w) => (
                  <option key={w.id} value={w.id}>
                    Ward {w.number}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Booth</span>
              <select className="select" value={boothId} disabled={!wardId} onChange={(e) => update(setBoothId)(e.target.value)}>
                <option value="">{wardId ? 'All booths' : 'Select a ward first'}</option>
                {(wardId ? boothsForWard(wardId) : []).map((b) => (
                  <option key={b.id} value={b.id}>
                    Booth {b.number}
                  </option>
                ))}
              </select>
            </label>
            {superAdmin && (
              <label className="field">
                <span className="field-label">Recorded by</span>
                <select className="select" value={adminId} onChange={(e) => update(setAdminId)(e.target.value)}>
                  <option value="">All admins</option>
                  {admins.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.id} – {a.fullName}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="field">
              <span className="field-label">Status</span>
              <select className="select" value={status} onChange={(e) => update(setStatus)(e.target.value as TransactionStatus | '')}>
                <option value="">All</option>
                <option value="Success">Success</option>
                <option value="Cancelled">Cancelled</option>
                <option value="Reversed">Reversed</option>
              </select>
            </label>
          </div>
        </div>
        <DataTable
          caption="Donation transactions"
          columns={columns}
          rows={data?.items}
          rowKey={(t) => t.id}
          loading={loading}
          error={error}
          onRetry={reload}
          sort={sort}
          onSortChange={(s) => {
            setSort(s);
            setPage(1);
          }}
          emptyTitle="No transactions found"
        />
        {data && data.total > 0 && (
          <Pagination
            page={data.page}
            pageSize={data.pageSize}
            total={data.total}
            onPageChange={setPage}
            onPageSizeChange={(n) => {
              setPageSize(n);
              setPage(1);
            }}
          />
        )}
      </div>

      {txId && <TransactionDetailModal transactionId={txId} onClose={() => setTxId(null)} onChanged={() => setRefreshKey((k) => k + 1)} />}
    </>
  );
}
