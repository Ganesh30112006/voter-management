import { useEffect, useState } from 'react';
import { PageHeader } from '../../components/common/PageHeader';
import { SearchInput } from '../../components/common/SearchInput';
import { DataTable, type Column } from '../../components/tables/DataTable';
import { Pagination } from '../../components/tables/Pagination';
import { useDebounce } from '../../hooks/useDebounce';
import { useQuery } from '../../hooks/useQuery';
import { adminService, type AdminOption } from '../../services/adminService';
import { auditService } from '../../services/auditService';
import type { AuditLog, AuditQuery } from '../../types';
import { formatDateTime } from '../../utils/format';

const ENTITIES: AuditLog['entity'][] = ['Admin', 'Ward', 'Booth', 'Voter', 'Import', 'Payment', 'Settings', 'Export', 'Auth'];

const COLUMNS: Column<AuditLog>[] = [
  { key: 'ts', header: 'Timestamp', render: (a) => <span className="nowrap">{formatDateTime(a.timestamp)}</span> },
  { key: 'admin', header: 'Admin ID', render: (a) => <span className="mono">{a.adminId}</span> },
  { key: 'name', header: 'Admin Name', render: (a) => a.adminName },
  { key: 'action', header: 'Action', render: (a) => <strong>{a.action}</strong> },
  // Cash payments have no number people use; the summary names the voter instead.
  { key: 'record', header: 'Affected Record', render: (a) => (a.entity === 'Payment' ? <span className="muted">Payment</span> : <span className="mono">{a.recordRef}</span>) },
  { key: 'result', header: 'Result', render: (a) => <span className={`badge ${a.result === 'Success' ? 'badge-success' : 'badge-danger'}`}>{a.result}</span> },
  { key: 'summary', header: 'Change Summary', render: (a) => <span className="small">{a.summary}</span> },
];

/** Read-only view of the backend audit trail. */
export function AuditLogsPage() {
  const [search, setSearch] = useState('');
  const [entity, setEntity] = useState<AuditLog['entity'] | ''>('');
  const [adminId, setAdminId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [admins, setAdmins] = useState<AdminOption[]>([]);
  const debounced = useDebounce(search.trim(), 300);

  useEffect(() => {
    adminService
      .options()
      .then(setAdmins)
      .catch(() => setAdmins([]));
  }, []);

  const query: AuditQuery = { search: debounced, entity, adminId, from, to, page, pageSize };
  const { data, loading, error, reload } = useQuery(() => auditService.list(query), JSON.stringify(query));

  const update =
    <T,>(setter: (v: T) => void) =>
    (v: T) => {
      setter(v);
      setPage(1);
    };

  return (
    <>
      <PageHeader title="Audit Logs" description="A read-only record of every change made in the system." />
      <div className="card">
        <div className="card-body">
          <div className="filters">
            <div className="filter-search">
              <SearchInput value={search} onChange={update(setSearch)} placeholder="Action, record, summary or admin" />
            </div>
            <label className="field">
              <span className="field-label">Type</span>
              <select className="select" value={entity} onChange={(e) => update(setEntity)(e.target.value as AuditLog['entity'] | '')}>
                <option value="">All types</option>
                {ENTITIES.map((en) => (
                  <option key={en} value={en}>
                    {en}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Admin</span>
              <select className="select" value={adminId} onChange={(e) => update(setAdminId)(e.target.value)}>
                <option value="">All admins</option>
                {admins.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.id} – {a.fullName}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">From</span>
              <input type="date" className="input" value={from} max={to || undefined} onChange={(e) => update(setFrom)(e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">To</span>
              <input type="date" className="input" value={to} min={from || undefined} onChange={(e) => update(setTo)(e.target.value)} />
            </label>
          </div>
        </div>
        <DataTable caption="Audit logs" columns={COLUMNS} rows={data?.items} rowKey={(a) => a.id} loading={loading} error={error} onRetry={reload} emptyTitle="No audit entries found" />
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
    </>
  );
}
