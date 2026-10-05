import os
from pathlib import Path
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # ── Paths ──────────────────────────────────────────────────────────────
    BASE_DIR: Path = Path(__file__).resolve().parent.parent  # risk_analysis/
    DATA_DIR: Path = BASE_DIR / "data"
    RAW_DATA_DIR: Path = DATA_DIR / "raw"
    PROCESSED_DATA_DIR: Path = DATA_DIR / "processed"
    MODEL_DIR: Path = BASE_DIR / "models"
    UPLOAD_DIR: Path = DATA_DIR / "uploads"

    # ── Database ───────────────────────────────────────────────────────────
    DATABASE_URL: str = f"sqlite:///{BASE_DIR / 'data' / 'cyberrisk.db'}"

    # ── Auth ───────────────────────────────────────────────────────────────
    SECRET_KEY: str = "cyberrisk-dev-secret-change-in-production-2026"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24 hours

    # ── External APIs ─────────────────────────────────────────────────────
    ANTHROPIC_API_KEY: str = ""

    # ── Risk Engine ───────────────────────────────────────────────────────
    MONTE_CARLO_ITERATIONS: int = 10_000
    DEFAULT_BUDGET_INR: float = 10_000_000  # ₹1 Crore

    # ── Financial Assumptions (Indian market defaults) ────────────────────
    COST_PER_STOLEN_RECORD_INR: float = 13_500
    AVERAGE_RECORDS_PER_SERVER: int = 50_000
    AVERAGE_RECORDS_PER_DATABASE: int = 250_000
    DOWNTIME_RESOLUTION_HOURS_MEAN: float = 24
    REPUTATIONAL_DAMAGE_MULTIPLIER: float = 500_000
    CRITICALITY_MULTIPLIERS: dict = {1: 0.5, 2: 1.2, 3: 2.0, 4: 3.0}
    REGULATORY_FINES: dict = {
        "low": 0,
        "medium": 500_000,
        "high": 2_500_000,
        "critical": 5_000_000,
    }

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()

# Ensure directories exist
for d in [settings.RAW_DATA_DIR, settings.PROCESSED_DATA_DIR,
          settings.MODEL_DIR, settings.UPLOAD_DIR]:
    os.makedirs(d, exist_ok=True)
