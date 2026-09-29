from fastapi import APIRouter, Depends
from typing import Optional
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from services.report_service import export_audit_report

router = APIRouter(prefix="/api/v1/reports", tags=["Reports"])

class ExportRequest(BaseModel):
    format: str = "pdf"
    budget_inr: Optional[float] = None

@router.post("/export")
def export_report(req: ExportRequest, db: Session = Depends(get_db)):
    return export_audit_report(db, req.format, req.budget_inr)
