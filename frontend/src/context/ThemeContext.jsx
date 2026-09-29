import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    try {
      const saved = localStorage.getItem('glitch_hunt_theme');
      return saved === 'day' ? 'day' : 'night';
    } catch (e) {
      return 'night';
    }
  });

  const applyTheme = (targetTheme) => {
    const root = document.documentElement;
    if (targetTheme === 'day') {
      root.classList.remove('dark', 'theme-night');
      root.classList.add('theme-day');
      root.setAttribute('data-theme', 'day');
    } else {
      root.classList.remove('theme-day');
      root.classList.add('dark', 'theme-night');
      root.setAttribute('data-theme', 'night');
    }
  };

  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem('glitch_hunt_theme', theme);
    } catch (e) {
      console.warn('Unable to persist theme to localStorage:', e);
    }
  }, [theme]);

  const toggleTheme = () => {
    setThemeState(prev => (prev === 'day' ? 'night' : 'day'));
  };

  const setTheme = (newTheme) => {
    if (newTheme === 'day' || newTheme === 'night') {
      setThemeState(newTheme);
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme, isDay: theme === 'day' }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    return {
      theme: 'night',
      toggleTheme: () => {},
      setTheme: () => {},
      isDay: false
    };
  }
  return context;
}
