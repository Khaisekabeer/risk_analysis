import { useRef, useState } from 'react'
import AppLayout from '../../components/app/AppLayout'
import {
  AsyncBoundary,
  Button,
  Chip,
  Icon,
  Panel,
  ProgressBar,
  TableScroll,
} from '../../components/ui'
import { formatINR } from '../../lib/formatINR'
import { endpoints, describeError } from '../../lib/apiClient'
import { useApi, useAction } from '../../lib/useApi'
import * as fallback from '../../lib/fallbacks'

const compact = (v) => formatINR(v, { compact: true })

export default function Telemetry() {
  const [upload, setUpload] = useState(null) // { name, progress, result, error }
  const fileInput = useRef(null)

  const presets = useApi(() => endpoints.presets().then((r) => r.presets), [], {
    fallback: fallback.presets,
  })
  const events = useApi(() => endpoints.telemetryEvents(12).then((r) => r.events), [], {
    fallback: fallback.events,
  })
  const loadPreset = useAction((name) => endpoints.loadPreset(name))

  const [lastPreset, setLastPreset] = useState(null)

  const runPreset = async (name) => {
    const outcome = await loadPreset.run(name)
    if (outcome.ok) {
      setLastPreset(outcome.result)
      events.refetch()
    }
  }

  const send = async (file) => {
    setUpload({ name: file.name, progress: 0, result: null, error: null })
    try {
      const result = await endpoints.upload(file, (progress) =>
        setUpload((u) => (u ? { ...u, progress } : u)),
      )
      // Marked accepted only once the backend has confirmed it.
      setUpload({ name: file.name, progress: 100, result, error: null })
      events.refetch()
    } catch (error) {
      setUpload({ name: file.name, progress: null, result: null, error: describeError(error) })
    }
  }

  return (
    <AppLayout
      title="Telemetry Ingestion"
      subtitle="Preset scenario loaders and validated file uploads"
    >
      <input
        ref={fileInput}
        type="file"
        accept=".csv,.json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) send(file)
          e.target.value = ''
        }}
      />

      <div className="grid h-full min-h-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,400px)]">
        <div className="flex min-h-0 flex-col gap-4">
          <Panel
            title="Scenario presets"
            actions={<Chip>demo-safe</Chip>}
            className="flex-none"
          >
            <AsyncBoundary
              state={presets}
              loadingMessage="Loading presets…"
              emptyMessage="No scenario presets available."
            >
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {(presets.data ?? []).map((p) => (
                  <button
                    key={p.name}
                    onClick={() => runPreset(p.name)}
                    disabled={loadPreset.pending}
                    className="flex flex-col gap-1.5 rounded-xs border border-outline-variant p-3.5 text-left transition-colors hover:border-accent disabled:opacity-50"
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-[13.5px] font-medium">{p.name}</span>
                      <span className="flex-none font-mono text-[11.5px] text-on-variant">
                        {compact(p.eal_inr)}
                      </span>
                    </span>
                    <span className="text-[11.5px] text-on-variant">{p.description}</span>
                    <span className="font-mono text-[10.5px] text-on-variant">{p.source}</span>
                  </button>
                ))}
              </div>
              {loadPreset.error && (
                <p className="mt-3 rounded-xs border border-status-critical/40 bg-status-critical/5 px-3 py-2 text-xs text-on-variant">
                  {loadPreset.error}
                </p>
              )}
              {lastPreset && (
                <p className="mt-3 rounded-xs border border-status-low/40 bg-status-low/5 px-3 py-2 text-xs leading-relaxed text-on-variant">
                  <span className="font-medium text-on-surface">{lastPreset.preset}</span> loaded
                  from {lastPreset.source} —{' '}
                  {lastPreset.records_accepted.toLocaleString('en-IN')} scenarios. {lastPreset.note}
                </p>
              )}
            </AsyncBoundary>
          </Panel>

          <Panel title="Upload a scan export" className="min-h-[220px] flex-none">
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                const file = e.dataTransfer.files?.[0]
                if (file) send(file)
              }}
              className="flex flex-col items-center justify-center gap-3 rounded-xs border border-dashed border-outline-variant px-4 py-8 text-center"
            >
              <Icon name="upload_file" className="text-on-variant" style={{ fontSize: 26 }} />
              <p className="text-sm">Drop a Nessus, Qualys or CrowdStrike export here</p>
              <p className="text-[11.5px] text-on-variant">
                CSV or JSON, up to 5 MB. Rows are validated before anything is accepted.
              </p>
              <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
                Choose a file
              </Button>
            </div>

            {upload && (
              <div className="mt-3 rounded-xs border border-outline-variant p-3.5">
                <p className="flex items-center justify-between gap-3 font-mono text-[12px]">
                  <span className="truncate">{upload.name}</span>
                  {upload.result && (
                    <span className="flex-none text-status-low">
                      {upload.result.records_accepted}/{upload.result.records_seen} accepted
                    </span>
                  )}
                </p>

                {!upload.result && !upload.error && (
                  <div className="mt-2">
                    <ProgressBar
                      value={upload.progress}
                      label={upload.progress === 100 ? 'Validating…' : `Uploading ${upload.progress}%`}
                    />
                  </div>
                )}

                {upload.error && (
                  <p className="mt-2 text-xs text-status-critical">{upload.error}</p>
                )}

                {upload.result && (
                  <div className="mt-2 flex flex-col gap-1.5 text-[11.5px] text-on-variant">
                    <p>
                      Recognised fields: {upload.result.recognised_fields.join(', ') || 'none'}
                    </p>
                    <p>
                      {upload.result.matched_known_assets.toLocaleString('en-IN')} asset ids matched
                      the inventory.
                    </p>
                    {upload.result.validation_errors.length > 0 && (
                      <ul className="mt-1 flex flex-col gap-0.5 text-status-medium">
                        {upload.result.validation_errors.slice(0, 5).map((err) => (
                          <li key={err}>{err}</li>
                        ))}
                        {upload.result.validation_errors.length > 5 && (
                          <li>…and {upload.result.validation_errors.length - 5} more.</li>
                        )}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}
          </Panel>
        </div>

        <Panel title="Recent ingestion" className="min-h-[300px]" bodyClassName="p-0">
          <AsyncBoundary
            state={events}
            loadingMessage="Loading ingestion history…"
            emptyMessage="Nothing ingested yet."
          >
            <TableScroll className="min-h-0 flex-1 overflow-y-auto">
              <table className="w-full min-w-[320px] border-collapse text-sm">
                <thead className="sticky top-0 bg-surface-container">
                  <tr className="text-left font-mono text-[10px] uppercase tracking-wider text-on-variant">
                    <th className="border-b border-outline-variant px-4 py-2.5">Source</th>
                    <th className="border-b border-outline-variant px-4 py-2.5 text-right">Rows</th>
                    <th className="border-b border-outline-variant px-4 py-2.5">When</th>
                  </tr>
                </thead>
                <tbody>
                  {(events.data ?? []).map((e, i) => (
                    <tr key={i} className="hover:bg-surface-high">
                      <td className="border-b border-outline-variant px-4 py-2.5 text-[12.5px]">
                        {e.filename || e.source}
                      </td>
                      <td className="border-b border-outline-variant px-4 py-2.5 text-right font-mono text-[12px]">
                        {e.records_accepted?.toLocaleString('en-IN')}
                      </td>
                      <td className="whitespace-nowrap border-b border-outline-variant px-4 py-2.5 font-mono text-[11px] text-on-variant">
                        {e.received_at?.replace('T', ' ').replace('+00:00', '')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          </AsyncBoundary>
        </Panel>
      </div>
    </AppLayout>
  )
}
