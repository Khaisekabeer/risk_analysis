from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
from models.all_models import RiskRun
from services.risk_service import run_monte_carlo

router = APIRouter(prefix="/api/v1/risk", tags=["Risk"])

@router.get("/runs")
def get_runs(limit: int = 12, db: Session = Depends(get_db)):
    runs = db.query(RiskRun).order_by(RiskRun.computed_at.desc()).limit(limit).all()
    return {
        "runs": [{
            "run_id": r.id,
            "label": r.label,
            "eal_inr": r.eal_inr,
            "var_95_inr": r.var_95_inr,
            "timestamp": r.computed_at
        } for r in runs]
    }

@router.post("/run")
def trigger_run(db: Session = Depends(get_db)):
    # In production, this would be an async background task
    run = run_monte_carlo(db)
    return {
        "ok": True,
        "run_id": run.id,
        "label": run.label,
        "eal_inr": run.eal_inr,
        "var_95_inr": run.var_95_inr
    }
