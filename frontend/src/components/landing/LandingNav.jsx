import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Icon, ThemeToggle } from '../ui'

// [icon, title, description, destination]. Anchors point at a real section of
// this page; paths open the screen that actually does the thing.
const PRODUCT = [
  ['radar', 'Continuous monitoring', 'Live attack-surface mapping across cloud, code, and identity.', '#features'],
  ['travel_explore', 'Threat intelligence', 'Exploit intelligence filtered to your actual stack.', '#how'],
  ['functions', 'Risk quantification', 'Every finding priced in expected financial loss.', '#features'],
  ['fact_check', 'Compliance mapping', 'ISO 27001, NIST CSF, CIS, RBI, SEBI — audit-ready.', '/app/compliance'],
]

const SOLUTIONS = [
  ['security', 'For security teams', 'One prioritized queue instead of ten dashboards.', '/app/remediation'],
  ['code_blocks', 'For engineering', 'Findings routed to the owning service, with fix guidance.', '/app/technical'],
  ['verified_user', 'For compliance', 'Continuous control evidence, not quarterly screenshots.', '/app/compliance'],
  ['insights', 'For the board', 'Risk expressed in rupees, updated daily.', '/app/executive'],
]

function Dropdown({ label, items, featured, open, onToggle, onHover, onLeave }) {
  return (
    <div className="relative" onMouseEnter={onHover} onMouseLeave={onLeave}>
      <button
        aria-expanded={open}
        aria-haspopup="true"
        onClick={onToggle}
        className={`inline-flex items-center gap-1 rounded-full px-4 py-2 text-base transition-colors ${
          open ? 'bg-surface-high text-on-surface' : 'text-on-variant hover:bg-surface-high hover:text-on-surface'
        }`}
      >
        {label}
        <Icon
          name="keyboard_arrow_down"
          style={{ fontSize: 18, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}
        />
      </button>
      <div
        className={`absolute left-1/2 top-[calc(100%+8px)] flex w-[min(680px,calc(100vw-80px))] justify-between gap-4 rounded-lg border border-outline bg-surface-overlay p-lg shadow-panel backdrop-blur-xl transition-all duration-150 ${
          open
            ? 'visible translate-x-[-50%] translate-y-0 opacity-100'
            : 'invisible translate-x-[-50%] translate-y-2 opacity-0'
        }`}
      >
        <div className="flex flex-1 flex-col gap-1">
          {items.map(([icon, title, desc, to]) => {
            const internal = to.startsWith('/')
            const Cmp = internal ? Link : 'a'
            return (
            <Cmp
              key={title}
              {...(internal ? { to } : { href: to })}
              className="flex items-start gap-4 rounded-sm px-4 py-2 transition-colors hover:bg-surface-high"
            >
              <span className="grid h-9 w-9 flex-none place-items-center rounded-sm bg-surface-high">
                <Icon name={icon} />
              </span>
              <span>
                <span className="block text-sm font-medium">{title}</span>
                <span className="block text-xs text-on-variant">{desc}</span>
              </span>
            </Cmp>
            )
          })}
        </div>
        <div className="hidden w-60 flex-none flex-col gap-2 border-l border-outline-variant pl-lg xl:flex">
          <span className="font-mono text-xs text-on-variant">{featured.label}</span>
          <span className="font-medium">{featured.title}</span>
          <span className="text-xs text-on-variant">{featured.desc}</span>
          {featured.code && (
            <code className="rounded-xs bg-code px-1.5 py-0.5 font-mono text-xs">{featured.code}</code>
          )}
        </div>
      </div>
    </div>
  )
}

export default function LandingNav() {
  const [scrolled, setScrolled] = useState(false)
  const [openDD, setOpenDD] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const hoverTimer = useRef()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setOpenDD(null)
        setMenuOpen(false)
      }
    }
    const onClick = (e) => {
      if (!e.target.closest('[data-dd]')) setOpenDD(null)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('click', onClick)
    return () => {
      window.removeEventListener('scroll', onScroll)
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('click', onClick)
    }
  }, [])

  const hover = (key) => () => {
    if (!window.matchMedia('(hover: hover)').matches) return
    clearTimeout(hoverTimer.current)
    setOpenDD(key)
  }
  const leave = () => {
    if (!window.matchMedia('(hover: hover)').matches) return
    hoverTimer.current = setTimeout(() => setOpenDD(null), 140)
  }

  return (
    <>
      <header
        className={`sticky top-0 z-50 h-13 border-b transition-colors ${
          scrolled
            ? 'border-outline-variant bg-surface-overlay backdrop-blur-xl'
            : 'border-transparent'
        }`}
        style={{ height: 52 }}
      >
        <div className="mx-auto flex h-full max-w-grid items-center gap-2 px-6 md:px-10">
          <a href="#top" className="inline-flex items-center gap-1.5 text-[19px] font-medium tracking-tight">
            <Icon name="shield" className="text-accent" style={{ fontSize: 21 }} />
            Riskyn
          </a>

          <nav className="mx-auto hidden items-center gap-1 lg:flex" aria-label="Primary">
            <div data-dd>
              <Dropdown
                label="Product"
                items={PRODUCT}
                featured={{
                  label: 'DEVELOPERS',
                  title: 'Riskyn API',
                  desc: 'Query risk scores, findings, and trends programmatically.',
                  code: 'GET /risk/simulate/{id}',
                }}
                open={openDD === 'product'}
                onToggle={() => setOpenDD(openDD === 'product' ? null : 'product')}
                onHover={hover('product')}
                onLeave={leave}
              />
            </div>
            <div data-dd>
              <Dropdown
                label="Solutions"
                items={SOLUTIONS}
                featured={{
                  label: 'GUIDE',
                  title: 'From alerts to answers',
                  desc: 'How mature security teams run continuous assessment.',
                }}
                open={openDD === 'solutions'}
                onToggle={() => setOpenDD(openDD === 'solutions' ? null : 'solutions')}
                onHover={hover('solutions')}
                onLeave={leave}
              />
            </div>
            <a
              href="#how"
              className="rounded-full px-4 py-2 text-on-variant transition-colors hover:bg-surface-high hover:text-on-surface"
            >
              How it works
            </a>
          </nav>

          <div className="ml-auto flex min-w-0 items-center gap-1 sm:gap-2">
            <ThemeToggle />
            <Link
              to="/login"
              className="hidden rounded-full px-4 py-2 text-sm text-on-variant transition-colors hover:bg-surface-high hover:text-on-surface lg:inline-flex"
            >
              Sign in
            </Link>
            <Button as={Link} to="/login" size="sm" variant="primary">
              <span className="hidden sm:inline">Open dashboard</span>
              <span className="sm:hidden">Open</span>
            </Button>
            <button
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(!menuOpen)}
              className="inline-flex h-9 w-9 flex-none items-center justify-center rounded-full text-on-variant hover:bg-surface-high lg:hidden"
            >
              <Icon name={menuOpen ? 'close' : 'menu'} />
            </button>
          </div>
        </div>
      </header>

      <div
        className={`fixed inset-x-0 bottom-0 z-40 overflow-y-auto bg-surface-overlay px-6 pb-2xl pt-md backdrop-blur-xl transition-all duration-150 lg:hidden ${
          menuOpen ? 'visible translate-y-0 opacity-100' : 'invisible -translate-y-2 opacity-0'
        }`}
        style={{ top: 52 }}
      >
        <div className="mx-auto max-w-grid">
          <p className="mb-1 mt-lg font-mono text-xs text-on-variant">Product</p>
          {PRODUCT.map(([, title]) => (
            <a
              key={title}
              href="#features"
              onClick={() => setMenuOpen(false)}
              className="block rounded-full px-4 py-3 text-cta text-on-variant hover:bg-surface-high"
            >
              {title}
            </a>
          ))}
          <p className="mb-1 mt-lg font-mono text-xs text-on-variant">Explore</p>
          {[['#how', 'How it works']].map(([href, label]) => (
            <a
              key={href}
              href={href}
              onClick={() => setMenuOpen(false)}
              className="block rounded-full px-4 py-3 text-cta text-on-variant hover:bg-surface-high"
            >
              {label}
            </a>
          ))}
          <div className="mt-xl flex items-center gap-4">
            <Link to="/login" className="px-4 py-2 text-on-variant">
              Sign in
            </Link>
            <Button as={Link} to="/login" size="sm">
              Open dashboard
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
