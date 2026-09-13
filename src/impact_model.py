import pandas as pd
import json
from pathlib import Path
import os

def predict_expected_loss(df_row: pd.DataFrame) -> list:
    """
    Simulates the ML prediction for financial impact based on user answers.
    In a full production environment, this would call the XGBoost model 
    trained in src/train_models.py. For the chat UI, it calculates 
    an estimated loss using the same actuarial heuristics.
    """
    row = df_row.iloc[0]
    
    # Base loss
    base_loss = 1000000
    
    # Scale by sensitivity
    sensitivity = str(row.get("data_sensitivity", "medium")).lower()
    if sensitivity == "high":
        base_loss *= 5
    elif sensitivity == "low":
        base_loss *= 0.2
        
    # Scale by criticality
    criticality = str(row.get("asset_criticality", "medium")).lower()
    if criticality == "high":
        base_loss *= 3
    elif criticality == "low":
        base_loss *= 0.5
        
    return [base_loss]
