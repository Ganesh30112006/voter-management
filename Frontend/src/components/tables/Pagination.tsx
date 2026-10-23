import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatNumber } from '../../utils/format';

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
}

export function Pagination({ page, pageSize, total, onPageChange, onPageSizeChange }: PaginationProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className="pagination">
      <span className="muted small">
        {formatNumber(from)}–{formatNumber(to)} of {formatNumber(total)}
      </span>
      <div className="row">
        {onPageSizeChange && (
          <label className="row small muted">
            Rows
            <select className="select" style={{ width: 76, minHeight: 34, padding: '4px 8px' }} value={pageSize} onChange={(e) => onPageSizeChange(Number(e.target.value))}>
              {[10, 20, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )}
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onPageChange(page - 1)} disabled={page <= 1} aria-label="Previous page">
          <ChevronLeft size={16} aria-hidden="true" />
        </button>
        <span className="small">
          Page {page} of {pages}
        </span>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onPageChange(page + 1)} disabled={page >= pages} aria-label="Next page">
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
