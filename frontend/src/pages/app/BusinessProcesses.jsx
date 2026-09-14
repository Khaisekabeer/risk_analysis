import { useState } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import AppLayout from '../../components/app/AppLayout'
import {
  AsyncBoundary,
  Button,
  Chip,
  Field,
  Icon,
  Input,
  Panel,
  Spinner,
} from '../../components/ui'
import { formatINR } from '../../lib/formatINR'
import { endpoints } from '../../lib/apiClient'
import { useApi, useAction } from '../../lib/useApi'

const LEVELS = ['High', 'Medium', 'Low']

function LevelPicker({ value, onChange }) {
  return (
    <div className="flex">
      {LEVELS.map((lvl, i) => (
        <button
          key={lvl}
          type="button"
          onClick={() => onChange(lvl)}
          className={`h-8 border px-2.5 text-xs transition-colors ${
            i === 0 ? 'rounded-l-xs' : ''
          } ${i === LEVELS.length - 1 ? 'rounded-r-xs' : ''} ${
            value === lvl
              ? 'border-accent bg-accent/15 font-medium text-on-surface'
              : 'border-outline-variant text-on-variant hover:bg-surface-high'
          }`}
        >
          {lvl === 'Medium' ? 'Med' : lvl}
        </button>
      ))}
    </div>
  )
}

export default function BusinessProcesses() {
  const { register, control, handleSubmit, watch, setValue, formState } = useForm({
    // An empty form: the operator describes their own process. The worked
    // "Payments Gateway" example that used to sit here read as saved data.
    defaultValues: {
      name: '',
      assetCriticality: '',
      description: '',
      activities: [{ name: '', avlReq: 'Medium' }],
      informationItems: [{ name: '', confReq: 'Medium', intReq: 'Medium' }],
    },
  })

  const activities = useFieldArray({ control, name: 'activities' })
  const infoItems = useFieldArray({ control, name: 'informationItems' })
  const values = watch()

  const [saved, setSaved] = useState(null)
  const create = useAction((payload) => endpoints.createBusinessProcess(payload))

  // GET /api/v1/business-processes — what has actually been persisted. Without
  // this the page was write-only: a saved process vanished on the next render.
  const existing = useApi(() => endpoints.businessProcesses(50).then((r) => r.processes), [])

  const onSubmit = async (data) => {
    const outcome = await create.run({
      name: data.name,
      description: data.description || null,
      asset_criticality_inr: Number(data.assetCriticality) || 0,
      activities: (data.activities ?? []).map((a) => ({ name: a.name, avl_req: a.avlReq })),
      information_items: (data.informationItems ?? []).map((it) => ({
        name: it.name,
        conf_req: it.confReq,
        int_req: it.intReq,
      })),
    })
    setSaved(outcome.ok ? outcome.result : null)
    if (outcome.ok) existing.refetch()
  }

  return (
    <AppLayout
      title="Business Processes"
      subtitle="Define activities, information items and security requirements"
      actions={<Chip>{saved ? `Saved · id ${saved.id}` : 'Draft · not saved'}</Chip>}
    >
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="grid h-full min-h-0 auto-rows-fr grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_330px]"
      >
        <Panel
          title="New business process"
          actions={<Chip>POST /business-process</Chip>}
          className="min-h-[320px]"
          bodyClassName="overflow-auto p-5"
        >
          <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-on-variant">
            Identity
          </p>
          <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Name" error={formState.errors.name?.message}>
              <Input
                {...register('name', { required: 'Name is required' })}
                invalid={!!formState.errors.name}
              />
            </Field>
            <Field label="Asset criticality (₹)" error={formState.errors.assetCriticality?.message}>
              <Input
                type="number"
                {...register('assetCriticality', {
                  required: 'Required',
                  min: { value: 1, message: 'Must be greater than zero' },
                  valueAsNumber: true,
                })}
                invalid={!!formState.errors.assetCriticality}
              />
            </Field>
          </div>

          <Field label="Description">
            <textarea
              {...register('description')}
              rows={2}
              placeholder="Card and UPI settlement path, including the reconciliation batch."
              className="rounded-xs border border-outline bg-surface px-3 py-2 text-sm outline-none transition-colors placeholder:text-on-variant/60 focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
          </Field>

          <div className="mb-3 mt-6 flex items-center justify-between">
            <p className="font-mono text-[10px] uppercase tracking-widest text-on-variant">
              Activities — availability requirement
            </p>
            <Chip>{activities.fields.length} activities</Chip>
          </div>
          {activities.fields.map((f, i) => (
            <div
              key={f.id}
              className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 border-b border-outline-variant py-2"
            >
              <Input {...register(`activities.${i}.name`, { required: true })} />
              <LevelPicker
                value={values.activities?.[i]?.avlReq}
                onChange={(v) => setValue(`activities.${i}.avlReq`, v)}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-8 px-0"
                aria-label="Remove activity"
                onClick={() => activities.remove(i)}
              >
                <Icon name="delete" style={{ fontSize: 16 }} />
              </Button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => activities.append({ name: '', avlReq: 'Medium' })}
            className="flex items-center gap-1.5 py-2.5 text-sm text-accent"
          >
            <Icon name="add" style={{ fontSize: 16 }} />
            Add activity
          </button>

          <div className="mb-3 mt-4 flex items-center justify-between">
            <p className="font-mono text-[10px] uppercase tracking-widest text-on-variant">
              Information items — confidentiality / integrity
            </p>
            <Chip>{infoItems.fields.length} items</Chip>
          </div>
          {infoItems.fields.map((f, i) => (
            <div
              key={f.id}
              className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-3 border-b border-outline-variant py-2"
            >
              <Input
                {...register(`informationItems.${i}.name`, { required: 'This field cannot be empty' })}
                invalid={!!formState.errors.informationItems?.[i]?.name}
              />
              <LevelPicker
                value={values.informationItems?.[i]?.confReq}
                onChange={(v) => setValue(`informationItems.${i}.confReq`, v)}
              />
              <LevelPicker
                value={values.informationItems?.[i]?.intReq}
                onChange={(v) => setValue(`informationItems.${i}.intReq`, v)}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-8 px-0"
                aria-label="Remove item"
                onClick={() => infoItems.remove(i)}
              >
                <Icon name="delete" style={{ fontSize: 16 }} />
              </Button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => infoItems.append({ name: '', confReq: 'Medium', intReq: 'Medium' })}
            className="flex items-center gap-1.5 py-2.5 text-sm text-accent"
          >
            <Icon name="add" style={{ fontSize: 16 }} />
            Add information item
          </button>
        </Panel>

        <div className="flex min-h-0 flex-col gap-4">
          <Panel title="Request body" className="flex-none" bodyClassName="p-4">
            <pre className="max-h-64 overflow-auto font-mono text-[11px] leading-relaxed text-on-variant">
              {JSON.stringify(
                {
                  name: values.name,
                  asset_criticality_inr: values.assetCriticality,
                  activities: values.activities?.map((a) => ({
                    name: a.name,
                    avl_req: a.avlReq,
                  })),
                  information_items: values.informationItems?.map((it) => ({
                    name: it.name,
                    conf_req: it.confReq,
                    int_req: it.intReq,
                  })),
                },
                null,
                2
              )}
            </pre>
          </Panel>

          <Panel
            title="Saved processes"
            actions={<Chip>{(existing.data ?? []).length} stored</Chip>}
            className="min-h-[160px] flex-1"
            bodyClassName="gap-2 overflow-y-auto"
          >
            <AsyncBoundary
              state={existing}
              loadingMessage="Loading saved processes…"
              emptyMessage="No business process has been saved yet."
            >
              {(existing.data ?? []).map((p) => (
                <div
                  key={p.id}
                  className="rounded-xs border border-outline-variant px-3 py-2.5 text-[12.5px]"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate font-medium">{p.name}</span>
                    <span className="flex-none font-mono text-[11px] text-on-variant">
                      {formatINR(p.asset_criticality_inr, { compact: true })}
                    </span>
                  </div>
                  <p className="mt-1 font-mono text-[11px] text-on-variant">
                    {p.activities.length} activities · {p.information_items.length} information
                    items
                  </p>
                </div>
              ))}
            </AsyncBoundary>
          </Panel>

          {create.error && (
            <p className="flex-none rounded-xs border border-status-critical/40 bg-status-critical/5 px-3 py-2 text-xs text-on-variant">
              {create.error}
            </p>
          )}
          {saved && (
            <p
              role="status"
              className="flex-none rounded-xs border border-status-low/40 bg-status-low/5 px-3 py-2 text-xs leading-relaxed text-on-variant"
            >
              <span className="font-medium text-on-surface">{saved.name}</span> saved as process{' '}
              {saved.id} — {saved.activities} activities, {saved.information_items} information
              items.
            </p>
          )}

          <div className="flex flex-none gap-2.5">
            <Button
              type="button"
              variant="tonal"
              className="flex-1"
              onClick={() => {
                setSaved(null)
                create.clearError()
              }}
            >
              Clear
            </Button>
            <Button
              type="submit"
              variant="primary"
              className="flex-1"
              disabled={create.pending}
            >
              {create.pending ? <Spinner /> : null}
              {create.pending ? 'Saving…' : 'Create process'}
            </Button>
          </div>
        </div>
      </form>
    </AppLayout>
  )
}
