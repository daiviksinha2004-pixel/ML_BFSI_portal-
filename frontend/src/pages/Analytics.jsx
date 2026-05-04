import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';
import { Activity, TrendingUp, Award, ShieldAlert, Target } from 'lucide-react';
import { useDomain } from '../context/DomainContext';
import GlassCard from '../components/ui/GlassCard';

export default function Analytics() {
  const { mainDomain, subDomain, theme } = useDomain();

  let title = '';
  let kpis = [];
  let areaData = [];
  let barData = [];
  let primaryChartColor = '#2dd4bf';
  let secondaryChartColor = '#0f766e';

  if (mainDomain === 'debt') {
    title = 'Debt Collection Analytics';
    primaryChartColor = '#fbbf24';
    secondaryChartColor = '#b45309';
    kpis = [
      { title: 'Recovery Rate', value: '42.8%', icon: TrendingUp },
      { title: 'Average Days to Collect', value: '45 Days', icon: Activity },
      { title: 'Top Performer Bucket', value: '30-60 Days', icon: Award },
    ];
    areaData = [
      { month: 'Jan', amount: 150000 },
      { month: 'Feb', amount: 200000 },
      { month: 'Mar', amount: 180000 },
      { month: 'Apr', amount: 250000 },
      { month: 'May', amount: 300000 },
      { month: 'Jun', amount: 280000 },
    ];
    barData = [
      { name: '0-30 Days', collected: 120000, default: 20000 },
      { name: '31-60 Days', collected: 80000, default: 40000 },
      { name: '61-90 Days', collected: 50000, default: 60000 },
      { name: '90+ Days', collected: 20000, default: 110000 },
    ];
  } else if (subDomain === 'life') {
    title = 'Life Insurance Analytics';
    primaryChartColor = '#2dd4bf';
    secondaryChartColor = '#0f766e';
    kpis = [];
    areaData = [];
    barData = [];
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] animate-fade-in-up">
        <div className="p-4 rounded-full bg-white/5 border border-white/10 mb-4 shadow-lg">
          <Activity size={32} className="text-indigo-400/50" />
        </div>
        <h2 className="text-xl font-semibold text-white mb-2 tracking-tight">Life Insurance Analytics</h2>
        <p className="text-gray-400 max-w-md text-center text-sm leading-relaxed">
          This module is currently being structured for Life Insurance policies. Advanced analytics will be available soon.
        </p>
      </div>
    );
  } else {
    title = 'Health Insurance Analytics';
    primaryChartColor = '#10b981';
    secondaryChartColor = '#047857';
    kpis = [
      { title: 'Network Approval Rate', value: '88.4%', icon: ShieldAlert },
      { title: 'Average Claim Cost', value: '$4,250', icon: Activity },
      { title: 'Fast-Track Claims', value: '62%', icon: Target },
    ];
    areaData = [
      { month: 'Jan', amount: 800 },
      { month: 'Feb', amount: 820 },
      { month: 'Mar', amount: 790 },
      { month: 'Apr', amount: 950 },
      { month: 'May', amount: 880 },
      { month: 'Jun', amount: 1050 },
    ];
    barData = [
      { name: 'In-Patient', collected: 450, default: 50 },
      { name: 'Out-Patient', collected: 600, default: 20 },
      { name: 'Preventive', collected: 800, default: 10 },
    ];
  }

  return (
    <div className="flex flex-col gap-6 h-full pb-6 animate-fade-in-up">
      <div className="flex items-center gap-3">
         <Activity size={24} className={theme.primaryText} />
         <h1 className="text-2xl font-light text-white">{title}</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {kpis.map((kpi, idx) => {
          const Icon = kpi.icon;
          return (
            <GlassCard key={idx} title={kpi.title} icon={Icon}>
              <div className="text-4xl font-light text-white">{kpi.value}</div>
            </GlassCard>
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 min-h-[300px]">
        <GlassCard title="Performance Trend" subtitle="Monthly progress" icon={TrendingUp}>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={areaData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorAnalytics" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={primaryChartColor} stopOpacity={0.4}/>
                  <stop offset="95%" stopColor={primaryChartColor} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="month" stroke="rgba(255,255,255,0.3)" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="rgba(255,255,255,0.3)" fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip 
                contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                itemStyle={{ color: '#fff' }}
              />
              <Area type="monotone" dataKey="amount" stroke={primaryChartColor} strokeWidth={3} fillOpacity={1} fill="url(#colorAnalytics)" />
            </AreaChart>
          </ResponsiveContainer>
        </GlassCard>

        <GlassCard title="Segment Distribution" subtitle="Categories breakdown" icon={Target}>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={barData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="name" stroke="rgba(255,255,255,0.3)" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="rgba(255,255,255,0.3)" fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip 
                cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                itemStyle={{ color: '#fff' }}
              />
              <Legend wrapperStyle={{ paddingTop: '20px' }} />
              <Bar dataKey="collected" name={mainDomain === 'debt' ? 'Collected' : 'Approved/Active'} fill={primaryChartColor} radius={[4, 4, 0, 0]} />
              <Bar dataKey="default" name={mainDomain === 'debt' ? 'Defaulted' : 'Rejected/Lapsed'} fill={secondaryChartColor} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </GlassCard>
      </div>
    </div>
  );
}
