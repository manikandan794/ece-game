import React from 'react';
import { useTheme } from '../../context/ThemeContext';
import { Sun, Moon } from 'lucide-react';

export default function ThemeToggle({ className = '', compact = false }) {
  const { theme, toggleTheme, isDay } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={`Switch to ${isDay ? 'Night' : 'Day'} Mode`}
      title={`Active: ${isDay ? 'Day Mode' : 'Night Mode'} - Click to switch`}
      className={`group relative inline-flex items-center gap-2 px-3 py-1.5 rounded-xl font-mono text-xs font-bold transition-all duration-200 border select-none ${
        isDay
          ? 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100 hover:border-amber-400 shadow-sm'
          : 'bg-[#0a1428] text-cyan-300 border-cyan-500/40 hover:bg-[#122244] hover:border-cyan-400 hover:text-white shadow-md shadow-cyan-950/40'
      } ${className}`}
    >
      <div className="relative flex items-center justify-center">
        {isDay ? (
          <Sun className="w-4 h-4 text-amber-500 animate-spin-slow transition-transform group-hover:rotate-45" />
        ) : (
          <Moon className="w-4 h-4 text-cyan-400 transition-transform group-hover:-rotate-12" />
        )}
      </div>

      {!compact && (
        <span className="tracking-wider">
          {isDay ? '☀ DAY' : '🌙 NIGHT'}
        </span>
      )}
    </button>
  );
}
