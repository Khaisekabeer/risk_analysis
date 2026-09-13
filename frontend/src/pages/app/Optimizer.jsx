import { useState } from 'react'
import AppLayout from '../../components/app/AppLayout'
import {
  AsyncBoundary,
  Button,
  Card,
  Chip,
  Icon,
  Input,
  Panel,
  Spinner,
  TableScroll,
} from '../../components/ui'
import { FrontierCurve } from '../../components/charts'
import { formatINR } from '../../lib/formatINR'
import { endpoints } from '../../lib/apiClient'
import { useApi, useAction } from '../../lib/useApi'
import * as fallback from '../../lib/fallbacks'

const compact = (v) => formatINR(v, { compact: true })

function Tile({ label, value, note, tone, loading }) {
  return (
    <Card hover={false} className="p-4">
      <p className="font-mono text-[10px] uppercase tracking-widest text-on-variant">{label}</p>
      {loading ? (
        <div className="mt-2 h-5 w-20 animate-pulse rounded-xs bg-surface-highest" />
      ) : (
        <p
          className={`mt-2 font-mono text-[23px] font-medium leading-none ${
            tone === 'low' ? 'text-status-low' : ''
          }`}
        >
          {value}
        </p>
      )}
      <p className="mt-2 text-xs leading-relaxed text-on-variant">{note}</p>
    </Card>
  )
}

export default function Optimizer() {
  // `null` means the operator has not touched the field, so it mirrors the
  // budget the backend resolved. Once they type, their string is authoritative
  // -- including "0", which is a legitimate budget and is never swapped for a
  // default (docs/frontend-backend-integration.md, Optimizer).
  const [typedBudget, setTypedBudget] = useState(null)
  const [appliedBudget, setAppliedBudget] = useState(null)

  const plan = useApi(() => endpoints.optimizationPlan(appliedBudget), [appliedBudget], {
    fallback: fallback.plan(appliedBudget),
    isEmpty: (d) => !d?.controls?.length,
  })

  const frontier = useApi(() => endpoints.frontier(14).then((r) => r.curve), [], {
    fallback: fallback.frontier(14),
  })

  const runOptimization = useAction((budget) => endpoints.runOptimization(budget))

  const data = plan.data

  // Derived during render rather than synced through an effect.
  const budgetInput =
    typedBudget ?? (data?.budget_inr != null ? String(Math.round(data.budget_inr)) : '')
  const controls = data?.controls ?? []
  const funded = controls.filter((c) => c.funded)
  const budget = data?.budget_inr ?? 0
  const allocated = data?.total_cost_inr ?? 0
  const reduction = data?.total_reduction_inr ?? 0
  const unspent = Math.max(0, budget - allocated)
  const unfundedCosts = controls.filter((c) => !c.funded).map((c) => c.cost)
  const cheapestRemaining = unfundedCosts.length ? Math.min(...unfundedCosts) : null
  const roi = allocated > 0 ? reduction / allocated : 0
  const baseline = data?.baseline_eal_inr ?? 0
  const residual = data?.residual_eal_inr ?? baseline

  const apply = async () => {
    const parsed = Number(budgetInput)
    if (budgetInput.trim() === '' || Number.isNaN(parsed) || parsed < 0) return
    setAppliedBudget(parsed)
    const outcome = await runOptimization.run(parsed)
    if (outcome.ok) plan.refetch()
  }

  const invalidBudget =
    budgetInput.trim() !== '' && (Number.isNaN(Number(budgetInput)) || Number(budgetInput) < 0)

  return (
    <AppLayout
      title="Investment Optimizer"
      subtitle="0/1 knapsack over the remediation catalog · POST /api/v1/optimization/run"
      actions={
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            apply()
          }}
        >
          <span className="hidden text-xs text-on-variant lg:inline">Budget ₹</span>
          <Input
            type="number"
            step={100000}
            min={0}
            value={budgetInput}
            invalid={invalidBudget}
            onChange={(e) => setTypedBudget(e.target.value)}
            className="w-32 sm:w-36"
            aria-label="Budget in rupees"
            placeholder="0"
          />
          <Button
            type="submit"
            variant="blue"
            size="sm"
            disabled={runOptimization.pending || invalidBudget || budgetInput.trim() === ''}
          >
            {runOptimization.pending ? <Spinner /> : <Icon name="bolt" style={{ fontSize: 16 }} />}
            <span className="hidden sm:inline">
              {runOptimization.pending ? 'Optimising…' : 'Optimise'}
            </span>
          </Button>
        </form>
      }
    >
      <div className="flex h-full min-h-0 flex-col gap-4">
        {(runOptimization.error || invalidBudget) && (
          <p className="flex-none rounded-xs border border-status-critical/40 bg-status-critical/5 px-3 py-2 text-xs text-on-variant">
            {invalidBudget ? 'Enter a budget of zero or more.' : runOptimization.error}
          </p>
        )}

        <div className="grid flex-none grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Tile
            label="Budget"
            loading={plan.loading && !data}
            value={compact(budget)}
            note="Knapsack constraint"
          />
          <Tile
            label="Allocated"
            loading={plan.loading && !data}
            value={compact(allocated)}
            note={
              cheapestRemaining !== null
                ? `${compact(unspent)} unspent · cheapest remaining ${compact(cheapestRemaining)}`
                : 'Every programme funded'
            }
          />
          <Tile
            label="Total risk reduction"
            loading={plan.loading && !data}
            value={compact(reduction)}
            note="Annual loss removed by the funded set"
            tone="low"
          />
          <Tile
            label="Return on investment"
            loading={plan.loading && !data}
            value={allocated > 0 ? `${roi.toFixed(2)}×` : '—'}
            note={
              allocated > 0
                ? `ROSI ${data?.rosi_percentage?.toFixed(0) ?? '—'}% · reduction per rupee`
                : 'Nothing funded at this budget'
            }
          />
        </div>

        <div className="grid min-h-0 flex-1 auto-rows-fr grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.75fr)_minmax(300px,360px)]">
          <Panel
            title="Candidate Controls"
            actions={
              <div className="flex flex-wrap justify-end gap-2">
                <Chip>
                  <span className="h-1.5 w-1.5 rounded-full bg-chart-1" />
                  {funded.length} funded
                </Chip>
                <Chip>{controls.length} candidates</Chip>
              </div>
            }
            className="min-h-[300px]"
            bodyClassName="overflow-auto p-0"
          >
            <AsyncBoundary
              state={plan}
              loadingMessage="Running the knapsack…"
              emptyMessage="No control programmes in the remediation catalog."
              isEmpty={(d) => !d?.controls?.length}
            >
              <TableScroll>
<table className="w-full min-w-[660px] border-collapse text-sm">
                  <thead className="sticky top-0 z-10 bg-surface-container">
                    <tr className="text-left font-mono text-[10px] uppercase tracking-wider text-on-variant">
                      <th className="w-10 border-b border-outline-variant px-4 py-2.5" />
                      <th className="border-b border-outline-variant px-4 py-2.5">Control</th>
                      <th className="border-b border-outline-variant px-4 py-2.5 text-right">Cost</th>
                      <th className="border-b border-outline-variant px-4 py-2.5 text-right">
                        Reduction
                      </th>
                      <th className="border-b border-outline-variant px-4 py-2.5 text-right">ROI</th>
                      <th className="border-b border-outline-variant px-4 py-2.5">Maps to</th>
                    </tr>
                  </thead>
                  <tbody>
                    {controls.map((c) => (
                      <tr
                        key={c.id}
                        className={`transition-colors hover:bg-surface-high ${
                          c.funded ? '' : 'text-on-variant'
                        }`}
                      >
                        <td className="border-b border-outline-variant px-4 py-2.5">
                          <span
                            className={`grid h-4 w-4 place-items-center rounded-[3px] border ${
                              c.funded ? 'border-accent bg-accent text-white' : 'border-outline'
                            }`}
                          >
                            {c.funded && <Icon name="check" style={{ fontSize: 12 }} />}
                          </span>
                        </td>
                        <td className="whitespace-nowrap border-b border-outline-variant px-4 py-2.5">
                          {c.name}
                          <span className="block text-[11px] text-on-variant">
                            {c.applicable?.toLocaleString('en-IN')} assets ·{' '}
                            {Math.round((c.pct ?? 0) * 100)}% mitigation
                          </span>
                        </td>
                        <td className="whitespace-nowrap border-b border-outline-variant px-4 py-2.5 text-right font-mono">
                          {compact(c.cost)}
                        </td>
                        <td
                          className={`whitespace-nowrap border-b border-outline-variant px-4 py-2.5 text-right font-mono ${
                            c.funded ? 'text-status-low' : ''
                          }`}
                        >
                          {compact(c.reduction)}
                        </td>
                        <td className="whitespace-nowrap border-b border-outline-variant px-4 py-2.5 text-right font-mono">
                          {c.cost > 0 ? `${(c.reduction / c.cost).toFixed(2)}×` : '—'}
                        </td>
                        <td className="whitespace-nowrap border-b border-outline-variant px-4 py-2.5">
                          <span className="flex gap-1">
                            {(c.frameworks ?? []).map((f) => (
                              <span
                                key={f}
                                className="rounded-[3px] border border-outline-variant px-1.5 py-0.5 font-mono text-[10px] text-on-variant"
                              >
                                {f}
                              </span>
                            ))}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>
            </AsyncBoundary>
          </Panel>

          <div className="flex min-h-0 flex-col gap-4">
            <Panel title="Expected Annual Loss" className="flex-none">
              <div className="flex flex-col gap-4">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-widest text-on-variant">
                    Before
                  </p>
                  <p className="mt-1.5 font-mono text-xl font-medium">{compact(baseline)}</p>
                  <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-surface-highest">
                    <div className="h-full w-full rounded-full bg-chart-inactive" />
                  </div>
                </div>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-widest text-on-variant">
                    After funded controls
                  </p>
                  <p className="mt-1.5 flex flex-wrap items-baseline gap-2">
                    <span className="font-mono text-xl font-medium text-status-low">
                      {compact(residual)}
                    </span>
                    {baseline > 0 && (
                      <span className="text-xs text-status-low">
                        −{((reduction / baseline) * 100).toFixed(1)}%
                      </span>
                    )}
                  </p>
                  <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-surface-highest">
                    <div
                      className="h-full rounded-full bg-status-low transition-[width] duration-500"
                      style={{
                        width: `${baseline > 0 ? Math.max(0, (residual / baseline) * 100) : 0}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </Panel>

            <Panel
              title="Investment vs risk reduction"
              actions={<Chip>optimum at each budget</Chip>}
              className="min-h-[240px] flex-1"
            >
              <AsyncBoundary
                state={frontier}
                loadingMessage="Computing the frontier…"
                emptyMessage="No frontier available — the catalog is empty."
              >
                <FrontierCurve data={frontier.data ?? []} budget={budget} />
              </AsyncBoundary>
            </Panel>

            <div className="flex-none rounded-md border border-outline-variant bg-surface-container p-4 text-sm leading-relaxed">
              {allocated > 0 ? (
                <>
                  Spending {compact(allocated)} reduces exposure by {compact(reduction)} — a{' '}
                  {roi.toFixed(2)}× return on security investment.
                </>
              ) : (
                <>
                  Nothing is funded at {compact(budget)}.
                  {cheapestRemaining !== null && (
                    <> The cheapest programme costs {compact(cheapestRemaining)}.</>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
