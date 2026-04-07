import React, { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Activity, DollarSign, Users, AlertTriangle } from 'lucide-react';
import { useDomain } from '../context/DomainContext';
import GlassCard from '../components/ui/GlassCard';
import api from '../api';

const Dashboard = () => {
  // 1. Bring in the Context and the Loading state!
  const { mainDomain, subDomain, theme } = useDomain();
  const [loading, setLoading] = useState(true);
  
  // 2. Initialize our dynamic states
  const [kpiData, setKpiData] = useState({ totalRecords: 0, totalOutstanding: 0 });
  const [trendData, setTrendData] = useState([]);
  const [pieData, setPieData] = useState([]);

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
      const backendDomain = getBackendDomainString();
      
      try {
        // 3. Fetch BOTH the summary numbers and the chart arrays simultaneously
        const [summaryRes, chartsRes] = await Promise.all([
          api.get(`/analytics/summary/${backendDomain}`),
          api.get(`/analytics/charts/${backendDomain}`)
        ]);

        // Set the top KPI numbers
        setKpiData({
          totalRecords: summaryRes.data.total_records || 0,
          totalOutstanding: summaryRes.data.total_outstanding_premium || summaryRes.data.total_pos || 0,
        });

        // Set the Trend Chart Data
        if (chartsRes.data.trend && chartsRes.data.trend.length > 0) {
          setTrendData(chartsRes.data.trend);
        } else {
          setTrendData([{ month: 'No Data', amount: 0 }]);
        }

        // Set the Donut Chart Data
        if (chartsRes.data.pie && chartsRes.data.pie.length > 0) {
          setPieData(chartsRes.data.pie);
        } else {
          setPieData([{ name: 'No Data', value: 1 }]);
        }

      } catch (error) {
        console.error("Failed to fetch data:", error);
        // Fallbacks so the UI doesn't crash on an API error
        setKpiData({ totalRecords: 0, totalOutstanding: 0 });
        setTrendData([{ month: 'Error', amount: 0 }]);
        setPieData([{ name: 'Error', value: 1 }]);
      } finally {
        setLoading(false);
      }
    };

    if (mainDomain !== 'audit') {
      fetchDashboardData();
    } else {
      setLoading(false);
    }
  }, [mainDomain, subDomain]);
  
  // Dynamic Chart Colors
  const CHART_COLORS = mainDomain === 'life_health' ? ['#2dd4bf', '#0f766e', '#134e4a', '#042f2e'] : ['#fbbf24', '#b45309', '#78350f', '#451a03'];
  const primaryChartColor = mainDomain === 'debt' ? '#fbbf24' : '#2dd4bf'; 

  if (loading) {
    return <div className="h-full flex items-center justify-center animate-pulse text-gray-400 tracking-widest">SYNCING DATA...</div>;
  }

  return (
    <div className="flex flex-col gap-6 h-full pb-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <GlassCard title="Total Portfolio Value" subtitle="Active outstanding balance" icon={DollarSign}>
          <div className="text-4xl font-light text-white">
            ${kpiData.totalOutstanding.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </div>
        </GlassCard>
        
        <GlassCard title="Active Customers" subtitle="Total accounts in database" icon={Users}>
          <div className="text-4xl font-light text-white">
            {kpiData.totalRecords.toLocaleString()}
          </div>
        </GlassCard>

        <GlassCard title="AI Risk Alert" subtitle="High propensity accounts" icon={AlertTriangle} className="border-red-500/30">
          <div className="text-4xl font-light text-red-400">
            0<span className="text-sm text-gray-400">accounts</span>
          </div>
        </GlassCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-[300px]">
        <GlassCard title="Collection & Payment Trends" subtitle="Month over month performance" icon={Activity} className="lg:col-span-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={primaryChartColor} stopOpacity={0.4}/>
                  <stop offset="95%" stopColor={primaryChartColor} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="month" stroke="rgba(255,255,255,0.3)" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="rgba(255,255,255,0.3)" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `$${value/1000}k`} />
              <Tooltip 
                contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                itemStyle={{ color: '#fff' }}
              />
              <Area type="monotone" dataKey="amount" stroke={primaryChartColor} strokeWidth={3} fillOpacity={1} fill="url(#colorAmount)" />
            </AreaChart>
          </ResponsiveContainer>
        </GlassCard>

        <GlassCard title="AI Propensity Bands" subtitle="Predicted payment behavior">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={5}
                dataKey="value"
                stroke="none"
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                itemStyle={{ color: '#fff' }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-4 mt-2 flex-wrap">
            {pieData.map((entry, index) => (
              <div key={entry.name} className="flex items-center gap-2 text-xs text-gray-400">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}></div>
                {entry.name}
              </div>
            ))}
          </div>
        </GlassCard>
      </div>
    </div>
  );
};

export default Dashboard;