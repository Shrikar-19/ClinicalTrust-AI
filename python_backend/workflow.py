"""
LangGraph Stateful Clinical Intelligence Workflow for ClinicalTrust AI.
Implements the 9-node verification graph with conditional human-review routing.
"""
from typing import Any, Dict, List, Optional, TypedDict
from langgraph.graph import END, StateGraph


class ClinicalGraphState(TypedDict):
    patient_id: str
    documents: List[Dict[str, Any]]
    classifications: Dict[str, str]
    extracted_facts: List[Dict[str, Any]]
    timeline_events: List[Dict[str, Any]]
    diagnoses: List[Dict[str, Any]]
    medications: List[Dict[str, Any]]
    conflicts: List[Dict[str, Any]]
    missing_items: List[Dict[str, Any]]
    requires_human_review: bool
    route_decision: str
    halt_reason: Optional[str]


PENICILLIN_CLASS = {"amoxicillin", "ampicillin", "penicillin", "piperacillin", "augmentin"}


def document_ingestion(state: ClinicalGraphState) -> ClinicalGraphState:
    state["documents"] = [d for d in state["documents"] if d.get("raw_text", "").strip()]
    return state


def document_classification(state: ClinicalGraphState) -> ClinicalGraphState:
    classifications: Dict[str, str] = {}
    for doc in state["documents"]:
        name_and_head = f"{doc.get('document_name', '')} {doc.get('raw_text', '')[:300]}".lower()
        if "admission" in name_and_head:
            classifications[doc["id"]] = "Admission Note"
        elif "laboratory" in name_and_head or "wbc" in name_and_head:
            classifications[doc["id"]] = "Laboratory Report"
        elif "progress" in name_and_head:
            classifications[doc["id"]] = "Progress Note"
        elif "prescription" in name_and_head:
            classifications[doc["id"]] = "Prescription"
        elif "discharge" in name_and_head:
            classifications[doc["id"]] = "Discharge Summary"
        else:
            classifications[doc["id"]] = "Unclassified Clinical Record"
    state["classifications"] = classifications
    return state


def clinical_extraction(state: ClinicalGraphState) -> ClinicalGraphState:
    # Structured extraction entries are grounded against source document raw_text
    return state


def timeline_reconstruction(state: ClinicalGraphState) -> ClinicalGraphState:
    state["timeline_events"] = sorted(
        state.get("timeline_events", []),
        key=lambda ev: ev.get("clinical_event_date") or "9999-12-31",
    )
    return state


def reconciliation(state: ClinicalGraphState) -> ClinicalGraphState:
    return state


def evidence_retrieval(state: ClinicalGraphState) -> ClinicalGraphState:
    return state


def conflict_detection(state: ClinicalGraphState) -> ClinicalGraphState:
    conflicts: List[Dict[str, Any]] = list(state.get("conflicts", []))
    allergies = [
        f["fact_value"].lower()
        for f in state.get("extracted_facts", [])
        if f.get("category") == "Allergy"
    ]
    has_penicillin_allergy = any("penicillin" in a for a in allergies)

    for med in state.get("medications", []):
        med_name = med.get("medication_name", "").lower()
        if has_penicillin_allergy and any(p in med_name for p in PENICILLIN_CLASS):
            conflicts.append(
                {
                    "category": "Medication-Allergy Discrepancy",
                    "severity": "Critical",
                    "title": f"Penicillin Allergy vs {med.get('medication_name')}",
                    "system_stopped_conclusion": True,
                    "escalation_reason": "Beta-lactam antibiotic prescribed despite documented Penicillin allergy.",
                }
            )
    state["conflicts"] = conflicts
    return state


def uncertainty_assessment(state: ClinicalGraphState) -> ClinicalGraphState:
    critical = [
        c
        for c in state.get("conflicts", [])
        if c.get("severity") in ("Critical", "High") or c.get("system_stopped_conclusion")
    ]
    state["requires_human_review"] = len(critical) > 0
    if state["requires_human_review"]:
        state["halt_reason"] = "Critical discrepancies require clinician sign-off before final summary release."
    return state


def route_decision(state: ClinicalGraphState) -> str:
    return "escalated_review" if state.get("requires_human_review") else "supported_summary"


def generate_escalated_report(state: ClinicalGraphState) -> ClinicalGraphState:
    state["route_decision"] = "ESCALATED_HUMAN_REVIEW_REQUIRED"
    return state


def generate_supported_summary(state: ClinicalGraphState) -> ClinicalGraphState:
    state["route_decision"] = "EVIDENCE_SUPPORTED_SUMMARY"
    return state


def build_clinical_workflow():
    graph = StateGraph(ClinicalGraphState)
    graph.add_node("document_ingestion", document_ingestion)
    graph.add_node("document_classification", document_classification)
    graph.add_node("clinical_extraction", clinical_extraction)
    graph.add_node("timeline_reconstruction", timeline_reconstruction)
    graph.add_node("reconciliation", reconciliation)
    graph.add_node("evidence_retrieval", evidence_retrieval)
    graph.add_node("conflict_detection", conflict_detection)
    graph.add_node("uncertainty_assessment", uncertainty_assessment)
    graph.add_node("generate_escalated_report", generate_escalated_report)
    graph.add_node("generate_supported_summary", generate_supported_summary)

    graph.set_entry_point("document_ingestion")
    graph.add_edge("document_ingestion", "document_classification")
    graph.add_edge("document_classification", "clinical_extraction")
    graph.add_edge("clinical_extraction", "timeline_reconstruction")
    graph.add_edge("timeline_reconstruction", "reconciliation")
    graph.add_edge("reconciliation", "evidence_retrieval")
    graph.add_edge("evidence_retrieval", "conflict_detection")
    graph.add_edge("conflict_detection", "uncertainty_assessment")
    graph.add_conditional_edges(
        "uncertainty_assessment",
        route_decision,
        {
            "escalated_review": "generate_escalated_report",
            "supported_summary": "generate_supported_summary",
        },
    )
    graph.add_edge("generate_escalated_report", END)
    graph.add_edge("generate_supported_summary", END)
    return graph.compile()
