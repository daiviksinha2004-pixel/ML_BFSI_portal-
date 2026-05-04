import React, { useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, Calendar, CalendarDays } from 'lucide-react';
import GlassCard from '../ui/GlassCard';

const AREA_COLOR = '#6366f1';
const AREA_GRADIENT_START = 'rgba(99, 102, 241, 0.4)';
const AREA_GRADIENT_END = 'rgba(99, 102, 241, 0.02)';

const formatCurrencyCompact = (value) => {
  if (value == null || isNaN(value)) return '₹0';
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(1)}Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `₹${(value / 1000).toFixed(1)}K`;
  return `₹${value.toFixed(0)}`;
};

const formatCurrencyFull = (value) =>
  `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

const ChartTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;

  const point = payload[0]?.payload;
  return (
    <div className="rounded-xl border border-white/10 bg-black/90 px-5 py-4 shadow-2xl backdrop-blur-xl min-w-[200px]">
      <div className="text-xs font-bold uppercase tracking-widest text-indigo-400">
        {point.period_label}
      </div>
      <div className="mt-3 space-y-2">
        <div className="flex items-center justify-between gap-6 text-sm">
          <span className="text-gray-400">Premium Collected</span>
          <span className="font-semibold text-white">{formatCurrencyFull(point.premium)}</span>
        </div>
        {point.policy_count != null && (
          <div className="flex items-center justify-between gap-6 text-sm border-t border-white/10 pt-2">
            <span className="text-gray-400">Policies</span>
            <span className="font-medium text-white">{Number(point.policy_count).toLocaleString('en-IN')}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default function PremiumCashFlowTrajectoryChart({ data = [], granularity = 'month', onGranularityChange }) {
  const totalPremium = data.reduce((acc, item) => acc + (item.premium || 0), 0);
  const totalPolicies = data.reduce((acc, item) => acc + (item.policy_count || 0), 0);

  // Find peak period
  const peakPeriod = data.length > 0 ? data.reduce((max, item) => 
    item.premium > max.premium ? item : max, data[0]
  ) : null;

  return (
    <GlassCard
      title="Premium Cash Flow Trajectory"
      subtitle="Revenue curve tracking actual liquidity and premium collection velocity"
      icon={TrendingUp}
      className="min-h-[420px]"
    >
      <div className="flex flex-col gap-5">

        {/* Controls Row */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CalendarDays size={14} className="text-gray-500" />
            <span className="text-xs font-medium text-gray-400">Granularity:</span>
            <div className="flex gap-1">
              {['month', 'quarter'].map((g) => (
                <button
                  key={g}
                  onClick={() => onGranularityChange?.(g)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-all duration-200 ${
                    granularity === g
                      ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 shadow-[0_0_8px_rgba(99,102,241,0.15)]'
                      : 'bg-white/5 text-gray-500 border border-white/10 hover:bg-white/10 hover:text-gray-300'
                  }`}
                >
                  {g.charAt(0).toUpperCase() + g.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-indigo-400 animate-pulse" />
            <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">
              Total
            </span>
            <span className="text-sm font-bold text-white">
              {formatCurrencyCompact(totalPremium)}
            </span>
          </div>
        </div>

        {!data.length ? (
          <div className="flex h-[300px] items-center justify-center rounded-2xl border border-dashed border-white/10 bg-black/10 text-center">
            <div>
              <div className="text-sm font-medium text-white">No cash flow data available</div>
              <div className="mt-1 text-xs text-gray-400">
                Try another month selection or ingest more life data.
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 10, right: 20, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="premiumGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={AREA_GRADIENT_START} />
                      <stop offset="95%" stopColor={AREA_GRADIENT_END} />
                    </linearGradient>
                    <linearGradient id="glowGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={AREA_COLOR} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={AREA_COLOR} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgba(255,255,255,0.05)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="period_label"
                    stroke="rgba(255,255,255,0.35)"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis
                    stroke="rgba(255,255,255,0.35)"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12 }}
                    tickFormatter={formatCurrencyCompact}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                    content={<ChartTooltip />}
                  />
                  <Area
                    type="monotone"
                    dataKey="premium"
                    stroke={AREA_COLOR}
                    strokeWidth={2.5}
                    fill="url(#premiumGradient)"
                    dot={{ r: 4, fill: AREA_COLOR, strokeWidth: 2 }}
                    activeDot={{ r: 6, fill: AREA_COLOR, strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Calendar size={14} className="text-indigo-400" />
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                    Peak Period
                  </div>
                </div>
                <div className="mt-2 text-sm font-medium text-white">
                  {peakPeriod?.period_label || 'N/A'}
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  {formatCurrencyCompact(peakPeriod?.premium || 0)}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                  Total Premium
                </div>
                <div className="mt-2 text-lg font-semibold text-white">
                  {formatCurrencyCompact(totalPremium)}
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  Across {data.length} periods
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                  Total Policies
                </div>
                <div className="mt-2 text-lg font-semibold text-white">
                  {totalPolicies.toLocaleString('en-IN')}
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  Premium collection velocity
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </GlassCard>
  );
}
