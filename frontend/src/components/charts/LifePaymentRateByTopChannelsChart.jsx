import React from 'react';
import { Network } from 'lucide-react';
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

const PAID_COLOR = '#34d399';
const UNPAID_COLOR = '#f59e0b';

const formatCount = (value) => {
  if (value >= 10000000) return `${(value / 10000000).toFixed(1)}Cr`;
  if (value >= 100000) return `${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return value.toLocaleString();
};

const ChartTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;

  const point = payload[0]?.payload;
  return (
    <div className="rounded-xl border border-white/10 bg-black/85 px-4 py-3 shadow-2xl">
      <div className="text-xs font-semibold uppercase tracking-widest text-gray-400">
        {point.channel}
      </div>
      <div className="mt-2 space-y-1">
        <div className="flex items-center justify-between gap-4 text-sm">
          <span className="text-gray-400">Paid</span>
          <span className="font-medium text-white">{point.paid_count.toLocaleString()}</span>
        </div>
        <div className="flex items-center justify-between gap-4 text-sm">
          <span className="text-gray-400">Unpaid</span>
          <span className="font-medium text-white">{point.unpaid_count.toLocaleString()}</span>
        </div>
        <div className="flex items-center justify-between gap-4 border-t border-white/10 pt-2 text-sm">
          <span className="text-gray-400">Total</span>
          <span className="font-medium text-white">{point.total_count.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
};

export default function LifePaymentRateByTopChannelsChart({ data = [] }) {
  const totals = data.reduce(
    (acc, item) => ({
      paid: acc.paid + (item.paid_count || 0),
      unpaid: acc.unpaid + (item.unpaid_count || 0),
    }),
    { paid: 0, unpaid: 0 }
  );

  return (
    <GlassCard
      title="Payment Rate by Top Channels"
      subtitle="Highest-volume life channels using PMT_FLAG"
      icon={Network}
      className="h-full min-h-[390px]"
    >
      {!data.length ? (
        <div className="flex h-[280px] items-center justify-center rounded-2xl border border-dashed border-white/10 bg-black/10 text-center">
          <div>
            <div className="text-sm font-medium text-white">No channel data available</div>
            <div className="mt-1 text-xs text-gray-400">Try another month selection or ingest more life data.</div>
          </div>
        </div>
      ) : (
        <div className="flex h-full flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PAID_COLOR }} />
              <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Paid</span>
              <span className="text-xs font-medium text-white">{totals.paid.toLocaleString()}</span>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: UNPAID_COLOR }} />
              <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Unpaid</span>
              <span className="text-xs font-medium text-white">{totals.unpaid.toLocaleString()}</span>
            </div>
          </div>

          <div className="h-[220px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data}
                layout="vertical"
                margin={{ top: 0, right: 8, left: 12, bottom: 0 }}
                barCategoryGap={18}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                <XAxis
                  type="number"
                  stroke="rgba(255,255,255,0.35)"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12 }}
                  tickFormatter={formatCount}
                />
                <YAxis
                  type="category"
                  dataKey="channel"
                  stroke="rgba(255,255,255,0.35)"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11 }}
                  width={88}
                />
                <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} content={<ChartTooltip />} />
                <Bar
                  dataKey="paid_count"
                  name="Paid"
                  stackId="payments"
                  radius={[0, 0, 0, 0]}
                  barSize={24}
                  fill={PAID_COLOR}
                />
                <Bar
                  dataKey="unpaid_count"
                  name="Unpaid"
                  stackId="payments"
                  radius={[0, 10, 10, 0]}
                  barSize={24}
                  fill={UNPAID_COLOR}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-1 gap-2">
            {data.slice(0, 3).map((channel) => (
              <div
                key={channel.channel}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold uppercase tracking-widest text-gray-400">
                    {channel.channel}
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    Total {channel.total_count.toLocaleString()}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium text-white">{channel.payment_rate_pct.toFixed(1)}%</div>
                  <div className="text-[10px] uppercase tracking-widest text-gray-500">payment rate</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </GlassCard>
  );
}
