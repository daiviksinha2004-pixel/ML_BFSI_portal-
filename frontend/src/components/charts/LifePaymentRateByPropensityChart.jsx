import React from 'react';
import { BarChart3 } from 'lucide-react';
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
        {point.propensity}
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

export default function LifePaymentRateByPropensityChart({ data = [] }) {
  const totals = data.reduce(
    (acc, item) => ({
      paid: acc.paid + (item.paid_count || 0),
      unpaid: acc.unpaid + (item.unpaid_count || 0),
    }),
    { paid: 0, unpaid: 0 }
  );

  return (
    <GlassCard
      title="Payment Rate by Propensity Segment"
      subtitle="Paid and unpaid policy counts grouped by propensity band"
      icon={BarChart3}
      className="min-h-[380px]"
    >
      {!data.length ? (
        <div className="flex h-[300px] items-center justify-center rounded-2xl border border-dashed border-white/10 bg-black/10 text-center">
          <div>
            <div className="text-sm font-medium text-white">No propensity chart data available</div>
            <div className="mt-1 text-xs text-gray-400">Try another month selection or ingest more life data.</div>
          </div>
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
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

          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data} margin={{ top: 10, right: 10, left: -16, bottom: 0 }} barCategoryGap={28}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis
                dataKey="propensity"
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
              <Tooltip
                cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                content={<ChartTooltip />}
              />
              <Bar
                dataKey="paid_count"
                name="Paid"
                stackId="payments"
                radius={[0, 0, 10, 10]}
                barSize={48}
                fill={PAID_COLOR}
              />
              <Bar
                dataKey="unpaid_count"
                name="Unpaid"
                stackId="payments"
                radius={[10, 10, 0, 0]}
                barSize={48}
                fill={UNPAID_COLOR}
              />
            </BarChart>
          </ResponsiveContainer>

          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {data.map((segment) => (
              <div
                key={segment.propensity}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
              >
                <div className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">
                  {segment.propensity}
                </div>
                <div className="mt-2 flex items-end justify-between gap-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-gray-500">Paid</div>
                    <div className="text-lg font-light text-white">
                      {segment.paid_count.toLocaleString()}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-widest text-gray-500">Unpaid</div>
                    <div className="text-lg font-light text-white">
                      {segment.unpaid_count.toLocaleString()}
                    </div>
                  </div>
                </div>
                <div className="mt-2 text-xs text-gray-400">
                  Total {segment.total_count.toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </GlassCard>
  );
}
