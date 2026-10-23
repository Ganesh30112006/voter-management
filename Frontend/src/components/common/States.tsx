import { AlertTriangle, Inbox, Loader2, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
import './States.css';

export function EmptyState({ title, message, action }: { title: string; message?: string; action?: ReactNode }) {
  return (
    <div className="state">
      <Inbox size={32} aria-hidden="true" className="state-icon" />
      <p className="state-title">{title}</p>
      {message && <p className="state-message">{message}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="state state-error" role="alert">
      <AlertTriangle size={32} aria-hidden="true" className="state-icon" />
      <p className="state-title">Could not load data</p>
      <p className="state-message">{message}</p>
      {onRetry && (
        <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}>
          <RefreshCw size={14} aria-hidden="true" /> Try again
        </button>
      )}
    </div>
  );
}

export function SkeletonLines({ rows = 5, height = 40 }: { rows?: number; height?: number }) {
  return (
    <div className="skeleton-lines" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <span key={i} className="skeleton" style={{ height }} />
      ))}
    </div>
  );
}

export function Spinner({ size = 16, label }: { size?: number; label?: string }) {
  return (
    <span className="row" role="status">
      <Loader2 size={size} className="spinner" aria-hidden="true" />
      {label ? <span>{label}</span> : <span className="sr-only">Loading</span>}
    </span>
  );
}
