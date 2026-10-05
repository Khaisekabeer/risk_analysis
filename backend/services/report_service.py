import io
import markdown
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from models.all_models import RiskRun, Asset, Control, Vulnerability

def export_audit_report(db: Session, format: str = "pdf", budget_inr: float = None) -> StreamingResponse:
    """Generate an Executive or Technical audit report as PDF or Markdown."""
    latest_run = db.query(RiskRun).order_by(RiskRun.computed_at.desc()).first()
    asset_count = db.query(Asset).count()
    vuln_count = db.query(Vulnerability).filter(Vulnerability.status == "open").count()
    
    eal = latest_run.eal_inr if latest_run else 0
    var = latest_run.var_95_inr if latest_run else 0
    
    md_content = f"""# Cyber Risk Audit Report
**Date:** {latest_run.computed_at.strftime("%Y-%m-%d") if latest_run else "N/A"}

## Executive Summary
- **Enterprise Expected Annual Loss (EAL):** ₹{eal:,.2f}
- **Value at Risk (95%):** ₹{var:,.2f}
- **Total Assets Monitored:** {asset_count}
- **Open Vulnerabilities:** {vuln_count}

## Budget Optimization
Analysis run with constraint: ₹{budget_inr or 10000000:,.0f}
"""

    if format == "markdown":
        buffer = io.BytesIO(md_content.encode('utf-8'))
        return StreamingResponse(
            buffer,
            media_type="text/markdown",
            headers={"Content-Disposition": "attachment; filename=report.md"}
        )
        
    # PDF generation using xhtml2pdf/weasyprint would go here
    # For now, return markdown formatted as PDF stub
    from xhtml2pdf import pisa
    html_content = markdown.markdown(md_content)
    pdf_buffer = io.BytesIO()
    pisa.CreatePDF(io.StringIO(html_content), dest=pdf_buffer)
    pdf_buffer.seek(0)
    
    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=report.pdf"}
    )
