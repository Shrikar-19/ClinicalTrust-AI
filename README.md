# ClinicalTrust AI — The Clinical Record That Cannot Be Trusted

**Agentic Clinical Intelligence for Patient Reconstruction, Medical Reconciliation & Safe Decision Support**

> **Research & Educational Disclaimer**: ClinicalTrust AI is a research and educational prototype intended solely for clinical record organization and clinician-assisted review. It is **not** clinically validated or certified for hospital deployment and does **not** provide autonomous diagnosis or treatment recommendations.

---

## Core Principle

**A trustworthy clinical AI system is not the one that always produces an answer. It is the one that verifies its evidence, recognizes uncertainty, and knows when to stop.**

---

## Project Architecture & Folder Structure

```text
├── server.ts                          # Primary full-stack Express + Vite server (port 3000)
├── server/
│   ├── types.ts                       # Domain models & verification states
│   ├── db/
│   │   └── database.ts                # SQLite schema, prepared statements, cascade delete
│   ├── services/
│   │   ├── documentParser.ts          # Safe non-executing PDF, TXT, DOCX text extraction
│   │   ├── geminiClient.ts            # Server-side @google/genai structured extraction
│   │   └── seedDemo.ts                # Synthetic Rahul (Age 45) 5-document scenario
│   ├── agent/
│   │   └── clinicalWorkflow.ts        # 9-node stateful verification & escalation workflow
│   └── routes/
│       └── api.ts                     # REST API endpoints (/api/*)
├── python_backend/                    # Optional Python FastAPI + LangGraph microservice
│   ├── main.py                        # FastAPI server + PyMuPDF/DOCX parsing
│   ├── workflow.py                    # LangGraph StateGraph 9-node verification pipeline
│   ├── models.py                      # Pydantic v2 clinical schemas
│   └── requirements.txt               # Python dependencies
├── src/
│   ├── App.tsx                        # Main SPA state & navigation router
│   ├── types/clinical.ts              # Frontend TypeScript interfaces
│   ├── services/api.ts                # Typed REST API client
│   ├── utils/pdfExport.ts             # jsPDF 10-section Clinical Intelligence Report exporter
│   ├── components/
│   │   ├── Layout.tsx                 # Sidebar + Top Bar + Research Disclaimer
│   │   ├── StatusIndicator.tsx        # Accessible semantic status labels
│   │   ├── UploadModal.tsx            # Multi-file PDF/TXT/DOCX upload dialog
│   │   └── AgentWorkflowModal.tsx     # 9-node Agentic Workflow Trace viewer
│   └── pages/
│       ├── DashboardPage.tsx          # KPI metrics, Recharts lag/verification charts, recent cases
│       ├── PatientWorkspacePage.tsx   # Overview, docs, timeline, diagnoses, meds, labs, missing gaps
│       ├── ConflictCenterPage.tsx     # Side-by-side conflicts, escalation stops, clinician review
│       ├── EvidenceExplorerPage.tsx   # Searchable fact-to-passage evidence verification table
│       └── ClinicalSummaryPage.tsx    # 10-section report + PDF export
├── package.json
├── .env.example
└── README.md
```

---

## 9-Node Agentic Clinical Workflow

1. **Document Ingestion**: Validates file extensions (`.pdf`, `.txt`, `.docx`), enforces 10 MB size cap, prevents path traversal, and extracts plain text without executing files.
2. **Document Classification**: Categorizes records into Admission Note, Laboratory Report, Progress Note, Prescription, or Discharge Summary.
3. **Clinical Information Extraction**: Calls Gemini (`gemini-4-hydrogen`) with strict JSON schema + deterministic passage verification against raw text. Missing values remain `null` or explicitly unknown.
4. **Patient Timeline Reconstruction**: Separates **Clinical Event Date** from **System Upload Date**, detects upload lags (e.g., Nov 11 lab uploaded Nov 13), and refuses to invent order when dates are missing.
5. **Diagnosis & Medication Reconciliation**: Tracks diagnostic certainty progression (`Suspected pneumonia` → `Pneumonia`) and reconciles medications across admission, prescriptions, progress notes, and discharge.
6. **Evidence Retrieval**: Links every extracted clinical claim to verbatim supporting and contradictory passages with document names and page locations.
7. **Conflict & Missing Information Detection**: Deterministic safety rules detect:
   - Penicillin allergy (10 Nov) vs. Amoxicillin prescription (12 Nov)
   - Missing Penicillin allergy in Discharge Summary (14 Nov)
   - Generic `"Antibiotics"` at discharge vs. specific `"Amoxicillin"` prescription
   - Unconfirmed diagnostic shift (`Suspected pneumonia` → `Pneumonia`)
   - Missing lab results (Sputum culture ordered without result — never treated as negative)
8. **Uncertainty Assessment**: Assigns `Verified`, `Supported`, `Partially supported`, `Conflicting`, `Unresolved`, or `Requires human review`. Halts affected conclusions when critical conflicts exist.
9. **Decision & Report Generation**: Routes either to an **Evidence-Supported Summary** or **Escalated Issue Report Requiring Human Review**.

---

## Installation & Local Execution

### 1. Unified Full-Stack Application (Recommended — Port 3000)

```bash
# Install Node dependencies
npm install

# Configure environment variables
cp .env.example .env
# Add your GEMINI_API_KEY in .env

# Run development server (Express API + Vite React UI + SQLite)
npm run dev
```

Open `http://localhost:3000`. The synthetic patient **Rahul (Age 45)** with all 5 medical records is automatically seeded on first launch.

### 2. Production Build

```bash
npm run build
NODE_ENV=production npm start
```

### 3. Optional Python FastAPI + LangGraph Backend

```bash
cd python_backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

---

## Testing Instructions

1. **TypeScript & Build Verification**:
   ```bash
   npm run lint
   npm run build
   ```
2. **Default Demonstration Walkthrough (Rahul, Age 45)**:
   - Open **Dashboard** to view the 5 KPI cards, the Clinical Event Date vs. Upload Date lag chart (highlighting Nov 11 vs. Nov 13), and Verification Distribution.
   - Open **Patient Workspace** to inspect the 5 synthetic records, view raw document text, and examine the chronological timeline.
   - Open **Clinical Conflict Center** to review the **Critical** Penicillin-Amoxicillin discrepancy, omitted discharge allergy, unspecified discharge `"Antibiotics"`, and test the **Perform Clinician Review** resolution workflow.
   - Open **Evidence Explorer** to verify verbatim quotes and cross-document references for every extracted fact.
   - Open **Clinical Summary** and click **Export Report as PDF** to download the 10-section Clinical Intelligence Report.
   - Click **Upload Documents** to test uploading additional `.pdf`, `.txt`, or `.docx` records and executing the live 9-node Gemini + Deterministic Verification workflow.
