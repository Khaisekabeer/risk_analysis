import { useState } from 'react'
import AppLayout from '../../components/app/AppLayout'
import {
  AsyncBoundary,
  Button,
  Icon,
  Input,
  Panel,
  Severity,
  SlideOver,
  Spinner,
  TableScroll,
} from '../../components/ui'
import { CoverageBars } from '../../components/charts'
import { formatINR } from '../../lib/formatINR'
import { endpoints } from '../../lib/apiClient'
import { useApi, useAction } from '../../lib/useApi'

const TABS = ['Vulnerabilities', 'Controls', 'Assets', 'Compliance']
const STATUS_TONE = {
  Open: 'text-status-critical',
  'In Progress': 'text-status-medium',
  Resolved: 'text-status-low',
}
const compact = (v) => formatINR(v, { compact: true })

function Th({ children, className = '' }) {
  return (
    <th
      className={`whitespace-nowrap border-b border-outline-variant px-4 py-2.5 font-mono text-[10px] uppercase tracking-wider text-on-variant ${className}`}
    >
      {children}
    </th>
  )
}

function Td({ children, className = '' }) {
  return (
    <td className={`border-b border-outline-variant px-4 py-2.5 ${className}`}>{children}</td>
  )
}

function Vulnerabilities() {
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [severity, setSeverity] = useState(null)
  const [status, setStatus] = useState(null)
  const [selectedVulnerability, setSelectedVulnerability] = useState(null)
  const [mappingRequested, setMappingRequested] = useState(false)

  const vulns = useApi(
    () =>
      endpoints.vulnerabilities({
        limit: 100,
        ...(query ? { search: query } : {}),
        ...(severity ? { severity } : {}),
        ...(status ? { status } : {}),
      }),
    [query, severity, status],
    { isEmpty: (d) => !d?.rows?.length },
  )

  const summary = useApi(() => endpoints.vulnerabilitySummary(), [])
  const rows = vulns.data?.rows ?? []
  const cveDetails = useApi(
    () => endpoints.cveDetails(selectedVulnerability.cve_id),
    [selectedVulnerability?.cve_id],
    {
      enabled:
        mappingRequested &&
        /^CVE-\d{4}-\d{4,}$/i.test(selectedVulnerability?.cve_id ?? ''),
    },
  )

  return (
    <>
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-none flex-wrap items-center gap-2">
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            setQuery(search.trim())
          }}
        >
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="CVE or asset id"
            className="w-48"
            aria-label="Search vulnerabilities"
          />
          <Button type="submit" variant="outline" size="sm">
            Search
          </Button>
        </form>

        <div className="flex flex-wrap gap-1.5">
          {['Critical', 'High', 'Medium', 'Low'].map((s) => (
            <button
              key={s}
              onClick={() => setSeverity((prev) => (prev === s ? null : s))}
              aria-pressed={severity === s}
              className={`rounded-full border px-2.5 py-1 text-[11.5px] transition-colors ${
                severity === s
                  ? 'border-accent bg-accent/10'
                  : 'border-outline-variant text-on-variant hover:border-outline'
              }`}
            >
              {s}
              {summary.data ? ` ${summary.data.by_severity?.[s]?.toLocaleString('en-IN') ?? 0}` : ''}
            </button>
          ))}
          {['Open', 'In Progress', 'Resolved'].map((s) => (
            <button
              key={s}
              onClick={() => setStatus((prev) => (prev === s ? null : s))}
              aria-pressed={status === s}
              className={`rounded-full border px-2.5 py-1 text-[11.5px] transition-colors ${
                status === s
                  ? 'border-accent bg-accent/10'
                  : 'border-outline-variant text-on-variant hover:border-outline'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <span className="ml-auto text-xs text-on-variant">
          {vulns.data ? `${vulns.data.total.toLocaleString('en-IN')} findings` : ''}
        </span>
      </div>

      <AsyncBoundary
        state={vulns}
        loadingMessage="Loading vulnerabilities…"
        emptyMessage="No vulnerability matches these filters."
        isEmpty={(d) => !d?.rows?.length}
      >
        <TableScroll className="min-h-0 flex-1 overflow-y-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-surface-container">
              <tr className="text-left">
                <Th>CVE</Th>
                <Th>Asset</Th>
                <Th>Type</Th>
                <Th className="text-right">CVSS</Th>
                <Th className="text-right">EPSS</Th>
                <Th>Severity</Th>
                <Th>Status</Th>
                <Th>Control</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => (
                <tr
                  key={v.vuln_id}
                  className="cursor-pointer transition-colors hover:bg-surface-high focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                  role="button"
                  tabIndex={0}
                  aria-label={`View vulnerability ${v.cve_id || v.vuln_id} overview`}
                  onClick={() => {
                    setSelectedVulnerability(v)
                    setMappingRequested(false)
                  }}
                  onKeyDown={(event) => {
                    if (event.currentTarget !== event.target) return
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      setSelectedVulnerability(v)
                      setMappingRequested(false)
                    }
                  }}
                >
                  {/* The canonical CVE id straight from asset_vulnerabilities. */}
                  <Td className="whitespace-nowrap font-mono text-[12.5px]">
                    {v.cve_id ? (
                      <a
                        href={`https://nvd.nist.gov/vuln/detail/${encodeURIComponent(v.cve_id)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
                        onClick={(event) => {
                          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
                            return
                          }
                          event.preventDefault()
                          event.stopPropagation()
                          setSelectedVulnerability(v)
                          setMappingRequested(true)
                        }}
                      >
                        {v.cve_id}
                      </a>
                    ) : (
                      '—'
                    )}
                  </Td>
                  <Td className="whitespace-nowrap font-mono text-[12.5px]">{v.asset_id}</Td>
                  <Td className="whitespace-nowrap text-[12.5px] text-on-variant">
                    {(v.asset_type ?? '').replace(/_/g, ' ')}
                  </Td>
                  <Td className="text-right font-mono">{v.cvss_score?.toFixed(1)}</Td>
                  <Td className="text-right font-mono text-on-variant">
                    {v.epss_score != null ? v.epss_score.toFixed(3) : '—'}
                  </Td>
                  <Td>
                    <Severity level={v.severity} />
                  </Td>
                  <Td className={`text-[12.5px] ${STATUS_TONE[v.status] ?? ''}`}>{v.status}</Td>
                  <Td>
                    <span className="rounded-[3px] border border-outline-variant px-1.5 py-0.5 font-mono text-[10px] text-on-variant">
                      {v.framework_control_id}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      </AsyncBoundary>
    </div>
    <SlideOver
      open={!!selectedVulnerability}
      onClose={() => {
        setSelectedVulnerability(null)
        setMappingRequested(false)
      }}
      eyebrow="Vulnerability overview"
      title={selectedVulnerability?.cve_id || `Finding ${selectedVulnerability?.vuln_id ?? ''}`}
    >
      {selectedVulnerability && (
        <>
          <div className="grid grid-cols-2 gap-2.5">
            {[
              ['CVSS', selectedVulnerability.cvss_score?.toFixed(1) ?? '—'],
              ['EPSS', selectedVulnerability.epss_score?.toFixed(3) ?? '—'],
              ['Severity', selectedVulnerability.severity ?? 'Unknown'],
              ['Status', selectedVulnerability.status ?? 'Unknown'],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-xs border border-outline-variant bg-surface-container p-3"
              >
                <p className="text-[11.5px] text-on-variant">{label}</p>
                <p className="mt-1 font-mono text-sm font-medium">{value}</p>
              </div>
            ))}
          </div>

          <div className="h-px bg-outline-variant" />
          <p className="text-[13px] font-medium">Finding context</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-[12.5px]">
            <dt className="text-on-variant">Asset</dt>
            <dd className="break-all font-mono">{selectedVulnerability.asset_id}</dd>
            <dt className="text-on-variant">Asset type</dt>
            <dd className="capitalize">{(selectedVulnerability.asset_type ?? '').replace(/_/g, ' ') || '—'}</dd>
            <dt className="text-on-variant">Business unit</dt>
            <dd>{selectedVulnerability.business_unit || '—'}</dd>
            <dt className="text-on-variant">Control</dt>
            <dd className="font-mono">{selectedVulnerability.framework_control_id || '—'}</dd>
          </dl>

          {selectedVulnerability.cve_id && (
            <>
              <div className="h-px bg-outline-variant" />
              <div className="flex items-center justify-between gap-3">
                <p className="text-[13px] font-medium">NVD CVE mapping</p>
                <a
                  href={`https://nvd.nist.gov/vuln/detail/${encodeURIComponent(selectedVulnerability.cve_id)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-accent underline underline-offset-2"
                >
                  Open NVD record
                </a>
              </div>
              {!mappingRequested ? (
                <button
                  className="self-start text-left text-xs text-accent underline underline-offset-2"
                  onClick={() => setMappingRequested(true)}
                >
                  Fetch CVE details from NVD
                </button>
              ) : cveDetails.loading ? (
                <div className="flex items-center gap-2 text-xs text-on-variant">
                  <Spinner /> Fetching authoritative details from NVD…
                </div>
              ) : cveDetails.error ? (
                <div className="flex flex-col gap-2">
                  <p role="alert" className="text-xs text-status-critical">{cveDetails.error}</p>
                  <button
                    className="self-start text-xs text-accent underline underline-offset-2"
                    onClick={cveDetails.refetch}
                  >
                    Try again
                  </button>
                </div>
              ) : cveDetails.data ? (
                <div className="flex flex-col gap-3">
                  <p className="text-[12.5px] leading-relaxed text-on-variant">
                    {cveDetails.data.description || 'No description is available in the NVD record.'}
                  </p>
                  {cveDetails.data.cvss && (
                    <div className="rounded-xs border border-outline-variant bg-surface-container p-3">
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <span>CVSS {cveDetails.data.cvss.version ?? ''}</span>
                        <span className="font-mono font-medium">
                          {cveDetails.data.cvss.score ?? '—'}
                          {cveDetails.data.cvss.severity ? ` · ${cveDetails.data.cvss.severity}` : ''}
                        </span>
                      </div>
                      {cveDetails.data.cvss.vector && (
                        <p className="mt-2 break-all font-mono text-[10px] text-on-variant">
                          {cveDetails.data.cvss.vector}
                        </p>
                      )}
                    </div>
                  )}
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-[11.5px]">
                    <dt className="text-on-variant">Published</dt>
                    <dd>{cveDetails.data.published ? new Date(cveDetails.data.published).toLocaleDateString() : '—'}</dd>
                    <dt className="text-on-variant">Last modified</dt>
                    <dd>{cveDetails.data.last_modified ? new Date(cveDetails.data.last_modified).toLocaleDateString() : '—'}</dd>
                    {cveDetails.data.weaknesses?.length > 0 && (
                      <>
                        <dt className="text-on-variant">Weaknesses</dt>
                        <dd>{cveDetails.data.weaknesses.join(', ')}</dd>
                      </>
                    )}
                  </dl>
                  {cveDetails.data.references?.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <p className="text-[11.5px] text-on-variant">References</p>
                      {cveDetails.data.references.slice(0, 5).map((reference) => (
                        <a
                          key={reference.url}
                          href={reference.url}
                          target="_blank"
                          rel="noreferrer"
                          className="break-all text-[11px] text-accent underline underline-offset-2"
                        >
                          {reference.source || reference.url}
                        </a>
                      ))}
                    </div>
                  )}
                  <p className="text-[10.5px] text-on-variant">
                    CVE data provided by the NIST National Vulnerability Database.
                  </p>
                </div>
              ) : null}
            </>
          )}
        </>
      )}
    </SlideOver>
    </>
  )
}

function Controls() {
  const controls = useApi(() => endpoints.controls(), [], {
    isEmpty: (d) => !d?.by_asset_type?.length,
  })
  const overall = controls.data?.overall

  return (
    <AsyncBoundary
      state={controls}
      loadingMessage="Loading control coverage…"
      emptyMessage="Control coverage data is not loaded. Run `python src/db_loader.py`."
      isEmpty={(d) => !d?.by_asset_type?.length}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <div className="grid flex-none grid-cols-2 gap-3 sm:grid-cols-4">
          {overall &&
            [
              ['MFA', overall.mfa],
              ['EDR', overall.edr],
              ['Backup', overall.backup],
              ['Effectiveness', overall.effectiveness],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-md border border-outline-variant bg-surface-container p-3.5"
              >
                <p className="font-mono text-[10px] uppercase tracking-widest text-on-variant">
                  {label}
                </p>
                <p className="mt-1.5 font-mono text-lg font-medium">
                  {(value * 100).toFixed(1)}%
                </p>
              </div>
            ))}
        </div>
        <div className="flex min-h-[220px] flex-1 flex-col">
          <CoverageBars data={controls.data?.by_asset_type ?? []} />
        </div>
      </div>
    </AsyncBoundary>
  )
}

function Assets() {
  const assets = useApi(() => endpoints.assets(8), [], {
    isEmpty: (d) => !d?.mix?.length,
  })
  const mix = assets.data?.mix ?? []
  const top = assets.data?.top ?? []
  const maxCount = Math.max(...mix.map((m) => m.count), 1)

  return (
    <AsyncBoundary
      state={assets}
      loadingMessage="Loading assets…"
      emptyMessage="No assets in the inventory."
      isEmpty={(d) => !d?.mix?.length}
    >
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <p className="font-mono text-[10px] uppercase tracking-widest text-on-variant">
            Asset mix
          </p>
          {mix.map((m) => (
            <div key={m.name} className="flex flex-col gap-1.5">
              <div className="flex justify-between gap-3 text-[13px]">
                <span className="truncate">{m.name}</span>
                <span className="flex-none font-mono text-on-variant">
                  {m.count.toLocaleString('en-IN')} · avg {compact(m.avgValue)}
                </span>
              </div>
              <span className="h-2 overflow-hidden rounded-full bg-surface-highest">
                <span
                  className="block h-full rounded-full bg-chart-1 transition-[width] duration-500"
                  style={{ width: `${(m.count / maxCount) * 100}%` }}
                />
              </span>
            </div>
          ))}
        </div>

        <div className="flex min-h-0 flex-col gap-2">
          <p className="font-mono text-[10px] uppercase tracking-widest text-on-variant">
            Highest exposure
          </p>
          <TableScroll className="min-h-0 flex-1 overflow-y-auto">
            <table className="w-full min-w-[420px] border-collapse text-sm">
              <thead className="sticky top-0 bg-surface-container">
                <tr className="text-left">
                  <Th>Asset</Th>
                  <Th>Unit</Th>
                  <Th className="text-right">EAL</Th>
                  <Th>Worst CVE</Th>
                </tr>
              </thead>
              <tbody>
                {top.map((a) => (
                  <tr key={a.asset_id} className="hover:bg-surface-high">
                    <Td className="font-mono text-[12.5px]">{a.asset_id}</Td>
                    <Td className="text-[12.5px] text-on-variant">{a.business_unit}</Td>
                    <Td className="text-right font-mono">{compact(a.eal_inr)}</Td>
                    <Td className="font-mono text-[11.5px]">
                      {a.cve_id ?? '—'}
                      {a.cvss_score != null && (
                        <span className="ml-1.5 text-on-variant">{a.cvss_score.toFixed(1)}</span>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </div>
      </div>
    </AsyncBoundary>
  )
}

function ComplianceTab() {
  const [framework, setFramework] = useState(null)
  const frameworks = useApi(() => endpoints.frameworks().then((r) => r.frameworks), [])
  const mappings = useApi(
    () => endpoints.complianceMappings(framework).then((r) => r.mappings),
    [framework],
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-none flex-wrap gap-1.5">
        <button
          onClick={() => setFramework(null)}
          aria-pressed={framework === null}
          className={`rounded-full border px-3 py-1 text-[11.5px] transition-colors ${
            framework === null
              ? 'border-accent bg-accent/10'
              : 'border-outline-variant text-on-variant hover:border-outline'
          }`}
        >
          All
        </button>
        {(frameworks.data ?? []).map((f) => (
          <button
            key={f.key}
            onClick={() => setFramework(f.key)}
            aria-pressed={framework === f.key}
            className={`rounded-full border px-3 py-1 text-[11.5px] transition-colors ${
              framework === f.key
                ? 'border-accent bg-accent/10'
                : 'border-outline-variant text-on-variant hover:border-outline'
            }`}
          >
            {f.name} <span className="font-mono">{f.covered}/{f.total}</span>
          </button>
        ))}
      </div>

      <AsyncBoundary
        state={mappings}
        loadingMessage="Loading mappings…"
        emptyMessage="No clauses mapped for this framework."
      >
        <TableScroll className="min-h-0 flex-1 overflow-y-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-surface-container">
              <tr className="text-left">
                <Th>Clause</Th>
                <Th>Objective</Th>
                <Th>Control</Th>
                <Th className="text-right">Open findings</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {(mappings.data ?? []).map((row) => (
                <tr key={row.clause} className="hover:bg-surface-high">
                  <Td className="font-mono text-[12px]">{row.clause}</Td>
                  <Td className="text-[12.5px]">{row.objective}</Td>
                  <Td className="text-[12.5px] text-on-variant">{row.control ?? '—'}</Td>
                  <Td className="text-right font-mono text-on-variant">
                    {row.openFindings.toLocaleString('en-IN')}
                  </Td>
                  <Td>
                    <span
                      className={`inline-flex items-center gap-1.5 text-[12.5px] ${
                        row.status === 'Covered'
                          ? 'text-status-low'
                          : row.status === 'Not funded'
                            ? 'text-status-medium'
                            : 'text-status-critical'
                      }`}
                    >
                      <span
                        className={`h-2 w-2 flex-none rounded-full ${
                          row.status === 'Covered'
                            ? 'bg-status-low'
                            : row.status === 'Not funded'
                              ? 'bg-status-medium'
                              : 'bg-status-critical'
                        }`}
                      />
                      {row.status}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      </AsyncBoundary>
    </div>
  )
}

export default function TechnicalAudit() {
  const [tab, setTab] = useState(TABS[0])

  // Export uses the backend's own report generator — the Python renderer is
  // the source of truth for what a generated report says.
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

  return (
    <AppLayout
      title="Technical Security & Audit Portal"
      subtitle="Vulnerabilities, controls, assets and framework coverage"
      actions={
        <Button
          variant="outline"
          size="sm"
          disabled={exportReport.pending}
          onClick={() => exportReport.run('pdf')}
        >
          {exportReport.pending ? <Spinner /> : <Icon name="download" style={{ fontSize: 16 }} />}
          <span className="hidden sm:inline">
            {exportReport.pending ? 'Generating…' : 'Export report'}
          </span>
        </Button>
      }
    >
      <div className="flex h-full min-h-0 flex-col gap-4">
        {exportReport.error && (
          <p className="flex-none rounded-xs border border-status-critical/40 bg-status-critical/5 px-3 py-2 text-xs text-on-variant">
            {exportReport.error}
          </p>
        )}

        <Panel
          title={tab}
          actions={
            <div className="flex flex-wrap justify-end gap-1">
              {TABS.map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  aria-pressed={tab === t}
                  className={`rounded-full px-3 py-1 text-[12px] transition-colors ${
                    tab === t
                      ? 'bg-surface-high text-on-surface'
                      : 'text-on-variant hover:text-on-surface'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          }
          className="min-h-0 flex-1"
        >
          {tab === 'Vulnerabilities' && <Vulnerabilities />}
          {tab === 'Controls' && <Controls />}
          {tab === 'Assets' && <Assets />}
          {tab === 'Compliance' && <ComplianceTab />}
        </Panel>
      </div>
    </AppLayout>
  )
}
