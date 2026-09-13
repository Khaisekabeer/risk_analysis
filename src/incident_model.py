import pandas as pd

def predict_incident_probability(df_row: pd.DataFrame) -> list:
    """
    Simulates the ML prediction for incident probability based on user answers.
    In a full production environment, this would call the XGBoost model 
    trained in src/train_models.py, but for the self-assessment chat UI, 
    we use a heuristic simulation of the ML weights.
    """
    row = df_row.iloc[0]
    prob = 0.05
    
    # Increase probability based on risk factors
    if row.get("internet_exposed", 0) == 1:
        prob += 0.20
    if float(row.get("unpatched_cves", 0)) > 5:
        prob += 0.25
    if row.get("mfa_enabled", 1) == 0:
        prob += 0.15
        
    # Decrease probability based on controls
    control_eff = float(row.get("control_effectiveness", 5))
    prob -= (control_eff * 0.02)
    
    return [max(0.01, min(prob, 0.99))]
