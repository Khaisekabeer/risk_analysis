from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from database import get_db
from models.all_models import RiskRun, Asset, Vulnerability, BusinessUnit, RiskScore
from services.auth_service import get_current_user

router = APIRouter(prefix="/api/v1/dashboard", tags=["Dashboard"])

@router.get("/kpis")
def get_kpis(db: Session = Depends(get_db)):
    latest_run = db.query(RiskRun).order_by(RiskRun.computed_at.desc()).first()
    asset_count = db.query(Asset).count()
    vuln_count = db.query(Vulnerability).count()
    open_vulns = db.query(Vulnerability).filter(Vulnerability.status == "open").count()
    total_asset_value = db.query(func.sum(Asset.asset_value_inr)).scalar() or 0
    internet_exposed = db.query(Asset).filter(Asset.internet_exposed == True).count()
    
    if not latest_run:
        return {
            "enterprise_eal_inr": 0, "enterprise_var_95_inr": 0, "enterprise_var_99_inr": 0,
            "open_vulnerabilities": open_vulns, "scenario_count": 0, "iterations": 0,
            "portfolio": {"assets": asset_count, "vulnerabilities": vuln_count, "internetExposed": internet_exposed, "total_asset_value_inr": total_asset_value}
        }
        
    return {
        "enterprise_eal_inr": latest_run.eal_inr,
        "enterprise_var_95_inr": latest_run.var_95_inr,
        "enterprise_var_99_inr": latest_run.var_99_inr,
        "open_vulnerabilities": open_vulns,
        "scenario_count": db.query(RiskScore).count(),
        "iterations": latest_run.iterations,
        "computed_at": latest_run.computed_at,
        "portfolio": {
            "assets": asset_count,
            "vulnerabilities": vuln_count,
            "internetExposed": internet_exposed,
            "total_asset_value_inr": total_asset_value
        }
    }

@router.get("/contributors")
def get_contributors(limit: int = 10, db: Session = Depends(get_db)):
    bus = db.query(BusinessUnit).all()
    contributors = []
    
    for bu in bus:
        assets = db.query(Asset).filter(Asset.business_unit == bu.name).all()
        asset_ids = [a.id for a in assets]
        
        eal = db.query(func.sum(RiskScore.eal)).filter(RiskScore.asset_id.in_(asset_ids)).scalar() or 0
        
        # Simplified threat mix
        threat_mix = [
            {"name": "Ransomware", "eal": eal * 0.4},
            {"name": "Data Breach", "eal": eal * 0.35},
            {"name": "DDoS", "eal": eal * 0.15},
            {"name": "Insider Threat", "eal": eal * 0.1}
        ]
        
        contributors.append({
            "name": bu.name,
            "eal": eal,
            "assets": len(assets),
            "threat_mix": sorted(threat_mix, key=lambda x: x["eal"], reverse=True)
        })
        
    contributors.sort(key=lambda x: x["eal"], reverse=True)
    return {"contributors": contributors[:limit]}

@router.get("/distribution")
def get_distribution(db: Session = Depends(get_db)):
    from services.risk_service import get_latest_distribution
    return get_latest_distribution(db)
