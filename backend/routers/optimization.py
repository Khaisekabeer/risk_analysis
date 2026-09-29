from fastapi import APIRouter, Depends
from typing import Optional
from sqlalchemy.orm import Session
from database import get_db
from services.optimizer_service import optimize_investments, generate_frontier

router = APIRouter(prefix="/api/v1/optimization", tags=["Optimizer"])

@router.get("/plan")
def get_plan(budget_inr: Optional[float] = None, db: Session = Depends(get_db)):
    return optimize_investments(db, budget_inr)

@router.post("/run")
def run_optimization(budget_inr: float, db: Session = Depends(get_db)):
    return optimize_investments(db, budget_inr)

@router.get("/frontier")
def get_frontier(points: int = 12, db: Session = Depends(get_db)):
    return generate_frontier(db, points)

@router.get("/recommendations")
def get_recommendations(limit: int = 10, db: Session = Depends(get_db)):
    plan = optimize_investments(db)
    controls = plan.get("controls", [])
    # Sort by ROSI essentially
    controls.sort(key=lambda x: (x["reduction"] / x["cost"]) if x["cost"] > 0 else 0, reverse=True)
    return controls[:limit]
