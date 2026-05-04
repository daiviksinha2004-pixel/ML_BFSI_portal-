import React from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Layers } from 'lucide-react';
import GlassCard from '../ui/GlassCard';

const PAID_COLOR = '#34d399';
const UNPAID_COLOR = '#f59e0b';

const formatCount = (v) => {
  if (v >= 10_000_000) return `${(v / 10_000_000).toFixed(1)}Cr`;
  if (v >= 100_000) return `${(v / 100_000).toFixed(1)}L`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return v.toLocaleString();
};

const ChartTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;

  const point = payload[0]?.payload;
  return (
    <div className="rounded-xl border border-white/10 bg-black/85 px-4 py-3 shadow-2xl">
      <div className="text-xs font-semibold uppercase tracking-widest text-gray-400">
        {point.policy_status}
      </div>
      <div className="mt-2 space-y-1">
        <div className="flex items-center justify-between gap-4 text-sm">
          <span className="flex items-center gap-2 text-gray-400">
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: PAID_COLOR }} />
            Paid
          </span>
          <span className="font-medium text-white">{point.paid_count.toLocaleString()}</span>
        </div>
        <div className="flex items-center justify-between gap-4 text-sm">
          <span className="flex items-center gap-2 text-gray-400">
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: UNPAID_COLOR }} />
            Unpaid
          </span>
          <span className="font-medium text-white">{point.unpaid_count.toLocaleString()}</span>
        </div>
        <div className="flex items-center justify-between gap-4 border-t border-white/10 pt-2 text-sm">
          <span className="text-gray-400">Total</span>
          <span className="font-medium text-white">{point.total_count.toLocaleString()}</span>
        </div>
        <div className="flex items-center justify-between gap-4 text-sm">
          <span className="text-gray-400">Rate</span>
          <span className="font-medium text-white">{point.payment_rate_pct}%</span>
        </div>
      </div>
    </div>
  );
};

export default function LifePolicyStatusByPmtFlagChart({ data = [] }) {
  return (
    <GlassCard
      title="Policy Status by Payment"
      subtitle="Paid vs Unpaid breakdown by policy status"
      icon={Layers}
      className="min-h-[400px]"
    >
      {!data.length ? (
        <div className="flex h-[280px] items-center justify-center rounded-2xl border border-dashed border-white/10 bg-black/10 text-center">
          <div>
            <div className="text-sm font-medium text-white">No policy status data available</div>
            <div className="mt-1 text-xs text-gray-400">Try another month selection or ingest more life data.</div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PAID_COLOR }} />
              <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Paid</span>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: UNPAID_COLOR }} />
              <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Unpaid</span>
            </div>
          </div>

          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, right: 8, left: 16, bottom: 0 }} barCategoryGap={20}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis
                  dataKey="policy_status"
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
                  tickFormatter={formatCount}
                />
                <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} content={<ChartTooltip />} />
                <Bar
                  dataKey="paid_count"
                  stackId="status"
                  radius={[0, 0, 8, 8]}
                  barSize={42}
                  fill={PAID_COLOR}
                />
                <Bar
                  dataKey="unpaid_count"
                  stackId="status"
                  radius={[8, 8, 0, 0]}
                  barSize={42}
                  fill={UNPAID_COLOR}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-6">
            {data.map((item) => (
              <div
                key={item.policy_status}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
              >
                <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 truncate">
                  {item.policy_status}
                </div>
                <div className="mt-2 flex items-end justify-between gap-2">
                  <div>
                    <div className="text-[9px] uppercase tracking-widest text-gray-500">Paid</div>
                    <div className="text-base font-light text-emerald-400">{item.paid_count.toLocaleString()}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[9px] uppercase tracking-widest text-gray-500">Unpaid</div>
                    <div className="text-base font-light text-amber-400">{item.unpaid_count.toLocaleString()}</div>
                  </div>
                </div>
                <div className="mt-1 text-[10px] text-gray-500">
                  {item.payment_rate_pct}% rate · {item.total_count.toLocaleString()} total
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </GlassCard>
  );
}
