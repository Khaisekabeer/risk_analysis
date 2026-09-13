import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import AppLayout from '../../components/app/AppLayout'
import {
  AsyncBoundary,
  Button,
  Chip,
  Icon,
  Loading,
  Panel,
  SlideOver,
  Spinner,
} from '../../components/ui'
import { MultiRadar } from '../../components/charts'
import { formatINR } from '../../lib/formatINR'
import { endpoints } from '../../lib/apiClient'
import { useApi, useAction } from '../../lib/useApi'
import * as demo from '../../lib/demoData'

// Tailwind's scanner needs literal class strings — no `bg-status-${x}`.
const TONE_BAR = {
  critical: 'bg-status-critical',
  high: 'bg-status-high',
  medium: 'bg-status-medium',
  low: 'bg-status-low',
}

const THREAT_TONE = {
  Ransomware: 'critical',
  DDoS: 'high',
  'Insider Threat': 'medium',
  'Data Breach': 'low',
}

function Gauge({ score, loading }) {
  const circ = 2 * Math.PI * 31
  const color =
    score >= 70 ? 'var(--status-critical)' : score >= 40 ? 'var(--status-medium)' : 'var(--status-low)'
  const band = score >= 70 ? 'Critical' : score >= 40 ? 'Elevated' : 'Contained'
  return (
    <div className="flex items-center gap-4 rounded-md border border-outline-variant bg-surface-container p-4">
      <svg width="72" height="72" viewBox="0 0 76 76" className="flex-none">
        <circle
          cx="38"
          cy="38"
          r="31"
          stroke="var(--theme-surface-surface-container-highest)"
          strokeWidth="7"
          fill="none"
        />
        {!loading && (
          <circle
            cx="38"
            cy="38"
            r="31"
            stroke={color}
            strokeWidth="7"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${(circ * score) / 100} ${circ}`}
            transform="rotate(-90 38 38)"
            style={{ transition: 'stroke-dasharray .5s ease, stroke .3s ease' }}
          />
        )}
      </svg>
      <div className="min-w-0">
        <p className="font-mono text-[10px] uppercase tracking-widest text-on-variant">
          Enterprise Risk Score
        </p>
        <p className="mt-1.5 font-mono text-2xl font-medium leading-none">
          {loading ? '—' : score}
        </p>
        <p className="mt-1.5 text-[11.5px] text-on-variant">
          of 100 ·{' '}
          <span style={{ color }} className="font-medium">
            {loading ? 'computing' : band}
          </span>
        </p>
      </div>
    </div>
  )
}

function Kpi({ label, value, note, tone, loading }) {
  return (
    <div className="flex flex-col justify-center gap-1.5 rounded-md border border-outline-variant bg-surface-container p-4">
      <p className="font-mono text-[10px] uppercase tracking-widest text-on-variant">{label}</p>
      {loading ? (
        <div className="h-6 w-24 animate-pulse rounded-xs bg-surface-highest" />
      ) : (
        <p
          className={`font-mono text-2xl font-medium leading-none ${
            tone === 'critical' ? 'text-status-critical' : ''
          }`}
        >
          {value}
        </p>
      )}
      <p className="text-[11.5px] text-on-variant">{note}</p>
    </div>
  )
}

const compact = (v) => formatINR(v, { compact: true })

export default function Dashboard() {
  const [drill, setDrill] = useState(null)
  const [selectedRuns, setSelectedRuns] = useState(null) // null = all runs

  const kpis = useApi(() => endpoints.kpis(), [], {
    fallback: {
      enterprise_eal_inr: demo.EAL,
      enterprise_var_95_inr: demo.VAR95,
      enterprise_var_99_inr: demo.VAR99,
      iterations: demo.MC_ITERATIONS,
      scenario_count: demo.PORTFOLIO.scenarios,
      open_vulnerabilities: demo.vulnStatus.Unpatched + demo.vulnStatus['In Progress'],
      portfolio: demo.PORTFOLIO,
      computed_at: null,
    },
  })

  const contributors = useApi(
    () => endpoints.contributors(6).then((r) => r.contributors),
    [],
    { fallback: demo.topRisks },
  )

  const threats = useApi(() => endpoints.threats().then((r) => r.threats), [], {
    fallback: demo.threats,
  })

  const runs = useApi(() => endpoints.runs(12).then((r) => r.runs), [], {
    fallback: demo.trend.map((t, i) => ({
      run_id: i,
      label: t.label,
      eal_inr: t.eal,
      var_95_inr: t.var95,
    })),
  })

  const plan = useApi(() => endpoints.optimizationPlan(), [], {
    fallback: { controls: demo.controls, budget_inr: demo.BUDGET },
  })

  const newRun = useAction(() => endpoints.runSimulation({}))

  const k = kpis.data
  const portfolio = k?.portfolio ?? demo.PORTFOLIO
  const totalAssetValue = portfolio.total_asset_value_inr

  // VaR₉₅ as a share of total asset value, scaled to a 0-100 read. There is
  // no such score in the engine — this is one illustrative rollup of two
  // figures that are real, not a model output.
  const riskScore = useMemo(() => {
    if (!k || !totalAssetValue) return 0
    return Math.min(100, Math.round((k.enterprise_var_95_inr / totalAssetValue) * 1000))
  }, [k, totalAssetValue])

  const runList = useMemo(() => runs.data ?? [], [runs.data])
  const visibleRuns = useMemo(() => {
    if (!selectedRuns) return runList
    return runList.filter((r) => selectedRuns.includes(r.run_id))
  }, [runList, selectedRuns])

  // Radar axes are the runs themselves; the two polygons are EAL and VaR₉₅,
  // so a widening gap between them reads as tail risk growing.
  const radarData = useMemo(
    () =>
      visibleRuns.map((r) => ({
        name: r.label,
        eal: Math.round(r.eal_inr),
        var95: Math.round(r.var_95_inr),
      })),
    [visibleRuns],
  )

  const radarSeries = [
    { key: 'eal', name: 'Expected Annual Loss' },
    { key: 'var95', name: 'Value at Risk (95%)' },
  ]

  const toggleRun = (runId) => {
    setSelectedRuns((prev) => {
      const current = prev ?? runList.map((r) => r.run_id)
      const next = current.includes(runId)
        ? current.filter((id) => id !== runId)
        : [...current, runId]
      if (!next.length) return prev // never blank the chart entirely
      return next.length === runList.length ? null : next
    })
  }

  const controls = plan.data?.controls ?? []
  const fundedControls = controls.filter((c) => c.funded)
  const unfunded = controls.length - fundedControls.length
  const fundedCost = fundedControls.reduce((s, c) => s + c.cost, 0)
  const contributorList = useMemo(() => contributors.data ?? [], [contributors.data])
  const maxEal = contributorList.length ? contributorList[0].eal : 1
  const threatList = useMemo(() => threats.data ?? [], [threats.data])

  const drillThreats = useMemo(() => {
    if (!drill || !threatList.length) return []
    const totalUnitEal = contributorList.reduce((s, u) => s + u.eal, 0) || 1
    const share = drill.eal / totalUnitEal
    const maxT = threatList[0].eal * share || 1
    return threatList.map((t) => ({
      name: t.name,
      amount: t.eal * share,
      pct: Math.round(((t.eal * share) / maxT) * 100),
      tone: THREAT_TONE[t.name] ?? 'low',
    }))
  }, [drill, threatList, contributorList])

  return (
    <AppLayout
      title="Executive Command Center"
      subtitle={
        k
          ? `${portfolio.assets.toLocaleString('en-IN')} assets · ${k.scenario_count.toLocaleString(
              'en-IN',
            )} risk scenarios · Monte Carlo`
          : 'Loading portfolio…'
      }
      actions={
        <Button
          variant="outline"
          size="sm"
          disabled={newRun.pending}
          onClick={async () => {
            const outcome = await newRun.run()
            if (outcome.ok) {
              kpis.refetch()
              runs.refetch()
              setSelectedRuns(null)
            }
          }}
        >
          {newRun.pending ? <Spinner /> : <Icon name="play_arrow" style={{ fontSize: 16 }} />}
          {newRun.pending ? 'Running…' : 'New run'}
        </Button>
      }
      footer={
        k?.computed_at ? (
          <>
            Last run
            <br />
            <span className="font-mono text-on-surface">
              {k.iterations.toLocaleString('en-IN')} MC iterations
            </span>
          </>
        ) : (
          'No run recorded'
        )
      }
    >
      <div className="flex h-full min-h-0 flex-col gap-4">
        {newRun.error && (
          <p className="flex-none rounded-xs border border-status-critical/40 bg-status-critical/5 px-3 py-2 text-xs text-on-variant">
            {newRun.error}
          </p>
        )}

        <div className="grid flex-none grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
          <Gauge score={riskScore} loading={kpis.loading && !k} />
          <Kpi
            label="Financial Exposure · EAL"
            loading={kpis.loading && !k}
            value={compact(k?.enterprise_eal_inr)}
            note={
              k
                ? `VaR₉₅ ${compact(k.enterprise_var_95_inr)} · VaR₉₉ ${compact(
                    k.enterprise_var_99_inr,
                  )}`
                : 'Awaiting simulation'
            }
          />
          <Kpi
            label="Open Vulnerabilities"
            loading={kpis.loading && !k}
            value={k ? k.open_vulnerabilities.toLocaleString('en-IN') : '—'}
            note={`${portfolio.vulnerabilities?.toLocaleString('en-IN') ?? '—'} findings tracked`}
            tone={k?.open_vulnerabilities > 0 ? 'critical' : undefined}
          />
          <Kpi
            label="Controls Not Funded"
            loading={plan.loading && !plan.data}
            value={controls.length ? unfunded : '—'}
            note={
              controls.length
                ? `of ${controls.length} programmes · ${compact(fundedCost)} committed`
                : 'Awaiting optimizer'
            }
            tone={unfunded > 0 ? 'critical' : undefined}
          />
        </div>

        <Panel
          title="Risk across runs — EAL vs VaR₉₅"
          actions={
            <div className="flex flex-wrap items-center justify-end gap-2">
              <span
                title="EAL is the average annual loss across the simulation. VaR₉₅ is the loss level exceeded in only 5% of simulated years — the bad-year number. Each spoke is one run."
                className="hidden cursor-help rounded-full border border-outline-variant px-2.5 py-1 text-[11.5px] text-on-variant sm:inline"
              >
                What does this mean?
              </span>
              {selectedRuns && (
                <button
                  onClick={() => setSelectedRuns(null)}
                  className="text-[11.5px] font-medium text-accent hover:underline"
                >
                  Show all
                </button>
              )}
              <Chip>{visibleRuns.length} runs</Chip>
            </div>
          }
          className="min-h-[360px] flex-none"
        >
          <AsyncBoundary
            state={runs}
            loadingMessage="Loading simulation runs…"
            emptyMessage="No simulation runs recorded yet."
            emptyAction={
              <Button variant="outline" size="sm" onClick={() => newRun.run().then(runs.refetch)}>
                Run one now
              </Button>
            }
          >
            <div className="mx-auto flex min-h-0 w-full max-w-[620px] flex-1 flex-col gap-2">
              <MultiRadar
                data={radarData}
                series={radarSeries}
                formatValue={(v) => formatINR(v, { compact: true })}
                emptyMessage="Select at least one run to plot."
              />
              {runList.length > 1 && (
                <div className="flex flex-none flex-wrap gap-1.5 pt-1">
                  {runList.map((r) => {
                    const on = !selectedRuns || selectedRuns.includes(r.run_id)
                    return (
                      <button
                        key={r.run_id}
                        onClick={() => toggleRun(r.run_id)}
                        aria-pressed={on}
                        className={`rounded-full border px-2.5 py-0.5 font-mono text-[10.5px] transition-colors ${
                          on
                            ? 'border-accent bg-accent/10 text-on-surface'
                            : 'border-outline-variant text-on-variant hover:border-outline'
                        }`}
                      >
                        {r.label}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </AsyncBoundary>
        </Panel>

        <div className="grid min-h-0 flex-1 auto-rows-fr grid-cols-1 gap-4 xl:grid-cols-[minmax(0,6fr)_minmax(0,4fr)]">
          <Panel
            title="Exposure by business unit"
            actions={<Chip>click to drill down</Chip>}
            className="min-h-[280px]"
          >
            <AsyncBoundary
              state={contributors}
              loadingMessage="Loading exposure…"
              emptyMessage="No exposure computed for any business unit."
            >
              <div className="flex flex-col gap-3">
                {contributorList.map((u) => (
                  <button
                    key={u.id ?? u.name}
                    onClick={() => setDrill(u)}
                    className="flex flex-col gap-1.5 text-left transition-opacity hover:opacity-80"
                  >
                    <div className="flex justify-between gap-3 text-[13px]">
                      <span className="truncate">{u.name}</span>
                      <span className="flex-none font-mono">{compact(u.eal)}</span>
                    </div>
                    <span className="h-2.5 overflow-hidden rounded-full bg-surface-highest">
                      <span
                        className="block h-full rounded-full bg-chart-1 transition-[width] duration-500"
                        style={{ width: `${(u.eal / maxEal) * 100}%` }}
                      />
                    </span>
                  </button>
                ))}
              </div>
            </AsyncBoundary>
          </Panel>

          <Panel
            title="Top risk reduction available"
            actions={<Chip>best ₹ avoided per ₹ spent</Chip>}
            className="min-h-[280px]"
          >
            <AsyncBoundary
              state={plan}
              loadingMessage="Optimising…"
              emptyMessage="No control programmes in the catalog."
              isEmpty={(d) => !d?.controls?.length}
            >
              <div className="flex flex-col gap-2.5">
                {[...controls]
                  .sort((a, b) => b.reduction / b.cost - a.reduction / a.cost)
                  .slice(0, 3)
                  .map((c) => (
                    <div key={c.id} className="rounded-xs border border-outline-variant px-3.5 py-3">
                      <div className="flex items-baseline justify-between gap-2.5">
                        <span className="text-[13.5px] font-medium">{c.name}</span>
                        <span className="flex-none font-mono text-[13px] text-status-low">
                          −{compact(c.reduction)}
                        </span>
                      </div>
                      <p className="mt-1 text-[11.5px] text-on-variant">
                        Cost {compact(c.cost)} · {c.applicable?.toLocaleString('en-IN')} assets ·{' '}
                        {Math.round(c.pct * 100)}% reduction
                      </p>
                    </div>
                  ))}
              </div>
              <p className="mt-auto pt-3 text-xs text-on-variant">
                Funding the optimizer's picks costs{' '}
                <span className="font-mono text-on-surface">{compact(fundedCost)}</span> against a{' '}
                {compact(plan.data?.budget_inr)} budget.
              </p>
            </AsyncBoundary>
          </Panel>
        </div>
      </div>

      <SlideOver
        open={!!drill}
        onClose={() => setDrill(null)}
        eyebrow="Business unit"
        title={drill?.name}
      >
        {drill && (
          <>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-xs border border-outline-variant bg-surface-container p-3.5">
                <p className="text-[11.5px] text-on-variant">Annual EAL</p>
                <p className="mt-1.5 font-mono text-lg font-medium">{compact(drill.eal)}</p>
              </div>
              <div className="rounded-xs border border-outline-variant bg-surface-container p-3.5">
                <p className="text-[11.5px] text-on-variant">Assets</p>
                <p className="mt-1.5 font-mono text-lg font-medium">
                  {drill.assets?.toLocaleString('en-IN')}
                </p>
              </div>
            </div>
            <div className="h-px bg-outline-variant" />
            <p className="text-[13px] font-medium">Threat mix driving this unit</p>
            {threats.loading && !threatList.length ? (
              <Loading message="Loading threat mix…" />
            ) : (
              <div className="flex flex-col gap-2.5">
                {drillThreats.map((t) => (
                  <div key={t.name} className="flex flex-col gap-1.5">
                    <div className="flex justify-between gap-3 text-[12.5px]">
                      <span className="truncate">{t.name}</span>
                      <span className="flex-none font-mono text-on-variant">
                        {compact(t.amount)}
                      </span>
                    </div>
                    <span className="h-1.5 overflow-hidden rounded-full bg-surface-highest">
                      <span
                        className={`block h-full rounded-full ${TONE_BAR[t.tone]}`}
                        style={{ width: `${t.pct}%` }}
                      />
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-auto flex gap-2.5">
              <Button as={Link} to="/app/optimizer" variant="blue" size="lg" className="flex-1">
                Open in optimizer
              </Button>
            </div>
          </>
        )}
      </SlideOver>
    </AppLayout>
  )
}
