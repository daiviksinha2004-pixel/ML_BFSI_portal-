import React from 'react';
import { DomainProvider, useDomain } from './context/DomainContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import MainLayout from './components/layout/MainLayout';
import Dashboard from './pages/Dashboard'; 
import AuditLogs from './pages/AuditLogs';
import Predictions from './pages/Predictions';
import Ingestion from './pages/Ingestion';

const AppRouter = () => {
  const { mainDomain, activePage } = useDomain();
  
  // Pull the authentication state directly from our new Context
  const { isAuthenticated, loading } = useAuth();

  // Show nothing while checking localStorage for the token on initial load
  if (loading) return null; 

  // THE BOUNCER: If not logged in, force them to the Login page
  // Notice we don't need 'onLogin' anymore because the context handles it!
  if (!isAuthenticated) {
    return <Login />;
  }
   // <-- Add this!
  // If logged in, show the rest of the app wrapped inside the MainLayout
  return (
    <MainLayout>
      {mainDomain === 'audit' ? (
        <AuditLogs />
      ) : activePage === 'predictions' ? (
        <Predictions />
        ) : activePage === 'ingestion' ? (
          <Ingestion />
      ) : (
        <Dashboard />
      )}
    </MainLayout>
  );
};

function App() {
  return (
    // We wrap the entire app in AuthProvider FIRST so it controls access
    <AuthProvider>
      <DomainProvider>
        <AppRouter />
      </DomainProvider>
    </AuthProvider>
  );
}

export default App;