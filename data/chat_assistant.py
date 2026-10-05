"""
chat_assistant.py

Hybrid assistant:
  1. If the user uploads a document (PDF / image / .docx) at the start,
     extract whatever it can and pre-fill matching answers automatically.
  2. For anything the document didn't cover, ask the user directly —
     one question at a time, storing each answer.
  3. Once every field is filled (from the doc, the user, or both), run the
     collected data through incident_model + impact_model and return a
     plain-language risk summary in rupee terms.

Telemetry ingestion (live SIEM/EDR/CSPM feeds) is intentionally NOT handled
here — this module is only the fallback path for assets not yet covered by
that pipeline.

NOTE: QUESTIONS[i]["key"] must match real column names in
enterprise_cyber_data.csv, or the models won't read the answers correctly.
"""

import io
import json
import uuid
import pandas as pd
import requests
import pymupdf as fitz  # PyMuPDF
from PIL import Image

# pyrefly: ignore [missing-import]
import config
from incident_model import predict_incident_probability
from impact_model import predict_expected_loss

OLLAMA_URL = "http://localhost:11434/api/generate"
TEXT_MODEL = "llama3"
VISION_MODEL = "llava"

MIN_DIMENSION = 800
LOW_RES_WARNING = (
    f"This document's scanned pages are lower resolution than recommended "
    f"(under {MIN_DIMENSION}px). Extracted details may be less accurate."
)

# --- The questionnaire ---
QUESTIONS = [
    {"key": "asset_type", "text": "What type of system are we assessing? (e.g. database, web server, endpoint, cloud storage)"},
    {"key": "business_unit", "text": "Which business unit or department does this asset belong to?"},
    {"key": "internet_exposed", "text": "Is this asset directly exposed to the internet? (yes/no)"},
    {"key": "data_sensitivity", "text": "How sensitive is the data on this asset? (low / medium / high)"},
    {"key": "asset_criticality", "text": "How critical is this asset to your day-to-day operations? (low / medium / high)"},
    {"key": "mfa_enabled", "text": "Is multi-factor authentication (MFA) enforced for access to this asset? (yes/no)"},
    {"key": "unpatched_cves", "text": "Roughly how many known unpatched vulnerabilities (CVEs) does this asset currently have?"},
    {"key": "control_effectiveness", "text": "On a scale of 1 (poor) to 10 (excellent), how effective are your current security controls on this asset?"},
]
QUESTION_KEYS = [q["key"] for q in QUESTIONS]

# in-memory session store
SESSIONS: dict[str, dict] = {}


# ---------- document reading ----------

def _extract_pdf_text(pdf_bytes: bytes) -> tuple[str, str | None]:
    """Returns (extracted_text, warning). Rasterizes+warns only if a page has no selectable text (likely scanned)."""
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    full_text = []
    warning = None

    for page in doc:
        text = page.get_text().strip()
        if text:
            full_text.append(text)
        else:
            # likely a scanned page with no text layer — check its resolution
            pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
            img = Image.open(io.BytesIO(pix.tobytes("png")))
            if min(img.size) < MIN_DIMENSION:
                warning = LOW_RES_WARNING
            full_text.append("[scanned page, no extractable text]")

    doc.close()
    return "\n".join(full_text), warning


def _extract_docx_text(docx_bytes: bytes) -> str:
    from docx import Document
    doc = Document(io.BytesIO(docx_bytes))
    return "\n".join(p.text for p in doc.paragraphs)


def _extract_image_text(image_bytes: bytes) -> tuple[str, str | None]:
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    warning = LOW_RES_WARNING if min(img.size) < MIN_DIMENSION else None

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    import base64
    b64 = base64.b64encode(buf.getvalue()).decode("utf-8")

    try:
        response = requests.post(
            OLLAMA_URL,
            json={
                "model": VISION_MODEL,
                "prompt": "Describe any security-relevant details visible in this image (asset type, controls, exposure, etc.) in plain text.",
                "images": [b64],
                "stream": False,
            },
            timeout=90,
        )
        response.raise_for_status()
        return response.json()["response"], warning
    except Exception:
        return "", warning


def _extract_answers_from_text(text: str) -> dict:
    """Asks the local LLM to pull whatever QUESTION fields it can find in the document text."""
    if not text.strip():
        return {}

    prompt = f"""Extract the following fields from the document text below, if present.
Respond ONLY with a JSON object using exactly these keys (omit a key entirely if not mentioned):
{QUESTION_KEYS}

Document text:
{text[:6000]}

JSON:"""

    try:
        response = requests.post(
            OLLAMA_URL,
            json={"model": TEXT_MODEL, "prompt": prompt, "stream": False},
            timeout=90,
        )
        response.raise_for_status()
        raw = response.json()["response"].strip()
        raw = raw.strip("`").replace("json\n", "", 1) if raw.startswith("```") else raw
        parsed = json.loads(raw)
        return {k: v for k, v in parsed.items() if k in QUESTION_KEYS and v not in (None, "")}
    except Exception:
        return {}  # if extraction fails, fall back to asking the user everything


# ---------- session flow ----------

def start_session(file_bytes: bytes | None = None, file_type: str | None = None) -> dict:
    session_id = str(uuid.uuid4())
    pre_filled = {}
    warning = None

    if file_bytes and file_type == "pdf":
        text, warning = _extract_pdf_text(file_bytes)
        pre_filled = _extract_answers_from_text(text)
    elif file_bytes and file_type == "doc":
        text = _extract_docx_text(file_bytes)
        pre_filled = _extract_answers_from_text(text)
    elif file_bytes and file_type == "image":
        text, warning = _extract_image_text(file_bytes)
        pre_filled = _extract_answers_from_text(text)

    SESSIONS[session_id] = {"answers": pre_filled, "remaining": [k for k in QUESTION_KEYS if k not in pre_filled]}

    return _next_step(session_id, warning=warning, note=(
        f"Got {len(pre_filled)} field(s) from your document — asking about the rest."
        if pre_filled else None
    ))


def submit_answer(session_id: str, answer: str) -> dict:
    session = SESSIONS.get(session_id)
    if session is None:
        raise ValueError("Unknown session_id — call start first.")

    key = session["remaining"].pop(0)
    session["answers"][key] = answer

    return _next_step(session_id)


def _next_step(session_id: str, warning: str | None = None, note: str | None = None) -> dict:
    session = SESSIONS[session_id]

    if session["remaining"]:
        next_key = session["remaining"][0]
        question_text = next((q["text"] for q in QUESTIONS if q["key"] == next_key), next_key)
        return {
            "session_id": session_id,
            "question": question_text,
            "done": False,
            "warning": warning,
            "note": note,
        }

    result = compute_risk_from_answers(session["answers"])
    return {
        "session_id": session_id,
        "done": True,
        "answers": session["answers"],
        "warning": warning,
        **result,
    }


# ---------- risk computation ----------

def _build_asset_row(answers: dict) -> pd.DataFrame:
    row = dict(answers)

    for yn_key in ("internet_exposed", "mfa_enabled"):
        if yn_key in row:
            row[yn_key] = 1 if str(row[yn_key]).strip().lower() in ("yes", "y", "true", "1") else 0

    for num_key in ("unpatched_cves", "control_effectiveness"):
        if num_key in row:
            try:
                row[num_key] = float(row[num_key])
            except (ValueError, TypeError):
                row[num_key] = 0

    row["asset_id"] = "self-assessment"
    return pd.DataFrame([row])


def compute_risk_from_answers(answers: dict) -> dict:
    df_row = _build_asset_row(answers)

    p_incident = float(predict_incident_probability(df_row)[0])
    expected_loss = float(predict_expected_loss(df_row)[0])
    eal = p_incident * expected_loss

    narrative = _generate_narrative(answers, p_incident, expected_loss, eal)

    return {
        "p_incident": round(p_incident, 4),
        "expected_loss_given_incident": round(expected_loss, 2),
        "eal": round(eal, 2),
        "narrative": narrative,
    }


def _generate_narrative(answers: dict, p_incident: float, expected_loss: float, eal: float) -> str:
    prompt = f"""You are a cyber-risk assistant speaking to a non-technical business
stakeholder at an enterprise. Based on their security posture below, explain their
estimated risk in plain, concrete language. Be direct, avoid jargon, lead with the
money figure, and give one or two concrete recommendations.

Their profile: {answers}

Model results:
- Probability of an incident this year: {p_incident:.1%}
- Estimated financial impact if an incident occurs: Rs.{expected_loss:,.0f}
- Expected Annual Loss (EAL): Rs.{eal:,.0f}

Write a short (4-6 sentence) response."""

    try:
        response = requests.post(
            OLLAMA_URL,
            json={"model": TEXT_MODEL, "prompt": prompt, "stream": False},
            timeout=60,
        )
        response.raise_for_status()
        return response.json()["response"]
    except Exception:
        return (
            f"Based on your profile, this asset has an estimated {p_incident:.1%} chance "
            f"of a security incident this year. If one occurs, the estimated financial "
            f"impact is Rs.{expected_loss:,.0f}, giving an Expected Annual Loss of "
            f"Rs.{eal:,.0f}. Consider prioritizing MFA enforcement and patching known "
            f"vulnerabilities to reduce this figure."
        )

if __name__ == "__main__":
    print("Testing chat_assistant.py risk computation module...")
    sample_answers = {
        "asset_type": "Database",
        "internet_exposed": "yes",
        "data_sensitivity": "high",
        "asset_criticality": "high",
        "unpatched_cves": 12,
        "mfa_enabled": "no",
        "control_effectiveness": 3
    }
    result = compute_risk_from_answers(sample_answers)
    print("\nTest Results:")
    for k, v in result.items():
        print(f"  {k}: {v}")
    print("\n✅ chat_assistant.py module loaded and tested successfully!")
