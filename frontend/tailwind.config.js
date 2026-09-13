/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: 'var(--theme-surface-surface)',
          container: 'var(--theme-surface-surface-container)',
          high: 'var(--theme-surface-surface-container-high)',
          higher: 'var(--theme-surface-surface-container-higher)',
          highest: 'var(--theme-surface-surface-container-highest)',
          inverse: 'var(--theme-surface-inverse-surface)',
          overlay: 'var(--theme-surface-overlay)',
        },
        on: {
          surface: 'var(--theme-surface-on-surface)',
          variant: 'var(--theme-surface-on-surface-variant)',
          inverse: 'var(--theme-surface-inverse-on-surface)',
          tonal: 'var(--theme-surface-on-tonal)',
        },
        outline: {
          DEFAULT: 'var(--theme-outline)',
          variant: 'var(--theme-outline-variant)',
        },
        nav: {
          button: 'var(--theme-nav-button)',
          hover: 'var(--theme-nav-button-hover)',
        },
        accent: 'var(--palette-blue-600)',
        code: 'var(--code-bg)',
        chart: {
          1: 'var(--chart-1)',
          2: 'var(--chart-2)',
          3: 'var(--chart-3)',
          grid: 'var(--chart-grid)',
          axis: 'var(--chart-axis)',
          hist: 'var(--chart-hist)',
          inactive: 'var(--chart-inactive)',
        },
        status: {
          critical: 'var(--status-critical)',
          high: 'var(--status-high)',
          medium: 'var(--status-medium)',
          low: 'var(--status-low)',
        },
      },
      fontFamily: {
        sans: ['"Alliance No1"', '"Google Sans Flex"', 'system-ui', 'sans-serif'],
        display: ['"Alliance No2"', '"Alliance No1"', 'system-ui', 'sans-serif'],
        mono: ['"Google Sans Code"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        xs: ['12.5px', { lineHeight: '15.5px', letterSpacing: '.11px' }],
        sm: ['14.5px', { lineHeight: '21.02px', letterSpacing: '.11px' }],
        base: ['16px', { lineHeight: '1.6' }],
        cta: ['17.5px', { lineHeight: '25.38px', letterSpacing: '.18px' }],
        title: ['22px', { lineHeight: '1.3' }],
      },
      spacing: {
        xs: '4px',
        sm: '8px',
        md: '16px',
        lg: '24px',
        xl: '36px',
        '2xl': '48px',
        '3xl': '60px',
        '4xl': '80px',
        '5xl': '88px',
        '6xl': '120px',
        '7xl': '180px',
      },
      borderRadius: {
        xs: '4px',
        sm: '8px',
        md: '16px',
        lg: '24px',
        xl: '36px',
        '2xl': '48px',
        full: '9999px',
      },
      boxShadow: {
        panel: 'var(--shadow-panel)',
      },
      transitionTimingFunction: {
        'in-quad': 'cubic-bezier(.55,.085,.68,.53)',
      },
      maxWidth: {
        grid: 'calc(1600px + 80px)',
      },
    },
  },
  plugins: [],
}
