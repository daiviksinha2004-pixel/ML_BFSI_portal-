import React from 'react';
import { Sigma } from 'lucide-react';
import GlassCard from '../components/ui/GlassCard';
import { useDomain } from '../context/DomainContext';

const StatisticalPrediction = () => {
  const { theme } = useDomain();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className={`p-3 rounded-2xl bg-white/10 border border-white/10 ${theme.primaryText}`}>
          <Sigma size={28} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Statistical Model Prediction</h1>
          <p className="text-sm text-gray-400">Logistic Regression v2 — interpretable, calibrated propensity scoring</p>
        </div>
      </div>

      {/* Placeholder */}
      <GlassCard title="Coming Soon" subtitle="Statistical analysis module" icon={Sigma}>
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <Sigma size={48} className="mb-4 opacity-30" />
          <p className="text-lg font-medium text-gray-300">Statistical Prediction Module</p>
          <p className="text-sm mt-1">This section is under development.</p>
        </div>
      </GlassCard>
    </div>
  );
};

export default StatisticalPrediction;
