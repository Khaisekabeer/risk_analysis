import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, Field, Icon, Input, Spinner, ThemeToggle } from '../components/ui'
import { describeError } from '../lib/apiClient'
import { useRole, roleHome } from '../lib/role'

export default function Login() {
  const navigate = useNavigate()
  const { signIn } = useRole()
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  const onSubmit = async (e) => {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const username = String(form.get('username') || '').trim()
    const password = String(form.get('password') || '')
    if (!username || !password) {
      setError('Enter both a username and a password.')
      return
    }
    setPending(true)
    setError('')
    try {
      const session = await signIn(username, password)
      navigate(roleHome(session.role), { replace: true })
    } catch (caught) {
      setError(describeError(caught))
      setPending(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-surface px-6">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(620px 420px at 22% 18%, rgba(50,121,249,.10), transparent 70%), radial-gradient(520px 380px at 82% 78%, rgba(27,175,122,.07), transparent 70%)',
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[.35]"
        style={{
          backgroundImage:
            'linear-gradient(var(--theme-outline-variant) 1px, transparent 1px), linear-gradient(90deg, var(--theme-outline-variant) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      <div className="absolute right-6 top-6">
        <ThemeToggle />
      </div>

      <form
        onSubmit={onSubmit}
        className="relative w-full max-w-[388px] rounded-md border border-outline-variant bg-surface-container p-7 shadow-panel"
      >
        <Link to="/" className="mb-6 inline-flex items-center gap-1.5 text-[17px] font-medium">
          <Icon name="shield" className="text-accent" style={{ fontSize: 19 }} />
          Riskyn
        </Link>

        <h1 className="mb-6 text-[17px] font-medium">Sign in</h1>

        <div className="flex flex-col gap-4">
          <Field label="Username">
            <Input name="username" autoComplete="username" autoFocus />
          </Field>
          <Field label="Password" error={error}>
            <Input
              name="password"
              type="password"
              autoComplete="current-password"
              invalid={!!error}
            />
          </Field>
          <Button type="submit" variant="primary" size="lg" className="w-full" disabled={pending}>
            {pending ? <Spinner /> : null}
            {pending ? 'Signing in…' : 'Sign in'}
          </Button>
        </div>

        <p className="mt-5 border-t border-outline-variant pt-3.5 text-center text-xs text-on-variant">
          No account yet?{' '}
          <Link to="/signup" className="text-accent">
            Create one
          </Link>
        </p>
      </form>
    </div>
  )
}
