"""Investment optimization service — wraps PuLP MILP Knapsack solver."""

import pulp
from sqlalchemy.orm import Session
from config import settings
from models.all_models import Control, RiskRun, InvestmentScenario

def optimize_investments(db: Session, budget_inr: float = None) -> dict:
    """Run PuLP MILP optimizer to select best controls for a given budget."""
    if budget_inr is None:
        budget_inr = settings.DEFAULT_BUDGET_INR

    # Get controls with costs and risk reduction
    controls = db.query(Control).filter(Control.implementation_cost_inr > 0).all()
    if not controls:
        return {"budget_inr": budget_inr, "residual_eal_inr": 0, "controls": []}

    # Setup the Knapsack Problem (MILP)
    prob = pulp.LpProblem("Cyber_Risk_Optimization", pulp.LpMaximize)

    # Decision variables: x_i is 1 if control i is funded, 0 otherwise
    control_vars = {c.id: pulp.LpVariable(f"Control_{c.id}", cat="Binary") for c in controls}

    # Objective: Maximize total risk reduction
    prob += pulp.lpSum(c.risk_reduction_pct * control_vars[c.id] for c in controls), "Total_Risk_Reduction"

    # Constraint: Total cost <= budget
    prob += pulp.lpSum(c.implementation_cost_inr * control_vars[c.id] for c in controls) <= budget_inr, "Budget_Constraint"

    # Solve quietly
    prob.solve(pulp.PULP_CBC_CMD(msg=False))

    funded_control_ids = [c.id for c in controls if control_vars[c.id].varValue == 1.0]

    # Get baseline EAL
    latest_run = db.query(RiskRun).order_by(RiskRun.computed_at.desc()).first()
    baseline_eal = latest_run.eal_inr if latest_run else 0

    # Format response for the frontend Optimizer component
    control_results = []
    total_reduction = 0
    total_cost = 0

    for c in controls:
        funded = c.id in funded_control_ids
        reduction_amt = (c.risk_reduction_pct / 100) * baseline_eal  # Simplified absolute reduction
        if funded:
            total_reduction += reduction_amt
            total_cost += c.implementation_cost_inr

        control_results.append({
            "id": c.id,
            "name": c.name,
            "cost": c.implementation_cost_inr,
            "reduction": reduction_amt,
            "pct": c.risk_reduction_pct / 100,
            "applicable": c.applicable_asset_count,
            "funded": funded,
        })

    residual_eal = max(0, baseline_eal - total_reduction)

    # Persist the scenario
    scenario = InvestmentScenario(
        name=f"Optimization - Budget {budget_inr:,.0f}",
        budget=budget_inr,
        selected_actions=funded_control_ids,
        total_risk_reduction=total_reduction,
        resulting_eal=residual_eal,
        rosi=(total_reduction - total_cost) / total_cost if total_cost > 0 else 0,
    )
    db.add(scenario)
    db.commit()

    return {
        "budget_inr": budget_inr,
        "residual_eal_inr": residual_eal,
        "controls": control_results
    }


def generate_frontier(db: Session, points: int = 12) -> list[dict]:
    """Generate multi-budget efficient frontier curve."""
    # Find max cost to bound the curve
    max_cost = db.query(Control).with_entities(pulp.sqlalchemy.func.sum(Control.implementation_cost_inr)).scalar() or 20_000_000
    
    # Linear steps up to max_cost
    step = max_cost / points
    budgets = [step * i for i in range(1, points + 1)]
    
    frontier = []
    for b in budgets:
        # We don't want to pollute DB with these temporary scenarios, so run directly
        controls = db.query(Control).filter(Control.implementation_cost_inr > 0).all()
        if not controls:
            break
            
        prob = pulp.LpProblem(f"Cyber_Risk_Opt_{b}", pulp.LpMaximize)
        control_vars = {c.id: pulp.LpVariable(f"Control_{c.id}", cat="Binary") for c in controls}
        prob += pulp.lpSum(c.risk_reduction_pct * control_vars[c.id] for c in controls)
        prob += pulp.lpSum(c.implementation_cost_inr * control_vars[c.id] for c in controls) <= b
        prob.solve(pulp.PULP_CBC_CMD(msg=False))
        
        funded_control_ids = [c.id for c in controls if control_vars[c.id].varValue == 1.0]
        
        latest_run = db.query(RiskRun).order_by(RiskRun.computed_at.desc()).first()
        baseline_eal = latest_run.eal_inr if latest_run else 0
        
        total_reduction = 0
        for c in controls:
            if c.id in funded_control_ids:
                total_reduction += (c.risk_reduction_pct / 100) * baseline_eal
                
        frontier.append({
            "budget": b,
            "reduction": total_reduction,
            "eal": max(0, baseline_eal - total_reduction)
        })
        
    return frontier
