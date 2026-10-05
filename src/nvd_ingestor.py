import json
import pandas as pd
from pathlib import Path
from config import RAW_DATA_DIR

# The NVD files might be placed in the data directory directly or in subfolders
DATA_DIR = Path("c:/Users/khais/Desktop/risk_analysis/data")

class NVDIngestor:
    def __init__(self):
        self.output_path = RAW_DATA_DIR / "nvd_cve_data.csv"
        
    def find_json_files(self):
        """Recursively find all nvdcve-*.json files in the data directory."""
        # Look for the specific file the user added
        files = [f for f in DATA_DIR.rglob("nvdcve*.json") if f.is_file()]
        return files

    def parse_nvd_json(self, file_path):
        print(f"Parsing NVD JSON file: {file_path.name}...")
        records = []
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                
            cve_items = data.get("vulnerabilities", [])
            print(f"Found {len(cve_items)} CVE records in this file.")
            
            for item in cve_items:
                try:
                    cve_data = item.get("cve", {})
                    cve_id = cve_data.get("id")
                    if not cve_id:
                        continue
                        
                    metrics = cve_data.get("metrics", {})
                    cvss_score = None
                    
                    if "cvssMetricV31" in metrics:
                        cvss_score = metrics["cvssMetricV31"][0]["cvssData"]["baseScore"]
                    elif "cvssMetricV30" in metrics:
                        cvss_score = metrics["cvssMetricV30"][0]["cvssData"]["baseScore"]
                    elif "cvssMetricV2" in metrics:
                        cvss_score = metrics["cvssMetricV2"][0]["cvssData"]["baseScore"]
                        
                    if cvss_score is not None:
                        records.append({
                            "cve_id": cve_id,
                            "cvss_score": float(cvss_score)
                        })
                except (KeyError, IndexError):
                    continue # Skip malformed records
                    
            return records
        except Exception as e:
            print(f"Error parsing {file_path.name}: {e}")
            return []

    def run(self):
        all_records = []
        json_files = self.find_json_files()
        
        if not json_files:
            print("No NVD JSON files found in data/ directory.")
            return
            
        for file in json_files:
            records = self.parse_nvd_json(file)
            all_records.extend(records)
            
        if all_records:
            df = pd.DataFrame(all_records)
            # Drop duplicates keeping the highest CVSS if any
            df = df.sort_values("cvss_score", ascending=False).drop_duplicates(subset=["cve_id"])
            
            df.to_csv(self.output_path, index=False)
            print(f"\nSuccessfully saved {len(df)} unique CVEs with real CVSS scores to {self.output_path}")
            print(df.head())
        else:
            print("Failed to extract any CVEs.")

if __name__ == "__main__":
    ingestor = NVDIngestor()
    ingestor.run()
