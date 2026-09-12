import pandas as pd
import numpy as np
import shap
import joblib
from config import PROCESSED_DATA_DIR, MODEL_DIR

class Explainer:
    def __init__(self):
        print("Loading Calibrated Model and Data for SHAP...")
        self.calibrated_model = joblib.load(MODEL_DIR / "incident_model_xgb.pkl")
        self.X_train = pd.read_csv(PROCESSED_DATA_DIR / "X_train.csv")
        self.feature_names = joblib.load(MODEL_DIR / "feature_names.pkl")
        
        # Extract the underlying XGBoost model from the CalibratedClassifier
        # (CalibratedClassifierCV fits multiple classifiers if cv>1, or 1 if cv="prefit". We'll use the first one.)
        self.base_xgb = self.calibrated_model.calibrated_classifiers_[0].estimator
        
        print("Initializing SHAP TreeExplainer...")
        self.explainer = shap.TreeExplainer(self.base_xgb)
        
    def get_top_risk_drivers(self, asset_idx=0):
        """Extracts the top contributing features for a specific asset"""
        # Get a single row
        instance = self.X_train.iloc[[asset_idx]]
        
        # Calculate SHAP values
        shap_values = self.explainer.shap_values(instance)
        
        # Ensure shap_values is a 1D array for the single instance
        if isinstance(shap_values, list):
            shap_values = shap_values[1][0] # For binary classification in some SHAP versions
        elif shap_values.ndim == 2:
            shap_values = shap_values[0]
            
        feature_contributions = list(zip(self.feature_names, shap_values, instance.values[0]))
        
        # Sort by absolute SHAP value (impact magnitude)
        feature_contributions.sort(key=lambda x: abs(x[1]), reverse=True)
        
        print(f"\n--- Top Risk Drivers for Asset (Row {asset_idx}) ---")
        for feature, shap_val, actual_val in feature_contributions[:5]:
            direction = "Increased Risk" if shap_val > 0 else "Decreased Risk"
            print(f"- {feature}: {actual_val:.2f} | Impact: {shap_val:+.3f} ({direction})")
            
        return feature_contributions

if __name__ == "__main__":
    explainer = Explainer()
    # Explain the first 3 assets
    explainer.get_top_risk_drivers(0)
    explainer.get_top_risk_drivers(1)
    explainer.get_top_risk_drivers(2)
