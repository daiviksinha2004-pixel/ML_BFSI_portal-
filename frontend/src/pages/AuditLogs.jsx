import React, { useState, useEffect } from 'react';
import GlassCard from '../components/ui/GlassCard';
import { ShieldAlert, DatabaseZap, UserCheck, Activity } from 'lucide-react';
import api from '../api';

const AuditLogs = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const response = await api.get('/audit/logs');
        if (Array.isArray(response.data)) {
          setLogs(response.data);
        } else {
          setLogs([]);
        }
      } catch (error) {
        console.error("Failed to fetch audit logs:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchLogs();
  }, []);

  const getIcon = (eventType, status) => {
    if (status === 'Warning' || status === 'Failed') return <ShieldAlert size={14} className="text-amber-400" />;
    if (eventType && eventType.toLowerCase().includes('ingest')) return <DatabaseZap size={14} className="text-green-400" />;
    if (eventType && eventType.toLowerCase().includes('login')) return <UserCheck size={14} className="text-blue-400" />;
    return <Activity size={14} className="text-gray-400" />;
  };

  if (loading) {
    return <div className="h-full flex items-center justify-center animate-pulse text-gray-400 tracking-widest">FETCHING SECURE LOGS...</div>;
  }

  return (
    // 1. Hardcap the page height to exactly the viewport minus standard padding
    <div className="h-[calc(100vh-120px)] flex flex-col pb-4 animate-fade-in-up">
      <GlassCard 
        title="System & Ingestion Audit Ledger" 
        subtitle="Immutable record of user actions, IPs, and automated pipelines" 
        className="flex-1 flex flex-col h-full overflow-hidden"
      >
        <div className="flex flex-col h-full overflow-hidden">
          
          {/* TABLE HEADER - Locked in place */}
          <div className="grid grid-cols-12 gap-4 p-4 border-b border-white/10 text-xs font-medium text-gray-400 uppercase tracking-wider shrink-0">
            <div className="col-span-2">Timestamp</div>
            <div className="col-span-2">User</div>
            <div className="col-span-2">IP Address</div>
            <div className="col-span-2">Event Type</div>
            <div className="col-span-3">Details</div>
            <div className="col-span-1 text-right">Status</div>
          </div>
          
          {/* 2. THE MAGIC WRAPPER: relative + flex-1 creates a strict boundary */}
          <div className="relative flex-1 mt-2 min-h-[200px]">
            
            {/* 3. ABSOLUTE INSET-0: Forces the scrolling div to never exceed the parent boundary */}
            <div 
              className="absolute inset-0 overflow-y-auto pr-2 scroll-smooth
                         [&::-webkit-scrollbar]:w-1.5
                         [&::-webkit-scrollbar-track]:bg-transparent
                         [&::-webkit-scrollbar-thumb]:bg-teal-400/30
                         hover:[&::-webkit-scrollbar-thumb]:bg-teal-400/60
                         [&::-webkit-scrollbar-thumb]:rounded-full"
            >
              {logs.length === 0 ? (
                <div className="text-center p-12 text-gray-500 text-sm">No audit logs found in the database.</div>
              ) : (
                logs.map((log) => (
                  <div 
                    key={log.id} 
                    className="grid grid-cols-12 gap-4 p-4 items-center rounded-xl bg-black/20 border border-white/5 hover:bg-white/5 transition-colors mb-2 last:mb-0"
                  >
                    <div className="col-span-2 text-sm text-gray-300 font-mono">
                      {log.timestamp ? new Date(log.timestamp).toLocaleString() : 'N/A'}
                    </div>
                    
                    <div className="col-span-2 text-sm text-white flex items-center gap-2 truncate">
                      <div className="w-6 h-6 shrink-0 rounded-full bg-white/10 flex items-center justify-center text-xs border border-white/10">
                        {log.username ? log.username.charAt(0).toUpperCase() : '?'}
                      </div>
                      <span className="truncate">{log.username || 'System'}</span>
                    </div>

                    <div className="col-span-2 text-sm font-mono text-teal-400/80">
                      {log.ip_address || '127.0.0.1'}
                    </div>

                    <div className="col-span-2 text-sm text-gray-300 flex items-center gap-2 truncate">
                      {getIcon(log.event_type, log.status)}
                      <span className="truncate">{log.event_type}</span>
                    </div>

                    <div className="col-span-3 text-sm text-gray-400 truncate" title={log.details}>
                      {log.details}
                    </div>

                    <div className={`col-span-1 text-right text-xs font-medium ${log.status === 'Warning' ? 'text-amber-400' : 'text-green-400'}`}>
                      {log.status || 'Success'}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </GlassCard>
    </div>
  );
};

export default AuditLogs;