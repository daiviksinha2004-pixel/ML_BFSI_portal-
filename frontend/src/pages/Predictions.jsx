import React, { useState, useEffect, useRef } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell, RadarChart, PolarGrid,
  PolarAngleAxis, Radar, LineChart, Line, AreaChart, Area,
} from 'recharts';
import {
  BrainCircuit, Target, Database, Activity, Play,
  ShieldCheck, TrendingUp, AlertTriangle,
  CheckCircle2, XCircle, Cpu, RefreshCw,
  Clock, GitBranch, Sigma, Calendar, DollarSign,
  BarChart3, ArrowUpRight, ArrowDownRight,
} from 'lucide-react';
import GlassCard from '../components/ui/GlassCard';
import { useDomain } from '../context/DomainContext';
import api, { apiV2 } from '../api';

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

// ─────────────────────────────────────────────
// NORMALISE HELPERS
// RF  returns: true_positives / true_negatives / false_positives / false_negatives
// LR  returns: tp / tn / fp / fn
// ─────────────────────────────────────────────
const normCM = (cm = {}) => ({
  tp: cm.tp ?? cm.true_positives  ?? 0,
  tn: cm.tn ?? cm.true_negatives  ?? 0,
  fp: cm.fp ?? cm.false_positives ?? 0,
  fn: cm.fn ?? cm.false_negatives ?? 0,
});

// RF  returns: accuracy_pct / precision_pct / recall_pct / f1_score_pct / roc_auc_pct
// LR  returns: accuracy / precision / recall / f1 / auc
const normMetrics = (m = {}) => ({
  accuracy:  m.accuracy  ?? m.accuracy_pct  ?? 0,
  precision: m.precision ?? m.precision_pct ?? 0,
  recall:    m.recall    ?? m.recall_pct    ?? 0,
  f1:        m.f1        ?? m.f1_score_pct  ?? 0,
  auc:       m.auc       ?? m.roc_auc_pct   ?? 0,
});

// ─────────────────────────────────────────────
// SCORE HELPERS
// ─────────────────────────────────────────────
const fmt = (v) =>
  v === 'N/A' || v == null ? 'N/A' : `${Number(v).toFixed(1)}%`;

const scoreBadge = (pct) => {
  if (pct === 'N/A' || pct == null) return 'text-gray-400 bg-gray-500/10 border-gray-500/20';
  const n = Number(pct);
  if (n >= 80) return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
  if (n >= 60) return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20';
  return 'text-red-400 bg-red-500/10 border-red-500/20';
};

const scoreColor = (pct) => {
  if (pct == null || pct === 'N/A') return '#6b7280';
  const n = Number(pct);
  if (n >= 80) return '#34d399';
  if (n >= 60) return '#fbbf24';
  return '#f87171';
};

// ─────────────────────────────────────────────
// ANIMATED NUMBER
// ─────────────────────────────────────────────
const AnimatedNumber = ({ value, decimals = 1 }) => {
  const [display, setDisplay] = useState(0);
  const raf = useRef(null);

  useEffect(() => {
    const target = Number(value) || 0;
    const start  = performance.now();
    const tick   = (now) => {
      const p = Math.min((now - start) / 900, 1);
      setDisplay((1 - Math.pow(1 - p, 3)) * target);
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [value]);

  if (value === 'N/A' || value == null) return <span>N/A</span>;
  return <span>{display.toFixed(decimals)}%</span>;
};

// ─────────────────────────────────────────────
// SECTION DIVIDER
// ─────────────────────────────────────────────
const SectionDivider = ({ label, color = 'purple' }) => {
  const c = color === 'purple'
    ? 'from-transparent via-purple-500/30 to-transparent text-purple-400 bg-purple-500/10 border-purple-500/25'
    : 'from-transparent via-teal-500/30 to-transparent text-teal-400 bg-teal-500/10 border-teal-500/25';
  const [grad, textCls, bgCls, borderCls] = c.split(' ');
  return (
    <div className="flex items-center gap-4 my-1 shrink-0">
      <div className={`flex-1 h-px bg-gradient-to-r ${grad} via-purple-500/30`} />
      <div className={`flex items-center gap-2 px-3 py-1 rounded-full border ${bgCls} ${borderCls}`}>
        <div className={`w-1.5 h-1.5 rounded-full ${textCls} opacity-60 bg-current`} />
        <span className={`text-[10px] font-semibold uppercase tracking-widest ${textCls}`}>{label}</span>
      </div>
      <div className={`flex-1 h-px bg-gradient-to-l ${grad} via-purple-500/30`} />
    </div>
  );
};

// ─────────────────────────────────────────────
// TRAINING LOADER
// ─────────────────────────────────────────────
const TrainingLoader = ({ label = 'Training model…', accentColor = '#a855f7' }) => (
  <div className="flex flex-col items-center justify-center gap-5 py-12">
    <div className="relative w-16 h-16">
      <div className="absolute inset-0 rounded-full border border-white/5" />
      <div
        className="absolute inset-2 rounded-full border-2 animate-spin"
        style={{ borderColor: `${accentColor}33`, borderTopColor: accentColor, animationDuration: '1.1s' }}
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <BrainCircuit size={16} style={{ color: accentColor }} />
      </div>
    </div>
    <div className="text-center">
      <p className="text-sm font-medium text-white">{label}</p>
      <p className="text-xs text-gray-600 mt-0.5">Running time-series split & feature engineering</p>
    </div>
    <div className="flex gap-1.5">
      {[0,1,2,3,4].map(i => (
        <div key={i} className="w-1.5 h-1.5 rounded-full animate-bounce"
          style={{ backgroundColor: accentColor, animationDelay: `${i * 0.12}s` }} />
      ))}
    </div>
  </div>
);

// ─────────────────────────────────────────────
// ERROR BANNER
// ─────────────────────────────────────────────
const ErrorBanner = ({ error }) => (
  <div className="flex items-start gap-3 p-4 rounded-xl bg-red-500/8 border border-red-500/20 text-red-400 text-sm shrink-0">
    <AlertTriangle size={15} className="shrink-0 mt-0.5" />
    <div>
      <div className="font-medium mb-0.5">Training failed</div>
      <div className="text-xs text-red-400/70 break-all">{error}</div>
    </div>
  </div>
);

// ─────────────────────────────────────────────
// METRIC CARD
// ─────────────────────────────────────────────
const MetricCard = ({ label, value, icon: Icon, subtitle, delay = 0 }) => (
  <div
    className="relative rounded-2xl border border-white/8 bg-white/3 p-4 overflow-hidden hover:border-white/15 transition-all duration-300"
    style={{ animationDelay: `${delay}ms` }}
  >
    <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t-2xl"
      style={{ backgroundColor: scoreColor(value), opacity: 0.7 }} />
    <div className="flex items-start justify-between mb-3">
      <div className="p-2 rounded-lg bg-white/5">
        <Icon size={13} className="text-gray-400" />
      </div>
      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${scoreBadge(value)}`}>
        {fmt(value)}
      </span>
    </div>
    <div className="text-2xl font-light text-white tabular-nums">
      <AnimatedNumber value={value} />
    </div>
    <div className="text-xs font-medium text-gray-300 mt-1">{label}</div>
    {subtitle && <div className="text-[10px] text-gray-600 mt-0.5">{subtitle}</div>}
  </div>
);

const MetricsRow = ({ metrics }) => (
  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
    <MetricCard label="Accuracy"  value={metrics.accuracy}  icon={Target}      subtitle="Overall correct"         delay={0}   />
    <MetricCard label="Precision" value={metrics.precision} icon={ShieldCheck}  subtitle="Predicted positives"     delay={60}  />
    <MetricCard label="Recall"    value={metrics.recall}    icon={TrendingUp}   subtitle="Actual positives caught" delay={120} />
    <MetricCard label="F1 Score"  value={metrics.f1}        icon={Activity}     subtitle="Precision × recall"      delay={180} />
    <MetricCard label="ROC-AUC"   value={metrics.auc}       icon={BrainCircuit} subtitle="Ranking quality"         delay={240} />
  </div>
);

// ─────────────────────────────────────────────
// SUMMARY STRIP
// ─────────────────────────────────────────────
const SummaryStrip = ({ metrics, cm }) => {
  const { tn, fp, fn, tp } = cm;
  const total = tn + fp + fn + tp;
  const g = (k) => `${Number(metrics[k] || 0).toFixed(1)}%`;
  const items = [
    { label: 'Test Records',    value: total.toLocaleString(), icon: Database },
    { label: 'True Positives',  value: tp.toLocaleString(),    icon: CheckCircle2 },
    { label: 'False Positives', value: fp.toLocaleString(),    icon: XCircle },
    { label: 'Precision',       value: g('precision'),          icon: ShieldCheck },
    { label: 'Recall',          value: g('recall'),             icon: TrendingUp },
    { label: 'F1 Score',        value: g('f1'),                 icon: Activity },
  ];
  return (
    <div className="grid grid-cols-3 md:grid-cols-6 gap-2 shrink-0">
      {items.map(({ label, value, icon: Icon }) => (
        <div key={label} className="flex flex-col items-center gap-1.5 rounded-xl bg-white/3 border border-white/6 p-3 text-center">
          <Icon size={11} className="text-gray-500" />
          <span className="text-sm font-semibold text-white tabular-nums">{value}</span>
          <span className="text-[9px] uppercase tracking-widest text-gray-600">{label}</span>
        </div>
      ))}
    </div>
  );
};

// ─────────────────────────────────────────────
// CONFUSION MATRIX
// ─────────────────────────────────────────────
const ConfusionMatrix = ({ cm }) => {
  const { tn, fp, fn, tp } = cm;
  const total = tp + tn + fp + fn;
  const cells = [
    { label: 'True Negative',  value: tn, sub: 'Correctly: Will Default', color: 'from-emerald-500/10 to-emerald-500/5 border-emerald-500/20', text: 'text-emerald-300', icon: CheckCircle2 },
    { label: 'False Positive', value: fp, sub: 'Predicted Pay · Defaulted', color: 'from-red-500/10 to-red-500/5 border-red-500/20',           text: 'text-red-300',     icon: XCircle },
    { label: 'False Negative', value: fn, sub: 'Predicted Default · Paid',  color: 'from-amber-500/10 to-amber-500/5 border-amber-500/20',     text: 'text-amber-300',   icon: AlertTriangle },
    { label: 'True Positive',  value: tp, sub: 'Correctly: Will Pay',       color: 'from-teal-500/10 to-teal-500/5 border-teal-500/20',         text: 'text-teal-300',    icon: CheckCircle2 },
  ];
  return (
    <GlassCard title="Confusion Matrix" subtitle={`${total.toLocaleString()} test records`} icon={Target}>
      <div className="grid grid-cols-2 gap-2.5 mt-2">
        {cells.map(({ label, value, sub, color, text, icon: Icon }) => (
          <div key={label} className={`rounded-xl border bg-gradient-to-br p-4 ${color}`}>
            <div className={`flex items-center gap-1.5 mb-2 ${text}`}>
              <Icon size={12} />
              <span className="text-[10px] font-semibold uppercase tracking-widest">{label}</span>
            </div>
            <div className={`text-2xl font-light ${text}`}>{value.toLocaleString()}</div>
            <div className="text-[10px] text-gray-500 mt-1">{sub}</div>
            <div className="text-[10px] text-gray-600 mt-0.5">
              {total > 0 ? ((value / total) * 100).toFixed(1) : 0}% of set
            </div>
          </div>
        ))}
      </div>
    </GlassCard>
  );
};

// ─────────────────────────────────────────────
// RADAR CHART
// ─────────────────────────────────────────────
const MetricsRadar = ({ metrics, accentColor = '#a855f7' }) => {
  const data = [
    { metric: 'Accuracy',  value: Number(metrics.accuracy)  || 0 },
    { metric: 'Precision', value: Number(metrics.precision) || 0 },
    { metric: 'Recall',    value: Number(metrics.recall)    || 0 },
    { metric: 'F1',        value: Number(metrics.f1)        || 0 },
    { metric: 'AUC',       value: Number(metrics.auc)       || 0 },
  ];
  return (
    <GlassCard title="Performance Profile" subtitle="All metrics 0–100">
      <ResponsiveContainer width="100%" height={220}>
        <RadarChart data={data} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
          <PolarGrid stroke="rgba(255,255,255,0.06)" />
          <PolarAngleAxis dataKey="metric" tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 11 }} />
          <Radar dataKey="value" stroke={accentColor} fill={accentColor} fillOpacity={0.15} strokeWidth={1.5} dot={{ fill: accentColor, r: 3 }} />
          <RechartsTooltip
            contentStyle={{ backgroundColor: 'rgba(10,10,15,0.92)', border: `1px solid ${accentColor}44`, borderRadius: '10px', fontSize: 12 }}
            formatter={(v) => [`${Number(v).toFixed(1)}%`, 'Score']}
          />
        </RadarChart>
      </ResponsiveContainer>
    </GlassCard>
  );
};

// ─────────────────────────────────────────────
// BAR + PIE CHARTS
// ─────────────────────────────────────────────
const MLCharts = ({ cm, testMonth, colors }) => {
  const { tn, fp, fn, tp } = cm;
  const total = tn + fp + fn + tp;
  const barData = [
    { name: 'Actual',    'Will Pay': tp + fn, 'Will Default': tn + fp },
    { name: 'Predicted', 'Will Pay': tp + fp, 'Will Default': tn + fn },
  ];
  const pieData = [
    { name: 'Will Pay',     value: tp + fp },
    { name: 'Will Default', value: tn + fn },
  ];
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <GlassCard title="Actual vs. Predicted" subtitle={`Test month: ${testMonth}`}>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={barData} margin={{ top: 12, right: 12, left: -24, bottom: 0 }} barGap={8}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis dataKey="name" stroke="rgba(255,255,255,0.25)" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
            <YAxis stroke="rgba(255,255,255,0.25)" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} />
            <RechartsTooltip cursor={{ fill: 'rgba(255,255,255,0.03)' }}
              contentStyle={{ backgroundColor: 'rgba(10,10,15,0.92)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
            <Bar dataKey="Will Pay"     fill={colors.success} radius={[4,4,0,0]} barSize={36} />
            <Bar dataKey="Will Default" fill={colors.fail}    radius={[4,4,0,0]} barSize={36} />
          </BarChart>
        </ResponsiveContainer>
      </GlassCard>
      <GlassCard title="AI Forecast Distribution" subtitle={`${total.toLocaleString()} accounts`}>
        <ResponsiveContainer width="100%" height={180}>
          <PieChart>
            <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={80}
              paddingAngle={3} dataKey="value" stroke="none" animationBegin={200}>
              <Cell fill={colors.success} />
              <Cell fill={colors.fail} />
            </Pie>
            <RechartsTooltip contentStyle={{ backgroundColor: 'rgba(10,10,15,0.92)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
        <div className="flex justify-center gap-6 -mt-1">
          {pieData.map((d, i) => (
            <div key={d.name} className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: i === 0 ? colors.success : colors.fail }} />
              <span className="text-xs text-gray-400">{d.name}</span>
              <span className="text-xs font-semibold text-white">{d.value.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
};

// ─────────────────────────────────────────────
// FULL RESULTS BLOCK (reused by both models)
// ─────────────────────────────────────────────
const ModelResults = ({ metrics, cm, testMonth, colors, accentColor }) => (
  <div className="flex flex-col gap-4">
    <SummaryStrip metrics={metrics} cm={cm} />
    <MetricsRow metrics={metrics} />
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <MetricsRadar metrics={metrics} accentColor={accentColor} />
      <ConfusionMatrix cm={cm} />
    </div>
    <MLCharts cm={cm} testMonth={testMonth} colors={colors} />
  </div>
);

// ─────────────────────────────────────────────
// EMPTY STATE
// ─────────────────────────────────────────────
const EmptyState = ({ icon: Icon, label, color }) => (
  <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
    <div className="w-14 h-14 rounded-2xl flex items-center justify-center border"
      style={{ backgroundColor: `${color}18`, borderColor: `${color}33` }}>
      <Icon size={24} style={{ color }} />
    </div>
    <div>
      <h3 className="text-sm font-medium text-white mb-1">{label}</h3>
      <p className="text-xs text-gray-500">Select a test month and click Run Model.</p>
    </div>
  </div>
);

// ─────────────────────────────────────────────
// ① RANDOM FOREST  (V1)
// ─────────────────────────────────────────────
const RandomForestSection = ({ scope }) => {
  const [testMonth, setTestMonth] = useState('2025-12-01');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [result, setResult]       = useState(null);
  const [lastRun, setLastRun]     = useState(null);

  const handleRun = async () => {
    const endpointMap = {
      [PREDICTION_SCOPES.LIFE]: '/ml/train/life-insurance',
      [PREDICTION_SCOPES.DEBT]: '/ml/train/debt-collection',
    };
    const endpoint = endpointMap[scope];
    if (!endpoint) {
      setError('Random Forest is not configured for this domain yet.');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    try {
      // api.baseURL = http://localhost:8080/api/v1  →  hits /api/v1/ml/train/life-insurance
      const { data } = await api.post(endpoint, null, { params: { test_month: testMonth } });
      if (data?.status !== 'success') { setError(data?.message || 'Unexpected response.'); return; }
      setResult({ metrics: normMetrics(data.metrics), cm: normCM(data.confusion_matrix) });
      setLastRun(new Date().toLocaleTimeString());
    } catch (err) {
      setError(err.response?.data?.detail ?? err.message ?? 'Failed to train.');
    } finally {
      setLoading(false);
    }
  };

  const colors = {
    success: scope === PREDICTION_SCOPES.DEBT ? '#fbbf24' : '#2dd4bf',
    fail: '#f87171',
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <GlassCard className="!p-5 border-b-2 border-b-teal-500/40 shrink-0">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-teal-500/15 border border-teal-500/25 text-teal-400 mt-0.5">
              <GitBranch size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <h2 className="text-base font-semibold text-white">Random Forest Training Engine</h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-500/15 border border-teal-500/25 text-teal-300 font-medium tracking-wide">V1</span>
              </div>
              <p className="text-xs text-gray-400">Time-Series Split · Train on prior data · Evaluate on test month.</p>
              {lastRun && <div className="flex items-center gap-1.5 mt-1.5"><Clock size={10} className="text-gray-600" /><span className="text-[10px] text-gray-600">Last run: {lastRun}</span></div>}
            </div>
          </div>
          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="flex flex-col gap-1 flex-1 md:flex-none">
              <label className="text-[10px] text-gray-500 uppercase tracking-widest pl-1">Test Month</label>
              <input type="date" value={testMonth} onChange={(e) => setTestMonth(e.target.value)}
                className="bg-black/30 border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-teal-500/40 transition-all" />
            </div>
            <button onClick={handleRun} disabled={loading}
              className={`flex items-center whitespace-nowrap gap-2 px-5 py-2 rounded-xl font-medium text-sm transition-all mt-4 ${
                loading ? 'bg-gray-700/50 text-gray-500 cursor-not-allowed border border-white/5'
                        : 'bg-teal-600 hover:bg-teal-500 active:scale-95 text-white border border-teal-400/20 shadow-lg shadow-teal-900/20'}`}>
              {loading ? <><RefreshCw size={14} className="animate-spin" /> Training…</> : <><Play size={14} fill="currentColor" /> Run Prediction</>}
            </button>
          </div>
        </div>
      </GlassCard>

      {error   && <ErrorBanner error={error} />}
      {loading && <TrainingLoader label="Training Random Forest…" accentColor="#2dd4bf" />}
      {!loading && result && <ModelResults metrics={result.metrics} cm={result.cm} testMonth={testMonth} colors={colors} accentColor="#2dd4bf" />}
      {!loading && !result && !error && <EmptyState icon={GitBranch} label="Random Forest not run yet" color="#2dd4bf" />}
    </div>
  );
};

// ─────────────────────────────────────────────
// ③ LAPSE FORECAST (KPI Forecasting)
// ─────────────────────────────────────────────
const LapseForecastSection = () => {
  const [targetMonth, setTargetMonth] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return d.toISOString().slice(0, 7);
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [forecastData, setForecastData] = useState(null);
  const [lastRun, setLastRun] = useState(null);

  const token = localStorage.getItem('access_token');
  const authHeader = { Authorization: `Bearer ${token}` };

  const handleRunForecast = async () => {
    setLoading(true);
    setError(null);
    setForecastData(null);
    try {
      const { data } = await api.post('/predictions/lapse-forecast', {
        target_month: targetMonth,
      }, { headers: authHeader });
      setForecastData(data);
      setLastRun(new Date().toLocaleTimeString());
    } catch (err) {
      setError(err.response?.data?.detail ?? err.message ?? 'Failed to generate forecast.');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value) => {
    if (value == null || isNaN(value)) return '₹0';
    if (value >= 10000000) return `₹${(value / 10000000).toFixed(1)}Cr`;
    if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
    if (value >= 1000) return `₹${(value / 1000).toFixed(1)}K`;
    return `₹${value.toFixed(0)}`;
  };

  const formatCount = (value) => {
    if (value == null || isNaN(value)) return '0';
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
    return value.toLocaleString();
  };

  // Prepare chart data for product group summary
  const summaryChartData = forecastData?.summary_by_product_group?.map(item => ({
    product_group: item.product_group,
    target_policies: item.target_policy_count,
    forecast_paid: item.forecast_paid_count,
    paid_percentage: item.avg_paid_percentage,
  })) || [];

  // Prepare chart data for band-level forecast
  const bandChartData = forecastData?.band_level_forecast?.map(item => ({
    band: `${item.policy_aging_band} / ${item.lapse_aging_band}`,
    forecast_paid: item.forecast_paid_count,
    avg_paid_pct: item.avg_paid_percentage,
  })) || [];

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <GlassCard className="!p-5 border-b-2 border-b-indigo-500/40 shrink-0">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-indigo-500/15 border border-indigo-500/25 text-indigo-400 mt-0.5">
              <BarChart3 size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <h2 className="text-base font-semibold text-white">Lapse Forecast & KPI Prediction</h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/15 border border-indigo-500/25 text-indigo-300 font-medium tracking-wide">Rolling 4-Month Avg</span>
              </div>
              <p className="text-xs text-gray-400">Forecast paid policies using policy aging & lapse aging bands from historical data.</p>
              {lastRun && <div className="flex items-center gap-1.5 mt-1.5"><Clock size={10} className="text-gray-600" /><span className="text-[10px] text-gray-600">Last run: {lastRun}</span></div>}
            </div>
          </div>
          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="flex flex-col gap-1 flex-1 md:flex-none">
              <label className="text-[10px] text-gray-500 uppercase tracking-widest pl-1">Target Month</label>
              <input 
                type="month" 
                value={targetMonth} 
                onChange={(e) => setTargetMonth(e.target.value)}
                className="bg-black/30 border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all" 
              />
            </div>
            <button 
              onClick={handleRunForecast} 
              disabled={loading}
              className={`flex items-center whitespace-nowrap gap-2 px-5 py-2 rounded-xl font-medium text-sm transition-all mt-4 ${
                loading ? 'bg-gray-700/50 text-gray-500 cursor-not-allowed border border-white/5'
                        : 'bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white border border-indigo-400/20 shadow-lg shadow-indigo-900/20'}`}
            >
              {loading ? <><RefreshCw size={14} className="animate-spin" /> Generating…</> : <><Play size={14} fill="currentColor" /> Generate Forecast</>}
            </button>
          </div>
        </div>
      </GlassCard>

      {error && <ErrorBanner error={error} />}
      
      {loading && <TrainingLoader label="Generating lapse forecast…" accentColor="#6366f1" />}

      {!loading && forecastData && (
        <div className="flex flex-col gap-4">
          {/* Comparison Months Info */}
          <GlassCard className="!p-4">
            <div className="flex items-center gap-2 mb-2">
              <Calendar size={14} className="text-indigo-400" />
              <span className="text-xs font-semibold text-white uppercase tracking-widest">Comparison Months</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {forecastData.comparison_months.map((month) => (
                <span key={month} className="px-3 py-1 rounded-lg bg-white/5 border border-white/10 text-xs text-gray-300">
                  {month}
                </span>
              ))}
            </div>
          </GlassCard>

          {/* KPI Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {forecastData.summary_by_product_group.map((summary, idx) => (
              <div key={summary.product_group} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 relative overflow-hidden">
                <div className="absolute top-0 left-0 h-full w-1 rounded-l-xl bg-indigo-500" />
                <div className="ml-2">
                  <div className="flex items-center gap-1.5">
                    <DollarSign size={12} className="text-indigo-400" />
                    <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                      {summary.product_group}
                    </div>
                  </div>
                  <div className="mt-2 text-xl font-semibold leading-none text-white">
                    {formatCount(summary.forecast_paid_count)}
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    Forecast paid policies
                  </div>
                  <div className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-indigo-400">
                    <ArrowUpRight size={12} />
                    {summary.avg_paid_percentage.toFixed(1)}% avg paid rate
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Product Group Bar Chart */}
            <GlassCard title="Forecast by Product Group" subtitle="Target vs Forecast paid policies">
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={summaryChartData} margin={{ top: 12, right: 12, left: -24, bottom: 0 }} barGap={8}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis dataKey="product_group" stroke="rgba(255,255,255,0.25)" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                  <YAxis stroke="rgba(255,255,255,0.25)" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} tickFormatter={formatCount} />
                  <RechartsTooltip 
                    cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                    contentStyle={{ backgroundColor: 'rgba(10,10,15,0.92)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', fontSize: 12 }}
                    formatter={(value, name) => [formatCount(value), name === 'target_policies' ? 'Target Policies' : 'Forecast Paid']}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                  <Bar dataKey="target_policies" fill="#6366f1" radius={[4,4,0,0]} barSize={36} name="Target Policies" />
                  <Bar dataKey="forecast_paid" fill="#34d399" radius={[4,4,0,0]} barSize={36} name="Forecast Paid" />
                </BarChart>
              </ResponsiveContainer>
            </GlassCard>

            {/* Band Level Area Chart */}
            <GlassCard title="Band-Level Forecast" subtitle="Paid percentage by aging bands">
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={bandChartData} margin={{ top: 12, right: 12, left: -24, bottom: 0 }}>
                  <defs>
                    <linearGradient id="bandGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f472b6" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#f472b6" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis dataKey="band" stroke="rgba(255,255,255,0.25)" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={60} />
                  <YAxis stroke="rgba(255,255,255,0.25)" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
                  <RechartsTooltip 
                    cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                    contentStyle={{ backgroundColor: 'rgba(10,10,15,0.92)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', fontSize: 12 }}
                    formatter={(value, name) => [`${value.toFixed(1)}%`, name === 'avg_paid_pct' ? 'Avg Paid %' : 'Forecast']}
                  />
                  <Area type="monotone" dataKey="avg_paid_pct" stroke="#f472b6" strokeWidth={2} fill="url(#bandGrad)" name="Avg Paid %" />
                </AreaChart>
              </ResponsiveContainer>
            </GlassCard>
          </div>

          {/* Monthly Breakdown Table */}
          <GlassCard title="Monthly Breakdown" subtitle="Historical data from comparison months">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-2 px-3 text-gray-400 font-medium">Month</th>
                    <th className="text-left py-2 px-3 text-gray-400 font-medium">Product Group</th>
                    <th className="text-left py-2 px-3 text-gray-400 font-medium">Policy Aging</th>
                    <th className="text-left py-2 px-3 text-gray-400 font-medium">Lapse Aging</th>
                    <th className="text-right py-2 px-3 text-gray-400 font-medium">Total Policies</th>
                    <th className="text-right py-2 px-3 text-gray-400 font-medium">Paid Policies</th>
                    <th className="text-right py-2 px-3 text-gray-400 font-medium">Paid %</th>
                  </tr>
                </thead>
                <tbody>
                  {forecastData.monthly_breakdown.slice(0, 20).map((row, idx) => (
                    <tr key={idx} className="border-b border-white/5 hover:bg-white/5">
                      <td className="py-2 px-3 text-white">{row.month}</td>
                      <td className="py-2 px-3 text-gray-300">{row.product_group}</td>
                      <td className="py-2 px-3 text-gray-300">{row.policy_aging_band}</td>
                      <td className="py-2 px-3 text-gray-300">{row.lapse_aging_band}</td>
                      <td className="py-2 px-3 text-right text-white">{formatCount(row.total_policy_count)}</td>
                      <td className="py-2 px-3 text-right text-emerald-400">{formatCount(row.paid_policy_count)}</td>
                      <td className="py-2 px-3 text-right text-white">{row.paid_percentage.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {forecastData.monthly_breakdown.length > 20 && (
                <div className="text-center py-2 text-xs text-gray-500">
                  Showing 20 of {forecastData.monthly_breakdown.length} records
                </div>
              )}
            </div>
          </GlassCard>
        </div>
      )}

      {!loading && !forecastData && !error && (
        <EmptyState icon={BarChart3} label="Lapse forecast not generated yet" color="#6366f1" />
      )}
    </div>
  );
};

// ─────────────────────────────────────────────
// ② LOGISTIC REGRESSION  (V2)
// ─────────────────────────────────────────────
const LogisticRegressionSection = ({ scope }) => {
  const [testMonth, setTestMonth] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 7) + '-01';
  });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [result, setResult]   = useState(null);
  const [lastRun, setLastRun] = useState(null);

  const handleRun = async () => {
    if (scope !== PREDICTION_SCOPES.LIFE) {
      setError('Logistic Regression V2 is currently available only for Life Insurance.');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    try {
      // apiV2.baseURL = http://localhost:8080/api/v2  →  hits /api/v2/ml/train/logistic-v2
      const { data } = await apiV2.post('/ml/train/logistic-v2', null, {
        params: { test_month: testMonth, domain: scope },
      });
      if (data?.status !== 'success') { setError(data?.message || 'Unexpected response.'); return; }
      setResult({ metrics: normMetrics(data.metrics), cm: normCM(data.confusion_matrix) });
      setLastRun(new Date().toLocaleTimeString());
    } catch (err) {
      setError(err.response?.data?.detail ?? err.message ?? 'Failed to train.');
    } finally {
      setLoading(false);
    }
  };

  const colors = { success: '#2dd4bf', fail: '#f87171' };

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <GlassCard className="!p-5 border-b-2 border-b-purple-500/40 shrink-0">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-purple-500/15 border border-purple-500/25 text-purple-400 mt-0.5">
              <Sigma size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <h2 className="text-base font-semibold text-white">Logistic Regression · Life Insurance</h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/15 border border-purple-500/25 text-purple-300 font-medium tracking-wide">V2</span>
              </div>
              <p className="text-xs text-gray-400">Time-series split · Train on all data before test month · Evaluate on that month</p>
              {lastRun && <div className="flex items-center gap-1.5 mt-1.5"><Clock size={10} className="text-gray-600" /><span className="text-[10px] text-gray-600">Last run: {lastRun}</span></div>}
            </div>
          </div>
          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="flex flex-col gap-1 flex-1 md:flex-none">
              <label className="text-[10px] text-gray-500 uppercase tracking-widest pl-1">Test Month</label>
              <input type="date" value={testMonth} onChange={(e) => setTestMonth(e.target.value)}
                className="bg-black/30 border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/40 transition-all" />
            </div>
            <button onClick={handleRun} disabled={loading}
              className={`flex items-center whitespace-nowrap gap-2 px-5 py-2 rounded-xl font-medium text-sm transition-all mt-4 ${
                loading ? 'bg-gray-700/50 text-gray-500 cursor-not-allowed border border-white/5'
                        : 'bg-purple-600 hover:bg-purple-500 active:scale-95 text-white border border-purple-400/20 shadow-lg shadow-purple-900/30'}`}>
              {loading ? <><RefreshCw size={14} className="animate-spin" /> Training…</> : <><Play size={14} fill="currentColor" /> Run Model</>}
            </button>
          </div>
        </div>
      </GlassCard>

      {error   && <ErrorBanner error={error} />}
      {loading && <TrainingLoader label="Training Logistic Regression…" accentColor="#a855f7" />}
      {!loading && result && <ModelResults metrics={result.metrics} cm={result.cm} testMonth={testMonth} colors={colors} accentColor="#a855f7" />}
      {!loading && !result && !error && <EmptyState icon={Cpu} label="Logistic Regression not run yet" color="#a855f7" />}
    </div>
  );
};

// ─────────────────────────────────────────────
// ④ DEBT COLLECTION RECOVERY SECTION
// ─────────────────────────────────────────────
const DebtRecoverySection = () => {
  const [testMonth, setTestMonth] = useState('2025-12-01');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [result, setResult]       = useState(null);
  const [lastRun, setLastRun]     = useState(null);

  const handleRun = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const { data } = await api.post('/ml/train/debt-collection', null, { params: { test_month: testMonth } });
      if (data?.status !== 'success') { setError(data?.message || 'Unexpected response.'); return; }
      setResult({ metrics: normMetrics(data.metrics), cm: normCM(data.confusion_matrix) });
      setLastRun(new Date().toLocaleTimeString());
    } catch (err) {
      setError(err.response?.data?.detail ?? err.message ?? 'Failed to train.');
    } finally {
      setLoading(false);
    }
  };

  const colors = { success: '#fbbf24', fail: '#f87171' };

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <GlassCard className="!p-5 border-b-2 border-b-amber-500/40 shrink-0">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/25 text-amber-400 mt-0.5">
              <DollarSign size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <h2 className="text-base font-semibold text-white">Debt Recovery Prediction Engine</h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/25 text-amber-300 font-medium tracking-wide">Debt AI</span>
              </div>
              <p className="text-xs text-gray-400">Random Forest propensity model · Predict payment likelihood for debt portfolio accounts.</p>
              {lastRun && <div className="flex items-center gap-1.5 mt-1.5"><Clock size={10} className="text-gray-600" /><span className="text-[10px] text-gray-600">Last run: {lastRun}</span></div>}
            </div>
          </div>
          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="flex flex-col gap-1 flex-1 md:flex-none">
              <label className="text-[10px] text-gray-500 uppercase tracking-widest pl-1">Test Month</label>
              <input type="date" value={testMonth} onChange={(e) => setTestMonth(e.target.value)}
                className="bg-black/30 border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500/40 transition-all" />
            </div>
            <button onClick={handleRun} disabled={loading}
              className={`flex items-center whitespace-nowrap gap-2 px-5 py-2 rounded-xl font-medium text-sm transition-all mt-4 ${
                loading ? 'bg-gray-700/50 text-gray-500 cursor-not-allowed border border-white/5'
                        : 'bg-amber-600 hover:bg-amber-500 active:scale-95 text-white border border-amber-400/20 shadow-lg shadow-amber-900/20'}`}>
              {loading ? <><RefreshCw size={14} className="animate-spin" /> Training…</> : <><Play size={14} fill="currentColor" /> Run Prediction</>}
            </button>
          </div>
        </div>
      </GlassCard>

      {error   && <ErrorBanner error={error} />}
      {loading && <TrainingLoader label="Training Debt Recovery Model…" accentColor="#f59e0b" />}
      {!loading && result && <ModelResults metrics={result.metrics} cm={result.cm} testMonth={testMonth} colors={colors} accentColor="#f59e0b" />}
      {!loading && !result && !error && <EmptyState icon={DollarSign} label="Debt Recovery model not run yet" color="#f59e0b" />}
    </div>
  );
};

// ─────────────────────────────────────────────
// ROOT EXPORT
// ─────────────────────────────────────────────
const Predictions = () => {
  const { mainDomain, subDomain } = useDomain();
  const scope = getPredictionScope(mainDomain, subDomain);

  if (scope === PREDICTION_SCOPES.HEALTH) {
    return (
      <div className="flex flex-col gap-6 h-full pb-6 overflow-y-auto overflow-x-hidden animate-fade-in-up">
        <GlassCard className="!p-6 border border-emerald-500/25 bg-emerald-500/5">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="text-emerald-300 mt-0.5 shrink-0" />
            <div>
              <h3 className="text-sm font-semibold text-white mb-1">Health Insurance Predictions</h3>
              <p className="text-xs text-gray-300">
                Health Insurance prediction engines are not configured yet. Switch to Life Insurance or Debt Collection to run models.
              </p>
            </div>
          </div>
        </GlassCard>
      </div>
    );
  }

  // ── DEBT COLLECTION ──
  if (scope === PREDICTION_SCOPES.DEBT) {
    return (
      <div className="flex flex-col gap-6 h-full pb-6 overflow-y-auto overflow-x-hidden animate-fade-in-up">
        <DebtRecoverySection />
      </div>
    );
  }

  // ── LIFE INSURANCE ──
  return (
    <div className="flex flex-col gap-6 h-full pb-6 overflow-y-auto overflow-x-hidden animate-fade-in-up">
      <LapseForecastSection />
      <SectionDivider label="Random Forest · V1" color="teal" />
      <RandomForestSection key={`rf-${scope}`} scope={scope} />
      <SectionDivider label="Logistic Regression · V2" color="purple" />
      <LogisticRegressionSection key={`lr-${scope}`} scope={scope} />
    </div>
  );
};

export default Predictions;
