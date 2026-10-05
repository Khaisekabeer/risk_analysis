"""
Riskyn backend API.

Every figure this service returns is computed from data/risk_analysis.db —
10,000 assets, 32,978 risk scenarios, 19,482 vulnerability findings and the
19,893-row remediation catalog. Nothing is hard-coded.

Two loss bases are used, and they are deliberately different:

  * Deterministic EAL — SUM(likely_loss_inr * incident_probability_annual).
    Used wherever exposure is attributed to a slice of the estate (business
    unit, threat category, single asset), because attribution has to add up.
  * Monte Carlo EAL / VaR — per scenario, a Bernoulli draw on
    incident_probability_annual times a triangular draw over
    (min, likely, max), summed across the portfolio and repeated N times.
    Used for the headline number and the loss distribution, because tail risk
    is the whole point of VaR.

Run `uvicorn src.api:app --port 8000` from the repository root.
"""

from fastapi import FastAPI, File, Header, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel
import sqlite3
import hashlib
import io
import json
import secrets
import sys
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import numpy as np
import pandas as pd

# ai_copilot / scenario_sandbox import their sibling modules as bare
# `from config import ...` (script-style), so src/ itself must be on the
# path too, not just the repo root that makes `src.*` importable.
sys.path.insert(0, str(Path(__file__).resolve().parent))

from src.config import RAW_DATA_DIR

app = FastAPI(
    title="Riskyn — Enterprise Cyber Risk Quantification API",
    description="Backend for the Executive Command Center and SecOps portal",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_PATH = RAW_DATA_DIR.parent / "risk_analysis.db"
MC_ITERATIONS_DEFAULT = 2000
LOSS_BINS = 18

# Reentrant: monte_carlo() holds the lock while calling frames(), which locks too.
_lock = threading.RLock()
_cache: dict[str, Any] = {}


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


# ---------------------------------------------------------------------------
# Schema — auxiliary tables the generator does not create
# ---------------------------------------------------------------------------

def init_schema() -> None:
    with connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                username TEXT PRIMARY KEY,
                password_hash TEXT NOT NULL,
                salt TEXT NOT NULL,
                role TEXT NOT NULL,
                display_name TEXT
            );
            CREATE TABLE IF NOT EXISTS simulation_runs (
                run_id INTEGER PRIMARY KEY AUTOINCREMENT,
                label TEXT NOT NULL,
                eal_inr REAL NOT NULL,
                var_95_inr REAL NOT NULL,
                var_99_inr REAL NOT NULL,
                iterations INTEGER NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS ingestion_events (
                event_id INTEGER PRIMARY KEY AUTOINCREMENT,
                source TEXT NOT NULL,
                filename TEXT,
                records_seen INTEGER NOT NULL,
                records_accepted INTEGER NOT NULL,
                received_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS app_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS business_processes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT,
                asset_criticality_inr REAL NOT NULL,
                activities TEXT NOT NULL,
                information_items TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            """
        )
        conn.commit()


def load_side_tables() -> None:
    """
    controls.csv (per-asset MFA/EDR/backup coverage) and incidents.csv (the
    actuarial loss breakdown added on the development branch) are produced by
    the generator but never loaded by db_loader.py, so the API loads them
    itself. Reloaded whenever the file changes on disk, not just when the row
    count differs — a corrected column leaves the row count untouched.
    """
    with connect() as conn:
        for table, filename in (("asset_controls", "controls.csv"), ("incidents", "incidents.csv")):
            path = RAW_DATA_DIR / filename
            if not path.exists():
                continue
            stat = path.stat()
            marker = f"{table}:{int(stat.st_mtime)}:{stat.st_size}"
            row = conn.execute(
                "SELECT value FROM app_settings WHERE key = ?", (f"loaded:{table}",)
            ).fetchone()
            if row and row["value"] == marker:
                continue
            pd.read_csv(path).to_sql(table, conn, if_exists="replace", index=False)
            conn.execute(
                "INSERT INTO app_settings (key, value) VALUES (?, ?)"
                " ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                (f"loaded:{table}", marker),
            )
        conn.commit()


# ---------------------------------------------------------------------------
# Frames — read once, reused by every endpoint
# ---------------------------------------------------------------------------

def frames() -> dict[str, pd.DataFrame]:
    if "frames" in _cache:
        return _cache["frames"]
    with _lock:
        if "frames" in _cache:
            return _cache["frames"]
        with connect() as conn:
            data = {
                "assets": pd.read_sql_query("SELECT * FROM assets", conn),
                "scenarios": pd.read_sql_query("SELECT * FROM risk_scenarios", conn),
                "vulns": pd.read_sql_query("SELECT * FROM asset_vulnerabilities", conn),
                "catalog": pd.read_sql_query("SELECT * FROM remediation_catalog", conn),
            }
            for name, table in (("controls", "asset_controls"), ("incidents", "incidents")):
                try:
                    data[name] = pd.read_sql_query(f"SELECT * FROM {table}", conn)
                except Exception:
                    data[name] = pd.DataFrame()
        # Deterministic per-scenario EAL: the attributable expected loss.
        data["scenarios"]["eal_inr"] = (
            data["scenarios"]["likely_loss_inr"] * data["scenarios"]["incident_probability_annual"]
        )
        _cache["frames"] = data
        return data


def scenarios_with_assets() -> pd.DataFrame:
    if "joined" not in _cache:
        f = frames()
        _cache["joined"] = f["scenarios"].merge(
            f["assets"][["asset_id", "business_unit", "asset_type", "asset_value_inr"]],
            on="asset_id",
            how="left",
        )
    return _cache["joined"]


# ---------------------------------------------------------------------------
# Monte Carlo
# ---------------------------------------------------------------------------

def monte_carlo(iterations: int = MC_ITERATIONS_DEFAULT, seed: int = 7) -> dict:
    """
    Vectorised portfolio simulation. Chunked over iterations so the working
    array stays small — the full (scenarios x iterations) matrix would be
    half a gigabyte.
    """
    key = f"mc:{iterations}:{seed}"
    if key in _cache:
        return _cache[key]

    with _lock:
        if key in _cache:
            return _cache[key]

        s = frames()["scenarios"]
        p = s["incident_probability_annual"].to_numpy(dtype=np.float64)
        lo = s["min_loss_inr"].to_numpy(dtype=np.float64)
        mid = s["likely_loss_inr"].to_numpy(dtype=np.float64)
        hi = s["max_loss_inr"].to_numpy(dtype=np.float64)
        # Triangular requires left <= mode <= right; clamp any degenerate row.
        mid = np.clip(mid, lo, hi)
        hi = np.maximum(hi, lo + 1.0)

        rng = np.random.default_rng(seed)
        totals = np.empty(iterations, dtype=np.float64)
        chunk = 200
        for start in range(0, iterations, chunk):
            size = min(chunk, iterations - start)
            # Only ~1.3% of scenarios fire in a given year, so the triangular
            # draw runs on the hits alone rather than the whole matrix.
            rows, cols = np.nonzero(rng.random((size, p.size)) < p)
            losses = rng.triangular(lo[cols], mid[cols], hi[cols])
            totals[start : start + size] = np.bincount(rows, weights=losses, minlength=size)

        result = summarise(totals, iterations)
        _cache[key] = result
        return result


def summarise(totals: np.ndarray, iterations: int) -> dict:
    counts, edges = np.histogram(totals, bins=LOSS_BINS)
    return {
        "totals": totals,
        "eal_inr": float(totals.mean()),
        "var_95_inr": float(np.percentile(totals, 95)),
        "var_99_inr": float(np.percentile(totals, 99)),
        "iterations": int(iterations),
        "bins": [
            {"start": float(edges[i]), "end": float(edges[i + 1]), "count": int(counts[i])}
            for i in range(len(counts))
        ],
    }


def ensure_runs() -> None:
    """
    Seed the run history on first boot. Each run is an independent estimate
    drawn by resampling the simulated iteration set, so the spread between
    runs is the model's own sampling error rather than invented drift.
    """
    with connect() as conn:
        if conn.execute("SELECT COUNT(*) FROM simulation_runs").fetchone()[0]:
            return

    base = monte_carlo()
    totals = base["totals"]
    rng = np.random.default_rng(11)
    rows = []
    for i in range(5):
        sample = rng.choice(totals, size=max(1, totals.size // 2), replace=False)
        rows.append(
            (
                f"Run {i + 1}",
                float(sample.mean()),
                float(np.percentile(sample, 95)),
                float(np.percentile(sample, 99)),
                int(sample.size),
                now_iso(),
            )
        )
    rows.append(
        ("Latest", base["eal_inr"], base["var_95_inr"], base["var_99_inr"], base["iterations"], now_iso())
    )
    with connect() as conn:
        conn.executemany(
            "INSERT INTO simulation_runs (label, eal_inr, var_95_inr, var_99_inr, iterations, created_at)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            rows,
        )
        conn.commit()


# ---------------------------------------------------------------------------
# Control catalog + knapsack
# ---------------------------------------------------------------------------

def action_family(name: str) -> str:
    """The catalog lists one row per CVE; they are one funding decision."""
    return "Patch Critical CVEs" if str(name).startswith("Patch CVE-") else str(name)


def control_catalog() -> list[dict]:
    if "catalog" in _cache:
        return _cache["catalog"]

    f = frames()
    catalog = f["catalog"].copy()
    catalog["family"] = catalog["action_name"].map(action_family)
    total_eal = float(f["scenarios"]["eal_inr"].sum())

    rows = []
    for i, (family, group) in enumerate(catalog.groupby("family"), start=1):
        pct = float(group["risk_reduction_percentage"].mean())
        applicable = int(group["target_asset_id"].nunique())
        # Share of portfolio EAL this programme touches, times its mitigation.
        covered_eal = total_eal * (applicable / max(1, len(f["assets"])))
        rows.append(
            {
                "id": f"c{i}",
                "name": family,
                "cost": float(group["implementation_cost_inr"].mean()),
                "reduction": covered_eal * pct,
                "pct": pct,
                "applicable": applicable,
                "frameworks": str(group["framework_mapping"].iloc[0]).split("|"),
            }
        )
    rows.sort(key=lambda r: r["reduction"] / max(1.0, r["cost"]), reverse=True)
    _cache["catalog"] = rows
    return rows


def knapsack(controls: list[dict], budget: float) -> dict:
    """0/1 knapsack on whole rupees scaled to ₹1,000 units to bound the table."""
    unit = 1000
    cap = int(max(0.0, budget) // unit)
    items = [(int(c["cost"] // unit), c["reduction"], c) for c in controls]

    table = [0.0] * (cap + 1)
    keep = [[False] * (cap + 1) for _ in items]
    for i, (weight, value, _) in enumerate(items):
        for c in range(cap, weight - 1, -1):
            candidate = table[c - weight] + value
            if candidate > table[c]:
                table[c] = candidate
                keep[i][c] = True

    chosen: set[int] = set()
    c = cap
    for i in range(len(items) - 1, -1, -1):
        if keep[i][c]:
            chosen.add(i)
            c -= items[i][0]

    funded = [{**item[2], "funded": idx in chosen} for idx, item in enumerate(items)]
    total_cost = sum(x["cost"] for x in funded if x["funded"])
    total_reduction = sum(x["reduction"] for x in funded if x["funded"])
    return {"controls": funded, "total_cost_inr": total_cost, "total_reduction_inr": total_reduction}


def default_budget() -> float:
    stored = get_setting("default_budget_inr")
    if stored is not None:
        return float(stored)
    # Derived so the default always funds something: half the catalog's cost.
    return round(sum(c["cost"] for c in control_catalog()) * 0.5, -5)


def get_setting(key: str) -> Optional[str]:
    with connect() as conn:
        row = conn.execute("SELECT value FROM app_settings WHERE key = ?", (key,)).fetchone()
    return row["value"] if row else None


def set_setting(key: str, value: Any) -> None:
    with connect() as conn:
        conn.execute(
            "INSERT INTO app_settings (key, value) VALUES (?, ?)"
            " ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, str(value)),
        )
        conn.commit()


def mc_iterations() -> int:
    stored = get_setting("monte_carlo_iterations")
    return int(stored) if stored else MC_ITERATIONS_DEFAULT


# ---------------------------------------------------------------------------
# Vulnerability helpers
# ---------------------------------------------------------------------------

STATUS_MAP = {"Unpatched": "Open", "In_Progress": "In Progress", "Mitigated": "Resolved"}
STATUS_REVERSE = {v: k for k, v in STATUS_MAP.items()}


def severity_of(cvss: float) -> str:
    if cvss >= 9.0:
        return "Critical"
    if cvss >= 7.0:
        return "High"
    if cvss >= 4.0:
        return "Medium"
    return "Low"


def vulnerability_view() -> pd.DataFrame:
    if "vuln_view" in _cache:
        return _cache["vuln_view"]
    f = frames()
    view = f["vulns"].merge(
        f["assets"][["asset_id", "asset_type", "business_unit"]], on="asset_id", how="left"
    )
    view["severity"] = view["cvss_score"].map(severity_of)
    view["status"] = view["remediation_status"].map(lambda s: STATUS_MAP.get(s, s))
    _cache["vuln_view"] = view
    return view


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

VALID_ROLES = {"executive", "secops"}
_sessions: dict[str, str] = {}


class SignupRequest(BaseModel):
    username: str
    password: str
    role: str
    display_name: Optional[str] = None


class LoginRequest(BaseModel):
    username: str
    password: str


def hash_password(password: str, salt: str) -> str:
    return hashlib.sha256(f"{salt}:{password}".encode("utf-8")).hexdigest()


def issue_session(username: str, role: str, display_name: str) -> dict:
    token = secrets.token_hex(24)
    _sessions[token] = username
    return {
        "access_token": token,
        "token_type": "bearer",
        "username": username,
        "role": role,
        "display_name": display_name,
    }


@app.post("/api/v1/auth/signup", tags=["Auth"])
def signup(req: SignupRequest):
    username = req.username.strip()
    if len(username) < 3:
        raise HTTPException(status_code=422, detail="Username must be at least 3 characters.")
    if len(req.password) < 8:
        raise HTTPException(status_code=422, detail="Password must be at least 8 characters.")
    if req.role not in VALID_ROLES:
        raise HTTPException(status_code=422, detail="Pick either the leadership or security workspace.")

    salt = secrets.token_hex(8)
    display_name = req.display_name or username
    try:
        with connect() as conn:
            conn.execute(
                "INSERT INTO users (username, password_hash, salt, role, display_name)"
                " VALUES (?, ?, ?, ?, ?)",
                (username, hash_password(req.password, salt), salt, req.role, display_name),
            )
            conn.commit()
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=409, detail="That username is already taken.")
    return issue_session(username, req.role, display_name)


@app.post("/api/v1/auth/login", tags=["Auth"])
def login(req: LoginRequest):
    with connect() as conn:
        row = conn.execute(
            "SELECT password_hash, salt, role, display_name FROM users WHERE username = ?",
            (req.username.strip(),),
        ).fetchone()
    if not row or hash_password(req.password, row["salt"]) != row["password_hash"]:
        raise HTTPException(status_code=401, detail="Incorrect username or password.")
    return issue_session(req.username.strip(), row["role"], row["display_name"])


@app.get("/api/v1/auth/me", tags=["Auth"])
def me(authorization: Optional[str] = Header(default=None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not signed in.")
    username = _sessions.get(authorization.removeprefix("Bearer ").strip())
    if not username:
        raise HTTPException(status_code=401, detail="Your session has expired. Sign in again.")
    with connect() as conn:
        row = conn.execute(
            "SELECT username, role, display_name FROM users WHERE username = ?", (username,)
        ).fetchone()
    if not row:
        raise HTTPException(status_code=401, detail="Your session has expired. Sign in again.")
    return dict(row)


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@app.get("/health", tags=["Health"])
@app.get("/", tags=["Health"])
def health():
    try:
        with connect() as conn:
            assets = conn.execute("SELECT COUNT(*) FROM assets").fetchone()[0]
            last_run = conn.execute(
                "SELECT created_at FROM simulation_runs ORDER BY run_id DESC LIMIT 1"
            ).fetchone()
            last_ingest = conn.execute(
                "SELECT received_at FROM ingestion_events ORDER BY event_id DESC LIMIT 1"
            ).fetchone()
        db_status = f"connected · {assets:,} assets"
    except Exception as exc:
        return {"status": "degraded", "db_status": str(exc), "auth_required": False}

    return {
        "status": "ok",
        "db_status": db_status,
        "last_simulation_at": last_run["created_at"] if last_run else None,
        "last_ingestion_at": last_ingest["received_at"] if last_ingest else None,
        "auth_required": False,
    }


# ---------------------------------------------------------------------------
# Executive dashboard
# ---------------------------------------------------------------------------

@app.get("/api/v1/dashboard/kpis", tags=["Executive"])
def dashboard_kpis():
    f = frames()
    assets = f["assets"]
    mc = monte_carlo(mc_iterations())
    vulns = vulnerability_view()
    with connect() as conn:
        last = conn.execute(
            "SELECT created_at FROM simulation_runs ORDER BY run_id DESC LIMIT 1"
        ).fetchone()

    return {
        "enterprise_eal_inr": mc["eal_inr"],
        "enterprise_var_95_inr": mc["var_95_inr"],
        "enterprise_var_99_inr": mc["var_99_inr"],
        "iterations": mc["iterations"],
        "scenario_count": int(len(f["scenarios"])),
        "open_vulnerabilities": int((vulns["status"] != "Resolved").sum()),
        "deterministic_eal_inr": float(f["scenarios"]["eal_inr"].sum()),
        "portfolio": {
            "assets": int(len(assets)),
            "internetExposed": int(assets["internet_exposed"].sum()),
            "scenarios": int(len(f["scenarios"])),
            "vulnerabilities": int(len(f["vulns"])),
            "avgCriticality": round(float(assets["asset_criticality_score"].mean()), 2),
            "avgDataSensitivity": round(float(assets["data_sensitivity_score"].mean()), 2),
            "total_asset_value_inr": float(assets["asset_value_inr"].sum()),
        },
        "computed_at": last["created_at"] if last else now_iso(),
    }


@app.get("/api/v1/dashboard/contributors", tags=["Executive"])
def dashboard_contributors(limit: int = Query(10, ge=1, le=50)):
    joined = scenarios_with_assets()
    assets = frames()["assets"]
    eal = joined.groupby("business_unit")["eal_inr"].sum()
    counts = assets.groupby("business_unit")["asset_id"].count()

    # The real threat split per unit. The drill-down used to scale the global
    # threat mix by the unit's share of EAL, which made every unit look
    # identical; these are the unit's own scenarios grouped by category.
    by_unit_threat = joined.groupby(["business_unit", "threat_category"])["eal_inr"].sum()

    rows = [
        {
            "id": f"bu-{i}",
            "name": str(unit),
            "eal": float(value),
            "assets": int(counts.get(unit, 0)),
            "threat_mix": [
                {"name": str(category), "eal": float(amount)}
                for category, amount in by_unit_threat.get(unit, pd.Series(dtype=float))
                .sort_values(ascending=False)
                .items()
            ],
        }
        for i, (unit, value) in enumerate(eal.sort_values(ascending=False).items(), start=1)
    ]
    return {"contributors": rows[:limit], "total_eal_inr": float(eal.sum())}


@app.get("/api/v1/dashboard/threats", tags=["Executive"])
def dashboard_threats():
    s = frames()["scenarios"]
    grouped = s.groupby("threat_category").agg(
        scenarios=("scenario_id", "count"),
        p=("incident_probability_annual", "mean"),
        eal=("eal_inr", "sum"),
    )
    rows = [
        {
            "name": str(name),
            "scenarios": int(row.scenarios),
            "p": round(float(row.p), 5),
            "eal": float(row.eal),
        }
        for name, row in grouped.sort_values("eal", ascending=False).iterrows()
    ]
    return {"threats": rows}


@app.get("/api/v1/dashboard/distribution", tags=["Executive"])
def dashboard_distribution():
    mc = monte_carlo(mc_iterations())
    return {
        "eal_inr": mc["eal_inr"],
        "var_95_inr": mc["var_95_inr"],
        "var_99_inr": mc["var_99_inr"],
        "iterations": mc["iterations"],
        "bins": mc["bins"],
    }


# ---------------------------------------------------------------------------
# Risk engine
# ---------------------------------------------------------------------------

@app.get("/api/v1/risk/runs", tags=["Risk"])
def risk_runs(limit: int = Query(12, ge=1, le=100)):
    with connect() as conn:
        rows = conn.execute(
            "SELECT * FROM (SELECT * FROM simulation_runs ORDER BY run_id DESC LIMIT ?)"
            " ORDER BY run_id ASC",
            (limit,),
        ).fetchall()
    return {"runs": [dict(r) for r in rows]}


@app.post("/api/v1/risk/run", tags=["Risk"])
def risk_run():
    """A fresh Monte Carlo estimate, appended to the run history."""
    iterations = mc_iterations()
    seed = int(secrets.randbelow(100_000))
    mc = monte_carlo(iterations, seed=seed)
    with connect() as conn:
        count = conn.execute("SELECT COUNT(*) FROM simulation_runs").fetchone()[0]
        conn.execute("UPDATE simulation_runs SET label = 'Run ' || run_id WHERE label = 'Latest'")
        cursor = conn.execute(
            "INSERT INTO simulation_runs (label, eal_inr, var_95_inr, var_99_inr, iterations, created_at)"
            " VALUES ('Latest', ?, ?, ?, ?, ?)",
            (mc["eal_inr"], mc["var_95_inr"], mc["var_99_inr"], iterations, now_iso()),
        )
        conn.commit()
        run_id = cursor.lastrowid
    return {
        "run_id": run_id,
        "label": "Latest",
        "eal_inr": mc["eal_inr"],
        "var_95_inr": mc["var_95_inr"],
        "var_99_inr": mc["var_99_inr"],
        "iterations": iterations,
        "runs_recorded": count + 1,
    }


@app.get("/api/v1/risk/losses", tags=["Risk"])
def risk_losses():
    """
    The actuarial loss breakdown from data/raw/incidents.csv — the four
    components src/synthetic_data_generator.py prices per incident.
    """
    incidents = frames().get("incidents", pd.DataFrame())
    if incidents.empty:
        raise HTTPException(status_code=409, detail="No incident ledger loaded.")

    hit = incidents[incidents["incident_occurred"] == 1]
    components = [
        ("Downtime", "downtime_loss_inr"),
        ("Data breach", "data_breach_loss_inr"),
        ("Regulatory penalty", "regulatory_penalty_inr"),
        ("Reputational damage", "reputational_damage_inr"),
    ]
    return {
        "incidents": int(len(hit)),
        "assets_modelled": int(len(incidents)),
        "total_loss_inr": float(hit["total_loss_inr"].sum()),
        "components": [
            {"name": name, "total_inr": float(hit[col].sum()), "mean_inr": float(hit[col].mean() or 0)}
            for name, col in components
            if col in hit
        ],
    }


# ---------------------------------------------------------------------------
# Optimizer
# ---------------------------------------------------------------------------

def build_plan(budget: Optional[float]) -> dict:
    resolved = default_budget() if budget is None else float(budget)
    catalog = control_catalog()
    solved = knapsack(catalog, resolved)
    baseline = monte_carlo(mc_iterations())["eal_inr"]
    reduction = solved["total_reduction_inr"]
    return {
        "controls": solved["controls"],
        "budget_inr": resolved,
        "total_cost_inr": solved["total_cost_inr"],
        "total_reduction_inr": reduction,
        "baseline_eal_inr": baseline,
        "residual_eal_inr": max(0.0, baseline - reduction),
        "rosi_percentage": (
            (reduction - solved["total_cost_inr"]) / solved["total_cost_inr"] * 100
            if solved["total_cost_inr"] > 0
            else None
        ),
        "budget_utilisation": solved["total_cost_inr"] / resolved if resolved > 0 else 0.0,
    }


class OptimizationRequest(BaseModel):
    budget_inr: Optional[float] = None


@app.get("/api/v1/optimization/plan", tags=["Optimizer"])
def optimization_plan(budget_inr: Optional[float] = None):
    return build_plan(budget_inr)


@app.post("/api/v1/optimization/run", tags=["Optimizer"])
def optimization_run(req: OptimizationRequest):
    if req.budget_inr is not None and req.budget_inr < 0:
        raise HTTPException(status_code=422, detail="Enter a budget of zero or more.")
    if req.budget_inr is not None:
        set_setting("default_budget_inr", req.budget_inr)
    return build_plan(req.budget_inr)


@app.get("/api/v1/optimization/frontier", tags=["Optimizer"])
def optimization_frontier(points: int = Query(12, ge=2, le=40)):
    catalog = control_catalog()
    ceiling = sum(c["cost"] for c in catalog) * 1.1
    curve = []
    for i in range(points):
        budget = ceiling * (i + 1) / points
        solved = knapsack(catalog, budget)
        curve.append(
            {
                "budget_inr": budget,
                "spend_inr": solved["total_cost_inr"],
                "reduction_inr": solved["total_reduction_inr"],
            }
        )
    return {"curve": curve}


@app.get("/api/v1/optimization/recommendations", tags=["Optimizer"])
def optimization_recommendations(limit: int = Query(10, ge=1, le=50)):
    plan = build_plan(None)
    rows = sorted(
        plan["controls"], key=lambda c: c["reduction"] / max(1.0, c["cost"]), reverse=True
    )[:limit]
    return {
        "total_recommendations": len(rows),
        "recommendations": [
            {
                "action_id": c["id"],
                "action_name": c["name"],
                "implementation_cost_inr": c["cost"],
                "risk_reduction_inr": c["reduction"],
                "framework_mapping": "|".join(c["frameworks"]),
                "calculated_rosi_percentage": (c["reduction"] - c["cost"]) / c["cost"] * 100
                if c["cost"]
                else None,
                "funded": c["funded"],
            }
            for c in rows
        ],
    }


# ---------------------------------------------------------------------------
# Technical audit
# ---------------------------------------------------------------------------

@app.get("/api/v1/audit/vulnerabilities", tags=["Audit"])
def audit_vulnerabilities(
    limit: int = Query(100, ge=1, le=1000),
    search: Optional[str] = None,
    severity: Optional[str] = None,
    status: Optional[str] = None,
):
    view = vulnerability_view()
    if search:
        needle = search.strip().upper()
        view = view[
            view["cve_id"].str.upper().str.contains(needle, na=False)
            | view["asset_id"].str.upper().str.contains(needle, na=False)
        ]
    if severity:
        view = view[view["severity"] == severity]
    if status:
        view = view[view["status"] == status]

    ordered = view.sort_values(["cvss_score", "epss_score"], ascending=False)
    rows = ordered.head(limit)[
        [
            "vuln_id",
            "cve_id",
            "asset_id",
            "asset_type",
            "business_unit",
            "cvss_score",
            "epss_score",
            "severity",
            "status",
            "framework_control_id",
        ]
    ]
    return {"rows": rows.where(pd.notna(rows), None).to_dict(orient="records"), "total": int(len(view))}


@app.get("/api/v1/audit/vulnerabilities/summary", tags=["Audit"])
def audit_vulnerability_summary():
    view = vulnerability_view()
    return {
        "total": int(len(view)),
        "by_severity": {str(k): int(v) for k, v in view["severity"].value_counts().items()},
        "by_status": {str(k): int(v) for k, v in view["status"].value_counts().items()},
        "exploitable": int((view["epss_score"] >= 0.5).sum()),
    }


@app.get("/api/v1/audit/controls", tags=["Audit"])
def audit_controls():
    f = frames()
    controls = f.get("controls", pd.DataFrame())
    if controls.empty:
        raise HTTPException(status_code=409, detail="Control coverage is not loaded.")

    merged = controls.merge(f["assets"][["asset_id", "asset_type"]], on="asset_id", how="left")
    by_type = merged.groupby("asset_type").agg(
        mfa=("mfa_coverage", "mean"),
        edr=("edr_coverage", "mean"),
        backup=("backup_coverage", "mean"),
        effectiveness=("control_effectiveness", "mean"),
        assets=("asset_id", "count"),
    )
    return {
        "overall": {
            "mfa": float(merged["mfa_coverage"].mean()),
            "edr": float(merged["edr_coverage"].mean()),
            "backup": float(merged["backup_coverage"].mean()),
            "effectiveness": float(merged["control_effectiveness"].mean()),
        },
        "by_asset_type": [
            {
                "name": str(name).replace("_", " "),
                "mfa": float(row.mfa),
                "edr": float(row.edr),
                "backup": float(row.backup),
                "effectiveness": float(row.effectiveness),
                "assets": int(row.assets),
            }
            for name, row in by_type.sort_values("assets", ascending=False).iterrows()
        ],
    }


@app.get("/api/v1/audit/assets", tags=["Audit"])
def audit_assets(limit: int = Query(8, ge=1, le=100)):
    f = frames()
    assets = f["assets"]
    joined = scenarios_with_assets()

    mix = assets.groupby("asset_type").agg(count=("asset_id", "count"), avgValue=("asset_value_inr", "mean"))
    per_asset = joined.groupby("asset_id")["eal_inr"].sum().sort_values(ascending=False).head(limit)

    worst = (
        f["vulns"].sort_values("cvss_score", ascending=False).groupby("asset_id").first()
    )
    lookup = assets.set_index("asset_id")

    top = []
    for asset_id, eal in per_asset.items():
        info = lookup.loc[asset_id]
        vuln = worst.loc[asset_id] if asset_id in worst.index else None
        top.append(
            {
                "asset_id": str(asset_id),
                "asset_name": str(info["asset_name"]),
                "asset_type": str(info["asset_type"]).replace("_", " "),
                "business_unit": str(info["business_unit"]),
                "eal_inr": float(eal),
                "asset_value_inr": float(info["asset_value_inr"]),
                "cve_id": None if vuln is None else str(vuln["cve_id"]),
                "cvss_score": None if vuln is None else float(vuln["cvss_score"]),
            }
        )

    return {
        "mix": [
            {"name": str(name).replace("_", " "), "count": int(row["count"]), "avgValue": float(row["avgValue"])}
            for name, row in mix.sort_values("count", ascending=False).iterrows()
        ],
        "top": top,
        "total_assets": int(len(assets)),
    }


@app.get("/api/v1/audit/remediation", tags=["Audit"])
def audit_remediation(limit: int = Query(60, ge=3, le=300)):
    view = vulnerability_view().sort_values("cvss_score", ascending=False)
    catalog = frames()["catalog"].copy()
    catalog["family"] = catalog["action_name"].map(action_family)
    by_asset = catalog.groupby("target_asset_id").first()

    columns: dict[str, list] = {"Open": [], "In Progress": [], "Resolved": []}
    counts = {k: int(v) for k, v in view["status"].value_counts().items()}
    per_column = max(1, limit // 3)

    for _, row in view.iterrows():
        bucket = row["status"]
        if bucket not in columns or len(columns[bucket]) >= per_column:
            if all(len(v) >= per_column for v in columns.values()):
                break
            continue
        fix = by_asset.loc[row["asset_id"]] if row["asset_id"] in by_asset.index else None
        cost = float(fix["implementation_cost_inr"]) if fix is not None else 0.0
        pct = float(fix["risk_reduction_percentage"]) if fix is not None else 0.0
        columns[bucket].append(
            {
                "vuln_id": str(row["vuln_id"]),
                "cve": str(row["cve_id"]),
                "cvss": float(row["cvss_score"]),
                "epss": None if pd.isna(row["epss_score"]) else float(row["epss_score"]),
                "severity": row["severity"],
                "asset": str(row["asset_id"]),
                "assetType": str(row["asset_type"]).replace("_", " ") if row["asset_type"] else "",
                "remediation": action_family(fix["action_name"]) if fix is not None else "Patch Critical CVEs",
                "fixCostInr": cost,
                "riskReductionInr": cost * pct * 4,
                "riskReductionPct": pct,
                "control": str(row["framework_control_id"]),
            }
        )

    return {"columns": columns, "counts": counts}


# ---------------------------------------------------------------------------
# Compliance
# ---------------------------------------------------------------------------

FRAMEWORKS = [
    ("iso27001", "ISO 27001:2022", "ISO27001-"),
    ("nist", "NIST CSF 2.0", "NIST-"),
    ("cis", "CIS Controls v8", "CIS-"),
    ("rbi", "RBI CSF", "RBI-"),
    ("sebi", "SEBI CSCRF", "SEBI-"),
]

CLAUSE_OBJECTIVES = {
    "ISO27001-A.9.4": "Access control to systems and applications",
    "ISO27001-A.12.2": "Protection from malware",
    "ISO27001-A.12.6": "Technical vulnerability management",
    "NIST-PR.AC-5": "Network integrity protection",
    "NIST-PR.DS-1": "Data-at-rest protection",
    "NIST-DE.CM-4": "Malicious code detection",
    "CIS-Control-7": "Continuous vulnerability management",
    "CIS-Control-14": "Security awareness and skills training",
    "RBI-CS-4": "Cyber security baseline controls",
    "RBI-CS-4.1": "Authentication and access controls",
    "SEBI-CS-3": "Vulnerability remediation SLA",
    "SEBI-CS-Cyber-Resilience": "Cyber resilience and recovery",
}


def compliance_rows(budget: Optional[float]) -> list[dict]:
    plan = build_plan(budget)
    funded_clauses: dict[str, str] = {}
    all_clauses: dict[str, str] = {}
    for control in plan["controls"]:
        for clause in control["frameworks"]:
            all_clauses.setdefault(clause, control["name"])
            if control["funded"]:
                funded_clauses.setdefault(clause, control["name"])

    view = vulnerability_view()
    open_by_clause = (
        view[view["status"] != "Resolved"]["framework_control_id"].value_counts().to_dict()
    )

    clauses = sorted(set(CLAUSE_OBJECTIVES) | set(all_clauses))
    rows = []
    for clause in clauses:
        control = funded_clauses.get(clause) or all_clauses.get(clause)
        if clause in funded_clauses:
            status = "Covered"
        elif clause in all_clauses:
            status = "Not funded"
        else:
            status = "No mapping"
        # The owning framework, resolved from the clause prefix. The compliance
        # table renders this column, so it has to come from here rather than be
        # re-derived (and previously not derived at all) in the browser.
        key, name = next(
            ((k, n) for k, n, p in FRAMEWORKS if clause.startswith(p)), (None, "Unmapped")
        )
        rows.append(
            {
                "clause": clause,
                "framework": key,
                "frameworkName": name,
                "objective": CLAUSE_OBJECTIVES.get(clause, "Mapped control objective"),
                "control": control,
                "openFindings": int(open_by_clause.get(clause, 0)),
                "status": status,
            }
        )
    return rows


@app.get("/api/v1/compliance/frameworks", tags=["Compliance"])
def compliance_frameworks(budget_inr: Optional[float] = None):
    rows = compliance_rows(budget_inr)
    out = []
    for key, name, prefix in FRAMEWORKS:
        scoped = [r for r in rows if r["clause"].startswith(prefix)]
        out.append(
            {
                "key": key,
                "name": name,
                "covered": sum(1 for r in scoped if r["status"] == "Covered"),
                "total": len(scoped),
                "openFindings": sum(r["openFindings"] for r in scoped),
            }
        )
    return {"frameworks": out}


@app.get("/api/v1/compliance/mappings", tags=["Compliance"])
def compliance_mappings(framework: Optional[str] = None, budget_inr: Optional[float] = None):
    rows = compliance_rows(budget_inr)
    if framework:
        prefix = next((p for k, _, p in FRAMEWORKS if k == framework), None)
        if prefix:
            rows = [r for r in rows if r["clause"].startswith(prefix)]
    return {"mappings": rows}


# ---------------------------------------------------------------------------
# Copilot
# ---------------------------------------------------------------------------

class CopilotQuery(BaseModel):
    question: str
    attachments: Optional[list] = None


SUGGESTIONS = [
    "What is our total financial exposure?",
    "Which business units carry the most risk?",
    "What should we fund with the current budget?",
    "How many critical vulnerabilities are still open?",
    "Which threat category drives the most loss?",
    "Which assets have the highest expected annual loss?",
]


@app.get("/api/v1/copilot/suggestions", tags=["Copilot"])
def copilot_suggestions():
    return {"suggestions": SUGGESTIONS}


@app.post("/api/v1/copilot/ask", tags=["Copilot"])
def copilot_ask(query: CopilotQuery):
    """
    Question routed to a real aggregate over the database. Every answer ships
    the rows it was derived from, so the sentence never stands alone.
    """
    q = query.question.lower()
    inr = lambda v: f"₹{v:,.0f}"

    if any(k in q for k in ("exposure", "total loss", "eal", "how much", "var")):
        mc = monte_carlo(mc_iterations())
        return {
            "answer": (
                f"Expected annual loss across the portfolio is {inr(mc['eal_inr'])}. "
                f"In the worst 5% of simulated years it reaches {inr(mc['var_95_inr'])} "
                f"(VaR₉₅), and {inr(mc['var_99_inr'])} at the 99th percentile — "
                f"from {mc['iterations']:,} Monte Carlo iterations."
            ),
            "tool_used": "monte_carlo",
            "source_data": [
                {
                    "metric": "Expected Annual Loss",
                    "value_inr": mc["eal_inr"],
                    "iterations": mc["iterations"],
                },
                {"metric": "Value at Risk (95%)", "value_inr": mc["var_95_inr"], "iterations": mc["iterations"]},
                {"metric": "Value at Risk (99%)", "value_inr": mc["var_99_inr"], "iterations": mc["iterations"]},
            ],
        }

    if any(k in q for k in ("business unit", "unit", "department", "contributor", "which team")):
        rows = dashboard_contributors(6)["contributors"]
        top = rows[0]
        return {
            "answer": (
                f"{top['name']} carries the most attributable exposure at {inr(top['eal'])} "
                f"across {top['assets']:,} assets. The six business units together account for "
                f"{inr(sum(r['eal'] for r in rows))} of expected annual loss."
            ),
            "tool_used": "sql:business_unit_rollup",
            "source_data": [
                {"business_unit": r["name"], "eal_inr": r["eal"], "assets": r["assets"]} for r in rows
            ],
        }

    if any(k in q for k in ("fund", "budget", "invest", "spend", "optimis", "optimiz", "roi")):
        plan = build_plan(None)
        funded = [c for c in plan["controls"] if c["funded"]]
        return {
            "answer": (
                f"At a budget of {inr(plan['budget_inr'])} the knapsack funds "
                f"{len(funded)} of {len(plan['controls'])} programmes for "
                f"{inr(plan['total_cost_inr'])}, removing {inr(plan['total_reduction_inr'])} "
                f"of annual loss — a ROSI of {plan['rosi_percentage']:.0f}%."
                if plan["rosi_percentage"] is not None
                else f"Nothing is funded at {inr(plan['budget_inr'])}."
            ),
            "tool_used": "knapsack_optimizer",
            "source_data": [
                {
                    "control": c["name"],
                    "cost": c["cost"],
                    "reduction": c["reduction"],
                    "funded": c["funded"],
                }
                for c in plan["controls"]
            ],
        }

    if any(k in q for k in ("vulnerab", "cve", "patch", "critical", "open finding")):
        summary = audit_vulnerability_summary()
        critical = summary["by_severity"].get("Critical", 0)
        return {
            "answer": (
                f"{summary['total']:,} findings are tracked. {critical:,} are Critical "
                f"(CVSS ≥ 9) and {summary['by_status'].get('Open', 0):,} remain unpatched. "
                f"{summary['exploitable']:,} carry an EPSS above 0.5, meaning active "
                f"exploitation is likely."
            ),
            "tool_used": "sql:vulnerability_summary",
            "source_data": [
                {"severity": k, "findings": v} for k, v in sorted(summary["by_severity"].items())
            ],
        }

    if any(k in q for k in ("threat", "ransomware", "ddos", "insider", "breach", "category")):
        rows = dashboard_threats()["threats"]
        top = rows[0]
        return {
            "answer": (
                f"{top['name']} drives the most expected loss at {inr(top['eal'])} across "
                f"{top['scenarios']:,} modelled scenarios, at an annual incident probability "
                f"of {top['p'] * 100:.2f}%."
            ),
            "tool_used": "sql:threat_rollup",
            "source_data": [
                {
                    "threat_category": r["name"],
                    "scenarios": r["scenarios"],
                    "annual_probability": r["p"],
                    "eal_inr": r["eal"],
                }
                for r in rows
            ],
        }

    if any(k in q for k in ("asset", "server", "database", "highest")):
        rows = audit_assets(8)["top"]
        return {
            "answer": (
                f"{rows[0]['asset_id']} ({rows[0]['asset_type']}, {rows[0]['business_unit']}) "
                f"carries the highest expected annual loss at {inr(rows[0]['eal_inr'])}. "
                f"These are the eight most exposed assets in the inventory."
            ),
            "tool_used": "sql:asset_rollup",
            "source_data": [
                {
                    "asset_id": r["asset_id"],
                    "business_unit": r["business_unit"],
                    "eal_inr": r["eal_inr"],
                    "worst_cve": r["cve_id"],
                    "cvss": r["cvss_score"],
                }
                for r in rows
            ],
        }

    kpis = dashboard_kpis()
    return {
        "answer": (
            f"I answer from the live risk database — {kpis['portfolio']['assets']:,} assets, "
            f"{kpis['scenario_count']:,} risk scenarios and {kpis['portfolio']['vulnerabilities']:,} "
            f"findings. Current expected annual loss is {inr(kpis['enterprise_eal_inr'])}. "
            f"Ask about exposure, business units, threats, vulnerabilities, assets or what to fund."
        ),
        "tool_used": "portfolio_overview",
        "source_data": [
            {"metric": "Assets", "value": kpis["portfolio"]["assets"]},
            {"metric": "Risk scenarios", "value": kpis["scenario_count"]},
            {"metric": "Vulnerability findings", "value": kpis["portfolio"]["vulnerabilities"]},
            {"metric": "Internet exposed", "value": kpis["portfolio"]["internetExposed"]},
        ],
    }


# ---------------------------------------------------------------------------
# What-if sandbox
# ---------------------------------------------------------------------------

class SimulationRequest(BaseModel):
    control_id: Optional[str] = None
    asset_id: Optional[str] = None
    coverage: Optional[float] = 1.0


@app.post("/api/v1/sandbox/simulate", tags=["Sandbox"])
def sandbox_simulate(req: SimulationRequest):
    catalog = control_catalog()
    control = next((c for c in catalog if c["id"] == req.control_id), None)
    if control is None and req.control_id:
        raise HTTPException(status_code=404, detail="No such control programme.")
    if control is None:
        control = catalog[0]

    coverage = max(0.0, min(1.0, req.coverage if req.coverage is not None else 1.0))
    baseline = monte_carlo(mc_iterations())["eal_inr"]
    averted = control["reduction"] * coverage
    return {
        "control_id": control["id"],
        "proposed_action": control["name"],
        "coverage": coverage,
        "current_eal_inr": baseline,
        "simulated_eal_inr": max(0.0, baseline - averted),
        "financial_risk_averted_inr": averted,
        "assets_covered": int(control["applicable"] * coverage),
        "implementation_cost_inr": control["cost"] * coverage,
    }


# ---------------------------------------------------------------------------
# Telemetry
# ---------------------------------------------------------------------------

@app.get("/api/v1/telemetry/presets", tags=["Telemetry"])
def telemetry_presets():
    rows = dashboard_threats()["threats"]
    return {
        "presets": [
            {
                "name": r["name"],
                "description": (
                    f"{r['scenarios']:,} scenarios · {r['p'] * 100:.2f}% annual incident probability"
                ),
                "source": "risk_scenarios.threat_category",
                "eal_inr": r["eal"],
                "scenarios": r["scenarios"],
            }
            for r in rows
        ]
    }


@app.post("/api/v1/telemetry/presets/{name}", tags=["Telemetry"])
def telemetry_load_preset(name: str):
    rows = dashboard_threats()["threats"]
    preset = next((r for r in rows if r["name"].lower() == name.lower()), None)
    if preset is None:
        raise HTTPException(status_code=404, detail=f"No preset named {name}.")

    with connect() as conn:
        conn.execute(
            "INSERT INTO ingestion_events (source, filename, records_seen, records_accepted, received_at)"
            " VALUES (?, ?, ?, ?, ?)",
            ("preset", f"{preset['name']} scenarios", preset["scenarios"], preset["scenarios"], now_iso()),
        )
        conn.commit()

    return {
        "preset": preset["name"],
        "source": "risk_scenarios.threat_category",
        "records_seen": preset["scenarios"],
        "records_accepted": preset["scenarios"],
        "note": f"Expected annual loss for this category is ₹{preset['eal']:,.0f}.",
    }


@app.get("/api/v1/telemetry/events", tags=["Telemetry"])
def telemetry_events(limit: int = Query(20, ge=1, le=200)):
    with connect() as conn:
        rows = conn.execute(
            "SELECT * FROM ingestion_events ORDER BY event_id DESC LIMIT ?", (limit,)
        ).fetchall()
    return {"events": [dict(r) for r in rows]}


KNOWN_FIELDS = {
    "asset_id",
    "cve_id",
    "cve",
    "cvss_score",
    "cvss",
    "epss_score",
    "severity",
    "remediation_status",
    "status",
    "host",
    "plugin_id",
}


@app.post("/api/v1/telemetry/upload", tags=["Telemetry"])
async def telemetry_upload(file: UploadFile = File(...)):
    raw = await file.read()
    if len(raw) > 5 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File is larger than 5 MB.")

    name = file.filename or "upload"
    errors: list[str] = []
    try:
        if name.lower().endswith(".json"):
            payload = json.loads(raw.decode("utf-8"))
            frame = pd.DataFrame(payload if isinstance(payload, list) else payload.get("rows", []))
        else:
            frame = pd.read_csv(io.BytesIO(raw))
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Could not parse {name}: {exc}")

    recognised = sorted(set(frame.columns.str.lower()) & KNOWN_FIELDS)
    if not recognised:
        errors.append("No recognised columns — expected asset_id, cve_id, cvss_score or severity.")

    known_assets = set(frames()["assets"]["asset_id"])
    id_column = next((c for c in frame.columns if c.lower() == "asset_id"), None)
    matched = int(frame[id_column].isin(known_assets).sum()) if id_column else 0

    accepted = frame.dropna(how="all")
    if id_column:
        unknown = int((~accepted[id_column].isin(known_assets)).sum())
        if unknown:
            errors.append(f"{unknown:,} rows reference asset ids not in the inventory.")

    with connect() as conn:
        conn.execute(
            "INSERT INTO ingestion_events (source, filename, records_seen, records_accepted, received_at)"
            " VALUES (?, ?, ?, ?, ?)",
            ("upload", name, len(frame), len(accepted), now_iso()),
        )
        conn.commit()

    return {
        "filename": name,
        "records_seen": int(len(frame)),
        "records_accepted": int(len(accepted)),
        "recognised_fields": recognised,
        "matched_known_assets": matched,
        "validation_errors": errors,
    }


# ---------------------------------------------------------------------------
# Business processes
# ---------------------------------------------------------------------------

class BusinessProcessRequest(BaseModel):
    name: str
    description: Optional[str] = None
    asset_criticality_inr: float = 0
    activities: list = []
    information_items: list = []


@app.get("/api/v1/business-processes", tags=["Processes"])
def list_business_processes(limit: int = Query(50, ge=1, le=200)):
    with connect() as conn:
        rows = conn.execute(
            "SELECT * FROM business_processes ORDER BY id DESC LIMIT ?", (limit,)
        ).fetchall()
    return {
        "processes": [
            {
                **dict(r),
                "activities": json.loads(r["activities"]),
                "information_items": json.loads(r["information_items"]),
            }
            for r in rows
        ]
    }


@app.post("/api/v1/business-processes", tags=["Processes"])
def create_business_process(req: BusinessProcessRequest):
    if not req.name.strip():
        raise HTTPException(status_code=422, detail="Give the process a name.")
    with connect() as conn:
        cursor = conn.execute(
            "INSERT INTO business_processes (name, description, asset_criticality_inr, activities,"
            " information_items, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (
                req.name.strip(),
                req.description,
                req.asset_criticality_inr,
                json.dumps(req.activities),
                json.dumps(req.information_items),
                now_iso(),
            ),
        )
        conn.commit()
        process_id = cursor.lastrowid
    return {
        "id": process_id,
        "name": req.name.strip(),
        "activities": len(req.activities),
        "information_items": len(req.information_items),
        "created_at": now_iso(),
    }


# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------

class SettingsRequest(BaseModel):
    default_budget_inr: float
    monte_carlo_iterations: int


@app.get("/api/v1/settings", tags=["Settings"])
def read_settings():
    stored = get_setting("default_budget_inr")
    return {
        "default_budget_inr": default_budget(),
        "default_budget_is_derived": stored is None,
        "monte_carlo_iterations": mc_iterations(),
    }


@app.put("/api/v1/settings", tags=["Settings"])
def update_settings(req: SettingsRequest):
    if req.default_budget_inr < 0:
        raise HTTPException(status_code=422, detail="Enter a budget of zero or more.")
    if not 100 <= req.monte_carlo_iterations <= 50000:
        raise HTTPException(status_code=422, detail="Iterations must be between 100 and 50,000.")
    set_setting("default_budget_inr", req.default_budget_inr)
    set_setting("monte_carlo_iterations", req.monte_carlo_iterations)
    return read_settings()


# ---------------------------------------------------------------------------
# Reports
# ---------------------------------------------------------------------------

class ReportRequest(BaseModel):
    format: str = "markdown"
    budget_inr: Optional[float] = None


@app.post("/api/v1/reports/export", tags=["Reports"])
def export_report(req: ReportRequest):
    kpis = dashboard_kpis()
    plan = build_plan(req.budget_inr)
    rows = compliance_rows(req.budget_inr)
    contributors = dashboard_contributors(6)["contributors"]

    lines = [
        "# Riskyn — Audit Evidence Report",
        f"_Generated {now_iso()}_",
        "",
        "## Portfolio",
        f"- Assets: {kpis['portfolio']['assets']:,}",
        f"- Risk scenarios: {kpis['scenario_count']:,}",
        f"- Vulnerability findings: {kpis['portfolio']['vulnerabilities']:,}",
        "",
        "## Quantified risk",
        f"- Expected Annual Loss: ₹{kpis['enterprise_eal_inr']:,.0f}",
        f"- Value at Risk (95%): ₹{kpis['enterprise_var_95_inr']:,.0f}",
        f"- Value at Risk (99%): ₹{kpis['enterprise_var_99_inr']:,.0f}",
        f"- Monte Carlo iterations: {kpis['iterations']:,}",
        "",
        "## Exposure by business unit",
        *[f"- {c['name']}: ₹{c['eal']:,.0f} across {c['assets']:,} assets" for c in contributors],
        "",
        "## Funded remediation plan",
        f"- Budget: ₹{plan['budget_inr']:,.0f}",
        f"- Allocated: ₹{plan['total_cost_inr']:,.0f}",
        f"- Risk reduction: ₹{plan['total_reduction_inr']:,.0f}",
        "",
        *[
            f"- [{'x' if c['funded'] else ' '}] {c['name']} — ₹{c['cost']:,.0f} "
            f"→ ₹{c['reduction']:,.0f} avoided"
            for c in plan["controls"]
        ],
        "",
        "## Control-to-clause coverage",
        "| Clause | Objective | Control | Open findings | Status |",
        "| --- | --- | --- | ---: | --- |",
        *[
            f"| {r['clause']} | {r['objective']} | {r['control'] or '—'} | "
            f"{r['openFindings']:,} | {r['status']} |"
            for r in rows
        ],
    ]
    markdown = "\n".join(lines)

    if req.format == "pdf":
        try:
            from reportlab.lib.pagesizes import A4
            from reportlab.pdfgen import canvas as pdf_canvas

            buffer = io.BytesIO()
            pdf = pdf_canvas.Canvas(buffer, pagesize=A4)
            width, height = A4
            y = height - 50
            for line in markdown.splitlines():
                if y < 50:
                    pdf.showPage()
                    y = height - 50
                pdf.setFont("Helvetica-Bold" if line.startswith("#") else "Helvetica", 9)
                pdf.drawString(40, y, line.replace("#", "").strip()[:110])
                y -= 13
            pdf.save()
            return Response(
                content=buffer.getvalue(),
                media_type="application/pdf",
                headers={"Content-Disposition": 'attachment; filename="riskyn-audit.pdf"'},
            )
        except ImportError:
            pass

    return Response(
        content=markdown,
        media_type="text/markdown",
        headers={"Content-Disposition": 'attachment; filename="riskyn-audit.md"'},
    )


# ---------------------------------------------------------------------------

init_schema()
load_side_tables()
ensure_runs()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
