import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { FormField } from '../../components/common/FormField';
import { Modal } from '../../components/common/Modal';
import { adminService } from '../../services/adminService';
import { ApiError, errorMessage } from '../../services/apiError';
import type { Admin } from '../../types';
import { PASSWORD_RULES, setPasswordSchema, type SetPasswordValues } from '../../utils/validation';

/** The Super Admin, or a BLO's Corporator, sets a new password for a Corporator or BLO. */
export function SetPasswordModal({ admin, onClose, onDone }: { admin: Admin; onClose: () => void; onDone: () => void }) {
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SetPasswordValues>({ resolver: zodResolver(setPasswordSchema), defaultValues: { password: '', confirmPassword: '' } });

  const onSubmit = async (v: SetPasswordValues) => {
    setServerError(null);
    try {
      await adminService.setPassword(admin.id, v.password);
      onDone();
    } catch (e) {
      if (e instanceof ApiError && e.fieldErrors?.password) setError('password', { message: e.fieldErrors.password });
      setServerError(errorMessage(e));
    }
  };

  return (
    <Modal
      title={`Change password · ${admin.id}`}
      size="sm"
      onClose={onClose}
      locked={isSubmitting}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </button>
          <button type="submit" form="set-password-form" className="btn btn-primary" disabled={isSubmitting}>
            {isSubmitting && <Loader2 size={16} className="spinner" aria-hidden="true" />}
            Save password
          </button>
        </>
      }
    >
      <form id="set-password-form" className="stack" noValidate onSubmit={handleSubmit(onSubmit)}>
        <p className="small muted">
          Set a new password for {admin.fullName}. They will be signed out of all devices and must use the new password.
        </p>
        {serverError && (
          <div className="alert alert-error" role="alert">
            <AlertTriangle size={18} aria-hidden="true" />
            {serverError}
          </div>
        )}
        <FormField label="New password" error={errors.password?.message} required hint={PASSWORD_RULES}>
          <input className="input" type="password" autoComplete="new-password" {...register('password')} />
        </FormField>
        <FormField label="Confirm password" error={errors.confirmPassword?.message} required>
          <input className="input" type="password" autoComplete="new-password" {...register('confirmPassword')} />
        </FormField>
      </form>
    </Modal>
  );
}
