import React, { useEffect, useState } from 'react';
import { useTheme } from '../../context/ThemeContext';
import './LightModeDecorations.css';

/**
 * LightModeDecorations — A purely decorative layer that renders
 * cartoon-style floating elements ONLY in light mode.
 * Renders nothing in dark mode. Zero impact on dark theme.
 */

/* ── Inline SVG cartoon illustrations ─────────────────────────────────── */

const KawaiiCloud = ({ style, className = '' }) => (
  <svg viewBox="0 0 120 60" className={`lmd-cloud ${className}`} style={style}>
    <ellipse cx="60" cy="38" rx="50" ry="20" fill="rgba(199,210,254,0.35)" />
    <ellipse cx="40" cy="28" rx="22" ry="18" fill="rgba(199,210,254,0.40)" />
    <ellipse cx="75" cy="30" rx="18" ry="15" fill="rgba(199,210,254,0.38)" />
    <ellipse cx="55" cy="22" rx="25" ry="18" fill="rgba(199,210,254,0.42)" />
    {/* tiny kawaii face */}
    <circle cx="52" cy="34" r="1.5" fill="rgba(99,102,241,0.3)" />
    <circle cx="62" cy="34" r="1.5" fill="rgba(99,102,241,0.3)" />
    <path d="M54 38 Q57 41 60 38" stroke="rgba(99,102,241,0.25)" strokeWidth="1" fill="none" strokeLinecap="round" />
  </svg>
);

const FloatingStar = ({ style, className = '' }) => (
  <svg viewBox="0 0 24 24" className={`lmd-star ${className}`} style={style}>
    <path d="M12 2l2.4 7.2H22l-6 4.8 2.4 7.2L12 16.4 5.6 21.2 8 14 2 9.2h7.6z" 
          fill="rgba(251,191,36,0.25)" stroke="rgba(251,191,36,0.35)" strokeWidth="0.5" />
  </svg>
);

const FloatingHeart = ({ style, className = '' }) => (
  <svg viewBox="0 0 24 24" className={`lmd-heart ${className}`} style={style}>
    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" 
          fill="rgba(236,72,153,0.18)" stroke="rgba(236,72,153,0.25)" strokeWidth="0.5" />
  </svg>
);

const TinySparkle = ({ style }) => (
  <svg viewBox="0 0 16 16" className="lmd-sparkle" style={style}>
    <path d="M8 0 L9.5 6.5 L16 8 L9.5 9.5 L8 16 L6.5 9.5 L0 8 L6.5 6.5 Z" 
          fill="rgba(99,102,241,0.2)" />
  </svg>
);

/* ── Mascot Robot (pure SVG) ─────────────────────────────────────────── */
const CartoonMascot = () => (
  <div className="lmd-mascot-wrapper">
    <svg viewBox="0 0 80 100" className="lmd-mascot">
      {/* Antenna */}
      <line x1="40" y1="8" x2="40" y2="20" stroke="#a5b4fc" strokeWidth="2" strokeLinecap="round" />
      <circle cx="40" cy="6" r="4" fill="#818cf8" className="lmd-mascot-antenna" />
      {/* Head */}
      <rect x="18" y="20" width="44" height="35" rx="12" fill="#e0e7ff" stroke="#a5b4fc" strokeWidth="1.5" />
      {/* Eyes */}
      <circle cx="32" cy="35" r="4" fill="#6366f1" />
      <circle cx="48" cy="35" r="4" fill="#6366f1" />
      <circle cx="33" cy="34" r="1.5" fill="white" />
      <circle cx="49" cy="34" r="1.5" fill="white" />
      {/* Smile */}
      <path d="M33 43 Q40 49 47 43" stroke="#6366f1" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      {/* Blush */}
      <ellipse cx="26" cy="42" rx="4" ry="2.5" fill="rgba(236,72,153,0.15)" />
      <ellipse cx="54" cy="42" rx="4" ry="2.5" fill="rgba(236,72,153,0.15)" />
      {/* Body */}
      <rect x="22" y="58" width="36" height="25" rx="10" fill="#e0e7ff" stroke="#a5b4fc" strokeWidth="1.5" />
      {/* Tiny chart on body */}
      <rect x="30" y="64" width="4" height="10" rx="1" fill="#818cf8" opacity="0.6" />
      <rect x="36" y="67" width="4" height="7" rx="1" fill="#a78bfa" opacity="0.6" />
      <rect x="42" y="62" width="4" height="12" rx="1" fill="#6366f1" opacity="0.6" />
      {/* Arms */}
      <ellipse cx="16" cy="68" rx="5" ry="8" fill="#c7d2fe" stroke="#a5b4fc" strokeWidth="1" />
      <ellipse cx="64" cy="68" rx="5" ry="8" fill="#c7d2fe" stroke="#a5b4fc" strokeWidth="1" />
      {/* Feet */}
      <ellipse cx="32" cy="88" rx="8" ry="5" fill="#c7d2fe" stroke="#a5b4fc" strokeWidth="1" />
      <ellipse cx="48" cy="88" rx="8" ry="5" fill="#c7d2fe" stroke="#a5b4fc" strokeWidth="1" />
    </svg>
    <div className="lmd-mascot-speech">
      <span>Hello! 👋</span>
    </div>
  </div>
);

const LightModeDecorations = () => {
  const { isDark } = useTheme();
  const [showMascot, setShowMascot] = useState(false);

  // Show mascot greeting briefly on theme switch
  useEffect(() => {
    if (!isDark) {
      setShowMascot(true);
      const t = setTimeout(() => setShowMascot(false), 4000);
      return () => clearTimeout(t);
    } else {
      setShowMascot(false);
    }
  }, [isDark]);

  // Render nothing in dark mode
  if (isDark) return null;

  return (
    <div className="lmd-container" aria-hidden="true">
      {/* Floating clouds */}
      <KawaiiCloud style={{ width: 120, top: '12%', left: '5%' }} className="lmd-float-1" />
      <KawaiiCloud style={{ width: 90, top: '8%', right: '10%' }} className="lmd-float-2" />
      <KawaiiCloud style={{ width: 70, bottom: '15%', left: '15%' }} className="lmd-float-3" />

      {/* Floating stars */}
      <FloatingStar style={{ width: 20, top: '20%', right: '20%' }} className="lmd-twinkle-1" />
      <FloatingStar style={{ width: 14, top: '45%', left: '8%' }} className="lmd-twinkle-2" />
      <FloatingStar style={{ width: 18, bottom: '25%', right: '8%' }} className="lmd-twinkle-3" />

      {/* Floating hearts */}
      <FloatingHeart style={{ width: 16, top: '35%', right: '5%' }} className="lmd-drift-1" />
      <FloatingHeart style={{ width: 12, bottom: '30%', left: '3%' }} className="lmd-drift-2" />

      {/* Sparkles */}
      <TinySparkle style={{ width: 12, top: '18%', left: '30%' }} />
      <TinySparkle style={{ width: 10, top: '50%', right: '15%' }} />
      <TinySparkle style={{ width: 14, bottom: '20%', right: '25%' }} />

      {/* Mascot — bottom-left, appears on light mode activation */}
      {showMascot && <CartoonMascot />}
    </div>
  );
};

export default LightModeDecorations;
