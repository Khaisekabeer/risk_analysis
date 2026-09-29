from fastapi import APIRouter, Depends
from typing import Optional
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from models.all_models import AppSettings

router = APIRouter(prefix="/api/v1/settings", tags=["Settings"])

class SettingsUpdate(BaseModel):
    budget_inr: float
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
        "cost_per_record_inr": settings.cost_per_record_inr,
        "downtime_cost_per_hour_inr": settings.downtime_cost_per_hour_inr
    }

@router.put("")
def update_settings(req: SettingsUpdate, db: Session = Depends(get_db)):
    settings = db.query(AppSettings).first()
    if not settings:
        settings = AppSettings()
        db.add(settings)
        
    settings.budget_inr = req.budget_inr
    if req.org_name:
        settings.org_name = req.org_name
        
    db.commit()
    db.refresh(settings)
    return {"status": "success"}
