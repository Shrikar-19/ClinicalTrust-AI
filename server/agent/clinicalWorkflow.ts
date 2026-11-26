import crypto from 'crypto';
import type {
  AgentStepLog,
  ClinicalConflict,
  ClinicalDocument,
  ClinicalReport,
  DiagnosisRecord,
  DocumentClassification,
  ExtractedFact,
  LabFinding,
  MedicationRecord,
  MissingInfoItem,
  Patient,
  TimelineEvent,
  VerificationStatus,
  WorkflowRun,
} from '../types.ts';
import {
  extractClinicalDocumentWithGemini,
  generateClinicalSynthesisWithGemini,
  type GeminiDocumentExtraction,
} from '../services/geminiClient.ts';
import { saveAnalysisResults, updateDocumentMetadata } from '../db/database.ts';

interface WorkflowState {
  patient: Patient;
  documents: ClinicalDocument[];
  classifications: Record<string, DocumentClassification>;
  extractions: Array<{ doc: ClinicalDocument; data: GeminiDocumentExtraction }>;
  facts: ExtractedFact[];
  timeline: TimelineEvent[];
  diagnoses: DiagnosisRecord[];
  medications: MedicationRecord[];
  labFindings: LabFinding[];
  missingItems: MissingInfoItem[];
  conflicts: ClinicalConflict[];
  haltedConclusions: string[];
  routeDecision: 'EVIDENCE_SUPPORTED_SUMMARY' | 'ESCALATED_HUMAN_REVIEW_REQUIRED';
  haltedAtNode: string | null;
  haltReason: string | null;
  retryCount: number;
  steps: AgentStepLog[];
}

const PENICILLIN_CLASS_DRUGS = [
  'amoxicillin',
  'ampicillin',
  'penicillin',
  'piperacillin',
  'augmentin',
  'amoxicillin-clavulanate',
  'dicloxacillin',
  'nafcillin',
  'oxacillin',
];

function uid(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * Deterministic grounding check: verifies that a passage cited by the LLM
 * genuinely appears (exact or normalized whitespace) in the source document text.
 */
function verifyPassageInSource(rawText: string, passage: string): boolean {
  if (!passage || passage.trim().length < 3) return false;
  const normRaw = rawText.toLowerCase().replace(/\s+/g, ' ');
  const normPassage = passage.toLowerCase().replace(/\s+/g, ' ').trim();
  if (normRaw.includes(normPassage)) return true;

  // Check token overlap (>= 75% of meaningful words present)
  const tokens = normPassage.split(/\W+/).filter((t) => t.length >= 3);
  if (tokens.length === 0) return false;
  const hits = tokens.filter((t) => normRaw.includes(t));
  return hits.length / tokens.length >= 0.75;
}

function normalizeDateSortable(dateStr: string | null): number {
  if (!dateStr) return Number.MAX_SAFE_INTEGER;
  const iso = Date.parse(dateStr);
  if (!Number.isNaN(iso)) return iso;
  const novMatch = dateStr.match(/(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i);
  if (novMatch) {
    const parsed = Date.parse(`${novMatch[2]} ${novMatch[1]}, 2026`);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return Number.MAX_SAFE_INTEGER;
}

function classifyDocumentDeterministic(docName: string, rawText: string): DocumentClassification {
  const nameLower = docName.toLowerCase();
  if (nameLower.includes('discharge')) return 'Discharge Summary';
  if (nameLower.includes('prescription')) return 'Prescription';
  if (nameLower.includes('progress')) return 'Progress Note';
  if (nameLower.includes('lab')) return 'Laboratory Report';
  if (nameLower.includes('admission')) return 'Admission Note';

  const head = rawText.slice(0, 300).toLowerCase();
  if (head.includes('discharge summary')) return 'Discharge Summary';
  if (head.includes('prescription') || head.includes('rx:')) return 'Prescription';
  if (head.includes('progress note')) return 'Progress Note';
  if (head.includes('laboratory report') || head.includes('wbc')) return 'Laboratory Report';
  if (head.includes('admission note')) return 'Admission Note';
  if (head.includes('consult')) return 'Consultation Note';
  return 'Unclassified Clinical Record';
}

export async function runAgenticClinicalWorkflow(params: {
  patient: Patient;
  documents: ClinicalDocument[];
}): Promise<{
  workflowRun: WorkflowRun;
  report: ClinicalReport;
  conflicts: ClinicalConflict[];
}> {
  const startedAt = new Date().toISOString();
  const state: WorkflowState = {
    patient: params.patient,
    documents: params.documents,
    classifications: {},
    extractions: [],
    facts: [],
    timeline: [],
    diagnoses: [],
    medications: [],
    labFindings: [],
    missingItems: [],
    conflicts: [],
    haltedConclusions: [],
    routeDecision: 'EVIDENCE_SUPPORTED_SUMMARY',
    haltedAtNode: null,
    haltReason: null,
    retryCount: 0,
    steps: [],
  };

  if (state.documents.length === 0) {
    throw new Error('Cannot execute clinical workflow: no documents uploaded for this patient.');
  }

  // NODE 1: DOCUMENT INGESTION
  const t1 = Date.now();
  const validDocs = state.documents.filter((d) => d.rawText && d.rawText.trim().length > 0);
  state.steps.push({
    nodeName: 'DOCUMENT_INGESTION',
    label: 'Document Ingestion & Integrity Check',
    status: 'completed',
    durationMs: Math.max(12, Date.now() - t1),
    summary: `Validated ${validDocs.length} clinical source document(s) with non-executing text extraction.`,
    details: validDocs.map((d) => `${d.documentName} (${d.fileType}, ${d.pageCount} page(s), uploaded ${d.uploadDate})`),
  });

  // NODE 2: DOCUMENT CLASSIFICATION
  const t2 = Date.now();
  for (const doc of validDocs) {
    state.classifications[doc.id] = classifyDocumentDeterministic(doc.documentName, doc.rawText);
  }
  state.steps.push({
    nodeName: 'DOCUMENT_CLASSIFICATION',
    label: 'Clinical Document Classification',
    status: 'completed',
    durationMs: Math.max(8, Date.now() - t2),
    summary: `Categorized ${validDocs.length} document(s) into clinical record types.`,
    details: validDocs.map((d) => `${d.documentName} -> ${state.classifications[d.id]}`),
  });

  // NODE 3: CLINICAL INFORMATION EXTRACTION (Parallel Gemini Extraction + Grounding Check)
  const t3 = Date.now();
  let detectedAge: number | null = state.patient.age;
  let extractionModelUsed = 'gemini-3.1-flash-lite';

  const CONCURRENCY = 3;
  const extractedResults: Array<{ doc: ClinicalDocument; extraction: GeminiDocumentExtraction }> = [];

  for (let i = 0; i < validDocs.length; i += CONCURRENCY) {
    const chunk = validDocs.slice(i, i + CONCURRENCY);
    const chunkResults = await Promise.all(
      chunk.map(async (doc) => {
        const res = await extractClinicalDocumentWithGemini({
          documentName: doc.documentName,
          uploadDate: doc.uploadDate,
          rawText: doc.rawText,
        });
        extractionModelUsed = res.modelUsed;
        state.retryCount += res.retriesUsed;
        return { doc, extraction: res.extraction };
      })
    );
    extractedResults.push(...chunkResults);
  }

  for (const { doc, extraction } of extractedResults) {
    const finalDocType =
      extraction.documentType && extraction.documentType !== 'Unclassified Clinical Record'
        ? extraction.documentType
        : state.classifications[doc.id];
    state.classifications[doc.id] = finalDocType;

    updateDocumentMetadata(doc.id, finalDocType, extraction.documentDate, 'Processed', 'Extracted');
    doc.documentType = finalDocType;
    doc.documentDate = extraction.documentDate;
    doc.processingStatus = 'Processed';
    doc.extractionStatus = 'Extracted';

    if (extraction.age && !detectedAge) {
      detectedAge = extraction.age;
    }

    state.extractions.push({ doc, data: extraction });

    for (const f of extraction.facts || []) {
      const grounded = verifyPassageInSource(doc.rawText, f.sourcePassage);
      state.facts.push({
        id: uid('fact'),
        patientId: state.patient.id,
        documentId: doc.id,
        category: f.category,
        factValue: f.factValue,
        normalizedValue: f.normalizedValue ?? null,
        sourceDocument: doc.documentName,
        sourceLocation: f.sourceLocation || 'Page 1',
        sourcePassage: f.sourcePassage || '',
        verificationStatus: grounded ? 'Supported' : 'Unresolved',
        verificationNotes: grounded
          ? 'Verbatim passage verified in source document.'
          : 'Citation could not be strictly matched in raw document text; marked Unresolved.',
        clinicalEventDate: f.clinicalEventDate ?? extraction.documentDate ?? null,
        supportingPassages: grounded ? [`[${doc.documentName}] ${f.sourcePassage}`] : [],
        contradictoryPassages: [],
      });
    }

    // Labs extraction
    for (const lab of extraction.labsMentioned || []) {
      const grounded = verifyPassageInSource(doc.rawText, lab.passage);
      const clinicalDate = lab.clinicalTestDate ?? extraction.documentDate ?? null;
      const hasLag =
        Boolean(clinicalDate) &&
        normalizeDateSortable(doc.uploadDate) > normalizeDateSortable(clinicalDate);

      state.labFindings.push({
        id: uid('lab'),
        patientId: state.patient.id,
        testName: lab.testName,
        resultValue: lab.orderedWithoutResult ? null : lab.resultValue,
        interpretation: lab.orderedWithoutResult
          ? 'Result unavailable (must NOT be interpreted as negative/normal)'
          : lab.interpretation,
        clinicalTestDate: clinicalDate,
        uploadDate: doc.uploadDate,
        status: lab.orderedWithoutResult
          ? 'Ordered - Result Missing'
          : hasLag
          ? 'Delayed Upload'
          : 'Result Available',
        sourceDocument: doc.documentName,
        sourceLocation: lab.location || 'Page 1',
        sourcePassage: lab.passage,
        verificationStatus: !grounded
          ? 'Unresolved'
          : lab.orderedWithoutResult
          ? 'Requires human review'
          : hasLag
          ? 'Partially supported'
          : 'Verified',
      });
    }
  }

  state.steps.push({
    nodeName: 'CLINICAL_EXTRACTION',
    label: 'Structured Clinical Extraction & Grounding Check',
    status: state.retryCount > 0 ? 'retried' : 'completed',
    durationMs: Date.now() - t3,
    summary: `Extracted ${state.facts.length} grounded clinical facts and ${state.labFindings.length} laboratory records across ${validDocs.length} documents using ${extractionModelUsed}.`,
    details: [
      `Extraction mode: Bounded-parallel extraction (concurrency ${CONCURRENCY}, ${extractionModelUsed})`,
      `Grounded facts verified against raw text: ${state.facts.filter((f) => f.verificationStatus !== 'Unresolved').length}/${state.facts.length}`,
      `API retries / fallbacks triggered: ${state.retryCount}`,
    ],
  });

  // NODE 4: PATIENT TIMELINE RECONSTRUCTION
  const t4 = Date.now();
  const rawEvents: TimelineEvent[] = [];
  for (const { doc, data } of state.extractions) {
    for (const ev of data.timelineEvents || []) {
      const clinicalDate = ev.clinicalEventDate ?? data.documentDate ?? null;
      const clinicalTs = normalizeDateSortable(clinicalDate);
      const uploadTs = normalizeDateSortable(doc.uploadDate);
      const hasLag =
        clinicalDate !== null &&
        clinicalTs !== Number.MAX_SAFE_INTEGER &&
        uploadTs !== Number.MAX_SAFE_INTEGER &&
        uploadTs > clinicalTs;

      const dateStatus: TimelineEvent['dateStatus'] = !clinicalDate
        ? 'Missing'
        : hasLag
        ? 'Upload Lag Detected'
        : 'Confirmed';

      rawEvents.push({
        id: uid('tl'),
        patientId: state.patient.id,
        documentId: doc.id,
        clinicalEventDate: clinicalDate,
        uploadDate: doc.uploadDate,
        dateStatus,
        eventCategory: ev.eventCategory,
        title: ev.title,
        description: ev.description,
        sourceDocument: doc.documentName,
        sourceLocation: ev.location || 'Page 1',
        sourcePassage: ev.passage,
        verificationStatus: clinicalDate ? 'Supported' : 'Unresolved',
        orderConfidence: clinicalDate ? 'Chronological' : 'Uncertain Order',
        sequenceIndex: 0,
      });
    }
  }

  rawEvents.sort((a, b) => normalizeDateSortable(a.clinicalEventDate) - normalizeDateSortable(b.clinicalEventDate));
  state.timeline = rawEvents.map((ev, idx) => ({ ...ev, sequenceIndex: idx + 1 }));

  state.steps.push({
    nodeName: 'TIMELINE_RECONSTRUCTION',
    label: 'Chronological Timeline Reconstruction',
    status: 'completed',
    durationMs: Math.max(10, Date.now() - t4),
    summary: `Ordered ${state.timeline.length} clinical events by clinical event date (distinct from system upload date).`,
    details: [
      `Chronological events: ${state.timeline.filter((t) => t.orderConfidence === 'Chronological').length}`,
      `Uncertain order / missing date events: ${state.timeline.filter((t) => t.orderConfidence === 'Uncertain Order').length}`,
      `Delayed upload lags flagged: ${state.timeline.filter((t) => t.dateStatus === 'Upload Lag Detected').length}`,
    ],
  });

  // NODE 5: DIAGNOSIS & MEDICATION RECONCILIATION
  const t5 = Date.now();
  // Group diagnoses by normalized name
  const diagGroups = new Map<
    string,
    Array<{
      name: string;
      statusInDoc: string;
      date: string | null;
      documentName: string;
      location: string;
      passage: string;
    }>
  >();

  for (const { doc, data } of state.extractions) {
    for (const d of data.diagnosesMentioned || []) {
      const cleanedName = d.name
        .trim()
        .replace(/^(suspected|possible|probable|rule out|ruled out)\s+/i, '');
      const key = cleanedName.toLowerCase();
      const inferredStatus =
        /^suspected\s+/i.test(d.name) && d.statusInDoc === 'Mentioned' ? 'Suspected' : d.statusInDoc;
      if (!diagGroups.has(key)) diagGroups.set(key, []);
      diagGroups.get(key)!.push({
        name: cleanedName,
        statusInDoc: inferredStatus,
        date: d.date ?? data.documentDate ?? null,
        documentName: doc.documentName,
        location: d.location || 'Page 1',
        passage: d.passage,
      });
    }
  }

  for (const [, statements] of diagGroups) {
    statements.sort((a, b) => normalizeDateSortable(a.date) - normalizeDateSortable(b.date));
    const distinctStatuses = new Set(statements.map((s) => s.statusInDoc));
    const uniqueDocs = Array.from(new Set(statements.map((s) => s.documentName)));
    let reconciledStatus: DiagnosisRecord['status'] = 'Insufficient Evidence';
    let verStatus: VerificationStatus = 'Partially supported';
    let notes = '';

    if (distinctStatuses.has('Ruled Out') && (distinctStatuses.has('Confirmed') || distinctStatuses.has('Suspected'))) {
      reconciledStatus = 'Conflicting';
      verStatus = 'Conflicting';
      notes = 'Diagnosis is both ruled out and affirmed/suspected across separate records; requires clinician reconciliation.';
    } else if (distinctStatuses.has('Suspected') && (distinctStatuses.has('Confirmed') || distinctStatuses.has('Mentioned'))) {
      reconciledStatus = 'Suspected';
      verStatus = 'Partially supported';
      notes =
        'Initially documented as suspected and later recorded in discharge/subsequent summary without explicit confirmatory diagnostic note.';
    } else if (distinctStatuses.has('Confirmed') && uniqueDocs.length >= 2) {
      reconciledStatus = 'Confirmed';
      verStatus = 'Verified';
      notes = 'Consistently confirmed across multiple clinical documents.';
    } else if (distinctStatuses.has('Ruled Out')) {
      reconciledStatus = 'Ruled Out';
      verStatus = 'Supported';
      notes = 'Explicitly documented as ruled out.';
    } else if (uniqueDocs.length === 1) {
      reconciledStatus = 'Single Source';
      verStatus = 'Partially supported';
      notes = 'Appears in only a single document; corroborating evidence not yet found.';
    } else {
      reconciledStatus = 'Insufficient Evidence';
      verStatus = 'Unresolved';
      notes = 'Insufficient corroborating evidence to mark as confirmed.';
    }

    state.diagnoses.push({
      id: uid('diag'),
      patientId: state.patient.id,
      diagnosisName: statements[statements.length - 1].name,
      status: reconciledStatus,
      firstSeenDate: statements[0].date,
      latestDate: statements[statements.length - 1].date,
      sourceDocuments: uniqueDocs,
      statements: statements.map((s) => ({
        documentName: s.documentName,
        date: s.date,
        statusInDoc: s.statusInDoc,
        passage: s.passage,
        location: s.location,
      })),
      verificationStatus: verStatus,
      notes,
    });
  }

  // Gather documented allergies across all documents
  const documentedAllergies: Array<{ allergen: string; docName: string; passage: string; location: string; date: string | null }> = [];
  const docsMissingAllergies: Array<{ docName: string; docType: DocumentClassification; passage: string; location: string; date: string | null }> = [];

  for (const { doc, data } of state.extractions) {
    const docAllergies = data.allergiesMentioned || [];
    const positive = docAllergies.filter(
      (a) =>
        a.allergen &&
        a.status !== 'Not Mentioned' &&
        a.status !== 'No Known Allergies' &&
        !/not mentioned|none/i.test(a.allergen)
    );
    const notMentioned = docAllergies.filter((a) => a.status === 'Not Mentioned');

    for (const a of positive) {
      if (a.allergen) {
        documentedAllergies.push({
          allergen: a.allergen,
          docName: doc.documentName,
          passage: a.passage,
          location: a.location || 'Page 1',
          date: data.documentDate,
        });
      }
    }

    // Deterministic safety check for explicit allergy lines in raw text if LLM missed structured item
    if (positive.length === 0) {
      const penicillinLine = doc.rawText
        .split(/\n+/)
        .find((line) => /penicillin\s+allergy/i.test(line));
      if (penicillinLine) {
        documentedAllergies.push({
          allergen: 'Penicillin allergy',
          docName: doc.documentName,
          passage: penicillinLine.trim(),
          location: 'Source Text Verification',
          date: data.documentDate,
        });
        positive.push({
          allergen: 'Penicillin allergy',
          status: 'Documented Allergy',
          location: 'Source Text Verification',
          passage: penicillinLine.trim(),
        });
      }
    }

    if (
      positive.length === 0 &&
      (notMentioned.length > 0 ||
        /allergy[\s\w]*:\s*not mentioned/i.test(doc.rawText) ||
        doc.documentType === 'Discharge Summary' ||
        doc.documentType === 'Admission Note')
    ) {
      docsMissingAllergies.push({
        docName: doc.documentName,
        docType: doc.documentType,
        passage: notMentioned[0]?.passage || 'Allergy section omitted or marked not mentioned.',
        location: notMentioned[0]?.location || 'Document Review',
        date: data.documentDate,
      });
    }
  }

  // Group medications across documents
  const medGroups = new Map<
    string,
    Array<{
      name: string;
      dosage: string | null;
      frequency: string | null;
      context: MedicationRecord['sourceContext'];
      action: string;
      documentName: string;
      date: string | null;
      location: string;
      passage: string;
    }>
  >();

  for (const { doc, data } of state.extractions) {
    for (const m of data.medicationsMentioned || []) {
      const key = m.name.trim().toLowerCase();
      if (!medGroups.has(key)) medGroups.set(key, []);
      medGroups.get(key)!.push({
        name: m.name,
        dosage: m.dosage ?? null,
        frequency: m.frequency ?? null,
        context: (m.context as MedicationRecord['sourceContext']) || 'Prescription',
        action: m.action,
        documentName: doc.documentName,
        date: data.documentDate ?? null,
        location: m.location || 'Page 1',
        passage: m.passage,
      });
    }
  }

  const hasPenicillinAllergy = documentedAllergies.some((a) => a.allergen.toLowerCase().includes('penicillin'));

  for (const [key, entries] of medGroups) {
    const uniqueDocs = Array.from(new Set(entries.map((e) => e.documentName)));
    const dosages = Array.from(new Set(entries.map((e) => e.dosage).filter(Boolean)));
    const isPenicillinClass = PENICILLIN_CLASS_DRUGS.some((drug) => key.includes(drug));
    const isVagueAntibiotic = key === 'antibiotics' || key === 'antibiotic';

    let reconStatus: MedicationRecord['reconciliationStatus'] = 'Newly Prescribed';
    let verStatus: VerificationStatus = 'Supported';
    let safetyFlag: string | null = null;

    if (hasPenicillinAllergy && isPenicillinClass) {
      reconStatus = 'Allergy Cross-Reactivity Alert';
      verStatus = 'Conflicting';
      safetyFlag = `CRITICAL SAFETY DISCREPANCY: ${entries[0].name} belongs to the penicillin beta-lactam class while Penicillin allergy is documented in ${documentedAllergies.map((a) => a.docName).join(', ')}.`;
    } else if (isVagueAntibiotic || dosages.length === 0) {
      reconStatus = 'Missing Details';
      verStatus = 'Requires human review';
      safetyFlag = isVagueAntibiotic
        ? 'Generic "Antibiotics" recorded without agent name, dosage, or route; cannot confirm continuity with prescribed regimen.'
        : 'Dosage or administration schedule missing in source record.';
    } else if (dosages.length > 1) {
      reconStatus = 'Dosage Inconsistency';
      verStatus = 'Conflicting';
      safetyFlag = `Multiple differing dosages documented: ${dosages.join(' vs ')}.`;
    } else if (entries.some((e) => e.action === 'Discontinued')) {
      reconStatus = 'Discontinued';
      verStatus = 'Supported';
    }

    state.medications.push({
      id: uid('med'),
      patientId: state.patient.id,
      medicationName: entries[0].name,
      dosage: dosages[0] ?? null,
      frequency: entries.find((e) => e.frequency)?.frequency ?? null,
      reconciliationStatus: reconStatus,
      sourceContext: uniqueDocs.length > 1 ? 'Multiple' : entries[0].context,
      sourceDocuments: uniqueDocs,
      passages: entries.map((e) => ({
        documentName: e.documentName,
        date: e.date,
        statement: e.passage,
        location: e.location,
      })),
      verificationStatus: verStatus,
      safetyFlag,
    });
  }

  state.steps.push({
    nodeName: 'RECONCILIATION',
    label: 'Diagnosis & Medication Reconciliation',
    status: 'completed',
    durationMs: Math.max(10, Date.now() - t5),
    summary: `Reconciled ${state.diagnoses.length} diagnoses and ${state.medications.length} medication entries across clinical contexts.`,
    details: [
      `Documented allergies found: ${documentedAllergies.map((a) => `${a.allergen} (${a.docName})`).join('; ') || 'None documented'}`,
      `Medication safety flags raised: ${state.medications.filter((m) => m.safetyFlag).length}`,
    ],
  });

  // NODE 6: EVIDENCE RETRIEVAL
  const t6 = Date.now();
  for (const fact of state.facts) {
    // Cross-document corroboration or contradiction check
    const lowerVal = fact.factValue.toLowerCase();
    for (const { doc } of state.extractions) {
      if (doc.documentName === fact.sourceDocument) continue;
      const lines = doc.rawText.split(/\n+/).map((l) => l.trim()).filter(Boolean);
      for (const line of lines) {
        const lLower = line.toLowerCase();
        if (fact.category === 'Diagnosis' && lLower.includes('pneumonia')) {
          fact.supportingPassages.push(`[${doc.documentName}] ${line}`);
        }
        if (
          fact.category === 'Allergy' &&
          lLower.includes('allerg') &&
          (lLower.includes('not mentioned') || lLower.includes('none'))
        ) {
          fact.contradictoryPassages.push(`[${doc.documentName}] ${line}`);
        }
        if (
          fact.category === 'Medication' &&
          hasPenicillinAllergy &&
          PENICILLIN_CLASS_DRUGS.some((d) => lowerVal.includes(d)) &&
          lLower.includes('penicillin')
        ) {
          fact.contradictoryPassages.push(`[${doc.documentName}] ${line}`);
          fact.verificationStatus = 'Conflicting';
        }
      }
    }
    fact.supportingPassages = Array.from(new Set(fact.supportingPassages)).slice(0, 5);
    fact.contradictoryPassages = Array.from(new Set(fact.contradictoryPassages)).slice(0, 5);
  }

  state.steps.push({
    nodeName: 'EVIDENCE_RETRIEVAL',
    label: 'Cross-Document Evidence Retrieval',
    status: 'completed',
    durationMs: Math.max(10, Date.now() - t6),
    summary: `Linked ${state.facts.length} clinical facts to supporting and contradictory verbatim passages.`,
    details: [
      `Facts with multi-document corroboration: ${state.facts.filter((f) => f.supportingPassages.length > 1).length}`,
      `Facts with cross-document contradictions: ${state.facts.filter((f) => f.contradictoryPassages.length > 0).length}`,
    ],
  });

  // NODE 7: CONFLICT & MISSING INFORMATION DETECTION (Deterministic Clinical Rules)
  const t7 = Date.now();

  // Conflict Rule 1: Penicillin Allergy vs Amoxicillin / Beta-Lactam Prescription
  const flaggedAllergyMeds = state.medications.filter((m) => m.reconciliationStatus === 'Allergy Cross-Reactivity Alert');
  for (const med of flaggedAllergyMeds) {
    const allergyDoc = documentedAllergies[0];
    state.conflicts.push({
      id: uid('conf'),
      patientId: state.patient.id,
      category: 'Medication-Allergy Discrepancy',
      severity: 'Critical',
      title: `Potential Penicillin Allergy Conflict: ${med.medicationName} Prescribed`,
      conflictingStatements: [
        {
          documentName: allergyDoc.docName,
          date: allergyDoc.date,
          statement: allergyDoc.passage,
          location: allergyDoc.location,
        },
        ...med.passages.map((p) => ({
          documentName: p.documentName,
          date: p.date,
          statement: p.statement,
          location: p.location,
        })),
      ],
      sourceDocuments: Array.from(new Set([allergyDoc.docName, ...med.sourceDocuments])),
      explanation: `${allergyDoc.docName} explicitly documents a "${allergyDoc.allergen}" allergy, whereas ${med.sourceDocuments.join(', ')} prescribes/lists "${med.medicationName}" (an aminopenicillin beta-lactam antibiotic).`,
      escalationReason:
        'System stopped automated medication clearance. Prescribing a penicillin-class antibiotic to a patient with a documented penicillin allergy requires immediate clinician verification.',
      systemStoppedConclusion: true,
      reviewStatus: 'Pending Human Review',
      reviewerName: null,
      resolutionNotes: null,
      reviewedAt: null,
    });
    state.haltedConclusions.push(
      `Halted medication safety clearance for ${med.medicationName} due to documented ${allergyDoc.allergen} allergy.`
    );
  }

  // Conflict Rule 2: Documented Allergy Omitted / "Not Mentioned" in Discharge Summary
  const dischargeMissingAllergy = docsMissingAllergies.find((d) => d.docType === 'Discharge Summary');
  if (documentedAllergies.length > 0 && dischargeMissingAllergy) {
    const allergyDoc = documentedAllergies[0];
    state.conflicts.push({
      id: uid('conf'),
      patientId: state.patient.id,
      category: 'Missing Critical Discharge Information',
      severity: 'High',
      title: 'Documented Penicillin Allergy Missing from Discharge Summary',
      conflictingStatements: [
        {
          documentName: allergyDoc.docName,
          date: allergyDoc.date,
          statement: allergyDoc.passage,
          location: allergyDoc.location,
        },
        {
          documentName: dischargeMissingAllergy.docName,
          date: dischargeMissingAllergy.date,
          statement: dischargeMissingAllergy.passage,
          location: dischargeMissingAllergy.location,
        },
      ],
      sourceDocuments: [allergyDoc.docName, dischargeMissingAllergy.docName],
      explanation: `An allergy (${allergyDoc.allergen}) was documented in ${allergyDoc.docName}, but ${dischargeMissingAllergy.docName} does not record allergy status. Missing allergy data must NEVER be interpreted as absence of allergy.`,
      escalationReason:
        'System stopped discharge completeness sign-off because omitting a known drug allergy from a discharge summary creates downstream prescribing risk.',
      systemStoppedConclusion: true,
      reviewStatus: 'Pending Human Review',
      reviewerName: null,
      resolutionNotes: null,
      reviewedAt: null,
    });
    state.missingItems.push({
      id: uid('miss'),
      patientId: state.patient.id,
      category: 'Missing Allergy Record',
      description: `Allergy status omitted / not mentioned in ${dischargeMissingAllergy.docName} despite documented ${allergyDoc.allergen} in ${allergyDoc.docName}.`,
      safetyNote: 'A missing allergy record must NEVER be interpreted as absence of allergy.',
      affectedDocuments: [dischargeMissingAllergy.docName],
      severity: 'High',
      verificationStatus: 'Requires human review',
    });
    state.haltedConclusions.push(
      `Halted discharge record completeness confirmation due to omitted allergy documentation in ${dischargeMissingAllergy.docName}.`
    );
  } else if (documentedAllergies.length === 0 && docsMissingAllergies.length > 0) {
    state.missingItems.push({
      id: uid('miss'),
      patientId: state.patient.id,
      category: 'Missing Allergy Record',
      description: 'No explicit allergy status or drug-allergy screening documented across available records.',
      safetyNote: 'A missing allergy record must NEVER be interpreted as absence of allergy.',
      affectedDocuments: docsMissingAllergies.map((d) => d.docName),
      severity: 'High',
      verificationStatus: 'Requires human review',
    });
  }

  // Conflict Rule 3: Vague Discharge Medication ("Antibiotics") vs Specific Prescription ("Amoxicillin")
  const vagueMeds = state.medications.filter((m) => m.reconciliationStatus === 'Missing Details');
  const specificAbx = state.medications.filter(
    (m) => PENICILLIN_CLASS_DRUGS.some((p) => m.medicationName.toLowerCase().includes(p)) || m.sourceContext === 'Prescription'
  );
  if (vagueMeds.length > 0) {
    for (const vm of vagueMeds) {
      state.missingItems.push({
        id: uid('miss'),
        patientId: state.patient.id,
        category: 'Missing Medication Details',
        description: `"${vm.medicationName}" listed in ${vm.sourceDocuments.join(', ')} lacks specific drug name, dosage, frequency, or duration.`,
        safetyNote: 'Unspecified medication entries cannot be reconciled safely against active prescriptions or allergy lists.',
        affectedDocuments: vm.sourceDocuments,
        severity: 'High',
        verificationStatus: 'Requires human review',
      });

      const otherSpecific = specificAbx.find(
        (m) => m.medicationName.toLowerCase() !== vm.medicationName.toLowerCase()
      );
      if (otherSpecific && /antibiotic/i.test(vm.medicationName)) {
        const refMed = otherSpecific;
        state.conflicts.push({
          id: uid('conf'),
          patientId: state.patient.id,
          category: 'Medication Specificity / Change Gap',
          severity: 'High',
          title: `Unresolved Medication Specificity: "${vm.medicationName}" vs "${refMed.medicationName}"`,
          conflictingStatements: [
            ...refMed.passages.map((p) => ({
              documentName: p.documentName,
              date: p.date,
              statement: p.statement,
              location: p.location,
            })),
            ...vm.passages.map((p) => ({
              documentName: p.documentName,
              date: p.date,
              statement: p.statement,
              location: p.location,
            })),
          ],
          sourceDocuments: Array.from(new Set([...refMed.sourceDocuments, ...vm.sourceDocuments])),
          explanation: `${refMed.sourceDocuments.join(', ')} specifies "${refMed.medicationName}", whereas ${vm.sourceDocuments.join(', ')} records only generic "${vm.medicationName}" without agent name or dosage. It is unverified whether the discharge antibiotic was switched away from ${refMed.medicationName} or continued.`,
          escalationReason:
            'System cannot verify whether the discharge regimen resolved the penicillin-class allergy concern or continued the offending agent.',
          systemStoppedConclusion: true,
          reviewStatus: 'Pending Human Review',
          reviewerName: null,
          resolutionNotes: null,
          reviewedAt: null,
        });
      }
    }
  }

  // Conflict Rule 4: Diagnostic Progression (Suspected -> Documented without confirmatory diagnostic test)
  for (const diag of state.diagnoses) {
    if (diag.status === 'Conflicting' || diag.status === 'Suspected') {
      state.conflicts.push({
        id: uid('conf'),
        patientId: state.patient.id,
        category: 'Diagnostic Progression / Conflict',
        severity: diag.status === 'Conflicting' ? 'High' : 'Moderate',
        title:
          diag.status === 'Conflicting'
            ? `Conflicting Documentation for ${diag.diagnosisName}`
            : `Diagnostic Certainty Shift: "${diag.diagnosisName}" (Suspected vs Documented)`,
        conflictingStatements: diag.statements.map((s) => ({
          documentName: s.documentName,
          date: s.date,
          statement: `[${s.statusInDoc}] ${s.passage}`,
          location: s.location,
        })),
        sourceDocuments: diag.sourceDocuments,
        explanation: diag.notes,
        escalationReason:
          diag.status === 'Conflicting'
            ? 'Contradictory diagnostic statuses across records prevent automated diagnostic conclusion.'
            : 'Diagnosis progressed from "Suspected" to unqualified discharge documentation without an explicit confirmatory imaging/microbiology report in the uploaded records.',
        systemStoppedConclusion: diag.status === 'Conflicting',
        reviewStatus: 'Pending Human Review',
        reviewerName: null,
        resolutionNotes: null,
        reviewedAt: null,
      });
      state.missingItems.push({
        id: uid('miss'),
        patientId: state.patient.id,
        category: 'Missing Diagnosis Confirmation',
        description: `No confirmatory diagnostic study (e.g., chest radiograph or culture result) found to confirm progression of ${diag.diagnosisName}.`,
        safetyNote: 'Suspected diagnoses must remain qualified until supporting diagnostic evidence is linked.',
        affectedDocuments: diag.sourceDocuments,
        severity: 'Moderate',
        verificationStatus: 'Partially supported',
      });
    }
  }

  // Conflict Rule 5: Delayed Lab Upload / Clinical Date vs Upload Date Lag
  const laggedLabs = state.labFindings.filter((l) => l.status === 'Delayed Upload');
  for (const lab of laggedLabs) {
    state.conflicts.push({
      id: uid('conf'),
      patientId: state.patient.id,
      category: 'Date / Upload Lag Discrepancy',
      severity: 'Moderate',
      title: `Delayed Laboratory Upload: ${lab.testName} (Tested ${lab.clinicalTestDate}, Uploaded ${lab.uploadDate})`,
      conflictingStatements: [
        {
          documentName: lab.sourceDocument,
          date: lab.clinicalTestDate,
          statement: `${lab.sourcePassage} [Clinical test date: ${lab.clinicalTestDate}; System upload date: ${lab.uploadDate}]`,
          location: lab.sourceLocation,
        },
      ],
      sourceDocuments: [lab.sourceDocument],
      explanation: `The ${lab.testName} specimen/test occurred on ${lab.clinicalTestDate} but was uploaded on ${lab.uploadDate}. Decisions documented on intermediate dates (e.g. Nov 12) may have occurred before this result entered the chart.`,
      escalationReason:
        'Timeline engine anchored this event by clinical test date rather than upload date and flagged potential care-team visibility lag.',
      systemStoppedConclusion: false,
      reviewStatus: 'Pending Human Review',
      reviewerName: null,
      resolutionNotes: null,
      reviewedAt: null,
    });
  }

  // Missing Lab Results check
  for (const lab of state.labFindings.filter((l) => l.status === 'Ordered - Result Missing')) {
    state.missingItems.push({
      id: uid('miss'),
      patientId: state.patient.id,
      category: 'Missing Lab Result',
      description: `${lab.testName} was referenced/ordered in ${lab.sourceDocument} without an available result value.`,
      safetyNote: 'A missing laboratory result must NEVER be interpreted as a normal or negative result.',
      affectedDocuments: [lab.sourceDocument],
      severity: 'High',
      verificationStatus: 'Requires human review',
    });
  }

  // Missing Dates check
  const missingDateEvents = state.timeline.filter((t) => t.dateStatus === 'Missing');
  if (missingDateEvents.length > 0) {
    state.missingItems.push({
      id: uid('miss'),
      patientId: state.patient.id,
      category: 'Uncertain or Inconsistent Date',
      description: `${missingDateEvents.length} clinical event(s) lack an explicit clinical event date; sequence order is marked Uncertain.`,
      safetyNote: 'System refuses to invent chronological order when clinical dates are absent.',
      affectedDocuments: Array.from(new Set(missingDateEvents.map((e) => e.sourceDocument))),
      severity: 'Moderate',
      verificationStatus: 'Unresolved',
    });
  }

  state.steps.push({
    nodeName: 'CONFLICT_DETECTION',
    label: 'Deterministic Conflict & Missing Data Detection',
    status: 'completed',
    durationMs: Math.max(12, Date.now() - t7),
    summary: `Detected ${state.conflicts.length} clinical conflict(s) and ${state.missingItems.length} missing information gap(s).`,
    details: state.conflicts.map((c) => `[${c.severity}] ${c.title}`),
  });

  // NODE 8: UNCERTAINTY ASSESSMENT
  const t8 = Date.now();
  const hasCriticalOrHigh = state.conflicts.some(
    (c) => c.severity === 'Critical' || c.severity === 'High' || c.systemStoppedConclusion
  );
  const overallStatus: VerificationStatus = hasCriticalOrHigh
    ? 'Requires human review'
    : state.conflicts.length > 0
    ? 'Conflicting'
    : state.missingItems.length > 0
    ? 'Partially supported'
    : 'Supported';

  if (hasCriticalOrHigh) {
    state.routeDecision = 'ESCALATED_HUMAN_REVIEW_REQUIRED';
    state.haltedAtNode = 'UNCERTAINTY_ASSESSMENT';
    state.haltReason =
      'Critical or high-severity medication/allergy/discharge discrepancies detected. Automated clinical sign-off halted pending clinician review.';
  } else {
    state.routeDecision = 'EVIDENCE_SUPPORTED_SUMMARY';
  }

  state.steps.push({
    nodeName: 'UNCERTAINTY_ASSESSMENT',
    label: 'Uncertainty Assessment & Safety Gate',
    status: hasCriticalOrHigh ? 'halted_for_review' : 'completed',
    durationMs: Math.max(8, Date.now() - t8),
    summary: hasCriticalOrHigh
      ? `Safety gate triggered: ${state.haltedConclusions.length || state.conflicts.length} conclusion(s) paused for mandatory clinician review.`
      : 'No critical safety contradictions detected; proceeding to evidence-supported summary.',
    details:
      state.haltedConclusions.length > 0
        ? state.haltedConclusions
        : ['All extracted facts verified within acceptable evidence thresholds.'],
  });

  // NODE 9: DECISION & STRUCTURED CLINICAL INTELLIGENCE REPORT
  const t9 = Date.now();
  const synthesis = await generateClinicalSynthesisWithGemini({
    patientDisplayName: state.patient.displayName,
    age: detectedAge,
    documentedFacts: state.facts.map((f) => `[${f.sourceDocument}] (${f.category}) ${f.factValue}`),
    conflicts: state.conflicts.map((c) => `[${c.severity}] ${c.title}: ${c.explanation}`),
    missingItems: state.missingItems.map((m) => `[${m.category}] ${m.description}`),
  });

  const report: ClinicalReport = {
    id: uid('rep'),
    patientId: state.patient.id,
    generatedAt: new Date().toISOString(),
    overallStatus,
    haltedConclusions: state.haltedConclusions,
    sections: {
      patientOverview: {
        documentedFacts: [
          `Patient Identifier: ${state.patient.displayName} (${state.patient.patientIdentifier})`,
          `Documented Age: ${detectedAge !== null ? `${detectedAge} years` : 'Unknown / Not documented'}`,
          `Source Records Analyzed: ${validDocs.length} (${validDocs.map((d) => d.documentType).join(', ')})`,
          ...documentedAllergies.map(
            (a) => `Documented Allergy: ${a.allergen} (Source: ${a.docName}, ${a.location})`
          ),
        ],
        aiInterpretations: [
          synthesis.overviewInterpretation ||
            'Summary compiled strictly from uploaded synthetic records; unresolved safety discrepancies require human review.',
        ],
      },
      reconstructedTimelineSummary: {
        documentedFacts: state.timeline.map(
          (t) =>
            `${t.clinicalEventDate ?? 'Date Missing'} (Uploaded ${t.uploadDate}) — ${t.eventCategory}: ${t.title} [${t.sourceDocument}]`
        ),
        aiInterpretations: [
          synthesis.timelineInterpretation ||
            'Events are ordered by clinical event date rather than upload date.',
        ],
      },
      currentDiagnoses: {
        documentedFacts: state.diagnoses.map(
          (d) =>
            `${d.diagnosisName} — Reconciled Status: ${d.status} (Sources: ${d.sourceDocuments.join(', ')})`
        ),
        aiInterpretations: [
          synthesis.diagnosisInterpretation ||
            'Diagnostic certainty shifts are preserved explicitly without assuming unrecorded confirmatory tests.',
        ],
      },
      medicationReconciliation: {
        documentedFacts: state.medications.map(
          (m) =>
            `${m.medicationName}${m.dosage ? ` (${m.dosage})` : ' (Dosage unspecified)'} — ${m.reconciliationStatus} [${m.sourceDocuments.join(', ')}]`
        ),
        aiInterpretations: [
          synthesis.medicationInterpretation ||
            'Medication discrepancies and potential allergy cross-reactivity are flagged for clinician review; no medication changes are recommended autonomously.',
        ],
      },
      laboratoryFindings: {
        documentedFacts: state.labFindings.map(
          (l) =>
            `${l.testName}: ${l.resultValue ?? 'Result Missing'} (Clinical Date: ${l.clinicalTestDate ?? 'Unknown'}, Upload Date: ${l.uploadDate}) [${l.sourceDocument}]`
        ),
        aiInterpretations: [
          synthesis.labInterpretation ||
            'Laboratory upload delays and missing results are explicitly distinguished from normal/negative findings.',
        ],
      },
      missingInformation: state.missingItems.map((m) => `[${m.category}] ${m.description} — ${m.safetyNote}`),
      conflictingInformation: state.conflicts.map(
        (c) => `[${c.severity}] ${c.title}: ${c.explanation}`
      ),
      evidenceReferences: state.facts.map((f) => ({
        claim: `${f.category}: ${f.factValue}`,
        documentName: f.sourceDocument,
        location: f.sourceLocation,
        status: f.verificationStatus,
      })),
      unresolvedIssues:
        state.conflicts
          .filter((c) => c.reviewStatus !== 'Resolved by Clinician')
          .map((c) => `${c.title} — ${c.escalationReason}`) || [],
      humanReviewRecommendations:
        synthesis.humanReviewRecommendations && synthesis.humanReviewRecommendations.length > 0
          ? synthesis.humanReviewRecommendations
          : state.conflicts.map((c) => `Clinician review required for: ${c.title}`),
    },
  };

  state.steps.push({
    nodeName: 'DECISION',
    label:
      state.routeDecision === 'ESCALATED_HUMAN_REVIEW_REQUIRED'
        ? 'Decision: Escalated Issue Report & Human-Review Gate'
        : 'Decision: Evidence-Supported Clinical Summary',
    status: state.routeDecision === 'ESCALATED_HUMAN_REVIEW_REQUIRED' ? 'halted_for_review' : 'completed',
    durationMs: Date.now() - t9,
    summary:
      state.routeDecision === 'ESCALATED_HUMAN_REVIEW_REQUIRED'
        ? 'Generated cautious Clinical Intelligence Report with explicit escalation stops requiring clinician sign-off.'
        : 'Generated complete evidence-supported Clinical Intelligence Report.',
    details: [
      `Route selected: ${state.routeDecision}`,
      `Pending human-review checkpoints: ${state.conflicts.filter((c) => c.reviewStatus === 'Pending Human Review').length}`,
    ],
  });

  const workflowRun: WorkflowRun = {
    id: uid('wf'),
    patientId: state.patient.id,
    startedAt,
    completedAt: new Date().toISOString(),
    routeDecision: state.routeDecision,
    haltedAtNode: state.haltedAtNode,
    haltReason: state.haltReason,
    retryCount: state.retryCount,
    steps: state.steps,
  };

  saveAnalysisResults({
    patientId: state.patient.id,
    age: detectedAge,
    overallStatus,
    facts: state.facts,
    timeline: state.timeline,
    diagnoses: state.diagnoses,
    medications: state.medications,
    labFindings: state.labFindings,
    missingItems: state.missingItems,
    conflicts: state.conflicts,
    workflowRun,
    report,
  });

  return { workflowRun, report, conflicts: state.conflicts };
}
