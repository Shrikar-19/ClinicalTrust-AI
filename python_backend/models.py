from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, Field


class VerificationStatus(str, Enum):
    VERIFIED = "Verified"
    SUPPORTED = "Supported"
    PARTIALLY_SUPPORTED = "Partially supported"
    CONFLICTING = "Conflicting"
    UNRESOLVED = "Unresolved"
    REQUIRES_HUMAN_REVIEW = "Requires human review"


class ExtractedFact(BaseModel):
    category: str
    fact_value: str
    source_document: str
    source_location: str
    source_passage: str
    verification_status: VerificationStatus = VerificationStatus.UNRESOLVED
    clinical_event_date: Optional[str] = None


class ClinicalConflict(BaseModel):
    category: str
    severity: str
    title: str
    source_documents: List[str]
    explanation: str
    escalation_reason: str
    system_stopped_conclusion: bool = True
    review_status: str = "Pending Human Review"


class ConflictResolutionRequest(BaseModel):
    reviewer_name: str = Field(..., min_length=2, max_length=80)
    resolution_notes: str = Field(..., min_length=3, max_length=1000)
    decision: str = "Resolved by Clinician"
