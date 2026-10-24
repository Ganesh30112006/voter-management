import { ChevronDown, ChevronRight, Pencil, Plus, UserCog, Users } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/common/PageHeader';
import { SearchInput } from '../../components/common/SearchInput';
import { EmptyState, ErrorState, SkeletonLines } from '../../components/common/States';
import { useQuery } from '../../hooks/useQuery';
import { useToast } from '../../hooks/useToast';
import { useCurrentAdmin } from '../../hooks/useAuth';
import { useWards } from '../../hooks/useWards';
import { wardService } from '../../services/wardService';
import type { Booth, Ward, WardSummary } from '../../types';
import { formatNumber } from '../../utils/format';
import { isSuperAdmin } from '../../utils/permissions';
import { AssignAdminsModal, BoothFormModal, WardFormModal } from './WardModals';
import './WardsPage.css';

type Dialog =
  | { kind: 'ward'; ward?: Ward }
  | { kind: 'booth'; booth?: Booth; wardId?: string }
  | { kind: 'assignWard'; ward: WardSummary }
  | { kind: 'assignBooth'; booth: WardSummary['booths'][number]; wardNumber: number };

export function WardsPage() {
  const toast = useToast();
  // Corporators manage booths and their BLOs in their own wards; wards and their Corporators are the Super Admin's.
  const superAdmin = isSuperAdmin(useCurrentAdmin());
  const { reload: reloadReference } = useWards();
  const [refreshKey, setRefreshKey] = useState(0);
  const { data, loading, error, reload } = useQuery(() => wardService.summaries(), String(refreshKey));
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<Dialog | null>(null);

  const afterChange = (message: string) => {
    toast.success(message);
    setDialog(null);
    setRefreshKey((k) => k + 1);
    reloadReference().catch(() => undefined);
  };

  const term = search.trim().toLowerCase();
  const visible = (data ?? []).filter(
    (w) =>
      !term ||
      String(w.number) === term ||
      w.name.toLowerCase().includes(term) ||
      w.booths.some((b) => String(b.number) === term || b.name.toLowerCase().includes(term)),
  );

  const toggle = (id: string) =>
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <>
      <PageHeader
        title="Wards & Booths"
        description={
          superAdmin
            ? 'Ward → Booth → Voters. Expand a ward to see its booths and assign its Corporator and BLOs.'
            : 'Your wards. Add booths and put your BLOs on them.'
        }
        actions={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setDialog({ kind: 'booth' })} disabled={!data?.length}>
              <Plus size={16} aria-hidden="true" /> Add booth
            </button>
            {superAdmin && (
              <button type="button" className="btn btn-primary" onClick={() => setDialog({ kind: 'ward' })}>
                <Plus size={16} aria-hidden="true" /> Add ward
              </button>
            )}
          </>
        }
      />

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body">
          <SearchInput value={search} onChange={setSearch} placeholder="Ward or booth number or name" />
        </div>
      </div>

      {error && !data ? (
        <div className="card">
          <ErrorState message={error} onRetry={reload} />
        </div>
      ) : loading && !data ? (
        <div className="card">
          <SkeletonLines rows={5} height={56} />
        </div>
      ) : !visible.length ? (
        <div className="card">
          <EmptyState title={data?.length ? 'No wards match your search' : 'No wards yet'} message={data?.length ? undefined : 'Add the first ward to get started.'} />
        </div>
      ) : (
        <div className="ward-list">
          {visible.map((w) => {
            const open = expanded.has(w.id) || (!!term && w.booths.some((b) => String(b.number) === term || b.name.toLowerCase().includes(term)));
            return (
              <section key={w.id} className="card ward-card">
                <div className="ward-head">
                  <button type="button" className="ward-toggle" onClick={() => toggle(w.id)} aria-expanded={open}>
                    {open ? <ChevronDown size={18} aria-hidden="true" /> : <ChevronRight size={18} aria-hidden="true" />}
                    <span>
                      <strong>Ward {w.number}</strong> <span className="muted">– {w.name}</span>
                    </span>
                  </button>
                  <div className="ward-stats small">
                    <span>{formatNumber(w.booths.length)} booths</span>
                    <span>{formatNumber(w.voterCount)} voters</span>
                    <span>{w.adminIds.length ? w.adminIds.join(', ') : 'No Corporator'}</span>
                  </div>
                  <div className="row ward-actions">
                    <Link to={`/voters?ward=${encodeURIComponent(w.id)}`} className="btn btn-ghost btn-sm">
                      <Users size={15} aria-hidden="true" /> Voters
                    </Link>
                    {superAdmin && (
                      <>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDialog({ kind: 'assignWard', ward: w })}>
                          <UserCog size={15} aria-hidden="true" /> Corporator
                        </button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDialog({ kind: 'ward', ward: w })} aria-label={`Edit ward ${w.number}`}>
                          <Pencil size={15} aria-hidden="true" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {open && (
                  <div className="booth-list">
                    {w.booths.length === 0 ? (
                      <p className="small muted" style={{ padding: '12px 16px' }}>
                        No booths in this ward yet.
                      </p>
                    ) : (
                      w.booths.map((b) => (
                        <div key={b.id} className="booth-row">
                          <div>
                            <strong>Booth {b.number}</strong> <span className="muted small">– {b.name}</span>
                          </div>
                          <div className="ward-stats small">
                            <span>{formatNumber(b.voterCount)} voters</span>
                            <span>{b.adminIds.length ? `Booth admins: ${b.adminIds.join(', ')}` : 'Covered by ward admins'}</span>
                          </div>
                          <div className="row ward-actions">
                            <Link to={`/voters?ward=${encodeURIComponent(w.id)}&booth=${encodeURIComponent(b.id)}`} className="btn btn-ghost btn-sm">
                              <Users size={15} aria-hidden="true" /> Voters
                            </Link>
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDialog({ kind: 'assignBooth', booth: b, wardNumber: w.number })}>
                              <UserCog size={15} aria-hidden="true" /> Admins
                            </button>
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDialog({ kind: 'booth', booth: b })} aria-label={`Edit booth ${b.number}`}>
                              <Pencil size={15} aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                    <div className="booth-add">
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDialog({ kind: 'booth', wardId: w.id })}>
                        <Plus size={15} aria-hidden="true" /> Add booth to Ward {w.number}
                      </button>
                    </div>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {dialog?.kind === 'ward' && (
        <WardFormModal ward={dialog.ward} onClose={() => setDialog(null)} onSaved={(w) => afterChange(`Ward ${w.number} saved.`)} />
      )}
      {dialog?.kind === 'booth' && (
        <BoothFormModal
          booth={dialog.booth}
          wards={data ?? []}
          defaultWardId={dialog.wardId}
          onClose={() => setDialog(null)}
          onSaved={(b) => {
            setExpanded((s) => new Set(s).add(b.wardId));
            afterChange(`Booth ${b.number} saved.`);
          }}
        />
      )}
      {dialog?.kind === 'assignWard' && (
        <AssignAdminsModal
          target={{ kind: 'ward', id: dialog.ward.id }}
          title={`Corporator for Ward ${dialog.ward.number}`}
          description="A ward has one Corporator, who has full control over its voters, booths and BLOs. Changing the Corporator moves the ward: the previous Corporator and their BLOs lose it."
          assigned={dialog.ward.adminIds}
          onClose={() => setDialog(null)}
          onSaved={() => afterChange(`Ward ${dialog.ward.number} assignment saved.`)}
        />
      )}
      {dialog?.kind === 'assignBooth' && (
        <AssignAdminsModal
          target={{ kind: 'booth', id: dialog.booth.id, wardId: dialog.booth.wardId }}
          title={`BLOs for Booth ${dialog.booth.number}`}
          description={`Selected BLOs see and pay the voters of this booth in Ward ${dialog.wardNumber}. Only BLOs whose Corporator covers this ward are listed.`}
          assigned={dialog.booth.adminIds}
          onClose={() => setDialog(null)}
          onSaved={() => afterChange(`Booth ${dialog.booth.number} assignment saved.`)}
        />
      )}
    </>
  );
}
