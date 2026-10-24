import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { FormField } from '../../components/common/FormField';
import { Modal } from '../../components/common/Modal';
import { SkeletonLines } from '../../components/common/States';
import { useCurrentAdmin } from '../../hooks/useAuth';
import { useConfirm } from '../../hooks/useConfirm';
import { adminService } from '../../services/adminService';
import { ApiError, errorMessage } from '../../services/apiError';
import { wardService } from '../../services/wardService';
import type { Admin, Booth, Ward } from '../../types';
import { boothSchema, wardSchema, type BoothFormValues, type WardFormValues } from '../../utils/validation';

function ServerError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="alert alert-error" role="alert">
      <AlertTriangle size={18} aria-hidden="true" />
      {message}
    </div>
  );
}

function SaveFooter({ formId, onClose, busy, label }: { formId: string; onClose: () => void; busy: boolean; label: string }) {
  return (
    <>
      <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
        Cancel
      </button>
      <button type="submit" form={formId} className="btn btn-primary" disabled={busy}>
        {busy && <Loader2 size={16} className="spinner" aria-hidden="true" />}
        {label}
      </button>
    </>
  );
}

export function WardFormModal({ ward, onClose, onSaved }: { ward?: Ward; onClose: () => void; onSaved: (w: Ward) => void }) {
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<WardFormValues>({
    resolver: zodResolver(wardSchema),
    defaultValues: { number: ward ? String(ward.number) : '', name: ward?.name ?? '' },
  });

  const onSubmit = async (values: WardFormValues) => {
    setServerError(null);
    const input = wardSchema.parse(values);
    try {
      onSaved(ward ? await wardService.updateWard(ward.id, input) : await wardService.createWard(input));
    } catch (e) {
      if (e instanceof ApiError && e.fieldErrors) {
        if (e.fieldErrors.number) setError('number', { message: e.fieldErrors.number });
        if (e.fieldErrors.name) setError('name', { message: e.fieldErrors.name });
      }
      setServerError(errorMessage(e));
    }
  };

  return (
    <Modal title={ward ? `Edit Ward ${ward.number}` : 'Add ward'} size="sm" onClose={onClose} locked={isSubmitting} footer={<SaveFooter formId="ward-form" onClose={onClose} busy={isSubmitting} label="Save ward" />}>
      <form id="ward-form" className="stack" noValidate onSubmit={handleSubmit(onSubmit)}>
        <ServerError message={serverError} />
        <FormField label="Ward number" error={errors.number?.message} required>
          <input className="input" type="number" inputMode="numeric" min={1} {...register('number')} />
        </FormField>
        <FormField label="Ward name" error={errors.name?.message} required>
          <input className="input" {...register('name')} />
        </FormField>
      </form>
    </Modal>
  );
}

export function BoothFormModal({
  booth,
  wards,
  defaultWardId,
  onClose,
  onSaved,
}: {
  booth?: Booth;
  wards: Ward[];
  defaultWardId?: string;
  onClose: () => void;
  onSaved: (b: Booth) => void;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<BoothFormValues>({
    resolver: zodResolver(boothSchema),
    defaultValues: { wardId: booth?.wardId ?? defaultWardId ?? '', number: booth ? String(booth.number) : '', name: booth?.name ?? '' },
  });

  const onSubmit = async (values: BoothFormValues) => {
    setServerError(null);
    const input = boothSchema.parse(values);
    try {
      onSaved(booth ? await wardService.updateBooth(booth.id, { number: input.number, name: input.name }) : await wardService.createBooth(input));
    } catch (e) {
      if (e instanceof ApiError && e.fieldErrors) {
        for (const k of ['wardId', 'number', 'name'] as const) if (e.fieldErrors[k]) setError(k, { message: e.fieldErrors[k] });
      }
      setServerError(errorMessage(e));
    }
  };

  return (
    <Modal title={booth ? `Edit Booth ${booth.number}` : 'Add booth'} size="sm" onClose={onClose} locked={isSubmitting} footer={<SaveFooter formId="booth-form" onClose={onClose} busy={isSubmitting} label="Save booth" />}>
      <form id="booth-form" className="stack" noValidate onSubmit={handleSubmit(onSubmit)}>
        <ServerError message={serverError} />
        {booth ? (
          <p className="small muted">
            Ward {wards.find((w) => w.id === booth.wardId)?.number ?? '—'}. A booth stays in its ward so voter records remain consistent.
          </p>
        ) : (
          <FormField label="Ward" error={errors.wardId?.message} required>
            <select className="select" {...register('wardId')}>
              <option value="">Select ward</option>
              {wards.map((w) => (
                <option key={w.id} value={w.id}>
                  Ward {w.number} – {w.name}
                </option>
              ))}
            </select>
          </FormField>
        )}
        <FormField label="Booth number" error={errors.number?.message} required>
          <input className="input" type="number" inputMode="numeric" min={1} {...register('number')} />
        </FormField>
        <FormField label="Booth name" error={errors.name?.message} required>
          <input className="input" {...register('name')} />
        </FormField>
      </form>
    </Modal>
  );
}

/**
 * Choose the Corporator of a ward (one per ward; changing it moves the ward), or which BLOs work a booth (only BLOs
 * whose Corporator covers that ward; a Corporator sees only its own BLOs).
 */
export function AssignAdminsModal({
  target,
  title,
  description,
  assigned,
  onClose,
  onSaved,
}: {
  target: { kind: 'ward'; id: string } | { kind: 'booth'; id: string; wardId: string };
  title: string;
  description: string;
  assigned: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const actor = useCurrentAdmin();
  const confirm = useConfirm();
  const [admins, setAdmins] = useState<Admin[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>(assigned);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async (): Promise<Admin[]> => {
      if (target.kind === 'ward') return (await adminService.list({ role: 'CORPORATOR', pageSize: 500, sortBy: 'id' })).items;
      // A Corporator only lists its own BLOs, and it covers this ward (it can only open its own wards).
      if (actor.role === 'CORPORATOR') return (await adminService.list({ role: 'BLO', pageSize: 500, sortBy: 'id' })).items;
      const [blos, corporators] = await Promise.all([
        adminService.list({ role: 'BLO', pageSize: 500, sortBy: 'id' }),
        adminService.list({ role: 'CORPORATOR', pageSize: 500, sortBy: 'id' }),
      ]);
      const coversWard = new Set(corporators.items.filter((c) => c.wardIds.includes(target.wardId)).map((c) => c.id));
      return blos.items.filter((b) => coversWard.has(b.corporatorId ?? '') || assigned.includes(b.id));
    };
    load()
      .then((list) => active && setAdmins(list))
      .catch((e) => active && setLoadError(errorMessage(e)));
    return () => {
      active = false;
    };
  }, []);

  const save = async () => {
    // Giving the ward to a different Corporator takes it away from the current one: confirm the move.
    const current = assigned[0];
    if (target.kind === 'ward' && current && selected[0] !== current) {
      const owner = admins?.find((a) => a.id === current);
      const ok = await confirm({
        title: selected[0] ? `Move this ward to ${selected[0]}?` : 'Remove the Corporator?',
        message: `This ward is assigned to ${current}${owner ? ` (${owner.fullName})` : ''}. ${current} and their BLOs will lose it.`,
        confirmLabel: selected[0] ? 'Move ward' : 'Remove',
        tone: 'danger',
      });
      if (!ok) return;
    }
    setSaving(true);
    setServerError(null);
    try {
      if (target.kind === 'ward') await wardService.setWardAdmins(target.id, selected);
      else await wardService.setBoothAdmins(target.id, selected);
      onSaved();
    } catch (e) {
      setServerError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={title}
      size="sm"
      onClose={onClose}
      locked={saving}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={saving || !admins}>
            {saving && <Loader2 size={16} className="spinner" aria-hidden="true" />}
            Save assignment
          </button>
        </>
      }
    >
      <div className="stack">
        <p className="small muted">{description}</p>
        <ServerError message={serverError ?? loadError} />
        {!admins && !loadError ? (
          <SkeletonLines rows={4} height={28} />
        ) : admins?.length === 0 ? (
          <p className="small muted">
            {target.kind === 'ward'
              ? 'No Corporators yet. Create one on the Accounts page.'
              : "No BLOs available. A BLO can only work booths in its Corporator's wards."}
          </p>
        ) : (
          <div className="check-list" style={{ flexDirection: 'column', maxHeight: 320 }}>
            {target.kind === 'ward' && (
              <label className="check">
                <input type="radio" name="ward-corporator" checked={selected.length === 0} onChange={() => setSelected([])} />
                <span className="muted">No Corporator</span>
              </label>
            )}
            {admins?.map((a) => (
              <label key={a.id} className="check">
                {target.kind === 'ward' ? (
                  <input type="radio" name="ward-corporator" checked={selected[0] === a.id} onChange={() => setSelected([a.id])} />
                ) : (
                  <input
                    type="checkbox"
                    checked={selected.includes(a.id)}
                    onChange={(e) => setSelected((s) => (e.target.checked ? [...s, a.id] : s.filter((x) => x !== a.id)))}
                  />
                )}
                <span>
                  {a.id} – {a.fullName}
                  {a.status === 'Inactive' && <span className="muted"> (inactive)</span>}
                </span>
              </label>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
