import React from 'react';
import { useDomain } from '../../context/DomainContext';

const GlassCard = ({ children, className = "", title, subtitle, icon: Icon }) => {
  const { theme } = useDomain();

  return (
    <div className={`relative backdrop-blur-xl bg-white/5 border ${theme.glassBorder} rounded-3xl p-6 shadow-2xl overflow-hidden flex flex-col ${className}`}>
      {/* Subtle top glare effect for the glass */}
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
      
      {(title || Icon) && (
        <div className="flex items-center gap-3 mb-6">
          {Icon && (
            <div className={`p-2 rounded-xl bg-white/5 border border-white/10 ${theme.primaryText}`}>
              <Icon size={20} />
            </div>
          )}
          <div>
            {title && <h3 className="text-lg font-medium text-white tracking-wide">{title}</h3>}
            {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
          </div>
        </div>
      )}
      
      {/* Card Content */}
      <div className="flex-1 w-full">
        {children}
      </div>
    </div>
  );
};

export default GlassCard;