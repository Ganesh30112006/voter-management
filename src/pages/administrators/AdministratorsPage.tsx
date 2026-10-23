import { CheckCircle2, Eye, KeyRound, Pencil, Plus, Power } from 'lucide-react';
import { useState } from 'react';
import { AccountStatusBadge } from '../../components/common/Badges';
import { Modal } from '../../components/common/Modal';
import { PageHeader } from '../../components/common/PageHeader';
import { SearchInput } from '../../components/common/SearchInput';
import { DataTable, type Column, type SortState } from '../../components/tables/DataTable';
import { Pagination } from '../../components/tables/Pagination';
import { useConfirm } from '../../hooks/useConfirm';
import { useDebounce } from '../../hooks/useDebounce';
import { useQuery } from '../../hooks/useQuery';
import { useToast } from '../../hooks/useToast';
import { useWards } from '../../hooks/useWards';
import { adminService } from '../../services/adminService';
import { errorMessage } from '../../services/apiError';
import type { AccountStatus, Admin, AdminQuery } from '../../types';
import { formatDate } from '../../utils/format';
import { AdminFormModal } from './AdminFormModal';
import { SetPasswordModal } from './SetPasswordModal';

export function AdministratorsPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const { wards, wardLabel, boothLabel } = useWards();
  const [search, setSearch] = useState('');
  const [wardId, setWardId] = useState('');
  const [status, setStatus] = useState<AccountStatus | ''>('');
  const [sort, setSort] = useState<SortState>({ sortBy: 'id', sortDir: 'asc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [refreshKey, setRefreshKey] = useState(0);
  const debounced = useDebounce(search.trim(), 300);

  const [formFor, setFormFor] = useState<Admin | 'new' | null>(null);
  const [detail, setDetail] = useState<Admin | null>(null);
  const [passwordFor, setPasswordFor] = useState<Admin | null>(null);
  const [created, setCreated] = useState<Admin | null>(null);

  const query: AdminQuery = { search: debounced, wardId, status, sortBy: sort.sortBy as AdminQuery['sortBy'], sortDir: sort.sortDir, page, pageSize };
  const { data, loading, error, reload } = useQuery(() => adminService.list(query), JSON.stringify(query) + refreshKey);
  const refresh = () => setRefreshKey((k) => k + 1);

  const toggleStatus = async (a: Admin) => {
    const next: AccountStatus = a.status === 'Active' ? 'Inactive' : 'Active';
    const ok = await confirm({
      title: next === 'Inactive' ? `Deactivate ${a.id}?` : `Activate ${a.id}?`,
      message:
        next === 'Inactive'
          ? `${a.fullName} will be signed out and will not be able to sign in until reactivated.`
          : `${a.fullName} will be able to sign in again.`,
      confirmLabel: next === 'Inactive' ? 'Deactivate' : 'Activate',
      tone: next === 'Inactive' ? 'danger' : 'primary',
    });
    if (!ok) return;
    try {
      const updated = await adminService.setStatus(a.id, next);
      toast.success(`${updated.id} is now ${updated.status}.`);
      if (detail?.id === a.id) setDetail(updated);
      refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const columns: Column<Admin>[] = [
      { key: 'id', header: 'Admin ID', sortKey: 'id', render: (a) => <strong className="mono">{a.id}</strong> },
      { key: 'name', header: 'Full Name', sortKey: 'fullName', render: (a) => a.fullName },
      { key: 'mobile', header: 'Mobile', render: (a) => <span className="mono">{a.mobile}</span> },
      { key: 'wards', header: 'Wards', render: (a) => a.wardIds.map(wardLabel).join(', ') || '—' },
      { key: 'booths', header: 'Booths', render: (a) => (a.boothIds.length ? a.boothIds.map(boothLabel).join(', ') : <span className="muted">All in ward</span>) },
      { key: 'status', header: 'Status', sortKey: 'status', render: (a) => <AccountStatusBadge status={a.status} /> },
      { key: 'created', header: 'Created', sortKey: 'createdAt', render: (a) => <span className="nowrap">{formatDate(a.createdAt)}</span> },
      {
        key: 'actions',
        header: 'Actions',
        hideLabelOnMobile: true,
        render: (a) => (
          <div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDetail(a)} aria-label={`View ${a.id}`}>
              <Eye size={15} aria-hidden="true" />
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFormFor(a)} aria-label={`Edit ${a.id}`}>
              <Pencil size={15} aria-hidden="true" />
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPasswordFor(a)} aria-label={`Change password for ${a.id}`}>
              <KeyRound size={15} aria-hidden="true" />
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => toggleStatus(a)} aria-label={a.status === 'Active' ? `Deactivate ${a.id}` : `Activate ${a.id}`}>
              <Power size={15} aria-hidden="true" style={{ color: a.status === 'Active' ? 'var(--color-danger)' : 'var(--color-success)' }} />
            </button>
          </div>
        ),
      },
  ];

  return (
    <>
      <PageHeader
        title="Administrators"
        description="BL Admin accounts. Admins sign in with their mobile number and the password you set."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setFormFor('new')}>
            <Plus size={16} aria-hidden="true" /> Create admin
          </button>
        }
      />

      <div className="card">
        <div className="card-body">
          <div className="filters">
            <div className="filter-search">
              <SearchInput
                value={search}
                onChange={(v) => {
                  setSearch(v);
                  setPage(1);
                }}
                placeholder="Admin ID, name or mobile"
              />
            </div>
            <label className="field">
              <span className="field-label">Ward</span>
              <select
                className="select"
                value={wardId}
                onChange={(e) => {
                  setWardId(e.target.value);
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
              <span className="field-label">Status</span>
              <select
                className="select"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value as AccountStatus | '');
                  setPage(1);
                }}
              >
                <option value="">All</option>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </label>
          </div>
        </div>
        <DataTable
          caption="Administrators"
          columns={columns}
          rows={data?.items}
          rowKey={(a) => a.id}
          loading={loading}
          error={error}
          onRetry={reload}
          sort={sort}
          onSortChange={(s) => {
            setSort(s);
            setPage(1);
          }}
          emptyTitle="No administrators found"
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

      {formFor && (
        <AdminFormModal
          admin={formFor === 'new' ? undefined : formFor}
          onClose={() => setFormFor(null)}
          onSaved={(a, isNew) => {
            setFormFor(null);
            refresh();
            if (detail?.id === a.id) setDetail(a);
            if (isNew) setCreated(a);
            else toast.success(`Saved changes to ${a.id}.`);
          }}
        />
      )}

      {passwordFor && (
        <SetPasswordModal
          admin={passwordFor}
          onClose={() => setPasswordFor(null)}
          onDone={() => {
            toast.success(`Password changed for ${passwordFor.id}.`);
            setPasswordFor(null);
          }}
        />
      )}

      {created && (
        <Modal
          title="Administrator created"
          size="sm"
          onClose={() => setCreated(null)}
          footer={
            <button type="button" className="btn btn-primary" onClick={() => setCreated(null)} autoFocus>
              Done
            </button>
          }
        >
          <div className="donation-success" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 6 }}>
            <CheckCircle2 size={44} style={{ color: 'var(--color-success)' }} aria-hidden="true" />
            <p className="muted small">Generated Admin ID</p>
            <p style={{ fontSize: '1.75rem', fontWeight: 700 }}>{created.id}</p>
            <p className="small">
              {created.fullName} can now sign in with mobile <strong>{created.mobile}</strong> and the password you set.
            </p>
          </div>
        </Modal>
      )}

      {detail && (
        <Modal
          title={`${detail.id} · ${detail.fullName}`}
          onClose={() => setDetail(null)}
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => toggleStatus(detail)}>
                <Power size={16} aria-hidden="true" /> {detail.status === 'Active' ? 'Deactivate' : 'Activate'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setPasswordFor(detail)}>
                <KeyRound size={16} aria-hidden="true" /> Change password
              </button>
              <button type="button" className="btn btn-primary" onClick={() => setFormFor(detail)}>
                <Pencil size={16} aria-hidden="true" /> Edit
              </button>
            </>
          }
        >
          <dl className="detail-grid">
            <div>
              <dt>Admin ID</dt>
              <dd>{detail.id}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>
                <AccountStatusBadge status={detail.status} />
              </dd>
            </div>
            <div>
              <dt>Full name</dt>
              <dd>{detail.fullName}</dd>
            </div>
            <div>
              <dt>Mobile (login)</dt>
              <dd>{detail.mobile}</dd>
            </div>
            <div>
              <dt>Wards</dt>
              <dd>{detail.wardIds.map(wardLabel).join(', ') || '—'}</dd>
            </div>
            <div>
              <dt>Booths</dt>
              <dd>{detail.boothIds.length ? detail.boothIds.map(boothLabel).join(', ') : 'All booths in assigned wards'}</dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd>{formatDate(detail.createdAt)}</dd>
            </div>
          </dl>
        </Modal>
      )}
    </>
  );
}
