import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import type {
  ClinicalConflict,
  ClinicalDocument,
  ClinicalReport,
  DiagnosisRecord,
  ExtractedFact,
  LabFinding,
  MedicationRecord,
  MissingInfoItem,
  Patient,
  PatientWorkspaceResponse,
  TimelineEvent,
  WorkflowRun,
} from '../types.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'clinicaltrust.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initializeDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS patients (
      id TEXT PRIMARY KEY,
      patient_identifier TEXT NOT NULL,
      display_name TEXT NOT NULL,
      age INTEGER,
      sex TEXT,
      is_synthetic INTEGER NOT NULL DEFAULT 1,
      overall_status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      document_name TEXT NOT NULL,
      file_type TEXT NOT NULL,
      document_type TEXT NOT NULL,
      document_date TEXT,
      upload_date TEXT NOT NULL,
      file_size_bytes INTEGER NOT NULL,
      page_count INTEGER NOT NULL DEFAULT 1,
      processing_status TEXT NOT NULL,
      extraction_status TEXT NOT NULL,
      raw_text TEXT NOT NULL,
      error_message TEXT,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS extracted_facts (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      document_id TEXT NOT NULL,
      category TEXT NOT NULL,
      fact_value TEXT NOT NULL,
      normalized_value TEXT,
      source_document TEXT NOT NULL,
      source_location TEXT NOT NULL,
      source_passage TEXT NOT NULL,
      verification_status TEXT NOT NULL,
      verification_notes TEXT NOT NULL,
      clinical_event_date TEXT,
      supporting_passages TEXT NOT NULL,
      contradictory_passages TEXT NOT NULL,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS timeline_events (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      document_id TEXT NOT NULL,
      clinical_event_date TEXT,
      upload_date TEXT NOT NULL,
      date_status TEXT NOT NULL,
      event_category TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      source_document TEXT NOT NULL,
      source_location TEXT NOT NULL,
      source_passage TEXT NOT NULL,
      verification_status TEXT NOT NULL,
      order_confidence TEXT NOT NULL,
      sequence_index INTEGER NOT NULL,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS diagnoses (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      diagnosis_name TEXT NOT NULL,
      status TEXT NOT NULL,
      first_seen_date TEXT,
      latest_date TEXT,
      source_documents TEXT NOT NULL,
      statements TEXT NOT NULL,
      verification_status TEXT NOT NULL,
      notes TEXT NOT NULL,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS medications (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      medication_name TEXT NOT NULL,
      dosage TEXT,
      frequency TEXT,
      reconciliation_status TEXT NOT NULL,
      source_context TEXT NOT NULL,
      source_documents TEXT NOT NULL,
      passages TEXT NOT NULL,
      verification_status TEXT NOT NULL,
      safety_flag TEXT,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS lab_findings (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      test_name TEXT NOT NULL,
      result_value TEXT,
      interpretation TEXT,
      clinical_test_date TEXT,
      upload_date TEXT NOT NULL,
      status TEXT NOT NULL,
      source_document TEXT NOT NULL,
      source_location TEXT NOT NULL,
      source_passage TEXT NOT NULL,
      verification_status TEXT NOT NULL,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS missing_items (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      safety_note TEXT NOT NULL,
      affected_documents TEXT NOT NULL,
      severity TEXT NOT NULL,
      verification_status TEXT NOT NULL,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS conflicts (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      category TEXT NOT NULL,
      severity TEXT NOT NULL,
      title TEXT NOT NULL,
      conflicting_statements TEXT NOT NULL,
      source_documents TEXT NOT NULL,
      explanation TEXT NOT NULL,
      escalation_reason TEXT NOT NULL,
      system_stopped_conclusion INTEGER NOT NULL,
      review_status TEXT NOT NULL,
      reviewer_name TEXT,
      resolution_notes TEXT,
      reviewed_at TEXT,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS workflow_runs (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT NOT NULL,
      route_decision TEXT NOT NULL,
      halted_at_node TEXT,
      halt_reason TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0,
      steps TEXT NOT NULL,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS clinical_reports (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      overall_status TEXT NOT NULL,
      halted_conclusions TEXT NOT NULL,
      sections TEXT NOT NULL,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );
  `);
}

export function getPatientCount(): number {
  const row = db.prepare('SELECT COUNT(*) as count FROM patients').get() as { count: number };
  return row.count;
}

export function listPatients(): Patient[] {
  const rows = db.prepare('SELECT * FROM patients ORDER BY updated_at DESC').all() as Array<Record<string, unknown>>;
  return rows.map(mapPatientRow);
}

export function getPatientById(patientId: string): Patient | null {
  const row = db.prepare('SELECT * FROM patients WHERE id = ?').get(patientId) as Record<string, unknown> | undefined;
  return row ? mapPatientRow(row) : null;
}

export function createPatient(patient: Patient): void {
  db.prepare(`
    INSERT INTO patients (id, patient_identifier, display_name, age, sex, is_synthetic, overall_status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    patient.id,
    patient.patientIdentifier,
    patient.displayName,
    patient.age,
    patient.sex,
    patient.isSynthetic ? 1 : 0,
    patient.overallStatus,
    patient.createdAt,
    patient.updatedAt
  );
}

export function updatePatientStatus(patientId: string, age: number | null, overallStatus: string): void {
  db.prepare(`
    UPDATE patients SET age = COALESCE(?, age), overall_status = ?, updated_at = ? WHERE id = ?
  `).run(age, overallStatus, new Date().toISOString(), patientId);
}

export function deletePatientData(patientId: string): boolean {
  const result = db.prepare('DELETE FROM patients WHERE id = ?').run(patientId);
  return result.changes > 0;
}

export function insertDocument(doc: ClinicalDocument): void {
  db.prepare(`
    INSERT INTO documents (
      id, patient_id, document_name, file_type, document_type, document_date,
      upload_date, file_size_bytes, page_count, processing_status, extraction_status,
      raw_text, error_message
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    doc.id,
    doc.patientId,
    doc.documentName,
    doc.fileType,
    doc.documentType,
    doc.documentDate,
    doc.uploadDate,
    doc.fileSizeBytes,
    doc.pageCount,
    doc.processingStatus,
    doc.extractionStatus,
    doc.rawText,
    doc.errorMessage
  );
}

export function updateDocumentMetadata(
  docId: string,
  documentType: string,
  documentDate: string | null,
  processingStatus: string,
  extractionStatus: string
): void {
  db.prepare(`
    UPDATE documents
    SET document_type = ?, document_date = ?, processing_status = ?, extraction_status = ?
    WHERE id = ?
  `).run(documentType, documentDate, processingStatus, extractionStatus, docId);
}

export function getDocumentsForPatient(patientId: string): ClinicalDocument[] {
  const rows = db
    .prepare('SELECT * FROM documents WHERE patient_id = ? ORDER BY upload_date ASC, document_name ASC')
    .all(patientId) as Array<Record<string, unknown>>;
  return rows.map(mapDocumentRow);
}

export function clearAnalysisForPatient(patientId: string): void {
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM extracted_facts WHERE patient_id = ?').run(patientId);
    db.prepare('DELETE FROM timeline_events WHERE patient_id = ?').run(patientId);
    db.prepare('DELETE FROM diagnoses WHERE patient_id = ?').run(patientId);
    db.prepare('DELETE FROM medications WHERE patient_id = ?').run(patientId);
    db.prepare('DELETE FROM lab_findings WHERE patient_id = ?').run(patientId);
    db.prepare('DELETE FROM missing_items WHERE patient_id = ?').run(patientId);
    db.prepare('DELETE FROM conflicts WHERE patient_id = ?').run(patientId);
    db.prepare('DELETE FROM workflow_runs WHERE patient_id = ?').run(patientId);
    db.prepare('DELETE FROM clinical_reports WHERE patient_id = ?').run(patientId);
  });
  tx();
}

export function saveAnalysisResults(params: {
  patientId: string;
  age: number | null;
  overallStatus: string;
  facts: ExtractedFact[];
  timeline: TimelineEvent[];
  diagnoses: DiagnosisRecord[];
  medications: MedicationRecord[];
  labFindings: LabFinding[];
  missingItems: MissingInfoItem[];
  conflicts: ClinicalConflict[];
  workflowRun: WorkflowRun;
  report: ClinicalReport;
}): void {
  const tx = db.transaction(() => {
    clearAnalysisForPatient(params.patientId);
    updatePatientStatus(params.patientId, params.age, params.overallStatus);

    const insertFact = db.prepare(`
      INSERT INTO extracted_facts (
        id, patient_id, document_id, category, fact_value, normalized_value,
        source_document, source_location, source_passage, verification_status,
        verification_notes, clinical_event_date, supporting_passages, contradictory_passages
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const f of params.facts) {
      insertFact.run(
        f.id,
        f.patientId,
        f.documentId,
        f.category,
        f.factValue,
        f.normalizedValue,
        f.sourceDocument,
        f.sourceLocation,
        f.sourcePassage,
        f.verificationStatus,
        f.verificationNotes,
        f.clinicalEventDate,
        JSON.stringify(f.supportingPassages),
        JSON.stringify(f.contradictoryPassages)
      );
    }

    const insertTimeline = db.prepare(`
      INSERT INTO timeline_events (
        id, patient_id, document_id, clinical_event_date, upload_date, date_status,
        event_category, title, description, source_document, source_location,
        source_passage, verification_status, order_confidence, sequence_index
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const t of params.timeline) {
      insertTimeline.run(
        t.id,
        t.patientId,
        t.documentId,
        t.clinicalEventDate,
        t.uploadDate,
        t.dateStatus,
        t.eventCategory,
        t.title,
        t.description,
        t.sourceDocument,
        t.sourceLocation,
        t.sourcePassage,
        t.verificationStatus,
        t.orderConfidence,
        t.sequenceIndex
      );
    }

    const insertDiag = db.prepare(`
      INSERT INTO diagnoses (
        id, patient_id, diagnosis_name, status, first_seen_date, latest_date,
        source_documents, statements, verification_status, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const d of params.diagnoses) {
      insertDiag.run(
        d.id,
        d.patientId,
        d.diagnosisName,
        d.status,
        d.firstSeenDate,
        d.latestDate,
        JSON.stringify(d.sourceDocuments),
        JSON.stringify(d.statements),
        d.verificationStatus,
        d.notes
      );
    }

    const insertMed = db.prepare(`
      INSERT INTO medications (
        id, patient_id, medication_name, dosage, frequency, reconciliation_status,
        source_context, source_documents, passages, verification_status, safety_flag
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const m of params.medications) {
      insertMed.run(
        m.id,
        m.patientId,
        m.medicationName,
        m.dosage,
        m.frequency,
        m.reconciliationStatus,
        m.sourceContext,
        JSON.stringify(m.sourceDocuments),
        JSON.stringify(m.passages),
        m.verificationStatus,
        m.safetyFlag
      );
    }

    const insertLab = db.prepare(`
      INSERT INTO lab_findings (
        id, patient_id, test_name, result_value, interpretation, clinical_test_date,
        upload_date, status, source_document, source_location, source_passage, verification_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const l of params.labFindings) {
      insertLab.run(
        l.id,
        l.patientId,
        l.testName,
        l.resultValue,
        l.interpretation,
        l.clinicalTestDate,
        l.uploadDate,
        l.status,
        l.sourceDocument,
        l.sourceLocation,
        l.sourcePassage,
        l.verificationStatus
      );
    }

    const insertMissing = db.prepare(`
      INSERT INTO missing_items (
        id, patient_id, category, description, safety_note, affected_documents, severity, verification_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const item of params.missingItems) {
      insertMissing.run(
        item.id,
        item.patientId,
        item.category,
        item.description,
        item.safetyNote,
        JSON.stringify(item.affectedDocuments),
        item.severity,
        item.verificationStatus
      );
    }

    const insertConflict = db.prepare(`
      INSERT INTO conflicts (
        id, patient_id, category, severity, title, conflicting_statements,
        source_documents, explanation, escalation_reason, system_stopped_conclusion,
        review_status, reviewer_name, resolution_notes, reviewed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const c of params.conflicts) {
      insertConflict.run(
        c.id,
        c.patientId,
        c.category,
        c.severity,
        c.title,
        JSON.stringify(c.conflictingStatements),
        JSON.stringify(c.sourceDocuments),
        c.explanation,
        c.escalationReason,
        c.systemStoppedConclusion ? 1 : 0,
        c.reviewStatus,
        c.reviewerName,
        c.resolutionNotes,
        c.reviewedAt
      );
    }

    db.prepare(`
      INSERT INTO workflow_runs (
        id, patient_id, started_at, completed_at, route_decision, halted_at_node, halt_reason, retry_count, steps
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      params.workflowRun.id,
      params.workflowRun.patientId,
      params.workflowRun.startedAt,
      params.workflowRun.completedAt,
      params.workflowRun.routeDecision,
      params.workflowRun.haltedAtNode,
      params.workflowRun.haltReason,
      params.workflowRun.retryCount,
      JSON.stringify(params.workflowRun.steps)
    );

    db.prepare(`
      INSERT INTO clinical_reports (
        id, patient_id, generated_at, overall_status, halted_conclusions, sections
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      params.report.id,
      params.report.patientId,
      params.report.generatedAt,
      params.report.overallStatus,
      JSON.stringify(params.report.haltedConclusions),
      JSON.stringify(params.report.sections)
    );
  });

  tx();
}

export function getPatientWorkspace(patientId: string): PatientWorkspaceResponse | null {
  const patient = getPatientById(patientId);
  if (!patient) return null;

  const documents = getDocumentsForPatient(patientId);

  const facts = (
    db.prepare('SELECT * FROM extracted_facts WHERE patient_id = ?').all(patientId) as Array<Record<string, unknown>>
  ).map((r): ExtractedFact => ({
    id: String(r.id),
    patientId: String(r.patient_id),
    documentId: String(r.document_id),
    category: r.category as ExtractedFact['category'],
    factValue: String(r.fact_value),
    normalizedValue: r.normalized_value ? String(r.normalized_value) : null,
    sourceDocument: String(r.source_document),
    sourceLocation: String(r.source_location),
    sourcePassage: String(r.source_passage),
    verificationStatus: r.verification_status as ExtractedFact['verificationStatus'],
    verificationNotes: String(r.verification_notes),
    clinicalEventDate: r.clinical_event_date ? String(r.clinical_event_date) : null,
    supportingPassages: JSON.parse(String(r.supporting_passages)) as string[],
    contradictoryPassages: JSON.parse(String(r.contradictory_passages)) as string[],
  }));

  const timeline = (
    db.prepare('SELECT * FROM timeline_events WHERE patient_id = ? ORDER BY sequence_index ASC').all(patientId) as Array<
      Record<string, unknown>
    >
  ).map((r): TimelineEvent => ({
    id: String(r.id),
    patientId: String(r.patient_id),
    documentId: String(r.document_id),
    clinicalEventDate: r.clinical_event_date ? String(r.clinical_event_date) : null,
    uploadDate: String(r.upload_date),
    dateStatus: r.date_status as TimelineEvent['dateStatus'],
    eventCategory: r.event_category as TimelineEvent['eventCategory'],
    title: String(r.title),
    description: String(r.description),
    sourceDocument: String(r.source_document),
    sourceLocation: String(r.source_location),
    sourcePassage: String(r.source_passage),
    verificationStatus: r.verification_status as TimelineEvent['verificationStatus'],
    orderConfidence: r.order_confidence as TimelineEvent['orderConfidence'],
    sequenceIndex: Number(r.sequence_index),
  }));

  const diagnoses = (
    db.prepare('SELECT * FROM diagnoses WHERE patient_id = ?').all(patientId) as Array<Record<string, unknown>>
  ).map((r): DiagnosisRecord => ({
    id: String(r.id),
    patientId: String(r.patient_id),
    diagnosisName: String(r.diagnosis_name),
    status: r.status as DiagnosisRecord['status'],
    firstSeenDate: r.first_seen_date ? String(r.first_seen_date) : null,
    latestDate: r.latest_date ? String(r.latest_date) : null,
    sourceDocuments: JSON.parse(String(r.source_documents)) as string[],
    statements: JSON.parse(String(r.statements)) as DiagnosisRecord['statements'],
    verificationStatus: r.verification_status as DiagnosisRecord['verificationStatus'],
    notes: String(r.notes),
  }));

  const medications = (
    db.prepare('SELECT * FROM medications WHERE patient_id = ?').all(patientId) as Array<Record<string, unknown>>
  ).map((r): MedicationRecord => ({
    id: String(r.id),
    patientId: String(r.patient_id),
    medicationName: String(r.medication_name),
    dosage: r.dosage ? String(r.dosage) : null,
    frequency: r.frequency ? String(r.frequency) : null,
    reconciliationStatus: r.reconciliation_status as MedicationRecord['reconciliationStatus'],
    sourceContext: r.source_context as MedicationRecord['sourceContext'],
    sourceDocuments: JSON.parse(String(r.source_documents)) as string[],
    passages: JSON.parse(String(r.passages)) as MedicationRecord['passages'],
    verificationStatus: r.verification_status as MedicationRecord['verificationStatus'],
    safetyFlag: r.safety_flag ? String(r.safety_flag) : null,
  }));

  const labFindings = (
    db.prepare('SELECT * FROM lab_findings WHERE patient_id = ?').all(patientId) as Array<Record<string, unknown>>
  ).map((r): LabFinding => ({
    id: String(r.id),
    patientId: String(r.patient_id),
    testName: String(r.test_name),
    resultValue: r.result_value ? String(r.result_value) : null,
    interpretation: r.interpretation ? String(r.interpretation) : null,
    clinicalTestDate: r.clinical_test_date ? String(r.clinical_test_date) : null,
    uploadDate: String(r.upload_date),
    status: r.status as LabFinding['status'],
    sourceDocument: String(r.source_document),
    sourceLocation: String(r.source_location),
    sourcePassage: String(r.source_passage),
    verificationStatus: r.verification_status as LabFinding['verificationStatus'],
  }));

  const missingItems = (
    db.prepare('SELECT * FROM missing_items WHERE patient_id = ?').all(patientId) as Array<Record<string, unknown>>
  ).map((r): MissingInfoItem => ({
    id: String(r.id),
    patientId: String(r.patient_id),
    category: r.category as MissingInfoItem['category'],
    description: String(r.description),
    safetyNote: String(r.safety_note),
    affectedDocuments: JSON.parse(String(r.affected_documents)) as string[],
    severity: r.severity as MissingInfoItem['severity'],
    verificationStatus: r.verification_status as MissingInfoItem['verificationStatus'],
  }));

  const conflicts = (
    db.prepare('SELECT * FROM conflicts WHERE patient_id = ?').all(patientId) as Array<Record<string, unknown>>
  ).map((r): ClinicalConflict => ({
    id: String(r.id),
    patientId: String(r.patient_id),
    category: r.category as ClinicalConflict['category'],
    severity: r.severity as ClinicalConflict['severity'],
    title: String(r.title),
    conflictingStatements: JSON.parse(String(r.conflicting_statements)) as ClinicalConflict['conflictingStatements'],
    sourceDocuments: JSON.parse(String(r.source_documents)) as string[],
    explanation: String(r.explanation),
    escalationReason: String(r.escalation_reason),
    systemStoppedConclusion: Boolean(r.system_stopped_conclusion),
    reviewStatus: r.review_status as ClinicalConflict['reviewStatus'],
    reviewerName: r.reviewer_name ? String(r.reviewer_name) : null,
    resolutionNotes: r.resolution_notes ? String(r.resolution_notes) : null,
    reviewedAt: r.reviewed_at ? String(r.reviewed_at) : null,
  }));

  const wfRow = db
    .prepare('SELECT * FROM workflow_runs WHERE patient_id = ? ORDER BY completed_at DESC LIMIT 1')
    .get(patientId) as Record<string, unknown> | undefined;

  const workflowRun: WorkflowRun | null = wfRow
    ? {
        id: String(wfRow.id),
        patientId: String(wfRow.patient_id),
        startedAt: String(wfRow.started_at),
        completedAt: String(wfRow.completed_at),
        routeDecision: wfRow.route_decision as WorkflowRun['routeDecision'],
        haltedAtNode: wfRow.halted_at_node ? String(wfRow.halted_at_node) : null,
        haltReason: wfRow.halt_reason ? String(wfRow.halt_reason) : null,
        retryCount: Number(wfRow.retry_count),
        steps: JSON.parse(String(wfRow.steps)) as WorkflowRun['steps'],
      }
    : null;

  const repRow = db
    .prepare('SELECT * FROM clinical_reports WHERE patient_id = ? ORDER BY generated_at DESC LIMIT 1')
    .get(patientId) as Record<string, unknown> | undefined;

  const report: ClinicalReport | null = repRow
    ? {
        id: String(repRow.id),
        patientId: String(repRow.patient_id),
        generatedAt: String(repRow.generated_at),
        overallStatus: repRow.overall_status as ClinicalReport['overallStatus'],
        haltedConclusions: JSON.parse(String(repRow.halted_conclusions)) as string[],
        sections: JSON.parse(String(repRow.sections)) as ClinicalReport['sections'],
      }
    : null;

  return {
    patient,
    documents,
    facts,
    timeline,
    diagnoses,
    medications,
    labFindings,
    missingItems,
    conflicts,
    workflowRun,
    report,
  };
}

export function resolveConflictReview(
  conflictId: string,
  reviewerName: string,
  resolutionNotes: string,
  decision: 'Resolved by Clinician' | 'Escalated'
): ClinicalConflict | null {
  const now = new Date().toISOString();
  const result = db
    .prepare(`
      UPDATE conflicts
      SET review_status = ?, reviewer_name = ?, resolution_notes = ?, reviewed_at = ?
      WHERE id = ?
    `)
    .run(decision, reviewerName, resolutionNotes, now, conflictId);

  if (result.changes === 0) return null;

  const r = db.prepare('SELECT * FROM conflicts WHERE id = ?').get(conflictId) as Record<string, unknown>;
  const patientId = String(r.patient_id);

  // Recompute patient overall status based on remaining pending reviews
  const pendingCount = (
    db
      .prepare("SELECT COUNT(*) as count FROM conflicts WHERE patient_id = ? AND review_status = 'Pending Human Review'")
      .get(patientId) as { count: number }
  ).count;

  if (pendingCount === 0) {
    db.prepare('UPDATE patients SET overall_status = ?, updated_at = ? WHERE id = ?').run('Supported', now, patientId);
  } else {
    db.prepare('UPDATE patients SET overall_status = ?, updated_at = ? WHERE id = ?').run(
      'Requires human review',
      now,
      patientId
    );
  }

  return {
    id: String(r.id),
    patientId,
    category: r.category as ClinicalConflict['category'],
    severity: r.severity as ClinicalConflict['severity'],
    title: String(r.title),
    conflictingStatements: JSON.parse(String(r.conflicting_statements)) as ClinicalConflict['conflictingStatements'],
    sourceDocuments: JSON.parse(String(r.source_documents)) as string[],
    explanation: String(r.explanation),
    escalationReason: String(r.escalation_reason),
    systemStoppedConclusion: Boolean(r.system_stopped_conclusion),
    reviewStatus: r.review_status as ClinicalConflict['reviewStatus'],
    reviewerName: r.reviewer_name ? String(r.reviewer_name) : null,
    resolutionNotes: r.resolution_notes ? String(r.resolution_notes) : null,
    reviewedAt: r.reviewed_at ? String(r.reviewed_at) : null,
  };
}

export function getDashboardSummary() {
  const patients = listPatients();
  const totalDocuments = (db.prepare('SELECT COUNT(*) as c FROM documents').get() as { c: number }).c;
  const processedDocuments = (
    db.prepare("SELECT COUNT(*) as c FROM documents WHERE processing_status = 'Processed'").get() as { c: number }
  ).c;
  const detectedConflicts = (db.prepare('SELECT COUNT(*) as c FROM conflicts').get() as { c: number }).c;
  const missingInformationCount = (db.prepare('SELECT COUNT(*) as c FROM missing_items').get() as { c: number }).c;
  const pendingHumanReviews = (
    db.prepare("SELECT COUNT(*) as c FROM conflicts WHERE review_status != 'Resolved by Clinician'").get() as {
      c: number;
    }
  ).c;

  const recentAnalyses = patients.map((p) => {
    const docCount = (
      db.prepare('SELECT COUNT(*) as c FROM documents WHERE patient_id = ?').get(p.id) as { c: number }
    ).c;
    const conflictCount = (
      db.prepare('SELECT COUNT(*) as c FROM conflicts WHERE patient_id = ?').get(p.id) as { c: number }
    ).c;
    const pendingReviews = (
      db
        .prepare("SELECT COUNT(*) as c FROM conflicts WHERE patient_id = ? AND review_status != 'Resolved by Clinician'")
        .get(p.id) as { c: number }
    ).c;
    const missingCount = (
      db.prepare('SELECT COUNT(*) as c FROM missing_items WHERE patient_id = ?').get(p.id) as { c: number }
    ).c;

    return {
      patientId: p.id,
      displayName: p.displayName,
      patientIdentifier: p.patientIdentifier,
      age: p.age,
      documentCount: docCount,
      conflictCount,
      pendingReviews,
      missingCount,
      overallStatus: p.overallStatus,
      updatedAt: p.updatedAt,
    };
  });

  const verificationRows = db
    .prepare('SELECT verification_status as status, COUNT(*) as count FROM extracted_facts GROUP BY verification_status')
    .all() as Array<{ status: string; count: number }>;

  const activePatientId = patients[0]?.id;
  const documentTimelineComparison: Array<{
    documentName: string;
    clinicalDay: number | null;
    uploadDay: number;
    lagDays: number;
  }> = [];

  if (activePatientId) {
    const docs = getDocumentsForPatient(activePatientId);
    for (const d of docs) {
      const clinicalDay = d.documentDate ? parseDayOfMonth(d.documentDate) : null;
      const uploadDay = parseDayOfMonth(d.uploadDate) ?? 14;
      const lagDays = clinicalDay !== null ? Math.max(0, uploadDay - clinicalDay) : 0;
      documentTimelineComparison.push({
        documentName: d.documentName.replace(/\.(txt|pdf|docx)$/i, ''),
        clinicalDay,
        uploadDay,
        lagDays,
      });
    }
  }

  return {
    metrics: {
      totalPatients: patients.length,
      totalDocuments,
      processedDocuments,
      detectedConflicts,
      missingInformationCount,
      pendingHumanReviews,
    },
    recentAnalyses,
    verificationDistribution: verificationRows,
    documentTimelineComparison,
  };
}

function parseDayOfMonth(isoOrDate: string): number | null {
  const match = isoOrDate.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (match) return Number(match[3]);
  const dayMatch = isoOrDate.match(/\b(\d{1,2})\s+Nov/i);
  if (dayMatch) return Number(dayMatch[1]);
  return null;
}

function mapPatientRow(r: Record<string, unknown>): Patient {
  return {
    id: String(r.id),
    patientIdentifier: String(r.patient_identifier),
    displayName: String(r.display_name),
    age: r.age !== null && r.age !== undefined ? Number(r.age) : null,
    sex: r.sex ? String(r.sex) : null,
    isSynthetic: Boolean(r.is_synthetic),
    overallStatus: r.overall_status as Patient['overallStatus'],
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

function mapDocumentRow(r: Record<string, unknown>): ClinicalDocument {
  return {
    id: String(r.id),
    patientId: String(r.patient_id),
    documentName: String(r.document_name),
    fileType: r.file_type as ClinicalDocument['fileType'],
    documentType: r.document_type as ClinicalDocument['documentType'],
    documentDate: r.document_date ? String(r.document_date) : null,
    uploadDate: String(r.upload_date),
    fileSizeBytes: Number(r.file_size_bytes),
    pageCount: Number(r.page_count),
    processingStatus: r.processing_status as ClinicalDocument['processingStatus'],
    extractionStatus: r.extraction_status as ClinicalDocument['extractionStatus'],
    rawText: String(r.raw_text),
    errorMessage: r.error_message ? String(r.error_message) : null,
  };
}
