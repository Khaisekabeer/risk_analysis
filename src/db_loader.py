import sqlite3
import pandas as pd
from pathlib import Path
from config import RAW_DATA_DIR

class DatabaseLoader:
    def __init__(self):
        self.db_path = RAW_DATA_DIR.parent / "risk_analysis.db"
        
    def setup_schema(self, cursor):
        print("Creating enterprise SQL schema...")
        
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS assets (
            asset_id TEXT PRIMARY KEY,
            asset_name TEXT,
            asset_type TEXT,
            business_unit TEXT,
            internet_exposed INTEGER,
            asset_criticality_score INTEGER,
            data_sensitivity_score INTEGER,
            revenue_dependency_score INTEGER,
            asset_value_inr REAL,
            hourly_downtime_cost_inr REAL,
            failed_logins INTEGER,
            anomaly_count INTEGER
        )
        ''')
        
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS threat_intelligence (
            cve_id TEXT PRIMARY KEY,
            cvss_score REAL,
            epss_score REAL
        )
        ''')
        
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS asset_vulnerabilities (
            vuln_id TEXT PRIMARY KEY,
            asset_id TEXT,
            cve_id TEXT,
            cvss_score REAL,
            epss_score REAL,
            remediation_status TEXT,
            framework_control_id TEXT,
            FOREIGN KEY(asset_id) REFERENCES assets(asset_id),
            FOREIGN KEY(cve_id) REFERENCES threat_intelligence(cve_id)
        )
        ''')
        
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS remediation_catalog (
            action_id TEXT PRIMARY KEY,
            target_asset_id TEXT,
            action_name TEXT,
            implementation_cost_inr REAL,
            risk_reduction_percentage REAL,
            framework_mapping TEXT,
            mapping_rationale TEXT,
            FOREIGN KEY(target_asset_id) REFERENCES assets(asset_id)
        )
        ''')
        
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS risk_scenarios (
            scenario_id INTEGER PRIMARY KEY AUTOINCREMENT,
            asset_id TEXT,
            threat_category TEXT,
            min_loss_inr REAL,
            likely_loss_inr REAL,
            max_loss_inr REAL,
            incident_probability_annual REAL,
            FOREIGN KEY(asset_id) REFERENCES assets(asset_id)
        )
        ''')

    def load_data(self, conn):
        print("Loading data into SQLite database...")
        
        # 1. Load Assets
        if (RAW_DATA_DIR / "assets.csv").exists():
            print(" -> Loading Assets table")
            assets_df = pd.read_csv(RAW_DATA_DIR / "assets.csv")
            assets_df.to_sql('assets', conn, if_exists='replace', index=False)
            
        # 2. Load Threat Intelligence (Combining NVD and EPSS)
        nvd_path = RAW_DATA_DIR / "nvd_cve_data.csv"
        threat_path = RAW_DATA_DIR / "real_threat_intel.csv"
        
        ti_df = pd.DataFrame()
        if nvd_path.exists():
            ti_df = pd.read_csv(nvd_path)
            if threat_path.exists():
                epss_df = pd.read_csv(threat_path)
                ti_df = pd.merge(ti_df, epss_df[["cve_id", "epss_score"]], on="cve_id", how="left")
            else:
                ti_df["epss_score"] = None
                
        if not ti_df.empty:
            print(" -> Loading Threat Intelligence table")
            # Ensure unique CVEs for Primary Key
            ti_df = ti_df.drop_duplicates(subset=['cve_id'])
            ti_df.to_sql('threat_intelligence', conn, if_exists='replace', index=False)
            
        # 3. Load Vulnerabilities
        if (RAW_DATA_DIR / "vulnerabilities.csv").exists():
            print(" -> Loading Asset Vulnerabilities table")
            vulns_df = pd.read_csv(RAW_DATA_DIR / "vulnerabilities.csv")
            vulns_df.to_sql('asset_vulnerabilities', conn, if_exists='replace', index=False)
            
        # 4. Load Remediation Catalog
        if (RAW_DATA_DIR / "remediation_catalog.csv").exists():
            print(" -> Loading Remediation Catalog table")
            remediation_df = pd.read_csv(RAW_DATA_DIR / "remediation_catalog.csv")
            remediation_df.to_sql('remediation_catalog', conn, if_exists='replace', index=False)
            
        # 5. Load Risk Scenarios
        if (RAW_DATA_DIR / "risk_scenarios.csv").exists():
            print(" -> Loading Risk Scenarios table")
            scenarios_df = pd.read_csv(RAW_DATA_DIR / "risk_scenarios.csv")
            scenarios_df.to_sql('risk_scenarios', conn, if_exists='replace', index=True, index_label="scenario_id")

    def run(self):
        print(f"Connecting to {self.db_path}...")
        
        # Remove old DB if it exists to ensure a fresh schema
        if self.db_path.exists():
            self.db_path.unlink()
            
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            self.setup_schema(cursor)
            conn.commit()
            self.load_data(conn)
            
        print("\nDatabase migration complete!")
        print(f"You can now open {self.db_path} in DB Browser for SQLite to show the judges.")

if __name__ == "__main__":
    loader = DatabaseLoader()
    loader.run()
