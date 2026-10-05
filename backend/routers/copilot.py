from fastapi import APIRouter, Depends
from typing import Optional
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from services.copilot_service import ask_copilot

router = APIRouter(prefix="/api/v1/copilot", tags=["Copilot"])

class AskRequest(BaseModel):
    question: str
    attachments: Optional[list] = None

@router.post("/ask")
def ask(req: AskRequest, db: Session = Depends(get_db)):
    return ask_copilot(db, req.question, req.attachments)

@router.get("/suggestions")
def get_suggestions():
    return {
        "suggestions": [
            "What is our highest financial risk?",
            "Which vulnerabilities contribute most to our expected losses?",
            "What happens if MFA is implemented across all privileged accounts?",
            "How will delaying remediation by 30 days affect our financial exposure?"
        ]
    }
