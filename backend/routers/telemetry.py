from fastapi import APIRouter, Depends, UploadFile, File
from sqlalchemy.orm import Session
from database import get_db
from models.all_models import TelemetryEvent

router = APIRouter(prefix="/api/v1/telemetry", tags=["Telemetry"])

@router.get("/presets")
def get_presets():
    return {
        "presets": [
            {"name": "Ransomware Wave", "description": "Simulates a sharp rise in ransomware indicators across servers.", "asset_count": 42, "vuln_count": 115},
            {"name": "Data Breach", "description": "Simulates anomalous DB access patterns and high-severity web vulns.", "asset_count": 15, "vuln_count": 34},
            {"name": "Insider Threat", "description": "Simulates privilege escalation and mass downloads from internal IP.", "asset_count": 8, "vuln_count": 12},
        ]
    }

@router.post("/presets/{name}")
def load_preset(name: str, db: Session = Depends(get_db)):
    event = TelemetryEvent(
        event_type="preset_loaded",
        source="system",
        details={"preset_name": name, "status": "success"}
    )
    db.add(event)
    db.commit()
    return {"status": "ok", "preset": name}

@router.get("/events")
def get_events(limit: int = 20, db: Session = Depends(get_db)):
    events = db.query(TelemetryEvent).order_by(TelemetryEvent.timestamp.desc()).limit(limit).all()
    return {
        "events": [{
            "id": e.id,
            "type": e.event_type,
            "source": e.source,
            "timestamp": e.timestamp,
            "details": e.details
        } for e in events]
    }

@router.post("/upload")
def upload_telemetry(file: UploadFile = File(...), db: Session = Depends(get_db)):
    # In a real system, we'd process the CSV/JSON here
    event = TelemetryEvent(
        event_type="file_upload",
        source="user_upload",
        details={"filename": file.filename, "content_type": file.content_type, "status": "processed"}
    )
    db.add(event)
    db.commit()
    return {"status": "ok", "filename": file.filename}
