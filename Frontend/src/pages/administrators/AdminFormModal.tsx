import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { FormField } from '../../components/common/FormField';
import { Modal } from '../../components/common/Modal';
import { useCurrentAdmin } from '../../hooks/useAuth';
import { useConfirm } from '../../hooks/useConfirm';
import { useQuery } from '../../hooks/useQuery';
import { useWards } from '../../hooks/useWards';
import { adminService } from '../../services/adminService';
import { ApiError, errorMessage } from '../../services/apiError';
import type { Admin, ManagedRole } from '../../types';
import { ROLE_LABELS } from '../../utils/permissions';
import { adminCreateSchema, adminSchema, PASSWORD_RULES, superAdminCreateSchema, superAdminSchema, type AdminFormValues } from '../../utils/validation';

interface Props {
  /** Editing when set; creating otherwise. */
  admin?: Admin;
  /** Role of the account being created (ignored when editing). */
  role: ManagedRole;
  /** Pre-selected Corporator when the Super Admin creates a BLO. */
  defaultCorporatorId?: string;
  onClose: () => void;
  onSaved: (admin: Admin, created: boolean) => void;
}

const FIELDS = ['fullName', 'mobile', 'location', 'wardIds', 'boothIds', 'password', 'confirmPassword', 'corporatorId'] as const;

export function AdminFormModal({ admin, role: createRole, defaultCorporatorId = '', onClose, onSaved }: Props) {
  const actor = useCurrentAdmin();
  const confirm = useConfirm();
  const editing = !!admin;
  const role: ManagedRole = admin ? (admin.role as ManagedRole) : createRole;
  const isBlo = role === 'BLO';
  const isSuper = role === 'SUPER_ADMIN';
  const editSchema = isSuper ? superAdminSchema : adminSchema;
  const createSchema = isSuper ? superAdminCreateSchema : adminCreateSchema;
  const { wards, boothsForWard } = useWards();
  const [serverError, setServerError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  // A BLO's wards must come from its Corporator, so the Super Admin needs the Corporator list.
  const { data: options } = useQuery(() => (isBlo && actor.role === 'SUPER_ADMIN' ? adminService.options() : Promise.resolve([])), `admin-options-${isBlo}`);
  const corporators = (options ?? []).filter((o) => o.role === 'CORPORATOR');

  const {
    register,
    control,
    handleSubmit,
    watch,
    getValues,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<AdminFormValues>({
    resolver: zodResolver(editing ? editSchema : createSchema),
    defaultValues: {
      fullName: admin?.fullName ?? '',
      mobile: admin?.mobile ?? '',
      location: admin?.location ?? '',
      wardIds: admin?.wardIds ?? [],
      boothIds: admin?.boothIds ?? [],
      password: '',
      confirmPassword: '',
      corporatorId: admin?.corporatorId ?? (actor.role === 'CORPORATOR' ? actor.id : defaultCorporatorId),
    },
  });

  const wardIds = watch('wardIds');
  const corporatorId = watch('corporatorId');
  const corporatorWardIds = !isBlo
    ? null
    : actor.role === 'CORPORATOR'
      ? actor.wardIds
      : corporators.find((c) => c.id === corporatorId)?.wardIds ?? [];
  const wardChoices = corporatorWardIds ? wards.filter((w) => corporatorWardIds.includes(w.id)) : wards;
  const availableBooths = wardIds.flatMap((w) => boothsForWard(w));

  const onSubmit = async (values: AdminFormValues, moveWards = false): Promise<void> => {
    setServerError(null);
    // corporatorId is not part of the Zod schema (it would be stripped from `values`), so read it from the form.
    const chosenCorporator = getValues('corporatorId') ?? '';
    if (!editing && isBlo && !chosenCorporator) {
      setError('corporatorId', { message: 'Select a Corporator' });
      return;
    }
    try {
      if (editing) {
        const parsed = editSchema.parse(values);
        onSaved(
          await adminService.update(admin.id, { ...parsed, wardIds: isSuper ? [] : parsed.wardIds, boothIds: isBlo ? parsed.boothIds : [], moveWards }),
          false,
        );
      } else {
        const parsed = createSchema.parse(values);
        const { confirmPassword: _c, ...input } = parsed;
        onSaved(
          await adminService.create({
            ...input,
            wardIds: isSuper ? [] : input.wardIds,
            boothIds: isBlo ? input.boothIds : [],
            role,
            corporatorId: isBlo ? chosenCorporator : undefined,
            moveWards,
          }),
          true,
        );
      }
    } catch (e) {
      // A ward has one Corporator: offer to move a taken ward here, or cancel.
      if (e instanceof ApiError && e.code === 'WARD_TAKEN') {
        const move = await confirm({
          title: 'Ward already assigned',
          message: `${e.message} Move it to ${editing ? admin.id : 'this Corporator'}? The other Corporator and their BLOs will lose it.`,
          confirmLabel: 'Move ward',
          tone: 'danger',
        });
        if (move) return onSubmit(values, true);
        setError('wardIds', { message: 'Choose wards that are not assigned to another Corporator' });
        return;
      }
      if (e instanceof ApiError && e.fieldErrors) {
        for (const [field, message] of Object.entries(e.fieldErrors)) {
          if ((FIELDS as readonly string[]).includes(field)) setError(field as (typeof FIELDS)[number], { message });
        }
      }
      setServerError(errorMessage(e));
    }
  };

  const toggleWard = (id: string, checked: boolean, current: string[]) => {
    const next = checked ? [...current, id] : current.filter((w) => w !== id);
    // Drop booth assignments that no longer belong to a selected ward.
    if (!checked) {
      const remove = new Set(boothsForWard(id).map((b) => b.id));
      setValue(
        'boothIds',
        watch('boothIds').filter((b) => !remove.has(b)),
      );
    }
    return next;
  };

  const label = ROLE_LABELS[role];

  return (
    <Modal
      title={editing ? `Edit ${admin.id}` : `Create ${label}`}
      onClose={onClose}
      size="lg"
      locked={isSubmitting}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </button>
          <button type="submit" form="admin-form" className="btn btn-primary" disabled={isSubmitting}>
            {isSubmitting && <Loader2 size={16} className="spinner" aria-hidden="true" />}
            {editing ? 'Save changes' : `Create ${label}`}
          </button>
        </>
      }
    >
      <form id="admin-form" className="stack" noValidate onSubmit={handleSubmit((values) => onSubmit(values))}>
        {serverError && (
          <div className="alert alert-error" role="alert">
            <AlertTriangle size={18} aria-hidden="true" />
            {serverError}
          </div>
        )}
        {!editing && (
          <p className="small muted">
            {isBlo
              ? 'The BLO ID (for example C-1-BLO1) is generated automatically from the Corporator.'
              : isSuper
                ? 'The Super Admin ID (SA-2, SA-3, …) is generated automatically. A Super Admin has full access, including managing other Super Admins.'
                : 'The Corporator ID (C-1, C-2, …) is generated automatically.'}{' '}
            The account signs in with this mobile number and password.
          </p>
        )}

        <div className="form-grid">
          {isBlo && actor.role === 'SUPER_ADMIN' && (
            <FormField label="Corporator" error={errors.corporatorId?.message} required hint={editing ? 'A BLO stays with its Corporator' : undefined}>
              <select
                className="select"
                disabled={editing}
                {...register('corporatorId', {
                  onChange: () => {
                    setValue('wardIds', []);
                    setValue('boothIds', []);
                  },
                })}
              >
                <option value="">Select a Corporator</option>
                {corporators.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.id} – {c.fullName}
                  </option>
                ))}
              </select>
            </FormField>
          )}

          <FormField label="Full name" error={errors.fullName?.message} required>
            <input className="input" autoComplete="off" {...register('fullName')} />
          </FormField>
          <FormField label="Mobile number" error={errors.mobile?.message} required hint="Used to sign in">
            <input className="input" type="tel" inputMode="numeric" maxLength={14} autoComplete="off" {...register('mobile')} />
          </FormField>
          {role === 'CORPORATOR' && (
            <div className="span-2">
              <FormField label="Location" error={errors.location?.message} hint="Where the Corporator is based, e.g. office or area">
                <input className="input" autoComplete="off" maxLength={200} {...register('location')} />
              </FormField>
            </div>
          )}

          {!editing && (
            <>
              <FormField label="Password" error={errors.password?.message} required hint={PASSWORD_RULES}>
                <input className="input" type={showPassword ? 'text' : 'password'} autoComplete="new-password" {...register('password')} />
              </FormField>
              <FormField label="Confirm password" error={errors.confirmPassword?.message} required>
                <input className="input" type={showPassword ? 'text' : 'password'} autoComplete="new-password" {...register('confirmPassword')} />
              </FormField>
              <div className="span-2">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowPassword((s) => !s)}>
                  {showPassword ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
                  {showPassword ? 'Hide passwords' : 'Show passwords'}
                </button>
              </div>
            </>
          )}

          {!isSuper && (
            <div className="field span-2">
              <span className="field-label" id="wards-label">
                Assigned wards<span className="req" aria-hidden="true">*</span>
              </span>
              {isBlo && <span className="field-hint">Only the Corporator's wards can be chosen.</span>}
              <Controller
                control={control}
                name="wardIds"
                render={({ field }) =>
                  wardChoices.length ? (
                    <div className="check-list" role="group" aria-labelledby="wards-label">
                      {wardChoices.map((w) => (
                        <label key={w.id} className="check">
                          <input type="checkbox" checked={field.value.includes(w.id)} onChange={(e) => field.onChange(toggleWard(w.id, e.target.checked, field.value))} />
                          Ward {w.number} – {w.name}
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className="small muted">{isBlo ? 'Select a Corporator with assigned wards first.' : 'Create a ward first.'}</p>
                  )
                }
              />
              {errors.wardIds && (
                <span className="field-error" role="alert">
                  {errors.wardIds.message}
                </span>
              )}
            </div>
          )}

          {isBlo && (
            <div className="field span-2">
              <span className="field-label" id="booths-label">
                Assigned booths <span className="muted">(optional)</span>
              </span>
              <span className="field-hint">Leave empty to cover every booth in the selected wards.</span>
              <Controller
                control={control}
                name="boothIds"
                render={({ field }) =>
                  availableBooths.length ? (
                    <div className="check-list" role="group" aria-labelledby="booths-label">
                      {availableBooths.map((b) => (
                        <label key={b.id} className="check">
                          <input
                            type="checkbox"
                            checked={field.value.includes(b.id)}
                            onChange={(e) => field.onChange(e.target.checked ? [...field.value, b.id] : field.value.filter((x) => x !== b.id))}
                          />
                          Booth {b.number}
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className="small muted">Select a ward to choose booths.</p>
                  )
                }
              />
              {errors.boothIds && (
                <span className="field-error" role="alert">
                  {errors.boothIds.message}
                </span>
              )}
            </div>
          )}
        </div>
      </form>
    </Modal>
  );
}
