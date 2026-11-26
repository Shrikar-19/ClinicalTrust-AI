"""
ClinicalTrust AI — FastAPI Reference Server
Provides REST endpoints, safe PyMuPDF/DOCX/TXT document ingestion, SQLite persistence,
and LangGraph clinical verification workflow execution.
"""
import os
import sqlite3
from pathlib import Path
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
import fitz  # PyMuPDF
from docx import Document as DocxDocument

from models import ConflictResolutionRequest
from workflow import build_clinical_workflow

MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024
ALLOWED_EXTENSIONS = {".pdf", ".txt", ".docx"}
DB_PATH = Path(__file__).resolve().parent.parent / "data" / "clinicaltrust.db"

app = FastAPI(
    title="ClinicalTrust AI Backend",
    description="Research & Educational Prototype for Evidence-Based Clinical Record Verification",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Content-Type"],
)


def get_db() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


@app.get("/api/health")
def health_check():
    return {"status": "ok", "service": "ClinicalTrust AI FastAPI"}


@app.post("/api/patients/{patient_id}/parse-preview")
async def parse_clinical_document(patient_id: str, file: UploadFile = File(...)):
    safe_name = Path(file.filename or "document.txt").name
    ext = Path(safe_name).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported file type {ext}. Allowed: PDF, TXT, DOCX.")

    raw_bytes = await file.read()
    if len(raw_bytes) == 0 or len(raw_bytes) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(status_code=400, detail="File must be non-empty and under 10 MB.")

    if ext == ".txt":
        text = raw_bytes.decode("utf-8", errors="replace").strip()
        pages = 1
    elif ext == ".pdf":
        doc = fitz.open(stream=raw_bytes, filetype="pdf")
        pages = len(doc)
        text = "\n\n".join(f"[Page {i + 1}]\n{page.get_text('text')}" for i, page in enumerate(doc)).strip()
    else:
        import io
        docx_doc = DocxDocument(io.BytesIO(raw_bytes))
        text = "\n".join(p.text for p in docx_doc.paragraphs if p.text.strip())
        pages = 1

    if not text:
        raise HTTPException(status_code=400, detail="No extractable text found in uploaded document.")

    return {
        "patient_id": patient_id,
        "document_name": safe_name,
        "page_count": pages,
        "character_count": len(text),
    }


@app.post("/api/workflow/dry-run")
def run_langgraph_check(patient_id: str):
    compiled = build_clinical_workflow()
    result = compiled.invoke(
        {
            "patient_id": patient_id,
            "documents": [],
            "classifications": {},
            "extracted_facts": [],
            "timeline_events": [],
            "diagnoses": [],
            "medications": [],
            "conflicts": [],
            "missing_items": [],
            "requires_human_review": False,
            "route_decision": "EVIDENCE_SUPPORTED_SUMMARY",
            "halt_reason": None,
        }
    )
    return {"route_decision": result["route_decision"], "halt_reason": result["halt_reason"]}


@app.post("/api/conflicts/{conflict_id}/resolve")
def resolve_conflict(conflict_id: str, payload: ConflictResolutionRequest):
    conn = get_db()
    try:
        cur = conn.execute(
            """
            UPDATE conflicts
            SET review_status = ?, reviewer_name = ?, resolution_notes = ?
            WHERE id = ?
            """,
            (payload.decision, payload.reviewer_name, payload.resolution_notes, conflict_id),
        )
        conn.commit()
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Conflict not found.")
        return {"updated": True, "conflict_id": conflict_id, "review_status": payload.decision}
    finally:
        conn.close()
