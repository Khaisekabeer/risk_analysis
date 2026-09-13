import sqlite3
import pandas as pd
from pathlib import Path
from config import RAW_DATA_DIR
import datetime

class AuditReporter:
    """
    Connects to the SQLite database and generates a formal text/markdown
    Regulatory Audit Evidence Report.
    """
    def __init__(self):
        self.db_path = RAW_DATA_DIR.parent / "risk_analysis.db"
        self.report_path = RAW_DATA_DIR.parent / "Regulatory_Audit_Evidence.md"

    def generate_report(self):
        print(f"Generating Regulatory Audit Evidence Report...")
        
        try:
            with sqlite3.connect(self.db_path) as conn:
                # 1. Get Enterprise Financial KPIs
                sql_kpi = "SELECT SUM(likely_loss_inr) as total_eal FROM risk_scenarios"
                df_kpi = pd.read_sql_query(sql_kpi, conn)
                total_eal = df_kpi.iloc[0]['total_eal'] if not df_kpi.empty else 0
                
                # 2. Get Top 5 Optimized Actions
                sql_actions = """
                SELECT action_name, target_asset_id, framework_mapping, implementation_cost_inr 
                FROM optimization_results 
                ORDER BY implementation_cost_inr DESC 
                LIMIT 5
                """
                df_actions = pd.read_sql_query(sql_actions, conn)
                
                # 3. Write Markdown Report
                with open(self.report_path, "w") as f:
                    f.write("# Enterprise Cyber Risk Audit Report\n")
                    f.write(f"**Date Generated:** {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
                    f.write("---\n\n")
                    
                    f.write("## 1. Executive Financial KPIs\n")
                    f.write(f"- **Total Enterprise Expected Annual Loss (EAL):** INR {total_eal:,.2f}\n")
                    f.write("- **Methodology:** SciPy Monte Carlo Simulations (10,000 Iterations)\n\n")
                    
                    f.write("## 2. Prioritized Compliance Remediation Plan\n")
                    f.write("The following actions have been mathematically optimized by the AI Knapsack Solver to maximize risk reduction against budget constraints.\n\n")
                    
                    if not df_actions.empty:
                        for _, row in df_actions.iterrows():
                            f.write(f"### {row['action_name']} on {row['target_asset_id']}\n")
                            f.write(f"- **Cost:** INR {row['implementation_cost_inr']:,.2f}\n")
                            f.write(f"- **Regulatory Framework Satisfied:** `{row['framework_mapping']}`\n\n")
                    else:
                        f.write("No optimized actions found. Run the optimizer first.\n")
                        
                print(f"Report generated successfully at: {self.report_path}")
                print("(Note: In full production, this Markdown converts to a signed PDF).")
                
        except Exception as e:
            print(f"Failed to generate report: {e}")

if __name__ == "__main__":
    reporter = AuditReporter()
    reporter.generate_report()
