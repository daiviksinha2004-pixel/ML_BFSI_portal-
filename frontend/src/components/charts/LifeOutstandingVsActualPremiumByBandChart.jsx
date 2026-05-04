import React from 'react';
import { Coins } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import GlassCard from '../ui/GlassCard';

const OUTSTANDING_COLOR = '#f59e0b';
const ACTUAL_COLOR = '#34d399';

const formatCurrencyCompact = (value) => {
  if (value >= 10000000) return `${(value / 10000000).toFixed(1)}Cr`;
  if (value >= 100000) return `${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return value.toFixed(0);
};

const formatCurrencyFull = (value) => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

const ChartTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;

  const point = payload[0]?.payload;
  return (
    <div className="rounded-xl border border-white/10 bg-black/85 px-4 py-3 shadow-2xl">
      <div className="text-xs font-semibold uppercase tracking-widest text-gray-400">
        {point.premium_band}
      </div>
      <div className="mt-2 space-y-1">
        <div className="flex items-center justify-between gap-4 text-sm">
          <span className="text-gray-400">Outstanding</span>
          <span className="font-medium text-white">{formatCurrencyFull(point.outstanding_premium_total)}</span>
        </div>
        <div className="flex items-center justify-between gap-4 text-sm">
          <span className="text-gray-400">Actual</span>
          <span className="font-medium text-white">{formatCurrencyFull(point.actual_premium_total)}</span>
        </div>
        <div className="flex items-center justify-between gap-4 text-sm">
          <span className="text-gray-400">Combined</span>
          <span className="font-medium text-white">{formatCurrencyFull(point.combined_premium_total)}</span>
        </div>
        <div className="flex items-center justify-between gap-4 border-t border-white/10 pt-2 text-sm">
          <span className="text-gray-400">Policies</span>
          <span className="font-medium text-white">{point.policy_count.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
};

export default function LifeOutstandingVsActualPremiumByBandChart({ data = [] }) {
  const totals = data.reduce(
    (acc, item) => ({
      outstanding: acc.outstanding + (item.outstanding_premium_total || 0),
      actual: acc.actual + (item.actual_premium_total || 0),
    }),
    { outstanding: 0, actual: 0 }
  );

  return (
    <GlassCard
      title="Outstanding vs Actual Premium by Band"
      subtitle="Annual premium buckets across life policies"
      icon={Coins}
      className="min-h-[410px]"
    >
      {!data.length ? (
        <div className="flex h-[320px] items-center justify-center rounded-2xl border border-dashed border-white/10 bg-black/10 text-center">
          <div>
            <div className="text-sm font-medium text-white">No premium band data available</div>
            <div className="mt-1 text-xs text-gray-400">Try another month selection or ingest more life data.</div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: OUTSTANDING_COLOR }} />
              <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Outstanding</span>
              <span className="text-xs font-medium text-white">{formatCurrencyCompact(totals.outstanding)}</span>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: ACTUAL_COLOR }} />
              <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Actual</span>
              <span className="text-xs font-medium text-white">{formatCurrencyCompact(totals.actual)}</span>
            </div>
          </div>

          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, right: 8, left: 16, bottom: 0 }} barCategoryGap={22}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis
                  dataKey="premium_band"
                  stroke="rgba(255,255,255,0.35)"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12 }}
                />
                <YAxis
                  stroke="rgba(255,255,255,0.35)"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12 }}
                  tickFormatter={formatCurrencyCompact}
                />
                <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} content={<ChartTooltip />} />
                <Bar
                  dataKey="outstanding_premium_total"
                  name="Outstanding"
                  radius={[10, 10, 0, 0]}
                  barSize={26}
                  fill={OUTSTANDING_COLOR}
                />
                <Bar
                  dataKey="actual_premium_total"
                  name="Actual"
                  radius={[10, 10, 0, 0]}
                  barSize={26}
                  fill={ACTUAL_COLOR}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
            {data.map((band) => (
              <div
                key={band.premium_band}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2"
              >
                <div className="truncate text-xs font-semibold uppercase tracking-widest text-gray-400">
                  {band.premium_band}
                </div>
                <div className="mt-2 text-sm font-medium text-white">{band.policy_count.toLocaleString()} policies</div>
                <div className="mt-1 text-[10px] uppercase tracking-widest text-gray-500">
                  {formatCurrencyCompact(band.combined_premium_total)} combined
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </GlassCard>
  );
}
