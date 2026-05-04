import React, { useState } from 'react';
import { useTheme } from '../../context/ThemeContext';
import './ThemeToggle.css';

/**
 * ThemeToggle — A premium, animated celestial dark/light mode toggle.
 * Features a sun/moon transition with orbiting stars, crater details,
 * and smooth morphing animations.
 */
const ThemeToggle = () => {
  const { isDark, toggleColorMode } = useTheme();
  const [isAnimating, setIsAnimating] = useState(false);

  const handleToggle = () => {
    if (isAnimating) return;
    setIsAnimating(true);
    toggleColorMode();
    setTimeout(() => setIsAnimating(false), 700);
  };

  return (
    <button
      onClick={handleToggle}
      className={`theme-toggle-btn ${isDark ? 'theme-toggle-dark' : 'theme-toggle-light'} ${isAnimating ? 'theme-toggle-animating' : ''}`}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {/* Background track */}
      <div className="tt-track">
        {/* Stars (visible in dark) */}
        <div className="tt-stars">
          <span className="tt-star" style={{ top: '18%', left: '15%', animationDelay: '0s' }} />
          <span className="tt-star" style={{ top: '60%', left: '20%', animationDelay: '0.4s' }} />
          <span className="tt-star" style={{ top: '30%', left: '35%', animationDelay: '0.8s' }} />
          <span className="tt-star" style={{ top: '72%', left: '42%', animationDelay: '1.2s' }} />
          <span className="tt-star" style={{ top: '22%', left: '55%', animationDelay: '0.2s' }} />
          <span className="tt-star" style={{ top: '50%', left: '60%', animationDelay: '0.6s' }} />
        </div>

        {/* Clouds (visible in light) */}
        <div className="tt-clouds">
          <span className="tt-cloud tt-cloud-1" />
          <span className="tt-cloud tt-cloud-2" />
          <span className="tt-cloud tt-cloud-3" />
        </div>

        {/* Celestial body (sun/moon) */}
        <div className="tt-celestial">
          {/* Moon craters (visible in dark) */}
          <div className="tt-craters">
            <span className="tt-crater" style={{ top: '25%', left: '55%', width: '6px', height: '6px' }} />
            <span className="tt-crater" style={{ top: '50%', left: '35%', width: '4px', height: '4px' }} />
            <span className="tt-crater" style={{ top: '65%', left: '60%', width: '3px', height: '3px' }} />
          </div>

          {/* Sun rays (visible in light) */}
          <div className="tt-rays">
            {Array.from({ length: 8 }, (_, i) => (
              <span
                key={i}
                className="tt-ray"
                style={{ transform: `rotate(${i * 45}deg)` }}
              />
            ))}
          </div>
        </div>
      </div>
    </button>
  );
};

export default ThemeToggle;
