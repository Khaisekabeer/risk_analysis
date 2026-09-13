import sqlite3
import pandas as pd
from pathlib import Path
from config import RAW_DATA_DIR

class AICopilot:
    """
    Simulates a Retrieval-Augmented Generation (RAG) backend.
    In production, this would use LangChain + OpenAI to translate Natural Language 
    into SQL queries against the risk_analysis.db.
    """
    def __init__(self):
        self.db_path = RAW_DATA_DIR.parent / "risk_analysis.db"

    def ask(self, question: str):
        print(f"\n[Executive Query]: {question}")
        print("[AI Co-Pilot is thinking...]")
        
        # Simulated LLM Intent Parsing (NLP to SQL mapping)
        question_lower = question.lower()
        
        try:
            with sqlite3.connect(self.db_path) as conn:
                if "highest financial risk" in question_lower or "top risk" in question_lower:
                    sql = """
                    SELECT asset_id, threat_category, likely_loss_inr, max_loss_inr 
                    FROM risk_scenarios 
                    ORDER BY likely_loss_inr DESC 
                    LIMIT 3;
                    """
                    df = pd.read_sql_query(sql, conn)
                    self._format_response("I have analyzed the risk scenarios. Here are the top 3 assets with the highest financial risk:", df)
                    
                elif "optimized actions" in question_lower or "what should we patch" in question_lower:
                    sql = """
                    SELECT action_name, target_asset_id, implementation_cost_inr, framework_mapping 
                    FROM optimization_results 
                    ORDER BY implementation_cost_inr ASC 
                    LIMIT 3;
                    """
                    df = pd.read_sql_query(sql, conn)
                    self._format_response("Based on the PuLP Knapsack Optimizer, here are the most cost-effective actions to take immediately:", df)
                    
                else:
                    print("\n[AI Response]: I am connected to the Enterprise Database. However, you need to plug in a valid LLM API Key (like OpenAI or Claude) into `ai_copilot.py` to process dynamic unscripted queries.")
                    
        except Exception as e:
            print(f"[AI Response]: Error. Please run the investment optimizer first to generate the tables. Details: {e}")

    def _format_response(self, text: str, df: pd.DataFrame):
        print(f"\n[AI Response]: {text}")
        if not df.empty:
            print(df.to_string(index=False))
        print("\n" + "-"*60)

if __name__ == "__main__":
    copilot = AICopilot()
    copilot.ask("Which assets have the highest financial risk?")
    copilot.ask("What optimized actions should we patch first?")
