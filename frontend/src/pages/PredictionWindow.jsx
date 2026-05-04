import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer, Legend,
  LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  RadarChart, PolarGrid, PolarAngleAxis, Radar,
} from 'recharts';
import {
  BarChart3, Calendar, DollarSign, Play, RefreshCw,
  Clock, AlertTriangle, TrendingUp, Activity, Layers, Zap
} from 'lucide-react';
import GlassCard from '../components/ui/GlassCard';
import { useDomain } from '../context/DomainContext';
import api from '../api';

// ─────────────────────────────────────────────────────────────────────────────
// COMBINED PREDICTION DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────
const ENGINE_COLORS = { product_group: '#6366f1', channel: '#ec4899', product_type: '#eab308' };
const ENGINE_LABELS = { product_group: 'Product Group', channel: 'Channel', product_type: 'Product Type' };

const CombinedPredictionDashboard = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const token = localStorage.getItem('access_token');
  const authHeader = { Authorization: `Bearer ${token}` };

  const fetchCombined = useCallback(async () => {
    setLoading(true);
    try {
      const { data: res } = await api.get('/combined-prediction/combined-summary', { headers: authHeader });
      if (res?.status === 'ok') setData(res);
      else setData(null);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Poll every 2 seconds while engines are incomplete (< 3), stop once all 3 are cached
  useEffect(() => {
    fetchCombined();
    const interval = setInterval(() => {
      fetchCombined();
    }, 4000);
    return () => clearInterval(interval);
  }, [fetchCombined]);

  const formatCount = (v) => {
    if (v == null || isNaN(v)) return '0';
    if (v >= 1000) return `${(v / 1000).toFixed(1)}K`;
    return Math.round(v).toLocaleString();
  };

  const formatCurrency = (v) => {
    if (v == null || isNaN(v)) return '₹0';
    if (v >= 10000000) return `₹${(v / 10000000).toFixed(1)}Cr`;
    if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
    if (v >= 1000) return `₹${(v / 1000).toFixed(1)}K`;
    return `₹${Math.round(v)}`;
  };

  if (!data || !data.combined_kpis) {
    return (
      <GlassCard className="!p-8 flex flex-col items-center justify-center text-center animate-fade-in-up border-dashed border-2 border-white/10 bg-black/20">
        <div className="w-16 h-16 rounded-full bg-cyan-500/10 flex items-center justify-center mb-4">
          <Layers size={32} className="text-cyan-500/50" />
        </div>
        <h3 className="text-xl font-bold text-white mb-2">Combined Prediction Engine</h3>
        <p className="text-sm text-gray-400 max-w-md">
          Run the individual prediction engines below to populate the combined analytics dashboard. 
          The collective view will automatically appear here once data is generated.
        </p>
      </GlassCard>
    );
  }

  const kpi = data.combined_kpis;
  const engines = data.engine_summaries || [];
  const bandDetails = data.engine_band_details || [];

  // Engine comparison bar chart data
  const engineComparisonData = engines.map(e => ({
    engine: ENGINE_LABELS[e.engine_type] || e.engine_type,
    predicted_paid: Math.round(e.predicted_paid_count),
    predicted_amount: Math.round(e.predicted_collected_amount),
    conversion_rate: e.predicted_paid_pct,
    fill: ENGINE_COLORS[e.engine_type] || '#6366f1',
  }));

  // Pie data for engine share
  const pieData = engines.map(e => ({
    name: ENGINE_LABELS[e.engine_type] || e.engine_type,
    value: Math.round(e.predicted_paid_count),
    fill: ENGINE_COLORS[e.engine_type] || '#6366f1',
  }));

  // Lapse band comparison: merge all engines into one chart
  const bandMap = {};
  bandDetails.forEach(eng => {
    eng.bands.forEach(b => {
      if (!bandMap[b.lapse_aging_band]) bandMap[b.lapse_aging_band] = { band: b.lapse_aging_band };
      bandMap[b.lapse_aging_band][ENGINE_LABELS[eng.engine_type]] = b.predicted_paid_count;
    });
  });
  const bandChartData = Object.values(bandMap).sort((a, b) => {
    const na = parseInt(a.band.split('-')[0]) || 9999;
    const nb = parseInt(b.band.split('-')[0]) || 9999;
    return na - nb;
  });

  const tooltipStyle = {
    contentStyle: { backgroundColor: 'rgba(15,15,20,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5)' },
    itemStyle: { fontSize: 13, fontWeight: 600 },
    labelStyle: { color: '#9ca3af', marginBottom: '4px', fontSize: 12, fontWeight: 700 },
  };

  return (
    <div className="flex flex-col gap-5 animate-fade-in-up">
      {/* Header */}
      <GlassCard className="!p-5 border-b-2 border-b-cyan-500/50 shadow-lg shadow-cyan-900/10 shrink-0">
        <div className="flex items-start gap-4">
          <div className="p-3.5 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/10 border border-cyan-500/30 text-cyan-400 mt-0.5 shadow-inner">
            <Layers size={24} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-lg font-bold text-white tracking-wide">Combined Engine Prediction</h2>
              <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 font-semibold tracking-wider uppercase">
                {engines.length}/3 Engines
              </span>
              {kpi.target_month && (
                <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-gray-400 font-medium">
                  Target: {kpi.target_month}
                </span>
              )}
            </div>
            <p className="text-sm text-gray-400">Averaged prediction from all active engines — run each engine above to populate.</p>
          </div>
        </div>
      </GlassCard>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-cyan-500/[0.04] to-transparent p-5 relative overflow-hidden group hover:border-cyan-500/30 transition-colors">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity"><Zap size={64} /></div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center"><Zap size={16} className="text-cyan-400" /></div>
            <div className="text-xs font-bold uppercase tracking-widest text-gray-400">Avg Predicted Paid</div>
          </div>
          <div className="text-3xl font-black text-white tracking-tight">{formatCount(kpi.avg_predicted_paid_count)}</div>
          <div className="mt-1 text-sm font-medium text-cyan-400">Averaged across {kpi.engines_count} engine{kpi.engines_count !== 1 ? 's' : ''}</div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-transparent p-5 relative overflow-hidden group hover:border-blue-500/30 transition-colors">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center"><BarChart3 size={16} className="text-blue-400" /></div>
            <div className="text-xs font-bold uppercase tracking-widest text-gray-400">Avg Total Exposure</div>
          </div>
          <div className="text-3xl font-black text-white tracking-tight">{formatCount(kpi.avg_total_policy_count)}</div>
          <div className="mt-1 text-sm font-medium text-blue-400">Target month policies</div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-transparent p-5 relative overflow-hidden group hover:border-emerald-500/30 transition-colors">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center"><TrendingUp size={16} className="text-emerald-400" /></div>
            <div className="text-xs font-bold uppercase tracking-widest text-gray-400">Avg Conversion</div>
          </div>
          <div className="text-3xl font-black text-white tracking-tight">{kpi.avg_predicted_paid_pct.toFixed(1)}%</div>
          <div className="mt-1 text-sm font-medium text-emerald-400">Combined paid rate</div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-transparent p-5 relative overflow-hidden group hover:border-purple-500/30 transition-colors">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center"><DollarSign size={16} className="text-purple-400" /></div>
            <div className="text-xs font-bold uppercase tracking-widest text-gray-400">Avg Predicted Amount</div>
          </div>
          <div className="text-3xl font-black text-white tracking-tight">{formatCurrency(kpi.avg_predicted_collected_amount)}</div>
          <div className="mt-1 text-sm font-medium text-purple-400">Expected collection</div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* Engine Comparison Bar Chart */}
        <GlassCard title="Engine Comparison" subtitle="Predicted paid policies by engine">
          <div className="h-[280px] w-full pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={engineComparisonData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }} barGap={8}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="engine" stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 11, fontWeight: 600 }} tickLine={false} axisLine={false} />
                <YAxis stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={formatCount} />
                <RechartsTooltip {...tooltipStyle} formatter={(v, name) => [formatCount(v), name]} />
                <Legend wrapperStyle={{ fontSize: 12, fontWeight: 500, paddingTop: '10px' }} iconType="round" />
                <Bar dataKey="predicted_paid" name="Predicted Paid" radius={[6, 6, 0, 0]} barSize={48}>
                  {engineComparisonData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>

        {/* Engine Share Pie Chart */}
        <GlassCard title="Engine Share" subtitle="Proportion of predicted paid policies by engine">
          <div className="h-[280px] w-full pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={4} dataKey="value" nameKey="name" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {pieData.map((entry, i) => <Cell key={i} fill={entry.fill} stroke="none" />)}
                </Pie>
                <RechartsTooltip {...tooltipStyle} formatter={(v) => [formatCount(v), 'Predicted Paid']} />
                <Legend wrapperStyle={{ fontSize: 12, fontWeight: 500, paddingTop: '10px' }} iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>

        {/* Lapse Band Predicted Paid by Engine */}
        {bandChartData.length > 0 && (
          <GlassCard title="Lapse Band Decay · All Engines" subtitle="Predicted paid policies per lapse aging band" className="xl:col-span-2">
            <div className="h-[300px] w-full pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={bandChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="band" stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 10, fontWeight: 500 }} tickLine={false} axisLine={false} />
                  <YAxis stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={formatCount} />
                  <RechartsTooltip {...tooltipStyle} formatter={(v, name) => [formatCount(v), name]} />
                  <Legend wrapperStyle={{ fontSize: 12, fontWeight: 500, paddingTop: '10px' }} iconType="round" />
                  {engines.map(e => (
                    <Bar key={e.engine_type} dataKey={ENGINE_LABELS[e.engine_type]} fill={ENGINE_COLORS[e.engine_type]} radius={[4, 4, 0, 0]} barSize={20} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>
        )}
      </div>

      {/* Per-Engine Summary Table */}
      <GlassCard title="Engine-Level Summary" subtitle="Individual engine prediction outputs">
        <div className="overflow-x-auto mt-2">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr>
                <th className="pb-3 text-xs font-bold text-gray-500 uppercase tracking-widest">Engine</th>
                <th className="pb-3 text-xs font-bold text-gray-500 uppercase tracking-widest text-right">Total Exposure</th>
                <th className="pb-3 text-xs font-bold text-gray-500 uppercase tracking-widest text-right">Predicted Paid</th>
                <th className="pb-3 text-xs font-bold text-gray-500 uppercase tracking-widest text-right">Conversion %</th>
                <th className="pb-3 text-xs font-bold text-gray-500 uppercase tracking-widest text-right">Predicted Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {engines.map(e => (
                <tr key={e.engine_type} className="hover:bg-white/[0.02] transition-colors">
                  <td className="py-3 text-sm font-semibold text-white flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: ENGINE_COLORS[e.engine_type] }} />
                    {ENGINE_LABELS[e.engine_type] || e.engine_type}
                  </td>
                  <td className="py-3 text-sm text-gray-400 font-medium text-right">{formatCount(e.total_policy_count)}</td>
                  <td className="py-3 text-sm font-bold text-cyan-400 text-right">{formatCount(e.predicted_paid_count)}</td>
                  <td className="py-3 text-sm font-bold text-emerald-400 text-right">{e.predicted_paid_pct.toFixed(1)}%</td>
                  <td className="py-3 text-sm font-bold text-purple-400 text-right">{formatCurrency(e.predicted_collected_amount)}</td>
                </tr>
              ))}
              {/* Average row */}
              <tr className="border-t border-cyan-500/20 bg-cyan-500/[0.03]">
                <td className="py-3 text-sm font-bold text-cyan-300 flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-cyan-400" />
                  AVERAGE
                </td>
                <td className="py-3 text-sm font-bold text-gray-300 text-right">{formatCount(kpi.avg_total_policy_count)}</td>
                <td className="py-3 text-sm font-bold text-cyan-300 text-right">{formatCount(kpi.avg_predicted_paid_count)}</td>
                <td className="py-3 text-sm font-bold text-emerald-300 text-right">{kpi.avg_predicted_paid_pct.toFixed(1)}%</td>
                <td className="py-3 text-sm font-bold text-purple-300 text-right">{formatCurrency(kpi.avg_predicted_collected_amount)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  );
};

const LifeLapsePrediction = () => {
  const [targetMonth, setTargetMonth] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return d.toISOString().slice(0, 7);
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [predictionData, setPredictionData] = useState(null);
  const [lastRun, setLastRun] = useState(null);

  const token = localStorage.getItem('access_token');
  const authHeader = { Authorization: `Bearer ${token}` };

  // Load saved data from localStorage on mount
  useEffect(() => {
    const savedData = localStorage.getItem('life_prediction_data');
    const savedLastRun = localStorage.getItem('life_prediction_last_run');
    const savedTargetMonth = localStorage.getItem('life_prediction_target_month');
    
    if (savedData) {
      try {
        setPredictionData(JSON.parse(savedData));
      } catch (e) {
        console.error('Failed to parse saved prediction data:', e);
      }
    }
    if (savedLastRun) {
      setLastRun(savedLastRun);
    }
    if (savedTargetMonth) {
      setTargetMonth(savedTargetMonth);
    }
  }, []);

  const handleRunPrediction = async () => {
    setLoading(true);
    setError(null);
    setPredictionData(null);
    try {
      const { data } = await api.post('/prediction/lapse', {
        target_month: targetMonth,
      }, { headers: authHeader });
      setPredictionData(data);
      setLastRun(new Date().toLocaleTimeString());
      
      // Save to localStorage for persistence
      localStorage.setItem('life_prediction_data', JSON.stringify(data));
      localStorage.setItem('life_prediction_last_run', new Date().toLocaleTimeString());
      localStorage.setItem('life_prediction_target_month', targetMonth);
    } catch (err) {
      setError(err.response?.data?.detail ?? err.message ?? 'Failed to generate prediction.');
    } finally {
      setLoading(false);
    }
  };

  const formatCount = (value) => {
    if (value == null || isNaN(value)) return '0';
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
    return value.toLocaleString();
  };

  const formatCurrency = (value) => {
    if (value == null || isNaN(value)) return '₹0';
    if (value >= 10000000) return `₹${(value / 10000000).toFixed(1)}Cr`;
    if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
    if (value >= 1000) return `₹${(value / 1000).toFixed(1)}K`;
    return `₹${value.toFixed(0)}`;
  };

  // Colors for product groups
  const COLORS = ['#6366f1', '#34d399', '#f472b6', '#fbbf24', '#f87171', '#60a5fa'];

  // Prepare chart data
  const { productGroupChartData, lapseBandChartData, historicalTrendData } = useMemo(() => {
    if (!predictionData) return { productGroupChartData: [], lapseBandChartData: [], historicalTrendData: [] };

    // 1. Product Group Comparison
    const pgData = predictionData.by_product_group.map(item => ({
      product_group: item.product_group,
      total_policies: item.total_policy_count,
      predicted_paid: item.predicted_paid_count,
      historical_paid_pct: item.historical_avg_paid_pct,
    }));

    // 2. Lapse Band Decay Curve
    const bandData = [];
    const allBands = new Set();
    predictionData.by_product_group.forEach(pg => {
      pg.lapse_band_breakdown.forEach(band => allBands.add(band.lapse_aging_band));
    });

    // Sort bands numerically if possible (e.g., "0-30", "30-60")
    const sortedBands = Array.from(allBands).sort((a, b) => {
      const numA = parseInt(a.split('-')[0]) || 0;
      const numB = parseInt(b.split('-')[0]) || 0;
      return numA - numB;
    });

    sortedBands.forEach(band => {
      const dataPoint = { band };
      predictionData.by_product_group.forEach(pg => {
        const bandDetails = pg.lapse_band_breakdown.find(b => b.lapse_aging_band === band);
        // We chart the historical paid rate per band to show the decay curve
        dataPoint[pg.product_group] = bandDetails ? bandDetails.historical_avg_paid_pct : null;
      });
      bandData.push(dataPoint);
    });

    // 3. Historical Trendline (T-4 to T-1)
    const trendData = predictionData.reference_month_details.map(ref => {
      const dataPoint = { month: ref.month };
      ref.product_group_paid_pct.forEach(pg => {
        dataPoint[pg.product_group] = pg.avg_paid_pct;
      });
      return dataPoint;
    });
    // Ensure chronological order
    trendData.sort((a, b) => a.month.localeCompare(b.month));

    return { productGroupChartData: pgData, lapseBandChartData: bandData, historicalTrendData: trendData };
  }, [predictionData]);

  // Dynamic Product Groups for chart lines
  const uniqueProductGroups = useMemo(() => {
    return predictionData?.by_product_group?.map(pg => pg.product_group) || [];
  }, [predictionData]);

  return (
    <div className="flex flex-col gap-5 animate-fade-in-up pb-6">
      {/* Header */}
      <GlassCard className="!p-5 border-b-2 border-b-amber-500/50 shadow-lg shadow-black/20 shrink-0">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
          <div className="flex items-start gap-4">
            <div className="p-3.5 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-600/10 border border-amber-500/30 text-amber-400 mt-0.5 shadow-inner">
              <BarChart3 size={24} />
            </div>
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h2 className="text-lg font-bold text-white tracking-wide">Predictive Lapse Analytics</h2>
                <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-semibold tracking-wider uppercase">
                  Industry Grade
                </span>
              </div>
              <p className="text-sm text-gray-400">Machine learning forecasting utilizing exact 4-month (T-1 to T-4) volume-weighted trendlines.</p>
              {lastRun && <div className="flex items-center gap-1.5 mt-2"><Clock size={12} className="text-gray-500" /><span className="text-xs text-gray-500 font-medium">Last computed: {lastRun}</span></div>}
            </div>
          </div>
          <div className="flex items-center gap-3 w-full md:w-auto bg-black/20 p-2 rounded-2xl border border-white/5">
            <div className="flex flex-col gap-1 flex-1 md:flex-none px-2">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Target Month</label>
              <input
                type="month"
                value={targetMonth}
                onChange={(e) => setTargetMonth(e.target.value)}
                className="bg-transparent border-none p-0 text-base font-semibold text-white focus:outline-none focus:ring-0 transition-all cursor-pointer appearance-none selection:bg-transparent"
              />
            </div>
            <div className="h-8 w-px bg-white/10 mx-1"></div>
            <button
              onClick={handleRunPrediction}
              disabled={loading}
              className={`flex items-center whitespace-nowrap gap-2 px-6 py-2.5 rounded-xl font-bold text-sm transition-all ${loading ? 'bg-gray-800/50 text-gray-500 cursor-not-allowed border border-white/5'
                  : 'bg-gradient-to-r from-amber-600 to-orange-500 hover:from-amber-500 hover:to-orange-400 active:scale-95 text-white shadow-lg shadow-amber-900/30 border border-amber-400/30'}`}
            >
              {loading ? <><RefreshCw size={16} className="animate-spin" /> Processing…</> : <><Play size={16} fill="currentColor" /> Forecast</>}
            </button>
          </div>
        </div>
      </GlassCard>

      {error && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm shadow-lg">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <div>
            <div className="font-bold mb-0.5 text-red-300">Forecasting Engine Error</div>
            <div className="text-xs text-red-400/80">{error}</div>
          </div>
        </div>
      )}

      {loading && (
        <div className="flex flex-col items-center justify-center gap-6 py-20">
          <div className="relative w-20 h-20">
            <div className="absolute inset-0 rounded-full border-2 border-white/5" />
            <div className="absolute inset-2 rounded-full border-2 animate-spin" style={{ borderColor: '#f59e0b33', borderTopColor: '#f59e0b', animationDuration: '1s' }} />
            <div className="absolute inset-0 flex items-center justify-center">
              <Activity size={24} style={{ color: '#f59e0b' }} className="animate-pulse" />
            </div>
          </div>
          <div className="text-center">
            <p className="text-base font-bold text-white tracking-wide">Synthesizing 4-Month Trendlines…</p>
            <p className="text-sm text-gray-500 mt-1">Calculating volume-weighted predictions across all lapse bands</p>
          </div>
        </div>
      )}

      {!loading && predictionData && (
        <div className="flex flex-col gap-5">
          {/* Top KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-transparent p-5 relative overflow-hidden group hover:border-amber-500/30 transition-colors">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <DollarSign size={64} />
              </div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center">
                  <DollarSign size={16} className="text-amber-400" />
                </div>
                <div className="text-xs font-bold uppercase tracking-widest text-gray-400">
                  Predicted Paid
                </div>
              </div>
              <div className="text-3xl font-black text-white tracking-tight">
                {formatCount(predictionData.summary.overall_predicted_paid_count)}
              </div>
              <div className="mt-1 text-sm font-medium text-amber-500">
                Policies expected to pay
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-transparent p-5 relative overflow-hidden group hover:border-blue-500/30 transition-colors">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
                  <BarChart3 size={16} className="text-blue-400" />
                </div>
                <div className="text-xs font-bold uppercase tracking-widest text-gray-400">
                  Total Exposure
                </div>
              </div>
              <div className="text-3xl font-black text-white tracking-tight">
                {formatCount(predictionData.summary.overall_total_policy_count)}
              </div>
              <div className="mt-1 text-sm font-medium text-blue-400">
                Total policies in target
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-transparent p-5 relative overflow-hidden group hover:border-emerald-500/30 transition-colors">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <TrendingUp size={16} className="text-emerald-400" />
                </div>
                <div className="text-xs font-bold uppercase tracking-widest text-gray-400">
                  Conversion Rate
                </div>
              </div>
              <div className="text-3xl font-black text-white tracking-tight">
                {predictionData.summary.overall_predicted_paid_pct.toFixed(1)}%
              </div>
              <div className="mt-1 text-sm font-medium text-emerald-400">
                Overall predicted rate
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-transparent p-5 relative overflow-hidden group hover:border-purple-500/30 transition-colors">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center">
                  <DollarSign size={16} className="text-purple-400" />
                </div>
                <div className="text-xs font-bold uppercase tracking-widest text-gray-400">
                  Predicted Amount
                </div>
              </div>
              <div className="text-3xl font-black text-white tracking-tight">
                {formatCurrency(predictionData.summary.overall_predicted_collected_amount)}
              </div>
              <div className="mt-1 text-sm font-medium text-purple-400">
                Expected collection
              </div>
            </div>
          </div>

          {/* Reference Months Info */}
          <GlassCard className="!p-4">
            <div className="flex items-center gap-2 mb-2">
              <Calendar size={14} className="text-purple-400" />
              <span className="text-xs font-semibold text-white uppercase tracking-widest">Reference Months (T-4 to T-1)</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {predictionData.reference_months.map((month) => (
                <span key={month} className="px-3 py-1 rounded-lg bg-white/5 border border-white/10 text-xs text-gray-300">
                  {month}
                </span>
              ))}
            </div>
          </GlassCard>

          {/* Core Analytics Charts */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            {/* 4-Month Trendline */}
            <GlassCard title="Historical Trendline" subtitle="Volume-weighted paid percentage across reference months">
              <div className="h-[300px] w-full pt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={historicalTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      {uniqueProductGroups.map((pg, idx) => (
                        <linearGradient key={`grad-${pg}`} id={`color-${pg}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={COLORS[idx % COLORS.length]} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={COLORS[idx % COLORS.length]} stopOpacity={0} />
                        </linearGradient>
                      ))}
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="month" stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 11, fontWeight: 500 }} tickLine={false} axisLine={false} />
                    <YAxis stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                    <RechartsTooltip
                      contentStyle={{ backgroundColor: 'rgba(15,15,20,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5)' }}
                      itemStyle={{ fontSize: 13, fontWeight: 600 }}
                      labelStyle={{ color: '#9ca3af', marginBottom: '4px', fontSize: 12, fontWeight: 700 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12, fontWeight: 500, paddingTop: '10px' }} iconType="circle" />
                    {uniqueProductGroups.map((pg, idx) => (
                      <Area
                        key={pg} type="monotone" dataKey={pg} name={pg}
                        stroke={COLORS[idx % COLORS.length]} strokeWidth={3}
                        fillOpacity={1} fill={`url(#color-${pg})`}
                        activeDot={{ r: 6, strokeWidth: 0 }}
                      />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </GlassCard>

            {/* Lapse Decay Curve */}
            <GlassCard title="Lapse Decay Curve" subtitle="Historical paid rate deterioration by aging band">
              <div className="h-[300px] w-full pt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={lapseBandChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="band" stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 11, fontWeight: 500 }} tickLine={false} axisLine={false} />
                    <YAxis stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                    <RechartsTooltip
                      contentStyle={{ backgroundColor: 'rgba(15,15,20,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5)' }}
                      labelFormatter={(label) => `Lapse Days: ${label}`}
                      itemStyle={{ fontSize: 13, fontWeight: 600 }}
                      labelStyle={{ color: '#9ca3af', marginBottom: '4px', fontSize: 12, fontWeight: 700 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12, fontWeight: 500, paddingTop: '10px' }} iconType="circle" />
                    {uniqueProductGroups.map((pg, idx) => (
                      <Line
                        key={pg} type="monotone" dataKey={pg} name={pg}
                        stroke={COLORS[idx % COLORS.length]} strokeWidth={3}
                        dot={{ r: 4, strokeWidth: 0, fill: COLORS[idx % COLORS.length] }}
                        activeDot={{ r: 7, strokeWidth: 2, stroke: '#fff' }}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </GlassCard>

            {/* Product Group Breakdown */}
            <GlassCard title="Predicted Volume by Product" subtitle="Total exposure vs Predicted paid counts" className="xl:col-span-2">
              <div className="h-[320px] w-full pt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={productGroupChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }} barGap={12}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="product_group" stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 12, fontWeight: 600 }} tickLine={false} axisLine={false} />
                    <YAxis stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={formatCount} />
                    <RechartsTooltip
                      cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                      contentStyle={{ backgroundColor: 'rgba(15,15,20,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5)' }}
                      itemStyle={{ fontSize: 13, fontWeight: 600 }}
                      labelStyle={{ color: '#9ca3af', marginBottom: '4px', fontSize: 12, fontWeight: 700 }}
                      formatter={(value, name) => [formatCount(value), name]}
                    />
                    <Legend wrapperStyle={{ fontSize: 12, fontWeight: 500, paddingTop: '10px' }} iconType="round" />
                    <Bar dataKey="total_policies" fill="url(#color-exposure)" radius={[6, 6, 0, 0]} barSize={48} name="Total Target Exposure" />
                    <Bar dataKey="predicted_paid" fill="url(#color-paid)" radius={[6, 6, 0, 0]} barSize={48} name="Predicted Paid Policies" />
                    <defs>
                      <linearGradient id="color-exposure" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#4f46e5" />
                        <stop offset="100%" stopColor="#3730a3" />
                      </linearGradient>
                      <linearGradient id="color-paid" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" />
                        <stop offset="100%" stopColor="#059669" />
                      </linearGradient>
                    </defs>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </GlassCard>
          </div>

          {/* Detailed Data Table */}
          <GlassCard title="Band-Level Prediction Engine Output" subtitle="Granular breakdown of the target month application">
            <div className="space-y-6 mt-2">
              {predictionData.by_product_group.map((pg, idx) => (
                <div key={pg.product_group} className="rounded-2xl border border-white/5 bg-black/20 overflow-hidden">
                  <div className="bg-white/5 px-5 py-3 border-b border-white/10 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-3.5 h-3.5 rounded-full shadow-[0_0_10px_rgba(255,255,255,0.5)]" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                      <span className="text-base font-bold text-white tracking-wide">{pg.product_group}</span>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="flex flex-col items-end">
                        <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Base Hist Rate</span>
                        <span className="text-sm font-bold text-amber-400">{pg.historical_avg_paid_pct.toFixed(1)}%</span>
                      </div>
                      <div className="w-px h-8 bg-white/10"></div>
                      <div className="flex flex-col items-end">
                        <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Target Prediction</span>
                        <span className="text-sm font-bold text-emerald-400">{pg.predicted_paid_pct.toFixed(1)}%</span>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr>
                          <th className="pb-3 text-xs font-bold text-gray-500 uppercase tracking-widest">Lapse Aging Band</th>
                          <th className="pb-3 text-xs font-bold text-gray-500 uppercase tracking-widest text-right">Target Exposure</th>
                          <th className="pb-3 text-xs font-bold text-gray-500 uppercase tracking-widest text-right">Band Hist. Rate</th>
                          <th className="pb-3 text-xs font-bold text-gray-500 uppercase tracking-widest text-right">Predicted Policies</th>
                          <th className="pb-3 text-xs font-bold text-gray-500 uppercase tracking-widest text-right">Predicted Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {pg.lapse_band_breakdown.map((band) => (
                          <tr key={band.lapse_aging_band} className="hover:bg-white/[0.02] transition-colors">
                            <td className="py-2.5 text-sm font-medium text-gray-300">{band.lapse_aging_band} Days</td>
                            <td className="py-2.5 text-sm text-gray-400 font-medium text-right">{formatCount(band.policy_count)}</td>
                            <td className="py-2.5 text-sm font-bold text-amber-500/80 text-right">
                              {band.historical_avg_paid_pct != null ? `${band.historical_avg_paid_pct.toFixed(1)}%` : 'N/A'}
                            </td>
                            <td className="py-2.5 text-sm font-bold text-emerald-400 text-right">{formatCount(band.predicted_paid_count)}</td>
                            <td className="py-2.5 text-sm font-bold text-purple-400 text-right">{formatCurrency(band.predicted_collected_amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>
      )}


      {!loading && !predictionData && !error && (
        <div className="flex flex-col items-center justify-center gap-5 py-24 text-center">
          <div className="w-20 h-20 rounded-3xl flex items-center justify-center bg-gradient-to-br from-amber-500/20 to-orange-500/5 border border-amber-500/20 shadow-[0_0_30px_rgba(245,158,11,0.15)]">
            <TrendingUp size={36} className="text-amber-500" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-white mb-2 tracking-wide">Industry-Grade Forecasting</h3>
            <p className="text-sm text-gray-400 max-w-md mx-auto leading-relaxed">
              Select a target month above to run the predictive engine. The system will analyze continuous 4-month historical volume-weighted trends across all lapse aging bands.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

const PREDICTION_SCOPES = {
  LIFE: 'life_insurance',
  HEALTH: 'health_insurance',
  DEBT: 'debt_collection',
};

const getPredictionScope = (mainDomain, subDomain) => {
  if (mainDomain === 'debt') return PREDICTION_SCOPES.DEBT;
  if (mainDomain === 'life_health') {
    return subDomain === 'health' ? PREDICTION_SCOPES.HEALTH : PREDICTION_SCOPES.LIFE;
  }
  return PREDICTION_SCOPES.LIFE;
};

const PredictionWindow = () => {
  const { mainDomain, subDomain } = useDomain();
  const scope = getPredictionScope(mainDomain, subDomain);

  if (scope === PREDICTION_SCOPES.HEALTH) {
    return (
      <div className="flex flex-col gap-6 h-full pb-6 overflow-y-auto overflow-x-hidden animate-fade-in-up">
        <GlassCard className="!p-6 border border-emerald-500/25 bg-emerald-500/5">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="text-emerald-300 mt-0.5 shrink-0" />
            <div>
              <h3 className="text-sm font-semibold text-white mb-1">Health Insurance Predictive Analytics</h3>
              <p className="text-xs text-gray-300">
                Health Insurance predictive analytics are not configured yet. Switch to Life Insurance.
              </p>
            </div>
          </div>
        </GlassCard>
      </div>
    );
  }

  if (scope === PREDICTION_SCOPES.DEBT) {
    return (
      <div className="flex flex-col gap-6 h-full pb-6 overflow-y-auto overflow-x-hidden animate-fade-in-up">
        <GlassCard className="!p-6 border border-amber-500/25 bg-amber-500/5">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="text-amber-300 mt-0.5 shrink-0" />
            <div>
              <h3 className="text-sm font-semibold text-white mb-1">Debt Collection Predictive Analytics</h3>
              <p className="text-xs text-gray-300">
                Debt Collection predictive lapse analytics are not configured yet.
              </p>
            </div>
          </div>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 pb-6">
      {/* ─── Combined Engine Dashboard (auto-refreshes from cache) ─── */}
      <CombinedPredictionDashboard />

      {/* ─── Separator ─── */}
      <div className="flex items-center gap-4">
        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Individual Engines</span>
        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      </div>

      <LifeLapsePrediction />
      <ChannelLapsePrediction />
      <ProductTypeLapsePrediction />
    </div>
  );
};

const ChannelLapsePrediction = () => {
  const [targetMonth, setTargetMonth] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return d.toISOString().slice(0, 7);
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [predictionData, setPredictionData] = useState(null);
  const [lastRun, setLastRun] = useState(null);

  const token = localStorage.getItem('access_token');
  const authHeader = { Authorization: `Bearer ${token}` };

  // Load saved data from localStorage on mount
  useEffect(() => {
    const savedData = localStorage.getItem('channel_prediction_data');
    const savedLastRun = localStorage.getItem('channel_prediction_last_run');
    const savedTargetMonth = localStorage.getItem('channel_prediction_target_month');
    
    if (savedData) {
      try {
        setPredictionData(JSON.parse(savedData));
      } catch (e) {
        console.error('Failed to parse saved prediction data:', e);
      }
    }
    if (savedLastRun) {
      setLastRun(savedLastRun);
    }
    if (savedTargetMonth) {
      setTargetMonth(savedTargetMonth);
    }
  }, []);

  const handleRunPrediction = async () => {
    setLoading(true);
    setError(null);
    setPredictionData(null);
    try {
      const { data } = await api.post('/channel-prediction/lapse', {
        target_month: targetMonth,
      }, { headers: authHeader });
      setPredictionData(data);
      setLastRun(new Date().toLocaleTimeString());
      
      // Save to localStorage for persistence
      localStorage.setItem('channel_prediction_data', JSON.stringify(data));
      localStorage.setItem('channel_prediction_last_run', new Date().toLocaleTimeString());
      localStorage.setItem('channel_prediction_target_month', targetMonth);
    } catch (err) {
      setError(err.response?.data?.detail ?? err.message ?? 'Failed to generate prediction.');
    } finally {
      setLoading(false);
    }
  };

  const formatCount = (value) => {
    if (value == null || isNaN(value)) return '0';
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
    return value.toLocaleString();
  };

  const formatCurrency = (value) => {
    if (value == null || isNaN(value)) return '₹0';
    if (value >= 10000000) return `₹${(value / 10000000).toFixed(1)}Cr`;
    if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
    if (value >= 1000) return `₹${(value / 1000).toFixed(1)}K`;
    return `₹${value.toFixed(0)}`;
  };

  // Colors for channels
  const COLORS = ['#f472b6', '#fbbf24', '#f87171', '#60a5fa', '#34d399', '#6366f1'];

  // Prepare chart data
  const { channelChartData, lapseBandChartData, historicalTrendData } = useMemo(() => {
    if (!predictionData) return { channelChartData: [], lapseBandChartData: [], historicalTrendData: [] };

    // 1. Channel Comparison
    const chData = predictionData.by_channel.map(item => ({
      channel: item.channel,
      total_policies: item.total_policy_count,
      predicted_paid: item.predicted_paid_count,
      historical_paid_pct: item.historical_avg_paid_pct,
    }));

    // 2. Lapse Band Decay Curve
    const bandData = [];
    const allBands = new Set();
    predictionData.by_channel.forEach(ch => {
      ch.lapse_band_breakdown.forEach(band => allBands.add(band.lapse_aging_band));
    });

    const sortedBands = Array.from(allBands).sort((a, b) => {
      const numA = parseInt(a.split('-')[0]) || 0;
      const numB = parseInt(b.split('-')[0]) || 0;
      return numA - numB;
    });

    sortedBands.forEach(band => {
      const dataPoint = { band };
      predictionData.by_channel.forEach(ch => {
        const bandDetails = ch.lapse_band_breakdown.find(b => b.lapse_aging_band === band);
        dataPoint[ch.channel] = bandDetails ? bandDetails.historical_avg_paid_pct : null;
      });
      bandData.push(dataPoint);
    });

    // 3. Historical Trendline (T-4 to T-1)
    const trendData = predictionData.reference_month_details.map(ref => {
      const dataPoint = { month: ref.month };
      ref.channel_paid_pct.forEach(ch => {
        dataPoint[ch.channel] = ch.avg_paid_pct;
      });
      return dataPoint;
    });
    trendData.sort((a, b) => a.month.localeCompare(b.month));

    return { channelChartData: chData, lapseBandChartData: bandData, historicalTrendData: trendData };
  }, [predictionData]);

  const uniqueChannels = useMemo(() => {
    return predictionData?.by_channel?.map(ch => ch.channel) || [];
  }, [predictionData]);

  return (
    <div className="flex flex-col gap-5 animate-fade-in-up pb-6">
      {/* Header */}
      <GlassCard className="!p-5 border-b-2 border-b-pink-500/50 shadow-lg shadow-black/20 shrink-0">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
          <div className="flex items-start gap-4">
            <div className="p-3.5 rounded-xl bg-gradient-to-br from-pink-500/20 to-rose-600/10 border border-pink-500/30 text-pink-400 mt-0.5 shadow-inner">
              <BarChart3 size={24} />
            </div>
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h2 className="text-lg font-bold text-white tracking-wide">Channel-Based Lapse Prediction</h2>
                <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-pink-500/15 border border-pink-500/30 text-pink-400 font-semibold tracking-wider uppercase">
                  Distribution Channel
                </span>
              </div>
              <p className="text-sm text-gray-400">Forecasting by distribution channel using 4-month historical trendlines.</p>
              {lastRun && <div className="flex items-center gap-1.5 mt-2"><Clock size={12} className="text-gray-500" /><span className="text-xs text-gray-500 font-medium">Last computed: {lastRun}</span></div>}
            </div>
          </div>
          <div className="flex items-center gap-3 w-full md:w-auto bg-black/20 p-2 rounded-2xl border border-white/5">
            <div className="flex flex-col gap-1 flex-1 md:flex-none px-2">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Target Month</label>
              <input
                type="month"
                value={targetMonth}
                onChange={(e) => setTargetMonth(e.target.value)}
                className="bg-transparent border-none p-0 text-base font-semibold text-white focus:outline-none focus:ring-0 transition-all cursor-pointer appearance-none selection:bg-transparent"
              />
            </div>
            <div className="h-8 w-px bg-white/10 mx-1"></div>
            <button
              onClick={handleRunPrediction}
              disabled={loading}
              className={`flex items-center whitespace-nowrap gap-2 px-6 py-2.5 rounded-xl font-bold text-sm transition-all ${loading ? 'bg-gray-800/50 text-gray-500 cursor-not-allowed border border-white/5'
                  : 'bg-gradient-to-r from-pink-600 to-rose-500 hover:from-pink-500 hover:to-rose-400 active:scale-95 text-white shadow-lg shadow-pink-900/30 border border-pink-400/30'}`}
            >
              {loading ? <><RefreshCw size={16} className="animate-spin" /> Processing…</> : <><Play size={16} fill="currentColor" /> Forecast</>}
            </button>
          </div>
        </div>
      </GlassCard>

      {error && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm shadow-lg">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <div>
            <div className="font-bold mb-0.5 text-red-300">Forecasting Engine Error</div>
            <div className="text-xs text-red-400/80">{error}</div>
          </div>
        </div>
      )}

      {loading && (
        <div className="flex flex-col items-center justify-center gap-6 py-20">
          <div className="relative w-20 h-20">
            <div className="absolute inset-0 rounded-full border-2 border-white/5" />
            <div className="absolute inset-2 rounded-full border-2 animate-spin" style={{ borderColor: '#ec489933', borderTopColor: '#ec4899', animationDuration: '1s' }} />
            <div className="absolute inset-0 flex items-center justify-center">
              <Activity size={24} style={{ color: '#ec4899' }} className="animate-pulse" />
            </div>
          </div>
          <div className="text-center">
            <p className="text-base font-bold text-white tracking-wide">Analyzing Channel Trends…</p>
            <p className="text-sm text-gray-500 mt-1">Calculating volume-weighted predictions across distribution channels</p>
          </div>
        </div>
      )}

      {!loading && predictionData && (
        <div className="flex flex-col gap-5">
          {/* Top KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-transparent p-5 relative overflow-hidden group hover:border-pink-500/30 transition-colors">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <DollarSign size={64} />
              </div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-full bg-pink-500/20 flex items-center justify-center">
                  <DollarSign size={16} className="text-pink-400" />
                </div>
                <div className="text-xs font-bold uppercase tracking-widest text-gray-400">
                  Predicted Paid
                </div>
              </div>
              <div className="text-3xl font-black text-white tracking-tight">
                {formatCount(predictionData.summary.overall_predicted_paid_count)}
              </div>
              <div className="mt-1 text-sm font-medium text-pink-500">
                Policies expected to pay
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-transparent p-5 relative overflow-hidden group hover:border-blue-500/30 transition-colors">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
                  <BarChart3 size={16} className="text-blue-400" />
                </div>
                <div className="text-xs font-bold uppercase tracking-widest text-gray-400">
                  Total Exposure
                </div>
              </div>
              <div className="text-3xl font-black text-white tracking-tight">
                {formatCount(predictionData.summary.overall_total_policy_count)}
              </div>
              <div className="mt-1 text-sm font-medium text-blue-400">
                Total policies in target
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-transparent p-5 relative overflow-hidden group hover:border-emerald-500/30 transition-colors">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <TrendingUp size={16} className="text-emerald-400" />
                </div>
                <div className="text-xs font-bold uppercase tracking-widest text-gray-400">
                  Conversion Rate
                </div>
              </div>
              <div className="text-3xl font-black text-white tracking-tight">
                {predictionData.summary.overall_predicted_paid_pct.toFixed(1)}%
              </div>
              <div className="mt-1 text-sm font-medium text-emerald-400">
                Overall predicted rate
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-transparent p-5 relative overflow-hidden group hover:border-purple-500/30 transition-colors">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center">
                  <DollarSign size={16} className="text-purple-400" />
                </div>
                <div className="text-xs font-bold uppercase tracking-widest text-gray-400">
                  Predicted Amount
                </div>
              </div>
              <div className="text-3xl font-black text-white tracking-tight">
                {formatCurrency(predictionData.summary.overall_predicted_collected_amount)}
              </div>
              <div className="mt-1 text-sm font-medium text-purple-400">
                Expected collection
              </div>
            </div>
          </div>

          {/* Reference Months Info */}
          <GlassCard className="!p-4">
            <div className="flex items-center gap-2 mb-2">
              <Calendar size={14} className="text-pink-400" />
              <span className="text-xs font-semibold text-white uppercase tracking-widest">Reference Months (T-4 to T-1)</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {predictionData.reference_months.map((month) => (
                <span key={month} className="px-3 py-1 rounded-lg bg-white/5 border border-white/10 text-xs text-gray-300">
                  {month}
                </span>
              ))}
            </div>
          </GlassCard>

          {/* Core Analytics Charts */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <GlassCard title="Historical Trendline" subtitle="Volume-weighted paid percentage across reference months">
              <div className="h-[300px] w-full pt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={historicalTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      {uniqueChannels.map((ch, idx) => (
                        <linearGradient key={`grad-${ch}`} id={`color-ch-${ch}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={COLORS[idx % COLORS.length]} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={COLORS[idx % COLORS.length]} stopOpacity={0} />
                        </linearGradient>
                      ))}
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="month" stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 11, fontWeight: 500 }} tickLine={false} axisLine={false} />
                    <YAxis stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                    <RechartsTooltip
                      contentStyle={{ backgroundColor: 'rgba(15,15,20,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5)' }}
                      itemStyle={{ fontSize: 13, fontWeight: 600 }}
                      labelStyle={{ color: '#9ca3af', marginBottom: '4px', fontSize: 12, fontWeight: 700 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12, fontWeight: 500, paddingTop: '10px' }} iconType="circle" />
                    {uniqueChannels.map((ch, idx) => (
                      <Area
                        key={ch} type="monotone" dataKey={ch} name={ch}
                        stroke={COLORS[idx % COLORS.length]} strokeWidth={3}
                        fillOpacity={1} fill={`url(#color-ch-${ch})`}
                        activeDot={{ r: 6, strokeWidth: 0 }}
                      />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </GlassCard>

            <GlassCard title="Lapse Decay Curve" subtitle="Historical paid rate deterioration by aging band">
              <div className="h-[300px] w-full pt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={lapseBandChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="band" stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 11, fontWeight: 500 }} tickLine={false} axisLine={false} />
                    <YAxis stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                    <RechartsTooltip
                      contentStyle={{ backgroundColor: 'rgba(15,15,20,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5)' }}
                      labelFormatter={(label) => `Lapse Days: ${label}`}
                      itemStyle={{ fontSize: 13, fontWeight: 600 }}
                      labelStyle={{ color: '#9ca3af', marginBottom: '4px', fontSize: 12, fontWeight: 700 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12, fontWeight: 500, paddingTop: '10px' }} iconType="circle" />
                    {uniqueChannels.map((ch, idx) => (
                      <Line
                        key={ch} type="monotone" dataKey={ch} name={ch}
                        stroke={COLORS[idx % COLORS.length]} strokeWidth={3}
                        dot={{ r: 4, strokeWidth: 0, fill: COLORS[idx % COLORS.length] }}
                        activeDot={{ r: 7, strokeWidth: 2, stroke: '#fff' }}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </GlassCard>

            <GlassCard title="Predicted Volume by Channel" subtitle="Total exposure vs Predicted paid counts" className="xl:col-span-2">
              <div className="h-[320px] w-full pt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={channelChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }} barGap={12}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="channel" stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 12, fontWeight: 600 }} tickLine={false} axisLine={false} />
                    <YAxis stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={formatCount} />
                    <RechartsTooltip
                      cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                      contentStyle={{ backgroundColor: 'rgba(15,15,20,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5)' }}
                      itemStyle={{ fontSize: 13, fontWeight: 600 }}
                      labelStyle={{ color: '#9ca3af', marginBottom: '4px', fontSize: 12, fontWeight: 700 }}
                      formatter={(value, name) => [formatCount(value), name]}
                    />
                    <Legend wrapperStyle={{ fontSize: 12, fontWeight: 500, paddingTop: '10px' }} iconType="round" />
                    <Bar dataKey="total_policies" fill="url(#color-exposure)" radius={[6, 6, 0, 0]} barSize={48} name="Total Target Exposure" />
                    <Bar dataKey="predicted_paid" fill="url(#color-paid)" radius={[6, 6, 0, 0]} barSize={48} name="Predicted Paid Policies" />
                    <defs>
                      <linearGradient id="color-exposure" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#4f46e5" />
                        <stop offset="100%" stopColor="#3730a3" />
                      </linearGradient>
                      <linearGradient id="color-paid" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" />
                        <stop offset="100%" stopColor="#059669" />
                      </linearGradient>
                    </defs>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </GlassCard>
          </div>

          {/* Detailed Data Table */}
          <GlassCard title="Channel-Level Prediction Engine Output" subtitle="Granular breakdown of the target month application">
            <div className="space-y-6 mt-2">
              {predictionData.by_channel.map((ch, idx) => (
                <div key={ch.channel} className="rounded-2xl border border-white/5 bg-black/20 overflow-hidden">
                  <div className="bg-white/5 px-5 py-3 border-b border-white/10 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-3.5 h-3.5 rounded-full shadow-[0_0_10px_rgba(255,255,255,0.5)]" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                      <span className="text-base font-bold text-white tracking-wide">{ch.channel}</span>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="flex flex-col items-end">
                        <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Base Hist Rate</span>
                        <span className="text-sm font-bold text-pink-400">{ch.historical_avg_paid_pct.toFixed(1)}%</span>
                      </div>
                      <div className="w-px h-8 bg-white/10"></div>
                      <div className="flex flex-col items-end">
                        <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Target Prediction</span>
                        <span className="text-sm font-bold text-emerald-400">{ch.predicted_paid_pct.toFixed(1)}%</span>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr>
                          <th className="pb-3 text-xs font-bold text-gray-500 uppercase tracking-widest">Lapse Aging Band</th>
                          <th className="pb-3 text-xs font-bold text-gray-500 uppercase tracking-widest text-right">Target Exposure</th>
                          <th className="pb-3 text-xs font-bold text-gray-500 uppercase tracking-widest text-right">Band Hist. Rate</th>
                          <th className="pb-3 text-xs font-bold text-gray-500 uppercase tracking-widest text-right">Predicted Policies</th>
                          <th className="pb-3 text-xs font-bold text-gray-500 uppercase tracking-widest text-right">Predicted Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {ch.lapse_band_breakdown.map((band) => (
                          <tr key={band.lapse_aging_band} className="hover:bg-white/[0.02] transition-colors">
                            <td className="py-2.5 text-sm font-medium text-gray-300">{band.lapse_aging_band} Days</td>
                            <td className="py-2.5 text-sm text-gray-400 font-medium text-right">{formatCount(band.policy_count)}</td>
                            <td className="py-2.5 text-sm font-bold text-pink-500/80 text-right">
                              {band.historical_avg_paid_pct != null ? `${band.historical_avg_paid_pct.toFixed(1)}%` : 'N/A'}
                            </td>
                            <td className="py-2.5 text-sm font-bold text-emerald-400 text-right">{formatCount(band.predicted_paid_count)}</td>
                            <td className="py-2.5 text-sm font-bold text-purple-400 text-right">{formatCurrency(band.predicted_collected_amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>
      )}

      {!loading && !predictionData && !error && (
        <div className="flex flex-col items-center justify-center gap-5 py-24 text-center">
          <div className="w-20 h-20 rounded-3xl flex items-center justify-center bg-gradient-to-br from-pink-500/20 to-rose-500/5 border border-pink-500/20 shadow-[0_0_30px_rgba(236,72,153,0.15)]">
            <TrendingUp size={36} className="text-pink-500" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-white mb-2 tracking-wide">Channel-Based Forecasting</h3>
            <p className="text-sm text-gray-400 max-w-md mx-auto leading-relaxed">
              Select a target month above to run the predictive engine. The system will analyze historical volume-weighted trends across distribution channels.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

const ProductTypeLapsePrediction = () => {
  const [targetMonth, setTargetMonth] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return d.toISOString().slice(0, 7);
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [predictionData, setPredictionData] = useState(null);
  const [lastRun, setLastRun] = useState(null);

  const token = localStorage.getItem('access_token');
  const authHeader = { Authorization: `Bearer ${token}` };

  // Load saved data from localStorage on mount
  useEffect(() => {
    const savedData = localStorage.getItem('product_type_prediction_data');
    const savedLastRun = localStorage.getItem('product_type_prediction_last_run');
    const savedTargetMonth = localStorage.getItem('product_type_prediction_target_month');
    
    if (savedData) {
      try {
        setPredictionData(JSON.parse(savedData));
      } catch (e) {
        console.error('Failed to parse saved prediction data:', e);
      }
    }
    if (savedLastRun) {
      setLastRun(savedLastRun);
    }
    if (savedTargetMonth) {
      setTargetMonth(savedTargetMonth);
    }
  }, []);

  const handleRunPrediction = async () => {
    setLoading(true);
    setError(null);
    setPredictionData(null);
    try {
      const { data } = await api.post('/product-type-prediction/lapse', {
        target_month: targetMonth,
      }, { headers: authHeader });
      setPredictionData(data);
      setLastRun(new Date().toLocaleTimeString());
      
      // Save to localStorage for persistence
      localStorage.setItem('product_type_prediction_data', JSON.stringify(data));
      localStorage.setItem('product_type_prediction_last_run', new Date().toLocaleTimeString());
      localStorage.setItem('product_type_prediction_target_month', targetMonth);
    } catch (err) {
      setError(err.response?.data?.detail ?? err.message ?? 'Failed to generate prediction.');
    } finally {
      setLoading(false);
    }
  };

  const formatCount = (value) => {
    if (value == null || isNaN(value)) return '0';
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
    return value.toLocaleString();
  };

  const formatCurrency = (value) => {
    if (value == null || isNaN(value)) return '₹0';
    if (value >= 10000000) return `₹${(value / 10000000).toFixed(1)}Cr`;
    if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
    if (value >= 1000) return `₹${(value / 1000).toFixed(1)}K`;
    return `₹${value.toFixed(0)}`;
  };

  // Colors for product types
  const COLORS = ['#fbbf24', '#f87171', '#60a5fa', '#34d399', '#6366f1', '#f472b6'];

  // Prepare chart data
  const { productTypeChartData, lapseBandChartData, historicalTrendData } = useMemo(() => {
    if (!predictionData) return { productTypeChartData: [], lapseBandChartData: [], historicalTrendData: [] };

    // 1. Product Type Comparison
    const ptData = predictionData.by_product_type.map(item => ({
      product_type: item.product_type,
      total_policies: item.total_policy_count,
      predicted_paid: item.predicted_paid_count,
      historical_paid_pct: item.historical_avg_paid_pct,
    }));

    // 2. Lapse Band Decay Curve
    const bandData = [];
    const allBands = new Set();
    predictionData.by_product_type.forEach(pt => {
      pt.lapse_band_breakdown.forEach(band => allBands.add(band.lapse_aging_band));
    });

    const sortedBands = Array.from(allBands).sort((a, b) => {
      const numA = parseInt(a.split('-')[0]) || 0;
      const numB = parseInt(b.split('-')[0]) || 0;
      return numA - numB;
    });

    sortedBands.forEach(band => {
      const dataPoint = { band };
      predictionData.by_product_type.forEach(pt => {
        const bandDetails = pt.lapse_band_breakdown.find(b => b.lapse_aging_band === band);
        dataPoint[pt.product_type] = bandDetails ? bandDetails.historical_avg_paid_pct : null;
      });
      bandData.push(dataPoint);
    });

    // 3. Historical Trendline (T-4 to T-1)
    const trendData = predictionData.reference_month_details.map(ref => {
      const dataPoint = { month: ref.month };
      ref.product_type_paid_pct.forEach(pt => {
        dataPoint[pt.product_type] = pt.avg_paid_pct;
      });
      return dataPoint;
    });
    trendData.sort((a, b) => a.month.localeCompare(b.month));

    return { productTypeChartData: ptData, lapseBandChartData: bandData, historicalTrendData: trendData };
  }, [predictionData]);

  const uniqueProductTypes = useMemo(() => {
    return predictionData?.by_product_type?.map(pt => pt.product_type) || [];
  }, [predictionData]);

  return (
    <div className="flex flex-col gap-5 animate-fade-in-up pb-6">
      {/* Header */}
      <GlassCard className="!p-5 border-b-2 border-b-yellow-500/50 shadow-lg shadow-black/20 shrink-0">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
          <div className="flex items-start gap-4">
            <div className="p-3.5 rounded-xl bg-gradient-to-br from-yellow-500/20 to-amber-600/10 border border-yellow-500/30 text-yellow-400 mt-0.5 shadow-inner">
              <BarChart3 size={24} />
            </div>
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h2 className="text-lg font-bold text-white tracking-wide">Product Type-Based Lapse Prediction</h2>
                <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-yellow-500/15 border border-yellow-500/30 text-yellow-400 font-semibold tracking-wider uppercase">
                  Product Type
                </span>
              </div>
              <p className="text-sm text-gray-400">Forecasting by product type using 4-month historical trendlines.</p>
              {lastRun && <div className="flex items-center gap-1.5 mt-2"><Clock size={12} className="text-gray-500" /><span className="text-xs text-gray-500 font-medium">Last computed: {lastRun}</span></div>}
            </div>
          </div>
          <div className="flex items-center gap-3 w-full md:w-auto bg-black/20 p-2 rounded-2xl border border-white/5">
            <div className="flex flex-col gap-1 flex-1 md:flex-none px-2">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Target Month</label>
              <input
                type="month"
                value={targetMonth}
                onChange={(e) => setTargetMonth(e.target.value)}
                className="bg-transparent border-none p-0 text-base font-semibold text-white focus:outline-none focus:ring-0 transition-all cursor-pointer appearance-none selection:bg-transparent"
              />
            </div>
            <div className="h-8 w-px bg-white/10 mx-1"></div>
            <button
              onClick={handleRunPrediction}
              disabled={loading}
              className={`flex items-center whitespace-nowrap gap-2 px-6 py-2.5 rounded-xl font-bold text-sm transition-all ${loading ? 'bg-gray-800/50 text-gray-500 cursor-not-allowed border border-white/5'
                  : 'bg-gradient-to-r from-yellow-600 to-amber-500 hover:from-yellow-500 hover:to-amber-400 active:scale-95 text-white shadow-lg shadow-yellow-900/30 border border-yellow-400/30'}`}
            >
              {loading ? <><RefreshCw size={16} className="animate-spin" /> Processing…</> : <><Play size={16} fill="currentColor" /> Forecast</>}
            </button>
          </div>
        </div>
      </GlassCard>

      {error && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm shadow-lg">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <div>
            <div className="font-bold mb-0.5 text-red-300">Forecasting Engine Error</div>
            <div className="text-xs text-red-400/80">{error}</div>
          </div>
        </div>
      )}

      {loading && (
        <div className="flex flex-col items-center justify-center gap-6 py-20">
          <div className="relative w-20 h-20">
            <div className="absolute inset-0 rounded-full border-2 border-white/5" />
            <div className="absolute inset-2 rounded-full border-2 animate-spin" style={{ borderColor: '#eab30833', borderTopColor: '#eab308', animationDuration: '1s' }} />
            <div className="absolute inset-0 flex items-center justify-center">
              <Activity size={24} style={{ color: '#eab308' }} className="animate-pulse" />
            </div>
          </div>
          <div className="text-center">
            <p className="text-base font-bold text-white tracking-wide">Analyzing Product Type Trends…</p>
            <p className="text-sm text-gray-500 mt-1">Calculating volume-weighted predictions across product types</p>
          </div>
        </div>
      )}

      {!loading && predictionData && (
        <div className="flex flex-col gap-5">
          {/* Top KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-transparent p-5 relative overflow-hidden group hover:border-yellow-500/30 transition-colors">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <DollarSign size={64} />
              </div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-full bg-yellow-500/20 flex items-center justify-center">
                  <DollarSign size={16} className="text-yellow-400" />
                </div>
                <div className="text-xs font-bold uppercase tracking-widest text-gray-400">
                  Predicted Paid
                </div>
              </div>
              <div className="text-3xl font-black text-white tracking-tight">
                {formatCount(predictionData.summary.overall_predicted_paid_count)}
              </div>
              <div className="mt-1 text-sm font-medium text-yellow-500">
                Policies expected to pay
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-transparent p-5 relative overflow-hidden group hover:border-blue-500/30 transition-colors">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
                  <BarChart3 size={16} className="text-blue-400" />
                </div>
                <div className="text-xs font-bold uppercase tracking-widest text-gray-400">
                  Total Exposure
                </div>
              </div>
              <div className="text-3xl font-black text-white tracking-tight">
                {formatCount(predictionData.summary.overall_total_policy_count)}
              </div>
              <div className="mt-1 text-sm font-medium text-blue-400">
                Total policies in target
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-transparent p-5 relative overflow-hidden group hover:border-emerald-500/30 transition-colors">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <TrendingUp size={16} className="text-emerald-400" />
                </div>
                <div className="text-xs font-bold uppercase tracking-widest text-gray-400">
                  Conversion Rate
                </div>
              </div>
              <div className="text-3xl font-black text-white tracking-tight">
                {predictionData.summary.overall_predicted_paid_pct.toFixed(1)}%
              </div>
              <div className="mt-1 text-sm font-medium text-emerald-400">
                Overall predicted rate
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-transparent p-5 relative overflow-hidden group hover:border-purple-500/30 transition-colors">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center">
                  <DollarSign size={16} className="text-purple-400" />
                </div>
                <div className="text-xs font-bold uppercase tracking-widest text-gray-400">
                  Predicted Amount
                </div>
              </div>
              <div className="text-3xl font-black text-white tracking-tight">
                {formatCurrency(predictionData.summary.overall_predicted_collected_amount)}
              </div>
              <div className="mt-1 text-sm font-medium text-purple-400">
                Expected collection
              </div>
            </div>
          </div>

          {/* Reference Months Info */}
          <GlassCard className="!p-4">
            <div className="flex items-center gap-2 mb-2">
              <Calendar size={14} className="text-yellow-400" />
              <span className="text-xs font-semibold text-white uppercase tracking-widest">Reference Months (T-4 to T-1)</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {predictionData.reference_months.map((month) => (
                <span key={month} className="px-3 py-1 rounded-lg bg-white/5 border border-white/10 text-xs text-gray-300">
                  {month}
                </span>
              ))}
            </div>
          </GlassCard>

          {/* Core Analytics Charts */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <GlassCard title="Historical Trendline" subtitle="Volume-weighted paid percentage across reference months">
              <div className="h-[300px] w-full pt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={historicalTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      {uniqueProductTypes.map((pt, idx) => (
                        <linearGradient key={`grad-${pt}`} id={`color-pt-${pt}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={COLORS[idx % COLORS.length]} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={COLORS[idx % COLORS.length]} stopOpacity={0} />
                        </linearGradient>
                      ))}
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="month" stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 11, fontWeight: 500 }} tickLine={false} axisLine={false} />
                    <YAxis stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                    <RechartsTooltip
                      contentStyle={{ backgroundColor: 'rgba(15,15,20,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5)' }}
                      itemStyle={{ fontSize: 13, fontWeight: 600 }}
                      labelStyle={{ color: '#9ca3af', marginBottom: '4px', fontSize: 12, fontWeight: 700 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12, fontWeight: 500, paddingTop: '10px' }} iconType="circle" />
                    {uniqueProductTypes.map((pt, idx) => (
                      <Area
                        key={pt} type="monotone" dataKey={pt} name={pt}
                        stroke={COLORS[idx % COLORS.length]} strokeWidth={3}
                        fillOpacity={1} fill={`url(#color-pt-${pt})`}
                        activeDot={{ r: 6, strokeWidth: 0 }}
                      />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </GlassCard>

            <GlassCard title="Lapse Decay Curve" subtitle="Historical paid rate deterioration by aging band">
              <div className="h-[300px] w-full pt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={lapseBandChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="band" stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 11, fontWeight: 500 }} tickLine={false} axisLine={false} />
                    <YAxis stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                    <RechartsTooltip
                      contentStyle={{ backgroundColor: 'rgba(15,15,20,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5)' }}
                      labelFormatter={(label) => `Lapse Days: ${label}`}
                      itemStyle={{ fontSize: 13, fontWeight: 600 }}
                      labelStyle={{ color: '#9ca3af', marginBottom: '4px', fontSize: 12, fontWeight: 700 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12, fontWeight: 500, paddingTop: '10px' }} iconType="circle" />
                    {uniqueProductTypes.map((pt, idx) => (
                      <Line
                        key={pt} type="monotone" dataKey={pt} name={pt}
                        stroke={COLORS[idx % COLORS.length]} strokeWidth={3}
                        dot={{ r: 4, strokeWidth: 0, fill: COLORS[idx % COLORS.length] }}
                        activeDot={{ r: 7, strokeWidth: 2, stroke: '#fff' }}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </GlassCard>

            <GlassCard title="Predicted Volume by Product Type" subtitle="Total exposure vs Predicted paid counts" className="xl:col-span-2">
              <div className="h-[320px] w-full pt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={productTypeChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }} barGap={12}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="product_type" stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 12, fontWeight: 600 }} tickLine={false} axisLine={false} />
                    <YAxis stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={formatCount} />
                    <RechartsTooltip
                      cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                      contentStyle={{ backgroundColor: 'rgba(15,15,20,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5)' }}
                      itemStyle={{ fontSize: 13, fontWeight: 600 }}
                      labelStyle={{ color: '#9ca3af', marginBottom: '4px', fontSize: 12, fontWeight: 700 }}
                      formatter={(value, name) => [formatCount(value), name]}
                    />
                    <Legend wrapperStyle={{ fontSize: 12, fontWeight: 500, paddingTop: '10px' }} iconType="round" />
                    <Bar dataKey="total_policies" fill="url(#color-exposure)" radius={[6, 6, 0, 0]} barSize={48} name="Total Target Exposure" />
                    <Bar dataKey="predicted_paid" fill="url(#color-paid)" radius={[6, 6, 0, 0]} barSize={48} name="Predicted Paid Policies" />
                    <defs>
                      <linearGradient id="color-exposure" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#4f46e5" />
                        <stop offset="100%" stopColor="#3730a3" />
                      </linearGradient>
                      <linearGradient id="color-paid" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" />
                        <stop offset="100%" stopColor="#059669" />
                      </linearGradient>
                    </defs>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </GlassCard>
          </div>

          {/* Detailed Data Table */}
          <GlassCard title="Product Type-Level Prediction Engine Output" subtitle="Granular breakdown of the target month application">
            <div className="space-y-6 mt-2">
              {predictionData.by_product_type.map((pt, idx) => (
                <div key={pt.product_type} className="rounded-2xl border border-white/5 bg-black/20 overflow-hidden">
                  <div className="bg-white/5 px-5 py-3 border-b border-white/10 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-3.5 h-3.5 rounded-full shadow-[0_0_10px_rgba(255,255,255,0.5)]" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                      <span className="text-base font-bold text-white tracking-wide">{pt.product_type}</span>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="flex flex-col items-end">
                        <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Base Hist Rate</span>
                        <span className="text-sm font-bold text-yellow-400">{pt.historical_avg_paid_pct.toFixed(1)}%</span>
                      </div>
                      <div className="w-px h-8 bg-white/10"></div>
                      <div className="flex flex-col items-end">
                        <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Target Prediction</span>
                        <span className="text-sm font-bold text-emerald-400">{pt.predicted_paid_pct.toFixed(1)}%</span>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr>
                          <th className="pb-3 text-xs font-bold text-gray-500 uppercase tracking-widest">Lapse Aging Band</th>
                          <th className="pb-3 text-xs font-bold text-gray-500 uppercase tracking-widest text-right">Target Exposure</th>
                          <th className="pb-3 text-xs font-bold text-gray-500 uppercase tracking-widest text-right">Band Hist. Rate</th>
                          <th className="pb-3 text-xs font-bold text-gray-500 uppercase tracking-widest text-right">Predicted Policies</th>
                          <th className="pb-3 text-xs font-bold text-gray-500 uppercase tracking-widest text-right">Predicted Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {pt.lapse_band_breakdown.map((band) => (
                          <tr key={band.lapse_aging_band} className="hover:bg-white/[0.02] transition-colors">
                            <td className="py-2.5 text-sm font-medium text-gray-300">{band.lapse_aging_band} Days</td>
                            <td className="py-2.5 text-sm text-gray-400 font-medium text-right">{formatCount(band.policy_count)}</td>
                            <td className="py-2.5 text-sm font-bold text-yellow-500/80 text-right">
                              {band.historical_avg_paid_pct != null ? `${band.historical_avg_paid_pct.toFixed(1)}%` : 'N/A'}
                            </td>
                            <td className="py-2.5 text-sm font-bold text-emerald-400 text-right">{formatCount(band.predicted_paid_count)}</td>
                            <td className="py-2.5 text-sm font-bold text-purple-400 text-right">{formatCurrency(band.predicted_collected_amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>
      )}

      {!loading && !predictionData && !error && (
        <div className="flex flex-col items-center justify-center gap-5 py-24 text-center">
          <div className="w-20 h-20 rounded-3xl flex items-center justify-center bg-gradient-to-br from-yellow-500/20 to-amber-500/5 border border-yellow-500/20 shadow-[0_0_30px_rgba(234,179,8,0.15)]">
            <TrendingUp size={36} className="text-yellow-500" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-white mb-2 tracking-wide">Product Type-Based Forecasting</h3>
            <p className="text-sm text-gray-400 max-w-md mx-auto leading-relaxed">
              Select a target month above to run the predictive engine. The system will analyze historical volume-weighted trends across product types.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default PredictionWindow;
