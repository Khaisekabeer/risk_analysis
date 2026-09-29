"""Demo Data Seeder."""

import datetime as dt
from database import SessionLocal, init_db
from models.all_models import (
    User, Organization, BusinessUnit, BusinessProcess, Service,
    Asset, Vulnerability, Control, ProcessDependency, Incident
)
from services.auth_service import hash_password
from services.risk_service import run_monte_carlo
from sqlalchemy.exc import OperationalError

def seed_database():
    db = SessionLocal()
    
    print("Initializing Database...")
    init_db()
    
    # Check if already seeded
    try:
        if db.query(Organization).count() > 0:
            print("Database already seeded.")
            db.close()
            return
    except OperationalError:
        pass # tables were just created

    print("Seeding Users...")
    users = [
        User(username="ciso", hashed_password=hash_password("demo123"), role="executive", display_name="Chief Risk Officer"),
        User(username="secops", hashed_password=hash_password("demo123"), role="secops", display_name="SecOps Lead")
    ]
    db.add_all(users)

    print("Seeding Nova Financial Services...")
    org = Organization(
        name="Nova Financial Services",
        industry="Financial Services",
        revenue_annual=5_000_000_000, # ₹500 Crore
        regulatory_scope=["RBI CSF", "SEBI CSCRF", "CERT-In"]
    )
    db.add(org)
    db.commit()

    bus = [
        BusinessUnit(org_id=org.id, name="Retail Banking", revenue_contribution=0.4),
        BusinessUnit(org_id=org.id, name="Wealth Management", revenue_contribution=0.3),
        BusinessUnit(org_id=org.id, name="Corporate Treasury", revenue_contribution=0.2),
        BusinessUnit(org_id=org.id, name="Insurance", revenue_contribution=0.1),
    ]
    db.add_all(bus)
    db.commit()

    print("Seeding Processes and Cascade Dependencies (UVP)...")
    processes = [
        # Retail Banking
        BusinessProcess(business_unit_id=bus[0].id, name="Core Banking Operations", criticality_tier=1, revenue_impact_per_hour_downtime=2_000_000),
        BusinessProcess(business_unit_id=bus[0].id, name="UPI Payment Processing", criticality_tier=1, revenue_impact_per_hour_downtime=5_000_000),
        BusinessProcess(business_unit_id=bus[0].id, name="Customer Onboarding (KYC)", criticality_tier=2, revenue_impact_per_hour_downtime=500_000),
        
        # Wealth Management
        BusinessProcess(business_unit_id=bus[1].id, name="Portfolio Trading Engine", criticality_tier=1, revenue_impact_per_hour_downtime=10_000_000),
        BusinessProcess(business_unit_id=bus[1].id, name="Market Data Feeds", criticality_tier=2, revenue_impact_per_hour_downtime=1_000_000),
        
        # Cross-functional
        BusinessProcess(business_unit_id=bus[2].id, name="Fraud Detection & AML", criticality_tier=1, revenue_impact_per_hour_downtime=3_000_000),
        BusinessProcess(business_unit_id=bus[3].id, name="Claims Processing", criticality_tier=3, revenue_impact_per_hour_downtime=200_000),
    ]
    db.add_all(processes)
    db.commit()

    # UVP: Process Dependencies (The Cascade Graph)
    deps = [
        # Payments depend on Core Banking
        ProcessDependency(process_id=processes[1].id, depends_on_process_id=processes[0].id, dependency_type="hard", impact_multiplier=1.0),
        # Trading depends on Market Data
        ProcessDependency(process_id=processes[3].id, depends_on_process_id=processes[4].id, dependency_type="hard", impact_multiplier=1.0),
        # Payments depend on Fraud Detection (soft dependency - can still process, but with higher risk)
        ProcessDependency(process_id=processes[1].id, depends_on_process_id=processes[5].id, dependency_type="soft", impact_multiplier=0.4),
    ]
    db.add_all(deps)
    db.commit()

    print("Seeding Services and Assets...")
    services = [
        Service(process_id=processes[0].id, name="Mainframe DB"),
        Service(process_id=processes[1].id, name="Payment Gateway API"),
        Service(process_id=processes[5].id, name="Kafka Risk Stream"),
    ]
    db.add_all(services)
    db.commit()

    assets = []
    for s in services:
        for i in range(5):
            assets.append(
                Asset(
                    service_id=s.id,
                    name=f"{s.name.replace(' ', '-')}-Prod-{i+1}",
                    asset_type="Server",
                    criticality_tier=1 if "DB" in s.name else 2,
                    internet_exposed=(i == 0),
                    asset_value_inr=1_000_000,
                    hourly_downtime_cost_inr=500_000,
                    business_unit=s.process.business_unit.name
                )
            )
    db.add_all(assets)
    db.commit()

    print("Seeding Vulnerabilities...")
    vulns = []
    for a in assets:
        # Give exposed assets more/critical vulns
        if a.internet_exposed:
            vulns.append(Vulnerability(asset_id=a.id, cve_id="CVE-2024-3094", cvss_score=10.0, epss_score=0.9, severity="critical", description="XZ Utils Backdoor"))
            vulns.append(Vulnerability(asset_id=a.id, cve_id="CVE-2023-4863", cvss_score=8.8, severity="high", description="WebP Heap Buffer Overflow"))
        vulns.append(Vulnerability(asset_id=a.id, cve_id="CVE-2021-44228", cvss_score=10.0, epss_score=0.95, severity="critical", description="Log4Shell"))
    db.add_all(vulns)
    
    print("Seeding Controls (Catalog)...")
    controls = [
        Control(name="Deploy EDR Agent (CrowdStrike)", category="preventive", implementation_cost_inr=2_500_000, risk_reduction_pct=35, applicable_asset_count=15),
        Control(name="Implement Microsegmentation", category="preventive", implementation_cost_inr=5_000_000, risk_reduction_pct=45, applicable_asset_count=15),
        Control(name="Patch Log4Shell Enterprise-wide", category="corrective", implementation_cost_inr=1_000_000, risk_reduction_pct=60, applicable_asset_count=15),
        Control(name="MFA for Legacy Admin Interfaces", category="preventive", implementation_cost_inr=800_000, risk_reduction_pct=20, applicable_asset_count=5),
        Control(name="24/7 Managed SOC", category="detective", implementation_cost_inr=8_000_000, risk_reduction_pct=30, applicable_asset_count=15),
    ]
    db.add_all(controls)
    db.commit()

    print("Running initial Monte Carlo inference...")
    # This wires the XGBoost models + MC engine to generate the baseline RiskScore and RiskRun
    run_monte_carlo(db, iterations=1000)

    print("Seeding complete! Log in as ciso / demo123")
    db.close()

if __name__ == "__main__":
    seed_database()
