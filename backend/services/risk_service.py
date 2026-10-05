"""Risk quantification engine — wraps existing trained XGBoost models + Monte Carlo."""

import datetime as dt
import numpy as np
import pandas as pd
import joblib
import shap
from sqlalchemy.orm import Session
from config import settings
from models.all_models import (
    Asset, Vulnerability, RiskRun, RiskScore, BusinessUnit, Control,
    asset_control,
)

# ── Load trained models ONCE at import time ──────────────────────────────
_incident_model = None
_impact_model = None
_scaler = None
_feature_names = None
_shap_explainer = None


def _load_models():
    global _incident_model, _impact_model, _scaler, _feature_names, _shap_explainer
    if _incident_model is not None:
        return
    model_dir = settings.MODEL_DIR
    _incident_model = joblib.load(model_dir / "incident_model_xgb.pkl")
    _impact_model = joblib.load(model_dir / "impact_model_xgb.pkl")
    _scaler = joblib.load(model_dir / "feature_scaler.pkl")
    _feature_names = joblib.load(model_dir / "feature_names.pkl")
    # Extract base XGBoost from CalibratedClassifierCV for SHAP
    base_xgb = _incident_model.calibrated_classifiers_[0].estimator
    _shap_explainer = shap.TreeExplainer(base_xgb)


def _build_feature_df(assets: list[Asset], vulns_by_asset: dict) -> pd.DataFrame:
    """Build a feature DataFrame matching the exact schema the trained model expects."""
    rows = []
    for asset in assets:
        av = vulns_by_asset.get(asset.id, [])
        cvss_scores = [v.cvss_score for v in av if v.cvss_score]
        epss_scores = [v.epss_score for v in av if v.epss_score]

        rows.append({
            "internet_exposed": int(asset.internet_exposed or 0),
            "asset_criticality_score": asset.asset_criticality_score or 1,
            "data_sensitivity_score": asset.data_sensitivity_score or 1,
            "revenue_dependency_score": asset.revenue_dependency_score or 1,
            "asset_value_inr": asset.asset_value_inr or 0,
            "hourly_downtime_cost_inr": asset.hourly_downtime_cost_inr or 0,
            "failed_logins": asset.failed_logins or 0,
            "anomaly_count": asset.anomaly_count or 0,
            "vuln_count": len(av),
            "critical_vuln_count": sum(1 for s in cvss_scores if s >= 9.0),
            "max_cvss": max(cvss_scores) if cvss_scores else 0,
            "mean_cvss": float(np.mean(cvss_scores)) if cvss_scores else 0,
            "max_epss": max(epss_scores) if epss_scores else 0,
            # Categoricals for one-hot
            "asset_type": asset.asset_type or "Server",
            "business_unit": asset.business_unit or "Operations",
        })

    df = pd.DataFrame(rows)
    if df.empty:
        return df

    # One-hot encode categoricals (matching training: drop_first=True)
    df = pd.get_dummies(df, columns=["asset_type", "business_unit"], drop_first=True)

    # Align to trained feature names
    for col in _feature_names:
        if col not in df.columns:
            df[col] = 0
    df = df[_feature_names]

    # Scale numerical features — only those the scaler was trained on
    num_cols = [
        "internet_exposed", "asset_criticality_score", "data_sensitivity_score",
        "revenue_dependency_score", "asset_value_inr", "hourly_downtime_cost_inr",
        "failed_logins", "anomaly_count", "vuln_count", "critical_vuln_count",
        "max_cvss", "mean_cvss", "max_epss",
    ]
    scaler_cols = list(_scaler.feature_names_in_) if hasattr(_scaler, "feature_names_in_") else num_cols
    existing_num = [c for c in num_cols if c in df.columns and c in scaler_cols]
    df[existing_num] = _scaler.transform(df[existing_num])
    return df


def compute_risk_scores(db: Session) -> dict:
    """Run the full risk pipeline: XGBoost likelihood + financial impact + SHAP."""
    _load_models()

    assets = db.query(Asset).all()
    if not assets:
        return {"eal": 0, "scores": []}

    # Fetch vulnerabilities grouped by asset
    all_vulns = db.query(Vulnerability).filter(Vulnerability.status != "remediated").all()
    vulns_by_asset = {}
    for v in all_vulns:
        vulns_by_asset.setdefault(v.asset_id, []).append(v)

    X = _build_feature_df(assets, vulns_by_asset)
    if X.empty:
        return {"eal": 0, "scores": []}

    # Predict
    probabilities = _incident_model.predict_proba(X)[:, 1]
    impacts = _impact_model.predict(X)
    impacts = np.maximum(impacts, 0)  # floor at 0

    # SHAP
    shap_values = _shap_explainer.shap_values(X)
    if isinstance(shap_values, list):
        shap_values = shap_values[1] if len(shap_values) > 1 else shap_values[0]

    scores = []
    total_eal = 0
    for i, asset in enumerate(assets):
        eal = float(probabilities[i] * impacts[i])
        total_eal += eal

        # Top 5 SHAP drivers
        sv = shap_values[i] if i < len(shap_values) else np.zeros(len(_feature_names))
        top_indices = np.argsort(np.abs(sv))[::-1][:5]
        shap_dict = {}
        for idx in top_indices:
            if idx < len(_feature_names):
                shap_dict[_feature_names[idx]] = round(float(sv[idx]), 4)

        vuln_ids = [v.id for v in vulns_by_asset.get(asset.id, [])[:5]]

        score = RiskScore(
            asset_id=asset.id,
            entity_type="asset",
            entity_id=asset.id,
            likelihood=round(float(probabilities[i]), 4),
            financial_impact=round(float(impacts[i]), 2),
            eal=round(eal, 2),
            var_95=round(eal * 2.5, 2),  # Simplified for per-asset
            likelihood_shap_values=shap_dict,
            contributing_vulnerabilities=vuln_ids,
            computed_at=dt.datetime.utcnow(),
        )
        scores.append(score)

    # Persist scores
    db.query(RiskScore).delete()
    db.add_all(scores)
    db.commit()

    return {"eal": total_eal, "scores": scores}


def run_monte_carlo(db: Session, iterations: int = None) -> RiskRun:
    """Run Monte Carlo VaR simulation and persist as a RiskRun."""
    _load_models()
    if iterations is None:
        iterations = settings.MONTE_CARLO_ITERATIONS

    # First compute fresh risk scores
    result = compute_risk_scores(db)
    scores = result["scores"]

    if not scores:
        run = RiskRun(
            label=f"Run {dt.datetime.utcnow().strftime('%H:%M')}",
            iterations=iterations,
            eal_inr=0, var_90_inr=0, var_95_inr=0, var_99_inr=0, mean_loss_inr=0,
            computed_at=dt.datetime.utcnow(),
            distribution_bins=[],
        )
        db.add(run)
        db.commit()
        return run

    probabilities = np.array([s.likelihood for s in scores])
    impacts = np.array([s.financial_impact for s in scores])

    enterprise_losses = np.zeros(iterations)
    for i in range(iterations):
        incidents = np.random.binomial(n=1, p=probabilities)
        # Add some variance to impacts
        impact_noise = impacts * np.random.lognormal(0, 0.3, len(impacts))
        enterprise_losses[i] = np.sum(incidents * impact_noise)

    eal = float(np.mean(enterprise_losses))
    var_90 = float(np.percentile(enterprise_losses, 90))
    var_95 = float(np.percentile(enterprise_losses, 95))
    var_99 = float(np.percentile(enterprise_losses, 99))

    # Build histogram bins for frontend distribution chart
    bins_arr = np.histogram(enterprise_losses, bins=30)
    dist_bins = []
    for j in range(len(bins_arr[0])):
        dist_bins.append({
            "start": round(float(bins_arr[1][j]), 2),
            "end": round(float(bins_arr[1][j + 1]), 2),
            "count": int(bins_arr[0][j]),
        })

    # Count existing runs to label this one
    run_count = db.query(RiskRun).count()
    run = RiskRun(
        label=f"Run #{run_count + 1}",
        iterations=iterations,
        eal_inr=round(eal, 2),
        var_90_inr=round(var_90, 2),
        var_95_inr=round(var_95, 2),
        var_99_inr=round(var_99, 2),
        mean_loss_inr=round(eal, 2),
        computed_at=dt.datetime.utcnow(),
        distribution_bins=dist_bins,
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    return run


def get_latest_distribution(db: Session) -> dict:
    """Get distribution bins from the latest risk run."""
    run = db.query(RiskRun).order_by(RiskRun.computed_at.desc()).first()
    if not run:
        return {"var_95_inr": 0, "eal_inr": 0, "bins": []}
    return {
        "var_95_inr": run.var_95_inr,
        "eal_inr": run.eal_inr,
        "bins": run.distribution_bins or [],
    }


def get_asset_shap(db: Session, asset_id: int) -> dict:
    """Get SHAP explanation for a specific asset."""
    score = db.query(RiskScore).filter(RiskScore.asset_id == asset_id).first()
    if not score:
        return {"asset_id": asset_id, "shap_values": {}, "likelihood": 0}
    return {
        "asset_id": asset_id,
        "likelihood": score.likelihood,
        "financial_impact": score.financial_impact,
        "eal": score.eal,
        "shap_values": score.likelihood_shap_values or {},
        "contributing_vulnerabilities": score.contributing_vulnerabilities or [],
    }
