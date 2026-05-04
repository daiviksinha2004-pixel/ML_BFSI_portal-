import React, { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TrendingDown, Calendar, CalendarDays, AlertTriangle } from 'lucide-react';
import GlassCard from '../ui/GlassCard';

const FREQUENCY_COLORS = {
  Annual: '#22d3ee',      // Cyan
  Quarterly: '#a78bfa',   // Purple
  'Half-Yearly': '#f472b6', // Pink
  Monthly: '#f59e0b',     // Amber
};

const formatCount = (v) => {
  if (v == null || isNaN(v)) return '0';
  if (v >= 1000) return `${(v / 1000).toFixed(1)}K`;
  return v.toLocaleString();
};

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-xl border border-white/10 bg-black/90 px-5 py-4 shadow-2xl backdrop-blur-xl min-w-[220px]">
      <div className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">
        {label}
      </div>
      <div className="space-y-2">
        {payload.map((entry) => (
          <div key={entry.dataKey} className="flex items-center justify-between gap-4 text-sm">
            <span className="flex items-center gap-2 text-gray-400">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              {entry.dataKey}
            </span>
            <span className="font-semibold text-white">
              {formatCount(entry.value)} lapses
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default function LapseHazardCurveByPaymentFrequencyChart({ data = [], granularity = 'month', onGranularityChange, pmtFilter = 'all', onPmtFilterChange }) {
  const [visibleLines, setVisibleLines] = useState({
    Annual: true,
    Quarterly: true,
    'Half-Yearly': true,
    Monthly: true,
  });

  const toggleLine = (key) => {
    setVisibleLines((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Calculate totals per frequency
  const frequencyTotals = data.reduce((acc, item) => {
    Object.keys(FREQUENCY_COLORS).forEach((freq) => {
      acc[freq] = (acc[freq] || 0) + (item[freq] || 0);
    });
    return acc;
  }, {});

  // Find peak lapse period
  const peakPeriod = data.length > 0
    ? data.reduce((max, item) => {
        const totalLapses = Object.keys(FREQUENCY_COLORS).reduce(
          (sum, freq) => sum + (item[freq] || 0),
          0
        );
        const maxTotal = Object.keys(FREQUENCY_COLORS).reduce(
          (sum, freq) => sum + (max[freq] || 0),
          0
        );
        return totalLapses > maxTotal ? item : max;
      }, data[0])
    : null;

  return (
    <GlassCard
      title="Lapse Hazard Curve by Payment Frequency"
      subtitle="Policy failure rate split by payment mode (Annual, Quarterly, Half-Yearly, Monthly)"
      icon={TrendingDown}
      className="min-h-[440px]"
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

          {/* Payment Status Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-400">Payment:</span>
            <div className="flex gap-1">
              {['all', 'paid', 'unpaid'].map((p) => (
                <button
                  key={p}
                  onClick={() => onPmtFilterChange?.(p)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-all duration-200 ${
                    pmtFilter === p
                      ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 shadow-[0_0_8px_rgba(99,102,241,0.15)]'
                      : 'bg-white/5 text-gray-500 border border-white/10 hover:bg-white/10 hover:text-gray-300'
                  }`}
                >
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Frequency Toggle Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {Object.entries(FREQUENCY_COLORS).map(([freq, color]) => (
              <button
                key={freq}
                onClick={() => toggleLine(freq)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                  visibleLines[freq]
                    ? 'bg-white/10 text-white border border-white/20 shadow-sm'
                    : 'bg-white/5 text-gray-600 border border-white/10 opacity-50'
                }`}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: color }}
                />
                {freq}
              </button>
            ))}
          </div>
        </div>

        {!data.length ? (
          <div className="flex h-[300px] items-center justify-center rounded-2xl border border-dashed border-white/10 bg-black/10 text-center">
            <div>
              <div className="text-sm font-medium text-white">No lapse hazard data available</div>
              <div className="mt-1 text-xs text-gray-400">
                Try another month selection or ingest more life data.
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 10, right: 20, left: -16, bottom: 0 }}>
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
                    tickFormatter={formatCount}
                  />
                  <Tooltip cursor={{ fill: 'rgba(255,255,255,0.03)' }} content={<ChartTooltip />} />
                  <Legend
                    verticalAlign="top"
                    height={0}
                    content={() => null}
                  />
                  {visibleLines.Annual && (
                    <Line
                      type="monotone"
                      dataKey="Annual"
                      stroke={FREQUENCY_COLORS.Annual}
                      strokeWidth={2.5}
                      dot={{ r: 4, fill: FREQUENCY_COLORS.Annual, strokeWidth: 2 }}
                      activeDot={{ r: 6, fill: FREQUENCY_COLORS.Annual, strokeWidth: 2 }}
                    />
                  )}
                  {visibleLines.Quarterly && (
                    <Line
                      type="monotone"
                      dataKey="Quarterly"
                      stroke={FREQUENCY_COLORS.Quarterly}
                      strokeWidth={2.5}
                      dot={{ r: 4, fill: FREQUENCY_COLORS.Quarterly, strokeWidth: 2 }}
                      activeDot={{ r: 6, fill: FREQUENCY_COLORS.Quarterly, strokeWidth: 2 }}
                    />
                  )}
                  {visibleLines['Half-Yearly'] && (
                    <Line
                      type="monotone"
                      dataKey="Half-Yearly"
                      stroke={FREQUENCY_COLORS['Half-Yearly']}
                      strokeWidth={2.5}
                      dot={{ r: 4, fill: FREQUENCY_COLORS['Half-Yearly'], strokeWidth: 2 }}
                      activeDot={{ r: 6, fill: FREQUENCY_COLORS['Half-Yearly'], strokeWidth: 2 }}
                    />
                  )}
                  {visibleLines.Monthly && (
                    <Line
                      type="monotone"
                      dataKey="Monthly"
                      stroke={FREQUENCY_COLORS.Monthly}
                      strokeWidth={2.5}
                      dot={{ r: 4, fill: FREQUENCY_COLORS.Monthly, strokeWidth: 2 }}
                      activeDot={{ r: 6, fill: FREQUENCY_COLORS.Monthly, strokeWidth: 2 }}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={14} className="text-amber-400" />
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                    Peak Period
                  </div>
                </div>
                <div className="mt-2 text-sm font-medium text-white">
                  {peakPeriod?.period_label || 'N/A'}
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  {formatCount(
                    Object.keys(FREQUENCY_COLORS).reduce(
                      (sum, freq) => sum + (peakPeriod?.[freq] || 0),
                      0
                    )
                  )}{' '}
                  total lapses
                </div>
              </div>

              {Object.entries(FREQUENCY_COLORS).map(([freq, color]) => (
                <div
                  key={freq}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-3"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                      {freq}
                    </div>
                  </div>
                  <div className="mt-2 text-lg font-semibold text-white">
                    {formatCount(frequencyTotals[freq] || 0)}
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    Total lapses
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </GlassCard>
  );
}
