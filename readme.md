# Riskyn Backend

The backend implementation lives in `src/` and exposes a FastAPI service for the Riskyn frontend.

## Run locally

```bash
cd risk_analysis
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m uvicorn src.api:app --reload --host 0.0.0.0 --port 8000
```

API documentation is available at `http://localhost:8000/docs`.

See the repository-level [README](../README.md) and the [frontend/backend integration guide](../docs/frontend-backend-integration.md) for the complete project workflow and UI integration requirements.
