/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cyber: {
          bg: '#070b14',
          card: '#0d1527',
          cardHover: '#14203a',
          cyan: '#00f0ff',
          neonPink: '#ff0055',
          neonGreen: '#00ff88',
          amber: '#ffaa00',
          darkBorder: '#1c2e4f',
          textDim: '#7e92b8',
          textLight: '#e2edff'
        }
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', 'Consolas', 'monospace'],
        display: ['"Rajdhani"', 'Inter', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif']
      },
      animation: {
        'pulse-glow': 'pulse-glow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'scanline': 'scanline 8s linear infinite',
        'glitch': 'glitch 1s infinite'
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { opacity: '1', filter: 'drop-shadow(0 0 15px rgba(0, 240, 255, 0.6))' },
          '50%': { opacity: '0.6', filter: 'drop-shadow(0 0 5px rgba(0, 240, 255, 0.2))' }
        },
        'scanline': {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(1000%)' }
        }
      }
    },
  },
  plugins: [],
}
