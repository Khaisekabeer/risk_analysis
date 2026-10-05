"""All SQLAlchemy ORM models for CyberRiskAI.

Single-file approach keeps the schema scannable and avoids circular imports.
"""

import datetime as dt
import json
from sqlalchemy import (
    Column, Integer, Float, String, Text, Boolean, DateTime, ForeignKey,
    Enum as SAEnum, JSON, Table,
)
from sqlalchemy.orm import relationship
from database import Base


# ── Association table: Asset ↔ Control (many-to-many) ────────────────────
asset_control = Table(
    "asset_control", Base.metadata,
    Column("asset_id", Integer, ForeignKey("assets.id"), primary_key=True),
    Column("control_id", Integer, ForeignKey("controls.id"), primary_key=True),
    Column("effectiveness_score", Float, default=0.5),
)


# ── User ─────────────────────────────────────────────────────────────────
class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    display_name = Column(String(200), default="")
    hashed_password = Column(String(256), nullable=False)
    role = Column(String(20), nullable=False, default="secops")  # executive | secops
    created_at = Column(DateTime, default=dt.datetime.utcnow)


# ── Organization hierarchy ───────────────────────────────────────────────
class Organization(Base):
    __tablename__ = "organizations"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    industry = Column(String(100), default="Financial Services")
    revenue_annual = Column(Float, default=0)
    regulatory_scope = Column(JSON, default=list)
    data_source = Column(String(30), default="synthetic_demo")

    business_units = relationship("BusinessUnit", back_populates="organization", cascade="all, delete-orphan")
    incidents = relationship("Incident", back_populates="organization", cascade="all, delete-orphan")


class BusinessUnit(Base):
    __tablename__ = "business_units"
    id = Column(Integer, primary_key=True, index=True)
    org_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    name = Column(String(200), nullable=False)
    revenue_contribution = Column(Float, default=0)
    description = Column(Text, default="")

    organization = relationship("Organization", back_populates="business_units")
    processes = relationship("BusinessProcess", back_populates="business_unit", cascade="all, delete-orphan")


class BusinessProcess(Base):
    __tablename__ = "business_processes"
    id = Column(Integer, primary_key=True, index=True)
    business_unit_id = Column(Integer, ForeignKey("business_units.id"), nullable=False)
    name = Column(String(200), nullable=False)
    description = Column(Text, default="")
    criticality_tier = Column(Integer, default=2)  # 1=Critical, 2=High, 3=Medium, 4=Low
    revenue_impact_per_hour_downtime = Column(Float, default=0)
    asset_criticality_inr = Column(Float, default=0)
    activities = Column(JSON, default=list)          # [{name, avl_req}]
    information_items = Column(JSON, default=list)   # [{name, conf_req, int_req}]

    business_unit = relationship("BusinessUnit", back_populates="processes")
    services = relationship("Service", back_populates="process", cascade="all, delete-orphan")

    # Cascade dependencies
    depends_on = relationship(
        "ProcessDependency",
        foreign_keys="ProcessDependency.process_id",
        back_populates="process",
        cascade="all, delete-orphan",
    )
    depended_by = relationship(
        "ProcessDependency",
        foreign_keys="ProcessDependency.depends_on_process_id",
        back_populates="dependency",
    )


class ProcessDependency(Base):
    """UVP: Business Process Cascade Simulation dependency graph."""
    __tablename__ = "process_dependencies"
    id = Column(Integer, primary_key=True, index=True)
    process_id = Column(Integer, ForeignKey("business_processes.id"), nullable=False)
    depends_on_process_id = Column(Integer, ForeignKey("business_processes.id"), nullable=False)
    dependency_type = Column(String(20), default="hard")   # hard | soft
    impact_multiplier = Column(Float, default=1.0)         # 0.0–1.0

    process = relationship("BusinessProcess", foreign_keys=[process_id], back_populates="depends_on")
    dependency = relationship("BusinessProcess", foreign_keys=[depends_on_process_id], back_populates="depended_by")


class Service(Base):
    __tablename__ = "services"
    id = Column(Integer, primary_key=True, index=True)
    process_id = Column(Integer, ForeignKey("business_processes.id"), nullable=False)
    name = Column(String(200), nullable=False)
    recovery_time_objective_hours = Column(Float, default=4)

    process = relationship("BusinessProcess", back_populates="services")
    assets = relationship("Asset", back_populates="service", cascade="all, delete-orphan")


# ── Assets, Vulnerabilities, Controls ────────────────────────────────────
class Asset(Base):
    __tablename__ = "assets"
    id = Column(Integer, primary_key=True, index=True)
    service_id = Column(Integer, ForeignKey("services.id"), nullable=True)
    name = Column(String(200), nullable=False)
    asset_type = Column(String(50), default="Server")
    criticality_tier = Column(Integer, default=2)
    internet_exposed = Column(Boolean, default=False)
    asset_value_inr = Column(Float, default=0)
    hourly_downtime_cost_inr = Column(Float, default=0)
    data_sensitivity_score = Column(Integer, default=1)
    revenue_dependency_score = Column(Integer, default=1)
    asset_criticality_score = Column(Integer, default=1)
    failed_logins = Column(Integer, default=0)
    anomaly_count = Column(Integer, default=0)
    business_unit = Column(String(100), default="")
    data_source = Column(String(30), default="synthetic_demo")
    source_document_id = Column(Integer, nullable=True)

    service = relationship("Service", back_populates="assets")
    vulnerabilities = relationship("Vulnerability", back_populates="asset", cascade="all, delete-orphan")
    controls = relationship("Control", secondary=asset_control, back_populates="assets")
    risk_scores = relationship("RiskScore", back_populates="asset", cascade="all, delete-orphan")


class Vulnerability(Base):
    __tablename__ = "vulnerabilities"
    id = Column(Integer, primary_key=True, index=True)
    asset_id = Column(Integer, ForeignKey("assets.id"), nullable=False)
    cve_id = Column(String(30), default="")
    cvss_score = Column(Float, default=0)
    epss_score = Column(Float, default=0)
    description = Column(Text, default="")
    discovered_date = Column(DateTime, default=dt.datetime.utcnow)
    patch_available = Column(Boolean, default=False)
    status = Column(String(20), default="open")  # open | in_progress | remediated
    severity = Column(String(20), default="medium")  # critical | high | medium | low
    framework_control_id = Column(String(50), default="")
    data_source = Column(String(30), default="synthetic_demo")

    asset = relationship("Asset", back_populates="vulnerabilities")


class Control(Base):
    __tablename__ = "controls"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    category = Column(String(30), default="preventive")  # preventive | detective | corrective
    maturity = Column(String(30), default="partial")  # planned | partial | full | optimized
    coverage_pct = Column(Float, default=0.5)
    implementation_cost_inr = Column(Float, default=0)
    risk_reduction_pct = Column(Float, default=0)
    framework_mappings = Column(JSON, default=list)  # [{framework, control_id}]
    applicable_asset_count = Column(Integer, default=0)
    data_source = Column(String(30), default="synthetic_demo")

    assets = relationship("Asset", secondary=asset_control, back_populates="controls")


# ── Incidents ────────────────────────────────────────────────────────────
class Incident(Base):
    __tablename__ = "incidents"
    id = Column(Integer, primary_key=True, index=True)
    org_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    date = Column(DateTime, default=dt.datetime.utcnow)
    incident_type = Column(String(50), default="Data Breach")
    asset_id = Column(Integer, nullable=True)
    financial_loss = Column(Float, default=0)
    description = Column(Text, default="")
    data_source = Column(String(30), default="synthetic_demo")

    organization = relationship("Organization", back_populates="incidents")


# ── Risk Scores & Runs ──────────────────────────────────────────────────
class RiskRun(Base):
    """Each Monte Carlo simulation run."""
    __tablename__ = "risk_runs"
    id = Column(Integer, primary_key=True, index=True)
    label = Column(String(50), default="")
    iterations = Column(Integer, default=10000)
    eal_inr = Column(Float, default=0)
    var_90_inr = Column(Float, default=0)
    var_95_inr = Column(Float, default=0)
    var_99_inr = Column(Float, default=0)
    mean_loss_inr = Column(Float, default=0)
    computed_at = Column(DateTime, default=dt.datetime.utcnow)
    distribution_bins = Column(JSON, default=list)  # [{start, end, count}]


class RiskScore(Base):
    __tablename__ = "risk_scores"
    id = Column(Integer, primary_key=True, index=True)
    asset_id = Column(Integer, ForeignKey("assets.id"), nullable=True)
    entity_type = Column(String(30), default="asset")  # org | business_unit | process | asset
    entity_id = Column(Integer, default=0)
    likelihood = Column(Float, default=0)
    likelihood_shap_values = Column(JSON, default=dict)  # {feature: shap_value}
    financial_impact = Column(Float, default=0)
    eal = Column(Float, default=0)
    var_95 = Column(Float, default=0)
    contributing_vulnerabilities = Column(JSON, default=list)
    computed_at = Column(DateTime, default=dt.datetime.utcnow)

    asset = relationship("Asset", back_populates="risk_scores")


# ── Remediation & Optimization ───────────────────────────────────────────
class RemediationAction(Base):
    __tablename__ = "remediation_actions"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    description = Column(Text, default="")
    target_asset_id = Column(Integer, nullable=True)
    target_control_id = Column(Integer, nullable=True)
    estimated_cost = Column(Float, default=0)
    estimated_risk_reduction = Column(Float, default=0)
    estimated_effort_days = Column(Integer, default=0)
    priority_rank = Column(Integer, default=0)
    framework_mapping = Column(String(200), default="")
    status = Column(String(20), default="pending")  # pending | approved | completed


class InvestmentScenario(Base):
    __tablename__ = "investment_scenarios"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), default="")
    budget = Column(Float, default=0)
    selected_actions = Column(JSON, default=list)
    total_risk_reduction = Column(Float, default=0)
    resulting_eal = Column(Float, default=0)
    rosi = Column(Float, default=0)
    computed_at = Column(DateTime, default=dt.datetime.utcnow)


# ── Telemetry ────────────────────────────────────────────────────────────
class TelemetryEvent(Base):
    __tablename__ = "telemetry_events"
    id = Column(Integer, primary_key=True, index=True)
    event_type = Column(String(50), default="ingestion")
    source = Column(String(100), default="")
    details = Column(JSON, default=dict)
    timestamp = Column(DateTime, default=dt.datetime.utcnow)


# ── Settings ─────────────────────────────────────────────────────────────
class AppSettings(Base):
    __tablename__ = "app_settings"
    id = Column(Integer, primary_key=True, index=True)
    org_name = Column(String(200), default="Nova Financial Services")
    industry = Column(String(100), default="Financial Services")
    budget_inr = Column(Float, default=10_000_000)
    cost_per_record_inr = Column(Float, default=13_500)
    downtime_cost_per_hour_inr = Column(Float, default=500_000)
    regulatory_penalty_base_inr = Column(Float, default=2_500_000)
    reputational_multiplier = Column(Float, default=500_000)
    mc_iterations = Column(Integer, default=10_000)
