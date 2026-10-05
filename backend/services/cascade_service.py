"""Business Process Cascade Simulation Service (UVP)."""

import numpy as np
from sqlalchemy.orm import Session
from models.all_models import (
    Asset, Service, BusinessProcess, ProcessDependency, BusinessUnit
)


def simulate_cascade(db: Session, failed_asset_ids: list[int], iterations: int = 1000) -> dict:
    """
    Monte Carlo simulation of how failure propagates from Assets → Services → Processes,
    and then cascades laterally through ProcessDependencies.
    """
    if not failed_asset_ids:
        return {"error": "No failed assets provided."}

    # 1. Map assets to their parent services
    assets = db.query(Asset).filter(Asset.id.in_(failed_asset_ids)).all()
    failed_service_ids = {a.service_id for a in assets if a.service_id}

    # For simplicity, if any asset in a service fails, the service fails
    # In a full model, we'd check if ALL required assets failed
    services = db.query(Service).filter(Service.id.in_(failed_service_ids)).all()
    failed_process_ids = {s.process_id for s in services if s.process_id}

    # Map all processes
    all_processes = db.query(BusinessProcess).all()
    process_map = {p.id: p for p in all_processes}

    # 2. Map dependency graph
    dependencies = db.query(ProcessDependency).all()
    adj_list = {p.id: [] for p in all_processes}  # process_id -> [dependent_process_ids]
    dep_multipliers = {}
    for d in dependencies:
        # A depends on B. If B fails, A fails.
        # So edges go from depends_on_process_id -> process_id
        adj_list[d.depends_on_process_id].append(d.process_id)
        dep_multipliers[(d.depends_on_process_id, d.process_id)] = d.impact_multiplier

    # 3. Graph traversal to find all cascaded failures
    # Queue starts with directly failed processes
    queue = list(failed_process_ids)
    visited = set(failed_process_ids)
    
    # Track the propagation path for visualization
    cascade_path = []
    
    while queue:
        current_id = queue.pop(0)
        for dep_id in adj_list.get(current_id, []):
            if dep_id not in visited:
                visited.add(dep_id)
                queue.append(dep_id)
                
                cascade_path.append({
                    "from_process": process_map[current_id].name,
                    "to_process": process_map[dep_id].name,
                    "multiplier": dep_multipliers.get((current_id, dep_id), 1.0)
                })

    all_failed_process_ids = visited

    # 4. Monte Carlo simulation for financial impact
    # Stochastic downtime based on mean resolution time
    direct_impact_inr = 0
    cascading_impact_inr = 0
    
    # We'll run the iterations and aggregate
    total_losses = np.zeros(iterations)
    
    for i in range(iterations):
        iter_loss = 0
        for p_id in all_failed_process_ids:
            p = process_map[p_id]
            # Stochastic downtime using lognormal around a 24h mean
            downtime_hours = np.random.lognormal(mean=np.log(24), sigma=0.5)
            
            # Determine effective multiplier
            # If directly failed, multiplier is 1.0
            # If cascaded, we use the path's multiplier (simplified here)
            effective_multiplier = 1.0
            if p_id not in failed_process_ids:
                # Naive: just take the max multiplier from incoming edges
                incoming = [d.impact_multiplier for d in dependencies if d.process_id == p_id and d.depends_on_process_id in all_failed_process_ids]
                effective_multiplier = max(incoming) if incoming else 1.0
                
            loss = p.revenue_impact_per_hour_downtime * downtime_hours * effective_multiplier
            iter_loss += loss
            
            # Record means for the summary (using iteration 0 as representative mean)
            if i == 0:
                mean_downtime = 24
                mean_loss = p.revenue_impact_per_hour_downtime * mean_downtime * effective_multiplier
                if p_id in failed_process_ids:
                    direct_impact_inr += mean_loss
                cascading_impact_inr += mean_loss
                
        total_losses[i] = iter_loss

    var_95 = np.percentile(total_losses, 95)
    var_99 = np.percentile(total_losses, 99)
    
    amplification = (cascading_impact_inr / direct_impact_inr) if direct_impact_inr > 0 else 1.0

    return {
        "direct_impact_inr": direct_impact_inr,
        "cascading_impact_inr": cascading_impact_inr,
        "amplification_factor": round(amplification, 2),
        "var_95": var_95,
        "var_99": var_99,
        "failed_assets": [a.name for a in assets],
        "directly_failed_processes": [process_map[pid].name for pid in failed_process_ids],
        "cascaded_processes": [process_map[pid].name for pid in all_failed_process_ids - failed_process_ids],
        "cascade_path": cascade_path,
    }


def get_dependency_graph(db: Session) -> dict:
    """Return nodes and edges for frontend visualization."""
    processes = db.query(BusinessProcess).all()
    dependencies = db.query(ProcessDependency).all()
    
    nodes = [{"id": p.id, "name": p.name, "bu_id": p.business_unit_id, "criticality": p.criticality_tier} for p in processes]
    edges = [{"source": d.depends_on_process_id, "target": d.process_id, "type": d.dependency_type} for d in dependencies]
    
    return {"nodes": nodes, "edges": edges}
