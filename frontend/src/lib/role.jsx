import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { endpoints, readToken, writeToken } from './apiClient'

const SESSION_KEY = 'riskyn-session'
const HOME = { executive: '/app/executive', secops: '/app/technical' }

const AuthContext = createContext(null)

const readSession = () => {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed?.role === 'executive' || parsed?.role === 'secops' ? parsed : null
  } catch {
    return null
  }
}

const writeSession = (session) => {
  try {
    if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
    else sessionStorage.removeItem(SESSION_KEY)
  } catch {
    // storage unavailable (private window) — the session still holds in memory
  }
}

/**
 * Session state for the app shell. The role comes from the backend's token
 * response rather than being chosen client-side, and signing out clears both
 * the token and the cached session.
 */
export function RoleProvider({ children }) {
  const [session, setSession] = useState(() => (readToken() ? readSession() : null))

  const adopt = useCallback((response) => {
    const next = {
      role: response.role,
      username: response.username,
      displayName: response.display_name || response.username,
    }
    writeToken(response.access_token)
    writeSession(next)
    setSession(next)
    return next
  }, [])

  const signIn = useCallback(
    async (username, password) => adopt(await endpoints.login(username, password)),
    [adopt],
  )

  const signUp = useCallback(
    async (body) => adopt(await endpoints.signup(body)),
    [adopt],
  )

  const signOut = useCallback(() => {
    writeToken(null)
    writeSession(null)
    setSession(null)
  }, [])

  const value = useMemo(
    () => ({
      session,
      role: session?.role ?? null,
      user: session,
      signIn,
      signUp,
      signOut,
    }),
    [session, signIn, signUp, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useRole = () => useContext(AuthContext) ?? { role: null }
export const roleHome = (role) => HOME[role] || '/login'

/** Wraps a route that any signed-in role may open. */
export function RequireSession({ children }) {
  const { role } = useRole()
  if (!role) return <Navigate to="/login" replace />
  return children
}

/** Wraps a route: no session → /login; wrong role → redirect to that role's home. */
export function RequireRole({ role: required, children }) {
  const { role } = useRole()
  if (!role) return <Navigate to="/login" replace />
  if (role !== required) return <Navigate to={roleHome(role)} replace />
  return children
}
