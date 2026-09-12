import os
import numpy as np
import pandas as pd
from typing import Dict
from scipy.special import expit

from config import RAW_DATA_DIR, SYNTHETIC_DATA_CONFIG, LOSS_CONFIG

class SyntheticDataGenerator:
    def __init__(self, config: Dict, loss_config: Dict):
        self.config = config
        self.loss_config = loss_config
        self.num_assets = self.config["num_assets"]
        np.random.seed(self.config["random_seed"])

    def generate_assets(self) -> pd.DataFrame:
        """Generates the asset inventory."""
        print("Generating assets...")
        asset_ids = [f"AST-{i:06d}" for i in range(1, self.num_assets + 1)]
        
        asset_types = ["Server", "Database", "Workstation", "Network_Device", "Cloud_Storage"]
        business_units = ["Finance", "HR", "Engineering", "Sales", "Marketing", "Operations"]
        
        # Base distributions
        assets = pd.DataFrame({
            "asset_id": asset_ids,
            "asset_type": np.random.choice(asset_types, self.num_assets, p=[0.3, 0.1, 0.4, 0.1, 0.1]),
            "business_unit": np.random.choice(business_units, self.num_assets),
            "internet_exposed": np.random.choice([0, 1], self.num_assets, p=[0.7, 0.3]),
            "asset_criticality": np.random.choice([1, 2, 3, 4, 5], self.num_assets, p=[0.4, 0.3, 0.15, 0.1, 0.05]),
            "data_sensitivity": np.random.choice([1, 2, 3, 4], self.num_assets, p=[0.5, 0.3, 0.15, 0.05]) # 1: Public, 4: Restricted
        })
        
        # Revenue dependency correlates with asset criticality and data sensitivity
        revenue_probs = (assets["asset_criticality"] + assets["data_sensitivity"]) / 9.0
        # Add some noise and bound between 0 and 1
        revenue_probs = np.clip(revenue_probs + np.random.normal(0, 0.1, self.num_assets), 0, 1)
        
        def assign_revenue_dep(p):
            if p > 0.7: return "Critical"
            elif p > 0.5: return "High"
            elif p > 0.3: return "Medium"
            else: return "Low"
            
        assets["revenue_dependency"] = revenue_probs.apply(assign_revenue_dep)
        return assets

    def generate_vulnerabilities_and_threats(self, assets: pd.DataFrame) -> pd.DataFrame:
        """Generates vulnerability metrics and threat telemetry per asset."""
        print("Generating vulnerabilities and telemetry...")
        n = len(assets)
        
        # Internet exposed assets tend to have higher threat activity and more vulns
        is_exposed = assets["internet_exposed"]
        
        vuln_counts = np.random.poisson(lam=np.where(is_exposed, 5.0, 2.0), size=n)
        crit_vuln_counts = np.random.binomial(n=vuln_counts, p=0.2)
        
        # EPSS and CVSS correlated with critical vulns
        avg_cvss = np.where(vuln_counts > 0, np.random.normal(loc=np.where(crit_vuln_counts > 0, 8.5, 5.0), scale=1.0, size=n), 0)
        avg_cvss = np.clip(avg_cvss, 0, 10.0)
        
        avg_epss = np.where(vuln_counts > 0, np.random.beta(a=np.where(is_exposed, 2, 1), b=10, size=n), 0)
        
        # Telemetry
        failed_logins = np.random.poisson(lam=np.where(is_exposed, 15.0, 2.0), size=n)
        anomaly_count = np.random.poisson(lam=np.where(is_exposed, 3.0, 0.5), size=n)
        
        # Patch delay in days
        patch_delay = np.random.exponential(scale=np.where(assets["asset_criticality"] > 3, 10, 45), size=n)
        
        return pd.DataFrame({
            "asset_id": assets["asset_id"],
            "vulnerability_count": vuln_counts,
            "critical_vulnerability_count": crit_vuln_counts,
            "avg_cvss": avg_cvss,
            "avg_epss": avg_epss,
            "patch_delay": patch_delay,
            "failed_logins": failed_logins,
            "anomaly_count": anomaly_count
        })

    def generate_controls(self, assets: pd.DataFrame) -> pd.DataFrame:
        """Generates security control coverage."""
        print("Generating controls...")
        n = len(assets)
        
        # Higher criticality usually means better controls (but not always)
        crit_factor = assets["asset_criticality"] / 5.0
        
        mfa_coverage = np.clip(np.random.beta(a=1 + 5*crit_factor, b=2), 0, 1)
        edr_coverage = np.clip(np.random.beta(a=1 + 4*crit_factor, b=2), 0, 1)
        backup_coverage = np.clip(np.random.beta(a=1 + 6*crit_factor, b=1), 0, 1)
        
        # Introduce some realistic gaps
        gaps = np.random.choice([True, False], size=n, p=[0.1, 0.9])
        mfa_coverage = np.where(gaps, 0.0, mfa_coverage)
        
        return pd.DataFrame({
            "asset_id": assets["asset_id"],
            "mfa_coverage": mfa_coverage,
            "edr_coverage": edr_coverage,
            "backup_coverage": backup_coverage,
            "control_effectiveness": (mfa_coverage + edr_coverage + backup_coverage) / 3.0
        })

    def generate_incidents_and_financials(self, df: pd.DataFrame) -> pd.DataFrame:
        """Calculates incident probability using a non-linear logit function and generates financial loss."""
        print("Generating incidents and financials (labels)...")
        
        # Logit combination of features to determine probability
        # Base intercept (controls overall baseline rate)
        logit_p = -3.5 
        
        # Risk factors (increase probability)
        logit_p += 1.2 * df["internet_exposed"]
        logit_p += 0.5 * df["critical_vulnerability_count"]
        logit_p += 2.0 * df["avg_epss"]
        logit_p += 0.05 * df["anomaly_count"]
        logit_p += 0.02 * df["patch_delay"]
        
        # Non-linear interaction: exposed + critical vulns is much worse
        logit_p += 0.8 * (df["internet_exposed"] * (df["critical_vulnerability_count"] > 0).astype(int))
        
        # Mitigating factors (decrease probability)
        logit_p -= 1.5 * df["mfa_coverage"]
        logit_p -= 1.2 * df["edr_coverage"]
        logit_p -= 0.5 * df["control_effectiveness"]
        
        # Add random noise for irreducible error
        logit_p += np.random.normal(0, 0.5, len(df))
        
        # Convert to probability
        p_incident = expit(logit_p)
        
        # Sample actual incident occurrences
        incident_occurred = np.random.binomial(n=1, p=p_incident)
        
        # Financial Impact Modeling
        # Only calculated if incident occurs
        base_loss = np.random.lognormal(mean=self.loss_config["mu"], sigma=self.loss_config["sigma"], size=len(df))
        
        # Modifiers based on asset criticality and data sensitivity
        crit_multiplier = np.where(df["asset_criticality"] == 5, 5.0, 
                          np.where(df["asset_criticality"] == 4, 3.0, 
                          np.where(df["asset_criticality"] == 3, 1.5, 1.0)))
                          
        data_multiplier = np.where(df["data_sensitivity"] == 4, 4.0,
                          np.where(df["data_sensitivity"] == 3, 2.0, 1.0))
                          
        # Controls can reduce loss (e.g., backup reduces ransomware impact)
        mitigation_multiplier = 1.0 - (0.5 * df["backup_coverage"])
        
        total_loss = base_loss * crit_multiplier * data_multiplier * mitigation_multiplier
        total_loss = np.clip(total_loss, self.loss_config["min_loss"], self.loss_config["max_loss"])
        
        # Apply loss only where incidents happened
        total_loss = np.where(incident_occurred == 1, total_loss, 0.0)
        
        # Additional targets (components)
        recovery_cost = total_loss * np.random.uniform(0.1, 0.4, len(df))
        downtime_hours = np.where(incident_occurred == 1, np.random.exponential(scale=24 * df["asset_criticality"]), 0)
        
        return pd.DataFrame({
            "asset_id": df["asset_id"],
            "incident_probability_true": p_incident, # Hidden true prob (not for model training)
            "incident_occurred": incident_occurred,
            "total_loss": total_loss,
            "recovery_cost": recovery_cost,
            "downtime_hours": downtime_hours
        })

    def run(self):
        assets = self.generate_assets()
        vulns = self.generate_vulnerabilities_and_threats(assets)
        controls = self.generate_controls(assets)
        
        # Combine to calculate incidents
        df = assets.merge(vulns, on="asset_id").merge(controls, on="asset_id")
        
        incidents = self.generate_incidents_and_financials(df)
        
        final_df = df.merge(incidents, on="asset_id")
        
        # Save datasets
        print(f"Saving generated data to {RAW_DATA_DIR}...")
        assets.to_csv(RAW_DATA_DIR / "assets.csv", index=False)
        vulns.to_csv(RAW_DATA_DIR / "vulnerabilities_and_threats.csv", index=False)
        controls.to_csv(RAW_DATA_DIR / "controls.csv", index=False)
        incidents.to_csv(RAW_DATA_DIR / "incidents.csv", index=False)
        final_df.to_csv(RAW_DATA_DIR / "enterprise_cyber_data.csv", index=False)
        
        print("\nGeneration Complete. Dataset Statistics:")
        print(f"Total Assets: {len(final_df)}")
        print(f"Total Incidents: {final_df['incident_occurred'].sum()} ({(final_df['incident_occurred'].mean()*100):.2f}%)")
        loss_incidents = final_df[final_df['incident_occurred'] == 1]['total_loss']
        if len(loss_incidents) > 0:
            print(f"Median Loss per Incident: ${loss_incidents.median():,.2f}")
            print(f"Mean Loss per Incident: ${loss_incidents.mean():,.2f}")
            print(f"Max Loss: ${loss_incidents.max():,.2f}")
            
if __name__ == "__main__":
    generator = SyntheticDataGenerator(SYNTHETIC_DATA_CONFIG, LOSS_CONFIG)
    generator.run()
