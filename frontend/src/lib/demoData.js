/**
 * Aggregates computed from the teammate's engine on the `development` branch
 * (data/risk_analysis.db — 10,000 assets, 32,978 risk scenarios).
 *
 * EAL / VaR come from the same Monte Carlo method as src/risk_engine.py:
 * per scenario, a binomial draw on incident_probability_annual times a
 * triangular draw over (min, likely, max) loss, summed across the estimate
 * and repeated 2,000 times.
 *
 * Swap each export for the matching endpoint once the Python service is up.
 */

// ---- Portfolio ----------------------------------------------------------
export const PORTFOLIO = {
  assets: 10000,
  internetExposed: 3084,
  scenarios: 32978,
  vulnerabilities: 19482,
  avgCriticality: 2.07,
  avgDataSensitivity: 2.1,
}

// ---- Headline risk ------------------------------------------------------
export const EAL = 374999536
export const VAR95 = 439099606
export const VAR99 = 477346999
export const MC_ITERATIONS = 2000

// ---- Exposure by business unit (was: per business process) --------------
export const topRisks = [
  {
    "id": "bu-1",
    "name": "HR",
    "eal": 40933972,
    "assets": 1730
  },
  {
    "id": "bu-2",
    "name": "Operations",
    "eal": 40382102,
    "assets": 1698
  },
  {
    "id": "bu-3",
    "name": "Marketing",
    "eal": 39685921,
    "assets": 1617
  },
  {
    "id": "bu-4",
    "name": "Finance",
    "eal": 39435441,
    "assets": 1687
  },
  {
    "id": "bu-5",
    "name": "Sales",
    "eal": 38943702,
    "assets": 1654
  },
  {
    "id": "bu-6",
    "name": "Engineering",
    "eal": 37724353,
    "assets": 1614
  }
]

// ---- Threat categories driving the scenarios ----------------------------
export const threats = [
  {
    "name": "Ransomware",
    "scenarios": 10000,
    "p": 0.0133,
    "eal": 73299416
  },
  {
    "name": "DDoS",
    "scenarios": 10000,
    "p": 0.0133,
    "eal": 72047223
  },
  {
    "name": "Insider Threat",
    "scenarios": 10000,
    "p": 0.0133,
    "eal": 70781832
  },
  {
    "name": "Data Breach",
    "scenarios": 2978,
    "p": 0.0131,
    "eal": 20977020
  }
]

// ---- Monte Carlo loss distribution --------------------------------------
export const lossBins = [
  {
    "start": 269052594,
    "end": 281229370,
    "count": 5
  },
  {
    "start": 281229370,
    "end": 293406146,
    "count": 5
  },
  {
    "start": 293406146,
    "end": 305582922,
    "count": 25
  },
  {
    "start": 305582922,
    "end": 317759698,
    "count": 58
  },
  {
    "start": 317759698,
    "end": 329936474,
    "count": 123
  },
  {
    "start": 329936474,
    "end": 342113250,
    "count": 165
  },
  {
    "start": 342113250,
    "end": 354290026,
    "count": 233
  },
  {
    "start": 354290026,
    "end": 366466802,
    "count": 250
  },
  {
    "start": 366466802,
    "end": 378643578,
    "count": 251
  },
  {
    "start": 378643578,
    "end": 390820354,
    "count": 251
  },
  {
    "start": 390820354,
    "end": 402997130,
    "count": 199
  },
  {
    "start": 402997130,
    "end": 415173906,
    "count": 172
  },
  {
    "start": 415173906,
    "end": 427350682,
    "count": 103
  },
  {
    "start": 427350682,
    "end": 439527458,
    "count": 61
  },
  {
    "start": 439527458,
    "end": 451704234,
    "count": 39
  },
  {
    "start": 451704234,
    "end": 463881010,
    "count": 21
  },
  {
    "start": 463881010,
    "end": 476057786,
    "count": 19
  },
  {
    "start": 476057786,
    "end": 488234562,
    "count": 20
  }
]

// ---- Remediation catalog (optimizer candidates) -------------------------
// `reduction` is this action's share of annual loss avoided at its average
// risk_reduction_percentage; `applicable` is how many assets it targets.
export const controls = [
  {
    "id": "c1",
    "name": "Upgrade EDR Coverage",
    "cost": 2498159,
    "reduction": 4687494,
    "pct": 0.15,
    "applicable": 4959,
    "frameworks": [
      "NIST-PR.DS-1",
      "ISO27001-A.12.2"
    ]
  },
  {
    "id": "c2",
    "name": "Network Segmentation",
    "cost": 4493062,
    "reduction": 7812490,
    "pct": 0.25,
    "applicable": 4955,
    "frameworks": [
      "NIST-PR.AC-5",
      "CIS-Control-14"
    ]
  },
  {
    "id": "c3",
    "name": "Enforce MFA",
    "cost": 1500460,
    "reduction": 3124996,
    "pct": 0.1,
    "applicable": 4928,
    "frameworks": [
      "RBI-CS-4.1",
      "ISO27001-A.9.4"
    ]
  },
  {
    "id": "c4",
    "name": "Patch Critical CVEs",
    "cost": 796937,
    "reduction": 6249992,
    "pct": 0.2,
    "applicable": 1302,
    "frameworks": [
      "CIS-Control-7",
      "SEBI-CS-3"
    ]
  }
]

export const BUDGET = 8000000

// ---- Asset mix ----------------------------------------------------------
export const assetTypes = [
  {
    "name": "Workstation",
    "count": 3980,
    "avgValue": 2574363
  },
  {
    "name": "Server",
    "count": 3053,
    "avgValue": 2553731
  },
  {
    "name": "Database",
    "count": 1005,
    "avgValue": 2589570
  },
  {
    "name": "Network_Device",
    "count": 1001,
    "avgValue": 2668807
  },
  {
    "name": "Cloud_Storage",
    "count": 961,
    "avgValue": 2680930
  }
]

// ---- Vulnerabilities ----------------------------------------------------
export const vulnStatus = {
  "In Progress": 3875,
  "Mitigated": 1984,
  "Unpatched": 13623
}

export const vulnerabilities = [
  {
    "cve": "CVE-2026-43997",
    "asset": "AST-003535",
    "assetType": "Server",
    "cvss": 10.0,
    "epss": 0.6553,
    "status": "Unpatched",
    "control": "ISO27001-A.9.4",
    "severity": "Critical"
  },
  {
    "cve": "CVE-2026-53622",
    "asset": "AST-008059",
    "assetType": "Workstation",
    "cvss": 10.0,
    "epss": 0.4608,
    "status": "Mitigated",
    "control": "ISO27001-A.12.2",
    "severity": "Critical"
  },
  {
    "cve": "CVE-2026-86152",
    "asset": "AST-004850",
    "assetType": "Server",
    "cvss": 10.0,
    "epss": 0.4362,
    "status": "Mitigated",
    "control": "ISO27001-A.9.4",
    "severity": "Critical"
  },
  {
    "cve": "CVE-2026-48168",
    "asset": "AST-003986",
    "assetType": "Cloud Storage",
    "cvss": 10.0,
    "epss": 0.4203,
    "status": "Unpatched",
    "control": "NIST-DE.CM-4",
    "severity": "Critical"
  },
  {
    "cve": "CVE-2026-44756",
    "asset": "AST-006394",
    "assetType": "Workstation",
    "cvss": 10.0,
    "epss": 0.4027,
    "status": "Unpatched",
    "control": "NIST-PR.AC-5",
    "severity": "Critical"
  },
  {
    "cve": "CVE-2026-4357",
    "asset": "AST-005848",
    "assetType": "Workstation",
    "cvss": 10.0,
    "epss": 0.4005,
    "status": "Unpatched",
    "control": "NIST-DE.CM-4",
    "severity": "Critical"
  },
  {
    "cve": "CVE-2026-20079",
    "asset": "AST-006730",
    "assetType": "Network Device",
    "cvss": 10.0,
    "epss": 0.3878,
    "status": "Unpatched",
    "control": "NIST-PR.DS-1",
    "severity": "Critical"
  },
  {
    "cve": "CVE-2026-43997",
    "asset": "AST-001477",
    "assetType": "Network Device",
    "cvss": 10.0,
    "epss": 0.3669,
    "status": "Unpatched",
    "control": "ISO27001-A.9.4",
    "severity": "Critical"
  }
]

// ---- Framework coverage -------------------------------------------------
export const frameworkMappings = [
  {
    "mapping": "CIS-Control-7|SEBI-CS-3",
    "count": 5051
  },
  {
    "mapping": "NIST-PR.DS-1|ISO27001-A.12.2",
    "count": 4959
  },
  {
    "mapping": "NIST-PR.AC-5|CIS-Control-14",
    "count": 4955
  },
  {
    "mapping": "RBI-CS-4.1|ISO27001-A.9.4",
    "count": 4928
  }
]

export const frameworks = [
  {
    "name": "ISO 27001:2022",
    "covered": 2,
    "total": 4
  },
  {
    "name": "NIST CSF 2.0",
    "covered": 2,
    "total": 4
  },
  {
    "name": "CIS Controls v8",
    "covered": 2,
    "total": 4
  },
  {
    "name": "RBI CSF",
    "covered": 1,
    "total": 3
  },
  {
    "name": "SEBI CSCRF",
    "covered": 1,
    "total": 3
  }
]

// ---- Control coverage by asset type -------------------------------------
// From data/raw/controls.csv. The ML model treats these as features rather
// than scoring a Confidentiality/Integrity/Availability gap, so the UI
// reports coverage directly instead of a weighted gap score.
export const CONTROL_EFFECTIVENESS = 0.614
export const COVERAGE = { mfa: 0.527, edr: 0.556, backup: 0.758 }

export const coverageByType = [
  { name: 'Workstation', mfa: 0.53, edr: 0.555, backup: 0.757, effectiveness: 0.614, assets: 3980 },
  { name: 'Server', mfa: 0.517, edr: 0.56, backup: 0.759, effectiveness: 0.612, assets: 3053 },
  { name: 'Database', mfa: 0.534, edr: 0.551, backup: 0.754, effectiveness: 0.613, assets: 1005 },
  { name: 'Network Device', mfa: 0.534, edr: 0.557, backup: 0.756, effectiveness: 0.616, assets: 1001 },
  { name: 'Cloud Storage', mfa: 0.535, edr: 0.55, backup: 0.765, effectiveness: 0.616, assets: 961 },
]

// ---- Run history --------------------------------------------------------
// The engine writes no timestamped history yet, so only the latest run is
// real. Earlier points are placeholders until runs are persisted.
export const trend = [
  { label: 'Run 1', eal: 352000000, var95: 412000000 },
  { label: 'Run 2', eal: 361000000, var95: 421000000 },
  { label: 'Run 3', eal: 358000000, var95: 418000000 },
  { label: 'Run 4', eal: 369000000, var95: 430000000 },
  { label: 'Run 5', eal: 371000000, var95: 434000000 },
  { label: 'Latest', eal: EAL, var95: VAR95 },
]

// ---- Compliance ---------------------------------------------------------
// Each catalog action carries a framework_mapping; a clause counts as covered
// when at least one funded action maps to it.
export const complianceRows = [
  { clause: 'ISO27001-A.9.4', objective: 'Access control to systems', control: 'Enforce MFA', status: 'Covered' },
  { clause: 'ISO27001-A.12.2', objective: 'Protection from malware', control: 'Upgrade EDR Coverage', status: 'Covered' },
  { clause: 'NIST-PR.AC-5', objective: 'Network integrity protection', control: 'Network Segmentation', status: 'Covered' },
  { clause: 'NIST-PR.DS-1', objective: 'Data-at-rest protection', control: 'Upgrade EDR Coverage', status: 'Covered' },
  { clause: 'CIS-Control-7', objective: 'Continuous vulnerability management', control: 'Patch Critical CVEs', status: 'Covered' },
  { clause: 'CIS-Control-14', objective: 'Security awareness training', control: 'Network Segmentation', status: 'Not funded' },
  { clause: 'RBI-CS-4.1', objective: 'Authentication controls', control: 'Enforce MFA', status: 'Not funded' },
  { clause: 'SEBI-CS-3', objective: 'Vulnerability remediation SLA', control: 'Patch Critical CVEs', status: 'Not funded' },
  { clause: 'NIST-DE.CM-4', objective: 'Malicious code detection', control: null, status: 'No mapping' },
]

// ---- Telemetry presets --------------------------------------------------
// Derived from risk_scenarios.threat_category.
export const presets = threats.map((t) => ({
  name: t.name,
  desc: `${t.scenarios.toLocaleString('en-IN')} scenarios · annual probability ${(t.p * 100).toFixed(2)}%`,
  cves: [],
  eal: t.eal,
}))
