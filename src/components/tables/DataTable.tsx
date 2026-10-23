import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { EmptyState, ErrorState, SkeletonLines } from '../common/States';
import './DataTable.css';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  /** When set, the header becomes a sort toggle for this key. */
  sortKey?: string;
  align?: 'left' | 'right';
  /** Hide the label in the mobile card layout (e.g. for action cells). */
  hideLabelOnMobile?: boolean;
}

export interface SortState {
  sortBy: string;
  sortDir: 'asc' | 'desc';
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  sort?: SortState;
  onSortChange?: (sort: SortState) => void;
  emptyTitle?: string;
  emptyMessage?: string;
  caption: string;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  error,
  onRetry,
  sort,
  onSortChange,
  emptyTitle = 'No records found',
  emptyMessage = 'Try changing the search or filters.',
  caption,
}: DataTableProps<T>) {
  if (error && !rows?.length) return <ErrorState message={error} onRetry={onRetry} />;
  if (loading && rows === undefined) return <SkeletonLines rows={6} />;
  if (!rows?.length) return loading ? <SkeletonLines rows={6} /> : <EmptyState title={emptyTitle} message={emptyMessage} />;

  const toggle = (key: string) => {
    if (!onSortChange) return;
    if (sort?.sortBy === key) onSortChange({ sortBy: key, sortDir: sort.sortDir === 'asc' ? 'desc' : 'asc' });
    else onSortChange({ sortBy: key, sortDir: 'asc' });
  };

  return (
    <div className={`table-wrap ${loading ? 'is-loading' : ''}`} aria-busy={loading || undefined}>
      <table className="table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => {
              const active = sort?.sortBy === c.sortKey;
              const ariaSort = active ? (sort?.sortDir === 'asc' ? 'ascending' : 'descending') : undefined;
              return (
                <th key={c.key} scope="col" className={c.align === 'right' ? 'text-right' : undefined} aria-sort={ariaSort}>
                  {c.sortKey && onSortChange ? (
                    <button type="button" className="th-sort" onClick={() => toggle(c.sortKey!)}>
                      {c.header}
                      {active ? (
                        sort?.sortDir === 'asc' ? <ArrowUp size={14} aria-hidden="true" /> : <ArrowDown size={14} aria-hidden="true" />
                      ) : (
                        <ArrowUpDown size={14} aria-hidden="true" className="th-sort-idle" />
                      )}
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((c) => (
                <td
                  key={c.key}
                  data-label={c.hideLabelOnMobile ? undefined : c.header}
                  className={[c.align === 'right' ? 'text-right' : '', c.hideLabelOnMobile ? 'td-actions' : ''].join(' ').trim() || undefined}
                >
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
