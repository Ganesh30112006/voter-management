import { Download, Eye, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useCurrentAdmin } from '../../hooks/useAuth';
import { useDebounce } from '../../hooks/useDebounce';
import { useQuery } from '../../hooks/useQuery';
import { useToast } from '../../hooks/useToast';
import { useWards } from '../../hooks/useWards';
import { errorMessage } from '../../services/apiError';
import { voterService } from '../../services/voterService';
import { VOTER_STATUSES, type PaymentStatus, type Voter, type VoterListItem, type VoterQuery, type VoterStatus } from '../../types';
import { downloadXlsx } from '../../utils/download';
import { formatDateTime } from '../../utils/format';
import { boothsInArea, isSuperAdmin, wardsInArea } from '../../utils/permissions';
import { PaymentStatusBadge, VoterStatusBadge } from '../common/Badges';
import { SearchInput } from '../common/SearchInput';
import { PaymentAction } from '../payments/PaymentAction';
import { RecordPaymentModal } from '../payments/RecordPaymentModal';
import { TransactionDetailModal } from '../payments/TransactionDetailModal';
import { DataTable, type Column, type SortState } from '../tables/DataTable';
import { Pagination } from '../tables/Pagination';
import { VoterDetailModal } from './VoterDetailModal';
import { VoterFormModal, type VoterFormState } from './VoterFormModal';

interface Props {
  initialWardId?: string;
  initialBoothId?: string;
  initialPaymentStatus?: PaymentStatus | '';
  /** Shows the "Add voter" and export actions (Super Admin, and Corporators in their wards). */
  manage?: boolean;
  /** Called after voters were added, removed or changed (e.g. to refresh counts). */
  onDataChanged?: () => void;
}

function householdTemplate(v: Voter): VoterFormState {
  return {
    mode: 'create',
    initial: { wardId: v.wardId, boothId: v.boothId, houseNumber: v.houseNumber, householdId: v.householdId, address: v.address },
  };
}

export function VoterWorkspace({ initialWardId = '', initialBoothId = '', initialPaymentStatus = '', manage = false, onDataChanged }: Props) {
  const admin = useCurrentAdmin();
  const toast = useToast();
  const { wards, booths, wardLabel, boothLabel } = useWards();
  const superAdmin = isSuperAdmin(admin);

  const [search, setSearch] = useState('');
  const [wardId, setWardId] = useState(initialWardId);
  const [boothId, setBoothId] = useState(initialBoothId);
  const [status, setStatus] = useState<VoterStatus | ''>('');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus | ''>(initialPaymentStatus);
  // Voter ID order by default (the EPIC number printed on the roll).
  // Roll order: ward, then the serial number printed in each voter box.
  const [sort, setSort] = useState<SortState>({ sortBy: 'serialNumber', sortDir: 'asc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const debouncedSearch = useDebounce(search.trim(), 300);

  const [detailId, setDetailId] = useState<string | null>(null);
  const [payFor, setPayFor] = useState<VoterListItem | null>(null);
  const [txId, setTxId] = useState<string | null>(null);
  const [form, setForm] = useState<VoterFormState | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [exporting, setExporting] = useState(false);

  const query: VoterQuery = {
    search: debouncedSearch,
    wardId,
    boothId,
    status,
    paymentStatus,
    sortBy: sort.sortBy as VoterQuery['sortBy'],
    sortDir: sort.sortDir,
    page,
    pageSize,
  };
  const queryKey = JSON.stringify(query) + refreshKey;
  const { data, loading, error, reload } = useQuery(() => voterService.list(query), queryKey);

  // Corporators and BLOs only see their own area, so the filters only offer it.
  const wardOptions = wardsInArea(admin, wards);
  const boothOptions = wardId ? boothsInArea(admin, wardId, booths) : [];

  const resetPage = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setPage(1);
  };

  const refreshAll = () => {
    setRefreshKey((k) => k + 1);
    onDataChanged?.();
  };

  const columns = useMemo<Column<VoterListItem>[]>(
    () => [
      { key: 'serial', header: 'Serial No.', sortKey: 'serialNumber', render: (v) => v.serialNumber ?? <span className="muted">—</span> },
      { key: 'voterId', header: 'Voter ID', sortKey: 'voterId', render: (v) => <span className="mono">{v.voterId}</span> },
      {
        key: 'name',
        header: 'Name',
        sortKey: 'fullName',
        render: (v) => (
          <button type="button" className="link-button" onClick={() => setDetailId(v.recordId)}>
            {v.fullName}
          </button>
        ),
      },
      {
        key: 'ageGender',
        header: 'Age / Gender',
        render: (v) => [v.age ?? '', v.gender].filter((x) => x !== '').join(' · ') || <span className="muted">—</span>,
      },
      { key: 'ward', header: 'Ward', sortKey: 'ward', render: (v) => wardLabel(v.wardId) },
      { key: 'booth', header: 'Booth', sortKey: 'booth', render: (v) => boothLabel(v.boothId) },
      { key: 'house', header: 'House / Door No.', sortKey: 'houseNumber', render: (v) => v.houseNumber },
      { key: 'status', header: 'Voter Status', sortKey: 'status', render: (v) => <VoterStatusBadge status={v.status} /> },
      {
        key: 'payment',
        header: 'Payment Status',
        render: (v) =>
          v.latestPayment ? (
            <span title={`${v.latestPayment.receiverName} · ${formatDateTime(v.latestPayment.timestamp)}`}>
              <PaymentStatusBadge status="Received" />
            </span>
          ) : (
            <PaymentStatusBadge status="Not Received" />
          ),
      },
      {
        key: 'actions',
        header: 'Actions',
        hideLabelOnMobile: true,
        render: (v) => (
          <div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
            <PaymentAction voter={v} onPay={setPayFor} onViewReceipt={setTxId} onChanged={refreshAll} />
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDetailId(v.recordId)} aria-label={`View details for ${v.fullName}`} title="View details">
              <Eye size={16} aria-hidden="true" />
            </button>
          </div>
        ),
      },
    ],
    [wardLabel, boothLabel],
  );

  const exportExcel = async () => {
    setExporting(true);
    try {
      const rows = await voterService.exportAll({ ...query, page: undefined, pageSize: undefined });
      downloadXlsx('voters.xlsx', [
        {
          name: 'Voters',
          headers: ['Serial No.', 'Voter ID', 'Full Name', 'Age', 'Gender', 'Ward', 'Booth', 'House / Door Number', 'Household ID', 'Address', 'Voter Status', 'Payment Status', 'Receiver', 'Receiver Mobile', 'Received At'],
          rows: rows.map((v) => [
            v.serialNumber ?? '',
            v.voterId,
            v.fullName,
            v.age ?? '',
            v.gender,
            wardLabel(v.wardId),
            boothLabel(v.boothId),
            v.houseNumber,
            v.householdId,
            v.address,
            v.status,
            v.paymentStatus,
            v.latestPayment?.receiverName ?? '',
            v.latestPayment?.receiverMobile ?? '',
            v.latestPayment ? formatDateTime(v.latestPayment.timestamp) : '',
          ]),
        },
      ]);
      toast.success(`Exported ${rows.length} voters.`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <div className="card">
        <div className="card-body">
          <div className="filters">
            <div className="filter-search">
              <SearchInput value={search} onChange={resetPage(setSearch)} placeholder="Name, voter ID, door number or household ID" />
            </div>
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
                {wardOptions.map((w) => (
                  <option key={w.id} value={w.id}>
                    Ward {w.number}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Booth</span>
              <select className="select" value={boothId} onChange={(e) => resetPage(setBoothId)(e.target.value)} disabled={!wardId}>
                <option value="">{wardId ? 'All booths' : 'Select a ward first'}</option>
                {boothOptions.map((b) => (
                  <option key={b.id} value={b.id}>
                    Booth {b.number}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Voter status</span>
              <select className="select" value={status} onChange={(e) => resetPage(setStatus)(e.target.value as VoterStatus | '')}>
                <option value="">All statuses</option>
                {VOTER_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Payment</span>
              <select className="select" value={paymentStatus} onChange={(e) => resetPage(setPaymentStatus)(e.target.value as PaymentStatus | '')}>
                <option value="">All</option>
                <option value="Received">Received</option>
                <option value="Not Received">Not Received</option>
              </select>
            </label>
          </div>
          {manage && (
            <div className="row" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary" onClick={exportExcel} disabled={exporting}>
                <Download size={16} aria-hidden="true" /> {exporting ? 'Exporting…' : 'Export Excel'}
              </button>
              <button type="button" className="btn btn-primary" onClick={() => setForm({ mode: 'create' })}>
                <Plus size={16} aria-hidden="true" /> Add voter
              </button>
            </div>
          )}
        </div>

        <DataTable
          caption="Voters"
          columns={columns}
          rows={data?.items}
          rowKey={(v) => v.recordId}
          loading={loading}
          error={error}
          onRetry={reload}
          sort={sort}
          onSortChange={(s) => {
            setSort(s);
            setPage(1);
          }}
          emptyTitle={superAdmin ? 'No voters found' : 'No voters in your area match'}
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

      {detailId && (
        <VoterDetailModal
          recordId={detailId}
          refreshKey={refreshKey}
          onClose={() => setDetailId(null)}
          onPay={setPayFor}
          onViewTransaction={setTxId}
          onChanged={refreshAll}
          onRemoved={refreshAll}
          onEdit={(v) => setForm({ mode: 'edit', recordId: v.recordId, initial: v })}
          onAddHouseholdMember={(v) => {
            setDetailId(null);
            setForm(householdTemplate(v));
          }}
        />
      )}

      {form && (
        <VoterFormModal
          key={`${form.mode}-${form.recordId ?? ''}-${refreshKey}`}
          state={form}
          onClose={() => setForm(null)}
          onSaved={(v, addAnother) => {
            toast.success(form.mode === 'edit' ? `Saved changes to ${v.fullName}.` : `Added ${v.fullName} (${v.voterId}).`);
            refreshAll();
            setForm(addAnother ? householdTemplate(v) : null);
          }}
        />
      )}

      {payFor && (
        <RecordPaymentModal
          voter={payFor}
          onClose={() => setPayFor(null)}
          onRecorded={(tx) => {
            toast.success(`Payment recorded for ${tx.voterName}.`);
            refreshAll();
          }}
        />
      )}

      {txId && <TransactionDetailModal transactionId={txId} onClose={() => setTxId(null)} onChanged={refreshAll} />}
    </>
  );
}
