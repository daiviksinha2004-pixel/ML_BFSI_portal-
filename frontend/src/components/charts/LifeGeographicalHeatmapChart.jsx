import React, { useMemo, useState } from 'react';
import GlassCard from '../ui/GlassCard';
import { IndianRupee } from 'lucide-react';

// Tile grid layout mimicking the map of India
const INDIA_GRID = [
  [null, 'JK', 'LA', null, null, null, null, null],
  [null, 'PB', 'HP', 'UT', null, null, null, null],
  ['RJ', 'HR', 'DL', 'UP', 'BR', 'SK', 'AR', null],
  ['GJ', 'MP', 'CG', 'JH', 'WB', 'AS', 'NL', null],
  [null, 'MH', 'OR', null, 'TR', 'ML', 'MN', null],
  [null, 'GA', 'TG', 'AP', null, 'MZ', null, null],
  [null, 'KA', 'TN', 'PY', null, null, null, 'AN'],
  [null, 'KL', null, null, null, null, null, null]
];

const STATE_NAMES = {
  'JK': 'Jammu & Kashmir', 'LA': 'Ladakh', 'PB': 'Punjab', 'HP': 'Himachal Pradesh',
  'UT': 'Uttarakhand', 'RJ': 'Rajasthan', 'HR': 'Haryana', 'DL': 'Delhi',
  'UP': 'Uttar Pradesh', 'BR': 'Bihar', 'SK': 'Sikkim', 'AR': 'Arunachal Pradesh',
  'GJ': 'Gujarat', 'MP': 'Madhya Pradesh', 'CG': 'Chhattisgarh', 'JH': 'Jharkhand',
  'WB': 'West Bengal', 'AS': 'Assam', 'NL': 'Nagaland', 'MH': 'Maharashtra',
  'OR': 'Odisha', 'TR': 'Tripura', 'ML': 'Meghalaya', 'MN': 'Manipur',
  'GA': 'Goa', 'TG': 'Telangana', 'AP': 'Andhra Pradesh', 'MZ': 'Mizoram',
  'KA': 'Karnataka', 'TN': 'Tamil Nadu', 'PY': 'Puducherry', 'AN': 'Andaman & Nicobar',
  'KL': 'Kerala'
};

const LifeGeographicalHeatmapChart = ({ data = [] }) => {
  const [hoveredState, setHoveredState] = useState(null);

  const stateDataMap = useMemo(() => {
    const map = {};
    data.forEach(item => {
      // Create an uppercase version of state name to match loosely
      const key = (item.state || '').toUpperCase().trim();
      // Find matching abbreviation
      const abbr = Object.keys(STATE_NAMES).find(a => STATE_NAMES[a].toUpperCase() === key || a === key);
      if (abbr) {
        map[abbr] = item;
      }
    });
    return map;
  }, [data]);

  const getColor = (paymentRate) => {
    if (paymentRate >= 80) return 'bg-[#34d399] shadow-[0_0_15px_rgba(52,211,153,0.5)] border-[#34d399]';
    if (paymentRate >= 50) return 'bg-[#fbbf24] shadow-[0_0_15px_rgba(251,191,36,0.5)] border-[#fbbf24]';
    return 'bg-[#ef4444] shadow-[0_0_15px_rgba(239,68,68,0.5)] border-[#ef4444]';
  };

  const getOpacity = (total) => {
    if (!total || total === 0) return 'opacity-20';
    if (total > 500) return 'opacity-100';
    if (total > 100) return 'opacity-80';
    return 'opacity-60';
  };

  return (
    <GlassCard title="Geographical Payment Heatmap" className="col-span-full relative overflow-hidden min-h-[500px] flex flex-col items-center justify-center p-6">
      
      {/* Background ambient glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-500/10 rounded-full blur-[100px] pointer-events-none"></div>

      <div className="flex w-full h-full gap-8 mt-4 z-10 items-center justify-center flex-wrap lg:flex-nowrap">
        
        {/* Tile Map */}
        <div className="flex flex-col gap-2">
          {INDIA_GRID.map((row, rIdx) => (
            <div key={`row-${rIdx}`} className="flex gap-2">
              {row.map((cell, cIdx) => {
                if (!cell) {
                  return <div key={`empty-${rIdx}-${cIdx}`} className="w-12 h-12 sm:w-14 sm:h-14"></div>;
                }
                
                const sData = stateDataMap[cell];
                const hasData = !!sData;
                const pRate = hasData ? sData.payment_rate_pct : 0;
                
                return (
                  <div 
                    key={`cell-${cell}`}
                    onMouseEnter={() => setHoveredState(cell)}
                    onMouseLeave={() => setHoveredState(null)}
                    className={`
                      w-12 h-12 sm:w-14 sm:h-14 rounded-lg flex items-center justify-center font-bold text-xs sm:text-sm
                      transition-all duration-300 cursor-pointer border backdrop-blur-md
                      ${hasData ? getColor(pRate) : 'bg-white/5 border-white/10 text-gray-500 hover:bg-white/10'}
                      ${hasData ? getOpacity(sData.total_count) : ''}
                      ${hasData ? 'text-black' : ''}
                      hover:scale-110 hover:z-10
                    `}
                  >
                    {cell}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Legend & Details Panel */}
        <div className="w-full lg:w-72 bg-black/40 border border-white/10 backdrop-blur-xl rounded-2xl p-6 min-h-[300px] flex flex-col justify-center">
          {hoveredState && stateDataMap[hoveredState] ? (
            <div className="animate-fade-in">
              <h3 className="text-xl font-light text-white mb-1">{STATE_NAMES[hoveredState]}</h3>
              <p className="text-xs text-gray-400 mb-6 uppercase tracking-widest">State Analytics</p>
              
              <div className="space-y-4">
                <div>
                  <div className="text-sm text-gray-400 mb-1">Payment Rate</div>
                  <div className="text-3xl font-light text-[#34d399] drop-shadow-[0_0_10px_rgba(52,211,153,0.3)]">
                    {stateDataMap[hoveredState].payment_rate_pct}%
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/10">
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Paid Policies</div>
                    <div className="text-lg text-white font-medium">{stateDataMap[hoveredState].paid_count}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Unpaid Policies</div>
                    <div className="text-lg text-[#ef4444] font-medium">{stateDataMap[hoveredState].unpaid_count}</div>
                  </div>
                </div>
                
                <div className="pt-4 border-t border-white/10">
                  <div className="text-xs text-gray-500 mb-1">Total Policies</div>
                  <div className="text-xl text-white font-medium">{stateDataMap[hoveredState].total_count}</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center opacity-50 animate-pulse">
              <IndianRupee size={32} className="mb-3" />
              <p className="text-sm">Hover over a state tile to view detailed payment analytics.</p>
            </div>
          )}
        </div>

      </div>
    </GlassCard>
  );
};

export default LifeGeographicalHeatmapChart;
