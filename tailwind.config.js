/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        director: {
          darkest: '#08090C',
          dark: '#0E1017',
          panel: '#151822',
          surface: '#1E2230',
          border: '#2A3044',
          borderLight: '#3B4460',
          gold: '#F59E0B',
          amber: '#FBBF24',
          cyan: '#06B6D4',
          neonCyan: '#22D3EE',
          comfyYellow: '#F2FF59',
          danger: '#EF4444',
          success: '#10B981',
        },
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        display: ['Outfit', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      boxShadow: {
        'glow-gold': '0 0 25px -5px rgba(245, 158, 11, 0.3)',
        'glow-cyan': '0 0 25px -5px rgba(6, 182, 212, 0.3)',
        'glow-comfy': '0 0 30px -5px rgba(242, 255, 89, 0.3)',
        'glass-panel': '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
};
