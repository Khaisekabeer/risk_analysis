/**
 * Demo-data stand-ins, one per endpoint, shaped exactly like the backend
 * response they replace.
 *
 * Every useApi call passes one of these as its `fallback`, so a screen always
 * has a complete set of figures to render: if the service is down or an
 * endpoint is unavailable, the view degrades to the saved aggregates instead
 * of showing an error or an empty frame.
 */

import * as demo from './demoData'
import { solveKnapsack } from './knapsack'

const OPEN_VULNS = demo.vulnStatus.Unpatched + demo.vulnStatus['In Progress']

export const kpis = {
  enterprise_eal_inr: demo.EAL,
  enterprise_var_95_inr: demo.VAR95,
  enterprise_var_99_inr: demo.VAR99,
  iterations: demo.MC_ITERATIONS,
  scenario_count: demo.PORTFOLIO.scenarios,
  open_vulnerabilities: OPEN_VULNS,
  deterministic_eal_inr: demo.topRisks.reduce((s, r) => s + r.eal, 0),
  portfolio: {
    ...demo.PORTFOLIO,
    total_asset_value_inr: demo.assetTypes.reduce((s, t) => s + t.count * t.avgValue, 0),
  },
  computed_at: null,
}

export const contributors = demo.topRisks
export const threats = demo.threats

export const distribution = {
  eal_inr: demo.EAL,
  var_95_inr: demo.VAR95,
  var_99_inr: demo.VAR99,
  iterations: demo.MC_ITERATIONS,
  bins: demo.lossBins,
}

export const runs = demo.trend.map((t, i) => ({
  run_id: i + 1,
  label: t.label,
  eal_inr: t.eal,
  var_95_inr: t.var95,
  var_99_inr: t.var95 * 1.09,
  iterations: demo.MC_ITERATIONS,
}))

/** The same knapsack the backend runs, over the saved catalog. */
export function plan(budget = demo.BUDGET) {
  const resolved = budget == null ? demo.BUDGET : budget
  const { chosen, total, allocated: cost } = solveKnapsack(demo.controls, resolved)
  const controls = demo.controls.map((c) => ({ ...c, funded: chosen.has(c.id) }))
  return {
    controls,
    budget_inr: resolved,
    total_cost_inr: cost,
    total_reduction_inr: total,
    baseline_eal_inr: demo.EAL,
    residual_eal_inr: Math.max(0, demo.EAL - total),
    rosi_percentage: cost > 0 ? ((total - cost) / cost) * 100 : null,
    budget_utilisation: resolved > 0 ? cost / resolved : 0,
  }
}

export function frontier(points = 12) {
  const ceiling = demo.controls.reduce((s, c) => s + c.cost, 0) * 1.1
  return Array.from({ length: points }, (_, i) => {
    const budget = (ceiling * (i + 1)) / points
    const { allocated, total } = solveKnapsack(demo.controls, budget)
    return { budget_inr: budget, spend_inr: allocated, reduction_inr: total }
  })
}

const SEVERITY = (cvss) =>
  cvss >= 9 ? 'Critical' : cvss >= 7 ? 'High' : cvss >= 4 ? 'Medium' : 'Low'

const STATUS = { Unpatched: 'Open', 'In Progress': 'In Progress', Mitigated: 'Resolved' }

export const vulnerabilities = {
  rows: demo.vulnerabilities.map((v, i) => ({
    vuln_id: `VLN-${String(i + 1).padStart(5, '0')}`,
    cve_id: v.cve,
    asset_id: v.asset,
    asset_type: v.assetType,
    business_unit: demo.topRisks[i % demo.topRisks.length].name,
    cvss_score: v.cvss,
    epss_score: v.epss,
    severity: v.severity ?? SEVERITY(v.cvss),
    status: STATUS[v.status] ?? v.status,
    framework_control_id: v.control,
  })),
  total: demo.PORTFOLIO.vulnerabilities,
}

export const vulnerabilitySummary = {
  total: demo.PORTFOLIO.vulnerabilities,
  by_severity: {
    Critical: 4871,
    High: 5108,
    Medium: 5602,
    Low: 3901,
  },
  by_status: {
    Open: demo.vulnStatus.Unpatched,
    'In Progress': demo.vulnStatus['In Progress'],
    Resolved: demo.vulnStatus.Mitigated,
  },
  exploitable: 1624,
}

export const controls = {
  overall: { ...demo.COVERAGE, effectiveness: demo.CONTROL_EFFECTIVENESS },
  by_asset_type: demo.coverageByType,
}

export const assets = {
  mix: demo.assetTypes.map((t) => ({
    name: t.name.replace(/_/g, ' '),
    count: t.count,
    avgValue: t.avgValue,
  })),
  top: demo.vulnerabilities.slice(0, 8).map((v, i) => ({
    asset_id: v.asset,
    asset_name: v.asset,
    asset_type: v.assetType,
    business_unit: demo.topRisks[i % demo.topRisks.length].name,
    eal_inr: demo.EAL / 10000 + (8 - i) * 4200,
    cve_id: v.cve,
    cvss_score: v.cvss,
  })),
  total_assets: demo.PORTFOLIO.assets,
}

export const remediation = (() => {
  const columns = { Open: [], 'In Progress': [], Resolved: [] }
  demo.vulnerabilities.forEach((v, i) => {
    const control = demo.controls[i % demo.controls.length]
    const bucket = STATUS[v.status] ?? 'Open'
    columns[bucket].push({
      vuln_id: `VLN-${String(i + 1).padStart(5, '0')}`,
      cve: v.cve,
      cvss: v.cvss,
      epss: v.epss,
      severity: v.severity ?? SEVERITY(v.cvss),
      asset: v.asset,
      assetType: v.assetType,
      remediation: control.name,
      fixCostInr: control.cost,
      riskReductionInr: control.reduction,
      riskReductionPct: control.pct,
      control: v.control,
    })
  })
  return {
    columns,
    counts: {
      Open: demo.vulnStatus.Unpatched,
      'In Progress': demo.vulnStatus['In Progress'],
      Resolved: demo.vulnStatus.Mitigated,
    },
  }
})()

const FRAMEWORK_KEYS = {
  'ISO 27001:2022': 'iso27001',
  'NIST CSF 2.0': 'nist',
  'CIS Controls v8': 'cis',
  'RBI CSF': 'rbi',
  'SEBI CSCRF': 'sebi',
}

export const frameworks = demo.frameworks.map((f) => ({
  key: FRAMEWORK_KEYS[f.name] ?? f.name,
  name: f.name,
  covered: f.covered,
  total: f.total,
  openFindings: 0,
}))

export const mappings = demo.complianceRows.map((r) => ({ ...r, openFindings: 0 }))

export const suggestions = [
  'What is our total financial exposure?',
  'Which business units carry the most risk?',
  'What should we fund with the current budget?',
  'How many critical vulnerabilities are still open?',
]

export const presets = demo.threats.map((t) => ({
  name: t.name,
  description: `${t.scenarios.toLocaleString('en-IN')} scenarios · ${(t.p * 100).toFixed(
    2,
  )}% annual incident probability`,
  source: 'risk_scenarios.threat_category',
  eal_inr: t.eal,
  scenarios: t.scenarios,
}))

export const events = []

export const settings = {
  default_budget_inr: demo.BUDGET,
  default_budget_is_derived: true,
  monte_carlo_iterations: demo.MC_ITERATIONS,
}

export const health = {
  status: 'offline',
  db_status: 'showing saved aggregates',
  last_simulation_at: null,
  last_ingestion_at: null,
  auth_required: false,
}
