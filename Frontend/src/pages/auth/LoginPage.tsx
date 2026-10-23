import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, Eye, EyeOff, Loader2, LogIn, Vote } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { FormField } from '../../components/common/FormField';
import { useAuth } from '../../hooks/useAuth';
import { USE_MOCK } from '../../services/apiClient';
import { errorMessage } from '../../services/apiError';
import { loginSchema, type LoginForm } from '../../utils/validation';
import './AuthPages.css';

export function LoginPage() {
  const { admin, login, sessionExpired } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const requested = (location.state as { from?: string } | null)?.from ?? '/';
  // Only return to a path on this site: "//host" or "/\host" would leave it.
  const from = /^\/(?![/\\])/.test(requested) ? requested : '/';
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema), defaultValues: { identifier: '', password: '', remember: false } });

  if (admin) return <Navigate to={from} replace />;

  const onSubmit = async (values: LoginForm) => {
    setServerError(null);
    try {
      const parsed = loginSchema.parse(values);
      await login(parsed.identifier, parsed.password, parsed.remember);
      navigate(from, { replace: true });
    } catch (e) {
      setServerError(errorMessage(e));
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card card">
        <div className="auth-brand">
          <span className="auth-logo">
            <Vote size={24} aria-hidden="true" />
          </span>
          <div>
            <h1>Voter Desk</h1>
            <p className="muted small">Voting Management System</p>
          </div>
        </div>

        <h2 className="auth-title">Sign in</h2>

        {sessionExpired && !serverError && (
          <div className="alert alert-warning">
            <AlertCircle size={18} aria-hidden="true" />
            Your session has expired. Please sign in again.
          </div>
        )}
        {serverError && (
          <div className="alert alert-error" role="alert">
            <AlertCircle size={18} aria-hidden="true" />
            {serverError}
          </div>
        )}

        <form className="stack" onSubmit={handleSubmit(onSubmit)} noValidate>
          <FormField label="Mobile number or full name" error={errors.identifier?.message} required>
            <input className="input" autoComplete="username" placeholder="10-digit mobile or your full name" maxLength={100} {...register('identifier')} />
          </FormField>

          <div className="field">
            <label className="field-label" htmlFor="login-password">
              Password<span className="req" aria-hidden="true">*</span>
            </label>
            <div className="input-group">
              <input
                id="login-password"
                className="input"
                style={{ paddingLeft: 12, paddingRight: 44 }}
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                aria-invalid={errors.password ? true : undefined}
                aria-describedby={errors.password ? 'login-password-error' : undefined}
                aria-required
                {...register('password')}
              />
              <span className="input-suffix">
                <button type="button" className="icon-btn" style={{ width: 36, height: 36 }} onClick={() => setShowPassword((s) => !s)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                  {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                </button>
              </span>
            </div>
            {errors.password && (
              <span id="login-password-error" className="field-error" role="alert">
                {errors.password.message}
              </span>
            )}
          </div>

          <label className="check">
            <input type="checkbox" {...register('remember')} /> Remember me
          </label>

          <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 size={18} className="spinner" aria-hidden="true" /> : <LogIn size={18} aria-hidden="true" />}
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="small muted">Your password is set by the Super Admin. Contact them if you cannot sign in.</p>

        {USE_MOCK && (
          <p className="auth-dev-note">
            Development mode: Super Admin <strong>9000000001</strong>, Corporator C-1 <strong>9876543210</strong>, BLO C-1-BLO1{' '}
            <strong>9876543211</strong>. Password: the value of <code>VITE_MOCK_PASSWORD</code>.
          </p>
        )}
      </div>
    </div>
  );
}
