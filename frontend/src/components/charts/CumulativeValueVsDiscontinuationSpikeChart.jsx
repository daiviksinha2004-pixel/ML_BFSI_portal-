import React, { useMemo } from 'react';
import {
  ComposedChart,
  Area,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
  Legend,
} from 'recharts';
import { TrendingUp, AlertTriangle, CalendarDays, DollarSign, BarChart3, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import GlassCard from '../ui/GlassCard';
import { useTheme } from '../../context/ThemeContext';

/* ── Colour Palette ─────────────────────────────────────────────── */
const CUMULATIVE_COLOR = '#6366f1';
const CUMULATIVE_GLOW  = '#818cf8';
const DISC_COLOR       = '#f472b6';
const DISC_LOW         = '#34d399';
const DISC_MED         = '#fbbf24';
const DISC_HIGH        = '#ef4444';

/* ── Formatters ─────────────────────────────────────────────────── */
const formatCurrencyCompact = (value) => {
  if (value == null || isNaN(value)) return '₹0';
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(1)}Cr`;
  if (value >= 100000)   return `₹${(value / 100000).toFixed(1)}L`;
  if (value >= 1000)     return `₹${(value / 1000).toFixed(1)}K`;
  return `₹${value.toFixed(0)}`;
};

const formatCurrencyFull = (value) =>
  `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

const formatCount = (v) => {
  if (v == null || isNaN(v)) return '0';
  if (v >= 100000) return `${(v / 1000).toFixed(0)}K`;
  if (v >= 1000)   return `${(v / 1000).toFixed(1)}K`;
  return v.toLocaleString('en-IN');
};

/* ── Severity-based bar colour ──────────────────────────────────── */
const getDiscBarColor = (count, avgCount) => {
  if (!avgCount || count <= avgCount * 0.8) return DISC_LOW;
  if (count <= avgCount * 1.5) return DISC_MED;
  return DISC_HIGH;
};

/* ── Custom Tooltip ─────────────────────────────────────────────── */
const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;

  return (
    <div className="rounded-xl border border-white/10 bg-black/90 px-5 py-4 shadow-2xl backdrop-blur-xl min-w-[260px]">
      <div className="text-xs font-bold uppercase tracking-widest text-indigo-400 mb-3">
        {label}
      </div>
      <div className="space-y-2.5">
        {/* Cumulative premium */}
        <div className="flex items-center justify-between gap-6 text-sm">
          <span className="flex items-center gap-2 text-gray-400">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CUMULATIVE_COLOR }} />
            Cumulative Premium
          </span>
          <span className="font-semibold text-white">{formatCurrencyFull(point.cumulative_premium)}</span>
        </div>
        {/* Period premium */}
        <div className="flex items-center justify-between gap-6 text-sm">
          <span className="flex items-center gap-2 text-gray-400">
            <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: CUMULATIVE_GLOW }} />
            Period Premium
          </span>
          <span className="font-medium text-white">{formatCurrencyFull(point.premium_sum)}</span>
        </div>
        <div className="border-t border-white/10 pt-2" />
        {/* Discontinuations */}
        <div className="flex items-center justify-between gap-6 text-sm">
          <span className="flex items-center gap-2 text-gray-400">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: DISC_COLOR }} />
            Discontinuations
          </span>
          <span className="font-semibold text-pink-400">{formatCount(point.discontinuation_count)}</span>
        </div>
        {/* Total policies */}
        <div className="flex items-center justify-between gap-6 text-sm">
          <span className="text-gray-400">Total Policies</span>
          <span className="font-medium text-white">{formatCount(point.total_policies)}</span>
        </div>
        {/* Disc rate */}
        {point.total_policies > 0 && (
          <div className="flex items-center justify-between gap-6 text-sm border-t border-white/10 pt-2">
            <span className="text-gray-400">Discontinuation Rate</span>
            <span className={`font-bold ${
              (point.discontinuation_count / point.total_policies) > 0.15
                ? 'text-red-400'
                : 'text-emerald-400'
            }`}>
              {((point.discontinuation_count / point.total_policies) * 100).toFixed(1)}%
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

/* ── Custom Legend ───────────────────────────────────────────────── */
const CustomLegend = ({ isDark }) => (
  <div className="flex flex-wrap items-center justify-center gap-4 mt-2">
    <div className="flex items-center gap-1.5">
      <span className="inline-block h-3 w-6 rounded-sm" style={{ background: `linear-gradient(to bottom, ${CUMULATIVE_COLOR}66, ${CUMULATIVE_COLOR}08)` }} />
      <span className={`text-[11px] font-medium ${isDark ? 'text-gray-400' : 'text-slate-500'}`}>Cumulative Premium</span>
    </div>
    <div className="flex items-center gap-1.5">
      <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: DISC_LOW }} />
      <span className={`text-[11px] font-medium ${isDark ? 'text-gray-400' : 'text-slate-500'}`}>Normal</span>
    </div>
    <div className="flex items-center gap-1.5">
      <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: DISC_MED }} />
      <span className={`text-[11px] font-medium ${isDark ? 'text-gray-400' : 'text-slate-500'}`}>Elevated</span>
    </div>
    <div className="flex items-center gap-1.5">
      <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: DISC_HIGH }} />
      <span className={`text-[11px] font-medium ${isDark ? 'text-gray-400' : 'text-slate-500'}`}>Critical</span>
    </div>
  </div>
);

/* ═══════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════ */
export default function CumulativeValueVsDiscontinuationSpikeChart({
  data = [],
  granularity = 'month',
  onGranularityChange,
}) {
  const { isDark } = useTheme();

  /* ── Derived metrics ──────────────────────────────────────────── */
  const stats = useMemo(() => {
    if (!data.length) return null;

    const totalCumPremium = data[data.length - 1]?.cumulative_premium || 0;
    const totalDisc = data.reduce((s, d) => s + (d.discontinuation_count || 0), 0);
    const totalPolicies = data.reduce((s, d) => s + (d.total_policies || 0), 0);
    const avgDiscPerPeriod = data.length > 0 ? totalDisc / data.length : 0;

    const peak = data.reduce(
      (mx, d) => ((d.discontinuation_count || 0) > (mx.discontinuation_count || 0) ? d : mx),
      data[0]
    );

    // Growth direction: compare last two periods' premium
    const lastPeriodPrem = data.length >= 2 ? data[data.length - 1].premium_sum || 0 : 0;
    const prevPeriodPrem = data.length >= 2 ? data[data.length - 2].premium_sum || 0 : 0;
    const premiumTrend = prevPeriodPrem > 0
      ? (((lastPeriodPrem - prevPeriodPrem) / prevPeriodPrem) * 100).toFixed(1)
      : null;

    // Discontinuation trend
    const lastDisc = data.length >= 2 ? data[data.length - 1].discontinuation_count || 0 : 0;
    const prevDisc = data.length >= 2 ? data[data.length - 2].discontinuation_count || 0 : 0;
    const discTrend = prevDisc > 0
      ? (((lastDisc - prevDisc) / prevDisc) * 100).toFixed(1)
      : null;

    const overallDiscRate = totalPolicies > 0
      ? ((totalDisc / totalPolicies) * 100).toFixed(1)
      : '0.0';

    return {
      totalCumPremium,
      totalDisc,
      totalPolicies,
      avgDiscPerPeriod,
      peak,
      premiumTrend,
      discTrend,
      overallDiscRate,
      lastDisc,
      prevDisc,
    };
  }, [data]);

  /* ── Theme-adaptive colours ───────────────────────────────────── */
  const gridStroke    = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
  const axisStroke    = isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.15)';
  const tickFill      = isDark ? 'rgba(255,255,255,0.5)'  : 'rgba(15,23,42,0.6)';
  const cursorFill    = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)';
  const refLineStroke = isDark ? 'rgba(244,114,182,0.25)' : 'rgba(244,114,182,0.35)';

  return (
    <GlassCard
      title="Cumulative Value vs. Discontinuation Spike"
      subtitle="Premium wealth accumulation contrasted against surrender / lapse volume by vintage"
      icon={TrendingUp}
      className="min-h-[480px]"
    >
      <div className="flex flex-col gap-5">

        {/* ── Controls Row ────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CalendarDays size={14} className="text-gray-500" />
            <span className={`text-xs font-medium ${isDark ? 'text-gray-400' : 'text-slate-500'}`}>Granularity:</span>
            <div className="flex gap-1">
              {['month', 'quarter'].map((g) => (
                <button
                  key={g}
                  onClick={() => onGranularityChange?.(g)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-all duration-200 ${
                    granularity === g
                      ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 shadow-[0_0_8px_rgba(99,102,241,0.15)]'
                      : `${isDark ? 'bg-white/5 text-gray-500 border border-white/10 hover:bg-white/10 hover:text-gray-300' : 'bg-black/5 text-slate-400 border border-black/10 hover:bg-black/10 hover:text-slate-600'}`
                  }`}
                >
                  {g.charAt(0).toUpperCase() + g.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className={`inline-flex items-center gap-2 rounded-full border ${isDark ? 'border-white/10 bg-white/5' : 'border-black/10 bg-black/5'} px-4 py-1.5`}>
              <span className="h-2.5 w-2.5 rounded-full bg-indigo-400" />
              <span className={`text-[11px] font-semibold uppercase tracking-widest ${isDark ? 'text-gray-400' : 'text-slate-500'}`}>
                Cumulative
              </span>
              <span className={`text-sm font-bold ${isDark ? 'text-white' : 'text-slate-800'}`}>
                {formatCurrencyCompact(stats?.totalCumPremium || 0)}
              </span>
            </div>
            <div className={`inline-flex items-center gap-2 rounded-full border ${isDark ? 'border-white/10 bg-white/5' : 'border-black/10 bg-black/5'} px-4 py-1.5`}>
              <span className="h-2.5 w-2.5 rounded-full bg-pink-400" />
              <span className={`text-[11px] font-semibold uppercase tracking-widest ${isDark ? 'text-gray-400' : 'text-slate-500'}`}>
                Disc.
              </span>
              <span className={`text-sm font-bold ${isDark ? 'text-white' : 'text-slate-800'}`}>
                {formatCount(stats?.totalDisc || 0)}
              </span>
            </div>
          </div>
        </div>

        {/* ── Chart Area ──────────────────────────────────────── */}
        {!data.length ? (
          <div className={`flex h-[320px] items-center justify-center rounded-2xl border border-dashed ${isDark ? 'border-white/10 bg-black/10' : 'border-black/10 bg-white/40'} text-center`}>
            <div>
              <div className={`text-sm font-medium ${isDark ? 'text-white' : 'text-slate-700'}`}>No cumulative value data available</div>
              <div className="mt-1 text-xs text-gray-400">
                Try another month selection or ingest more life data.
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="h-[340px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data} margin={{ top: 10, right: 16, left: -8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="cumulativeGradV2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"  stopColor={CUMULATIVE_COLOR} stopOpacity={0.35} />
                      <stop offset="50%" stopColor={CUMULATIVE_COLOR} stopOpacity={0.12} />
                      <stop offset="100%" stopColor={CUMULATIVE_COLOR} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>

                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={gridStroke}
                    vertical={false}
                  />

                  <XAxis
                    dataKey="period_label"
                    stroke={axisStroke}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: tickFill }}
                    interval="preserveStartEnd"
                  />

                  {/* Left Y — Cumulative Premium */}
                  <YAxis
                    yAxisId="left"
                    stroke={axisStroke}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: tickFill }}
                    tickFormatter={formatCurrencyCompact}
                    width={70}
                  />

                  {/* Right Y — Discontinuation Count */}
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    stroke={axisStroke}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: tickFill }}
                    tickFormatter={formatCount}
                    width={50}
                  />

                  {/* Avg discontinuation reference line */}
                  {stats?.avgDiscPerPeriod > 0 && (
                    <ReferenceLine
                      yAxisId="right"
                      y={stats.avgDiscPerPeriod}
                      stroke={refLineStroke}
                      strokeDasharray="6 4"
                      strokeWidth={1.5}
                      label={{
                        value: `Avg: ${formatCount(Math.round(stats.avgDiscPerPeriod))}`,
                        position: 'insideTopRight',
                        fill: isDark ? 'rgba(244,114,182,0.5)' : 'rgba(244,114,182,0.7)',
                        fontSize: 10,
                      }}
                    />
                  )}

                  <Tooltip
                    cursor={{ fill: cursorFill }}
                    content={<ChartTooltip />}
                  />

                  {/* Area — Cumulative premium */}
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="cumulative_premium"
                    stroke={CUMULATIVE_COLOR}
                    strokeWidth={2.5}
                    fill="url(#cumulativeGradV2)"
                    dot={false}
                    activeDot={{
                      r: 5,
                      fill: CUMULATIVE_COLOR,
                      stroke: isDark ? '#0f0f23' : '#ffffff',
                      strokeWidth: 2,
                    }}
                    name="Cumulative Premium"
                  />

                  {/* Bars — Discontinuations with severity-based colours */}
                  <Bar
                    yAxisId="right"
                    dataKey="discontinuation_count"
                    radius={[4, 4, 0, 0]}
                    barSize={data.length > 20 ? 12 : 20}
                    name="Discontinuations"
                  >
                    {data.map((entry, idx) => (
                      <Cell
                        key={`disc-${idx}`}
                        fill={getDiscBarColor(entry.discontinuation_count || 0, stats?.avgDiscPerPeriod || 0)}
                        fillOpacity={0.85}
                      />
                    ))}
                  </Bar>
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Custom Legend */}
            <CustomLegend isDark={isDark} />

            {/* ── Summary Stat Cards ────────────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {/* Total Cumulative Premium */}
              <div className={`rounded-xl border ${isDark ? 'border-white/10 bg-white/5' : 'border-black/8 bg-white/60'} px-4 py-3 relative overflow-hidden`}>
                <div className="absolute top-0 left-0 h-full w-1 rounded-l-xl bg-indigo-500" />
                <div className="ml-2">
                  <div className="flex items-center gap-1.5">
                    <DollarSign size={12} className="text-indigo-400" />
                    <div className={`text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-gray-400' : 'text-slate-500'}`}>
                      Cumulative Premium
                    </div>
                  </div>
                  <div className={`mt-2 text-xl font-semibold leading-none ${isDark ? 'text-white' : 'text-slate-800'}`}>
                    {formatCurrencyCompact(stats?.totalCumPremium || 0)}
                  </div>
                  {stats?.premiumTrend != null && (
                    <div className={`mt-1.5 flex items-center gap-1 text-[11px] font-semibold ${
                      Number(stats.premiumTrend) >= 0 ? 'text-emerald-400' : 'text-red-400'
                    }`}>
                      {Number(stats.premiumTrend) >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                      {Math.abs(Number(stats.premiumTrend))}% vs prev
                    </div>
                  )}
                </div>
              </div>

              {/* Peak Discontinuation */}
              <div className={`rounded-xl border ${isDark ? 'border-white/10 bg-white/5' : 'border-black/8 bg-white/60'} px-4 py-3 relative overflow-hidden`}>
                <div className="absolute top-0 left-0 h-full w-1 rounded-l-xl bg-pink-500" />
                <div className="ml-2">
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle size={12} className="text-pink-400" />
                    <div className={`text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-gray-400' : 'text-slate-500'}`}>
                      Peak Discontinuation
                    </div>
                  </div>
                  <div className={`mt-2 text-base font-semibold ${isDark ? 'text-white' : 'text-slate-800'}`}>
                    {stats?.peak?.period_label || 'N/A'}
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    {formatCount(stats?.peak?.discontinuation_count || 0)} policies
                  </div>
                </div>
              </div>

              {/* Overall Disc Rate */}
              <div className={`rounded-xl border ${isDark ? 'border-white/10 bg-white/5' : 'border-black/8 bg-white/60'} px-4 py-3 relative overflow-hidden`}>
                <div className="absolute top-0 left-0 h-full w-1 rounded-l-xl bg-amber-500" />
                <div className="ml-2">
                  <div className="flex items-center gap-1.5">
                    <BarChart3 size={12} className="text-amber-400" />
                    <div className={`text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-gray-400' : 'text-slate-500'}`}>
                      Disc. Rate
                    </div>
                  </div>
                  <div className={`mt-2 text-xl font-semibold leading-none ${
                    Number(stats?.overallDiscRate || 0) > 15 ? 'text-red-400' : isDark ? 'text-white' : 'text-slate-800'
                  }`}>
                    {stats?.overallDiscRate || '0.0'}%
                  </div>
                  {stats?.discTrend != null && (
                    <div className={`mt-1.5 flex items-center gap-1 text-[11px] font-semibold ${
                      Number(stats.discTrend) <= 0 ? 'text-emerald-400' : 'text-red-400'
                    }`}>
                      {Number(stats.discTrend) <= 0 ? <ArrowDownRight size={12} /> : <ArrowUpRight size={12} />}
                      {Math.abs(Number(stats.discTrend))}% vs prev
                    </div>
                  )}
                </div>
              </div>

              {/* Total Policies */}
              <div className={`rounded-xl border ${isDark ? 'border-white/10 bg-white/5' : 'border-black/8 bg-white/60'} px-4 py-3 relative overflow-hidden`}>
                <div className="absolute top-0 left-0 h-full w-1 rounded-l-xl bg-teal-500" />
                <div className="ml-2">
                  <div className={`text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-gray-400' : 'text-slate-500'}`}>
                    Total Policies
                  </div>
                  <div className={`mt-2 text-xl font-semibold leading-none ${isDark ? 'text-white' : 'text-slate-800'}`}>
                    {formatCount(stats?.totalPolicies || 0)}
                  </div>
                  <div className="mt-1.5 text-xs text-gray-500">
                    Across {data.length} periods
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </GlassCard>
  );
}
