import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { FormField } from '../../components/common/FormField';
import { Modal } from '../../components/common/Modal';
import { useWards } from '../../hooks/useWards';
import { adminService } from '../../services/adminService';
import { ApiError, errorMessage } from '../../services/apiError';
import type { Admin } from '../../types';
import { adminCreateSchema, adminSchema, PASSWORD_RULES, type AdminFormValues } from '../../utils/validation';

interface Props {
  /** Editing when set; creating otherwise. */
  admin?: Admin;
  onClose: () => void;
  onSaved: (admin: Admin, created: boolean) => void;
}

const FIELDS = ['fullName', 'mobile', 'wardIds', 'boothIds', 'password', 'confirmPassword'] as const;

export function AdminFormModal({ admin, onClose, onSaved }: Props) {
  const editing = !!admin;
  const { wards, boothsForWard } = useWards();
  const [serverError, setServerError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<AdminFormValues>({
    resolver: zodResolver(editing ? adminSchema : adminCreateSchema),
    defaultValues: {
      fullName: admin?.fullName ?? '',
      mobile: admin?.mobile ?? '',
      wardIds: admin?.wardIds ?? [],
      boothIds: admin?.boothIds ?? [],
      password: '',
      confirmPassword: '',
    },
  });

  const wardIds = watch('wardIds');
  const availableBooths = wardIds.flatMap((w) => boothsForWard(w));

  const onSubmit = async (values: AdminFormValues) => {
    setServerError(null);
    try {
      if (editing) {
        const parsed = adminSchema.parse(values);
        onSaved(await adminService.update(admin.id, parsed), false);
      } else {
        const parsed = adminCreateSchema.parse(values);
        const { confirmPassword: _c, ...input } = parsed;
        onSaved(await adminService.create(input), true);
      }
    } catch (e) {
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

  return (
    <Modal
      title={editing ? `Edit ${admin.id}` : 'Create BL Admin'}
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
            {editing ? 'Save changes' : 'Create admin'}
          </button>
        </>
      }
    >
      <form id="admin-form" className="stack" noValidate onSubmit={handleSubmit(onSubmit)}>
        {serverError && (
          <div className="alert alert-error" role="alert">
            <AlertTriangle size={18} aria-hidden="true" />
            {serverError}
          </div>
        )}
        {!editing && <p className="small muted">The Admin ID (BL-1, BL-2, …) is generated automatically. The admin signs in with this mobile number and password.</p>}

        <div className="form-grid">
          <FormField label="Full name" error={errors.fullName?.message} required>
            <input className="input" autoComplete="off" {...register('fullName')} />
          </FormField>
          <FormField label="Mobile number" error={errors.mobile?.message} required hint="Used to sign in">
            <input className="input" type="tel" inputMode="numeric" maxLength={14} autoComplete="off" {...register('mobile')} />
          </FormField>

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

          <div className="field span-2">
            <span className="field-label" id="wards-label">
              Assigned wards<span className="req" aria-hidden="true">*</span>
            </span>
            <Controller
              control={control}
              name="wardIds"
              render={({ field }) => (
                <div className="check-list" role="group" aria-labelledby="wards-label">
                  {wards.map((w) => (
                    <label key={w.id} className="check">
                      <input type="checkbox" checked={field.value.includes(w.id)} onChange={(e) => field.onChange(toggleWard(w.id, e.target.checked, field.value))} />
                      Ward {w.number} – {w.name}
                    </label>
                  ))}
                </div>
              )}
            />
            {errors.wardIds && (
              <span className="field-error" role="alert">
                {errors.wardIds.message}
              </span>
            )}
          </div>

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
        </div>
      </form>
    </Modal>
  );
}
