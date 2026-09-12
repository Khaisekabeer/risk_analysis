import os
from pathlib import Path

# Base Paths
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"

# Subdirectories for data
RAW_DATA_DIR = DATA_DIR / "raw"
PROCESSED_DATA_DIR = DATA_DIR / "processed"
MODEL_DIR = BASE_DIR / "models"

# Ensure directories exist
for d in [RAW_DATA_DIR, PROCESSED_DATA_DIR, MODEL_DIR]:
    os.makedirs(d, exist_ok=True)

# Synthetic Data Configuration
SYNTHETIC_DATA_CONFIG = {
    "num_assets": 10000,
    "num_vulnerabilities": 50000,
    "num_controls": 30000,
    "observation_period_days": 365,
    "incident_base_rate": 0.05,  # 5% base annual rate for class imbalance
    "random_seed": 42
}

# Financial Loss Distribution (Lognormal)
LOSS_CONFIG = {
    "mu": 12.0,      # Mean of log-loss (approx log(160,000))
    "sigma": 1.5,    # Spread (skewness)
    "min_loss": 5000,
    "max_loss": 100000000 # Max capped loss (e.g., 100M)
}
