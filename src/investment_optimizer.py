import pandas as pd
import pulp
from config import RAW_DATA_DIR

class InvestmentOptimizer:
    def __init__(self):
        print("Loading Remediation Catalog for Optimization...")
        self.catalog = pd.read_csv(RAW_DATA_DIR / "remediation_catalog.csv")
        
        # We need a baseline risk to calculate absolute risk reduction. 
        # For simplicity in this standalone script, let's assume average asset VaR is 10,000,000 INR (1 Crore)
        # In the full platform, this links directly to the risk_engine.py output
        self.assumed_asset_risk = 10000000 
        
        self.catalog['absolute_risk_reduction'] = self.catalog['risk_reduction_percentage'] * self.assumed_asset_risk

    def optimize(self, budget_inr: float):
        print(f"\n--- Running Investment Optimization (Budget: INR {budget_inr:,.2f}) ---")
        
        # Define the problem
        prob = pulp.LpProblem("Maximize_Risk_Reduction", pulp.LpMaximize)
        
        # Decision variables (0 or 1 for each action)
        action_vars = {}
        for idx, row in self.catalog.iterrows():
            action_vars[row['action_id']] = pulp.LpVariable(row['action_id'], cat='Binary')
            
        # Objective Function: Maximize absolute risk reduction
        prob += pulp.lpSum([action_vars[row['action_id']] * row['absolute_risk_reduction'] 
                            for idx, row in self.catalog.iterrows()]), "Total_Risk_Reduction"
        
        # Constraint: Total cost must be <= Budget
        prob += pulp.lpSum([action_vars[row['action_id']] * row['implementation_cost_inr'] 
                            for idx, row in self.catalog.iterrows()]) <= budget_inr, "Budget_Constraint"
        
        # Solve
        prob.solve(pulp.PULP_CBC_CMD(msg=0))
        
        print(f"Optimization Status: {pulp.LpStatus[prob.status]}")
        
        # Gather Results
        total_cost = 0
        total_reduction = 0
        selected_actions = []
        
        for idx, row in self.catalog.iterrows():
            if action_vars[row['action_id']].value() == 1.0:
                selected_actions.append(row)
                total_cost += row['implementation_cost_inr']
                total_reduction += row['absolute_risk_reduction']
                
        print(f"\n--- Optimization Results ---")
        print(f"Total Actions Selected: {len(selected_actions)}")
        print(f"Total Investment Cost: INR {total_cost:,.2f} (Budget Utilization: {(total_cost/budget_inr)*100:.2f}%)")
        print(f"Total Risk Reduction: INR {total_reduction:,.2f}")
        
        if total_cost > 0:
            rosi = ((total_reduction - total_cost) / total_cost) * 100
            print(f"Return on Security Investment (ROSI): {rosi:.2f}%")
            
        # Show top 5 actions
        print("\nTop 5 Recommended Actions:")
        df_selected = pd.DataFrame(selected_actions).sort_values(by="risk_reduction_percentage", ascending=False)
        for _, row in df_selected.head(5).iterrows():
            print(f"- {row['action_name']} on {row['target_asset_id']} | Cost: INR {row['implementation_cost_inr']:,.2f} | Mapped to: {row['framework_mapping']}")
            
        # Save final optimized strategy to SQLite database
        try:
            import sqlite3
            db_path = RAW_DATA_DIR.parent / "risk_analysis.db"
            if db_path.exists():
                print(f"\nSaving optimization strategy to SQLite database ({db_path.name})...")
                df_out = pd.DataFrame(selected_actions)
                # Attach the ROSI metric so it's visible in the DB
                df_out['calculated_rosi_percentage'] = rosi if total_cost > 0 else 0
                with sqlite3.connect(db_path) as conn:
                    df_out.to_sql('optimization_results', conn, if_exists='replace', index=False)
                print("Successfully saved to 'optimization_results' table!")
        except Exception as e:
            print(f"Could not save to SQLite: {e}")

if __name__ == "__main__":
    optimizer = InvestmentOptimizer()
    # Try to optimize for a 1 Crore budget (10,000,000 INR)
    optimizer.optimize(budget_inr=10000000)
