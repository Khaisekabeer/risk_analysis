import json
import requests
from config import settings
from sqlalchemy.orm import Session
from models.all_models import RiskRun, RiskScore, Asset

def ask_copilot(db: Session, question: str, attachments: list = None) -> dict:
    """
    Connects to Anthropic Claude (if API key provided) or falls back to
    a local Ollama/mock implementation. Answers natural language queries
    about the current risk state.
    """
    
    # Context gathering
    latest_run = db.query(RiskRun).order_by(RiskRun.computed_at.desc()).first()
    top_assets = db.query(RiskScore).order_by(RiskScore.eal.desc()).limit(5).all()
    
    source_rows = []
    for score in top_assets:
        asset = db.query(Asset).filter(Asset.id == score.asset_id).first()
        source_rows.append({
            "asset_id": asset.name if asset else "Unknown",
            "eal_inr": score.eal,
            "likelihood": score.likelihood,
            "financial_impact": score.financial_impact,
            "criticality": asset.criticality_tier if asset else None
        })
        
    context = {
        "enterprise_eal": latest_run.eal_inr if latest_run else 0,
        "enterprise_var_95": latest_run.var_95_inr if latest_run else 0,
        "top_risky_assets": source_rows
    }
    
    if not settings.ANTHROPIC_API_KEY:
        # Fallback keyword logic if no API key
        q = question.lower()
        if "highest" in q or "top" in q:
            answer = f"Based on the latest run, your top risk is driven by these assets. The total Enterprise EAL is ₹{context['enterprise_eal']:,.0f}."
        else:
            answer = "I'm connected to the database but running in fallback mode without an Anthropic API key. Please add ANTHROPIC_API_KEY to .env for full NLP-to-SQL capabilities."
            
        return {
            "answer": answer,
            "source_rows": source_rows,
            "chart_data": None
        }
        
    # --- Real Claude Integration ---
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        
        prompt = f"""You are 'Riskyn', an AI cybersecurity risk advisor. 
        Answer the user's question clearly, professionally, and concisely. 
        Always quote numbers in Indian Rupees (₹) using lakh/crore formatting where appropriate.
        
        CURRENT SYSTEM CONTEXT (JSON):
        {json.dumps(context, indent=2)}
        
        USER QUESTION: {question}
        """
        
        message = client.messages.create(
            model="claude-3-haiku-20240307",
            max_tokens=500,
            temperature=0.3,
            messages=[
                {"role": "user", "content": prompt}
            ]
        )
        
        return {
            "answer": message.content[0].text,
            "source_rows": source_rows,
            "chart_data": None
        }
    except Exception as e:
        return {
            "answer": f"Error connecting to AI service: {str(e)}",
            "source_rows": source_rows,
            "chart_data": None
        }
