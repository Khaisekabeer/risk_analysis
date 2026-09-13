import { createContext, useContext, useEffect, useState, useCallback } from 'react'

const ThemeContext = createContext({ theme: 'light', toggle: () => {} })

const read = () => document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(read)

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark'
      if (next === 'dark') document.documentElement.dataset.theme = 'dark'
      else delete document.documentElement.dataset.theme
      try {
        localStorage.setItem('riskyn-theme', next)
      } catch {
        // storage unavailable (private window) — theme still applies for this session
      }
      return next
    })
  }, [])

  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>
}

export const useTheme = () => useContext(ThemeContext)

const CHART_TOKENS = [
  'chart-1',
  'chart-2',
  'chart-3',
  'chart-grid',
  'chart-axis',
  'chart-hist',
  'chart-inactive',
  'status-critical',
  'status-high',
  'status-medium',
  'status-low',
]

/**
 * Recharts needs literal colour values, so resolve the CSS custom properties
 * whenever the theme flips.
 */
export function useChartColors() {
  const { theme } = useTheme()
  const [colors, setColors] = useState({})

  useEffect(() => {
    const cs = getComputedStyle(document.documentElement)
    const next = {}
    for (const token of CHART_TOKENS) {
      next[token.replace(/-(\w)/g, (_, c) => c.toUpperCase())] = cs
        .getPropertyValue(`--${token}`)
        .trim()
    }
    next.onSurface = cs.getPropertyValue('--theme-surface-on-surface').trim()
    next.onVariant = cs.getPropertyValue('--theme-surface-on-surface-variant').trim()
    next.container = cs.getPropertyValue('--theme-surface-surface-container').trim()
    next.outline = cs.getPropertyValue('--theme-outline').trim()
    setColors(next)
  }, [theme])

  return colors
}
