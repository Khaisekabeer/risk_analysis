import axios from 'axios'

/**
 * Single place the frontend talks to the Python service.
 *
 * The base URL is configurable (VITE_API_BASE_URL) with the local backend as
 * the default. No credential or vendor token is ever held in browser code —
 * the only thing stored client-side is the session token the backend issues
 * at login.
 */
const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

export const TOKEN_KEY = 'riskyn-token'

export const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
})

export const readToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export const writeToken = (token) => {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // storage unavailable (private window) — the session still works in memory
  }
}

api.interceptors.request.use((config) => {
  const token = readToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

/** Turn any axios failure into a short sentence a user can act on. */
export function describeError(error) {
  if (!error) return 'Something went wrong.'
  if (error.code === 'ECONNABORTED') return 'The backend took too long to respond.'
  const status = error.response?.status
  const detail = error.response?.data?.detail

  if (!error.response) {
    return `Cannot reach the backend at ${BASE_URL}. Start it with \`uvicorn src.api:app --port 8000\`.`
  }
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail) && detail.length) {
    const first = detail[0]
    return `${(first.loc || []).slice(1).join('.') || 'Request'}: ${first.msg}`
  }
  if (status === 409) return 'That computation has not been run yet.'
  if (status === 401) return 'Your session has expired. Sign in again.'
  if (status === 404) return 'Not found.'
  return `Request failed (${status}).`
}

const unwrap = (promise) => promise.then((r) => r.data)

export const endpoints = {
  // health
  health: () => unwrap(api.get('/health')),

  // auth
  login: (username, password) => unwrap(api.post('/api/v1/auth/login', { username, password })),
  signup: (body) => unwrap(api.post('/api/v1/auth/signup', body)),
  me: () => unwrap(api.get('/api/v1/auth/me')),

  // executive dashboard
  kpis: () => unwrap(api.get('/api/v1/dashboard/kpis')),
  contributors: (limit = 10) =>
    unwrap(api.get('/api/v1/dashboard/contributors', { params: { limit } })),
  threats: () => unwrap(api.get('/api/v1/dashboard/threats')),
  distribution: () => unwrap(api.get('/api/v1/dashboard/distribution')),

  // risk engine
  runs: (limit = 12) => unwrap(api.get('/api/v1/risk/runs', { params: { limit } })),
  runSimulation: (body = {}) => unwrap(api.post('/api/v1/risk/run', body)),
  losses: () => unwrap(api.get('/api/v1/risk/losses')),

  // optimizer
  optimizationPlan: (budgetInr) =>
    unwrap(
      api.get('/api/v1/optimization/plan', {
        params: budgetInr === null || budgetInr === undefined ? {} : { budget_inr: budgetInr },
      }),
    ),
  runOptimization: (budgetInr) =>
    unwrap(api.post('/api/v1/optimization/run', { budget_inr: budgetInr })),
  frontier: (points = 12) =>
    unwrap(api.get('/api/v1/optimization/frontier', { params: { points } })),
  recommendations: (limit = 10) =>
    unwrap(api.get('/api/v1/optimization/recommendations', { params: { limit } })),

  // technical audit
  vulnerabilities: (params = {}) =>
    unwrap(api.get('/api/v1/audit/vulnerabilities', { params })),
  vulnerabilitySummary: () => unwrap(api.get('/api/v1/audit/vulnerabilities/summary')),
  controls: () => unwrap(api.get('/api/v1/audit/controls')),
  assets: (limit = 8) => unwrap(api.get('/api/v1/audit/assets', { params: { limit } })),
  remediation: (limit = 60) =>
    unwrap(api.get('/api/v1/audit/remediation', { params: { limit } })),

  // compliance
  frameworks: (budgetInr) =>
    unwrap(
      api.get('/api/v1/compliance/frameworks', {
        params: budgetInr == null ? {} : { budget_inr: budgetInr },
      }),
    ),
  complianceMappings: (framework, budgetInr) =>
    unwrap(
      api.get('/api/v1/compliance/mappings', {
        params: {
          ...(framework ? { framework } : {}),
          ...(budgetInr == null ? {} : { budget_inr: budgetInr }),
        },
      }),
    ),

  // copilot
  ask: (question, attachments) =>
    unwrap(api.post('/api/v1/copilot/ask', { question, attachments })),
  suggestions: () => unwrap(api.get('/api/v1/copilot/suggestions')),

  // what-if sandbox
  simulate: (body) => unwrap(api.post('/api/v1/sandbox/simulate', body)),

  // telemetry
  presets: () => unwrap(api.get('/api/v1/telemetry/presets')),
  loadPreset: (name) =>
    unwrap(api.post(`/api/v1/telemetry/presets/${encodeURIComponent(name)}`)),
  telemetryEvents: (limit = 20) =>
    unwrap(api.get('/api/v1/telemetry/events', { params: { limit } })),
  upload: (file, onProgress) => {
    const form = new FormData()
    form.append('file', file)
    return unwrap(
      api.post('/api/v1/telemetry/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (event) => {
          if (!onProgress) return
          const total = event.total || file.size || 0
          onProgress(total ? Math.min(100, Math.round((event.loaded * 100) / total)) : null)
        },
      }),
    )
  },

  // business processes
  businessProcesses: (limit = 50) =>
    unwrap(api.get('/api/v1/business-processes', { params: { limit } })),
  createBusinessProcess: (body) => unwrap(api.post('/api/v1/business-processes', body)),

  // settings
  settings: () => unwrap(api.get('/api/v1/settings')),
  updateSettings: (body) => unwrap(api.put('/api/v1/settings', body)),

  // reports — returns a Blob the caller turns into a download
  exportReport: (format = 'pdf', budgetInr) =>
    api
      .post(
        '/api/v1/reports/export',
        { format, ...(budgetInr == null ? {} : { budget_inr: budgetInr }) },
        { responseType: 'blob' },
      )
      .then((r) => r.data),
}

export { BASE_URL }
