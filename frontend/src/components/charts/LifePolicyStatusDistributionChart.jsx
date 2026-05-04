import React from 'react';
import { Donut } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import GlassCard from '../ui/GlassCard';

const STATUS_COLORS = {
  'Paid Up': '#34d399',
  Due: '#f59e0b',
  Lapsed: '#f87171',
  Discontinue: '#a78bfa',
  Active: '#38bdf8',
  Unassigned: '#64748b',
};

const FALLBACK_COLORS = ['#2dd4bf', '#f59e0b', '#38bdf8', '#f87171', '#a78bfa', '#94a3b8', '#facc15'];

const getStatusColor = (status, index) => STATUS_COLORS[status] || FALLBACK_COLORS[index % FALLBACK_COLORS.length];

const ChartTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;

  const point = payload[0]?.payload;
  return (
    <div className="rounded-xl border border-white/10 bg-black/85 px-4 py-3 shadow-2xl">
      <div className="text-xs font-semibold uppercase tracking-widest text-gray-400">
        {point.policy_status}
      </div>
      <div className="mt-2 text-lg font-medium text-white">
        {point.total_count.toLocaleString()}
      </div>
      <div className="mt-1 text-xs text-gray-400">
        {point.share_pct.toFixed(1)}% of policies
      </div>
    </div>
  );
};

export default function LifePolicyStatusDistributionChart({ data = [] }) {
  const totalPolicies = data.reduce((sum, item) => sum + (item.total_count || 0), 0);
  const chartData = data.map((item) => ({
    ...item,
    share_pct: totalPolicies ? ((item.total_count || 0) / totalPolicies) * 100 : 0,
  }));

  return (
    <GlassCard
      title="Policy Status Distribution"
      subtitle="Donut view of life policies by status"
      icon={Donut}
      className="h-full min-h-[390px]"
    >
      {!chartData.length ? (
        <div className="flex h-[280px] items-center justify-center rounded-2xl border border-dashed border-white/10 bg-black/10 text-center">
          <div>
            <div className="text-sm font-medium text-white">No policy status data available</div>
            <div className="mt-1 text-xs text-gray-400">Try another month selection or ingest more life data.</div>
          </div>
        </div>
      ) : (
        <div className="flex h-full flex-col gap-4">
          <div className="relative h-[220px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  dataKey="total_count"
                  nameKey="policy_status"
                  cx="50%"
                  cy="50%"
                  innerRadius={58}
                  outerRadius={88}
                  paddingAngle={3}
                  stroke="none"
                >
                  {chartData.map((entry, index) => (
                    <Cell key={entry.policy_status} fill={getStatusColor(entry.policy_status, index)} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>

            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <div className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">Policies</div>
              <div className="text-2xl font-light text-white">{totalPolicies.toLocaleString()}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {chartData.map((item, index) => (
              <div
                key={item.policy_status}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: getStatusColor(item.policy_status, index) }}
                  />
                  <span className="truncate text-xs text-gray-300">{item.policy_status}</span>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium text-white">{item.total_count.toLocaleString()}</div>
                  <div className="text-[10px] uppercase tracking-widest text-gray-500">
                    {item.share_pct.toFixed(1)}%
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </GlassCard>
  );
}
