import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { Icon, ThemeToggle } from '../ui'
import { useRole } from '../../lib/role'

const NAV_BY_ROLE = {
  executive: [
    { to: '/app/executive', end: true, icon: 'dashboard', label: 'Command Center' },
    { to: '/app/optimizer', icon: 'bar_chart', label: 'Optimizer' },
    { to: '/app/ask', icon: 'chat', label: 'Ask Riskyn' },
    { to: '/app/settings', icon: 'settings', label: 'Settings' },
  ],
  secops: [
    { to: '/app/technical', end: true, icon: 'bug_report', label: 'Audit Portal' },
    { to: '/app/remediation', icon: 'checklist', label: 'Remediation' },
    { to: '/app/simulator', icon: 'science', label: 'Simulator' },
    { to: '/app/compliance', icon: 'fact_check', label: 'Compliance' },
    { to: '/app/telemetry', icon: 'cloud_upload', label: 'Telemetry' },
    { to: '/app/processes', icon: 'account_tree', label: 'Processes' },
    { to: '/app/settings', icon: 'settings', label: 'Settings' },
  ],
}

const ROLE_LABEL = { executive: 'Leadership', secops: 'Security team' }

const initials = (name) =>
  (name || '?')
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('') || '?'

function ProfileMenu() {
  const { user, role, signOut } = useRole()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false)
    }
    const onKeyDown = (event) => event.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="grid h-7 w-7 place-items-center rounded-full border border-outline bg-surface-high font-mono text-[10px] transition-colors hover:border-accent"
      >
        {initials(user?.displayName || user?.username)}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-9 z-30 w-56 overflow-hidden rounded-md border border-outline-variant bg-surface-container shadow-panel"
          style={{ animation: 'rk-in .16s ease' }}
        >
          <div className="border-b border-outline-variant px-3.5 py-3">
            <p className="truncate text-[13px] font-medium">
              {user?.displayName || user?.username || 'Signed out'}
            </p>
            <p className="mt-0.5 text-[11.5px] text-on-variant">{ROLE_LABEL[role] ?? '—'}</p>
          </div>
          <Link
            to="/app/settings"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] transition-colors hover:bg-surface-high"
          >
            <Icon name="settings" style={{ fontSize: 17 }} />
            Settings
          </Link>
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false)
              signOut()
              navigate('/login', { replace: true })
            }}
            className="flex w-full items-center gap-2.5 border-t border-outline-variant px-3.5 py-2.5 text-left text-[13px] text-status-critical transition-colors hover:bg-status-critical/5"
          >
            <Icon name="logout" style={{ fontSize: 17 }} />
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}

export default function AppLayout({ title, subtitle, actions, footer, children }) {
  const { role } = useRole()
  const nav = NAV_BY_ROLE[role] || []
  const [mobileNav, setMobileNav] = useState(false)

  const navLinks = (onNavigate) =>
    nav.map((item) => (
      <NavLink
        key={item.to}
        to={item.to}
        end={item.end}
        onClick={onNavigate}
        className={({ isActive }) =>
          `flex items-center gap-2.5 rounded-xs px-2.5 py-2 text-sm transition-colors ${
            isActive
              ? 'bg-surface-high text-on-surface shadow-[inset_2px_0_0_var(--palette-blue-600)]'
              : 'text-on-variant hover:bg-surface-high hover:text-on-surface'
          }`
        }
      >
        <Icon name={item.icon} style={{ fontSize: 18 }} />
        {item.label}
      </NavLink>
    ))

  return (
    <div className="flex h-full w-full overflow-hidden bg-surface">
      <aside className="hidden w-56 flex-none flex-col border-r border-outline-variant bg-surface-container md:flex">
        <div
          className="flex flex-none items-center border-b border-outline-variant px-4"
          style={{ height: 52 }}
        >
          <Link to="/" className="inline-flex items-center gap-1.5 text-[17px] font-medium">
            <Icon name="shield" className="text-accent" style={{ fontSize: 19 }} />
            Riskyn
          </Link>
        </div>

        {role && (
          <p className="px-4 pb-1.5 pt-2.5 font-mono text-[10px] tracking-widest text-on-variant">
            {ROLE_LABEL[role] ?? role}
          </p>
        )}

        <nav className="flex-1 space-y-px overflow-y-auto px-2 py-1">{navLinks()}</nav>

        <div className="flex-none border-t border-outline-variant px-4 py-2.5 text-xs leading-relaxed text-on-variant">
          {footer}
        </div>
      </aside>

      {/* Mobile drawer — the sidebar is hidden below md, so navigation still
          has to be reachable at a phone width. */}
      {mobileNav && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/45" onClick={() => setMobileNav(false)} />
          <nav
            className="absolute bottom-0 left-0 top-0 flex w-60 max-w-[82%] flex-col gap-px border-r border-outline-variant bg-surface-container p-2"
            style={{ animation: 'rk-in .18s ease' }}
          >
            <div className="flex items-center justify-between px-2.5 py-2.5">
              <span className="inline-flex items-center gap-1.5 text-[16px] font-medium">
                <Icon name="shield" className="text-accent" style={{ fontSize: 18 }} />
                Riskyn
              </span>
              <button onClick={() => setMobileNav(false)} aria-label="Close navigation">
                <Icon name="close" style={{ fontSize: 20 }} />
              </button>
            </div>
            {navLinks(() => setMobileNav(false))}
          </nav>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className="flex flex-none items-center justify-between gap-3 border-b border-outline-variant bg-surface-container px-3 sm:px-5"
          style={{ height: 52 }}
        >
          <div className="flex min-w-0 items-center gap-2">
            <button
              onClick={() => setMobileNav(true)}
              aria-label="Open navigation"
              className="grid h-8 w-8 flex-none place-items-center rounded-xs text-on-variant hover:bg-surface-high md:hidden"
            >
              <Icon name="menu" style={{ fontSize: 20 }} />
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-medium">{title}</h1>
              {subtitle && <p className="truncate text-xs text-on-variant">{subtitle}</p>}
            </div>
          </div>
          <div className="flex flex-none items-center gap-1.5 sm:gap-2">
            {actions}
            <ThemeToggle />
            <ProfileMenu />
          </div>
        </header>

        <main className="relative min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">{children}</main>
      </div>
    </div>
  )
}
