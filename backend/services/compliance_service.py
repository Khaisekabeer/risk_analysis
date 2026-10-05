import json
from sqlalchemy.orm import Session
from models.all_models import Control

# Using the mapping from the original src/compliance_mapper.py
MITRE_TO_NIST = {
    "T1190": ["AC-4", "SC-7"],
    "T1078": ["AC-2", "IA-2"],
    "T1566": ["AT-2"],
    "T1059": ["CM-6", "SI-3"],
    "T1003": ["AU-2", "SI-4"],
    "T1486": ["CP-9", "SI-8"]
}

# Add some mock mappings for the other frameworks required by the PS
MOCK_FRAMEWORKS = {
    "ISO 27001": {"total": 114, "name": "ISO/IEC 27001:2022"},
    "NIST CSF": {"total": 108, "name": "NIST Cybersecurity Framework v2.0"},
    "CIS Controls": {"total": 153, "name": "CIS Controls v8"},
    "RBI CSF": {"total": 85, "name": "RBI Cyber Security Framework"},
    "SEBI CSCRF": {"total": 68, "name": "SEBI Cybersecurity and Cyber Resilience Framework"}
}

def get_framework_summary(db: Session, budget_inr: float = None) -> list[dict]:
    """Return summary statistics for all 5 frameworks."""
    # In a real implementation, we'd calculate this based on funded controls vs framework mappings
    # For now, we simulate realistic coverage numbers
    
    controls = db.query(Control).all()
    funded_count = len([c for c in controls if c.implementation_cost_inr <= (budget_inr or float('inf'))])
    total_count = len(controls) if controls else 1
    funding_ratio = funded_count / total_count
    
    results = []
    for fw, data in MOCK_FRAMEWORKS.items():
        # Simulate base coverage + boost from funded controls
        base_coverage = int(data["total"] * 0.4)
        funded_coverage = int(data["total"] * 0.4 * funding_ratio)
        covered = base_coverage + funded_coverage
        
        results.append({
            "name": fw,
            "total_controls": data["total"],
            "covered": covered,
            "pct": round((covered / data["total"]) * 100)
        })
        
    return results

def get_mappings_for_framework(db: Session, framework: str, budget_inr: float = None) -> list[dict]:
    """Get control-level mapping details for a specific framework."""
    controls = db.query(Control).all()
    
    mappings = []
    for c in controls:
        is_funded = c.implementation_cost_inr <= (budget_inr or float('inf'))
        status = "Covered" if is_funded else "Not funded"
        
        # Simulate mapping: just prepend the framework name
        # A real implementation would parse c.framework_mappings JSON
        mappings.append({
            "control_id": f"{framework[:3].upper()}-{c.id}",
            "control_name": c.name,
            "status": status,
            "mapped_actions": [c.name]
        })
        
    return mappings
