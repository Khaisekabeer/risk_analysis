from fastapi import APIRouter, Depends
from typing import Optional
from sqlalchemy.orm import Session
from database import get_db
from services.compliance_service import get_framework_summary, get_mappings_for_framework

router = APIRouter(prefix="/api/v1/compliance", tags=["Compliance"])

@router.get("/frameworks")
def get_frameworks(budget_inr: Optional[float] = None, db: Session = Depends(get_db)):
    summary = get_framework_summary(db, budget_inr)
    return {"frameworks": summary}

@router.get("/mappings")
def get_mappings(framework: Optional[str] = None, budget_inr: Optional[float] = None, db: Session = Depends(get_db)):
    if not framework:
        framework = "ISO 27001"
    mappings = get_mappings_for_framework(db, framework, budget_inr)
    return {"mappings": mappings}
