import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, Field, Icon, Input, Spinner, ThemeToggle } from '../components/ui'
import { describeError } from '../lib/apiClient'
import { useRole, roleHome } from '../lib/role'

const ROLES = [
  {
    id: 'executive',
    label: 'Leadership',
    desc: 'See what risk costs the business and where the next rupee should go',
  },
  {
    id: 'secops',
    label: 'Security team',
    desc: 'Work the vulnerabilities, controls and fixes directly',
  },
]

export default function Signup() {
  const navigate = useNavigate()
  const { signUp } = useRole()
  const [picked, setPicked] = useState('executive')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  const onSubmit = async (e) => {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const username = String(form.get('username') || '').trim()
    const password = String(form.get('password') || '')
    const displayName = String(form.get('display_name') || '').trim()

    if (username.length < 3) {
      setError('Pick a username of at least 3 characters.')
      return
    }
    if (password.length < 8) {
      setError('Use a password of at least 8 characters.')
      return
    }

    setPending(true)
    setError('')
    try {
      const session = await signUp({
        username,
        password,
        role: picked,
        display_name: displayName || username,
      })
      navigate(roleHome(session.role), { replace: true })
    } catch (caught) {
      setError(describeError(caught))
      setPending(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-surface px-6 py-10">
      <div className="absolute right-6 top-6">
        <ThemeToggle />
      </div>

      {/* Lifted slightly above centre so the panel sits on the optical middle. */}
      <div className="grid w-full max-w-[900px] -translate-y-3 overflow-hidden rounded-md border border-outline-variant bg-surface-container shadow-panel md:grid-cols-[1.05fr_1fr]">
        <form
          onSubmit={onSubmit}
          className="flex flex-col justify-center gap-6 border-b border-outline-variant p-8 md:border-b-0 md:border-r"
        >
          <Link to="/" className="inline-flex items-center gap-1.5 text-[17px] font-medium">
            <Icon name="shield" className="text-accent" style={{ fontSize: 19 }} />
            Riskyn
          </Link>
          <div>
            <h1 className="text-2xl font-medium leading-tight">Create your Riskyn account</h1>
            <p className="mt-1.5 max-w-[40ch] text-sm text-on-variant">
              Your role decides the workspace you land in after every sign-in.
            </p>
          </div>

          <div className="flex flex-col gap-3.5">
            <Field label="Username">
              <Input name="username" autoComplete="username" autoFocus />
            </Field>
            <Field label="Display name" hint="Optional — shown in the top bar.">
              <Input name="display_name" autoComplete="name" />
            </Field>
            <Field label="Password" error={error} hint="At least 8 characters.">
              <Input
                name="password"
                type="password"
                autoComplete="new-password"
                invalid={!!error}
              />
            </Field>
          </div>

          <Button type="submit" variant="primary" size="lg" disabled={pending}>
            {pending ? <Spinner /> : null}
            {pending ? 'Creating…' : 'Create account'}
          </Button>

          <p className="border-t border-outline-variant pt-3.5 text-center text-xs text-on-variant">
            Already have an account?{' '}
            <Link to="/login" className="text-accent">
              Sign in
            </Link>
          </p>
        </form>

        <div className="flex flex-col justify-center gap-3.5 p-8">
          <p className="font-mono text-[10px] uppercase tracking-widest text-on-variant">
            Choose your workspace
          </p>
          {ROLES.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setPicked(r.id)}
              aria-pressed={picked === r.id}
              className={`flex flex-col gap-1.5 rounded-md border p-4 text-left transition-colors ${
                picked === r.id
                  ? 'border-accent bg-accent/5'
                  : 'border-outline-variant hover:border-outline'
              }`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-[15px] font-medium">{r.label}</span>
                {picked === r.id && (
                  <Icon name="check_circle" className="text-accent" style={{ fontSize: 18 }} />
                )}
              </span>
              <span className="text-[12.5px] leading-relaxed text-on-variant">{r.desc}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
