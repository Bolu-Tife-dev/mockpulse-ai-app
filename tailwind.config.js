/** @type {import('tailwindcss').Config} */

/* Every integer opacity so modifiers like `border-white/12` always resolve. */
const opacity = Object.fromEntries(
  Array.from({ length: 101 }, (_, i) => [i, String(Number((i / 100).toFixed(2)))]),
);

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      opacity,
      colors: {
        night: {
          50: '#f2f6ff',
          100: '#e6edff',
          200: '#c9d8ff',
          300: '#9dbaff',
          400: '#6c94ff',
          500: '#4670ff',
          600: '#2f4ef5',
          700: '#273ce1',
          800: '#2533b6',
          900: '#232f8f',
          950: '#0a0e24',
        },
        pulse: {
          400: '#38f2c6',
          500: '#14d6a8',
          600: '#0da98a',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        glass: '0 8px 32px 0 rgba(10, 14, 36, 0.55)',
        glow: '0 0 0 1px rgba(70, 112, 255, 0.35), 0 8px 32px rgba(70, 112, 255, 0.25)',
      },
      backdropBlur: {
        glass: '18px',
      },
      keyframes: {
        'pulse-ring': {
          '0%': { transform: 'scale(0.85)', opacity: '0.7' },
          '70%': { transform: 'scale(1.35)', opacity: '0' },
          '100%': { transform: 'scale(1.35)', opacity: '0' },
        },
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.25' },
        },
      },
      animation: {
        'pulse-ring': 'pulse-ring 1.8s cubic-bezier(0.66, 0, 0, 1) infinite',
        'fade-in-up': 'fade-in-up 0.35s ease-out both',
        shimmer: 'shimmer 1.6s linear infinite',
        blink: 'blink 1s steps(2, start) infinite',
      },
    },
  },
  plugins: [],
};
