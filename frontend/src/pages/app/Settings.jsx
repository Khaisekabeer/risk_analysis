import { useState } from 'react'
import AppLayout from '../../components/app/AppLayout'
import { AsyncBoundary, Button, Field, Input, Panel, Spinner } from '../../components/ui'
import { formatINR } from '../../lib/formatINR'
import { endpoints, BASE_URL } from '../../lib/apiClient'
import { useApi, useAction } from '../../lib/useApi'

export default function Settings() {
  const settings = useApi(() => endpoints.settings(), [])
  const health = useApi(() => endpoints.health(), [])
  const save = useAction((body) => endpoints.updateSettings(body))

  const [budgetDraft, setBudgetDraft] = useState(null)
  const [iterationsDraft, setIterationsDraft] = useState(null)
  const [saved, setSaved] = useState(false)

  const data = settings.data
  const budget = budgetDraft ?? (data ? String(Math.round(data.default_budget_inr)) : '')
  const iterations = iterationsDraft ?? (data ? String(data.monte_carlo_iterations) : '')

  const budgetValue = Number(budget)
  const iterationsValue = Number(iterations)
  const budgetInvalid = budget.trim() === '' || Number.isNaN(budgetValue) || budgetValue < 0
  const iterationsInvalid =
    iterations.trim() === '' ||
    Number.isNaN(iterationsValue) ||
    iterationsValue < 100 ||
    iterationsValue > 50000

  const submit = async (event) => {
    event.preventDefault()
    if (budgetInvalid || iterationsInvalid) return
    const outcome = await save.run({
      default_budget_inr: budgetValue,
      monte_carlo_iterations: iterationsValue,
    })
    if (outcome.ok) {
      setSaved(true)
      setBudgetDraft(null)
      setIterationsDraft(null)
      settings.refetch()
      setTimeout(() => setSaved(false), 5000)
    }
  }

  return (
    <AppLayout title="Settings" subtitle="Operator configuration, stored server-side">
      <div className="grid h-full min-h-0 grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Engine defaults" className="min-h-[300px]">
          <AsyncBoundary state={settings} loadingMessage="Loading settings…">
            <form className="flex flex-col gap-4" onSubmit={submit}>
              <Field
                label="Default optimisation budget (₹)"
                error={budgetInvalid ? 'Enter a budget of zero or more.' : null}
                hint={
                  data?.default_budget_is_derived
                    ? `Currently derived from the catalog: ${formatINR(
                        data.default_budget_inr,
                        { compact: true },
                      )}`
                    : 'Used when the optimizer is opened without a budget.'
                }
              >
                <Input
                  type="number"
                  min={0}
                  step={100000}
                  value={budget}
                  invalid={budgetInvalid}
                  onChange={(e) => setBudgetDraft(e.target.value)}
                />
              </Field>

              <Field
                label="Monte Carlo iterations"
                error={iterationsInvalid ? 'Must be between 100 and 50,000.' : null}
                hint="Higher is smoother but slower. 2,000 is the FAIR-literature default here."
              >
                <Input
                  type="number"
                  min={100}
                  max={50000}
                  step={100}
                  value={iterations}
                  invalid={iterationsInvalid}
                  onChange={(e) => setIterationsDraft(e.target.value)}
                />
              </Field>

              {save.error && (
                <p className="rounded-xs border border-status-critical/40 bg-status-critical/5 px-3 py-2 text-xs text-on-variant">
                  {save.error}
                </p>
              )}
              {saved && (
                <p role="status" className="rounded-xs border border-status-low/40 bg-status-low/5 px-3 py-2 text-xs text-on-variant">
                  Settings saved.
                </p>
              )}

              <Button
                type="submit"
                variant="blue"
                className="self-start"
                disabled={save.pending || budgetInvalid || iterationsInvalid}
              >
                {save.pending ? <Spinner /> : null}
                {save.pending ? 'Saving…' : 'Save settings'}
              </Button>
            </form>
          </AsyncBoundary>
        </Panel>

        <Panel title="Service status" className="min-h-[300px]">
          <AsyncBoundary state={health} loadingMessage="Checking the backend…">
            <dl className="flex flex-col gap-3 text-[13px]">
              {[
                ['API base URL', BASE_URL],
                ['Status', health.data?.status],
                ['Database', health.data?.db_status],
                ['Last simulation', health.data?.last_simulation_at ?? 'never'],
                ['Last ingestion', health.data?.last_ingestion_at ?? 'never'],
                ['Auth enforced', health.data?.auth_required ? 'yes' : 'no (demo mode)'],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-outline-variant pb-2.5"
                >
                  <dt className="text-on-variant">{label}</dt>
                  <dd className="min-w-0 break-all font-mono text-[12px]">{value ?? '—'}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-[11.5px] leading-relaxed text-on-variant">
              Security Gap weights (α/β/γ) are not exposed here: this build scores control
              coverage and Monte Carlo loss directly rather than computing a weighted
              Confidentiality/Integrity/Availability gap, so there is no weighting to set.
            </p>
          </AsyncBoundary>
        </Panel>
      </div>
    </AppLayout>
  )
}
