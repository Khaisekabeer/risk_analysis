from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import sqlite3
import pandas as pd
from pathlib import Path
from src.config import RAW_DATA_DIR
from src.ai_copilot import AICopilot
from src.scenario_sandbox import WhatIfSandbox
import json

app = FastAPI(
    title="Enterprise Cyber Risk Optimization API",
    description="Backend API for Executive and SecOps Dashboards",
    version="1.0.0"
)

# Connectors
db_path = RAW_DATA_DIR.parent / "risk_analysis.db"
copilot = AICopilot()
sandbox = WhatIfSandbox()

class CopilotQuery(BaseModel):
    question: str

class SimulationRequest(BaseModel):
    asset_id: str
    action_name: str
    risk_reduction_percentage: float

@app.get("/api/v1/dashboard/kpis", tags=["Executive Dashboard"])
def get_kpis():
    """Returns the total Enterprise Expected Annual Loss (EAL) and 95% VaR."""
    try:
        with sqlite3.connect(db_path) as conn:
            # Note: For MVP, we just sum up likely loss for EAL. 
            # In production, VaR involves statistical percentiles on the monte carlo output.
            sql = "SELECT SUM(likely_loss_inr) as total_eal, SUM(max_loss_inr) as var_95 FROM risk_scenarios"
            df = pd.read_sql_query(sql, conn)
            
            return {
                "status": "success",
                "enterprise_eal_inr": df.iloc[0]["total_eal"],
                "enterprise_var_95_inr": df.iloc[0]["var_95"]
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/v1/optimization/recommendations", tags=["SecOps Portal"])
def get_recommendations():
    """Returns the top prioritized remediation actions mapped to compliance frameworks."""
    try:
        with sqlite3.connect(db_path) as conn:
            sql = """
            SELECT action_id, target_asset_id, action_name, implementation_cost_inr, 
                   framework_mapping, mapping_rationale, calculated_rosi_percentage 
            FROM optimization_results 
            ORDER BY implementation_cost_inr ASC 
            LIMIT 10
            """
            df = pd.read_sql_query(sql, conn)
            
            return {
                "status": "success",
                "total_recommendations": len(df),
                "data": df.to_dict(orient="records")
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/v1/copilot/ask", tags=["AI Copilot"])
def ask_copilot(query: CopilotQuery):
    """NLP to SQL Co-Pilot (Simulated for MVP)."""
    # In a full deployment, this calls LangChain + OpenAI.
    # For now, we simulate the text response.
    question_lower = query.question.lower()
    
    if "highest financial risk" in question_lower or "top risk" in question_lower:
        with sqlite3.connect(db_path) as conn:
            sql = "SELECT asset_id, threat_category, likely_loss_inr, max_loss_inr FROM risk_scenarios ORDER BY likely_loss_inr DESC LIMIT 3"
            df = pd.read_sql_query(sql, conn)
            return {"response": "Here are the top 3 assets with the highest financial risk:", "data": df.to_dict(orient="records")}
            
    elif "optimized actions" in question_lower or "what should we patch" in question_lower:
        with sqlite3.connect(db_path) as conn:
            sql = "SELECT action_name, target_asset_id, implementation_cost_inr, framework_mapping FROM optimization_results ORDER BY implementation_cost_inr ASC LIMIT 3"
            df = pd.read_sql_query(sql, conn)
            return {"response": "Here are the most cost-effective actions to take immediately:", "data": df.to_dict(orient="records")}
    
    return {"response": "I am connected to the Enterprise Database. However, you need to plug in a valid LLM API Key (like OpenAI or Claude) into `src/ai_copilot.py` to process dynamic unscripted queries."}

@app.post("/api/v1/sandbox/simulate", tags=["SecOps Portal"])
def run_whatif_simulation(req: SimulationRequest):
    """Runs a What-If Monte Carlo simulation to calculate the financial impact of a theoretical fix."""
    try:
        with sqlite3.connect(db_path) as conn:
            sql = f"SELECT likely_loss_inr FROM risk_scenarios WHERE asset_id = '{req.asset_id}'"
            df = pd.read_sql_query(sql, conn)
            
            if df.empty:
                raise HTTPException(status_code=404, detail="Asset not found")
                
            current_eal = df.iloc[0]['likely_loss_inr']
            simulated_eal = current_eal * (1 - req.risk_reduction_percentage)
            delta = current_eal - simulated_eal
            
            return {
                "status": "success",
                "asset_id": req.asset_id,
                "proposed_action": req.action_name,
                "current_eal_inr": current_eal,
                "simulated_eal_inr": simulated_eal,
                "financial_risk_averted_inr": delta
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/", tags=["Health"])
def health_check():
    return {"status": "Enterprise Risk API is running."}

if __name__ == "__main__":
    import uvicorn
    # Allow running directly via `python src/api.py`
    uvicorn.run(app, host="0.0.0.0", port=8000)
