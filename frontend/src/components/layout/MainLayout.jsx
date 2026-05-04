import React from 'react';
import { Home, PieChart, Users, Settings as SettingsIcon, Database, BrainCircuit, LogOut, UploadCloud, TrendingUp, Orbit} from 'lucide-react';
import { useDomain } from '../../context/DomainContext';
import { useTheme } from '../../context/ThemeContext';
import ChatPanel from '../chat/chatpanel';
import ThemeToggle from '../ui/ThemeToggle';
import AnimatedLogo from '../ui/AnimatedLogo';
import LightModeDecorations from '../ui/LightModeDecorations';
import { useAuth } from '../../context/AuthContext';
const MainLayout = ({ children }) => {
  const { mainDomain, setMainDomain, subDomain, setSubDomain, theme, activePage, setActivePage } = useDomain();
  const { isDark } = useTheme();
  const { logout } = useAuth();
  return (
    <div className={`min-h-screen ${isDark ? theme.background : ''} ${isDark ? 'text-white' : 'text-slate-800'} flex transition-colors duration-500`}>
      
      {/* --- ICON-ONLY SIDEBAR --- */}
      <nav className={`w-20 flex flex-col items-center py-8 backdrop-blur-2xl ${isDark ? 'bg-black/20' : 'bg-white/60'} border-r ${theme.glassBorder} transition-all duration-300 ${mainDomain === 'audit' ? 'w-0 opacity-0 overflow-hidden border-0' : 'w-20 opacity-100'}`}>
        {/* Logo/Brand Icon */}
        <div className={`p-3 rounded-2xl bg-white/10 border border-white/10 shadow-lg mb-10 ${theme.primaryText}`}>
          <Database size={24} />
        </div>

        {/* Navigation Icons */}
        <div className="flex flex-col gap-6 w-full items-center">
          {/* Dashboard/Home Icon */}
          <NavItem
            icon={<Home size={22} />}
            active={activePage === 'dashboard'}
            onClick={() => setActivePage('dashboard')}
            tooltip="Dashboard"
            isDark={isDark}
          />

          {/* ML Predictions Icon */}
          <NavItem
            icon={<BrainCircuit size={22} />}
            active={activePage === 'predictions'}
            onClick={() => setActivePage('predictions')}
            tooltip="ML Predictions"
            isDark={isDark}
          />

          <NavItem
            icon={<TrendingUp size={22} />}
            active={activePage === 'payment_curve'}
            onClick={() => setActivePage('payment_curve')}
            tooltip="Payment Curve"
            isDark={isDark}
          />
          <NavItem
            icon={<Orbit size={22} />}
            active={activePage === 'prediction_window'}
            onClick={() => setActivePage('prediction_window')}
            tooltip="Prediction Window"
            isDark={isDark}
          />
          <NavItem
            icon={<UploadCloud size={22} />}
            active={activePage === 'ingestion'}
            onClick={() => setActivePage('ingestion')}
            tooltip="Data Ingestion"
            isDark={isDark}
          />
          <NavItem
            icon={<SettingsIcon size={22} />}
            active={activePage === 'settings'}
            onClick={() => setActivePage('settings')}
            tooltip="Settings"
            isDark={isDark}
          />
        </div>

        {/* --- BOTTOM ICONS --- */}
        <div className="mt-auto mb-4 flex flex-col gap-2 items-center w-full">
          
          
          <button 
            onClick={logout}
            title="Sign Out"
            /* We use w-12 h-12 and flex centering to perfectly match the NavItem footprint */
            className="flex items-center justify-center w-12 h-12 rounded-xl text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all duration-300"
          >
            <LogOut size={22} />
          </button>
        </div>
      </nav>

      {/* --- MAIN CONTENT AREA --- */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        
        {/* TOP HEADER & TOGGLES */}
        <header className={`h-24 backdrop-blur-xl ${isDark ? 'bg-white/5' : 'bg-white/70'} border-b ${theme.glassBorder} flex items-center justify-between px-8 shrink-0 z-10`}>
          
          <div className="flex items-center">
            <AnimatedLogo />
          </div>

          {/* RIGHT SIDE: Theme Toggle + Segmented Controls */}
          <div className="flex flex-col items-end gap-3">
            
            {/* Theme Toggle + Main 3-Way Toggle Row */}
            <div className="flex items-center gap-3">
              <ThemeToggle />
              {activePage !== 'settings' && (
                <div className={`flex p-1 ${isDark ? 'bg-black/30' : 'bg-black/5'} backdrop-blur-md rounded-full border ${isDark ? 'border-white/10' : 'border-black/8'}`}>
                <ToggleButton 
                  active={mainDomain === 'life_health'} 
                  onClick={() => setMainDomain('life_health')}
                  theme={theme}
                  isDark={isDark}
                >
                  Life & Health
                </ToggleButton>
                <ToggleButton 
                  active={mainDomain === 'debt'} 
                  onClick={() => setMainDomain('debt')}
                  theme={theme}
                  isDark={isDark}
                >
                  Debt Collection
                </ToggleButton>
                <ToggleButton 
                  active={mainDomain === 'audit'} 
                  onClick={() => setMainDomain('audit')}
                  theme={theme}
                  isDark={isDark}
                >
                  Audit Logs
                </ToggleButton>
                </div>
              )}
            </div>

            {/* Conditional Sub-Toggle (Only shows if Life & Health is selected) */}
            {activePage !== 'settings' && mainDomain === 'life_health' && (
              <div className={`flex p-1 ${isDark ? 'bg-black/20' : 'bg-black/5'} backdrop-blur-md rounded-full border ${isDark ? 'border-white/5' : 'border-black/5'} opacity-90 animate-fade-in-down`}>
                <ToggleButton 
                  active={subDomain === 'life'} 
                  onClick={() => setSubDomain('life')}
                  theme={theme}
                  small
                  isDark={isDark}
                >
                  Life Insurance
                </ToggleButton>
                <ToggleButton 
                  active={subDomain === 'health'} 
                  onClick={() => setSubDomain('health')}
                  theme={theme}
                  small
                  isDark={isDark}
                >
                  Health Insurance
                </ToggleButton>
              </div>
            )}
          </div>
        </header>

        {/* DASHBOARD CONTENT INJECTION */}
        <div className="flex-1 p-8 overflow-y-auto relative z-0">
          {/* Subtle background orbs for content area (dark mode) */}
          {isDark && <div className="absolute top-20 left-40 w-72 h-72 bg-white/5 rounded-full filter blur-3xl"></div>}
          
          {/* Cartoon decorations (light mode only — self-managed) */}
          <LightModeDecorations />
          
          {/* The actual charts and KPIs will be rendered here */}
          <div className="relative z-10">
            {children}
          </div>
        </div>
      </main>
      <ChatPanel />
    </div>
  );
};

// Reusable UI Component for Sidebar Icons - FIXED WITH onClick PARAMETER
const NavItem = ({ icon, active, onClick, tooltip, isDark }) => (
  <button 
    onClick={onClick} 
    title={tooltip}
    className={`p-3 rounded-xl transition-all duration-300 ${active ? `${isDark ? 'bg-white/10 text-white shadow-[0_0_15px_rgba(255,255,255,0.1)]' : 'bg-indigo-50 text-indigo-600 shadow-md'}` : `${isDark ? 'text-gray-500 hover:text-white hover:bg-white/5' : 'text-slate-400 hover:text-indigo-500 hover:bg-indigo-50/50'}`}`}
  >
    {icon}
  </button>
);

// Reusable UI Component for the Apple-style Segmented Pills
const ToggleButton = ({ active, onClick, children, theme, small, isDark }) => (
  <button
    onClick={onClick}
    className={`
      ${small ? 'px-4 py-1.5 text-xs' : 'px-6 py-2 text-sm'} 
      rounded-full font-medium transition-all duration-500 ease-out
      ${active ? theme.activePill + ' shadow-lg' : `${isDark ? 'text-gray-400 hover:text-white hover:bg-white/5' : 'text-slate-500 hover:text-indigo-600 hover:bg-indigo-50/50'}`}
    `}
  >
    {children}
  </button>
);

export default MainLayout;
