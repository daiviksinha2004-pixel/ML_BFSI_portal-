import React from 'react';
import { useTheme } from '../../context/ThemeContext';
import './AnimatedLogo.css';

const AnimatedLogo = ({ className = '' }) => {
  const { isDark } = useTheme();
  
  return (
    <div className={`animated-logo-container ${isDark ? 'dark' : 'light'} ${className}`}>
      <span className="logo-text-ats">ATS</span>
      <span className="logo-text-services">services</span>
    </div>
  );
};

export default AnimatedLogo;
