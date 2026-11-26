export type VerificationStatus =
  | 'Verified'
  | 'Supported'
  | 'Partially supported'
  | 'Conflicting'
  | 'Unresolved'
  | 'Requires human review';

export type DocumentClassification =
  | 'Admission Note'
  | 'Laboratory Report'
  | 'Progress Note'
  | 'Prescription'
  | 'Discharge Summary'
  | 'Consultation Note'
  | 'Unclassified Clinical Record';

export type ConflictSeverity = 'Critical' | 'High' | 'Moderate' | 'Low';

export type ReviewStatus = 'Pending Human Review' | 'Resolved by Clinician' | 'Escalated';

export interface Patient {
  id: string;
  patientIdentifier: string;
  displayName: string;
  age: number | null;
  sex: string | null;
  isSynthetic: boolean;
  overallStatus: VerificationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ClinicalDocument {
  id: string;
  patientId: string;
  documentName: string;
  fileType: 'PDF' | 'TXT' | 'DOCX';
  documentType: DocumentClassification;
  documentDate: string | null;
  uploadDate: string;
  fileSizeBytes: number;
  pageCount: number;
  processingStatus: 'Queued' | 'Processed' | 'Failed';
  extractionStatus: 'Pending' | 'Extracted' | 'Failed';
  rawText: string;
  errorMessage: string | null;
}

export interface ExtractedFact {
  id: string;
  patientId: string;
  documentId: string;
  category:
    | 'PatientIdentifier'
    | 'Age'
    | 'DocumentDate'
    | 'ClinicalEventDate'
    | 'Symptom'
    | 'Diagnosis'
    | 'DiagnosisStatus'
    | 'Medication'
    | 'Dosage'
    | 'Allergy'
    | 'LaboratoryFinding'
    | 'TreatmentChange'
    | 'DischargeInfo';
  factValue: string;
  normalizedValue: string | null;
  sourceDocument: string;
  sourceLocation: string;
  sourcePassage: string;
  verificationStatus: VerificationStatus;
  verificationNotes: string;
  clinicalEventDate: string | null;
  supportingPassages: string[];
  contradictoryPassages: string[];
}

export interface TimelineEvent {
  id: string;
  patientId: string;
  documentId: string;
  clinicalEventDate: string | null;
  uploadDate: string;
  dateStatus: 'Confirmed' | 'Missing' | 'Conflicting' | 'Upload Lag Detected';
  eventCategory:
    | 'Admission'
    | 'Symptom'
    | 'Laboratory Test'
    | 'Diagnosis'
    | 'Medication Change'
    | 'Progress Note'
    | 'Discharge';
  title: string;
  description: string;
  sourceDocument: string;
  sourceLocation: string;
  sourcePassage: string;
  verificationStatus: VerificationStatus;
  orderConfidence: 'Chronological' | 'Uncertain Order';
  sequenceIndex: number;
}

export interface DiagnosisRecord {
  id: string;
  patientId: string;
  diagnosisName: string;
  status: 'Confirmed' | 'Suspected' | 'Ruled Out' | 'Conflicting' | 'Single Source' | 'Insufficient Evidence';
  firstSeenDate: string | null;
  latestDate: string | null;
  sourceDocuments: string[];
  statements: Array<{
    documentName: string;
    date: string | null;
    statusInDoc: string;
    passage: string;
    location: string;
  }>;
  verificationStatus: VerificationStatus;
  notes: string;
}

export interface MedicationRecord {
  id: string;
  patientId: string;
  medicationName: string;
  dosage: string | null;
  frequency: string | null;
  reconciliationStatus:
    | 'Continued'
    | 'Newly Prescribed'
    | 'Discontinued'
    | 'Dosage Inconsistency'
    | 'Missing Details'
    | 'Unexplained Change'
    | 'Allergy Cross-Reactivity Alert';
  sourceContext: 'Admission' | 'Prescription' | 'Progress Note' | 'Discharge Summary' | 'Multiple';
  sourceDocuments: string[];
  passages: Array<{
    documentName: string;
    date: string | null;
    statement: string;
    location: string;
  }>;
  verificationStatus: VerificationStatus;
  safetyFlag: string | null;
}

export interface LabFinding {
  id: string;
  patientId: string;
  testName: string;
  resultValue: string | null;
  interpretation: string | null;
  clinicalTestDate: string | null;
  uploadDate: string;
  status: 'Result Available' | 'Ordered - Result Missing' | 'Delayed Upload';
  sourceDocument: string;
  sourceLocation: string;
  sourcePassage: string;
  verificationStatus: VerificationStatus;
}

export interface MissingInfoItem {
  id: string;
  patientId: string;
  category:
    | 'Missing Allergy Record'
    | 'Missing Medication Details'
    | 'Missing Lab Result'
    | 'Missing Diagnosis Confirmation'
    | 'Incomplete Discharge Info'
    | 'Uncertain or Inconsistent Date';
  description: string;
  safetyNote: string;
  affectedDocuments: string[];
  severity: ConflictSeverity;
  verificationStatus: VerificationStatus;
}

export interface ClinicalConflict {
  id: string;
  patientId: string;
  category:
    | 'Medication-Allergy Discrepancy'
    | 'Missing Critical Discharge Information'
    | 'Medication Specificity / Change Gap'
    | 'Diagnostic Progression / Conflict'
    | 'Date / Upload Lag Discrepancy'
    | 'Missing Clinical Evidence';
  severity: ConflictSeverity;
  title: string;
  conflictingStatements: Array<{
    documentName: string;
    date: string | null;
    statement: string;
    location: string;
  }>;
  sourceDocuments: string[];
  explanation: string;
  escalationReason: string;
  systemStoppedConclusion: boolean;
  reviewStatus: ReviewStatus;
  reviewerName: string | null;
  resolutionNotes: string | null;
  reviewedAt: string | null;
}

export interface AgentStepLog {
  nodeName:
    | 'DOCUMENT_INGESTION'
    | 'DOCUMENT_CLASSIFICATION'
    | 'CLINICAL_EXTRACTION'
    | 'TIMELINE_RECONSTRUCTION'
    | 'RECONCILIATION'
    | 'EVIDENCE_RETRIEVAL'
    | 'CONFLICT_DETECTION'
    | 'UNCERTAINTY_ASSESSMENT'
    | 'DECISION';
  label: string;
  status: 'completed' | 'halted_for_review' | 'retried' | 'failed';
  durationMs: number;
  summary: string;
  details: string[];
}

export interface WorkflowRun {
  id: string;
  patientId: string;
  startedAt: string;
  completedAt: string;
  routeDecision: 'EVIDENCE_SUPPORTED_SUMMARY' | 'ESCALATED_HUMAN_REVIEW_REQUIRED';
  haltedAtNode: string | null;
  haltReason: string | null;
  retryCount: number;
  steps: AgentStepLog[];
}

export interface ClinicalReport {
  id: string;
  patientId: string;
  generatedAt: string;
  overallStatus: VerificationStatus;
  haltedConclusions: string[];
  sections: {
    patientOverview: {
      documentedFacts: string[];
      aiInterpretations: string[];
    };
    reconstructedTimelineSummary: {
      documentedFacts: string[];
      aiInterpretations: string[];
    };
    currentDiagnoses: {
      documentedFacts: string[];
      aiInterpretations: string[];
    };
    medicationReconciliation: {
      documentedFacts: string[];
      aiInterpretations: string[];
    };
    laboratoryFindings: {
      documentedFacts: string[];
      aiInterpretations: string[];
    };
    missingInformation: string[];
    conflictingInformation: string[];
    evidenceReferences: Array<{
      claim: string;
      documentName: string;
      location: string;
      status: VerificationStatus;
    }>;
    unresolvedIssues: string[];
    humanReviewRecommendations: string[];
  };
}

export interface PatientWorkspaceResponse {
  patient: Patient;
  documents: ClinicalDocument[];
  facts: ExtractedFact[];
  timeline: TimelineEvent[];
  diagnoses: DiagnosisRecord[];
  medications: MedicationRecord[];
  labFindings: LabFinding[];
  missingItems: MissingInfoItem[];
  conflicts: ClinicalConflict[];
  workflowRun: WorkflowRun | null;
  report: ClinicalReport | null;
}

export interface DashboardSummaryResponse {
  metrics: {
    totalPatients: number;
    totalDocuments: number;
    processedDocuments: number;
    detectedConflicts: number;
    missingInformationCount: number;
    pendingHumanReviews: number;
  };
  recentAnalyses: Array<{
    patientId: string;
    displayName: string;
    patientIdentifier: string;
    age: number | null;
    documentCount: number;
    conflictCount: number;
    pendingReviews: number;
    missingCount: number;
    overallStatus: VerificationStatus;
    updatedAt: string;
  }>;
  verificationDistribution: Array<{
    status: string;
    count: number;
  }>;
  documentTimelineComparison: Array<{
    documentName: string;
    clinicalDay: number | null;
    uploadDay: number;
    lagDays: number;
  }>;
}
