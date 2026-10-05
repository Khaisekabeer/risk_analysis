import json
import random
import requests
import pandas as pd
from pathlib import Path
from config import RAW_DATA_DIR

class AttackPathSimulator:
    def __init__(self):
        self.mitre_url = "https://raw.githubusercontent.com/mitre/cti/master/enterprise-attack/enterprise-attack.json"
        self.output_path = RAW_DATA_DIR / "attack_paths.json"
        
    def scrape_mitre_attack(self):
        print("Scraping real-world attack techniques from MITRE ATT&CK...")
        try:
            response = requests.get(self.mitre_url, timeout=30)
            response.raise_for_status()
            data = response.json()
            
            techniques = {"initial-access": [], "execution": [], "exfiltration": [], "impact": []}
            
            for obj in data.get("objects", []):
                if obj.get("type") == "attack-pattern":
                    name = obj.get("name")
                    kill_chain_phases = obj.get("kill_chain_phases", [])
                    
                    for phase in kill_chain_phases:
                        tactic = phase.get("phase_name")
                        if tactic in techniques:
                            techniques[tactic].append(name)
                            
            print(f"Scraped {sum(len(v) for v in techniques.values())} techniques from MITRE ATT&CK.")
            return techniques
        except Exception as e:
            print(f"Failed to scrape MITRE ATT&CK: {e}")
            # Fallback to known real-world techniques if network fails
            return {
                "initial-access": ["Phishing", "Valid Accounts", "Exploit Public-Facing Application"],
                "execution": ["Command and Scripting Interpreter", "Scheduled Task/Job", "WMI"],
                "exfiltration": ["Exfiltration Over Web Service", "Exfiltration Over C2 Channel"],
                "impact": ["Data Encrypted for Impact", "Endpoint Denial of Service"]
            }

    def run(self):
        techniques = self.scrape_mitre_attack()
        
        print("Loading historical incidents...")
        incidents = pd.read_csv(RAW_DATA_DIR / "incidents.csv")
        assets = pd.read_csv(RAW_DATA_DIR / "assets.csv")
        vulns = pd.read_csv(RAW_DATA_DIR / "vulnerabilities.csv")
        
        # Only simulate paths for assets that actually experienced an incident
        breached_assets = incidents[incidents["incident_occurred"] == 1]
        
        attack_paths = []
        
        for _, row in breached_assets.iterrows():
            asset_id = row["asset_id"]
            loss = row["total_loss_inr"]
            
            # Find what vulnerability was exploited (if any)
            asset_vulns = vulns[vulns["asset_id"] == asset_id]
            exploited_cve = asset_vulns.iloc[0]["cve_id"] if not asset_vulns.empty else "Zero-Day Exploit"
            
            # Construct a realistic Kill Chain
            initial = random.choice(techniques["initial-access"])
            # If it's a known CVE, we can override initial access
            if exploited_cve != "Zero-Day Exploit" and random.random() > 0.5:
                initial = f"Exploit Public-Facing Application ({exploited_cve})"
                
            execution = random.choice(techniques["execution"])
            
            # Decide if it's ransomware (Impact) or Data Breach (Exfiltration)
            if random.random() > 0.5:
                final_stage = f"Impact: {random.choice(techniques['impact'])}"
                attack_type = "Ransomware / Sabotage"
            else:
                final_stage = f"Exfiltration: {random.choice(techniques['exfiltration'])}"
                attack_type = "Data Breach"
                
            path = {
                "asset_id": asset_id,
                "attack_type": attack_type,
                "financial_loss_inr": loss,
                "kill_chain": [
                    {"phase": "Initial Access", "technique": initial},
                    {"phase": "Execution", "technique": execution},
                    {"phase": "Action on Objectives", "technique": final_stage}
                ]
            }
            attack_paths.append(path)
            
        with open(self.output_path, 'w') as f:
            json.dump(attack_paths, f, indent=4)
            
        print(f"Successfully generated {len(attack_paths)} breach simulations based on MITRE ATT&CK.")
        print(f"Saved to {self.output_path}")
        
        # Print a sample
        if attack_paths:
            print("\nSample Attack Path Simulation:")
            print(json.dumps(attack_paths[0], indent=2))

if __name__ == "__main__":
    simulator = AttackPathSimulator()
    simulator.run()
