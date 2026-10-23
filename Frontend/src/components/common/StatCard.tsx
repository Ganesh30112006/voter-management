import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import './StatCard.css';

interface StatCardProps {
  label: string;
  value: string | number;
  hint?: string;
  icon: LucideIcon;
  tone?: 'blue' | 'green' | 'gray' | 'amber' | 'navy';
  loading?: boolean;
}

export function StatCard({ label, value, hint, icon: Icon, tone = 'blue', loading }: StatCardProps) {
  return (
    <div className="stat-card card">
      <div className={`stat-icon stat-${tone}`}>
        <Icon size={20} aria-hidden="true" />
      </div>
      <div className="stat-text">
        <p className="stat-label">{label}</p>
        {loading ? <span className="skeleton" style={{ height: 26, width: 80, marginTop: 4 }} /> : <p className="stat-value">{value}</p>}
        {hint && <p className="stat-hint">{hint}</p>}
      </div>
    </div>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="stat-grid">{children}</div>;
}
