from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from services.cascade_service import simulate_cascade, get_dependency_graph

router = APIRouter(prefix="/api/v1/simulation", tags=["Cascade Simulation"])

class CascadeRequest(BaseModel):
    failed_asset_ids: list[int]

class RedundancyRequest(BaseModel):
    service_id: int
    add_backup: bool

@router.post("/cascade")
def run_cascade(req: CascadeRequest, db: Session = Depends(get_db)):
    return simulate_cascade(db, req.failed_asset_ids)

@router.get("/dependency-graph")
def get_graph(db: Session = Depends(get_db)):
    return get_dependency_graph(db)

@router.post("/what-if-redundancy")
def run_redundancy_whatif(req: RedundancyRequest, db: Session = Depends(get_db)):
    # In a full model, this would reduce the impact multiplier for dependencies 
    # of the target service, then re-run the simulation.
    # For now, we mock a 50% reduction in cascading impact.
    return {
        "status": "success",
        "message": f"Simulated redundancy for service {req.service_id}",
        "projected_cascade_reduction_pct": 50
    }
