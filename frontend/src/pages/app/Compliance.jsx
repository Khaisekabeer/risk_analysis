import { useState } from 'react'
import AppLayout from '../../components/app/AppLayout'
import {
  AsyncBoundary,
  Button,
  Chip,
  Icon,
  Panel,
  Spinner,
  TableScroll,
} from '../../components/ui'
import { endpoints } from '../../lib/apiClient'
import { useApi, useAction } from '../../lib/useApi'

const STATUS_STYLE = {
  Covered: { text: 'text-status-low', dot: 'bg-status-low' },
  'Not funded': { text: 'text-status-medium', dot: 'bg-status-medium' },
  'No mapping': { text: 'text-status-critical', dot: 'bg-status-critical' },
}

export default function Compliance() {
  const [framework, setFramework] = useState(null)
  const [toast, setToast] = useState(null)

  const frameworks = useApi(() => endpoints.frameworks().then((r) => r.frameworks), [])
  const mappings = useApi(
    () => endpoints.complianceMappings(framework).then((r) => r.mappings),
    [framework],
  )

  const exportReport = useAction(async (format) => {
    const blob = await endpoints.exportReport(format)
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `riskyn-audit-${new Date().toISOString().slice(0, 10)}.${
      format === 'markdown' ? 'md' : 'pdf'
    }`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    return true
  })

  const runExport = async (format) => {
    const outcome = await exportReport.run(format)
    setToast(
      outcome.ok
        ? { tone: 'ok', message: `Audit evidence report downloaded as ${format}.` }
        : { tone: 'error', message: outcome.error },
    )
    setTimeout(() => setToast(null), 6000)
  }

  const rows = mappings.data ?? []
  const frameworkList = frameworks.data ?? []

  return (
    <AppLayout
      title="Compliance Mappings"
      subtitle="Control-to-clause crosswalk · ISO 27001 · NIST CSF · CIS · RBI · SEBI"
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={exportReport.pending}
            onClick={() => runExport('markdown')}
            className="hidden sm:inline-flex"
          >
            Markdown
          </Button>
          <Button
            variant="blue"
            size="sm"
            disabled={exportReport.pending}
            onClick={() => runExport('pdf')}
          >
            {exportReport.pending ? <Spinner /> : <Icon name="download" style={{ fontSize: 16 }} />}
            <span className="hidden sm:inline">
              {exportReport.pending ? 'Generating…' : 'Export PDF'}
            </span>
          </Button>
        </div>
      }
    >
      <div className="flex h-full min-h-0 flex-col gap-4">
        {toast && (
          <p
            role="status"
            className={`flex-none rounded-xs border px-3 py-2 text-xs ${
              toast.tone === 'ok'
                ? 'border-status-low/40 bg-status-low/5 text-on-variant'
                : 'border-status-critical/40 bg-status-critical/5 text-on-variant'
            }`}
          >
            {toast.message}
          </p>
        )}

        <AsyncBoundary state={frameworks} loadingMessage="Loading frameworks…">
          <div className="grid flex-none grid-cols-2 gap-3 lg:grid-cols-5">
            {frameworkList.map((f) => {
              const pct = f.total ? Math.round((f.covered / f.total) * 100) : 0
              return (
                <button
                  key={f.key}
                  onClick={() => setFramework((prev) => (prev === f.key ? null : f.key))}
                  aria-pressed={framework === f.key}
                  className={`flex flex-col gap-2 rounded-md border p-3.5 text-left transition-colors ${
                    framework === f.key
                      ? 'border-accent bg-accent/5'
                      : 'border-outline-variant bg-surface-container hover:border-outline'
                  }`}
                >
                  <p className="text-[12.5px] font-medium leading-tight">{f.name}</p>
                  <p className="font-mono text-lg font-medium leading-none">
                    {f.covered}
                    <span className="text-sm text-on-variant">/{f.total}</span>
                  </p>
                  <span className="h-1.5 overflow-hidden rounded-full bg-surface-highest">
                    <span
                      className="block h-full rounded-full bg-chart-1 transition-[width] duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </span>
                  <p className="text-[11px] text-on-variant">
                    {f.openFindings.toLocaleString('en-IN')} open findings
                  </p>
                </button>
              )
            })}
          </div>
        </AsyncBoundary>

        <Panel
          title={
            framework
              ? `${frameworkList.find((f) => f.key === framework)?.name ?? framework} clauses`
              : 'All clauses'
          }
          actions={
            <div className="flex items-center gap-2">
              {framework && (
                <button
                  onClick={() => setFramework(null)}
                  className="text-[11.5px] font-medium text-accent hover:underline"
                >
                  Clear filter
                </button>
              )}
              <Chip>{rows.length} rows</Chip>
            </div>
          }
          className="min-h-0 flex-1"
          bodyClassName="p-0"
        >
          <AsyncBoundary
            state={mappings}
            loadingMessage="Loading clause mappings…"
            emptyMessage="No clauses mapped for this framework."
          >
            <TableScroll className="min-h-0 flex-1 overflow-y-auto">
              <table className="w-full min-w-[680px] border-collapse text-sm">
                <thead className="sticky top-0 z-10 bg-surface-container">
                  <tr className="text-left font-mono text-[10px] uppercase tracking-wider text-on-variant">
                    <th className="border-b border-outline-variant px-4 py-2.5">Clause</th>
                    <th className="border-b border-outline-variant px-4 py-2.5">Framework</th>
                    <th className="border-b border-outline-variant px-4 py-2.5">Objective</th>
                    <th className="border-b border-outline-variant px-4 py-2.5">Satisfied by</th>
                    <th className="border-b border-outline-variant px-4 py-2.5 text-right">
                      Open findings
                    </th>
                    <th className="border-b border-outline-variant px-4 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const style = STATUS_STYLE[row.status] ?? STATUS_STYLE['No mapping']
                    return (
                      <tr key={row.clause} className="transition-colors hover:bg-surface-high">
                        <td className="whitespace-nowrap border-b border-outline-variant px-4 py-2.5 font-mono text-[12px]">
                          {row.clause}
                        </td>
                        <td className="whitespace-nowrap border-b border-outline-variant px-4 py-2.5 text-[12.5px] text-on-variant">
                          {row.frameworkName}
                        </td>
                        <td className="border-b border-outline-variant px-4 py-2.5 text-[12.5px]">
                          {row.objective}
                        </td>
                        <td className="border-b border-outline-variant px-4 py-2.5 text-[12.5px] text-on-variant">
                          {row.control ?? '—'}
                        </td>
                        <td className="border-b border-outline-variant px-4 py-2.5 text-right font-mono text-on-variant">
                          {row.openFindings.toLocaleString('en-IN')}
                        </td>
                        <td className="whitespace-nowrap border-b border-outline-variant px-4 py-2.5">
                          <span className={`inline-flex items-center gap-1.5 text-[12.5px] ${style.text}`}>
                            <span className={`h-2 w-2 flex-none rounded-full ${style.dot}`} />
                            {row.status}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </TableScroll>
          </AsyncBoundary>
        </Panel>
      </div>
    </AppLayout>
  )
}
