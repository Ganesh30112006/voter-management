const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const num = new Intl.NumberFormat('en-IN');

export function formatCurrency(value: number): string {
  return inr.format(value);
}

export function formatNumber(value: number): string {
  return num.format(value);
}

/** e.g. 23 Oct 2026, 3:15 PM */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const date = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).toUpperCase();
  return `${date}, ${time}`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Local calendar date as YYYY-MM-DD. */
export function toDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** "Suresh (C-1-BLO1)": who handed over the cash and the account that recorded it; '' when not shown. */
export function givenByLabel(t: { adminId: string; adminName: string; givenByName?: string }): string {
  return t.adminId ? `${t.givenByName || t.adminName} (${t.adminId})` : '';
}
