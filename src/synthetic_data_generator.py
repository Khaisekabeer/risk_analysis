import os
import numpy as np
import pandas as pd
from typing import Dict
from scipy.special import expit
import uuid

from config import RAW_DATA_DIR, SYNTHETIC_DATA_CONFIG, LOSS_CONFIG

class RelationalDataGenerator:
    def __init__(self, config: Dict, loss_config: Dict):
        self.config = config
        self.loss_config = loss_config
        self.num_assets = self.config["num_assets"]
        np.random.seed(self.config["random_seed"])
        
        # Threat categories
        self.threats = ["Ransomware", "Data Breach", "Insider Threat", "DDoS"]

    def generate_assets(self) -> pd.DataFrame:
        print("Generating assets...")
        asset_ids = [f"AST-{i:06d}" for i in range(1, self.num_assets + 1)]
        asset_types = ["Server", "Database", "Workstation", "Network_Device", "Cloud_Storage"]
        business_units = ["Finance", "HR", "Engineering", "Sales", "Marketing", "Operations"]
        
        assets = pd.DataFrame({
            "asset_id": asset_ids,
            "asset_name": [f"Asset_{i}" for i in range(1, self.num_assets + 1)],
            "asset_type": np.random.choice(asset_types, self.num_assets, p=[0.3, 0.1, 0.4, 0.1, 0.1]),
            "business_unit": np.random.choice(business_units, self.num_assets),
            "internet_exposed": np.random.choice([0, 1], self.num_assets, p=[0.7, 0.3]),
            "asset_criticality_score": np.random.choice([1, 2, 3, 4, 5], self.num_assets, p=[0.4, 0.3, 0.15, 0.1, 0.05]),
            "data_sensitivity_score": np.random.choice([1, 2, 3, 4, 5], self.num_assets, p=[0.4, 0.3, 0.15, 0.1, 0.05]),
        })
        
        # Revenue dependency score (1-5)
        revenue_probs = (assets["asset_criticality_score"] + assets["data_sensitivity_score"]) / 2.0
        revenue_probs = np.clip(np.round(revenue_probs + np.random.normal(0, 0.5, self.num_assets)), 1, 5).astype(int)
        assets["revenue_dependency_score"] = revenue_probs
        
        # Asset Value and Downtime Costs
        # e.g., Criticality 5 -> high cost
        assets["asset_value_inr"] = assets["asset_criticality_score"] * np.random.uniform(500000, 2000000, self.num_assets)
        assets["hourly_downtime_cost_inr"] = assets["revenue_dependency_score"] * np.random.uniform(10000, 100000, self.num_assets)
        
        # Optional: telemetry fields needed for ML
        assets["failed_logins"] = np.random.poisson(lam=np.where(assets["internet_exposed"], 15.0, 2.0))
        assets["anomaly_count"] = np.random.poisson(lam=np.where(assets["internet_exposed"], 3.0, 0.5))
        
        return assets

    def generate_vulnerabilities(self, assets: pd.DataFrame) -> pd.DataFrame:
        print("Generating 1:N vulnerabilities...")
        vuln_records = []
        
        # Load real-world threat intel (EPSS) and NVD (CVSS)
        threat_intel_path = RAW_DATA_DIR / "real_threat_intel.csv"
        nvd_path = RAW_DATA_DIR / "nvd_cve_data.csv"
        
        cve_pool = []
        if nvd_path.exists():
            print("Loading massive NVD dataset for unbiased, real-world CVSS scores...")
            nvd_df = pd.read_csv(nvd_path)
            
            if threat_intel_path.exists():
                epss_df = pd.read_csv(threat_intel_path)
                # Merge them. Outer join to keep everything, prioritizing real data
                merged = pd.merge(nvd_df, epss_df[["cve_id", "epss_score"]], on="cve_id", how="left")
            else:
                merged = nvd_df
                merged["epss_score"] = None
                
            cve_pool = merged.to_dict('records')
        elif threat_intel_path.exists():
            print("Loading EPSS threat intel...")
            real_intel = pd.read_csv(threat_intel_path)
            cve_pool = real_intel.to_dict('records')
        else:
            cve_pool = [{"cve_id": f"CVE-2024-{np.random.randint(1000, 9999)}", 
                         "cvss_score": None, "epss_score": None} for _ in range(500)]
                         
        frameworks = [
            "NIST-DE.CM-4", "NIST-PR.DS-1", "NIST-PR.AC-5",
            "ISO27001-A.12.6", "ISO27001-A.9.4", "ISO27001-A.12.2",
            "CIS-Control-7", "CIS-Control-14",
            "RBI-CS-4", "RBI-CS-4.1", 
            "SEBI-CS-3", "SEBI-CS-Cyber-Resilience"
        ]
        
        for _, row in assets.iterrows():
            # 0 to 10 vulns per asset
            num_vulns = np.random.poisson(lam=np.where(row["internet_exposed"], 4.0, 1.0))
            for _ in range(num_vulns):
                cve_data = np.random.choice(cve_pool)
                
                # If we have real data, use it. Otherwise, generate random.
                cvss = cve_data["cvss_score"] if pd.notna(cve_data.get("cvss_score")) else np.clip(np.random.normal(loc=6.0, scale=2.0), 1.0, 10.0)
                
                if pd.notna(cve_data.get("epss_score")):
                    epss = cve_data["epss_score"]
                else:
                    epss = np.clip(np.random.beta(a=1, b=5), 0, 1) if cvss > 7.0 else np.random.beta(a=1, b=10)
                
                vuln_records.append({
                    "vuln_id": f"VULN-{uuid.uuid4().hex[:8]}",
                    "asset_id": row["asset_id"],
                    "cve_id": cve_data["cve_id"],
                    "cvss_score": round(cvss, 1),
                    "epss_score": round(epss, 4),
                    "remediation_status": np.random.choice(["Unpatched", "In_Progress", "Mitigated"], p=[0.7, 0.2, 0.1]),
                    "framework_control_id": np.random.choice(frameworks)
                })
                
        return pd.DataFrame(vuln_records)

    def assign_framework_and_rationale(self, action_name: str, asset_row: pd.Series) -> tuple:
        frameworks = []
        reasons = []
        
        # 1. Action-based rules
        if "Patch" in action_name:
            frameworks.append("CIS-Control-7")
            reasons.append(f"CIS Control 7 mandates continuous vulnerability management for {action_name}.")
        elif "MFA" in action_name:
            frameworks.append("ISO27001-A.9.4")
            reasons.append("ISO 27001 requires strict authentication for access control.")
        elif "EDR" in action_name:
            frameworks.append("NIST-PR.DS-1")
            reasons.append("NIST requires continuous data protection and endpoint monitoring.")
        elif "Segmentation" in action_name:
            frameworks.append("NIST-PR.AC-5")
            reasons.append("Network segmentation satisfies NIST network access control requirements.")
            
        # 2. Asset Context rules
        if asset_row.get("internet_exposed") == 1:
            frameworks.append("SEBI-CS-Cyber-Resilience")
            reasons.append("Asset is internet-facing, falling under SEBI perimeter defense mandates.")
            
        if asset_row.get("asset_criticality_score", 0) >= 4:
            frameworks.append("RBI-CS-4.1")
            reasons.append("High financial criticality triggers RBI critical infrastructure protection guidelines.")
            
        if not frameworks:
            frameworks.append("General-Best-Practice")
            reasons.append("Standard security hygiene.")
            
        return "|".join(frameworks), " ".join(reasons)

    def generate_remediation_catalog(self, assets: pd.DataFrame, vulns: pd.DataFrame) -> pd.DataFrame:
        print("Generating remediation catalog...")
        catalog = []
        
        actions = [
            ("Upgrade EDR Coverage", 2500000, 0.15),
            ("Patch Critical CVEs", 800000, 0.20),
            ("Enforce MFA", 1500000, 0.10),
            ("Network Segmentation", 4500000, 0.25)
        ]
        
        action_counter = 1
        for _, row in assets.iterrows():
            # Assign 1 to 3 random actions per asset
            num_actions = np.random.randint(1, 4)
            chosen_actions = np.random.choice(len(actions), num_actions, replace=False)
            
            for action_idx in chosen_actions:
                name, cost, reduction = actions[action_idx]
                
                if name == "Patch Critical CVEs":
                    asset_vulns = vulns[vulns["asset_id"] == row["asset_id"]]
                    if not asset_vulns.empty:
                        top_cve = asset_vulns.iloc[0]["cve_id"]
                        name = f"Patch {top_cve}"
                
                # Dynamically calculate explainable mapping based on asset context
                framework, rationale = self.assign_framework_and_rationale(name, row)
                
                # Scale cost slightly by asset size
                scaled_cost = cost * np.random.uniform(0.8, 1.2)
                
                catalog.append({
                    "action_id": f"ACT-{action_counter:06d}",
                    "target_asset_id": row["asset_id"],
                    "action_name": name,
                    "implementation_cost_inr": round(scaled_cost, 2),
                    "risk_reduction_percentage": reduction,
                    "framework_mapping": framework,
                    "mapping_rationale": rationale
                })
                action_counter += 1
                
        return pd.DataFrame(catalog)

    def generate_risk_scenarios(self, assets: pd.DataFrame, vulns: pd.DataFrame) -> pd.DataFrame:
        print("Generating Monte Carlo risk scenarios & incident targets...")
        
        # Calculate agg vuln stats for ML probability simulation
        agg_vulns = vulns.groupby("asset_id").agg(
            critical_vuln_count=("cvss_score", lambda x: (x >= 9.0).sum()),
            avg_epss=("epss_score", "mean")
        ).reset_index()
        
        df = assets.merge(agg_vulns, on="asset_id", how="left").fillna(0)
        
        scenarios = []
        incidents = []
        
        for _, row in df.iterrows():
            # Probability model
            logit_p = -3.5 + (0.8 * row["internet_exposed"]) + (0.4 * row["critical_vuln_count"]) + (1.5 * row["avg_epss"])
            p_incident = expit(logit_p)
            
            # Historical incident generation for ML
            incident_occurred = np.random.binomial(n=1, p=p_incident)
            
            # ML Target: Total Loss (if incident happened historically)
            ml_total_loss = 0.0
            if incident_occurred == 1:
                base_loss = np.random.lognormal(mean=self.loss_config["mu"], sigma=self.loss_config["sigma"])
                ml_total_loss = base_loss * row["asset_criticality_score"] * row["data_sensitivity_score"]
                ml_total_loss = min(ml_total_loss, self.loss_config["max_loss"])
                
            incidents.append({
                "asset_id": row["asset_id"],
                "incident_occurred": incident_occurred,
                "total_loss_inr": round(ml_total_loss, 2)
            })
            
            # Monte Carlo Scenarios (min, likely, max)
            for threat in self.threats:
                # E.g. Data breach only affects high data sensitivity
                if threat == "Data Breach" and row["data_sensitivity_score"] < 3:
                    continue
                
                likely_loss = np.random.lognormal(mean=self.loss_config["mu"], sigma=1.0) * row["asset_criticality_score"]
                min_loss = likely_loss * np.random.uniform(0.1, 0.4)
                max_loss = likely_loss * np.random.uniform(2.0, 5.0)
                
                # Split probability across threats
                threat_prob = p_incident * np.random.uniform(0.1, 0.4)
                
                scenarios.append({
                    "asset_id": row["asset_id"],
                    "threat_category": threat,
                    "min_loss_inr": round(min_loss, 2),
                    "likely_loss_inr": round(likely_loss, 2),
                    "max_loss_inr": round(max_loss, 2),
                    "incident_probability_annual": round(threat_prob, 4)
                })
                
        return pd.DataFrame(scenarios), pd.DataFrame(incidents)

    def run(self):
        assets = self.generate_assets()
        vulns = self.generate_vulnerabilities(assets)
        catalog = self.generate_remediation_catalog(assets, vulns)
        scenarios, incidents = self.generate_risk_scenarios(assets, vulns)
        
        # Save datasets
        print(f"Saving generated relational data to {RAW_DATA_DIR}...")
        assets.to_csv(RAW_DATA_DIR / "assets.csv", index=False)
        vulns.to_csv(RAW_DATA_DIR / "vulnerabilities.csv", index=False)
        catalog.to_csv(RAW_DATA_DIR / "remediation_catalog.csv", index=False)
        scenarios.to_csv(RAW_DATA_DIR / "risk_scenarios.csv", index=False)
        incidents.to_csv(RAW_DATA_DIR / "incidents.csv", index=False)
        
        print("\nGeneration Complete.")
        print(f"Total Assets: {len(assets)}")
        print(f"Total Vulnerabilities (1:N): {len(vulns)}")
        print(f"Total Remediation Actions (1:N): {len(catalog)}")
        print(f"Total Risk Scenarios (1:N): {len(scenarios)}")
        print(f"Historical Incidents (for ML): {incidents['incident_occurred'].sum()} / {len(incidents)}")

if __name__ == "__main__":
    generator = RelationalDataGenerator(SYNTHETIC_DATA_CONFIG, LOSS_CONFIG)
    generator.run()
