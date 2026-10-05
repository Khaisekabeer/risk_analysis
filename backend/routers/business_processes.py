from fastapi import APIRouter, Depends
from typing import Optional
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from models.all_models import BusinessProcess

router = APIRouter(prefix="/api/v1/business-processes", tags=["Business Processes"])

class CreateProcessRequest(BaseModel):
    name: str
    description: Optional[str] = None
    asset_criticality_inr: float = 0
    activities: list = []
    information_items: list = []

@router.get("")
def get_processes(limit: int = 50, db: Session = Depends(get_db)):
    processes = db.query(BusinessProcess).limit(limit).all()
    return {
        "processes": [{
            "id": p.id,
            "name": p.name,
            "asset_criticality_inr": p.asset_criticality_inr,
            "activities": p.activities or [],
            "information_items": p.information_items or []
        } for p in processes]
    }

@router.post("")
def create_process(req: CreateProcessRequest, db: Session = Depends(get_db)):
    # Default to first BU if none specified (for demo)
    from models.all_models import BusinessUnit
    bu = db.query(BusinessUnit).first()
    bu_id = bu.id if bu else 1
    
    process = BusinessProcess(
        business_unit_id=bu_id,
        name=req.name,
        description=req.description,
        asset_criticality_inr=req.asset_criticality_inr,
        activities=req.activities,
        information_items=req.information_items
    )
    db.add(process)
    db.commit()
    db.refresh(process)
    
    return {
        "id": process.id,
        "name": process.name,
        "activities": process.activities,
        "information_items": process.information_items
    }
