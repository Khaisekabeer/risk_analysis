import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import LandingNav from '../components/landing/LandingNav'
import HeroCanvas from '../components/landing/HeroCanvas'
import Sparkline from '../components/landing/Sparkline'
import { Button, Card, Chip, Eyebrow, Icon } from '../components/ui'
import { formatINR } from '../lib/formatINR'
import { useTheme } from '../lib/theme'
import { endpoints } from '../lib/apiClient'
import { useApi } from '../lib/useApi'
import * as fallback from '../lib/fallbacks'

/**
 * The landing page quotes the same figures the dashboard does, so it reads
 * them from the live engine and falls back to the saved aggregates when the
 * service is not running — a marketing page must never show a spinner or an
 * error, so there is no loading state here.
 */
function useHeadlineFigures() {
  const kpis = useApi(() => endpoints.kpis().then((r) => ({ ...fallback.kpis, ...r })), [], {
    fallback: fallback.kpis,
  })
  const plan = useApi(() => endpoints.optimizationPlan(), [], { fallback: fallback.plan() })
  const k = kpis.data ?? fallback.kpis
  const p = plan.data ?? fallback.plan()
  return {
    eal: k.enterprise_eal_inr,
    var95: k.enterprise_var_95_inr,
    assets: k.portfolio.assets,
    scenarios: k.scenario_count,
    exposed: k.portfolio.internetExposed,
    budget: p.budget_inr,
    residual: p.residual_eal_inr,
  }
}

function Reveal({ children, delay = 0, className = '' }) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVisible(true)
      return
    }
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          obs.unobserve(entry.target)
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-in-quad ${
        visible ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'
      } ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  )
}

const ArrowLink = ({ to, href, children }) => {
  const Cmp = to ? Link : 'a'
  return (
    <Cmp
      to={to}
      href={href}
      className="group inline-flex items-center font-medium text-accent hover:underline hover:underline-offset-4"
    >
      {children}
      <Icon
        name="keyboard_arrow_right"
        className="transition-transform group-hover:translate-x-1"
        style={{ fontSize: 20 }}
      />
    </Cmp>
  )
}

const CodeBlock = ({ children }) => (
  <pre className="overflow-x-auto rounded-sm border border-outline-variant bg-code px-lg py-md font-mono text-[13px] leading-[1.75]">
    <code>{children}</code>
  </pre>
)

export default function Landing() {
  const [risk, setRisk] = useState({ value: 24.6, delta: 0 })
  const onValue = useCallback((value, delta) => setRisk({ value, delta }), [])
  const { theme } = useTheme()
  const figures = useHeadlineFigures()

  return (
    <div id="top">
      <LandingNav />

      <main>
        {/* ---------------- HERO ---------------- */}
        <section className="relative flex min-h-[min(880px,calc(100svh-52px))] items-center overflow-hidden pb-5xl pt-6xl">
          <HeroCanvas />
          <div className="relative mx-auto flex w-full max-w-grid flex-col items-center gap-lg px-6 text-center md:px-10">
            <Eyebrow>continuous cyber risk quantification</Eyebrow>
            <h1 className="display-1 max-w-[15ch]">Navigate Cyber Risk with Confidence</h1>
            <p className="max-w-[640px] text-cta text-on-variant">
              Riskyn turns security telemetry into rupees. Map your attack surface, quantify
              exposure as expected annual loss, and fund the controls that actually reduce it —
              built for teams who need clarity, not noise.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <Button as={Link} to="/login" size="lg" variant="primary">
                Open the dashboard
              </Button>
              <ArrowLink href="#how">See how it works</ArrowLink>
            </div>

            <div className="mt-2 flex flex-wrap justify-center gap-xl">
              {[
                [formatINR(figures.eal, { compact: true }), 'expected annual loss, current posture'],
                [figures.assets.toLocaleString('en-IN'), 'assets under continuous assessment'],
                [figures.scenarios.toLocaleString('en-IN'), 'risk scenarios modelled'],
              ].map(([num, label], i) => (
                <div
                  key={label}
                  className={`text-left ${i > 0 ? 'border-l border-outline pl-xl' : ''}`}
                >
                  <span className="block font-mono text-[22px] font-medium">{num}</span>
                  <span className="mt-1 block text-xs text-on-variant">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------- FEATURES ---------------- */}
        <section id="features" className="scroll-mt-20 py-5xl">
          <div className="mx-auto max-w-grid px-6 md:px-10">
            <Reveal className="mb-3xl max-w-[780px]">
              <Eyebrow>platform</Eyebrow>
              <h2 className="display-2 mt-2">Clarity for Every Layer of Your Attack Surface</h2>
              <p className="mt-md max-w-[60ch] text-on-variant">
                Riskyn continuously maps your attack surface, prices the exposure, and ranks
                remediation by the loss it actually avoids.
              </p>
            </Reveal>

            <div className="grid grid-cols-4 gap-4 lg:grid-cols-8 xl:grid-cols-12">
              <Reveal className="col-span-4 lg:col-span-8 xl:col-span-7">
                <Card className="flex h-full flex-col p-lg">
                  <div className="mb-md flex items-center gap-4">
                    <span className="grid h-10 w-10 flex-none place-items-center rounded-sm bg-surface-high">
                      <Icon name="radar" style={{ fontSize: 22 }} />
                    </span>
                    <h3 className="text-title font-medium">Continuous monitoring</h3>
                  </div>
                  <p className="text-on-variant">
                    Live attack-surface mapping across cloud, endpoints, and identity. Riskyn
                    rescoring runs as the environment changes — not once a quarter.
                  </p>
                  <div className="mt-auto pt-lg">
                    <div className="flex flex-wrap items-baseline justify-between gap-4">
                      <div>
                        <span className="mr-2 font-mono text-xs text-on-variant">risk_score</span>
                        <span className="font-mono text-[28px] font-medium">
                          {risk.value.toFixed(1)}
                        </span>
                      </div>
                      <span className="font-mono text-xs text-accent">
                        Δ {risk.delta >= 0 ? '+' : ''}
                        {risk.delta.toFixed(1)} / 7d
                      </span>
                    </div>
                    <Sparkline onValue={onValue} />
                    <div className="mt-md flex flex-wrap gap-x-lg gap-y-md border-t border-outline-variant pt-md font-mono text-xs text-on-variant">
                      <span>sources: 6 vendor APIs</span>
                      <span>assets: {figures.assets.toLocaleString('en-IN')}</span>
                      <span>exposed: {figures.exposed.toLocaleString('en-IN')}</span>
                    </div>
                  </div>
                </Card>
              </Reveal>

              <Reveal delay={60} className="col-span-4 xl:col-span-5">
                <Card className="flex h-full flex-col p-lg">
                  <div className="mb-md flex items-center gap-4">
                    <span className="grid h-10 w-10 flex-none place-items-center rounded-sm bg-surface-high">
                      <Icon name="functions" style={{ fontSize: 22 }} />
                    </span>
                    <h3 className="text-title font-medium">Risk quantification</h3>
                  </div>
                  <p className="text-on-variant">
                    Every risk expressed in rupees. Board-ready reporting with expected-loss
                    modelling, updated continuously.
                  </p>
                  <div className="mt-auto pt-lg">
                    <span className="block font-mono text-4xl font-medium">
                      {formatINR(figures.eal, { compact: true })}
                    </span>
                    <span className="block text-xs text-on-variant">
                      expected annual loss at current posture
                    </span>
                    <span className="mt-md block border-t border-outline-variant pt-md font-mono text-sm text-accent">
                      → {formatINR(figures.residual, { compact: true })} after funding the
                      optimizer's picks
                    </span>
                  </div>
                </Card>
              </Reveal>

              <Reveal delay={120} className="col-span-4 xl:col-span-5">
                <Card className="flex h-full flex-col p-lg">
                  <div className="mb-md flex items-center gap-4">
                    <span className="grid h-10 w-10 flex-none place-items-center rounded-sm bg-surface-high">
                      <Icon name="travel_explore" style={{ fontSize: 22 }} />
                    </span>
                    <h3 className="text-title font-medium">Threat intelligence</h3>
                  </div>
                  <p className="text-on-variant">
                    CVE and CVSS data resolved against an attack graph of your own stack, so effort
                    and impact are computed from real exploit paths — not a generic severity label.
                  </p>
                </Card>
              </Reveal>

              <Reveal delay={180} className="col-span-4 lg:col-span-8 xl:col-span-7">
                <Card className="flex h-full flex-col p-lg">
                  <div className="mb-md flex items-center gap-4">
                    <span className="grid h-10 w-10 flex-none place-items-center rounded-sm bg-surface-high">
                      <Icon name="fact_check" style={{ fontSize: 22 }} />
                    </span>
                    <h3 className="text-title font-medium">Compliance mapping</h3>
                  </div>
                  <p className="text-on-variant">
                    Controls mapped to live findings across every framework that matters in India
                    and abroad. Audit-ready evidence on demand — not a quarterly fire drill.
                  </p>
                  <div className="mt-auto flex flex-wrap gap-2 pt-lg">
                    {['ISO 27001', 'NIST CSF', 'CIS Controls', 'RBI CSF', 'SEBI CSCRF'].map((c) => (
                      <Chip key={c}>{c}</Chip>
                    ))}
                  </div>
                </Card>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ---------------- HOW IT WORKS ---------------- */}
        <section id="how" className="scroll-mt-20 py-5xl">
          <div className="mx-auto grid max-w-grid gap-2xl px-6 md:px-10 lg:grid-cols-[5fr_7fr] lg:gap-4xl">
            <Reveal className="min-w-0 lg:sticky lg:top-28 lg:self-start">
              <Eyebrow>how it works</Eyebrow>
              <h2 className="display-2 mt-2">From Scattered Telemetry to Priced Fixes</h2>
              <p className="mt-md max-w-[42ch] text-on-variant">
                Six vendor feeds unify into one schema. A trained model and real actuarial loss
                data turn that into rupees. A knapsack solver decides what to fund.
              </p>
              <div className="mt-lg">
                <ArrowLink to="/login">Open the dashboard</ArrowLink>
              </div>
            </Reveal>

            <div className="min-w-0">
              {[
                [
                  '01',
                  'Unify six telemetry sources',
                  'ServiceNow CMDB, Qualys vulnerability scans, Splunk SIEM anomalies, CrowdStrike EDR status, Okta MFA enrollment, and AWS Security Hub findings normalize into one asset-centric schema — no per-vendor dashboards to reconcile.',
                  `$ python telemetry_ingestion_connector.py --mock
[Ingestion] servicenow · qualys · splunk
[Ingestion] crowdstrike · okta · aws_sec_hub
[Load] → unified schema → risk engine`,
                ],
                [
                  '02',
                  'Score against real loss data',
                  'An XGBoost model predicts incident probability per asset; impact is priced from actuarial benchmarks — cost per stolen record, regulatory fine tiers, downtime hours — not a guessed multiplier. A 2,000-iteration Monte Carlo turns that into EAL and VaR.',
                  `$ python risk_engine.py
{
  "eal": ${Math.round(figures.eal)},   // ${formatINR(figures.eal, { compact: true })}
  "var_95": ${Math.round(figures.var95)},  // ${formatINR(figures.var95, { compact: true })}
  "scenarios": ${figures.scenarios}
}`,
                ],
                [
                  '03',
                  'Fund what reduces loss',
                  'A 0/1 knapsack picks the control set that maximises risk reduction under your budget, with each control mapped to the framework clauses it satisfies.',
                  `$ python investment_optimizer.py --budget ${Math.round(figures.budget)}
✓ funded → ${formatINR(figures.eal - figures.residual, { compact: true })} reduction`,
                ],
              ].map(([num, title, body, code], i) => (
                <Reveal key={num} delay={i * 60}>
                  <div className="border-t border-outline-variant py-xl">
                    <div className="mb-md flex items-baseline gap-4">
                      <span className="font-mono text-xs text-accent">{num}</span>
                      <h3 className="text-title font-medium">{title}</h3>
                    </div>
                    <p className="mb-md max-w-[58ch] text-on-variant">{body}</p>
                    <CodeBlock>{code}</CodeBlock>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------- GET STARTED ---------------- */}
        <section id="cta" className="py-5xl">
          <div className="mx-auto max-w-grid px-6 md:px-10">
            <Reveal>
              <div className="relative flex flex-col items-center gap-4 overflow-hidden rounded-2xl bg-surface-inverse px-lg py-6xl text-center text-on-inverse">
                <HeroCanvas dark={theme !== 'dark'} />
                <div className="relative flex flex-col items-center gap-4">
                  <p className="eyebrow opacity-70" style={{ color: 'inherit' }}>
                    get started
                  </p>
                  <h2 className="display-2">Start Your Free Risk Assessment</h2>
                  <p className="max-w-[46ch] opacity-75">
                    Full attack-surface scan across six connected sources. Quantified results in
                    rupees, grounded in real actuarial loss data.
                  </p>
                  <Button as={Link} to="/login" size="lg" variant="blue" className="mt-md">
                    Open the dashboard
                  </Button>
                </div>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      {/* ---------------- FOOTER ---------------- */}
      <footer className="border-t border-outline-variant py-4xl">
        <div className="mx-auto max-w-grid px-6 md:px-10">
          <div className="grid grid-cols-2 gap-2xl lg:grid-cols-[4fr_2fr_2fr]">
            <div>
              <a href="#top" className="inline-flex items-center gap-1.5 text-[19px] font-medium">
                <Icon name="shield" className="text-accent" style={{ fontSize: 21 }} />
                Riskyn
              </a>
              <p className="mt-md max-w-[30ch] text-sm text-on-variant">
                Continuous, quantified cyber risk assessment for the modern enterprise.
              </p>
            </div>
            <nav aria-label="Product">
              <h3 className="mb-md font-mono text-xs uppercase text-on-variant">Product</h3>
              <ul className="space-y-2">
                {[
                  ['Continuous monitoring', '#features'],
                  ['Risk quantification', '#features'],
                  ['Compliance mapping', '#features'],
                  ['How it works', '#how'],
                ].map(([l, href]) => (
                  <li key={l}>
                    <a href={href} className="text-sm text-on-variant transition-colors hover:text-on-surface">
                      {l}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
            <nav aria-label="Account">
              <h3 className="mb-md font-mono text-xs uppercase text-on-variant">Account</h3>
              <ul className="space-y-2">
                <li>
                  <Link to="/login" className="text-sm text-on-variant transition-colors hover:text-on-surface">
                    Sign in
                  </Link>
                </li>
                <li>
                  <Link to="/signup" className="text-sm text-on-variant transition-colors hover:text-on-surface">
                    Create account
                  </Link>
                </li>
              </ul>
            </nav>
          </div>
          <div className="mt-3xl flex flex-wrap items-center justify-between gap-4 border-t border-outline-variant pt-lg font-mono text-xs text-on-variant">
            <span>© {new Date().getFullYear()} Riskyn · SIH PS 26105</span>
            <span className="inline-flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-accent" />
              All systems operational
            </span>
          </div>
        </div>
      </footer>
    </div>
  )
}
