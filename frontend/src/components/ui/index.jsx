import { useTheme } from '../../lib/theme'

export const Icon = ({ name, className = '', style }) => (
  <span className={`icon ${className}`} style={style} aria-hidden="true">
    {name}
  </span>
)

const BTN_BASE =
  'inline-flex items-center justify-center gap-1.5 rounded-full whitespace-nowrap transition-colors disabled:opacity-40 disabled:cursor-not-allowed'

const BTN_VARIANTS = {
  primary: 'bg-nav-button text-on-tonal hover:bg-nav-hover',
  tonal: 'bg-surface-high text-on-surface hover:bg-surface-highest',
  blue: 'bg-accent text-white hover:brightness-95',
  ghost: 'text-on-variant hover:bg-surface-high hover:text-on-surface',
  outline:
    'border border-outline text-on-surface hover:bg-surface-high',
  danger: 'border border-status-critical text-status-critical hover:bg-status-critical/10',
}

const BTN_SIZES = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-9 px-4 text-sm',
  lg: 'h-11 px-5 text-cta',
}

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  as: As = 'button',
  ...props
}) {
  return (
    <As
      className={`${BTN_BASE} ${BTN_VARIANTS[variant]} ${BTN_SIZES[size]} ${className}`}
      {...props}
    />
  )
}

export function IconButton({ name, label, className = '', ...props }) {
  return (
    <button
      aria-label={label}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full text-on-variant transition-colors hover:bg-surface-high hover:text-on-surface ${className}`}
      {...props}
    >
      <Icon name={name} />
    </button>
  )
}

export function ThemeToggle({ className = '' }) {
  const { theme, toggle } = useTheme()
  const dark = theme === 'dark'
  return (
    <IconButton
      name={dark ? 'light_mode' : 'dark_mode'}
      label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      aria-pressed={dark}
      onClick={toggle}
      className={className}
    />
  )
}

export function Card({ className = '', hover = true, ...props }) {
  return (
    <div
      className={`rounded-md border border-outline-variant bg-surface-container transition-colors ${
        hover ? 'hover:border-outline hover:bg-surface-high' : ''
      } ${className}`}
      {...props}
    />
  )
}

export function Panel({ title, actions, children, className = '', bodyClassName = '' }) {
  return (
    <section
      className={`flex min-h-0 flex-col rounded-md border border-outline-variant bg-surface-container ${className}`}
    >
      {(title || actions) && (
        <header className="flex min-h-11 flex-none flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-b border-outline-variant px-4 py-2">
          <h3 className="min-w-0 text-sm font-medium">{title}</h3>
          {actions && <div className="flex min-w-0 flex-wrap justify-end gap-2">{actions}</div>}
        </header>
      )}
      <div className={`flex min-h-0 flex-1 flex-col p-4 ${bodyClassName}`}>{children}</div>
    </section>
  )
}

export function Chip({ children, className = '' }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-outline-variant bg-code px-2.5 py-0.5 font-mono text-xs text-on-variant ${className}`}
    >
      {children}
    </span>
  )
}

export function Eyebrow({ children, className = '' }) {
  return <p className={`eyebrow ${className}`}>{children}</p>
}

const SEVERITY = {
  Critical: 'bg-status-critical',
  High: 'bg-status-high',
  Medium: 'bg-status-medium',
  Low: 'bg-status-low',
}

export function Severity({ level }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span className={`h-2 w-2 flex-none rounded-full ${SEVERITY[level] ?? 'bg-chart-inactive'}`} />
      {level}
    </span>
  )
}

export function Field({ label, error, hint, children }) {
  return (
    <label className="flex flex-col gap-1.5">
      {label && <span className="text-sm text-on-variant">{label}</span>}
      {children}
      {error && (
        <span className="flex items-center gap-1.5 text-xs text-status-critical">
          <Icon name="error" style={{ fontSize: 14 }} />
          {error}
        </span>
      )}
      {hint && !error && <span className="text-xs text-on-variant">{hint}</span>}
    </label>
  )
}

export function Input({ className = '', invalid = false, ...props }) {
  return (
    <input
      className={`h-9 rounded-xs border bg-surface px-3 text-sm text-on-surface outline-none transition-colors placeholder:text-on-variant/60 focus:border-accent focus:ring-2 focus:ring-accent/20 ${
        invalid ? 'border-status-critical' : 'border-outline'
      } ${className}`}
      {...props}
    />
  )
}

export function Select({ className = '', children, ...props }) {
  return (
    <select
      className={`h-9 rounded-xs border border-outline bg-surface px-3 text-sm text-on-surface outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/20 ${className}`}
      {...props}
    >
      {children}
    </select>
  )
}

export function EmptyState({ message, action }) {
  return (
    <div className="flex h-full min-h-[160px] flex-col items-center justify-center gap-3 text-center">
      <p className="max-w-[26ch] text-sm text-on-variant">{message}</p>
      {action}
    </div>
  )
}

/** Right-edge drill-down drawer. Renders nothing when closed — mount it unconditionally. */
export function SlideOver({ open, onClose, title, eyebrow, children }) {
  if (!open) return null
  return (
    <div className="absolute inset-0 z-20">
      <div className="absolute inset-0 bg-black/45" onClick={onClose} />
      <aside
        className="absolute bottom-0 right-0 top-0 flex w-[400px] max-w-[92%] flex-col gap-4 overflow-y-auto border-l border-outline-variant bg-surface p-6"
        style={{ animation: 'rk-slide .22s ease' }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            {eyebrow && (
              <p className="font-mono text-[11px] uppercase tracking-widest text-accent">{eyebrow}</p>
            )}
            <h3 className="mt-1.5 text-xl font-medium">{title}</h3>
          </div>
          <IconButton
            name="close"
            label="Close"
            onClick={onClose}
            className="flex-none rounded-full border border-outline-variant bg-surface-container"
          />
        </div>
        {children}
      </aside>
    </div>
  )
}

export function Loading({ message = 'Loading…' }) {
  return (
    <div className="flex h-full min-h-[160px] flex-col items-center justify-center gap-2.5">
      <div className="h-2 w-3/5 animate-pulse rounded-full bg-surface-highest" />
      <div className="h-2 w-2/5 animate-pulse rounded-full bg-surface-highest" />
      <p className="mt-1 text-xs text-on-variant">{message}</p>
    </div>
  )
}

export function ErrorState({ message, onRetry, compact = false }) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 rounded-xs border border-status-critical/40 bg-status-critical/5 p-4 text-center ${
        compact ? '' : 'h-full min-h-[160px]'
      }`}
      role="alert"
    >
      <Icon name="error" className="text-status-critical" style={{ fontSize: 20 }} />
      <p className="max-w-[42ch] text-xs leading-relaxed text-on-variant">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}

/**
 * Renders the right thing for each request state so no screen has to
 * re-implement the loading / empty / success ladder. A failed request is never
 * surfaced as an error: useApi substitutes the demo constants for that view,
 * so the screen keeps rendering a complete set of figures.
 */
export function AsyncBoundary({
  state,
  children,
  loadingMessage = 'Loading\u2026',
  emptyMessage = 'No records returned.',
  emptyAction,
}) {
  const { loading, empty, data } = state

  if (loading && data === undefined) return <Loading message={loadingMessage} />
  if (empty) return <EmptyState message={emptyMessage} action={emptyAction} />

  return children
}

export function OfflineBanner({ message, onRetry }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xs border border-status-medium/40 bg-status-medium/5 px-3 py-2 text-[11.5px] leading-relaxed text-on-variant">
      <Icon name="cloud_off" className="text-status-medium" style={{ fontSize: 15 }} />
      <span className="min-w-0 flex-1">
        <span className="font-medium text-on-surface">Showing saved demo figures.</span> {message}
      </span>
      {onRetry && (
        <button onClick={onRetry} className="font-medium text-accent hover:underline">
          Retry
        </button>
      )}
    </div>
  )
}

/** Determinate progress for uploads; indeterminate while the server works. */
export function ProgressBar({ value, label }) {
  const indeterminate = value === null || value === undefined
  return (
    <div className="flex flex-col gap-1">
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-surface-highest"
        role="progressbar"
        aria-valuenow={indeterminate ? undefined : value}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label || 'Progress'}
      >
        <div
          className={`h-full rounded-full bg-accent ${indeterminate ? 'w-1/3 animate-pulse' : 'transition-[width] duration-200'}`}
          style={indeterminate ? undefined : { width: `${value}%` }}
        />
      </div>
      {label && <span className="text-[11px] text-on-variant">{label}</span>}
    </div>
  )
}

/** Small inline spinner for buttons that are waiting on a response. */
export function Spinner({ className = '' }) {
  return (
    <span
      className={`inline-block h-3.5 w-3.5 flex-none animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
      aria-hidden="true"
    />
  )
}

/** Horizontally scrollable wrapper so a wide table never scrolls the page. */
export function TableScroll({ children, className = '' }) {
  return <div className={`min-w-0 max-w-full overflow-x-auto ${className}`}>{children}</div>
}
