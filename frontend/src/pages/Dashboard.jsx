import React, { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Activity, IndianRupee, Users, AlertTriangle, Calendar, Database } from 'lucide-react';
import { useDomain } from '../context/DomainContext';
import GlassCard from '../components/ui/GlassCard';
import FuturisticDateFilter from '../components/ui/FuturisticDateFilter';
import LifePaymentRateByPropensityChart from '../components/charts/LifePaymentRateByPropensityChart';
import LifePaymentRateByTopChannelsChart from '../components/charts/LifePaymentRateByTopChannelsChart';
import LifePolicyStatusDistributionChart from '../components/charts/LifePolicyStatusDistributionChart';
import LifeOutstandingVsActualPremiumByBandChart from '../components/charts/LifeOutstandingVsActualPremiumByBandChart';
import LifePaymentRateByZoneChart from '../components/charts/LifePaymentRateByZoneChart';
import LifePolicyStatusByPmtFlagChart from '../components/charts/LifePolicyStatusByPmtFlagChart';
import LifeGeographicalHeatmapChart from '../components/charts/LifeGeographicalHeatmapChart';
import SourcingChannelPerformanceChart from '../components/charts/SourcingChannelPerformanceChart';
import api from '../api';

const LifeKpiCard = ({ title, data, colorClass = "text-white" }) => (
  <GlassCard title={title} className="p-5 h-[140px] flex flex-col items-center justify-center transition-transform hover:-translate-y-1 duration-300">
    <div className={`text-3xl font-light tracking-tight leading-none ${colorClass}`}>
      {data?.label_primary || '-'}
    </div>
    <div className="text-xs text-gray-400 mt-1.5">
      {data?.label_subtitle || '-'}
    </div>
  </GlassCard>
);

const DebtKpiCard = ({ title, data, colorClass = "text-white" }) => (
  <GlassCard title={title} className="p-5 h-[140px] flex flex-col items-center justify-center transition-transform hover:-translate-y-1 duration-300">
    <div className={`text-3xl font-light tracking-tight leading-none ${colorClass}`}>
      {data?.label_primary || '-'}
    </div>
    <div className="text-xs text-gray-400 mt-1.5">
      {data?.label_subtitle || '-'}
    </div>
  </GlassCard>
);

/* DateRangePicker replaced with FuturisticDateFilter component */

const Dashboard = () => {
  const { mainDomain, subDomain } = useDomain();
  const [loading, setLoading] = useState(true);

  // States for Debt
  const [debtKpiData, setDebtKpiData] = useState(null);
  const [debtSelectedDate, setDebtSelectedDate] = useState('');

  // State for Life (New 8-Grid Layout)
  const [lifeKpiData, setLifeKpiData] = useState(null);
  const [paymentOutstandingPct, setPaymentOutstandingPct] = useState(null);
  const [lifePaymentRateChartData, setLifePaymentRateChartData] = useState([]);
  const [lifeTopChannelsChartData, setLifeTopChannelsChartData] = useState([]);
  const [lifePolicyStatusChartData, setLifePolicyStatusChartData] = useState([]);
  const [lifePremiumBandChartData, setLifePremiumBandChartData] = useState([]);
  const [lifeZoneChartData, setLifeZoneChartData] = useState([]);
  const [lifePolicyStatusByPmtChartData, setLifePolicyStatusByPmtChartData] = useState([]);
  const [lifeGeographicalHeatmapData, setLifeGeographicalHeatmapData] = useState([]);
  const [sourcingChannelData, setSourcingChannelData] = useState([]);
  const [pmtFilter, setPmtFilter] = useState('all');

  // Filters
  const [selectedDate, setSelectedDate] = useState('');
  const [heatmapPropensity, setHeatmapPropensity] = useState('');

  const getBackendDomainString = () => {
    if (mainDomain === 'debt') return 'debt_collection';
    if (mainDomain === 'life_health') {
      return subDomain === 'life' ? 'life_insurance' : 'health_insurance';
    }
    return 'audit';
  };

  useEffect(() => {
    const fetchDashboardData = async () => {
      setLoading(true);

      try {
        if (mainDomain === 'life_health' && subDomain === 'life') {
          const requestConfig = selectedDate
            ? { params: { dataset_month: `${selectedDate}-01` } }
            : undefined;

          const heatmapRequestConfig = {
            params: { 
              ...(selectedDate ? { dataset_month: `${selectedDate}-01` } : {}),
              ...(heatmapPropensity ? { propensity: heatmapPropensity } : {})
            }
          };

          const [kpiRes, paymentOutstandingRes, paymentChartRes, topChannelsChartRes, policyStatusChartRes, zoneChartRes, premiumBandChartRes, policyStatusByPmtRes, geoHeatmapRes, sourcingChannelRes] = await Promise.all([
            api.get('/life-kpis/', requestConfig),
            api.get('/life-kpis/payment-outstanding-pct', requestConfig),
            api.get('/life-charts/payment-rate-by-propensity', requestConfig),
            api.get('/life-charts/payment-rate-by-top-channels', requestConfig),
            api.get('/life-charts/policy-status-distribution', requestConfig),
            api.get('/life-charts/payment-rate-by-zone', requestConfig),
            api.get('/life-charts/outstanding-vs-actual-premium-by-band', requestConfig),
            api.get('/payment-curve/policy-status-by-pmt-flag', requestConfig),
            api.get('/payment-curve/geographical-heatmap', heatmapRequestConfig),
            api.get('/analytics/life_insurance/sourcing-channel-performance', {
              params: {
                ...(selectedDate ? { dataset_month: `${selectedDate}-01` } : {}),
                pmt_filter: pmtFilter
              }
            }),
          ]);

          setLifeKpiData(kpiRes.data);
          setPaymentOutstandingPct(paymentOutstandingRes.data);
          setLifePaymentRateChartData(paymentChartRes.data.series || []);
          setLifeTopChannelsChartData(topChannelsChartRes.data.series || []);
          setLifePolicyStatusChartData(policyStatusChartRes.data.series || []);
          setLifeZoneChartData(zoneChartRes.data.series || []);
          setLifePremiumBandChartData(premiumBandChartRes.data.series || []);
          setLifePolicyStatusByPmtChartData(policyStatusByPmtRes.data.series || []);
          setLifeGeographicalHeatmapData(geoHeatmapRes.data.series || []);
          setSourcingChannelData(sourcingChannelRes.data.data || []);
        } else if (mainDomain === 'debt') {
          const requestConfig = debtSelectedDate
            ? { params: { dataset_month: `${debtSelectedDate}-01` } }
            : undefined;

          const kpiRes = await api.get('/debt-kpis/', requestConfig);
          setDebtKpiData(kpiRes.data);
        }
      } catch (error) {
        console.error("Failed to fetch data:", error);
        setDebtKpiData(null);
        setLifeKpiData(null);
        setLifePaymentRateChartData([]);
        setLifeTopChannelsChartData([]);
        setLifePolicyStatusChartData([]);
        setLifePremiumBandChartData([]);
        setLifeZoneChartData([]);
      } finally {
        setLoading(false);
      }
    };

    if (mainDomain === 'life_health' && subDomain === 'life') {
      fetchDashboardData();
    } else if (mainDomain === 'debt') {
      fetchDashboardData();
    } else {
      setLoading(false);
    }
  }, [mainDomain, subDomain, selectedDate, debtSelectedDate, heatmapPropensity, pmtFilter]);

  const CHART_COLORS = ['#fbbf24', '#b45309', '#78350f', '#451a03'];
  const primaryChartColor = '#fbbf24';

  if (loading) {
    return (
      <div className="flex h-[70vh] flex-col items-center justify-center gap-8 animate-fade-in-up">
        <div className="relative flex items-center justify-center">
          {/* Outer rotating ring */}
          <div className="absolute h-28 w-28 animate-[spin_3s_linear_infinite] rounded-full border border-transparent border-t-indigo-500/80 border-r-purple-500/50 border-b-teal-500/30 opacity-80"></div>
          {/* Inner reverse rotating ring */}
          <div className="absolute h-20 w-20 animate-[spin_4s_linear_infinite_reverse] rounded-full border border-transparent border-t-teal-400/80 border-l-indigo-400/50 opacity-60"></div>
          {/* Center pulsing glow */}
          <div className="absolute h-16 w-16 animate-ping rounded-full bg-indigo-500/20 duration-1000"></div>
          {/* Center Icon */}
          <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-black/60 border border-white/10 backdrop-blur-md shadow-[0_0_30px_rgba(99,102,241,0.2)]">
            <Database size={22} className="text-indigo-300 animate-pulse" />
          </div>
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <div className="bg-gradient-to-r from-indigo-300 via-purple-300 to-indigo-300 bg-clip-text text-xs font-bold tracking-[0.3em] text-transparent animate-pulse">
            SYNCING DATA
          </div>
          <div className="text-[10px] uppercase tracking-[0.1em] text-gray-500">
            Establishing secure connection
          </div>
        </div>
      </div>
    );
  }

  // ─── HEALTH INSURANCE LAYOUT ───────────────────────────────────────────────
  if (mainDomain === 'life_health' && subDomain === 'health') {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] animate-fade-in-up">
        <div className="text-center">
          <Activity size={48} className="text-gray-500 mx-auto mb-4 opacity-50" />
          <h2 className="text-xl font-light text-gray-400 mb-2">Health Insurance Dashboard</h2>
          <p className="text-sm text-gray-600">KPIs and charts will be added here in future updates.</p>
        </div>
      </div>
    );
  }

  // ─── LIFE INSURANCE LAYOUT ───────────────────────────────────────────────
  if (mainDomain === 'life_health' && subDomain === 'life' && lifeKpiData) {
    return (
      <div className="flex flex-col gap-5 pb-6 max-w-7xl mx-auto w-full animate-fade-in-up">

        {/* Header Ribbon with Date Picker */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 border-b border-white/10 pb-4 mt-2">
          <div className="text-gray-400 text-[11px] tracking-widest font-semibold uppercase shrink-0">
            {lifeKpiData.header}
          </div>
          <FuturisticDateFilter
            selectedDate={selectedDate}
            onSelect={setSelectedDate}
            label="Period"
          />
        </div>

        {/* 8-Grid Metric Blocks */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <LifeKpiCard title="Total Policies" data={lifeKpiData.total_policies} colorClass="text-white" />
          <LifeKpiCard title="Total outstanding premium" data={lifeKpiData.total_outstanding_premium} colorClass="text-white" />
          <LifeKpiCard title="Payment rate (PMT Flag)" data={lifeKpiData.payment_rate_pmt} colorClass="text-[#34d399]" />
          <LifeKpiCard title="Payment Outstanding %" data={paymentOutstandingPct} colorClass="text-[#4ade80]" />
          <LifeKpiCard title="Policy count (PMT Flag)" data={lifeKpiData.policy_count_pmt} colorClass="text-white" />
          <LifeKpiCard title="Amount collected (PMT Flag)" data={lifeKpiData.amount_collected_pmt} colorClass="text-[#4ade80]" />
          <LifeKpiCard title="Outstanding Premium (Unpaid Flag)" data={lifeKpiData.outstanding_pmt} colorClass="text-[#ef4444]" />
          <LifeKpiCard title="Avg lapse ageing (days)" data={lifeKpiData.avg_lapse_ageing} colorClass="text-[#f59e0b]" />
          <LifeKpiCard title="Interest charged (total)" data={lifeKpiData.total_interest_charged} colorClass="text-[#ef4444]" />
          <LifeKpiCard title="Avg policy ageing" data={lifeKpiData.avg_policy_ageing} colorClass="text-white" />
          <LifeKpiCard title="High propensity (A.HIGH)" data={lifeKpiData.high_propensity} colorClass="text-[#4ade80]" />
          <LifeKpiCard title="Grace bucket policies" data={lifeKpiData.grace_bucket} colorClass="text-white" />
        </div>

        <LifePaymentRateByPropensityChart data={lifePaymentRateChartData} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="w-full">
            <LifePolicyStatusDistributionChart data={lifePolicyStatusChartData} />
          </div>
          <div className="w-full">
            <LifePaymentRateByTopChannelsChart data={lifeTopChannelsChartData} />
          </div>
        </div>

        <LifePaymentRateByZoneChart data={lifeZoneChartData} />

        <LifeOutstandingVsActualPremiumByBandChart data={lifePremiumBandChartData} />

        <SourcingChannelPerformanceChart 
          data={sourcingChannelData} 
          pmtFilter={pmtFilter}
          onPmtFilterChange={setPmtFilter}
        />

        <LifePolicyStatusByPmtFlagChart data={lifePolicyStatusByPmtChartData} />

        {/* State Map Heatmap with Propensity Filter */}
        <div className="relative">
          <div className="absolute top-4 right-4 z-20">
            <select
              value={heatmapPropensity}
              onChange={(e) => setHeatmapPropensity(e.target.value)}
              className="bg-black/40 border border-white/10 text-white text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-500/50 backdrop-blur-md appearance-none"
            >
              <option value="">All Propensities</option>
              <option value="A.HIGH">High Propensity</option>
              <option value="B.MEDIUM">Medium Propensity</option>
              <option value="C.LOW">Low Propensity</option>
            </select>
          </div>
          <LifeGeographicalHeatmapChart data={lifeGeographicalHeatmapData} />
        </div>
      </div>
    );
  }

  // ─── DEBT COLLECTION LAYOUT ───────────────────────────────────────────────
  if (mainDomain === 'debt' && debtKpiData) {
    return (
      <div className="flex flex-col gap-5 pb-6 max-w-7xl mx-auto w-full animate-fade-in-up">

        {/* Header Ribbon with Date Picker */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 border-b border-white/10 pb-4 mt-2">
          <div className="text-gray-400 text-[11px] tracking-widest font-semibold uppercase shrink-0">
            {debtKpiData.header}
          </div>
          <FuturisticDateFilter
            selectedDate={debtSelectedDate}
            onSelect={setDebtSelectedDate}
            label="Period"
          />
        </div>

        {/* KPI Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <DebtKpiCard title="Total Loans" data={debtKpiData.total_loans} colorClass="text-white" />
          <DebtKpiCard title="Total Outstanding Portfolio" data={debtKpiData.total_outstanding_portfolio} colorClass="text-[#fbbf24]" />
          <DebtKpiCard title="Total Outstanding EMI" data={debtKpiData.total_outstanding_emi} colorClass="text-[#ef4444]" />
        </div>
      </div>
    );
  }

  // ─── DEBT COLLECTION EMPTY STATE ───────────────────────────────────────────
  return (
    <div className="flex flex-col items-center justify-center h-[60vh] animate-fade-in-up">
      <div className="text-center">
        <Activity size={48} className="text-gray-500 mx-auto mb-4 opacity-50" />
        <h2 className="text-xl font-light text-gray-400 mb-2">Debt Collection Dashboard</h2>
        <p className="text-sm text-gray-600">No data available. Upload data to view KPIs.</p>
      </div>
    </div>
  );
};

export default Dashboard;
