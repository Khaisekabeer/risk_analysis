import AppLayout from '../../components/app/AppLayout'
import { AsyncBoundary, Chip, Panel, Severity } from '../../components/ui'
import { formatINR } from '../../lib/formatINR'
import { endpoints } from '../../lib/apiClient'
import { useApi } from '../../lib/useApi'
import * as fallback from '../../lib/fallbacks'

const COLUMNS = ['Open', 'In Progress', 'Resolved']
const COLUMN_TONE = {
  Open: 'bg-status-critical',
  'In Progress': 'bg-status-medium',
  Resolved: 'bg-status-low',
}
const compact = (v) => formatINR(v, { compact: true })

function Ticket({ item }) {
  return (
    <article className="flex flex-col gap-2 rounded-xs border border-outline-variant bg-surface p-3 transition-colors hover:border-outline">
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono text-[12px]">{item.cve}</span>
        <span className="flex-none rounded-[3px] border border-outline-variant px-1.5 py-0.5 font-mono text-[10px] text-on-variant">
          CVSS {item.cvss?.toFixed(1)}
        </span>
      </div>

      <Severity level={item.severity} />

      <p className="font-mono text-[11.5px] text-on-variant">
        {item.asset}
        {item.assetType ? ` · ${item.assetType}` : ''}
      </p>

      {/* The fix the backend recommends for this finding's mapped control,
          priced from the same catalog the optimizer buys from. */}
      <div className="rounded-[3px] border border-outline-variant bg-surface-container px-2.5 py-2">
        <p className="text-[12px] font-medium">{item.remediation}</p>
        <p className="mt-1 flex flex-wrap justify-between gap-x-3 font-mono text-[11px] text-on-variant">
          <span>Fix {compact(item.fixCostInr)}</span>
          <span className="text-status-low">
            −{compact(item.riskReductionInr)} · {Math.round(item.riskReductionPct * 100)}%
          </span>
        </p>
      </div>

      {item.control && (
        <span className="self-start rounded-[3px] border border-outline-variant px-1.5 py-0.5 font-mono text-[10px] text-on-variant">
          {item.control}
        </span>
      )}
    </article>
  )
}

export default function RemediationQueue() {
  const queue = useApi(() => endpoints.remediation(90), [], {
    fallback: fallback.remediation,
    isEmpty: (d) => !d?.columns || COLUMNS.every((c) => !(d.columns[c] ?? []).length),
  })

  const columns = queue.data?.columns ?? {}
  const counts = queue.data?.counts ?? {}

  return (
    <AppLayout
      title="Remediation Queue"
      subtitle="Prioritised by CVSS, priced from the remediation catalog"
      footer={
        <>
          Tracked
          <br />
          <span className="font-mono text-on-surface">
            {Object.values(counts)
              .reduce((s, n) => s + n, 0)
              .toLocaleString('en-IN')}{' '}
            findings
          </span>
        </>
      }
    >
      <AsyncBoundary
        state={queue}
        loadingMessage="Loading the remediation queue…"
        emptyMessage="No remediation items to triage."
        isEmpty={(d) => !d?.columns || COLUMNS.every((c) => !(d.columns[c] ?? []).length)}
      >
        <div className="grid h-full min-h-0 grid-cols-1 gap-4 lg:grid-cols-3">
          {COLUMNS.map((name) => {
            const items = columns[name] ?? []
            return (
              <Panel
                key={name}
                title={
                  <span className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${COLUMN_TONE[name]}`} />
                    {name}
                  </span>
                }
                actions={
                  <Chip>
                    {items.length}
                    {counts[name] != null && items.length < counts[name]
                      ? ` of ${counts[name].toLocaleString('en-IN')}`
                      : ''}
                  </Chip>
                }
                className="min-h-[320px]"
                bodyClassName="gap-2.5 overflow-y-auto"
              >
                {items.length === 0 ? (
                  <p className="py-6 text-center text-xs text-on-variant">
                    Nothing in this column.
                  </p>
                ) : (
                  items.map((item) => <Ticket key={item.vuln_id} item={item} />)
                )}
              </Panel>
            )
          })}
        </div>
      </AsyncBoundary>
    </AppLayout>
  )
}
