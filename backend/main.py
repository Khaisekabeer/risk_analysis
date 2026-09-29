from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import init_db
import uvicorn

# Import all routers
from routers import (
    auth, dashboard, risk, optimization, audit, compliance,
    copilot, sandbox, telemetry, business_processes, cascade,
    settings, reports
)

app = FastAPI(
    title="CyberRiskAI Backend",
    description="FastAPI backend serving the React frontend. Powers the Cyber Risk Engine, Optimizer, and Business Process Cascade Simulation.",
    version="2.0.0"
)

# CORS config to allow the Vite frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include all routers
app.include_router(auth.router)
app.include_router(dashboard.router)
app.include_router(risk.router)
app.include_router(optimization.router)
app.include_router(audit.router)
app.include_router(compliance.router)
app.include_router(copilot.router)
app.include_router(sandbox.router)
app.include_router(telemetry.router)
app.include_router(business_processes.router)
app.include_router(cascade.router)
app.include_router(settings.router)
app.include_router(reports.router)

@app.on_event("startup")
def on_startup():
    init_db()

@app.get("/health")
def health_check():
    return {"status": "ok"}

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
