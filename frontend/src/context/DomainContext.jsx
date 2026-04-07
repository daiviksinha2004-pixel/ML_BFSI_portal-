import React, { createContext, useState, useContext } from 'react';

const DomainContext = createContext();

export const DomainProvider = ({ children }) => {
  // Main Domain: 'life_health', 'debt', 'audit'
  const [mainDomain, setMainDomain] = useState('life_health');
  // Sub Domain (Only active if mainDomain is 'life_health'): 'life', 'health'
  const [subDomain, setSubDomain] = useState('life');
  const [activePage, setActivePage] = useState('dashboard'); // 'dashboard' or 'predictions'
  // Dynamic Theme Generator
  const getTheme = () => {
    if (mainDomain === 'debt') {
      return {
        name: 'Debt Collection',
        background: 'bg-gradient-to-br from-indigo-950 via-slate-900 to-amber-900',
        primaryText: 'text-amber-400',
        activePill: 'bg-amber-500/20 border-amber-500/30 text-amber-300',
        glassBorder: 'border-amber-500/20',
      };
    }
    if (mainDomain === 'audit') {
      return {
        name: 'Audit Logs',
        background: 'bg-gradient-to-br from-slate-900 via-zinc-900 to-gray-800',
        primaryText: 'text-slate-300',
        activePill: 'bg-slate-500/20 border-slate-500/30 text-slate-200',
        glassBorder: 'border-slate-500/20',
      };
    }
    // Default to Life & Health
    if (subDomain === 'health') {
      return {
        name: 'Health Insurance',
        background: 'bg-gradient-to-br from-emerald-950 via-slate-900 to-teal-900',
        primaryText: 'text-emerald-400',
        activePill: 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300',
        glassBorder: 'border-emerald-500/20',
      };
    }
    return {
      name: 'Life Insurance',
      background: 'bg-gradient-to-br from-teal-950 via-slate-900 to-blue-950',
      primaryText: 'text-teal-400',
      activePill: 'bg-teal-500/20 border-teal-500/30 text-teal-300',
      glassBorder: 'border-teal-500/20',
    };
  };

  const theme = getTheme();

  return (
    <DomainContext.Provider value={{ mainDomain, setMainDomain, subDomain, setSubDomain, theme ,activePage, setActivePage }}>
      {children}
    </DomainContext.Provider>
  );
};

export const useDomain = () => useContext(DomainContext);