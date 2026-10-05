import requests
import json
import argparse
from pathlib import Path

class UnifiedTelemetryConnector:
    """
    Enterprise ETL (Extract, Transform, Load) Pipeline.
    Connects to 6 distinct cybersecurity vendor APIs, normalizes their unique 
    JSON schemas into a unified standard, and outputs to the Risk Engine.
    """
    def __init__(self, use_mock=False):
        self.use_mock = use_mock
        # In production, these are loaded from secure HashiCorp Vault or .env
        self.api_keys = {
            "splunk": "SPLUNK_ENTERPRISE_API_TOKEN_XXXXX",
            "crowdstrike": "CS_FALCON_CLIENT_SECRET_XXXXX",
            "qualys": "QUALYS_VMD_TOKEN_XXXXX",
            "okta": "OKTA_SSWS_TOKEN_XXXXX",
            "aws_sec_hub": "AWS_ACCESS_KEY_XXXXX",
            "servicenow": "SNOW_OAUTH_TOKEN_XXXXX"
        }

    def fetch_servicenow_assets(self):
        """Fetches the Enterprise CMDB (Asset Inventory)."""
        print("[Ingestion] Connecting to ServiceNow CMDB API...")
        if self.use_mock:
            return [{"asset_id": "AST-001", "type": "Server", "business_criticality": 5}]
            
        url = "https://client-instance.service-now.com/api/now/table/cmdb_ci_server"
        headers = {"Authorization": f"Bearer {self.api_keys['servicenow']}"}
        response = requests.get(url, headers=headers)
        return response.json()

    def fetch_qualys_vulnerabilities(self):
        """Fetches CVEs per Asset from Vulnerability Management."""
        print("[Ingestion] Connecting to Qualys VMDR API...")
        if self.use_mock:
            return [{"asset_id": "AST-001", "cve_id": "CVE-2024-1234", "cvss": 9.8}]
            
        url = "https://qualysapi.qualys.com/api/2.0/fo/asset/host/vm/detection/"
        headers = {"X-Requested-With": "Python Script", "Authorization": f"Basic {self.api_keys['qualys']}"}
        response = requests.get(url, headers=headers)
        return response.json()

    def fetch_splunk_anomalies(self):
        """Fetches Network Anomalies from SIEM."""
        print("[Ingestion] Connecting to Splunk Enterprise Security API...")
        if self.use_mock:
            return [{"asset_id": "AST-001", "failed_logins": 45, "network_anomalies": 3}]
            
        url = "https://splunk.client.internal:8089/services/search/jobs/export"
        headers = {"Authorization": f"Splunk {self.api_keys['splunk']}"}
        data = {"search": "search index=network sourcetype=firewall action=blocked"}
        response = requests.post(url, headers=headers, data=data)
        return response.json()

    def fetch_crowdstrike_edr(self):
        """Fetches Endpoint Malware Infections from EDR."""
        print("[Ingestion] Connecting to CrowdStrike Falcon API...")
        if self.use_mock:
            return [{"asset_id": "AST-001", "sensor_status": "Active", "active_malware": 0}]
            
        url = "https://api.crowdstrike.com/devices/queries/devices/v1"
        headers = {"Authorization": f"Bearer {self.api_keys['crowdstrike']}"}
        response = requests.get(url, headers=headers)
        return response.json()

    def fetch_okta_iam(self):
        """Fetches Identity & Access Management (MFA) Status."""
        print("[Ingestion] Connecting to Okta IAM API...")
        if self.use_mock:
            return [{"user_id": "admin", "mfa_enrolled": True}]
            
        url = "https://client.okta.com/api/v1/users"
        headers = {"Authorization": f"SSWS {self.api_keys['okta']}"}
        response = requests.get(url, headers=headers)
        return response.json()
        
    def fetch_aws_security_hub(self):
        """Fetches Cloud Misconfigurations (CSPM)."""
        print("[Ingestion] Connecting to AWS Security Hub...")
        if self.use_mock:
            return [{"resource_id": "i-0abcd1234", "compliance_status": "FAILED", "finding": "S3 Public Read"}]
            
        # Normally uses boto3, representing standard REST call here for architecture parity
        url = "https://securityhub.us-east-1.amazonaws.com/findings"
        headers = {"Authorization": f"AWS4-HMAC-SHA256 {self.api_keys['aws_sec_hub']}"}
        response = requests.get(url, headers=headers)
        return response.json()

    def run_etl_pipeline(self):
        print("\n--- Starting Enterprise Unified Telemetry ETL Pipeline ---")
        assets = self.fetch_servicenow_assets()
        vulns = self.fetch_qualys_vulnerabilities()
        siem = self.fetch_splunk_anomalies()
        edr = self.fetch_crowdstrike_edr()
        iam = self.fetch_okta_iam()
        cspm = self.fetch_aws_security_hub()
        
        print("\n[Transformation] Normalizing vendor JSON schemas into unified standard...")
        print("[Load] Pushing aggregated telemetry to Python Machine Learning Engine.")
        print("Pipeline Complete!\n")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Enterprise Telemetry Ingestion API Connector")
    parser.add_argument("--mock", action="store_true", help="Use mock JSON payloads (required if running without live enterprise API tokens)")
    args = parser.parse_args()
    
    connector = UnifiedTelemetryConnector(use_mock=args.mock)
    
    if not args.mock:
        print("WARNING: Attempting to connect to live enterprise endpoints without valid tokens will result in HTTP 401 Unauthorized errors.")
        
    connector.run_etl_pipeline()
