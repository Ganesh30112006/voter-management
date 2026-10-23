import { ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';

export function ForbiddenPage() {
  return (
    <div className="card">
      <div className="state">
        <ShieldAlert size={36} className="state-icon" aria-hidden="true" />
        <p className="state-title">You don’t have access to this page</p>
        <p className="state-message">Your account role cannot open this page.</p>
        <Link to="/" className="btn btn-primary btn-sm">
          Go to dashboard
        </Link>
      </div>
    </div>
  );
}

export function NotFoundPage() {
  return (
    <div className="card">
      <div className="state">
        <p className="state-title">Page not found</p>
        <p className="state-message">The page you are looking for does not exist.</p>
        <Link to="/" className="btn btn-primary btn-sm">
          Go to dashboard
        </Link>
      </div>
    </div>
  );
}
