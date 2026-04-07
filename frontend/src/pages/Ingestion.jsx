import React, { useState, useRef, useEffect } from 'react';
import { UploadCloud, FileText, CheckCircle2, AlertTriangle, Loader2, X, Calendar, Database, Target, Layers, ChevronDown } from 'lucide-react';
import GlassCard from '../components/ui/GlassCard';
import { useDomain } from '../context/DomainContext';
import api from '../api';

const IngestionMetricCard = ({ label, value, icon: Icon, colorClass }) => (
  <GlassCard>
    <div className="flex items-center gap-3">
      <div className={`p-3 rounded-2xl bg-white/5 border border-white/10 ${colorClass || 'text-purple-400'}`}>
        <Icon size={22} />
      </div>
      <div>
        <div className="text-3xl font-light text-white">{value}</div>
        <div className="text-xs uppercase tracking-widest text-gray-500 mt-1">{label}</div>
      </div>
    </div>
  </GlassCard>
);

const Ingestion = () => {
  const { mainDomain, theme } = useDomain();
  
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState(null);
  
  // New State: Explicit Schema Mapping
  const [datasetType, setDatasetType] = useState(mainDomain === 'debt' ? 'debt_collection' : 'life_insurance');
  const [datasetMonth, setDatasetMonth] = useState(new Date().toISOString().split('T')[0]);
  
  const [status, setStatus] = useState('idle'); // idle, uploading, success, error
  const [message, setMessage] = useState('');
  const [rowsInserted, setRowsInserted] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef(null);

  // Sync default dataset type when the user switches domains in the sidebar
  useEffect(() => {
    setDatasetType(mainDomain === 'debt' ? 'debt_collection' : 'life_insurance');
    clearFile();
  }, [mainDomain]);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const validateAndSetFile = (droppedFile) => {
    if (droppedFile.type === 'text/csv' || droppedFile.name.endsWith('.csv')) {
      setFile(droppedFile);
      setStatus('idle');
    } else {
      setStatus('error');
      setMessage('Invalid file format. Please upload a .csv file.');
    }
  };

  const clearFile = () => {
    setFile(null);
    setStatus('idle');
    setMessage('');
    setRowsInserted(0);
    setUploadProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleUpload = async () => {
    if (!file || !datasetMonth || !datasetType) return;
    setStatus('uploading');
    setMessage('');
    setUploadProgress(10); 
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('dataset_month', datasetMonth); 
    
    try {
      // Endpoint dynamically uses the dropdown selection
      const endpoint = `/ingest/upload/${datasetType}`;
      const response = await api.post(endpoint, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(percentCompleted < 90 ? percentCompleted : 90);
        }
      });
      setUploadProgress(100);
      setStatus('success');
      setMessage(response.data.message);
      setRowsInserted(response.data.rows_inserted);
    } catch (error) {
      setStatus('error');
      setMessage(error.response?.data?.detail || 'Failed to process file.');
      setUploadProgress(0);
    }
  };

  return (
    <div className="flex flex-col h-full animate-fade-in-up pb-6">
      
      {/* Header Control Panel */}
      <GlassCard className="!p-4 border-b-4 shrink-0 mb-6" style={{ borderColor: theme.border }}>
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-2xl bg-white/5 border border-white/10 ${theme.accentPill}`}>
              <Database size={24} />
            </div>
            <div>
              <h1 className="text-xl font-medium text-white tracking-tight">Data Pipeline Ingestion</h1>
              <p className="text-xs text-gray-400 mt-1 font-light">
                Securely upload, validate, and parse monthly CSV extracts into the PostgreSQL data lake.
              </p>
            </div>
          </div>
          <span className={`text-xs font-semibold px-3 py-1 rounded-full ${theme.activePill} border ${theme.border}`}>
            {mainDomain === 'life_health' ? 'Life & Health' : mainDomain === 'debt' ? 'Debt Collection' : 'Audit Logs'} Domain Active
          </span>
        </div>
      </GlassCard>

      {/* Main Configuration Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr,320px] gap-6 flex-1 min-h-[400px]">
        
        {/* Left: The Upload Zone */}
        <div 
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !file && fileInputRef.current?.click()}
          className={`relative h-full rounded-3xl backdrop-blur-3xl bg-white/2 flex flex-col items-center justify-center p-8 transition-all duration-500 ease-out animate-fade-in ${
            isDragging 
              ? `border-4 border-dashed bg-white/10 scale-[1.01]` 
              : file 
                ? 'border border-purple-500/50 bg-white/5 cursor-default' 
                : 'border border-gray-600 hover:border-gray-400 hover:bg-white/5 cursor-pointer'
          }`}
          style={isDragging ? { borderColor: theme.success } : {}}
        >
          <input type="file" ref={fileInputRef} onChange={handleFileSelect} accept=".csv" className="hidden" />

          {!file ? (
            <>
              <div className={`p-6 rounded-3xl bg-white/5 mb-6 text-gray-500 transition-colors ${isDragging && `text-${theme.isLife ? 'teal' : 'amber'}-400`}`}>
                <UploadCloud size={64} />
              </div>
              <h3 className="text-xl font-medium text-white mb-3">Drag & Drop monthly CSV file</h3>
              <p className="text-sm text-gray-500 text-center max-w-sm font-light">
                The ETL pipeline will validate your file against the selected target schema. Only .csv files are supported.
              </p>
              <button className="mt-8 px-8 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium transition-colors shadow-lg">
                Browse Files
              </button>
            </>
          ) : (
            <div className="w-full flex flex-col items-center animate-fade-in-up">
              <div className="relative p-5 rounded-3xl bg-purple-500/10 text-purple-400 border border-purple-500/20 mb-5 shadow-2xl">
                <FileText size={64} />
                {status !== 'uploading' && (
                  <button onClick={(e) => { e.stopPropagation(); clearFile(); }} className="absolute -top-3 -right-3 p-1.5 bg-red-500 rounded-full text-white hover:bg-red-600 transition-colors shadow-xl">
                    <X size={16} />
                  </button>
                )}
              </div>
              
              <h3 className="text-xl font-semibold text-white text-center truncate w-full px-12">{file.name}</h3>
              <p className="text-sm text-gray-500 mt-1.5 tracking-wide">{(file.size / (1024 * 1024)).toFixed(2)} MB • Ready for ETL</p>
            </div>
          )}
        </div>

        {/* Right: Configuration Stack */}
        <div className="flex flex-col gap-6">
          
          {/* --- NEW: Schema Mapping Dropdown --- */}
          <GlassCard title="Schema Mapping" subtitle="Select target database table" icon={Layers}>
            <div className="relative mt-2">
              <select
                value={datasetType}
                onChange={(e) => setDatasetType(e.target.value)}
                disabled={status === 'uploading'}
                className="w-full bg-black/40 border border-white/10 text-white text-sm rounded-xl px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-purple-500/50 disabled:bg-gray-800 disabled:text-gray-600 disabled:border-gray-700 transition-all appearance-none cursor-pointer"
              >
                <option value="life_insurance" className="bg-gray-900 text-white">Life Insurance</option>
                <option value="health_insurance" className="bg-gray-900 text-white">Health Insurance</option>
                <option value="debt_collection" className="bg-gray-900 text-white">Debt Collection</option>
              </select>
              <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none">
                <ChevronDown size={16} className="text-gray-500" />
              </div>
            </div>
          </GlassCard>

          {/* Logical Month Selection */}
          <GlassCard title="Logical Month" subtitle="Chronological segregation" icon={Calendar}>
            <div className="relative mt-2">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Calendar size={18} className="text-gray-500" />
              </div>
              <input
                type="date"
                value={datasetMonth}
                onChange={(e) => setDatasetMonth(e.target.value)}
                disabled={status === 'uploading'}
                className="w-full bg-black/40 border border-white/10 text-white text-sm rounded-xl pl-11 pr-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-purple-500/50 disabled:bg-gray-800 disabled:text-gray-600 disabled:border-gray-700 transition-all cursor-pointer"
              />
            </div>
          </GlassCard>

          {/* Action Area (Upload / Status) */}
          {file && (
            <div className="mt-auto space-y-4 animate-fade-in-up">
              {status === 'idle' && (
                <button 
                  onClick={(e) => { e.stopPropagation(); handleUpload(); }}
                  disabled={!datasetMonth || !datasetType}
                  className="w-full py-4 rounded-2xl bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold text-sm shadow-xl shadow-purple-500/20 transition-all flex items-center justify-center gap-2"
                >
                  Run ETL Pipeline <Loader2 size={16} className={datasetMonth ? 'opacity-0' : 'opacity-100 animate-spin'} />
                </button>
              )}

              {status === 'uploading' && (
                <div className="p-5 rounded-2xl bg-white/5 border border-white/10 space-y-3">
                  <div className="flex justify-between text-xs text-gray-400">
                    <span className="flex items-center gap-2 tracking-wide font-light"><Loader2 size={14} className="animate-spin text-purple-400"/> Processing & Validating...</span>
                    <span className="font-semibold text-white">{uploadProgress}%</span>
                  </div>
                  <div className="h-2 w-full bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-full bg-purple-500 transition-all duration-300 ease-out" style={{ width: `${uploadProgress}%` }} />
                  </div>
                </div>
              )}

              {status === 'success' && (
                <div className="space-y-4 animate-fade-in">
                  <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-start gap-3.5 text-sm leading-relaxed">
                    <CheckCircle2 size={24} className="shrink-0 mt-0.5" />
                    <p>{message}</p>
                  </div>
                  {rowsInserted > 0 && (
                    <IngestionMetricCard label="Records Successfully Inserted" value={rowsInserted.toLocaleString()} icon={Target} colorClass="text-emerald-400 bg-emerald-500/5" />
                  )}
                </div>
              )}

              {status === 'error' && (
                <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-start gap-3.5 text-sm leading-relaxed animate-fade-in">
                  <AlertTriangle size={24} className="shrink-0 mt-0.5" />
                  <p>{message}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Ingestion;