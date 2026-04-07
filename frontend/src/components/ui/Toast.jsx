import React, { useEffect } from 'react';
import { CheckCircle, AlertCircle, X, Loader2 } from 'lucide-react';

const Toast = ({ message, type = 'success', onClose }) => {
  // Auto-close after 4 seconds
  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const variants = {
    success: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400 shadow-emerald-500/10',
    error: 'border-red-500/50 bg-red-500/10 text-red-400 shadow-red-500/10',
    loading: 'border-blue-500/50 bg-blue-500/10 text-blue-400 shadow-blue-500/10'
  };

  return (
    <div className={`fixed top-6 right-6 z-[100] flex items-center gap-3 px-5 py-4 rounded-2xl border backdrop-blur-2xl shadow-2xl animate-fade-in-right ${variants[type]}`}>
      {type === 'success' && <CheckCircle size={20} />}
      {type === 'error' && <AlertCircle size={20} />}
      {type === 'loading' && <Loader2 size={20} className="animate-spin" />}
      
      <p className="text-sm font-medium tracking-wide">{message}</p>
      
      <button onClick={onClose} className="ml-2 p-1 hover:bg-white/10 rounded-full transition-colors">
        <X size={14} />
      </button>
    </div>
  );
};

export default Toast;