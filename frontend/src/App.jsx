import React from 'react';
import { DomainProvider, useDomain } from './context/DomainContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SettingsProvider } from './context/SettingsContext';
import { ThemeProvider } from './context/ThemeContext';
import Login from './pages/Login';
import MainLayout from './components/layout/MainLayout';
import Dashboard from './pages/Dashboard';
import AuditLogs from './pages/AuditLogs';
import Predictions from './pages/Predictions';
import Ingestion from './pages/Ingestion';
import Settings from './pages/Settings';
import PaymentCurveAnalysis from './pages/PaymentCurveAnalysis';
import PredictionWindow from './pages/PredictionWindow';

const AppRouter = () => {
  const { mainDomain, activePage } = useDomain();
  const { isAuthenticated, loading, logout } = useAuth();

  if (loading) return null;
  if (!isAuthenticated) return <Login />;

  return (
    // SettingsProvider needs logout to fire on idle — lives inside AuthProvider
    <SettingsProvider onIdleTimeout={logout}>
      <MainLayout>
        {mainDomain === 'audit' ? (
          <AuditLogs />
        ) : activePage === 'predictions' ? (
          <Predictions />
        ) : activePage === 'ingestion' ? (
          <Ingestion />
        ) : activePage === 'payment_curve' ? (
          <PaymentCurveAnalysis />
        ) : activePage === 'prediction_window' ? (
          <PredictionWindow />
        ) : activePage === 'settings' ? (
          <Settings />
        ) : (
          <Dashboard />
        )}
      </MainLayout>
    </SettingsProvider>
  );
};

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <DomainProvider>
          <AppRouter />
        </DomainProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;