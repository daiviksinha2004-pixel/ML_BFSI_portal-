import React, { useMemo, useState } from 'react';
import { useTheme } from '../../context/ThemeContext';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { TrendingUp, Filter, ChevronDown, ChevronUp } from 'lucide-react';
import GlassCard from '../ui/GlassCard';

/* ── Colour Palette ─────────────────────────────────────────────── */
const BAR_GRADIENT = [
  '#34d399', '#2dd4bf', '#38bdf8', '#818cf8',
  '#a78bfa', '#c084fc', '#f472b6', '#fb923c',
  '#fbbf24', '#a3e635', '#4ade80', '#22d3ee',
];

const getBarColor = (index) => BAR_GRADIENT[index % BAR_GRADIENT.length];

/* ── Currency Formatting ────────────────────────────────────────── */
const formatCurrencyCompact = (value) => {
  if (value == null || isNaN(value)) return '₹0';
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(1)}Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `₹${(value / 1000).toFixed(1)}K`;
  return `₹${value.toFixed(0)}`;
};

const formatCurrencyFull = (value) =>
  `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

/* ── Tooltip ────────────────────────────────────────────────────── */
const ChartTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  const pct = point._sharePercent;

  return (
    <div className="rounded-xl border border-white/10 bg-black/90 px-5 py-4 shadow-2xl backdrop-blur-xl min-w-[200px]">
      <div className="text-xs font-bold uppercase tracking-widest text-teal-400">
        {point.channel}
      </div>
      <div className="mt-3 space-y-2">
        <div className="flex items-center justify-between gap-6 text-sm">
          <span className="text-gray-400">Premium Collected</span>
          <span className="font-semibold text-white">{formatCurrencyFull(point.premium)}</span>
        </div>
        <div className="flex items-center justify-between gap-6 text-sm">
          <span className="text-gray-400">Market Share</span>
          <span className="font-semibold text-teal-400">{pct}%</span>
        </div>
        {point.paid_premium != null && (
          <div className="flex items-center justify-between gap-6 text-sm border-t border-white/10 pt-2">
            <span className="text-gray-400">Paid Premium</span>
            <span className="font-medium text-emerald-400">{formatCurrencyFull(point.paid_premium)}</span>
          </div>
        )}
        {point.unpaid_premium != null && (
          <div className="flex items-center justify-between gap-6 text-sm">
            <span className="text-gray-400">Unpaid Premium</span>
            <span className="font-medium text-red-400">{formatCurrencyFull(point.unpaid_premium)}</span>
          </div>
        )}
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

/* ── Custom Y-Axis Tick ─────────────────────────────────────────── */
const CustomYAxisTick = ({ x, y, payload, data, isDark }) => {
  const item = data?.find(d => d.channel === payload.value);
  const rank = item?._rank;
  const rankFill = isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.3)';
  const labelFill = isDark ? 'rgba(255,255,255,0.7)' : 'rgba(15,23,42,0.85)';

  return (
    <g transform={`translate(${x},${y})`}>
      {rank && (
        <text x={-130} y={4} textAnchor="start" fill={rankFill} fontSize={10} fontWeight={700}>
          #{rank}
        </text>
      )}
      <text x={-5} y={4} textAnchor="end" fill={labelFill} fontSize={11} fontWeight={500}>
        {payload.value?.length > 14 ? payload.value.slice(0, 14) + '…' : payload.value}
      </text>
    </g>
  );
};

/* ── Main Component ─────────────────────────────────────────────── */
export default function SourcingChannelPerformanceChart({ data = [], pmtFilter = 'all', onPmtFilterChange }) {
  const { isDark } = useTheme();
  const [showAll, setShowAll] = useState(false);
  const TOP_N = 10;

  /* Enrich data with rank and share % */
  const enrichedData = useMemo(() => {
    if (!data.length) return [];
    const totalPremium = data.reduce((acc, d) => acc + (d.premium || 0), 0);
    return data
      .filter(d => d.channel && d.premium > 0)
      .sort((a, b) => b.premium - a.premium)
      .map((d, i) => ({
        ...d,
        _rank: i + 1,
        _sharePercent: totalPremium > 0 ? ((d.premium / totalPremium) * 100).toFixed(1) : '0.0',
      }));
  }, [data]);

  const displayedData = showAll ? enrichedData : enrichedData.slice(0, TOP_N);
  const hiddenCount = Math.max(0, enrichedData.length - TOP_N);

  const totalPremium = enrichedData.reduce((acc, d) => acc + (d.premium || 0), 0);
  const topChannelCount = Math.min(enrichedData.length, 3);
  const topChannelPremium = enrichedData.slice(0, 3).reduce((acc, d) => acc + (d.premium || 0), 0);
  const topChannelShare = totalPremium > 0 ? ((topChannelPremium / totalPremium) * 100).toFixed(0) : 0;

  /* Dynamic chart height based on bar count */
  const chartHeight = Math.max(300, displayedData.length * 38 + 40);

  return (
    <GlassCard
      title="Sourcing Channel Performance"
      subtitle={`Premium by distribution channel — Top ${topChannelCount} channels hold ${topChannelShare}% share`}
      icon={TrendingUp}
      className="min-h-[420px]"
    >
      <div className="flex flex-col gap-5">

        {/* ── Controls Row ────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-3">

          {/* PMT Filter Pills */}
          <div className="flex items-center gap-2">
            <Filter size={14} className="text-gray-500" />
            <span className="text-xs font-medium text-gray-400">Payment Status:</span>
            <div className="flex gap-1">
              {['all', 'paid', 'unpaid'].map((filter) => (
                <button
                  key={filter}
                  onClick={() => onPmtFilterChange?.(filter)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-all duration-200 ${
                    pmtFilter === filter
                      ? 'bg-teal-500/20 text-teal-400 border border-teal-500/30 shadow-[0_0_8px_rgba(45,212,191,0.15)]'
                      : 'bg-white/5 text-gray-500 border border-white/10 hover:bg-white/10 hover:text-gray-300'
                  }`}
                >
                  {filter.charAt(0).toUpperCase() + filter.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Aggregate Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-teal-400 animate-pulse" />
            <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">
              Total
            </span>
            <span className="text-sm font-bold text-white">
              {formatCurrencyCompact(totalPremium)}
            </span>
          </div>
        </div>

        {/* ── Chart Area ──────────────────────────────────────── */}
        {!enrichedData.length ? (
          <div className="flex h-[260px] items-center justify-center rounded-2xl border border-dashed border-white/10 bg-black/10 text-center">
            <div>
              <div className="text-sm font-medium text-white">No channel data available</div>
              <div className="mt-1 text-xs text-gray-400">
                Try another month selection or ingest more life data.
              </div>
            </div>
          </div>
        ) : (
          <div style={{ height: chartHeight }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={displayedData}
                layout="vertical"
                margin={{ top: 4, right: 60, left: 140, bottom: 4 }}
                barCategoryGap="20%"
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke={isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)'}
                  horizontal={false}
                />
                <XAxis
                  type="number"
                  stroke={isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.15)'}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(15,23,42,0.6)' }}
                  tickFormatter={formatCurrencyCompact}
                />
                <YAxis
                  type="category"
                  dataKey="channel"
                  stroke={isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.15)'}
                  tickLine={false}
                  axisLine={false}
                  width={140}
                  tick={<CustomYAxisTick data={displayedData} isDark={isDark} />}
                />
                <Tooltip
                  cursor={{ fill: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)' }}
                  content={<ChartTooltip />}
                />
                <Bar
                  dataKey="premium"
                  name="Premium"
                  radius={[0, 8, 8, 0]}
                  barSize={22}
                  label={{
                    position: 'right',
                    formatter: (val) => formatCurrencyCompact(val),
                    fill: isDark ? 'rgba(255,255,255,0.6)' : 'rgba(15,23,42,0.7)',
                    fontSize: 10,
                  }}
                >
                  {displayedData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={getBarColor(index)}
                      fillOpacity={0.85}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* ── Show More / Show Less toggle ─────────────────── */}
        {hiddenCount > 0 && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="mx-auto flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium text-gray-400 transition-all hover:bg-white/10 hover:text-white"
          >
            {showAll ? (
              <>Show Top {TOP_N} Only <ChevronUp size={14} /></>
            ) : (
              <>Show All {enrichedData.length} Channels <ChevronDown size={14} /></>
            )}
          </button>
        )}

        {/* ── Top Channels Summary Cards ──────────────────── */}
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {enrichedData.slice(0, 4).map((channel, idx) => (
            <div
              key={channel.channel}
              className="group relative overflow-hidden rounded-xl border border-white/10 bg-white/5 px-4 py-3 transition-all duration-300 hover:bg-white/[0.08] hover:border-white/15"
            >
              {/* Accent bar */}
              <div
                className="absolute left-0 top-0 h-full w-1 rounded-l-xl"
                style={{ backgroundColor: getBarColor(idx) }}
              />

              <div className="ml-2">
                <div className="flex items-center justify-between">
                  <div className="truncate text-[10px] font-bold uppercase tracking-widest text-gray-400">
                    {channel.channel}
                  </div>
                  <div
                    className="rounded-md px-1.5 py-0.5 text-[10px] font-bold"
                    style={{
                      backgroundColor: `${getBarColor(idx)}20`,
                      color: getBarColor(idx),
                    }}
                  >
                    {channel._sharePercent}%
                  </div>
                </div>
                <div className="mt-2 text-lg font-semibold text-white leading-none">
                  {formatCurrencyCompact(channel.premium)}
                </div>
                {channel.policy_count != null && (
                  <div className="mt-1 text-[10px] text-gray-500">
                    {Number(channel.policy_count).toLocaleString('en-IN')} policies
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </GlassCard>
  );
}
