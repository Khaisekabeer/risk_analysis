import sqlite3
import pandas as pd
from pathlib import Path
from config import RAW_DATA_DIR

class WhatIfSandbox:
    """
    Simulates the financial impact of a theoretical security action 
    without actually altering the live production database.
    """
    def __init__(self):
        self.db_path = RAW_DATA_DIR.parent / "risk_analysis.db"

    def simulate_action(self, asset_id: str, action_name: str, risk_reduction_percentage: float):
        print(f"\n--- What-If Scenario Sandbox ---")
        print(f"Target Asset: {asset_id}")
        print(f"Proposed Action: {action_name} (Expected {risk_reduction_percentage*100}% Risk Reduction)")
        
        try:
            with sqlite3.connect(self.db_path) as conn:
                # 1. Fetch current risk baseline
                sql = f"SELECT likely_loss_inr, max_loss_inr FROM risk_scenarios WHERE asset_id = '{asset_id}'"
                df = pd.read_sql_query(sql, conn)
                
                if df.empty:
                    print(f"Error: Asset {asset_id} not found in risk scenarios.")
                    return
                
                current_likely_loss = df.iloc[0]['likely_loss_inr']
                current_max_loss = df.iloc[0]['max_loss_inr']
                
                # 2. Run the simulation math (Delta calculation)
                simulated_likely_loss = current_likely_loss * (1 - risk_reduction_percentage)
                simulated_max_loss = current_max_loss * (1 - risk_reduction_percentage)
                
                delta_savings = current_likely_loss - simulated_likely_loss
                
                print("\n[Simulation Results]")
                print(f"Current Likely Loss (EAL): INR {current_likely_loss:,.2f}")
                print(f"Simulated Likely Loss:     INR {simulated_likely_loss:,.2f}")
                print("-" * 40)
                print(f"Financial Risk Averted (Delta): INR {delta_savings:,.2f}")
                
                if delta_savings > 10000000:
                    print("\nRecommendation: highly recommended action. Prioritize immediately.")
                else:
                    print("\nRecommendation: Moderate impact. Schedule for normal maintenance window.")

        except sqlite3.OperationalError:
            print("Database connection failed. Please ensure the pipeline has been run.")

if __name__ == "__main__":
    sandbox = WhatIfSandbox()
    # Test a what-if scenario on the first asset
    sandbox.simulate_action(asset_id="AST-000001", action_name="Deploy Network Segmentation", risk_reduction_percentage=0.25)
