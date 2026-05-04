import React, { useState, useEffect, useCallback } from 'react';
import {
  Shield, Bell, Database, Palette, Code2, FileText, UserPlus,
  Eye, EyeOff, Lock, Moon, Sun, Monitor,
  AlertTriangle, CheckCircle2, RefreshCw, Download, Trash2, Save,
  ExternalLink, Copy, Zap, XCircle, RotateCcw, Info,
} from 'lucide-react';
import { useDomain } from '../context/DomainContext';
import { useAuth } from '../context/AuthContext';
import { useSettings, DEFAULT_SETTINGS } from '../context/SettingsContext';
import api from '../api';

// ─── UI Primitives ────────────────────────────────────────────────────────────

const Toggle = ({ enabled, onChange, accent = '#2dd4bf', locked = false }) => (
  <button
    onClick={() => !locked && onChange(!enabled)}
    title={locked ? 'This setting is always enforced' : undefined}
    className={`relative flex-shrink-0 w-11 h-6 rounded-full focus:outline-none transition-all duration-300 ${locked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
    style={{
      backgroundColor: enabled ? `${accent}55` : 'rgba(255,255,255,0.08)',
      border: `1px solid ${enabled ? accent : 'rgba(255,255,255,0.12)'}`,
    }}
  >
    <span
      className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full shadow transition-transform duration-300"
      style={{
        backgroundColor: enabled ? accent : 'rgba(255,255,255,0.3)',
        transform: enabled ? 'translateX(20px)' : 'translateX(0)',
      }}
    />
  </button>
);

const SettingRow = ({ label, description, children, danger = false }) => (
  <div className="flex items-center justify-between gap-6 py-4 border-b border-white/5 last:border-0">
    <div className="min-w-0 flex-1">
      <p className={`text-sm font-medium ${danger ? 'text-red-400' : 'text-white'}`}>{label}</p>
      {description && <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{description}</p>}
    </div>
    <div className="flex-shrink-0">{children}</div>
  </div>
);

const SectionCard = ({ children, className = '' }) => (
  <div className={`backdrop-blur-xl bg-white/4 border border-white/8 rounded-2xl px-6 pb-2 pt-2 ${className}`}>
    {children}
  </div>
);

const SectionLabel = ({ children }) => (
  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 px-1 pt-5 pb-2">{children}</p>
);

const Badge = ({ children, color = 'gray' }) => {
  const map = {
    green:  'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
    amber:  'bg-amber-500/15  text-amber-400  border-amber-500/25',
    red:    'bg-red-500/15    text-red-400    border-red-500/25',
    blue:   'bg-blue-500/15   text-blue-400   border-blue-500/25',
    gray:   'bg-white/8       text-gray-400   border-white/10',
    purple: 'bg-purple-500/15 text-purple-400 border-purple-500/25',
  };
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${map[color]}`}>
      {children}
    </span>
  );
};

const SelectInput = ({ value, onChange, options, disabled = false }) => (
  <select
    value={value}
    onChange={e => onChange(e.target.value)}
    disabled={disabled}
    className="bg-black/40 text-white text-sm border border-white/12 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all appearance-none cursor-pointer min-w-[140px] disabled:opacity-50 disabled:cursor-not-allowed"
  >
    {options.map(o => (
      <option key={o.value} value={o.value} className="bg-gray-900">{o.label}</option>
    ))}
  </select>
);

const TextInput = ({ value, onChange, placeholder, type = 'text', mono = false, disabled = false }) => (
  <input
    type={type}
    value={value}
    onChange={e => onChange(e.target.value)}
    placeholder={placeholder}
    disabled={disabled}
    className={`bg-black/40 text-white text-sm border border-white/12 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all w-56 placeholder-gray-600 disabled:opacity-50 ${mono ? 'font-mono text-xs' : ''}`}
  />
);

const ActionButton = ({ onClick, children, variant = 'default', icon: Icon, disabled, loading: isLoading }) => {
  const styles = {
    default: 'bg-white/8 hover:bg-white/14 border-white/12 text-white',
    danger:  'bg-red-500/10 hover:bg-red-500/20 border-red-500/30 text-red-400',
    success: 'bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/30 text-emerald-400',
    primary: 'bg-teal-600/80 hover:bg-teal-500 border-teal-400/30 text-white',
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled || isLoading}
      className={`flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-xl border transition-all duration-200 active:scale-95 ${disabled || isLoading ? 'opacity-40 cursor-not-allowed' : ''} ${styles[variant]}`}
    >
      {isLoading
        ? <RefreshCw size={13} className="animate-spin" />
        : Icon && <Icon size={13} />}
      {children}
    </button>
  );
};

// ─── Confirm Modal ────────────────────────────────────────────────────────────

const ConfirmModal = ({ title, message, confirmLabel = 'Confirm', variant = 'danger', onConfirm, onCancel }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in-up">
    <div className="w-full max-w-sm mx-4 bg-gray-950 border border-white/10 rounded-2xl shadow-2xl p-6">
      <div className="flex items-start gap-3 mb-4">
        <div className={`p-2 rounded-xl ${variant === 'danger' ? 'bg-red-500/15 text-red-400' : 'bg-amber-500/15 text-amber-400'}`}>
          <AlertTriangle size={18} />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white mb-1">{title}</h3>
          <p className="text-xs text-gray-400 leading-relaxed">{message}</p>
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="text-xs font-medium px-4 py-2 rounded-xl border border-white/10 text-gray-400 hover:text-white hover:bg-white/8 transition-all">
          Cancel
        </button>
        <button onClick={onConfirm}
          className={`text-xs font-medium px-4 py-2 rounded-xl border transition-all active:scale-95 ${variant === 'danger' ? 'bg-red-600 hover:bg-red-500 border-red-400/30 text-white' : 'bg-amber-600 hover:bg-amber-500 border-amber-400/30 text-white'}`}>
          {confirmLabel}
        </button>
      </div>
    </div>
  </div>
);

// ─── Toast ────────────────────────────────────────────────────────────────────

const Toast = ({ show, message, type = 'success' }) => (
  <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-3 px-5 py-3 rounded-2xl backdrop-blur-xl shadow-2xl transition-all duration-500 border ${
    show ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
  } ${type === 'success' ? 'bg-black/80 border-emerald-500/30' : 'bg-black/80 border-red-500/30'}`}>
    {type === 'success'
      ? <CheckCircle2 size={15} className="text-emerald-400 flex-shrink-0" />
      : <XCircle size={15} className="text-red-400 flex-shrink-0" />}
    <span className="text-sm text-white font-medium">{message}</span>
  </div>
);

// ─── Health Ping ──────────────────────────────────────────────────────────────

const HealthPing = () => {
  const [status, setStatus] = useState('idle');
  const [latency, setLatency] = useState(null);

  const ping = async () => {
    setStatus('pinging');
    setLatency(null);
    const t0 = performance.now();
    try {
      const res = await fetch('http://localhost:8000/api/v1/health', {
        signal: AbortSignal.timeout(5000),
      });
      const ms = Math.round(performance.now() - t0);
      setLatency(ms);
      setStatus(res.ok ? 'ok' : 'error');
    } catch {
      setStatus('error');
    }
  };

  return (
    <div className="flex items-center gap-2">
      {status === 'ok'      && <Badge color="green">200 OK {latency != null ? `· ${latency}ms` : ''}</Badge>}
      {status === 'error'   && <Badge color="red">Unreachable</Badge>}
      {status === 'pinging' && <Badge color="blue">Pinging…</Badge>}
      <ActionButton icon={status === 'pinging' ? RefreshCw : Zap} onClick={ping} disabled={status === 'pinging'}>
        {status === 'pinging' ? 'Checking…' : 'Run Ping'}
      </ActionButton>
    </div>
  );
};

// ─── Tab definitions ──────────────────────────────────────────────────────────

const TABS = [
  { id: 'security',      label: 'Security',           icon: Shield },
  { id: 'notifications', label: 'Notifications',      icon: Bell },
  { id: 'data',          label: 'Data & Storage',     icon: Database },
  { id: 'appearance',    label: 'Appearance',         icon: Palette },
  { id: 'api',           label: 'API & Integrations', icon: Code2 },
  { id: 'compliance',    label: 'Compliance',         icon: FileText },
  { id: 'users',         label: 'User Management',    icon: UserPlus },
];

// ─────────────────────────────────────────────────────────────────────────────
// MAIN SETTINGS PAGE
// ─────────────────────────────────────────────────────────────────────────────

const Settings = () => {
  const { theme, mainDomain, setMainDomain, setActivePage } = useDomain();
  const { logout } = useAuth();
  const { settings, updateSetting, resetSettings } = useSettings();

  const [activeTab, setActiveTab] = useState('security');
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
  const [confirm, setConfirm] = useState(null);           // { title, message, confirmLabel, variant, onConfirm }
  const [showToken, setShowToken] = useState(false);
  const [copied, setCopied] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [purgeLoading, setPurgeLoading] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);

  // User registration state
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [regLoading, setRegLoading] = useState(false);
  const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';

  const accent = mainDomain === 'debt' ? '#fbbf24' : '#2dd4bf';

  // ── Toast helper ───────────────────────────────────────────────────────────
  const showToast = useCallback((message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast(t => ({ ...t, show: false })), 3000);
  }, []);

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSave = () => {
    // Settings already auto-save to localStorage via SettingsContext.
    // Apply default domain immediately if changed.
    if (settings.defaultDomain !== mainDomain) {
      setMainDomain(settings.defaultDomain);
    }
    if (settings.defaultPage) {
      setActivePage(settings.defaultPage);
    }
    showToast('All settings saved and applied.');
  };

  // ── Reset to defaults ──────────────────────────────────────────────────────
  const handleReset = () => {
    setConfirm({
      title: 'Reset All Settings',
      message: 'This will revert every setting to its factory default. This action cannot be undone.',
      confirmLabel: 'Reset Everything',
      variant: 'danger',
      onConfirm: () => {
        resetSettings();
        setConfirm(null);
        showToast('Settings reset to defaults.');
      },
    });
  };

  // ── JWT copy ───────────────────────────────────────────────────────────────
  const realToken = localStorage.getItem('access_token') || '';
  const tokenDisplay = showToken
    ? (realToken.length > 40 ? realToken.slice(0, 40) + '…' : realToken)
    : '••••••••••••••••••••••••••••••••••••••••';

  const copyToken = () => {
    if (!realToken) return;
    navigator.clipboard.writeText(realToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Terminate sessions ─────────────────────────────────────────────────────
  const handleTerminate = () => {
    setConfirm({
      title: 'Terminate All Sessions',
      message: 'This will immediately invalidate your access token and log you out of every device.',
      confirmLabel: 'Terminate & Logout',
      variant: 'danger',
      onConfirm: () => {
        setConfirm(null);
        logout();
      },
    });
  };

  // ── Export data ────────────────────────────────────────────────────────────
  const handleExport = async () => {
    setExportLoading(true);
    try {
      const domain = mainDomain === 'debt' ? 'debt_collection' : 'life_insurance';
      const [summaryRes, chartsRes] = await Promise.all([
        api.get(`/analytics/summary/${domain}`),
        api.get(`/analytics/charts/${domain}`),
      ]);
      const exportData = {
        exported_at: new Date().toISOString(),
        domain,
        settings: settings,
        summary: summaryRes.data,
        charts: chartsRes.data,
      };
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bfsi_export_${domain}_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Data exported successfully.');
    } catch {
      showToast('Export failed — check backend connection.', 'error');
    } finally {
      setExportLoading(false);
    }
  };

  // ── Purge test data ────────────────────────────────────────────────────────
  const confirmPurge = () => {
    setConfirm({
      title: 'Purge Test Records',
      message: 'All records tagged as test/sandbox ingestions will be permanently deleted. This cannot be undone.',
      confirmLabel: 'Purge Permanently',
      variant: 'danger',
      onConfirm: async () => {
        setConfirm(null);
        setPurgeLoading(true);
        try {
          await api.delete('/data/purge-test');
          showToast('Test records purged successfully.');
        } catch {
          // If the endpoint doesn't exist yet, show informative message
          showToast('Purge endpoint not available — configure in backend.', 'error');
        } finally {
          setPurgeLoading(false);
        }
      },
    });
  };

  // ── Compliance report download ─────────────────────────────────────────────
  const handleComplianceReport = async () => {
    setReportLoading(true);
    await new Promise(r => setTimeout(r, 800)); // simulate generation
    const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>BFSI Platform — Compliance Report</title>
  <style>
    body { font-family: 'Segoe UI', sans-serif; background:#0f1117; color:#e2e8f0; margin:0; padding:32px; }
    h1 { color:#fff; font-size:22px; font-weight:300; margin-bottom:4px; }
    .meta { color:#64748b; font-size:12px; margin-bottom:32px; }
    .section { margin-bottom:28px; }
    .section-title { color:#94a3b8; font-size:10px; text-transform:uppercase; letter-spacing:3px; margin-bottom:12px; border-bottom:1px solid #1e293b; padding-bottom:6px; }
    table { width:100%; border-collapse:collapse; font-size:13px; }
    td { padding:10px 0; border-bottom:1px solid #1e293b; }
    td:first-child { color:#94a3b8; width:220px; }
    td:last-child { color:#e2e8f0; font-weight:500; }
    .badge-green  { background:#064e3b; color:#34d399; padding:2px 8px; border-radius:99px; font-size:11px; }
    .badge-amber  { background:#451a03; color:#fbbf24; padding:2px 8px; border-radius:99px; font-size:11px; }
    .badge-red    { background:#450a0a; color:#f87171; padding:2px 8px; border-radius:99px; font-size:11px; }
    .footer { margin-top:40px; color:#475569; font-size:11px; border-top:1px solid #1e293b; padding-top:16px; }
  </style>
</head>
<body>
  <h1>BFSI Platform — Compliance Posture Report</h1>
  <p class="meta">Generated: ${timestamp} IST &nbsp;|&nbsp; Regulatory Body: ${settings.regulatoryBody} &nbsp;|&nbsp; Reporting Frequency: ${settings.reportingFreq}</p>

  <div class="section">
    <div class="section-title">Regulatory Framework</div>
    <table>
      <tr><td>Primary Regulatory Body</td><td>${settings.regulatoryBody}</td></tr>
      <tr><td>Data Residency</td><td>${settings.dataResidency.toUpperCase()}</td></tr>
      <tr><td>Reporting Frequency</td><td>${settings.reportingFreq.charAt(0).toUpperCase() + settings.reportingFreq.slice(1)}</td></tr>
    </table>
  </div>

  <div class="section">
    <div class="section-title">Data Governance</div>
    <table>
      <tr><td>Role-Based Access (RBAC)</td><td><span class="badge-green">Enforced</span></td></tr>
      <tr><td>PII Masking</td><td><span class="${settings.piiMasking ? 'badge-green">Enabled' : 'badge-red">Disabled'}</span></td></tr>
      <tr><td>Consent Logging</td><td><span class="${settings.consentLogging ? 'badge-green">Active' : 'badge-amber">Inactive'}</span></td></tr>
      <tr><td>Data Retention Period</td><td>${settings.retentionYears} years</td></tr>
      <tr><td>Encryption at Rest</td><td><span class="badge-green">AES-256 Always On</span></td></tr>
      <tr><td>GDPR Strict Mode</td><td><span class="${settings.gdprMode ? 'badge-green">Enabled' : 'badge-amber">Disabled'}</span></td></tr>
    </table>
  </div>

  <div class="section">
    <div class="section-title">Security Controls</div>
    <table>
      <tr><td>Multi-Factor Authentication</td><td><span class="${settings.mfa ? 'badge-green">Enabled' : 'badge-red">Disabled'}</span></td></tr>
      <tr><td>Session Timeout</td><td>${settings.sessionTimeoutMins} minutes</td></tr>
      <tr><td>Password Expiry</td><td>${settings.passwordExpiryDays} days</td></tr>
      <tr><td>IP Allowlist</td><td><span class="${settings.ipWhitelist ? 'badge-green">Active' : 'badge-amber">Inactive'}</span></td></tr>
      <tr><td>Immutable Audit Trail</td><td><span class="badge-green">Always On</span></td></tr>
      <tr><td>Login Alerts</td><td><span class="${settings.loginAlerts ? 'badge-green">Enabled' : 'badge-amber">Disabled'}</span></td></tr>
    </table>
  </div>

  <div class="section">
    <div class="section-title">Advanced Controls</div>
    <table>
      <tr><td>SOX Financial Controls</td><td><span class="${settings.soxEnabled ? 'badge-green">Enabled' : 'badge-amber">Disabled'}</span></td></tr>
      <tr><td>Two-Person Integrity Rule</td><td><span class="${settings.twoPersonRule ? 'badge-green">Active' : 'badge-amber">Inactive'}</span></td></tr>
    </table>
  </div>

  <div class="footer">
    This report is auto-generated by the BFSI Analytics Platform. Settings are persisted in local secure storage.
    For external audits, export a server-side configuration snapshot from your infrastructure team.
  </div>
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `compliance_report_${new Date().toISOString().slice(0,10)}.html`;
    a.click();
    URL.revokeObjectURL(url);
    setReportLoading(false);
    showToast('Compliance report downloaded.');
  };

  // ── Register new user ────────────────────────────────────────────────────────
  const handleRegisterUser = async () => {
    if (!regEmail || !regPassword) {
      showToast('Please fill in all fields.', 'error');
      return;
    }

    setRegLoading(true);
    try {
      await api.post('/auth/register', {
        email: regEmail,
        password: regPassword,
        tenant_id: DEFAULT_TENANT_ID,
        full_name: regEmail.split('@')[0], // Use email prefix as default name
        role: 'user',
        is_active: true,
      });
      showToast('User registered successfully.');
      setRegEmail('');
      setRegPassword('');
    } catch (error) {
      const message = error.response?.data?.detail || 'Registration failed. Please try again.';
      showToast(message, 'error');
    } finally {
      setRegLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // TAB CONTENT
  // ─────────────────────────────────────────────────────────────────────────

  const renderContent = () => {
    switch (activeTab) {

      // ── SECURITY ──────────────────────────────────────────────────────────
      case 'security': return (
        <div className="flex flex-col gap-5">
          <SectionLabel>Authentication</SectionLabel>
          <SectionCard>
            <SettingRow label="Multi-Factor Authentication" description="Require TOTP authenticator app on every sign-in">
              <Toggle enabled={settings.mfa} onChange={v => updateSetting('mfa', v)} accent={accent} />
            </SettingRow>
            <SettingRow label="Login Alerts" description="Email notification on every new login from an unrecognised device">
              <Toggle enabled={settings.loginAlerts} onChange={v => updateSetting('loginAlerts', v)} accent={accent} />
            </SettingRow>
            <SettingRow label="Session Idle Timeout" description="Automatically log out after this period of inactivity — applies immediately">
              <SelectInput
                value={settings.sessionTimeoutMins}
                onChange={v => updateSetting('sessionTimeoutMins', v)}
                options={[
                  { value: '5',   label: '5 min (debug)' },
                  { value: '15',  label: '15 min' },
                  { value: '30',  label: '30 min' },
                  { value: '60',  label: '1 hour' },
                  { value: '480', label: '8 hours' },
                  { value: '0',   label: 'Never (not recommended)' },
                ]}
              />
            </SettingRow>
            <SettingRow label="Password Expiry" description="Force password reset prompt after this many days (tracked client-side)">
              <SelectInput
                value={settings.passwordExpiryDays}
                onChange={v => updateSetting('passwordExpiryDays', v)}
                options={[
                  { value: '30',  label: '30 days' },
                  { value: '60',  label: '60 days' },
                  { value: '90',  label: '90 days' },
                  { value: '180', label: '180 days' },
                ]}
              />
            </SettingRow>
          </SectionCard>

          <SectionLabel>Network Security</SectionLabel>
          <SectionCard>
            <SettingRow label="IP Allowlist" description="Restrict platform access to approved IP ranges only (enforced at backend)">
              <Toggle enabled={settings.ipWhitelist} onChange={v => updateSetting('ipWhitelist', v)} accent={accent} />
            </SettingRow>
            <SettingRow label="Immutable Audit Trail" description="Write-once event log for all user actions — SOC 2 compliant, always enforced">
              <div className="flex items-center gap-2">
                <Badge color="green">Always On</Badge>
                <Toggle enabled={settings.auditTrail} onChange={() => {}} accent="#6b7280" locked />
              </div>
            </SettingRow>
          </SectionCard>

          <SectionLabel>Active Session</SectionLabel>
          <SectionCard>
            <SettingRow label="Current JWT Token" description="Your active bearer token — copy to test API endpoints directly">
              <div className="flex items-center gap-2 flex-wrap">
                <code className="text-xs font-mono text-gray-400 bg-white/5 px-2 py-1.5 rounded-lg max-w-[220px] truncate border border-white/8">
                  {tokenDisplay || 'No token found'}
                </code>
                <ActionButton onClick={() => setShowToken(p => !p)} icon={showToken ? EyeOff : Eye}>
                  {showToken ? 'Hide' : 'Show'}
                </ActionButton>
                <ActionButton onClick={copyToken} icon={Copy} disabled={!realToken}>
                  {copied ? 'Copied!' : 'Copy'}
                </ActionButton>
              </div>
            </SettingRow>
            <SettingRow label="Token Expiry Setting" description="JWT lifespan — change under API & Integrations tab">
              <Badge color="blue">{settings.jwtExpiry} min</Badge>
            </SettingRow>
            <SettingRow label="Terminate All Sessions" description="Immediately revoke all active tokens across every device" danger>
              <ActionButton variant="danger" icon={Lock} onClick={handleTerminate}>
                Terminate & Logout
              </ActionButton>
            </SettingRow>
          </SectionCard>
        </div>
      );

      // ── NOTIFICATIONS ──────────────────────────────────────────────────────
      case 'notifications': return (
        <div className="flex flex-col gap-5">
          <SectionLabel>In-Platform Alerts</SectionLabel>
          <SectionCard>
            <SettingRow label="ML Model Completion" description="Notify when a training job finishes (success or failure)">
              <Toggle enabled={settings.mlCompletion} onChange={v => updateSetting('mlCompletion', v)} accent={accent} />
            </SettingRow>
            <SettingRow label="Data Ingestion Events" description="Alert when a CSV upload succeeds, fails, or triggers schema drift">
              <Toggle enabled={settings.dataIngestion} onChange={v => updateSetting('dataIngestion', v)} accent={accent} />
            </SettingRow>
            <SettingRow label="High-Risk Account Alerts" description="Real-time push when propensity score exceeds threshold">
              <Toggle enabled={settings.highRiskAlerts} onChange={v => updateSetting('highRiskAlerts', v)} accent={accent} />
            </SettingRow>
            <SettingRow label="System Health Degradation" description="Alert on API latency spikes or database connectivity issues">
              <Toggle enabled={settings.systemHealth} onChange={v => updateSetting('systemHealth', v)} accent={accent} />
            </SettingRow>
            <SettingRow
              label="Risk Alert Threshold"
              description={`Trigger high-risk alert when model confidence score ≥ this value. Currently: ${settings.alertThreshold}%`}
            >
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="50" max="99" step="1"
                  value={settings.alertThreshold}
                  onChange={e => updateSetting('alertThreshold', e.target.value)}
                  className="w-32 accent-teal-400 cursor-pointer"
                />
                <span className="text-sm text-white font-semibold w-10 text-right">{settings.alertThreshold}%</span>
              </div>
            </SettingRow>
          </SectionCard>

          <SectionLabel>Email & Digest</SectionLabel>
          <SectionCard>
            <SettingRow label="Weekly Summary Report" description="Receive a PDF summary of portfolio KPIs every Monday at 8am">
              <Toggle enabled={settings.weeklyReport} onChange={v => updateSetting('weeklyReport', v)} accent={accent} />
            </SettingRow>
            <SettingRow label="Daily Email Digest" description="Batched summary of daily alerts — reduces notification fatigue">
              <Toggle enabled={settings.emailDigest} onChange={v => updateSetting('emailDigest', v)} accent={accent} />
            </SettingRow>
            <SettingRow label="Notification Recipient" description="Primary email address for all platform alerts">
              <TextInput
                value={settings.emailTo}
                onChange={v => updateSetting('emailTo', v)}
                placeholder="admin@company.com"
                type="email"
              />
            </SettingRow>
          </SectionCard>

          <SectionLabel>Webhook Integration</SectionLabel>
          <SectionCard>
            <SettingRow label="Slack Webhook URL" description="Post alert notifications directly into a Slack channel">
              <div className="flex items-center gap-2">
                <TextInput
                  value={settings.slackWebhook}
                  onChange={v => updateSetting('slackWebhook', v)}
                  placeholder="https://hooks.slack.com/…"
                  mono
                />
                {settings.slackWebhook && (
                  <Badge color={settings.slackWebhook.startsWith('https://hooks.slack.com') ? 'green' : 'red'}>
                    {settings.slackWebhook.startsWith('https://hooks.slack.com') ? 'Valid' : 'Invalid URL'}
                  </Badge>
                )}
              </div>
            </SettingRow>
          </SectionCard>
        </div>
      );

      // ── DATA & STORAGE ─────────────────────────────────────────────────────
      case 'data': return (
        <div className="flex flex-col gap-5">
          <SectionLabel>Retention & Archival</SectionLabel>
          <SectionCard>
            <SettingRow label="Data Retention Period" description="Regulatory minimum for IRDAI / RBI compliance (years)">
              <SelectInput
                value={settings.retentionYears}
                onChange={v => updateSetting('retentionYears', v)}
                options={[{ value: '3', label: '3 years' }, { value: '5', label: '5 years' }, { value: '7', label: '7 years' }, { value: '10', label: '10 years' }]}
              />
            </SettingRow>
            <SettingRow label="Auto-Archive Inactive Records" description="Move records with no activity to cold storage after N months">
              <SelectInput
                value={settings.archiveAfterMonths}
                onChange={v => updateSetting('archiveAfterMonths', v)}
                options={[{ value: '6', label: '6 months' }, { value: '12', label: '12 months' }, { value: '24', label: '24 months' }, { value: 'never', label: 'Never' }]}
              />
            </SettingRow>
          </SectionCard>

          <SectionLabel>Backup</SectionLabel>
          <SectionCard>
            <SettingRow label="Automated Backups" description="Scheduled full database snapshots to S3-compatible bucket">
              <Toggle enabled={settings.autoBackup} onChange={v => updateSetting('autoBackup', v)} accent={accent} />
            </SettingRow>
            <SettingRow label="Backup Frequency" description="How often to create encrypted snapshots">
              <SelectInput
                value={settings.backupFreq}
                onChange={v => updateSetting('backupFreq', v)}
                disabled={!settings.autoBackup}
                options={[{ value: 'hourly', label: 'Hourly' }, { value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }]}
              />
            </SettingRow>
            <SettingRow label="Compression" description="Reduce storage footprint with gzip compression on backup archives">
              <Toggle enabled={settings.compressionEnabled} onChange={v => updateSetting('compressionEnabled', v)} accent={accent} />
            </SettingRow>
          </SectionCard>

          <SectionLabel>Encryption & Privacy</SectionLabel>
          <SectionCard>
            <SettingRow label="Encryption at Rest" description="AES-256 encryption for all stored data — mandatory for PCI-DSS, always on">
              <div className="flex items-center gap-2">
                <Badge color="green">AES-256</Badge>
                <Toggle enabled={settings.encryptionAtRest} onChange={() => {}} accent="#6b7280" locked />
              </div>
            </SettingRow>
            <SettingRow label="GDPR Strict Mode" description="Enable right-to-erasure workflows and consent management APIs">
              <div className="flex items-center gap-2">
                <Toggle enabled={settings.gdprMode} onChange={v => updateSetting('gdprMode', v)} accent={accent} />
                {settings.gdprMode && <Badge color="amber">Active — enforce across APIs</Badge>}
              </div>
            </SettingRow>
          </SectionCard>

          <SectionLabel>Danger Zone</SectionLabel>
          <SectionCard className="border-red-500/20 bg-red-500/4">
            <SettingRow label="Export All Data" description="Download full analytics snapshot for the active domain as JSON archive" danger>
              <ActionButton variant="danger" icon={Download} onClick={handleExport} loading={exportLoading}>
                {exportLoading ? 'Exporting…' : 'Export Archive'}
              </ActionButton>
            </SettingRow>
            <SettingRow label="Purge Test Records" description="Permanently delete all records tagged as test/sandbox ingestions" danger>
              <ActionButton variant="danger" icon={Trash2} onClick={confirmPurge} loading={purgeLoading}>
                {purgeLoading ? 'Purging…' : 'Purge Test Data'}
              </ActionButton>
            </SettingRow>
          </SectionCard>
        </div>
      );

      // ── APPEARANCE ─────────────────────────────────────────────────────────
      case 'appearance': return (
        <div className="flex flex-col gap-5">
          <SectionLabel>Theme & Display</SectionLabel>
          <SectionCard>
            <SettingRow label="Colour Mode" description="Platform-wide theme preference (Dark is recommended for BFSI data density)">
              <div className="flex gap-2">
                {[{ v: 'dark', icon: Moon, label: 'Dark' }, { v: 'system', icon: Monitor, label: 'System' }].map(({ v, icon: Icon, label }) => (
                  <button key={v} onClick={() => updateSetting('colorMode', v)}
                    className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl border transition-all ${settings.colorMode === v ? 'bg-white/10 border-white/25 text-white' : 'border-white/8 text-gray-500 hover:text-white hover:bg-white/5'}`}>
                    <Icon size={12} />{label}
                  </button>
                ))}
              </div>
            </SettingRow>
            <SettingRow label="Default Landing Domain" description="Which domain tab opens after login (applied immediately on Save)">
              <SelectInput
                value={settings.defaultDomain}
                onChange={v => updateSetting('defaultDomain', v)}
                options={[
                  { value: 'life_health', label: 'Life & Health' },
                  { value: 'debt', label: 'Debt Collection' },
                  { value: 'audit', label: 'Audit Logs' },
                ]}
              />
            </SettingRow>
            <SettingRow label="Default Landing Page" description="First page shown after domain selection (applied immediately on Save)">
              <SelectInput
                value={settings.defaultPage}
                onChange={v => updateSetting('defaultPage', v)}
                options={[
                  { value: 'dashboard', label: 'Dashboard' },
                  { value: 'predictions', label: 'Predictions' },
                  { value: 'analytics', label: 'Analytics' },
                  { value: 'ingestion', label: 'Data Ingestion' },
                ]}
              />
            </SettingRow>
          </SectionCard>

          <SectionLabel>Layout Options</SectionLabel>
          <SectionCard>
            <SettingRow label="Dense Layout" description="Reduce card padding globally for higher information density — applied instantly">
              <div className="flex items-center gap-2">
                <Toggle enabled={settings.denseLayout} onChange={v => updateSetting('denseLayout', v)} accent={accent} />
                {settings.denseLayout && <Badge color="amber">Active</Badge>}
              </div>
            </SettingRow>
            <SettingRow label="UI Animations" description="Smooth transitions, fade-ins, and micro-interactions — disable for accessibility or performance">
              <div className="flex items-center gap-2">
                <Toggle enabled={settings.animationsEnabled} onChange={v => updateSetting('animationsEnabled', v)} accent={accent} />
                {!settings.animationsEnabled && <Badge color="amber">Disabled</Badge>}
              </div>
            </SettingRow>
            <SettingRow label="Chart Grid Lines" description="Show faint background grid on all recharts visualisations">
              <Toggle enabled={settings.chartGrid} onChange={v => updateSetting('chartGrid', v)} accent={accent} />
            </SettingRow>
          </SectionCard>

          <SectionLabel>Reset</SectionLabel>
          <SectionCard>
            <SettingRow label="Factory Reset All Settings" description="Revert every setting to its original default value">
              <ActionButton icon={RotateCcw} variant="danger" onClick={handleReset}>Reset to Defaults</ActionButton>
            </SettingRow>
          </SectionCard>
        </div>
      );

      // ── API & INTEGRATIONS ─────────────────────────────────────────────────
      case 'api': return (
        <div className="flex flex-col gap-5">
          <SectionLabel>API Server</SectionLabel>
          <SectionCard>
            <SettingRow label="Base URL" description="Active FastAPI backend endpoint">
              <div className="flex items-center gap-2">
                <HealthPing />
              </div>
            </SettingRow>
            <SettingRow label="API Rate Limit" description="Maximum requests per user per hour (informational — enforce in backend)">
              <div className="flex items-center gap-2">
                <TextInput value={settings.rateLimit} onChange={v => updateSetting('rateLimit', v)} placeholder="1000" />
                <span className="text-sm text-gray-400">/hr</span>
              </div>
            </SettingRow>
            <SettingRow label="JWT Expiry" description="Minutes until an access token must be refreshed — security vs. UX tradeoff">
              <div className="flex items-center gap-2">
                <TextInput value={settings.jwtExpiry} onChange={v => updateSetting('jwtExpiry', v)} placeholder="1440" />
                <span className="text-sm text-gray-400">min</span>
              </div>
            </SettingRow>
            <SettingRow label="ML Inference Timeout" description="Max seconds a model training/prediction request can run before being aborted">
              <div className="flex items-center gap-2">
                <TextInput value={settings.mlTimeout} onChange={v => updateSetting('mlTimeout', v)} placeholder="120" />
                <span className="text-sm text-gray-400">sec</span>
              </div>
            </SettingRow>
            <SettingRow label="CORS Allowed Origins" description="Trusted frontend origins for Cross-Origin requests (comma-separated)">
              <TextInput value={settings.corsOrigins} onChange={v => updateSetting('corsOrigins', v)} placeholder="https://..." mono />
            </SettingRow>
          </SectionCard>

          <SectionLabel>AI / LLM Configuration</SectionLabel>
          <SectionCard>
            <SettingRow label="Data Copilot Model" description="LLM used by the chat assistant — changes take effect on next message sent">
              <div className="flex items-center gap-2">
                <SelectInput
                  value={settings.groqModel}
                  onChange={v => updateSetting('groqModel', v)}
                  options={[
                    { value: 'llama3-70b-8192',    label: 'Llama 3 70B (best quality)' },
                    { value: 'llama3-8b-8192',     label: 'Llama 3 8B (fastest)' },
                    { value: 'mixtral-8x7b-32768', label: 'Mixtral 8×7B (long context)' },
                    { value: 'gemma-7b-it',        label: 'Gemma 7B (lightweight)' },
                  ]}
                />
                <Badge color="purple">Live</Badge>
              </div>
            </SettingRow>
            <SettingRow label="Event Webhook Endpoint" description="POST target for real-time event streams from the backend">
              <div className="flex items-center gap-2">
                <TextInput value={settings.webhookUrl} onChange={v => updateSetting('webhookUrl', v)} placeholder="https://..." mono />
                {settings.webhookUrl && (
                  <Badge color={settings.webhookUrl.startsWith('https://') ? 'green' : 'red'}>
                    {settings.webhookUrl.startsWith('https://') ? 'HTTPS ✓' : 'Must use HTTPS'}
                  </Badge>
                )}
              </div>
            </SettingRow>
          </SectionCard>

          <SectionLabel>Developer Tools</SectionLabel>
          <SectionCard>
            <SettingRow label="OpenAPI Docs" description="Interactive Swagger UI — test every backend endpoint with live auth">
              <ActionButton icon={ExternalLink} onClick={() => window.open('http://localhost:8000/docs', '_blank')}>
                Open Swagger UI
              </ActionButton>
            </SettingRow>
            <SettingRow label="Redoc Reference" description="Clean, readable API reference documentation">
              <ActionButton icon={ExternalLink} onClick={() => window.open('http://localhost:8000/redoc', '_blank')}>
                Open Redoc
              </ActionButton>
            </SettingRow>
            <SettingRow label="Backend Health Check" description="Ping the FastAPI backend to verify connectivity and measure latency">
              {/* HealthPing is rendered inline above — show standalone version here */}
              <ActionButton icon={ExternalLink} onClick={() => window.open('http://localhost:8000/api/v1/health', '_blank')}>
                View Raw Health
              </ActionButton>
            </SettingRow>
          </SectionCard>
        </div>
      );

      // ── COMPLIANCE ─────────────────────────────────────────────────────────
      case 'compliance': return (
        <div className="flex flex-col gap-5">
          <SectionLabel>Regulatory Framework</SectionLabel>
          <SectionCard>
            <SettingRow label="Primary Regulatory Body" description="Governs mandatory reporting and audit requirements">
              <SelectInput
                value={settings.regulatoryBody}
                onChange={v => updateSetting('regulatoryBody', v)}
                options={[
                  { value: 'IRDAI', label: 'IRDAI (Insurance Regulatory)' },
                  { value: 'RBI',   label: 'RBI (Reserve Bank of India)' },
                  { value: 'SEBI',  label: 'SEBI (Securities Exchange)' },
                  { value: 'MCA',   label: 'MCA (Companies Act)' },
                ]}
              />
            </SettingRow>
            <SettingRow label="Data Residency" description="Jurisdiction where all data must be stored and processed">
              <SelectInput
                value={settings.dataResidency}
                onChange={v => updateSetting('dataResidency', v)}
                options={[
                  { value: 'india',  label: 'India (RBI/IRDAI default)' },
                  { value: 'eu',     label: 'EU / EEA (GDPR)' },
                  { value: 'us',     label: 'United States (SOC 2)' },
                  { value: 'global', label: 'Global (no restriction)' },
                ]}
              />
            </SettingRow>
            <SettingRow label="Compliance Reporting Frequency" description="How often automated compliance reports are generated and archived">
              <SelectInput
                value={settings.reportingFreq}
                onChange={v => updateSetting('reportingFreq', v)}
                options={[
                  { value: 'monthly',   label: 'Monthly' },
                  { value: 'quarterly', label: 'Quarterly' },
                  { value: 'annually',  label: 'Annually' },
                ]}
              />
            </SettingRow>
          </SectionCard>

          <SectionLabel>Data Governance</SectionLabel>
          <SectionCard>
            <SettingRow label="Role-Based Access (RBAC)" description="Least-privilege access enforced across all platform modules — cannot be disabled">
              <div className="flex items-center gap-2">
                <Badge color="green">Enforced</Badge>
                <Toggle enabled={true} onChange={() => {}} accent="#6b7280" locked />
              </div>
            </SettingRow>
            <SettingRow label="PII Masking" description="Automatically redact Aadhaar, PAN, and mobile numbers in API responses">
              <Toggle enabled={settings.piiMasking} onChange={v => updateSetting('piiMasking', v)} accent={accent} />
            </SettingRow>
            <SettingRow label="Consent Logging" description="Record customer data usage consent events with timestamp and IP address">
              <Toggle enabled={settings.consentLogging} onChange={v => updateSetting('consentLogging', v)} accent={accent} />
            </SettingRow>
          </SectionCard>

          <SectionLabel>Advanced Financial Controls</SectionLabel>
          <SectionCard>
            <SettingRow label="SOX Financial Controls" description="Enable Sarbanes-Oxley-aligned change management and separation of duties workflows">
              <Toggle enabled={settings.soxEnabled} onChange={v => updateSetting('soxEnabled', v)} accent={accent} />
            </SettingRow>
            <SettingRow label="Two-Person Integrity Rule" description="Require a second authorised user to approve any destructive or financial action">
              <Toggle enabled={settings.twoPersonRule} onChange={v => updateSetting('twoPersonRule', v)} accent={accent} />
            </SettingRow>
          </SectionCard>

          <SectionLabel>Reports</SectionLabel>
          <SectionCard>
            <SettingRow
              label="Generate Compliance Report"
              description={`Download an HTML audit report reflecting current ${settings.regulatoryBody} compliance posture`}
            >
              <ActionButton icon={Download} variant="success" onClick={handleComplianceReport} loading={reportLoading}>
                {reportLoading ? 'Generating…' : 'Download Report'}
              </ActionButton>
            </SettingRow>
          </SectionCard>
        </div>
      );

      // ── USER MANAGEMENT ─────────────────────────────────────────────────────
      case 'users': return (
        <div className="flex flex-col gap-5">
          <SectionLabel>Register New User</SectionLabel>
          <SectionCard>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Email Address</label>
                <input
                  type="email"
                  value={regEmail}
                  onChange={e => setRegEmail(e.target.value)}
                  placeholder="user@example.com"
                  className="w-full bg-black/40 text-white text-sm border border-white/12 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all placeholder-gray-600"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Password</label>
                <div className="relative">
                  <input
                    type={showRegPassword ? 'text' : 'password'}
                    value={regPassword}
                    onChange={e => setRegPassword(e.target.value)}
                    placeholder="Enter password"
                    className="w-full bg-black/40 text-white text-sm border border-white/12 rounded-xl px-4 py-2.5 pr-10 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all placeholder-gray-600"
                  />
                  <button
                    onClick={() => setShowRegPassword(!showRegPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                  >
                    {showRegPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Tenant ID</label>
                <div className="relative">
                  <input
                    type="text"
                    value={DEFAULT_TENANT_ID}
                    disabled
                    className="w-full bg-black/20 text-gray-500 text-sm border border-white/8 rounded-xl px-4 py-2.5 font-mono cursor-not-allowed"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <Badge color="amber">Locked</Badge>
                  </div>
                </div>
                <p className="text-[10px] text-gray-500 mt-1">Tenant ID is pre-configured and cannot be changed</p>
              </div>
              <div className="pt-2">
                <ActionButton
                  variant="primary"
                  icon={UserPlus}
                  onClick={handleRegisterUser}
                  loading={regLoading}
                  disabled={!regEmail || !regPassword}
                  className="w-full justify-center"
                >
                  {regLoading ? 'Registering…' : 'Register User'}
                </ActionButton>
              </div>
            </div>
          </SectionCard>
        </div>
      );

      default: return null;
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full pb-6 overflow-hidden animate-fade-in-up">
      {/* Page header */}
      <div className="flex-shrink-0 flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-light text-white tracking-wide">Platform Settings</h1>
          <p className="text-xs text-gray-500 mt-1">All changes auto-save instantly. Click Save to apply domain/page defaults.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleReset}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm transition-all active:scale-95 text-gray-400 border border-white/10 hover:bg-white/8 hover:text-white"
          >
            <RotateCcw size={14} />
            Reset
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm transition-all active:scale-95 text-white border shadow-lg"
            style={{ backgroundColor: `${accent}cc`, borderColor: `${accent}60`, boxShadow: `0 4px 24px ${accent}30` }}
          >
            <Save size={15} />
            Save Changes
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 gap-6 overflow-hidden min-h-0">
        {/* Left tab rail */}
        <div className="flex-shrink-0 w-52 flex flex-col gap-1">
          {TABS.map(({ id, label, icon: Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 text-left w-full ${active ? 'text-white' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}
                style={active ? {
                  backgroundColor: `${accent}18`,
                  borderLeft: `3px solid ${accent}`,
                  boxShadow: `inset 0 0 20px ${accent}08`,
                } : { borderLeft: '3px solid transparent' }}
              >
                <Icon size={16} style={active ? { color: accent } : {}} />
                {label}
              </button>
            );
          })}
        </div>

        {/* Content panel */}
        <div className="flex-1 overflow-y-auto pr-1">
          {renderContent()}
        </div>
      </div>

      {/* Toast & Confirm Modal */}
      <Toast show={toast.show} message={toast.message} type={toast.type} />
      {confirm && (
        <ConfirmModal
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          variant={confirm.variant}
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
};

export default Settings;
