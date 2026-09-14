# Frontend ↔ Backend Integration Map

A component-by-component record of where every number on screen comes from, and a
register of the logical faults found while tracing them. Written to be read with the
code open — each row names the file, the component, the endpoint, and the backend
function that actually computes the value.

- **Backend**: `src/api.py`, served as `uvicorn src.api:app --port 8000`
- **Frontend**: `frontend/src/`, Vite dev server on 5173
- **Store**: `data/risk_analysis.db` (SQLite) + `data/raw/*.csv`
- **Client**: all HTTP goes through `frontend/src/lib/apiClient.js`; all request
  state goes through `frontend/src/lib/useApi.js`

## 0. The rule this document now enforces

**There is no fallback data anywhere in the frontend.** A failed request renders an
error with a retry, never a substitute figure.

This used to be the opposite. `lib/fallbacks.js` supplied a demo stand-in for every
endpoint and `AsyncBoundary` refused to render errors, so a broken binding, a dead
endpoint or a stopped backend all looked like a working screen full of plausible
rupees. That is precisely why the real-data integration faults in §3 went unnoticed:
the screens never failed, they just quietly stopped being true.

Removed in this pass:

| Removed | Was |
|---|---|
| `lib/fallbacks.js` | one demo stand-in per endpoint |
| `lib/demoData.js` | the hardcoded aggregate constants behind them |
| `lib/knapsack.js` | a JS re-implementation of the backend optimiser, used only to fake `/optimization/plan` offline |
| `useApi(..., { fallback })` | the option itself; `useApi` no longer accepts one |
| `AsyncBoundary` error suppression | it rendered loading/empty/success only — never an error |
| `OfflineBanner` | the "Showing saved demo figures." strip |
| `Ask.jsx` `FALLBACK_PROMPTS` | a local copy of the copilot's suggestion list |
| `Landing.jsx` `Sparkline` | a `Math.random()` ticker presented as a live `risk_score` |
| `BusinessProcesses.jsx` defaults | a pre-filled "Payments Gateway" process that read as saved data |

How the demo constants compared to reality — this is the scale of the drift that was
being hidden:

| Figure | Demo constant | Live backend |
|---|---:|---:|
| Critical findings | 4,871 | 2,162 |
| High findings | 5,108 | 9,124 |
| Low findings | 3,901 | 670 |
| Exploitable (EPSS ≥ 0.5) | 1,624 | 331 |
| Monte Carlo iterations | 2,000 | 10,000 (stored setting) |
| Default budget | ₹80,00,000 | ₹15,00,000 (stored setting) |

On failure now: `useApi` clears `data` and sets `error`; `AsyncBoundary` renders
`ErrorState` with a Retry wired to `refetch`. The previous payload is dropped too — a
stale success sitting next to a live error reads as though the screen is current.

## 1. Shared data path

```
SQLite  ──frames()──▶  pandas DataFrames (process-cached, src/api.py)
                          │
                          ├── monte_carlo()          → EAL / VaR₉₅ / VaR₉₉ / histogram bins
                          ├── scenarios_with_assets()→ business-unit + asset rollups
                          ├── vulnerability_view()   → severity & status derived per finding
                          ├── control_catalog()      → 4 funding programmes from 19,893 rows
                          └── knapsack()             → the funded subset under a budget
                          │
                     FastAPI JSON
                          │
        apiClient.endpoints.* ──▶ useApi() ──▶ AsyncBoundary ──▶ component
```

Two loss bases exist and they are **not interchangeable** (see issue L-01):

- **Deterministic EAL** — `SUM(likely_loss_inr × incident_probability_annual)`.
  Used for every *attribution* (per business unit, threat, asset). Currently
  **₹23.71 Cr**.
- **Monte Carlo EAL / VaR** — Bernoulli × triangular draw per scenario, summed
  across the portfolio, repeated N times. Used for the *headline* number and the
  loss distribution. Currently **₹37.41 Cr** EAL, **₹43.74 Cr** VaR₉₅.

## 2. Page-by-page component map

### 2.1 Landing — `pages/Landing.jsx`

| Component | Field | Endpoint → backend source |
|---|---|---|
| Hero stat 1 | `figures.eal` | `GET /api/v1/dashboard/kpis` → `monte_carlo().eal_inr` |
| Hero stat 2 | `figures.assets` | same → `len(frames()["assets"])` = 10,000 |
| Hero stat 3 | `figures.scenarios` | same → `len(frames()["scenarios"])` = 32,978 |
| Monitoring card | `figures.var95` | same → `monte_carlo().var_95_inr` |
| Monitoring card | assets / exposed / findings | `kpis.portfolio.{assets,internetExposed,vulnerabilities}` |
| Quantification card | `figures.eal` → `figures.residual` | `kpis` + `GET /optimization/plan` → `residual_eal_inr` |
| `risk_engine.py` transcript | eal / var_95 / scenarios | `kpis`, rendered via `intOf()` so an unreachable engine prints `—`, not `NaN` |
| `investment_optimizer.py` transcript | budget, reduction | `GET /optimization/plan` → `budget_inr`, `baseline − residual` |

No loading state by design; unresolved figures render `—`.

### 2.2 Executive Dashboard — `pages/app/Dashboard.jsx`

| Component | Field | Endpoint → backend source |
|---|---|---|
| `Gauge` "Enterprise Risk Score" | `riskScore` | **derived in the browser**: `min(100, VaR₉₅ / total_asset_value × 1000)` — see issue L-05 |
| KPI "Financial Exposure · EAL" | `enterprise_eal_inr`, `var_95`, `var_99` | `GET /dashboard/kpis` → `monte_carlo()` |
| KPI "Open Vulnerabilities" | `open_vulnerabilities` | same → `(vulnerability_view().status != "Resolved").sum()` = 17,498 |
| KPI "Controls Not Funded" | `controls.length − funded` | `GET /optimization/plan` → `knapsack()` |
| `MultiRadar` "Risk across runs" | `runs[].{label,eal_inr,var_95_inr}` | `GET /risk/runs` → `simulation_runs` table |
| Run toggle chips | `run_id` | same |
| "New run" button | — | `POST /risk/run` → fresh `monte_carlo(seed=random)`, appended to `simulation_runs` |
| "Exposure by business unit" bars | `contributors[].{name,eal,assets}` | `GET /dashboard/contributors` → `scenarios_with_assets().groupby("business_unit")` |
| "Top risk reduction available" | `controls[].{name,reduction,cost,applicable,pct}` | `GET /optimization/plan` → `control_catalog()` |
| SlideOver → "Threat mix driving this unit" | `drill.threat_mix[]` | `GET /dashboard/contributors` → `groupby(["business_unit","threat_category"])` — **fixed this pass**, see F-03 |

### 2.3 Investment Optimizer — `pages/app/Optimizer.jsx`

| Component | Field | Endpoint → backend source |
|---|---|---|
| Tile "Budget" | `budget_inr` | `GET /optimization/plan` → `default_budget()` or the query arg |
| Tile "Allocated" | `total_cost_inr` | → `knapsack()` chosen set |
| Tile "Total risk reduction" | `total_reduction_inr` | → sum of `control_catalog()[].reduction` over funded |
| Tile "Return on investment" | `reduction / allocated`, `rosi_percentage` | ROI derived client-side; ROSI from backend |
| "Candidate Controls" table | `controls[]` incl. `funded`, `frameworks` | `control_catalog()` grouped by `action_family()` |
| "Expected Annual Loss" before/after | `baseline_eal_inr`, `residual_eal_inr` | `monte_carlo().eal_inr` minus the deterministic-derived reduction — **mixed bases**, issue L-02 |
| `FrontierCurve` | `curve[].{budget_inr,spend_inr,reduction_inr}` | `GET /optimization/frontier` → `knapsack()` re-solved at 14 budgets |
| "Optimise" button | — | `POST /optimization/run` — **persists the budget globally**, issue L-03 |

### 2.4 Technical Audit — `pages/app/TechnicalAudit.jsx` (4 tabs)

**Vulnerabilities tab**

| Component | Field | Endpoint → backend source |
|---|---|---|
| Table rows | `rows[]` (10 cols) | `GET /audit/vulnerabilities?limit=100` → `vulnerability_view()` sorted by CVSS desc |
| Severity filter chips + counts | `by_severity` | `GET /audit/vulnerabilities/summary` — **whole corpus**, while rows are top-100, issue L-04 |
| Status filter chips | server-side `status` param | `STATUS_MAP` (`Unpatched→Open`, `In_Progress→In Progress`, `Mitigated→Resolved`) |
| "N findings" counter | `total` | count *after* filters, *before* the limit |

**Controls tab** — `GET /audit/controls` → `asset_controls` joined to `assets`;
tiles are `overall.{mfa,edr,backup,effectiveness}`, `CoverageBars` is `by_asset_type[]`.

**Assets tab** — `GET /audit/assets?limit=8`; "Asset mix" is
`assets.groupby("asset_type")`, "Highest exposure" is
`scenarios_with_assets().groupby("asset_id").eal_inr.sum()` with the worst CVE joined in.

**Compliance tab** — same two endpoints as §2.6.

**Export report** — `POST /reports/export` → markdown, or PDF when `reportlab` is
importable (silently falls back to markdown when it is not, issue L-11).

### 2.5 Remediation Queue — `pages/app/RemediationQueue.jsx`

| Component | Field | Endpoint → backend source |
|---|---|---|
| 3 Kanban columns | `columns.{Open,In Progress,Resolved}` | `GET /audit/remediation?limit=90` → `vulnerability_view()` bucketed by status, 30/column |
| Column count chip | `counts[name]` | full corpus count per status |
| `Ticket` CVE / CVSS / severity / asset | `cve`, `cvss`, `severity`, `asset` | `asset_vulnerabilities` + `assets` join |
| `Ticket` remediation name + cost | `remediation`, `fixCostInr` | `remediation_catalog` first row for that asset, via `action_family()` |
| `Ticket` risk reduction | `riskReductionInr` | `cost × pct × 4` — **magic constant**, issue L-06 |

### 2.6 Compliance — `pages/app/Compliance.jsx`

| Component | Field | Endpoint → backend source |
|---|---|---|
| 5 framework cards | `frameworks[].{name,covered,total,openFindings}` | `GET /compliance/frameworks` → `compliance_rows()` filtered by clause prefix |
| Clause table | `mappings[]` | `GET /compliance/mappings` → `CLAUSE_OBJECTIVES` ∪ catalog `framework_mapping` |
| "Framework" column | `row.frameworkName` | resolved from the clause prefix — **added this pass**, see F-01 |
| "Satisfied by" | `row.control` | the funded control mapping to that clause, else any mapping control |
| "Open findings" | `row.openFindings` | `vulnerability_view()` where `status != Resolved`, counted by `framework_control_id` |
| Status | `Covered` / `Not funded` / `No mapping` | funded-clause vs mapped-clause membership |

`covered` depends entirely on what the **budget** funds — see issue L-03.

### 2.7 What-If Sandbox — `pages/app/ScenarioSimulator.jsx`

| Component | Field | Endpoint → backend source |
|---|---|---|
| Action list | `controls[]` | `GET /optimization/plan` → `control_catalog()` |
| Coverage slider | local state 0–100 | not sent to the backend on the live preview |
| "Applicable assets" / "Spend" / "Loss avoided" | `applicable × cov`, `cost × cov`, `reduction × cov` | **computed in the browser** from the plan row |
| VaR₉₅ baseline | `var_95_inr` | `GET /dashboard/distribution` → `monte_carlo()` |
| VaR₉₅ simulated | `baselineVar × (1 − averted/baselineEal)` | **browser approximation**, issue L-07 |
| Histogram baseline bars | `bins[]` | `GET /dashboard/distribution` → 18-bin `np.histogram` |
| Histogram simulated bars | `bins[i + shift]` | **index shift**, issue L-08 |
| "Verify against backend" | `current_eal_inr`, `simulated_eal_inr`, `financial_risk_averted_inr` | `POST /sandbox/simulate` — the only server-checked number on the page |

### 2.8 Ask Riskyn — `pages/app/Ask.jsx`

| Component | Field | Endpoint → backend source |
|---|---|---|
| Suggested prompts | `suggestions[]` | `GET /copilot/suggestions` → the `SUGGESTIONS` list the router recognises |
| Answer prose | `answer` | `POST /copilot/ask` → **keyword-routed**, not an LLM, issue L-09 |
| `SourceData` table | `source_data[]` | the rows the chosen branch aggregated |
| Tool chip | `tool_used` | one of `monte_carlo`, `sql:business_unit_rollup`, `knapsack_optimizer`, `sql:vulnerability_summary`, `sql:threat_rollup`, `sql:asset_rollup`, `portfolio_overview` |
| File attach | `records_seen/accepted`, `recognised_fields` | `POST /telemetry/upload` — **validated, then discarded**, issue L-10 |

### 2.9 Telemetry — `pages/app/Telemetry.jsx`

| Component | Field | Endpoint → backend source |
|---|---|---|
| Preset cards | `presets[].{name,description,eal_inr}` | `GET /telemetry/presets` → `dashboard_threats()` |
| Preset click | `records_seen/accepted`, `note` | `POST /telemetry/presets/{name}` — **writes an ingestion log row only**, issue L-10 |
| Upload dropzone | `records_*`, `recognised_fields`, `matched_known_assets`, `validation_errors` | `POST /telemetry/upload` |
| "Recent ingestion" table | `events[]` | `GET /telemetry/events` → `ingestion_events` table |

### 2.10 Business Processes — `pages/app/BusinessProcesses.jsx`

| Component | Field | Endpoint → backend source |
|---|---|---|
| Form | — | empty by default; the operator describes their own process |
| "Request body" preview | live `watch()` values | client-only |
| Create | `id`, `activities`, `information_items` | `POST /business-processes` |
| "Saved processes" panel | `processes[]` | `GET /business-processes` — **wired this pass**, see F-02 |

Nothing on this page feeds the risk engine — see issue L-12.

### 2.11 Settings — `pages/app/Settings.jsx`

| Component | Field | Endpoint → backend source |
|---|---|---|
| Default budget | `default_budget_inr`, `default_budget_is_derived` | `GET /settings` → `app_settings` or 50% of catalog cost |
| Monte Carlo iterations | `monte_carlo_iterations` | same → `app_settings` or 2,000 |
| Save | — | `PUT /settings` (budget ≥ 0; iterations 100–50,000) |
| Service status | `status`, `db_status`, `last_simulation_at`, `last_ingestion_at`, `auth_required` | `GET /health` |

## 3. Logical issues register

Severity: **H** breaks a number a user would act on · **M** misleading or inconsistent
· **L** dead code or cosmetic.

### Fixed in this pass

| # | Sev | Where | Fault | Fix |
|---|---|---|---|---|
| F-01 | H | `Compliance.jsx:187` | Rendered `row.frameworkName`; `compliance_rows()` never returned it, nor did the old demo data. The "Framework" column was blank in every build ever shipped. | `compliance_rows()` now resolves `framework`/`frameworkName` from the clause prefix. |
| F-02 | H | `BusinessProcesses.jsx` | Never called `GET /business-processes`. The page was write-only: a saved process vanished immediately and the endpoint had no consumer. | Added a "Saved processes" panel; refetches after create. |
| F-03 | H | `Dashboard.jsx` drill-down | Per-unit threat mix was the **global** mix scaled by the unit's EAL share, so every business unit showed identical proportions. | `/dashboard/contributors` now returns a real `threat_mix` per unit from `groupby(["business_unit","threat_category"])`. Confirmed distinct: HR leads with DDoS, the portfolio leads with Ransomware. |
| F-04 | M | `BusinessProcesses.jsx:249` | Rendered `{saved.note}`; the POST response has no `note` field. Rendered empty. | Shows the returned activity/information-item counts instead. |
| F-05 | M | `Landing.jsx` | `risk_score` was `Math.random()` walking between 17 and 30, labelled as a live score with a "Δ / 7d" delta; the card also claimed "sources: 6 vendor APIs". | Replaced with real `var_95` and portfolio counts; `Sparkline.jsx` deleted. |
| F-06 | M | `Compliance.jsx:142` | Panel title interpolated the framework **key**, reading "iso27001 clauses". | Uses the display name. |

### Open — quantification model

| # | Sev | Where | Issue |
|---|---|---|---|
| L-01 | **H** | `api.py` module-wide | **Two loss bases are mixed on one screen.** The Dashboard headline EAL is Monte Carlo (₹37.41 Cr); the business-unit bars below it are deterministic and sum to ₹23.71 Cr. A reader adding up the bars gets 63% of the headline with nothing on screen explaining the gap. Either surface both figures explicitly, or attribute the MC total back to units pro-rata. |
| L-02 | **H** | `api.py:build_plan` | **`residual_eal_inr` subtracts across bases.** `baseline` is `monte_carlo().eal_inr` (MC), but `reduction` comes from `control_catalog()`, which scales `total_eal` = the *deterministic* sum. Subtracting a deterministic-derived reduction from an MC baseline is not a coherent quantity — and it is what the Optimizer's "After funded controls" figure and the Landing page's `residual` both show. |
| L-03 | **H** | `api.py:optimization_run` | **An exploratory what-if permanently changes global state.** Typing a budget in the Optimizer calls `POST /optimization/run`, which does `set_setting("default_budget_inr", ...)`. That single write changes the Landing page, the Dashboard, and every framework's `covered` count on the Compliance page for all users. It is currently ₹15,00,000, which funds only 1 of 4 programmes (Patch Critical CVEs at ₹7.98 L; MFA at ₹15.00 L is already unaffordable) — which is why ISO/NIST/RBI show **0/3, 0/3, 0/2** coverage. The page looks broken; it is faithfully reporting a budget someone set by experimenting. Budget exploration should not persist. |
| L-05 | M | `Dashboard.jsx:128` | The "Enterprise Risk Score … of 100" gauge has no engine equivalent. It is `VaR₉₅ / total_asset_value × 1000`, clamped — an arbitrary ×1000 scaling invented for display. It reads as a model output. |
| L-06 | M | `api.py:audit_remediation` | `riskReductionInr = cost × pct × 4`. The `× 4` is unexplained, and it gives a *different* reduction for the same control than `control_catalog()` does (`covered_eal × pct`). The Remediation Queue and the Optimizer therefore quote different rupee savings for the same fix. |
| L-07 | M | `ScenarioSimulator.jsx:44` | `simVar = baselineVar × (1 − averted/baselineEal)` scales a **tail** quantile by a **mean** ratio. VaR does not move proportionally to EAL. `/sandbox/simulate` returns EAL only, so the page has no server-computed VaR to show. |
| L-08 | M | `ScenarioSimulator.jsx:48` | The simulated histogram is the baseline shifted left by `round(averted / binWidth)` bins. Two faults: a control reduces loss *variance*, not just location, so a rigid translation is the wrong shape; and when `shift ≥ bins.length` every simulated bar reads 0 and the curve silently disappears rather than piling up at the low end. |
| L-13 | M | `data/raw/incidents.csv` | The four-component loss breakdown is effectively one component: data breach is ₹19,318.50 Cr of the ₹19,505.95 Cr total (99.0%), at a mean of ₹37.5 Cr per incident, against downtime's mean of ₹26.3 lakh and regulatory penalty's ₹5.2 lakh. The breakdown is not informative at these relative magnitudes — worth re-checking `synthetic_data_generator.py`'s per-component scaling. |

### Open — data flow and honesty

| # | Sev | Where | Issue |
|---|---|---|---|
| L-04 | M | `TechnicalAudit.jsx` Vulnerabilities | The table shows the top 100 findings by CVSS while the header reads "19,482 findings" and the severity chips carry whole-corpus counts (Critical 2,162 …). There is no pagination and `GET /audit/vulnerabilities` has no `offset`. Selecting "Low" (670 in the corpus) still renders at most 100 rows with no indication the list is truncated. |
| L-09 | M | `api.py:copilot_ask` | The copilot is a keyword router over six `if any(k in q for k in ...)` branches, not a language model. Any question matching no keyword silently falls through to the generic portfolio overview, so an unanswerable question returns a confident-sounding answer to a different question. The page subtitle ("routed to a real engine function") is accurate; the fall-through is not signposted. |
| L-10 | M | `api.py:telemetry_upload`, `telemetry_load_preset` | **Ingestion ingests nothing.** Upload parses the file, validates columns against `KNOWN_FIELDS`, matches asset ids, writes a row to `ingestion_events` — and discards the data. `asset_vulnerabilities` is never touched, so no figure anywhere changes. "Load preset" likewise only writes a log row claiming `records_seen = 10000`. The UI ("Rows are validated before anything is accepted", an accepted-row count, an ingestion history) reads as a working pipeline. |
| L-12 | M | `BusinessProcesses.jsx` | Saved processes are inert. `business_processes` is written and read back but no endpoint consumes it — the requirement levels the page explains at length ("Gap = Requirement − Estimated Security", "levels map to 10/5/2") are not computed anywhere in `api.py`. |

### Open — auth and lifecycle

| # | Sev | Where | Issue |
|---|---|---|---|
| L-14 | **H** | `api.py` | **No data endpoint checks authentication.** Only `/auth/me` inspects the token; `/health` self-reports `auth_required: false`. Every KPI, vulnerability row and export is reachable unauthenticated, and CORS is `allow_origins=["*"]`. Acceptable for a demo, not for anything exposed. |
| L-15 | M | `api.py:_sessions` | Sessions live in a module-level dict, so every backend restart invalidates every token. The frontend keeps the token in `localStorage` and the session in `sessionStorage`, so after a restart the UI still believes it is signed in while every call 401s. |
| L-16 | L | `api.py:ensure_runs` | The five seeded history runs were computed at `iterations = 1000` (a half-size resample), while the current setting is 10,000. The Dashboard radar therefore compares runs of unequal precision without labelling it. |
| L-17 | L | `Settings.jsx:78` | Hint reads "2,000 is the FAIR-literature default here" while the stored value is 10,000. Stale relative to state. |

### Open — dead code

| # | Sev | Where | Issue |
|---|---|---|---|
| L-18 | L | `components/charts/index.jsx` | `RiskTrendChart`, `TopRisksBar`, `LossHistogram` and `InvestmentCurve` are exported and unused. Notably `LossHistogram` already draws a proper histogram with EAL/VaR reference lines, while `ScenarioSimulator` hand-rolls a worse inline one (L-08). |
| L-19 | L | `apiClient.js` | `endpoints.losses` (`GET /risk/losses`) and `endpoints.recommendations` (`GET /optimization/recommendations`) have no caller. The four-component actuarial breakdown has no UI at all. |
| L-20 | L | `apiClient.js` | `endpoints.threats` (`GET /dashboard/threats`) lost its only consumer when the Dashboard drill-down moved to the real per-unit mix (F-03). The endpoint is still used server-side by `/telemetry/presets` and the copilot's threat branch. |

## 4. How to re-verify

```bash
# backend
.venv/bin/uvicorn src.api:app --port 8000

# every GET, with shapes
for e in /health /api/v1/dashboard/kpis /api/v1/dashboard/contributors \
         /api/v1/dashboard/threats /api/v1/risk/runs /api/v1/risk/losses \
         /api/v1/optimization/plan /api/v1/audit/vulnerabilities/summary \
         /api/v1/audit/controls /api/v1/audit/assets \
         /api/v1/compliance/frameworks /api/v1/settings \
         /api/v1/telemetry/events /api/v1/business-processes; do
  echo "### $e"; curl -s "http://127.0.0.1:8000$e" | head -c 400; echo
done

# frontend
cd frontend && npm run dev -- --port 5173
npm run build          # must stay clean
```

To prove no fallback data remains, stop the backend and reload: every panel must show
an error with a Retry, and no panel may show a rupee figure.

```bash
grep -rn "fallback\|demoData" frontend/src --include=*.jsx --include=*.js
# only lib/useApi.js's explanatory comment and HeroCanvas's local readColor(varName, fallback) should match
```
