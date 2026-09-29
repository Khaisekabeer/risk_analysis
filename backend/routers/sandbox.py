from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from models.all_models import Control, RiskRun

router = APIRouter(prefix="/api/v1/sandbox", tags=["Sandbox"])

class SimulateRequest(BaseModel):
    control_id: int

@router.post("/simulate")
def simulate(req: SimulateRequest, db: Session = Depends(get_db)):
    control = db.query(Control).filter(Control.id == req.control_id).first()
    if not control:
        return {"error": "Control not found"}
        
    latest_run = db.query(RiskRun).order_by(RiskRun.computed_at.desc()).first()
    baseline_eal = latest_run.eal_inr if latest_run else 0
    
    reduction = (control.risk_reduction_pct / 100) * baseline_eal
    
    return {
        "baseline_eal": baseline_eal,
        "simulated_eal": max(0, baseline_eal - reduction),
        "reduction": reduction,
        "cost": control.implementation_cost_inr,
        "assets_affected": control.applicable_asset_count
    }
