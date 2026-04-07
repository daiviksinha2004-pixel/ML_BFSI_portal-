import React from 'react';
import { Home, PieChart, Users, Settings, Database, Activity, BrainCircuit, LogOut, UploadCloud} from 'lucide-react';
import { useDomain } from '../../context/DomainContext';
import ChatPanel from '../chat/chatpanel';
import { useAuth } from '../../context/AuthContext';
const MainLayout = ({ children }) => {
  const { mainDomain, setMainDomain, subDomain, setSubDomain, theme, activePage, setActivePage } = useDomain();
  const { logout } = useAuth(); // <-- 2. Add this line!
  return (
    <div className={`min-h-screen ${theme.background} text-white flex transition-colors duration-1000`}>
      
      {/* --- ICON-ONLY SIDEBAR --- */}
      <nav className={`w-20 flex flex-col items-center py-8 backdrop-blur-2xl bg-black/20 border-r ${theme.glassBorder}`}>
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
          />
          
          {/* ML Predictions Icon */}
          <NavItem 
            icon={<BrainCircuit size={22} />} 
            active={activePage === 'predictions'} 
            onClick={() => setActivePage('predictions')} 
          />
          
          <NavItem icon={<Activity size={22} />} />
          <NavItem 
            icon={<UploadCloud size={22} />} 
            active={activePage === 'ingestion'} 
            onClick={() => setActivePage('ingestion')} 
          />
          <NavItem icon={<Settings size={22} />} />
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
        <header className={`h-24 backdrop-blur-xl bg-white/5 border-b ${theme.glassBorder} flex items-center justify-between px-8 shrink-0 z-10`}>
          
          <div className="flex flex-col">
            <h1 className="text-2xl font-light tracking-wide">{theme.name}</h1>
            <p className="text-xs text-gray-400">Enterprise Dashboard</p>
          </div>

          {/* RIGHT SIDE: The Liquid Glass Segmented Controls */}
          <div className="flex flex-col items-end gap-3">
            
            {/* Main 3-Way Toggle */}
            <div className="flex p-1 bg-black/30 backdrop-blur-md rounded-full border border-white/10">
              <ToggleButton 
                active={mainDomain === 'life_health'} 
                onClick={() => setMainDomain('life_health')}
                theme={theme}
              >
                Life & Health
              </ToggleButton>
              <ToggleButton 
                active={mainDomain === 'debt'} 
                onClick={() => setMainDomain('debt')}
                theme={theme}
              >
                Debt Collection
              </ToggleButton>
              <ToggleButton 
                active={mainDomain === 'audit'} 
                onClick={() => setMainDomain('audit')}
                theme={theme}
              >
                Audit Logs
              </ToggleButton>
            </div>

            {/* Conditional Sub-Toggle (Only shows if Life & Health is selected) */}
            {mainDomain === 'life_health' && (
              <div className="flex p-1 bg-black/20 backdrop-blur-md rounded-full border border-white/5 opacity-90 animate-fade-in-down">
                <ToggleButton 
                  active={subDomain === 'life'} 
                  onClick={() => setSubDomain('life')}
                  theme={theme}
                  small
                >
                  Life Insurance
                </ToggleButton>
                <ToggleButton 
                  active={subDomain === 'health'} 
                  onClick={() => setSubDomain('health')}
                  theme={theme}
                  small
                >
                  Health Insurance
                </ToggleButton>
              </div>
            )}
          </div>
        </header>

        {/* DASHBOARD CONTENT INJECTION */}
        <div className="flex-1 p-8 overflow-y-auto relative z-0">
          {/* Subtle background orbs for content area */}
          <div className="absolute top-20 left-40 w-72 h-72 bg-white/5 rounded-full filter blur-3xl"></div>
          
          {/* The actual charts and KPIs will be rendered here */}
          {children}
        </div>
      </main>
      <ChatPanel />
    </div>
  );
};

// Reusable UI Component for Sidebar Icons - FIXED WITH onClick PARAMETER
const NavItem = ({ icon, active, onClick }) => (
  <button 
    onClick={onClick} 
    className={`p-3 rounded-xl transition-all duration-300 ${active ? 'bg-white/10 text-white shadow-[0_0_15px_rgba(255,255,255,0.1)]' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}
  >
    {icon}
  </button>
);

// Reusable UI Component for the Apple-style Segmented Pills
const ToggleButton = ({ active, onClick, children, theme, small }) => (
  <button
    onClick={onClick}
    className={`
      ${small ? 'px-4 py-1.5 text-xs' : 'px-6 py-2 text-sm'} 
      rounded-full font-medium transition-all duration-500 ease-out
      ${active ? theme.activePill + ' shadow-lg' : 'text-gray-400 hover:text-white hover:bg-white/5'}
    `}
  >
    {children}
  </button>
);

export default MainLayout;