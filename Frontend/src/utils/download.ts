import * as XLSX from 'xlsx';

export type Cell = string | number | boolean | null | undefined;

function escapeCsv(v: Cell): string {
  const s = v === null || v === undefined ? '' : String(v);
  // Guard against spreadsheet formula injection.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(headers: string[], rows: Cell[][]): string {
  return [headers, ...rows].map((r) => r.map(escapeCsv).join(',')).join('\r\n');
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadCsv(filename: string, headers: string[], rows: Cell[][]): void {
  // BOM so Excel opens UTF-8 (₹) correctly.
  downloadBlob(new Blob(['﻿' + toCsv(headers, rows)], { type: 'text/csv;charset=utf-8' }), filename);
}

export function downloadXlsx(filename: string, sheets: { name: string; headers: string[]; rows: Cell[][] }[]): void {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.aoa_to_sheet([s.headers, ...s.rows]);
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  }
  XLSX.writeFile(wb, filename);
}
