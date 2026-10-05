from fastapi import APIRouter, Depends
from typing import Optional
from sqlalchemy.orm import Session
from database import get_db
from models.all_models import Vulnerability, Control, Asset

router = APIRouter(prefix="/api/v1/audit", tags=["Technical Audit"])

@router.get("/vulnerabilities")
def get_vulnerabilities(severity: Optional[str] = None, status: Optional[str] = None, limit: int = 50, db: Session = Depends(get_db)):
    query = db.query(Vulnerability)
    if severity and severity != "all":
        query = query.filter(Vulnerability.severity == severity.lower())
    if status and status != "all":
        query = query.filter(Vulnerability.status == status.lower())
        
    total = query.count()
    vulns = query.limit(limit).all()
    
    # Enrich with asset info
    result = []
    for v in vulns:
        asset = db.query(Asset).filter(Asset.id == v.asset_id).first()
        result.append({
            "vuln_id": v.id,
            "cve_id": v.cve_id,
            "asset_id": v.asset_id,
            "asset_type": asset.asset_type if asset else "Unknown",
            "cvss_score": v.cvss_score,
            "epss_score": v.epss_score,
            "severity": v.severity.title(),
            "status": v.status.replace("_", " ").title(),
            "framework_control_id": v.framework_control_id,
        })
    return {"rows": result, "total": total}

@router.get("/vulnerabilities/summary")
def get_vulnerability_summary(db: Session = Depends(get_db)):
    all_vulns = db.query(Vulnerability).all()
    
    by_severity = {
        "Critical": len([v for v in all_vulns if v.severity == "critical"]),
        "High": len([v for v in all_vulns if v.severity == "high"]),
        "Medium": len([v for v in all_vulns if v.severity == "medium"]),
        "Low": len([v for v in all_vulns if v.severity == "low"]),
    }
    return {
        "total": len(all_vulns),
        "critical": len([v for v in all_vulns if v.severity == "critical"]),
        "high": len([v for v in all_vulns if v.severity == "high"]),
        "medium": len([v for v in all_vulns if v.severity == "medium"]),
        "low": len([v for v in all_vulns if v.severity == "low"]),
        "open": len([v for v in all_vulns if v.status == "open"]),
        "remediated": len([v for v in all_vulns if v.status == "remediated"]),
        "by_severity": by_severity,
    }

@router.get("/controls")
def get_controls(db: Session = Depends(get_db)):
    controls = db.query(Control).all()
    return [{
        "id": c.id,
        "name": c.name,
        "category": c.category,
        "maturity": c.maturity,
        "coverage_pct": c.coverage_pct * 100,
        "framework_mappings": c.framework_mappings
    } for c in controls]

@router.get("/assets")
def get_assets(limit: int = 8, db: Session = Depends(get_db)):
    from services.risk_service import get_asset_shap
    assets = db.query(Asset).limit(limit).all()
    
    result = []
    for a in assets:
        shap_data = get_asset_shap(db, a.id)
        result.append({
            "id": a.id,
            "name": a.name,
            "type": a.asset_type,
            "criticality": a.criticality_tier,
            "risk_score": shap_data["eal"],
            "vuln_count": db.query(Vulnerability).filter(Vulnerability.asset_id == a.id, Vulnerability.status == "open").count(),
            "shap_explanation": shap_data["shap_values"]
        })
    # Sort by risk
    result.sort(key=lambda x: x["risk_score"], reverse=True)
    return result

@router.get("/remediation")
def get_remediation(limit: int = 60, db: Session = Depends(get_db)):
    from services.optimizer_service import optimize_investments
    plan = optimize_investments(db)
    
    queue = []
    for i, c in enumerate(plan.get("controls", [])):
        queue.append({
            "vuln_id": c["id"],
            "cve": c["name"],
            "cvss": None,
            "asset": f"{c['applicable']} assets",
            "assetType": "Portfolio",
            "remediation": c["name"],
            "fixCostInr": c["cost"],
            "riskReductionInr": c["reduction"],
            "riskReductionPct": c["pct"],
            "control": c["name"],
            "id": c["id"],
            "title": c["name"],
            "priority": i + 1,
            "cost": c["cost"],
            "risk_reduction": c["reduction"],
            "assets_affected": c["applicable"],
            "status": "Open"
        })
        if len(queue) >= limit:
            break
            
    return {
        "columns": {"Open": queue, "In Progress": [], "Resolved": []},
        "counts": {"Open": len(queue), "In Progress": 0, "Resolved": 0},
    }
