from fastapi import APIRouter, Depends
from typing import Optional
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from models.all_models import AppSettings

router = APIRouter(prefix="/api/v1/settings", tags=["Settings"])

class SettingsUpdate(BaseModel):
    default_budget_inr: Optional[float] = None
    monte_carlo_iterations: Optional[int] = None
    budget_inr: Optional[float] = None
    org_name: Optional[str] = None

@router.get("")
def get_settings(db: Session = Depends(get_db)):
    settings = db.query(AppSettings).first()
    if not settings:
        settings = AppSettings()
        db.add(settings)
        db.commit()
        db.refresh(settings)
        
    return {
        "org_name": settings.org_name,
        "industry": settings.industry,
        "budget_inr": settings.budget_inr,
        "default_budget_inr": settings.budget_inr,
        "monte_carlo_iterations": settings.mc_iterations,
        "default_budget_is_derived": False,
        "cost_per_record_inr": settings.cost_per_record_inr,
        "downtime_cost_per_hour_inr": settings.downtime_cost_per_hour_inr
    }

@router.put("")
def update_settings(req: SettingsUpdate, db: Session = Depends(get_db)):
    settings = db.query(AppSettings).first()
    if not settings:
        settings = AppSettings()
        db.add(settings)
        
    if req.default_budget_inr is not None:
        settings.budget_inr = req.default_budget_inr
    elif req.budget_inr is not None:
        settings.budget_inr = req.budget_inr
    if req.monte_carlo_iterations is not None:
        settings.mc_iterations = req.monte_carlo_iterations
    if req.org_name:
        settings.org_name = req.org_name
        
    db.commit()
    db.refresh(settings)
    return {"status": "success"}
