/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        base: 'rgb(var(--color-bg-base) / <alpha-value>)',
        surface: 'rgb(var(--color-bg-surface) / <alpha-value>)',
        elevated: 'rgb(var(--color-bg-elevated) / <alpha-value>)',
        hover: 'rgb(var(--color-bg-hover) / <alpha-value>)',
        active: 'rgb(var(--color-bg-active) / <alpha-value>)',
        border: 'var(--color-border)',
        'border-hover': 'var(--color-border-hover)',
        'border-focus': 'rgb(var(--color-border-focus) / <alpha-value>)',
        text: 'rgb(var(--color-text) / <alpha-value>)',
        secondary: 'rgb(var(--color-text-secondary) / <alpha-value>)',
        tertiary: 'rgb(var(--color-text-tertiary) / <alpha-value>)',
        accent: 'rgb(var(--color-accent) / <alpha-value>)',
        'accent-hover': 'rgb(var(--color-accent-hover) / <alpha-value>)',
        'accent-soft': 'var(--color-accent-soft)',
        'accent-muted': 'rgb(var(--color-accent-muted) / <alpha-value>)',
        danger: 'rgb(var(--color-danger) / <alpha-value>)',
        'danger-soft': 'var(--color-danger-soft)',
        success: 'rgb(var(--color-success) / <alpha-value>)',
        'success-soft': 'var(--color-success-soft)',
      },
      borderRadius: {
        none: '0',
        sm: '4px',
        DEFAULT: '6px',
        md: '8px',
        lg: '10px',
        xl: '12px',
        '2xl': '16px',
        full: '9999px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,0.3), 0 4px 16px rgba(0,0,0,0.2)',
        'card-hover': '0 4px 8px rgba(0,0,0,0.3), 0 8px 32px rgba(0,0,0,0.25)',
        glow: '0 0 0 1px rgba(124,58,237,0.08), 0 4px 16px rgba(0,0,0,0.2)',
        modal: '0 8px 64px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      spacing: {
        sidebar: '240px',
        'sidebar-collapsed': '60px',
      },
      transitionDuration: {
        DEFAULT: '150ms',
      },
      animation: {
        shimmer: 'shimmer 1.5s ease-in-out infinite',
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
};
