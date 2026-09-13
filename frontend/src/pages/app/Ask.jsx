import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import AppLayout from '../../components/app/AppLayout'
import { Button, Icon, Panel, ProgressBar, Spinner, TableScroll } from '../../components/ui'
import { formatINR } from '../../lib/formatINR'
import { endpoints, describeError } from '../../lib/apiClient'
import { useApi, useAction } from '../../lib/useApi'

const FALLBACK_PROMPTS = [
  'What is our total financial exposure?',
  'Which business units carry the most risk?',
  'What should we fund with a budget of 80 lakh?',
  'How many critical vulnerabilities are still open?',
]

const MONEY_KEYS = /(_inr|^eal$|^cost$|^reduction$)/i

function formatCell(key, value) {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'number') {
    if (MONEY_KEYS.test(key)) return formatINR(value, { compact: true })
    if (Number.isInteger(value)) return value.toLocaleString('en-IN')
    return value.toFixed(3)
  }
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

/**
 * The raw rows the engine returned, shown next to the prose. The answer text
 * is only ever a description of this table -- the numbers are never hidden
 * behind the sentence.
 */
function SourceData({ rows }) {
  if (!rows?.length) return null
  const columns = Object.keys(rows[0]).slice(0, 7)
  return (
    <div className="rounded-md border border-outline-variant bg-surface-container">
      <p className="border-b border-outline-variant px-4 py-2 text-xs text-on-variant">
        Source data · {rows.length} row{rows.length === 1 ? '' : 's'} from the engine
      </p>
      <TableScroll>
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="text-left font-mono text-[10px] uppercase tracking-wider text-on-variant">
              {columns.map((col) => (
                <th key={col} className="whitespace-nowrap px-4 py-2">
                  {col.replace(/_/g, ' ')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 10).map((row, i) => (
              <tr key={i} className="border-t border-outline-variant">
                {columns.map((col) => (
                  <td key={col} className="whitespace-nowrap px-4 py-2 font-mono">
                    {formatCell(col, row[col])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
      {rows.length > 10 && (
        <p className="border-t border-outline-variant px-4 py-2 text-[11px] text-on-variant">
          Showing the first 10 of {rows.length} rows.
        </p>
      )}
    </div>
  )
}

export default function Ask() {
  const [composerOpen, setComposerOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState([])
  const [attachments, setAttachments] = useState([])
  const [uploads, setUploads] = useState([]) // in-flight, with progress
  const fileInput = useRef(null)

  const suggestions = useApi(() => endpoints.suggestions().then((r) => r.suggestions), [], {
    fallback: FALLBACK_PROMPTS,
  })

  const ask = useAction((question, files) => endpoints.ask(question, files))

  const send = async (text) => {
    const question = (text ?? draft).trim()
    if (!question || ask.pending) return

    const sent = attachments
    setMessages((m) => [...m, { role: 'user', text: question, files: sent }])
    setDraft('')

    const outcome = await ask.run(question, sent)
    if (outcome.ok) {
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          text: outcome.result.answer,
          rows: outcome.result.source_data,
          tool: outcome.result.tool_used,
        },
      ])
      setAttachments([])
    } else {
      // A failed request must not clear the conversation -- the question stays
      // on screen with the error attached so it can be retried.
      setMessages((m) => [...m, { role: 'error', text: outcome.error, question }])
    }
  }

  const upload = async (file) => {
    const id = `${file.name}-${Date.now()}`
    setUploads((u) => [...u, { id, name: file.name, progress: 0, error: null }])
    try {
      const result = await endpoints.upload(file, (progress) =>
        setUploads((u) => u.map((x) => (x.id === id ? { ...x, progress } : x))),
      )
      // Only now, with the backend's confirmation in hand, does the file count
      // as accepted.
      setUploads((u) => u.filter((x) => x.id !== id))
      setAttachments((a) => [
        ...a,
        {
          filename: result.filename,
          records_seen: result.records_seen,
          records_accepted: result.records_accepted,
          recognised_fields: result.recognised_fields,
          matched_known_assets: result.matched_known_assets,
          validation_errors: result.validation_errors,
        },
      ])
    } catch (error) {
      setUploads((u) =>
        u.map((x) => (x.id === id ? { ...x, progress: null, error: describeError(error) } : x)),
      )
    }
  }

  const onPick = (event) => {
    const files = Array.from(event.target.files ?? [])
    files.forEach(upload)
    event.target.value = ''
  }

  const prompts = suggestions.data ?? FALLBACK_PROMPTS
  const busy = ask.pending

  const attachmentChips = (
    <>
      {attachments.map((a) => (
        <span
          key={a.filename}
          className="inline-flex items-center gap-2 rounded-sm border border-outline-variant bg-surface px-2.5 py-2 font-mono text-xs"
        >
          <Icon name="description" style={{ fontSize: 14 }} className="text-accent" />
          {a.filename}
          <span className="text-on-variant">
            {a.records_accepted}/{a.records_seen} rows
          </span>
          <button
            onClick={() => setAttachments((list) => list.filter((x) => x.filename !== a.filename))}
            aria-label={`Remove ${a.filename}`}
            className="text-on-variant hover:text-status-critical"
          >
            <Icon name="close" style={{ fontSize: 14 }} />
          </button>
        </span>
      ))}
      {uploads.map((u) => (
        <span
          key={u.id}
          className="inline-flex min-w-[180px] flex-col gap-1 rounded-sm border border-outline-variant bg-surface px-2.5 py-2 font-mono text-xs"
        >
          <span className="truncate">{u.name}</span>
          {u.error ? (
            <span className="flex items-center gap-2 text-[11px] text-status-critical">
              {u.error}
              <button
                onClick={() => setUploads((list) => list.filter((x) => x.id !== u.id))}
                className="underline"
              >
                dismiss
              </button>
            </span>
          ) : (
            <ProgressBar
              value={u.progress}
              label={u.progress === 100 ? 'Processing…' : `Uploading ${u.progress ?? 0}%`}
            />
          )}
        </span>
      ))}
    </>
  )

  return (
    <AppLayout title="Ask Riskyn" subtitle="Every answer is routed to a real engine function">
      <input
        ref={fileInput}
        type="file"
        accept=".csv,.json"
        multiple
        onChange={onPick}
        className="hidden"
      />

      <div className="flex h-full min-h-0 flex-col gap-4">
        {messages.length === 0 ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 px-4 py-10 sm:px-6">
            <div className="text-center">
              <h2 className="font-display text-[26px] font-medium tracking-tight sm:text-[32px]">
                What do you want to know?
              </h2>
              <p className="mt-2 text-sm text-on-variant">
                Answers come from the risk engine, with the underlying rows attached.
              </p>
            </div>

            <div
              className={`flex w-full max-w-[660px] flex-col gap-2.5 rounded-md border bg-surface-container p-3.5 transition-all ${
                composerOpen ? 'border-accent shadow-panel' : 'border-outline-variant'
              }`}
              style={{ minHeight: composerOpen ? 188 : 104 }}
            >
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onFocus={() => setComposerOpen(true)}
                onKeyDown={(e) => e.key === 'Enter' && send()}
                placeholder="Ask about exposure, controls, or a CVE"
                className="bg-transparent px-0.5 py-1 text-[15px] outline-none placeholder:text-on-variant/60"
              />
              <div className="mt-auto flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => fileInput.current?.click()}
                    className="flex items-center gap-1.5 rounded-full border border-outline-variant bg-surface px-3 py-1.5 text-[12.5px] transition-colors hover:border-accent"
                  >
                    <Icon name="attach_file" style={{ fontSize: 16 }} />
                    Insert file
                  </button>
                  <span className="text-[11.5px] text-on-variant">CSV or JSON scan export</span>
                </div>
                <button
                  onClick={() => send()}
                  disabled={busy || !draft.trim()}
                  className="grid h-8 w-8 place-items-center rounded-full bg-accent text-white disabled:opacity-40"
                  aria-label="Send"
                >
                  {busy ? <Spinner /> : <Icon name="arrow_upward" style={{ fontSize: 16 }} />}
                </button>
              </div>
              {(composerOpen || attachments.length > 0 || uploads.length > 0) && (
                <div
                  className="flex flex-wrap gap-2 border-t border-outline-variant pt-2.5"
                  style={{ animation: 'rk-in .2s ease' }}
                >
                  {attachments.length === 0 && uploads.length === 0 ? (
                    <span className="inline-flex items-center rounded-sm border border-dashed border-outline-variant px-2.5 py-2 text-xs text-on-variant">
                      No file attached
                    </span>
                  ) : (
                    attachmentChips
                  )}
                </div>
              )}
            </div>

            <div className="flex max-w-[720px] flex-wrap justify-center gap-2">
              {prompts.map((p) => (
                <button
                  key={p}
                  onClick={() => send(p)}
                  disabled={busy}
                  className="rounded-full border border-outline-variant bg-surface-container px-3.5 py-2 text-[12.5px] transition-colors hover:border-accent disabled:opacity-50"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <Panel
            title="Ask Riskyn"
            actions={
              <span className="text-xs text-on-variant">
                {messages.filter((m) => m.role === 'user').length} question
                {messages.filter((m) => m.role === 'user').length === 1 ? '' : 's'}
              </span>
            }
            bodyClassName="p-0"
            className="min-h-0 flex-1"
          >
            <div className="mx-auto flex w-full max-w-[820px] flex-1 flex-col gap-5 overflow-y-auto p-4 sm:p-6">
              {messages.map((m, i) => {
                if (m.role === 'user') {
                  return (
                    <div key={i} className="flex flex-col items-end gap-1.5">
                      <div className="max-w-[85%] rounded-[16px_16px_4px_16px] bg-accent px-3.5 py-3 text-sm text-white sm:max-w-[70%]">
                        {m.text}
                      </div>
                      {m.files?.length > 0 && (
                        <span className="font-mono text-[11px] text-on-variant">
                          {m.files.map((f) => f.filename).join(', ')}
                        </span>
                      )}
                    </div>
                  )
                }
                if (m.role === 'error') {
                  return (
                    <div
                      key={i}
                      className="flex items-start gap-2.5 rounded-md border border-status-critical/40 bg-status-critical/5 p-3.5"
                      role="alert"
                    >
                      <Icon
                        name="error"
                        className="mt-0.5 flex-none text-status-critical"
                        style={{ fontSize: 18 }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm">{m.text}</p>
                        <button
                          onClick={() => send(m.question)}
                          className="mt-1.5 text-xs font-medium text-accent hover:underline"
                        >
                          Retry this question
                        </button>
                      </div>
                    </div>
                  )
                }
                return (
                  <div key={i} className="flex gap-3">
                    <Icon
                      name="shield"
                      className="mt-0.5 flex-none text-accent"
                      style={{ fontSize: 22 }}
                    />
                    <div className="flex min-w-0 flex-1 flex-col gap-3.5">
                      <p className="text-sm leading-relaxed">{m.text}</p>
                      <SourceData rows={m.rows} />
                      <div className="flex flex-wrap items-center gap-2">
                        {m.tool && (
                          <span className="rounded-full border border-outline-variant px-3 py-1.5 font-mono text-[11px] text-on-variant">
                            {m.tool}()
                          </span>
                        )}
                        <Button as={Link} to="/app/optimizer" size="sm" variant="outline">
                          Open in optimizer
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })}

              {busy && (
                <div className="flex items-center gap-3 text-sm text-on-variant">
                  <Spinner className="text-accent" />
                  Routing the question to the engine…
                </div>
              )}
            </div>

            <div className="flex-none border-t border-outline-variant p-4">
              {(attachments.length > 0 || uploads.length > 0) && (
                <div className="mb-2.5 flex flex-wrap gap-2">{attachmentChips}</div>
              )}
              <form
                className="flex items-center gap-2.5"
                onSubmit={(e) => {
                  e.preventDefault()
                  send()
                }}
              >
                <Button
                  type="button"
                  variant="outline"
                  className="w-9 flex-none px-0"
                  aria-label="Attach a file"
                  onClick={() => fileInput.current?.click()}
                >
                  <Icon name="attach_file" style={{ fontSize: 17 }} />
                </Button>
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Ask about exposure, controls, or a CVE"
                  className="h-9 min-w-0 flex-1 rounded-xs border border-outline bg-surface px-3 text-sm outline-none focus:border-accent"
                />
                <Button
                  type="submit"
                  variant="blue"
                  className="w-9 flex-none px-0"
                  aria-label="Send"
                  disabled={busy || !draft.trim()}
                >
                  {busy ? <Spinner /> : <Icon name="arrow_upward" style={{ fontSize: 18 }} />}
                </Button>
              </form>
            </div>
          </Panel>
        )}
      </div>
    </AppLayout>
  )
}
