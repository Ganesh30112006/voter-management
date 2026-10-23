import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, Loader2, LogOut, Monitor } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { AccountStatusBadge } from '../../components/common/Badges';
import { FormField } from '../../components/common/FormField';
import { PageHeader } from '../../components/common/PageHeader';
import { ErrorState, SkeletonLines } from '../../components/common/States';
import { useAuth, useCurrentAdmin } from '../../hooks/useAuth';
import { useConfirm } from '../../hooks/useConfirm';
import { useQuery } from '../../hooks/useQuery';
import { useToast } from '../../hooks/useToast';
import { useWards } from '../../hooks/useWards';
import { ApiError, errorMessage } from '../../services/apiError';
import { authService } from '../../services/authService';
import { formatDate, formatDateTime } from '../../utils/format';
import { isSuperAdmin } from '../../utils/permissions';
import { PASSWORD_RULES, passwordSchema, type PasswordFormValues } from '../../utils/validation';

export function ProfilePage() {
  const admin = useCurrentAdmin();
  const { wardLabel, boothLabel } = useWards();
  return (
    <>
      <PageHeader title="My Profile" description="Your account, password and signed-in devices." />
      <div className="stack">
        <section className="card">
          <div className="card-header">
            <h2>Account</h2>
            <AccountStatusBadge status={admin.status} />
          </div>
          <div className="card-body">
            <dl className="detail-grid">
              <div>
                <dt>Admin ID</dt>
                <dd>{admin.id}</dd>
              </div>
              <div>
                <dt>Role</dt>
                <dd>{isSuperAdmin(admin) ? 'Super Admin' : 'BL Admin'}</dd>
              </div>
              <div>
                <dt>Full name</dt>
                <dd>{admin.fullName}</dd>
              </div>
              <div>
                <dt>Mobile (login)</dt>
                <dd>{admin.mobile}</dd>
              </div>
              {!isSuperAdmin(admin) && (
                <>
                  <div>
                    <dt>Assigned wards</dt>
                    <dd>{admin.wardIds.map(wardLabel).join(', ') || '—'}</dd>
                  </div>
                  <div>
                    <dt>Assigned booths</dt>
                    <dd>{admin.boothIds.length ? admin.boothIds.map(boothLabel).join(', ') : 'All booths in assigned wards'}</dd>
                  </div>
                </>
              )}
              <div>
                <dt>Member since</dt>
                <dd>{formatDate(admin.createdAt)}</dd>
              </div>
            </dl>
            <p className="small muted" style={{ marginTop: 12 }}>
              To change your name, mobile number or wards, contact the Super Admin.
            </p>
          </div>
        </section>
        <ChangePasswordCard />
        <SessionsCard />
      </div>
    </>
  );
}

function ChangePasswordCard() {
  const toast = useToast();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<PasswordFormValues>({ resolver: zodResolver(passwordSchema), defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' } });

  const onSubmit = async (v: PasswordFormValues) => {
    setServerError(null);
    try {
      await authService.changePassword(v.currentPassword, v.newPassword);
      reset();
      toast.success('Password changed. Other devices have been signed out.');
    } catch (e) {
      if (e instanceof ApiError && e.fieldErrors) {
        if (e.fieldErrors.currentPassword) setError('currentPassword', { message: e.fieldErrors.currentPassword });
        if (e.fieldErrors.newPassword) setError('newPassword', { message: e.fieldErrors.newPassword });
      }
      setServerError(errorMessage(e));
    }
  };

  return (
    <section className="card">
      <div className="card-header">
        <h2>Change password</h2>
      </div>
      <form className="card-body stack" noValidate onSubmit={handleSubmit(onSubmit)} style={{ maxWidth: 480 }}>
        {serverError && (
          <div className="alert alert-error" role="alert">
            <AlertTriangle size={18} aria-hidden="true" />
            {serverError}
          </div>
        )}
        <FormField label="Current password" error={errors.currentPassword?.message} required>
          <input className="input" type="password" autoComplete="current-password" {...register('currentPassword')} />
        </FormField>
        <FormField label="New password" error={errors.newPassword?.message} required hint={PASSWORD_RULES}>
          <input className="input" type="password" autoComplete="new-password" {...register('newPassword')} />
        </FormField>
        <FormField label="Confirm new password" error={errors.confirmPassword?.message} required>
          <input className="input" type="password" autoComplete="new-password" {...register('confirmPassword')} />
        </FormField>
        <div>
          <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
            {isSubmitting && <Loader2 size={16} className="spinner" aria-hidden="true" />}
            Update password
          </button>
        </div>
      </form>
    </section>
  );
}

function SessionsCard() {
  const toast = useToast();
  const confirm = useConfirm();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [refreshKey, setRefreshKey] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const { data, error, reload } = useQuery(() => authService.sessions(), String(refreshKey));
  const others = (data ?? []).filter((s) => !s.current);

  const revoke = async (id: string) => {
    setBusy(id);
    try {
      await authService.revokeSession(id);
      toast.success('Device signed out.');
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const revokeOthers = async () => {
    const ok = await confirm({ title: 'Sign out other devices?', message: 'Every other device will need to sign in again.', confirmLabel: 'Sign out others' });
    if (!ok) return;
    setBusy('all');
    try {
      const n = await authService.revokeOtherSessions();
      toast.success(n ? `Signed out ${n} other device${n > 1 ? 's' : ''}.` : 'No other devices were signed in.');
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const signOutHere = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <section className="card">
      <div className="card-header">
        <h2>Signed-in devices</h2>
        <button type="button" className="btn btn-secondary btn-sm" onClick={revokeOthers} disabled={!others.length || busy !== null}>
          Sign out other devices
        </button>
      </div>
      {error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data ? (
        <SkeletonLines rows={2} />
      ) : (
        <ul className="recent-list" style={{ margin: 0, padding: 0, listStyle: 'none' }}>
          {data.map((s) => (
            <li key={s.id} className="row" style={{ padding: '12px 18px', justifyContent: 'space-between', borderTop: '1px solid var(--color-border)' }}>
              <span className="row">
                <Monitor size={18} aria-hidden="true" />
                <span>
                  <strong className="small">{s.device}</strong>
                  {s.current && <span className="badge badge-info" style={{ marginLeft: 8 }}>This device</span>}
                  <span className="small muted" style={{ display: 'block' }}>
                    Signed in {formatDateTime(s.createdAt)} · last active {formatDateTime(s.lastSeenAt)}
                  </span>
                </span>
              </span>
              {s.current ? (
                <button type="button" className="btn btn-ghost btn-sm" onClick={signOutHere}>
                  <LogOut size={14} aria-hidden="true" /> Log out
                </button>
              ) : (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => revoke(s.id)} disabled={busy !== null}>
                  Sign out
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
