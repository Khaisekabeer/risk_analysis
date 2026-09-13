import { useMemo, useState } from 'react'
import AppLayout from '../../components/app/AppLayout'
import { AsyncBoundary, Button, Chip, Input, Panel, Spinner } from '../../components/ui'
import { formatINR } from '../../lib/formatINR'
import { endpoints } from '../../lib/apiClient'
import { useApi, useAction } from '../../lib/useApi'
import * as fallback from '../../lib/fallbacks'

const compact = (v) => formatINR(v, { compact: true })

/** Coverage is a percentage: the only valid domain is 0-100. */
const clampCoverage = (value) => Math.max(0, Math.min(100, value))

export default function ScenarioSimulator() {
  const [actionId, setActionId] = useState(null)
  const [coverage, setCoverage] = useState(100)
  // Held separately so a half-typed value ("1" on the way to "15") is not
  // clamped out from under the operator; the slider and diagram always read
  // the committed number.
  const [coverageDraft, setCoverageDraft] = useState(null)

  const plan = useApi(() => endpoints.optimizationPlan(), [], {
    fallback: fallback.plan(),
    isEmpty: (d) => !d?.controls?.length,
  })
  const distribution = useApi(() => endpoints.distribution(), [], {
    fallback: fallback.distribution,
  })

  const controls = plan.data?.controls ?? []
  const action = controls.find((c) => c.id === actionId) ?? controls[0] ?? null

  const [verified, setVerified] = useState(null)
  const simulate = useAction((controlId) => endpoints.simulate({ control_id: controlId }))

  const baselineVar = distribution.data?.var_95_inr ?? 0
  const baselineEal = distribution.data?.eal_inr ?? 0
  const bins = useMemo(() => distribution.data?.bins ?? [], [distribution.data])

  const sim = useMemo(() => {
    if (!action || !bins.length) return null
    const fraction = coverage / 100
    // Reduction scales with how much of the estate the rollout reaches.
    const averted = action.reduction * fraction
    const reducedShare = baselineEal > 0 ? averted / baselineEal : 0
    const simVar = baselineVar * (1 - reducedShare)

    const binWidth = bins.length > 1 ? bins[1].start - bins[0].start : 1
    const shift = binWidth > 0 ? Math.round(averted / binWidth) : 0
    const maxCount = Math.max(...bins.map((b) => b.count), 1)

    return {
      applicable: Math.round(((action.applicable ?? 0) * coverage) / 100),
      cost: (action.cost ?? 0) * fraction,
      averted,
      reductionPct: reducedShare * 100,
      simVar,
      delta: baselineVar - simVar,
      bars: bins.map((b, i) => ({
        base: (b.count / maxCount) * 100,
        sim: ((bins[i + shift]?.count ?? 0) / maxCount) * 100,
      })),
    }
  }, [action, bins, coverage, baselineEal, baselineVar])

  const commitCoverage = (raw) => {
    const parsed = Number(raw)
    if (raw === '' || Number.isNaN(parsed)) {
      setCoverageDraft(null)
      return
    }
    setCoverage(clampCoverage(parsed))
    setCoverageDraft(null)
  }

  return (
    <AppLayout
      title="What-If Sandbox"
      subtitle={
        distribution.data
          ? `Baseline: ${distribution.data.iterations.toLocaleString('en-IN')} Monte Carlo iterations`
          : 'Loading baseline…'
      }
      footer={
        distribution.data ? (
          <>
            Baseline
            <br />
            <span className="font-mono text-on-surface">
              {distribution.data.iterations.toLocaleString('en-IN')} iterations
            </span>
          </>
        ) : (
          'No run recorded'
        )
      }
    >
      <div className="grid h-full min-h-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(280px,340px)_minmax(0,1fr)]">
        <Panel title="Scenario" bodyClassName="flex flex-col gap-4 p-4" className="min-h-[400px]">
          <AsyncBoundary
            state={plan}
            loadingMessage="Loading control programmes…"
            emptyMessage="No control programmes available to simulate."
            isEmpty={(d) => !d?.controls?.length}
          >
            <p className="text-xs text-on-variant">
              One programme at a time, against the latest run
            </p>

            <div className="flex flex-col gap-2">
              <span className="text-xs text-on-variant">Action</span>
              <div className="flex flex-col gap-1.5">
                {controls.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setActionId(c.id)}
                    className={`flex items-baseline justify-between gap-2.5 rounded-xs border px-3 py-2.5 text-left text-sm transition-colors ${
                      c.id === action?.id
                        ? 'border-accent bg-accent/5'
                        : 'border-outline-variant hover:border-outline'
                    }`}
                  >
                    <span className="min-w-0 truncate">{c.name}</span>
                    <span className="flex-none font-mono text-[11.5px] text-on-variant">
                      {Math.round((c.pct ?? 0) * 100)}% max
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="coverage" className="text-xs text-on-variant">
                  Rollout coverage
                </label>
                <div className="flex items-center gap-1.5">
                  <Input
                    id="coverage-value"
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={coverageDraft ?? coverage}
                    onChange={(e) => setCoverageDraft(e.target.value)}
                    onBlur={(e) => commitCoverage(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && commitCoverage(e.currentTarget.value)}
                    className="h-8 w-[72px] text-right font-mono"
                    aria-label="Rollout coverage percent"
                  />
                  <span className="font-mono text-sm text-on-variant">%</span>
                </div>
              </div>
              <input
                id="coverage"
                type="range"
                min={0}
                max={100}
                step={1}
                value={coverage}
                onChange={(e) => {
                  setCoverageDraft(null)
                  setCoverage(clampCoverage(Number(e.target.value)))
                }}
                className="w-full accent-[var(--palette-blue-600)]"
              />
              <div className="flex justify-between font-mono text-[11px] text-on-variant">
                <span>0%</span>
                <span>100%</span>
              </div>
            </div>

            <div className="h-px bg-outline-variant" />

            <div className="flex flex-col gap-2 text-[12.5px]">
              <div className="flex justify-between gap-3">
                <span className="text-on-variant">Applicable assets</span>
                <span className="flex-none font-mono">
                  {sim ? sim.applicable.toLocaleString('en-IN') : '—'} of{' '}
                  {action?.applicable?.toLocaleString('en-IN') ?? '—'}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-on-variant">Spend at this coverage</span>
                <span className="flex-none font-mono">{sim ? compact(sim.cost) : '—'}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-on-variant">Loss avoided</span>
                <span className="flex-none font-mono">{sim ? compact(sim.averted) : '—'}</span>
              </div>
            </div>

            <div className="mt-auto flex flex-col gap-2 pt-2">
              <Button
                variant="blue"
                disabled={!action || simulate.pending}
                onClick={async () => {
                  if (!action) return
                  const outcome = await simulate.run(action.id)
                  setVerified(outcome.ok ? outcome.result : null)
                }}
              >
                {simulate.pending ? <Spinner /> : null}
                {simulate.pending ? 'Checking…' : 'Verify against backend'}
              </Button>
              <Button variant="tonal" onClick={() => setCoverage(0)}>
                Reset to baseline
              </Button>
            </div>
          </AsyncBoundary>
        </Panel>

        <div className="flex min-h-0 flex-col gap-4">
          <div className="grid flex-none grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-md border border-outline-variant bg-surface-container p-4">
              <p className="font-mono text-[10px] uppercase tracking-widest text-on-variant">
                VaR₉₅ baseline
              </p>
              <p className="mt-2 font-mono text-xl font-medium leading-none">
                {compact(baselineVar)}
              </p>
            </div>
            <div className="rounded-md border border-accent bg-surface-container p-4">
              <p className="font-mono text-[10px] uppercase tracking-widest text-on-variant">
                VaR₉₅ simulated
              </p>
              <p className="mt-2 font-mono text-xl font-medium leading-none text-chart-1">
                {sim ? compact(sim.simVar) : '—'}
              </p>
            </div>
            <div className="rounded-md border border-outline-variant bg-surface-container p-4">
              <p className="font-mono text-[10px] uppercase tracking-widest text-on-variant">
                Delta
              </p>
              <p className="mt-2 font-mono text-xl font-medium leading-none text-status-low">
                {!sim || coverage === 0 ? '—' : `−${compact(sim.delta)}`}
              </p>
            </div>
          </div>

          <Panel
            title="Annual loss distribution"
            actions={
              distribution.data ? (
                <Chip>
                  {distribution.data.iterations.toLocaleString('en-IN')} iterations
                </Chip>
              ) : null
            }
            className="min-h-[280px] flex-1"
          >
            <AsyncBoundary
              state={distribution}
              loadingMessage="Loading the loss distribution…"
              emptyMessage="No simulation run to plot."
              isEmpty={(d) => !d?.bins?.length}
            >
              <div className="flex items-center gap-4 pb-3 text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-3 border border-chart-inactive" />
                  Baseline
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-3 bg-chart-hist" />
                  Simulated
                </span>
              </div>
              {/* Fixed height so the frame never resizes as values change. */}
              <div className="flex h-[190px] flex-none items-end gap-[3px]">
                {(sim?.bars ?? []).map((b, i) => (
                  <div key={i} className="relative flex h-full flex-1 items-end">
                    <div
                      className="absolute inset-x-0 bottom-0 rounded-t-[2px] border border-b-0 border-chart-inactive"
                      style={{ height: `${b.base}%` }}
                    />
                    <div
                      className="relative w-full rounded-t-[2px] bg-chart-hist transition-[height] duration-300"
                      style={{ height: `${b.sim}%` }}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-2.5 flex justify-between gap-2 font-mono text-[11px] text-on-variant">
                <span>{bins.length ? compact(bins[0].start) : '—'}</span>
                <span>{compact(baselineEal)}</span>
                <span>{bins.length ? compact(bins[bins.length - 1].end) : '—'}</span>
              </div>
            </AsyncBoundary>
          </Panel>

          <div className="flex-none rounded-md border border-outline-variant bg-surface-container p-4 text-sm leading-relaxed">
            {simulate.error && <p className="mb-2 text-status-critical">{simulate.error}</p>}
            {verified && (
              <p className="mb-2 text-[12.5px] text-on-variant">
                Backend check at full coverage: EAL {compact(verified.current_eal_inr)} &rarr;{' '}
                {compact(verified.simulated_eal_inr)}, {compact(verified.financial_risk_averted_inr)}{' '}
                averted across {verified.assets_covered?.toLocaleString('en-IN')} assets.
              </p>
            )}
            {!action || !sim ? (
              'Pick a control programme to simulate.'
            ) : coverage === 0 ? (
              `Nothing funded — the simulated curve sits on the baseline at VaR₉₅ ${compact(baselineVar)}.`
            ) : (
              <>
                Rolling out {action.name} to {coverage}% of{' '}
                {action.applicable?.toLocaleString('en-IN')} applicable assets costs{' '}
                {compact(sim.cost)} and moves VaR₉₅ from {compact(baselineVar)} to{' '}
                {compact(sim.simVar)} — {compact(sim.delta)} of bad-year loss taken off the table.
              </>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
