import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../api';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  // Check if we already have a token when the app loads
  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (token) {
      setIsAuthenticated(true);
    }
    setLoading(false);
  }, []);

  const login = async (username, password) => {
    try {
      // FastAPI expects form data for OAuth2 login
      const formData = new URLSearchParams();
      formData.append('username', username);
      formData.append('password', password);

      // THE FIX: Exact match to your auth.py router
      const response = await api.post('/auth/login/access-token', formData, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      if (response.data.access_token) {
        localStorage.setItem('access_token', response.data.access_token);
        setIsAuthenticated(true);
        return { success: true };
      }
      return { success: false, message: "Invalid credentials" };
    } catch (error) {
      return { 
        success: false, 
        message: error.response?.data?.detail || "Failed to connect to authentication server." 
      };
    }
  };

  const logout = () => {
    localStorage.removeItem('access_token');
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

// THIS IS THE LINE VITE WAS COMPLAINING ABOUT!
// It makes `useAuth` available to Login.jsx and App.jsx
export const useAuth = () => useContext(AuthContext);