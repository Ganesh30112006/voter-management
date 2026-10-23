import type { ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatCurrency, formatNumber } from '../../utils/format';
import './Charts.css';

/** Validated with the dataviz palette checker (CVD + contrast on the light surface). */
export const CHART = {
  series: '#2a78d6',
  grid: '#e8ecf1',
  axis: '#64748b',
  green: '#16a34a',
  gray: '#64748b',
  amber: '#d97706',
};

const tick = { fill: CHART.axis, fontSize: 12 };

export function ChartCard({ title, subtitle, children, empty }: { title: string; subtitle?: string; children: ReactNode; empty?: boolean }) {
  return (
    <section className="card chart-card">
      <div className="chart-head">
        <h2>{title}</h2>
        {subtitle && <p className="muted small">{subtitle}</p>}
      </div>
      <div className="chart-body">{empty ? <p className="chart-empty">No data for the selected filters.</p> : children}</div>
    </section>
  );
}

type ValueFormat = 'number' | 'currency';
const fmt = (v: number, f: ValueFormat) => (f === 'currency' ? formatCurrency(v) : formatNumber(v));

interface TooltipBoxProps {
  active?: boolean;
  label?: string;
  payload?: { value?: number | string; name?: string; payload?: Record<string, unknown> }[];
  format: ValueFormat;
  valueLabel: string;
}

function TooltipBox({ active, label, payload, format, valueLabel }: TooltipBoxProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip-label">{label ?? p.name}</p>
      <p>
        {valueLabel}: <strong>{fmt(Number(p.value ?? 0), format)}</strong>
      </p>
    </div>
  );
}

/** Single-series bars (one hue: magnitude, not identity). */
export function SimpleBarChart({
  data,
  dataKey,
  nameKey,
  valueLabel,
  format = 'number',
  height = 260,
}: {
  data: Record<string, unknown>[];
  dataKey: string;
  nameKey: string;
  valueLabel: string;
  format?: ValueFormat;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%">
        <CartesianGrid vertical={false} stroke={CHART.grid} />
        <XAxis dataKey={nameKey} tick={tick} tickLine={false} axisLine={{ stroke: CHART.grid }} interval="preserveStartEnd" />
        <YAxis tick={tick} tickLine={false} axisLine={false} width={format === 'currency' ? 72 : 40} allowDecimals={false} tickFormatter={(v: number) => (format === 'currency' ? `₹${formatNumber(v)}` : formatNumber(v))} />
        <Tooltip cursor={{ fill: 'rgba(42,120,214,0.08)' }} content={<TooltipBox format={format} valueLabel={valueLabel} />} />
        <Bar dataKey={dataKey} name={valueLabel} fill={CHART.series} radius={[4, 4, 0, 0]} maxBarSize={44} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TrendLineChart({
  data,
  dataKey,
  nameKey,
  valueLabel,
  format = 'number',
  height = 260,
}: {
  data: Record<string, unknown>[];
  dataKey: string;
  nameKey: string;
  valueLabel: string;
  format?: ValueFormat;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={CHART.grid} />
        <XAxis dataKey={nameKey} tick={tick} tickLine={false} axisLine={{ stroke: CHART.grid }} minTickGap={24} />
        <YAxis tick={tick} tickLine={false} axisLine={false} width={72} allowDecimals={false} tickFormatter={(v: number) => (format === 'currency' ? `₹${formatNumber(v)}` : formatNumber(v))} />
        <Tooltip cursor={{ stroke: CHART.axis, strokeDasharray: '3 3' }} content={<TooltipBox format={format} valueLabel={valueLabel} />} />
        <Line type="monotone" dataKey={dataKey} name={valueLabel} stroke={CHART.series} strokeWidth={2} dot={false} activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Part-to-whole for a few statuses; always shown with a labelled legend so color is never the only cue. */
export function StatusDonut({ data, height = 220 }: { data: { name: string; value: number; color: string }[]; height?: number }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="donut">
      <div className="donut-chart" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip content={<TooltipBox format="number" valueLabel="Voters" />} />
            <Pie data={data} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="90%" paddingAngle={data.filter((d) => d.value > 0).length > 1 ? 2 : 0} stroke="#fff" strokeWidth={2}>
              {data.map((d) => (
                <Cell key={d.name} fill={d.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="donut-center">
          <strong>{formatNumber(total)}</strong>
          <span>total</span>
        </div>
      </div>
      <ul className="donut-legend">
        {data.map((d) => (
          <li key={d.name}>
            <span className="swatch" style={{ background: d.color }} aria-hidden="true" />
            <span className="donut-legend-name">{d.name}</span>
            <span className="mono">{formatNumber(d.value)}</span>
            <span className="muted small">{total ? Math.round((d.value / total) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
