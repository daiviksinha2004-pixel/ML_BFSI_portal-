import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const ThemeContext = createContext();

const STORAGE_KEY = 'bfsi_color_mode';

export const ThemeProvider = ({ children }) => {
  const [colorMode, setColorMode] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || 'dark';
    } catch {
      return 'dark';
    }
  });

  // Apply the class to <html> and persist
  useEffect(() => {
    const root = document.documentElement;
    if (colorMode === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
    } else {
      root.classList.add('light');
      root.classList.remove('dark');
    }
    localStorage.setItem(STORAGE_KEY, colorMode);
  }, [colorMode]);

  const toggleColorMode = useCallback(() => {
    setColorMode(prev => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const isDark = colorMode === 'dark';

  return (
    <ThemeContext.Provider value={{ colorMode, setColorMode, toggleColorMode, isDark }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
