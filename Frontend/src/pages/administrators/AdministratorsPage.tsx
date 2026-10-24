import { CheckCircle2, Eye, KeyRound, Pencil, Plus, Power } from 'lucide-react';
import { useState } from 'react';
import { AccountStatusBadge } from '../../components/common/Badges';
import { Modal } from '../../components/common/Modal';
import { PageHeader } from '../../components/common/PageHeader';
import { SearchInput } from '../../components/common/SearchInput';
import { DataTable, type Column, type SortState } from '../../components/tables/DataTable';
import { Pagination } from '../../components/tables/Pagination';
import { useCurrentAdmin } from '../../hooks/useAuth';
import { useConfirm } from '../../hooks/useConfirm';
import { useDebounce } from '../../hooks/useDebounce';
import { useQuery } from '../../hooks/useQuery';
import { useToast } from '../../hooks/useToast';
import { useWards } from '../../hooks/useWards';
import { adminService } from '../../services/adminService';
import { errorMessage } from '../../services/apiError';
import type { AccountStatus, Admin, AdminQuery, ManagedRole } from '../../types';
import { formatDate } from '../../utils/format';
import { isSuperAdmin, ROLE_LABELS } from '../../utils/permissions';
import { AdminFormModal } from './AdminFormModal';
import { SetPasswordModal } from './SetPasswordModal';

export function AdministratorsPage() {
  const actor = useCurrentAdmin();
  const superAdmin = isSuperAdmin(actor);
  const toast = useToast();
  const confirm = useConfirm();
  const { wards, wardLabel, boothLabel } = useWards();
  // A Corporator only ever manages its own BLOs.
  const [role, setRole] = useState<ManagedRole>(superAdmin ? 'CORPORATOR' : 'BLO');
  const [corporatorId, setCorporatorId] = useState('');
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

  const query: AdminQuery = { role, corporatorId: role === 'BLO' && superAdmin ? corporatorId : '', search: debounced, wardId, status, sortBy: sort.sortBy as AdminQuery['sortBy'], sortDir: sort.sortDir, page, pageSize };
  const { data, loading, error, reload } = useQuery(() => adminService.list(query), JSON.stringify(query) + refreshKey);
  const refresh = () => setRefreshKey((k) => k + 1);
  const { data: options } = useQuery(() => (superAdmin ? adminService.options() : Promise.resolve([])), `options-${refreshKey}`);
  const corporators = (options ?? []).filter((o) => o.role === 'CORPORATOR');
  const showBooths = role === 'BLO';
  const showWards = role !== 'SUPER_ADMIN';
  const plural = role === 'SUPER_ADMIN' ? 'Super Admins' : role === 'CORPORATOR' ? 'Corporators' : 'BLOs';

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
      { key: 'id', header: `${ROLE_LABELS[role]} ID`, sortKey: 'id', render: (a) => <strong className="mono">{a.id}</strong> },
      { key: 'name', header: 'Full Name', sortKey: 'fullName', render: (a) => a.fullName },
      { key: 'mobile', header: 'Mobile', render: (a) => <span className="mono">{a.mobile}</span> },
      ...(role === 'CORPORATOR' ? [{ key: 'location', header: 'Location', render: (a: Admin) => a.location || <span className="muted">—</span> }] : []),
      ...(showWards ? [{ key: 'wards', header: 'Wards', render: (a: Admin) => a.wardIds.map(wardLabel).join(', ') || '—' }] : []),
      ...(showBooths
        ? [{ key: 'booths', header: 'Booths', render: (a: Admin) => (a.boothIds.length ? a.boothIds.map(boothLabel).join(', ') : <span className="muted">All in ward</span>) }]
        : []),
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
            {/* A Super Admin's password is changed only by that Super Admin (My Profile). */}
            {a.role !== 'SUPER_ADMIN' && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPasswordFor(a)} aria-label={`Change password for ${a.id}`}>
                <KeyRound size={15} aria-hidden="true" />
              </button>
            )}
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
        title={superAdmin ? 'Accounts' : 'My BLOs'}
        description={
          superAdmin
            ? 'Corporators cover wards; each Corporator has BLOs for its wards and booths. Super Admins manage everything. Accounts sign in with their mobile number and the password you set.'
            : 'Booth Level Officers working your wards. They sign in with their mobile number and the password you set.'
        }
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setFormFor('new')}>
            <Plus size={16} aria-hidden="true" /> Create {ROLE_LABELS[role]}
          </button>
        }
      />

      {superAdmin && (
        <div className="tabs" role="tablist" style={{ marginBottom: 16 }}>
          {(['CORPORATOR', 'BLO', 'SUPER_ADMIN'] as const).map((r) => (
            <button
              key={r}
              type="button"
              className="tab"
              role="tab"
              aria-selected={role === r}
              onClick={() => {
                setRole(r);
                if (r === 'SUPER_ADMIN') setWardId('');
                setPage(1);
                setSort({ sortBy: 'id', sortDir: 'asc' });
              }}
            >
              {r === 'SUPER_ADMIN' ? 'Super Admins' : r === 'CORPORATOR' ? 'Corporators' : 'BLOs'}
            </button>
          ))}
        </div>
      )}

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
                placeholder="ID, name or mobile"
              />
            </div>
            {superAdmin && role === 'BLO' && (
              <label className="field">
                <span className="field-label">Corporator</span>
                <select
                  className="select"
                  value={corporatorId}
                  onChange={(e) => {
                    setCorporatorId(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">All Corporators</option>
                  {corporators.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.id} – {c.fullName}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {showWards && (
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
                  {(superAdmin ? wards : wards.filter((w) => actor.wardIds.includes(w.id))).map((w) => (
                    <option key={w.id} value={w.id}>
                      Ward {w.number}
                    </option>
                  ))}
                </select>
              </label>
            )}
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
          caption={superAdmin ? plural : 'My BLOs'}
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
          emptyTitle={`No ${plural} found`}
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
          role={role}
          defaultCorporatorId={corporatorId}
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
          title={`${ROLE_LABELS[created.role]} created`}
          size="sm"
          onClose={() => setCreated(null)}
          footer={
            <button type="button" className="btn btn-primary" onClick={() => setCreated(null)} autoFocus>
              Done
            </button>
          }
        >
          <div className="payment-success" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 6 }}>
            <CheckCircle2 size={44} style={{ color: 'var(--color-success)' }} aria-hidden="true" />
            <p className="muted small">Generated {ROLE_LABELS[created.role]} ID</p>
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
              {detail.role !== 'SUPER_ADMIN' && (
                <button type="button" className="btn btn-secondary" onClick={() => setPasswordFor(detail)}>
                  <KeyRound size={16} aria-hidden="true" /> Change password
                </button>
              )}
              <button type="button" className="btn btn-primary" onClick={() => setFormFor(detail)}>
                <Pencil size={16} aria-hidden="true" /> Edit
              </button>
            </>
          }
        >
          <dl className="detail-grid">
            <div>
              <dt>{ROLE_LABELS[detail.role]} ID</dt>
              <dd>{detail.id}</dd>
            </div>
            {detail.corporatorId && (
              <div>
                <dt>Corporator</dt>
                <dd>{detail.corporatorId}</dd>
              </div>
            )}
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
            {detail.role === 'CORPORATOR' && (
              <div>
                <dt>Location</dt>
                <dd>{detail.location || '—'}</dd>
              </div>
            )}
            {detail.role !== 'SUPER_ADMIN' && (
              <div>
                <dt>Wards</dt>
                <dd>{detail.wardIds.map(wardLabel).join(', ') || '—'}</dd>
              </div>
            )}
            {detail.role === 'BLO' && (
              <div>
                <dt>Booths</dt>
                <dd>{detail.boothIds.length ? detail.boothIds.map(boothLabel).join(', ') : 'All booths in assigned wards'}</dd>
              </div>
            )}
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
