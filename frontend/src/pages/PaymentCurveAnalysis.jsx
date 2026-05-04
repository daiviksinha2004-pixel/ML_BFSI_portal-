import React, { useEffect, useState, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
  AreaChart, Area,
  LineChart, Line,
} from 'recharts';
import { TrendingUp, Activity, PieChart as PieIcon, BarChart3, Clock, Loader2, Calendar, Filter, X, MapPin, Box, Layers } from 'lucide-react';
import api from '../api';
import { useDomain } from '../context/DomainContext';
import GlassCard from '../components/ui/GlassCard';
import FuturisticDateFilter from '../components/ui/FuturisticDateFilter';
import PremiumCashFlowTrajectoryChart from '../components/charts/PremiumCashFlowTrajectoryChart';
import LapseHazardCurveByPaymentFrequencyChart from '../components/charts/LapseHazardCurveByPaymentFrequencyChart';
import CumulativeValueVsDiscontinuationSpikeChart from '../components/charts/CumulativeValueVsDiscontinuationSpikeChart';

const COLORS = {
  paid: '#34d399',
  unpaid: '#f59e0b',
  accent: '#818cf8',
  area: '#6366f1',
  line: '#22d3ee',
  bands: ['#6366f1', '#818cf8', '#a78bfa', '#c084fc', '#e879f9', '#f472b6', '#fb923c', '#facc15'],
};

const formatCount = (v) => {
  if (v >= 10_000_000) return `${(v / 10_000_000).toFixed(1)}Cr`;
  if (v >= 100_000) return `${(v / 100_000).toFixed(1)}L`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return v.toLocaleString();
};

/* ─── Shared Tooltip Component ─────────────────────────────────── */
const GlassTooltip = ({ active, payload, labelKey, fields }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div className="rounded-xl border border-white/10 bg-black/90 px-4 py-3 shadow-2xl backdrop-blur-md">
      <div className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">
        {d[labelKey]}
      </div>
      <div className="space-y-1">
        {fields.map(({ key, label, color }) => (
          <div key={key} className="flex items-center justify-between gap-6 text-sm">
            <span className="flex items-center gap-2 text-gray-400">
              {color && <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} />}
              {label}
            </span>
            <span className="font-medium text-white">
              {typeof d[key] === 'number' ? d[key].toLocaleString() : d[key]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ─── KPI Summary Card ────────────────────────────────────────── */
const KpiMini = ({ label, value, sub, icon: Icon }) => (
  <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4 backdrop-blur-md">
    <div className="flex items-center gap-2 mb-1">
      {Icon && <Icon size={14} className="text-indigo-400" />}
      <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">{label}</span>
    </div>
    <div className="text-2xl font-light text-white">{value}</div>
    {sub && <div className="mt-1 text-xs text-gray-500">{sub}</div>}
  </div>
);

/* ═══════════════════════════════════════════════════════════════ */
/*                    MAIN PAGE COMPONENT                         */
/* ═══════════════════════════════════════════════════════════════ */

const PaymentCurveAnalysisLife = () => {
  const { theme } = useDomain();

  const [months, setMonths] = useState([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [loading, setLoading] = useState(true);

  // Filter options + active filters
  const [filterOptions, setFilterOptions] = useState({ product_types: [], product_groups: [], states: [] });
  const [productType, setProductType]   = useState('');
  const [state, setState]               = useState('');

  // Chart data state
  const [lapseAgingData, setLapseAgingData] = useState([]);
  const [pmtFlagData, setPmtFlagData]       = useState([]);
  const [trendData, setTrendData]           = useState([]);
  const [distributionData, setDistributionData] = useState({ summary: {}, distribution: [] });
  const [policyAgingData, setPolicyAgingData]   = useState([]);
  const [propensityData, setPropensityData]     = useState([]);
  const [premiumCashFlowData, setPremiumCashFlowData] = useState([]);
  const [cashFlowGranularity, setCashFlowGranularity] = useState('month');
  const [lapseHazardData, setLapseHazardData] = useState([]);
  const [lapseHazardGranularity, setLapseHazardGranularity] = useState('month');
  const [lapseHazardPmtFilter, setLapseHazardPmtFilter] = useState('all');
  const [cumulativeValueData, setCumulativeValueData] = useState([]);
  const [cumulativeValueGranularity, setCumulativeValueGranularity] = useState('month');

  const token = localStorage.getItem('access_token');
  const authHeader = { Authorization: `Bearer ${token}` };

  /* ── Fetch filter options once ──────────────────────────────── */
  useEffect(() => {
    (async () => {
      try {
        const [monthsRes, filtersRes] = await Promise.all([
          api.get('/life-kpis/months',        { headers: authHeader }),
          api.get('/payment-curve/filters',   { headers: authHeader }),
        ]);
        setMonths(monthsRes.data || []);
        setFilterOptions(filtersRes.data || { product_types: [], product_groups: [], states: [] });
      } catch (e) {
        console.error('Failed to fetch filter options', e);
      }
    })();
  }, []);

  const clearFilters = () => { setProductType(''); setState(''); };
  const hasActiveFilters = productType || state;

  /* ── Fetch charts when any filter changes ───────────────────── */
  const fetchCharts = useCallback(async () => {
    setLoading(true);
    const params = {};
    if (selectedDate)  params.dataset_month  = `${selectedDate}-01`;
    if (productType)    params.product_type   = productType;
    if (state)          params.state          = state;

    const cfg      = { headers: authHeader, params };
    // trend ignores dataset_month but keeps dimension filters
    const trendParams = { ...params };
    delete trendParams.dataset_month;
    const trendCfg = { headers: authHeader, params: trendParams };

    try {
      const [lapseRes, pmtRes, trendRes, distRes, policyAgingRes, propensityRes, cashFlowRes] = await Promise.all([
        api.get('/payment-curve/payment-rate-by-lapse-aging',    cfg),
        api.get('/payment-curve/policy-count-by-pmt-flag',       cfg),
        api.get('/payment-curve/payment-rate-trend',             trendCfg),
        api.get('/payment-curve/lapse-aging-distribution',       cfg),
        api.get('/payment-curve/policy-count-by-policy-aging',   cfg),
        api.get('/payment-curve/payment-curve-by-propensity',    cfg),
        api.get('/analytics/life_insurance/premium-cash-flow-trajectory', {
          headers: authHeader,
          params: {
            ...(selectedDate ? { dataset_month: `${selectedDate}-01` } : {}),
            granularity: cashFlowGranularity
          }
        }),
      ]);
      setLapseAgingData(lapseRes.data?.series || []);
      setPmtFlagData(pmtRes.data?.series || []);
      setTrendData(trendRes.data?.series || []);
      setDistributionData({
        summary:      distRes.data?.summary      || {},
        distribution: distRes.data?.distribution || [],
      });
      setPolicyAgingData(policyAgingRes.data?.series || []);
      setPropensityData(propensityRes.data?.series || []);
      setPremiumCashFlowData(cashFlowRes.data?.data || []);
    } catch (e) {
      console.error('Payment curve fetch error', e);
    } finally {
      setLoading(false);
    }
  }, [selectedDate, productType, state, cashFlowGranularity]);

  /* ── Fetch lapse hazard data separately when pmt_filter changes ── */
  useEffect(() => {
    (async () => {
      const params = {};
      if (selectedDate) params.dataset_month = `${selectedDate}-01`;
      if (productType) params.product_type = productType;
      if (state) params.state = state;

      try {
        const res = await api.get('/analytics/life_insurance/lapse-hazard-curve-by-payment-frequency', {
          headers: authHeader,
          params: {
            ...params,
            granularity: lapseHazardGranularity,
            pmt_filter: lapseHazardPmtFilter
          }
        });
        setLapseHazardData(res.data?.data || []);
      } catch (e) {
        console.error('Lapse hazard fetch error', e);
      }
    })();
  }, [lapseHazardPmtFilter, lapseHazardGranularity, selectedDate, productType, state]);

  /* ── Fetch cumulative value data separately when granularity changes ── */
  useEffect(() => {
    (async () => {
      const params = {};
      if (selectedDate) params.dataset_month = `${selectedDate}-01`;
      if (productType) params.product_type = productType;
      if (state) params.state = state;

      try {
        const res = await api.get('/analytics/life_insurance/cumulative-value-vs-discontinuation-spike', {
          headers: authHeader,
          params: {
            ...params,
            granularity: cumulativeValueGranularity
          }
        });
        setCumulativeValueData(res.data?.data || []);
      } catch (e) {
        console.error('Cumulative value fetch error', e);
      }
    })();
  }, [cumulativeValueGranularity, selectedDate, productType, state]);

  useEffect(() => { fetchCharts(); }, [fetchCharts]);

  /* ── Derived totals ─────────────────────────────────────────── */
  const totalPaid = pmtFlagData.find(d => d.name === 'Paid')?.value || 0;
  const totalUnpaid = pmtFlagData.find(d => d.name === 'Unpaid')?.value || 0;
  const totalPolicies = totalPaid + totalUnpaid;
  const overallRate = totalPolicies ? ((totalPaid / totalPolicies) * 100).toFixed(1) : '0.0';
  const summary = distributionData.summary;

  /* ── Render ──────────────────────────────────────────────────── */
  return (
    <div className="space-y-8 animate-fade-in-up">
      {/* ─ HEADER ───────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-white flex items-center gap-3">
            <div className={`p-2.5 rounded-xl bg-white/5 border border-white/10 ${theme.primaryText}`}>
              <TrendingUp size={22} />
            </div>
            Payment Curve Analysis
          </h1>
          <p className="mt-1 text-sm text-gray-400">Lapse aging, payment flags &amp; trend insights</p>
        </div>
      </div>

      {/* ─ FILTER BAR ──────────────────────────────────────────── */}
      <div className="relative z-20">
        {/* Subtle background glow */}
        <div className="absolute inset-0 -z-10 rounded-2xl bg-gradient-to-r from-indigo-500/10 via-purple-500/5 to-indigo-500/10 blur-xl"></div>
        
        <div className="flex flex-col md:flex-row md:items-center gap-5 rounded-2xl border border-white/10 bg-black/40 p-5 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center gap-3 md:border-r border-white/10 md:pr-5">
            <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 shadow-inner">
              <Filter size={18} />
            </div>
            <span className="text-xs font-bold uppercase tracking-widest text-gray-300">Filters</span>
          </div>

          <div className="flex-1 flex flex-wrap items-end gap-4">
            {/* Advanced Period Selector (Date Picker) */}
            <FuturisticDateFilter
              selectedDate={selectedDate}
              onSelect={setSelectedDate}
              label="Period"
            />

            {/* Product Type */}
            <FilterSelect
              id="filter-product-type"
              label="Product Type"
              icon={Box}
              value={productType}
              onChange={e => setProductType(e.target.value)}
            >
              <option value="">All Types</option>
              {filterOptions.product_types.map(v => <option key={v} value={v}>{v}</option>)}
            </FilterSelect>


            {/* State */}
            <FilterSelect
              id="filter-state"
              label="State"
              icon={MapPin}
              value={state}
              onChange={e => setState(e.target.value)}
            >
              <option value="">All States</option>
              {filterOptions.states.map(v => <option key={v} value={v}>{v}</option>)}
            </FilterSelect>

            {/* Clear button */}
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="ml-auto flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-xs font-semibold text-red-400 hover:bg-red-500/20 hover:border-red-500/40 transition-all duration-300 shadow-lg hover:shadow-red-500/20 active:scale-95"
              >
                <X size={14} strokeWidth={2.5} /> Clear All
              </button>
            )}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-80">
          <Loader2 size={36} className="animate-spin text-indigo-400" />
        </div>
      ) : (
        <>
          {/* ─ KPI SUMMARY ROW ──────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiMini label="Total Policies" value={formatCount(totalPolicies)} sub="In selected period" icon={BarChart3} />
            <KpiMini label="Payment Rate" value={`${overallRate}%`} sub={`${formatCount(totalPaid)} paid`} icon={TrendingUp} />
            <KpiMini label="Avg Lapse Aging" value={`${summary.avg_lapse_days ?? 0} days`} sub={`Max ${summary.max_lapse_days ?? 0} days`} icon={Clock} />
            <KpiMini label="Unpaid Policies" value={formatCount(totalUnpaid)} sub={`${(100 - parseFloat(overallRate)).toFixed(1)}% unpaid`} icon={Activity} />
          </div>

          {/* ─ ROW 1 — Lapse Aging Bar + PMT Flag Donut ──────── */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

            {/* Chart 1 — Payment Rate by Lapse Aging Band */}
            <GlassCard title="Payment Rate by Lapse Aging" subtitle="Paid vs Unpaid stacked by aging band" icon={BarChart3} className="xl:col-span-2 min-h-[400px]">
              {!lapseAgingData.length ? (
                <EmptyState msg="No lapse aging data available" />
              ) : (
                <>
                  <ChipLegend items={[
                    { color: COLORS.paid, label: 'Paid' },
                    { color: COLORS.unpaid, label: 'Unpaid' },
                  ]} />
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={lapseAgingData} margin={{ top: 10, right: 10, left: -16, bottom: 0 }} barCategoryGap={16}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                      <XAxis dataKey="aging_band" stroke="rgba(255,255,255,0.35)" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} angle={-20} textAnchor="end" height={50} />
                      <YAxis stroke="rgba(255,255,255,0.35)" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} tickFormatter={formatCount} />
                      <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} content={
                        <GlassTooltip labelKey="aging_band" fields={[
                          { key: 'paid_count', label: 'Paid', color: COLORS.paid },
                          { key: 'unpaid_count', label: 'Unpaid', color: COLORS.unpaid },
                          { key: 'total_count', label: 'Total' },
                          { key: 'payment_rate_pct', label: 'Rate %' },
                        ]} />
                      } />
                      <Bar dataKey="paid_count" stackId="a" radius={[0, 0, 8, 8]} barSize={36} fill={COLORS.paid} />
                      <Bar dataKey="unpaid_count" stackId="a" radius={[8, 8, 0, 0]} barSize={36} fill={COLORS.unpaid} />
                    </BarChart>
                  </ResponsiveContainer>
                </>
              )}
            </GlassCard>

            {/* Chart 2 — Policy Count by PMT Flag Donut */}
            <GlassCard title="Policy Split by Payment" subtitle="Paid vs Unpaid breakdown" icon={PieIcon} className="min-h-[400px]">
              {!pmtFlagData.length ? (
                <EmptyState msg="No payment data" />
              ) : (
                <ResponsiveContainer width="100%" height={320}>
                  <PieChart>
                    <Pie
                      data={pmtFlagData}
                      cx="50%"
                      cy="50%"
                      innerRadius="55%"
                      outerRadius="80%"
                      dataKey="value"
                      nameKey="name"
                      stroke="none"
                      paddingAngle={4}
                    >
                      {pmtFlagData.map((entry, i) => (
                        <Cell key={entry.name} fill={entry.name === 'Paid' ? COLORS.paid : COLORS.unpaid} />
                      ))}
                    </Pie>
                    <Tooltip content={
                      <GlassTooltip labelKey="name" fields={[
                        { key: 'value', label: 'Policies' },
                      ]} />
                    } />
                    <Legend
                      verticalAlign="bottom"
                      iconType="circle"
                      formatter={(val) => <span className="text-xs text-gray-300">{val}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </GlassCard>
          </div>

          {/* ─ ROW 2 — Premium Cash Flow Trajectory ───────────── */}
          <PremiumCashFlowTrajectoryChart
            data={premiumCashFlowData}
            granularity={cashFlowGranularity}
            onGranularityChange={setCashFlowGranularity}
          />

          {/* ─ ROW 3 — Lapse Hazard Curve by Payment Frequency ─ */}
          <LapseHazardCurveByPaymentFrequencyChart
            data={lapseHazardData}
            granularity={lapseHazardGranularity}
            onGranularityChange={setLapseHazardGranularity}
            pmtFilter={lapseHazardPmtFilter}
            onPmtFilterChange={setLapseHazardPmtFilter}
          />

          {/* ─ ROW 4 — Cumulative Value vs Discontinuation Spike ─ */}
          <CumulativeValueVsDiscontinuationSpikeChart
            data={cumulativeValueData}
            granularity={cumulativeValueGranularity}
            onGranularityChange={setCumulativeValueGranularity}
          />

          {/* ─ ROW 5 — Trend Line + Distribution Area ────────── */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

            {/* Chart 3 — Payment Rate Trend */}
            <GlassCard title="Payment Rate Trend" subtitle="Month-over-month payment conversion rate" icon={TrendingUp} className="min-h-[380px]">
              {!trendData.length ? (
                <EmptyState msg="No trend data" />
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={trendData} margin={{ top: 10, right: 20, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="month" stroke="rgba(255,255,255,0.35)" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                    <YAxis stroke="rgba(255,255,255,0.35)" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} unit="%" />
                    <Tooltip content={
                      <GlassTooltip labelKey="month" fields={[
                        { key: 'payment_rate_pct', label: 'Rate %', color: COLORS.line },
                        { key: 'paid_count', label: 'Paid', color: COLORS.paid },
                        { key: 'total_count', label: 'Total' },
                      ]} />
                    } />
                    <Line type="monotone" dataKey="payment_rate_pct" stroke={COLORS.line} strokeWidth={2.5} dot={{ r: 4, fill: COLORS.line }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </GlassCard>

            {/* Chart 4 — Lapse Aging Distribution */}
            <GlassCard title="Lapse Aging Distribution" subtitle="Policy count distribution across aging bands" icon={Activity} className="min-h-[380px]">
              {!distributionData.distribution.length ? (
                <EmptyState msg="No distribution data" />
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={distributionData.distribution} margin={{ top: 10, right: 20, left: -16, bottom: 0 }}>
                    <defs>
                      <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={COLORS.area} stopOpacity={0.4} />
                        <stop offset="95%" stopColor={COLORS.area} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="aging_band" stroke="rgba(255,255,255,0.35)" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} angle={-20} textAnchor="end" height={50} />
                    <YAxis stroke="rgba(255,255,255,0.35)" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} tickFormatter={formatCount} />
                    <Tooltip content={
                      <GlassTooltip labelKey="aging_band" fields={[
                        { key: 'policy_count', label: 'Policies', color: COLORS.area },
                      ]} />
                    } />
                    <Area type="monotone" dataKey="policy_count" stroke={COLORS.area} strokeWidth={2} fill="url(#areaGrad)" dot={{ r: 4, fill: COLORS.area }} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </GlassCard>
          </div>

          {/* ─ ROW 6 — Policy Count by Policy Aging (Year Buckets) ─ */}
          <div className="grid grid-cols-1 gap-6">
            <GlassCard title="Policy Count by Policy Aging" subtitle="Paid vs Unpaid split by policy age (year buckets)" icon={Calendar} className="min-h-[420px]">
              {!policyAgingData.length ? (
                <EmptyState msg="No policy aging data available" />
              ) : (
                <>
                  <ChipLegend items={[
                    { color: COLORS.paid, label: 'Paid' },
                    { color: COLORS.unpaid, label: 'Unpaid' },
                  ]} />
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={policyAgingData} margin={{ top: 10, right: 10, left: -16, bottom: 0 }} barCategoryGap={20}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                      <XAxis dataKey="aging_band" stroke="rgba(255,255,255,0.35)" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                      <YAxis stroke="rgba(255,255,255,0.35)" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} tickFormatter={formatCount} />
                      <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} content={
                        <GlassTooltip labelKey="aging_band" fields={[
                          { key: 'paid_count', label: 'Paid', color: COLORS.paid },
                          { key: 'unpaid_count', label: 'Unpaid', color: COLORS.unpaid },
                          { key: 'total_count', label: 'Total' },
                          { key: 'payment_rate_pct', label: 'Rate %' },
                        ]} />
                      } />
                      <Bar dataKey="paid_count" stackId="pa" radius={[0, 0, 8, 8]} barSize={42} fill={COLORS.paid} />
                      <Bar dataKey="unpaid_count" stackId="pa" radius={[8, 8, 0, 0]} barSize={42} fill={COLORS.unpaid} />
                    </BarChart>
                  </ResponsiveContainer>

                  {/* Mini stat cards per year band */}
                  <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-8">
                    {policyAgingData.map((band) => (
                      <div key={band.aging_band} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                        <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">{band.aging_band}</div>
                        <div className="mt-2 flex items-end justify-between gap-2">
                          <div>
                            <div className="text-[9px] uppercase tracking-widest text-gray-500">Paid</div>
                            <div className="text-base font-light text-emerald-400">{band.paid_count.toLocaleString()}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-[9px] uppercase tracking-widest text-gray-500">Unpaid</div>
                            <div className="text-base font-light text-amber-400">{band.unpaid_count.toLocaleString()}</div>
                          </div>
                        </div>
                        <div className="mt-1 text-[10px] text-gray-500">
                          {band.payment_rate_pct}% rate · {band.total_count.toLocaleString()} total
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </GlassCard>
          </div>

          {/* ─ ROW 7 — Payment Curve by Propensity ─ */}
          <div className="grid grid-cols-1 gap-6">
            <GlassCard title="Payment Curve by Propensity" subtitle="Payment rate by propensity segment" icon={Layers} className="min-h-[400px]">
              {!propensityData.length ? (
                <EmptyState msg="No propensity data available" />
              ) : (
                <>
                  <ChipLegend items={[
                    { color: COLORS.paid, label: 'Paid' },
                    { color: COLORS.unpaid, label: 'Unpaid' },
                  ]} />
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={propensityData} margin={{ top: 10, right: 10, left: -16, bottom: 0 }} barCategoryGap={20}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                      <XAxis dataKey="propensity" stroke="rgba(255,255,255,0.35)" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                      <YAxis stroke="rgba(255,255,255,0.35)" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} tickFormatter={formatCount} />
                      <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} content={
                        <GlassTooltip labelKey="propensity" fields={[
                          { key: 'paid_count', label: 'Paid', color: COLORS.paid },
                          { key: 'unpaid_count', label: 'Unpaid', color: COLORS.unpaid },
                          { key: 'total_count', label: 'Total' },
                          { key: 'payment_rate_pct', label: 'Rate %' },
                        ]} />
                      } />
                      <Bar dataKey="paid_count" stackId="prop" radius={[0, 0, 8, 8]} barSize={42} fill={COLORS.paid} />
                      <Bar dataKey="unpaid_count" stackId="prop" radius={[8, 8, 0, 0]} barSize={42} fill={COLORS.unpaid} />
                    </BarChart>
                  </ResponsiveContainer>

                  {/* Mini stat cards per propensity */}
                  <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-6">
                    {propensityData.map((item) => (
                      <div key={item.propensity} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                        <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">{item.propensity}</div>
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
                </>
              )}
            </GlassCard>
          </div>
        </>
      )}
    </div>
  );
};


/* ─── Utility sub-components ──────────────────────────────────── */

const EmptyState = ({ msg }) => (
  <div className="flex h-[280px] items-center justify-center rounded-2xl border border-dashed border-white/10 bg-black/10 text-center">
    <div>
      <div className="text-sm font-medium text-white">{msg}</div>
      <div className="mt-1 text-xs text-gray-400">Try another month or ingest more data.</div>
    </div>
  </div>
);

const ChipLegend = ({ items }) => (
  <div className="mb-4 flex flex-wrap items-center gap-3">
    {items.map(({ color, label }) => (
      <div key={label} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">{label}</span>
      </div>
    ))}
  </div>
);

const FilterSelect = ({ id, label, icon: Icon, value, onChange, children }) => (
  <div className="flex flex-col gap-1.5 w-full sm:w-auto min-w-[160px]">
    <label htmlFor={id} className="flex items-center gap-1.5 px-1">
      {Icon && <Icon size={13} className="text-indigo-400/80" />}
      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{label}</span>
    </label>
    <div className="relative group">
      <select
        id={id}
        value={value}
        onChange={onChange}
        className="appearance-none w-full rounded-xl border border-white/10 bg-white/5 pl-4 pr-10 py-2.5 text-sm font-medium text-gray-200 backdrop-blur-md transition-all duration-300 hover:border-indigo-500/50 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 cursor-pointer shadow-inner"
      >
        {children}
      </select>
      {/* Custom Chevron for select */}
      <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-gray-500 group-hover:text-indigo-400 transition-colors duration-300">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
        </svg>
      </div>
    </div>
  </div>
);

/* PeriodPillSelector replaced with FuturisticDateFilter component */

const PaymentCurveAnalysisDebt = () => (
  <div className="flex flex-col items-center justify-center h-[60vh] animate-fade-in-up">
    <div className="p-4 rounded-full bg-white/5 border border-white/10 mb-4 shadow-lg">
      <TrendingUp size={32} className="text-indigo-400/50" />
    </div>
    <h2 className="text-xl font-semibold text-white mb-2 tracking-tight">Payment Curve Analysis</h2>
    <p className="text-gray-400 max-w-md text-center text-sm leading-relaxed">
      This module is currently being optimized for Debt Collection. Advanced payment curves and propensity tracking will be available soon.
    </p>
  </div>
);

const PaymentCurveAnalysisHealth = () => (
  <div className="flex flex-col items-center justify-center h-[60vh] animate-fade-in-up">
    <div className="p-4 rounded-full bg-white/5 border border-white/10 mb-4 shadow-lg">
      <TrendingUp size={32} className="text-indigo-400/50" />
    </div>
    <h2 className="text-xl font-semibold text-white mb-2 tracking-tight">Payment Curve Analysis</h2>
    <p className="text-gray-400 max-w-md text-center text-sm leading-relaxed">
      This module is currently being structured for Health Insurance policies. Advanced lapse and claim curves will be available soon.
    </p>
  </div>
);

const PaymentCurveAnalysis = () => {
  const { mainDomain, subDomain } = useDomain();

  if (mainDomain === 'debt') {
    return <PaymentCurveAnalysisDebt />;
  }
  if (mainDomain === 'life_health' && subDomain === 'health') {
    return <PaymentCurveAnalysisHealth />;
  }
  
  // Default to Life Insurance (where the feature is fully built)
  return <PaymentCurveAnalysisLife />;
};

export default PaymentCurveAnalysis;
