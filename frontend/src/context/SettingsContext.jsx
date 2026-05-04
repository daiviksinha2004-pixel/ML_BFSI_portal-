import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

const STORAGE_KEY = 'bfsi_platform_settings';

export const DEFAULT_SETTINGS = {
  // Security
  mfa: true,
  sessionTimeoutMins: '30',
  ipWhitelist: false,
  auditTrail: true,
  passwordExpiryDays: '90',
  loginAlerts: true,

  // Notifications
  mlCompletion: true,
  dataIngestion: true,
  highRiskAlerts: true,
  systemHealth: false,
  weeklyReport: true,
  emailDigest: false,
  slackWebhook: '',
  emailTo: 'admin@atsfs.com',
  alertThreshold: '85',

  // Data & Storage
  retentionYears: '7',
  autoBackup: true,
  backupFreq: 'daily',
  compressionEnabled: true,
  encryptionAtRest: true,
  gdprMode: false,
  archiveAfterMonths: '12',

  // Appearance
  colorMode: 'dark',
  defaultDomain: 'life_health',
  defaultPage: 'dashboard',
  sidebarCollapsed: false,
  denseLayout: false,
  animationsEnabled: true,
  chartGrid: true,

  // API & Integrations
  rateLimit: '1000',
  corsOrigins: 'https://app.atsfs.com',
  jwtExpiry: '1440',
  webhookUrl: '',
  groqModel: 'llama3-70b-8192',
  mlTimeout: '120',

  // Compliance
  rbsRequired: true,
  piiMasking: true,
  consentLogging: true,
  dataResidency: 'india',
  regulatoryBody: 'IRDAI',
  soxEnabled: false,
  twoPersonRule: false,
  reportingFreq: 'quarterly',
};

const SettingsContext = createContext();

export const SettingsProvider = ({ children, onIdleTimeout }) => {
  const [settings, setSettings] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? { ...DEFAULT_SETTINGS, ...JSON.parse(stored) } : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  // Persist every change to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  // ── Dense layout side-effect ──────────────────────────────────────
  useEffect(() => {
    const root = document.documentElement;
    settings.denseLayout ? root.classList.add('dense') : root.classList.remove('dense');
  }, [settings.denseLayout]);

  // ── Animations side-effect ────────────────────────────────────────
  useEffect(() => {
    const root = document.documentElement;
    settings.animationsEnabled ? root.classList.remove('no-animations') : root.classList.add('no-animations');
  }, [settings.animationsEnabled]);

  // ── Session idle-timeout ──────────────────────────────────────────
  const idleTimer = useRef(null);

  const resetIdleTimer = useCallback(() => {
    clearTimeout(idleTimer.current);
    const mins = parseInt(settings.sessionTimeoutMins, 10);
    if (!isNaN(mins) && mins > 0 && onIdleTimeout) {
      idleTimer.current = setTimeout(onIdleTimeout, mins * 60 * 1000);
    }
  }, [settings.sessionTimeoutMins, onIdleTimeout]);

  useEffect(() => {
    const events = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll'];
    events.forEach(e => window.addEventListener(e, resetIdleTimer, { passive: true }));
    resetIdleTimer(); // start immediately
    return () => {
      events.forEach(e => window.removeEventListener(e, resetIdleTimer));
      clearTimeout(idleTimer.current);
    };
  }, [resetIdleTimer]);

  // ── Helpers ──────────────────────────────────────────────────────
  const updateSetting = useCallback((key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  }, []);

  const updateSettings = useCallback((updates) => {
    setSettings(prev => ({ ...prev, ...updates }));
  }, []);

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, updateSetting, updateSettings, resetSettings }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => useContext(SettingsContext);
