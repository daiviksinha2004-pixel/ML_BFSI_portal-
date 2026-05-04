import React, { useState, useRef, useEffect } from 'react';
import { Calendar, X, Sparkles, ChevronDown } from 'lucide-react';
import './FuturisticDateFilter.css';

/**
 * FuturisticDateFilter — A visually stunning, animated date range filter
 * with holographic/glassmorphic futuristic aesthetics.
 *
 * Props (unchanged from legacy DateRangePicker):
 *   selectedDate : string   — current value in YYYY-MM format
 *   onSelect     : function — called with the new YYYY-MM string (or '' to clear)
 *   label        : string   — optional label (defaults to "Period")
 */
const FuturisticDateFilter = ({ selectedDate, onSelect, label = 'Period' }) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [ripple, setRipple] = useState(false);
  const [clearAnim, setClearAnim] = useState(false);
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  // Sparkle particles
  const [particles, setParticles] = useState([]);

  useEffect(() => {
    if (selectedDate) {
      // Spawn particles on value change
      const newParticles = Array.from({ length: 6 }, (_, i) => ({
        id: Date.now() + i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: Math.random() * 3 + 1,
        duration: Math.random() * 0.8 + 0.6,
        delay: Math.random() * 0.3,
      }));
      setParticles(newParticles);
      setRipple(true);
      const timeout = setTimeout(() => {
        setParticles([]);
        setRipple(false);
      }, 1400);
      return () => clearTimeout(timeout);
    }
  }, [selectedDate]);

  const handleClear = () => {
    setClearAnim(true);
    setTimeout(() => {
      onSelect('');
      setClearAnim(false);
    }, 300);
  };

  const isActive = isFocused || isHovered;

  // Format the display label
  const displayLabel = selectedDate
    ? new Date(selectedDate + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : null;

  return (
    <div
      ref={containerRef}
      className="futuristic-date-filter-wrapper"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Ambient glow layer */}
      <div className={`fdf-ambient-glow ${isActive ? 'fdf-glow-active' : ''} ${selectedDate ? 'fdf-glow-selected' : ''}`} />

      {/* Scan line animation */}
      <div className={`fdf-scanline ${isActive ? 'fdf-scanline-active' : ''}`} />

      {/* Main container */}
      <div className={`fdf-container ${isActive ? 'fdf-container-active' : ''} ${selectedDate ? 'fdf-container-selected' : ''}`}>

        {/* Left icon cluster */}
        <div className="fdf-icon-cluster">
          <div className={`fdf-icon-ring ${isActive ? 'fdf-icon-ring-active' : ''}`}>
            <Calendar size={14} className="fdf-calendar-icon" />
            <div className="fdf-icon-pulse" />
          </div>
        </div>

        {/* Label */}
        <div className="fdf-label-section">
          <span className="fdf-label">{label}</span>
          {displayLabel && (
            <span className={`fdf-selected-badge ${clearAnim ? 'fdf-badge-exit' : 'fdf-badge-enter'}`}>
              <Sparkles size={9} className="fdf-sparkle-icon" />
              {displayLabel}
            </span>
          )}
        </div>

        {/* Hexagonal separator */}
        <div className="fdf-hex-separator">
          <svg width="12" height="14" viewBox="0 0 12 14" fill="none">
            <path d="M6 0L12 3.5V10.5L6 14L0 10.5V3.5L6 0Z" className="fdf-hex-path" />
          </svg>
        </div>

        {/* Date input area */}
        <div className="fdf-input-wrapper">
          <input
            ref={inputRef}
            type="month"
            value={selectedDate}
            onChange={(e) => onSelect(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            className="fdf-date-input"
          />
          <ChevronDown size={12} className={`fdf-chevron ${isActive ? 'fdf-chevron-active' : ''}`} />
        </div>

        {/* Clear button */}
        {selectedDate && (
          <button
            onClick={handleClear}
            className={`fdf-clear-btn ${clearAnim ? 'fdf-clear-exit' : 'fdf-clear-enter'}`}
            title="Clear date filter"
          >
            <X size={12} strokeWidth={3} />
            <span className="fdf-clear-text">Clear</span>
          </button>
        )}

        {/* Ripple effect on change */}
        {ripple && <div className="fdf-ripple" />}

        {/* Sparkle particles */}
        {particles.map((p) => (
          <div
            key={p.id}
            className="fdf-particle"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: `${p.size}px`,
              height: `${p.size}px`,
              animationDuration: `${p.duration}s`,
              animationDelay: `${p.delay}s`,
            }}
          />
        ))}
      </div>

      {/* Bottom edge glow */}
      <div className={`fdf-edge-glow ${selectedDate ? 'fdf-edge-glow-active' : ''}`} />
    </div>
  );
};

export default FuturisticDateFilter;
