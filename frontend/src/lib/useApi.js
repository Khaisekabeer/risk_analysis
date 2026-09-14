import { useCallback, useEffect, useRef, useState } from 'react'
import { describeError } from './apiClient'

/**
 * Every backend-backed view needs the same four states — loading, success,
 * empty and error — so they live here rather than being re-implemented per
 * screen (docs/frontend-backend-integration.md, Request State Rules).
 *
 * There is deliberately no fallback data: when a request fails the view shows
 * the error and offers a retry. Substituting stand-in figures used to hide
 * genuine integration faults behind numbers that looked live, which is the
 * one failure mode this layer must never produce.
 */
export function useApi(fetcher, deps = [], { enabled = true, isEmpty } = {}) {
  const [state, setState] = useState({
    data: undefined,
    loading: enabled,
    error: null,
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
      setState({ data, loading: false, error: null })
    } catch (error) {
      if (!alive.current) return
      // The previous payload is dropped too: a stale success next to a live
      // error reads as though the screen is still current.
      setState({ data: undefined, loading: false, error: describeError(error) })
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
