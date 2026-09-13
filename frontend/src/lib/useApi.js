import { useCallback, useEffect, useRef, useState } from 'react'
import { describeError } from './apiClient'

/**
 * Every backend-backed view needs the same four states — loading, success,
 * empty and error — so they live here rather than being re-implemented per
 * screen (docs/frontend-backend-integration.md, Request State Rules).
 *
 * `fallback` is the documented demo constant to fall back on when the API is
 * unreachable. When it is used, `source` becomes 'fallback' so the UI can say
 * so out loud instead of passing stale numbers off as live ones.
 */
export function useApi(fetcher, deps = [], { fallback, enabled = true, isEmpty } = {}) {
  const [state, setState] = useState({
    data: undefined,
    loading: enabled,
    error: null,
    source: null,
  })
  const alive = useRef(true)
  const fetcherRef = useRef(fetcher)

  // Assigned in an effect, not during render, and declared before the effect
  // that calls load() so the ref is always current by the time it runs.
  useEffect(() => {
    fetcherRef.current = fetcher
  })

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const load = useCallback(async () => {
    if (!enabled) return
    setState((prev) => ({ ...prev, loading: true, error: null }))
    try {
      const data = await fetcherRef.current()
      if (!alive.current) return
      setState({ data, loading: false, error: null, source: 'api' })
    } catch (error) {
      if (!alive.current) return
      setState({
        data: fallback,
        loading: false,
        error: describeError(error),
        source: fallback === undefined ? null : 'fallback',
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps])

  useEffect(() => {
    load()
  }, [load])

  const empty =
    !state.loading &&
    state.data !== undefined &&
    (isEmpty ? isEmpty(state.data) : Array.isArray(state.data) && state.data.length === 0)

  return { ...state, empty, refetch: load }
}

/**
 * One-shot actions (submit a question, run an optimisation, export a report).
 * `pending` gates the trigger so a second submit cannot fire while the first
 * is still in flight.
 */
export function useAction(action) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(null)
  const actionRef = useRef(action)

  useEffect(() => {
    actionRef.current = action
  })

  const run = useCallback(async (...args) => {
    setPending(true)
    setError(null)
    try {
      const result = await actionRef.current(...args)
      setPending(false)
      return { ok: true, result }
    } catch (caught) {
      const message = describeError(caught)
      setPending(false)
      setError(message)
      return { ok: false, error: message }
    }
  }, [])

  return { run, pending, error, clearError: () => setError(null) }
}
