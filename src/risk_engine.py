import pandas as pd
import numpy as np
import joblib
from config import PROCESSED_DATA_DIR, RAW_DATA_DIR, MODEL_DIR

class RiskEngine:
    def __init__(self):
        print("Loading Models and Data...")
        self.incident_model = joblib.load(MODEL_DIR / "incident_model_xgb.pkl")
        self.impact_model = joblib.load(MODEL_DIR / "impact_model_xgb.pkl")
        
        # Load raw assets to join with our predictions later
        self.assets = pd.read_csv(RAW_DATA_DIR / "assets.csv")
        
        # Load risk scenarios for Monte Carlo
        self.scenarios = pd.read_csv(RAW_DATA_DIR / "risk_scenarios.csv")
        
        # Load the feature dataset (we'll predict on the full dataset, so we combine train and test just for scoring)
        # Note: In production, this would just be the live current state of assets
        self.X_train = pd.read_csv(PROCESSED_DATA_DIR / "X_train.csv")
        self.X_test = pd.read_csv(PROCESSED_DATA_DIR / "X_test.csv")
        self.X_full = pd.concat([self.X_train, self.X_test], ignore_index=True)
        
        # We need the original asset_ids matching the order of X_full. 
        # Since we dropped asset_id during feature engineering, we will re-build the inference set
        # This is a bit hacky for a script, but we can just use the raw assets and re-merge
        pass 

    def calculate_ml_eal(self):
        """Calculates the Expected Annual Loss (EAL) using the XGBoost ML Models"""
        print("\n--- Calculating Machine Learning EAL ---")
        
        # For simplicity in this script, we'll predict using X_full
        # In a real pipeline, we'd have a function `preprocess(assets)`
        
        probabilities = self.incident_model.predict_proba(self.X_full)[:, 1]
        impacts = self.impact_model.predict(self.X_full)
        
        # EAL = Probability * Financial Impact
        eals = probabilities * impacts
        
        total_enterprise_eal = np.sum(eals)
        print(f"Total Enterprise EAL (ML Based): INR {total_enterprise_eal:,.2f}")
        
        return total_enterprise_eal

    def run_monte_carlo_var(self, iterations=10000):
        """Runs a Monte Carlo simulation using the min/likely/max risk scenarios"""
        print(f"\n--- Running Monte Carlo Simulation ({iterations} iterations) ---")
        
        num_scenarios = len(self.scenarios)
        
        # Convert scenarios to numpy arrays for fast vectorized computation
        probs = self.scenarios['incident_probability_annual'].values
        mins = self.scenarios['min_loss_inr'].values
        likelies = self.scenarios['likely_loss_inr'].values
        maxs = self.scenarios['max_loss_inr'].values
        
        # Matrix to hold simulated total loss for the enterprise per iteration
        enterprise_losses = np.zeros(iterations)
        
        for i in range(iterations):
            if i % 2500 == 0 and i > 0:
                print(f"Completed {i} iterations...")
                
            # 1. Did the incident happen this year? (Vectorized binomial coin flip for all scenarios)
            incidents_occurred = np.random.binomial(n=1, p=probs)
            
            # 2. If it happened, how much did it cost? (Vectorized Triangular Distribution)
            # numpy.random.triangular takes (left, mode, right)
            simulated_costs = np.random.triangular(mins, likelies, maxs)
            
            # 3. Apply the cost only to incidents that occurred
            actual_losses = simulated_costs * incidents_occurred
            
            # 4. Sum up all losses across the enterprise for this specific "year"
            enterprise_losses[i] = np.sum(actual_losses)
            
        # Calculate VaR
        var_90 = np.percentile(enterprise_losses, 90)
        var_95 = np.percentile(enterprise_losses, 95)
        var_99 = np.percentile(enterprise_losses, 99)
        mean_loss = np.mean(enterprise_losses)
        
        print("\n--- Cyber Value at Risk (VaR) Results ---")
        print(f"Simulated Mean Annual Loss: INR {mean_loss:,.2f}")
        print(f"90% Cyber VaR: INR {var_90:,.2f}")
        print(f"95% Cyber VaR: INR {var_95:,.2f}")
        print(f"99% Cyber VaR: INR {var_99:,.2f}")
        
        # Save the loss distribution for the dashboard later
        np.save(RAW_DATA_DIR / "monte_carlo_distribution.npy", enterprise_losses)
        
        return var_95, var_99

if __name__ == "__main__":
    engine = RiskEngine()
    engine.calculate_ml_eal()
    engine.run_monte_carlo_var(iterations=10000)
