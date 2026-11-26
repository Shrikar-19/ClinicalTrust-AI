import {
  createPatient,
  deletePatientData,
  getPatientCount,
  insertDocument,
  saveAnalysisResults,
} from '../db/database.ts';
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
  TimelineEvent,
  WorkflowRun,
} from '../types.ts';

export const DEMO_PATIENT_ID = 'pt_rahul_demo';

export const SYNTHETIC_RAHUL_DOCUMENTS: Array<{
  id: string;
  documentName: string;
  documentType: ClinicalDocument['documentType'];
  documentDate: string;
  uploadDate: string;
  rawText: string;
}> = [
  {
    id: 'doc_rahul_01_admission',
    documentName: '01_Admission_Note_Rahul.txt',
    documentType: 'Admission Note',
    documentDate: '2026-11-10',
    uploadDate: '2026-11-10',
    rawText: `[Page 1]
ADMISSION NOTE — SYNTHETIC RESEARCH RECORD
Patient Name: Rahul
Patient ID: SYN-PT-0451
Age: 45 years
Admission Date: 10 November 2026

Chief Complaint & Symptoms:
- Fever (onset 2 days prior to admission)
- Persistent cough
- Generalized weakness

Allergy History:
- Penicillin allergy (documented on intake; prior urticarial reaction reported)

Initial Assessment:
Patient admitted for acute febrile respiratory illness evaluation. Diagnostic laboratory panel ordered.`,
  },
  {
    id: 'doc_rahul_02_lab',
    documentName: '02_Laboratory_Report_Rahul.txt',
    documentType: 'Laboratory Report',
    documentDate: '2026-11-11',
    uploadDate: '2026-11-13',
    rawText: `[Page 1]
LABORATORY REPORT — SYNTHETIC RESEARCH RECORD
Patient: Rahul | ID: SYN-PT-0451 | Age: 45
Clinical Test Date: 11 November 2026
System Upload Date: 13 November 2026

Hematology Findings:
- White Blood Cell (WBC) Count: Elevated white blood cell count (14.8 x 10^9/L; Reference: 4.0-11.0 x 10^9/L)

Pending / Additional Orders:
- Sputum culture ordered; result not available in this report.`,
  },
  {
    id: 'doc_rahul_03_progress',
    documentName: '03_Progress_Note_Rahul.txt',
    documentType: 'Progress Note',
    documentDate: '2026-11-12',
    uploadDate: '2026-11-12',
    rawText: `[Page 1]
INPATIENT PROGRESS NOTE — SYNTHETIC RESEARCH RECORD
Patient: Rahul | ID: SYN-PT-0451
Note Date: 12 November 2026

Clinical Observations:
- Fever reduced compared to admission baseline.
- Cough persists with mild weakness.

Working Diagnosis:
- Suspected pneumonia (awaiting confirmatory diagnostic correlation).`,
  },
  {
    id: 'doc_rahul_04_prescription',
    documentName: '04_Prescription_Rahul.txt',
    documentType: 'Prescription',
    documentDate: '2026-11-12',
    uploadDate: '2026-11-12',
    rawText: `[Page 1]
MEDICATION PRESCRIPTION — SYNTHETIC RESEARCH RECORD
Patient: Rahul | ID: SYN-PT-0451 | Age: 45
Prescription Date: 12 November 2026

Prescribed Medication:
- Amoxicillin (oral beta-lactam antibiotic; dosage and duration not explicitly specified in summary extract)

Prescriber Note:
Initiated empiric oral antibiotic therapy for suspected respiratory infection.`,
  },
  {
    id: 'doc_rahul_05_discharge',
    documentName: '05_Discharge_Summary_Rahul.txt',
    documentType: 'Discharge Summary',
    documentDate: '2026-11-14',
    uploadDate: '2026-11-14',
    rawText: `[Page 1]
DISCHARGE SUMMARY — SYNTHETIC RESEARCH RECORD
Patient: Rahul | ID: SYN-PT-0451 | Age: 45
Discharge Date: 14 November 2026

Final Documented Diagnosis:
- Pneumonia

Discharge Medications:
- Antibiotics (specific agent, dose, and duration not documented)

Allergy Information:
- Not mentioned`,
  },
];

export function seedRahulDemoIfEmpty(forceReset = false): void {
  if (!forceReset && getPatientCount() > 0) {
    return;
  }

  if (forceReset) {
    deletePatientData(DEMO_PATIENT_ID);
  }

  const now = '2026-11-14T16:30:00.000Z';
  const patient: Patient = {
    id: DEMO_PATIENT_ID,
    patientIdentifier: 'SYN-PT-0451',
    displayName: 'Rahul',
    age: 45,
    sex: 'Not Specified',
    isSynthetic: true,
    overallStatus: 'Requires human review',
    createdAt: '2026-11-10T09:00:00.000Z',
    updatedAt: now,
  };
  createPatient(patient);

  for (const d of SYNTHETIC_RAHUL_DOCUMENTS) {
    insertDocument({
      id: d.id,
      patientId: DEMO_PATIENT_ID,
      documentName: d.documentName,
      fileType: 'TXT',
      documentType: d.documentType,
      documentDate: d.documentDate,
      uploadDate: d.uploadDate,
      fileSizeBytes: Buffer.byteLength(d.rawText, 'utf8'),
      pageCount: 1,
      processingStatus: 'Processed',
      extractionStatus: 'Extracted',
      rawText: d.rawText,
      errorMessage: null,
    });
  }

  const facts: ExtractedFact[] = [
    {
      id: 'fact_r1',
      patientId: DEMO_PATIENT_ID,
      documentId: 'doc_rahul_01_admission',
      category: 'Symptom',
      factValue: 'Fever, Cough, Weakness',
      normalizedValue: 'Fever; Cough; Generalized weakness',
      sourceDocument: '01_Admission_Note_Rahul.txt',
      sourceLocation: 'Page 1, Chief Complaint & Symptoms',
      sourcePassage: 'Fever (onset 2 days prior to admission) / Persistent cough / Generalized weakness',
      verificationStatus: 'Verified',
      verificationNotes: 'Verbatim symptoms documented at admission on 10 Nov and corroborated in Progress Note (12 Nov).',
      clinicalEventDate: '2026-11-10',
      supportingPassages: [
        '[01_Admission_Note_Rahul.txt] Fever (onset 2 days prior to admission), Persistent cough, Generalized weakness',
        '[03_Progress_Note_Rahul.txt] Fever reduced compared to admission baseline. Cough persists with mild weakness.',
      ],
      contradictoryPassages: [],
    },
    {
      id: 'fact_r2',
      patientId: DEMO_PATIENT_ID,
      documentId: 'doc_rahul_01_admission',
      category: 'Allergy',
      factValue: 'Penicillin allergy',
      normalizedValue: 'Penicillin',
      sourceDocument: '01_Admission_Note_Rahul.txt',
      sourceLocation: 'Page 1, Allergy History',
      sourcePassage: 'Penicillin allergy (documented on intake; prior urticarial reaction reported)',
      verificationStatus: 'Conflicting',
      verificationNotes:
        'Explicitly documented in Admission Note, omitted ("Not mentioned") in Discharge Summary, and conflicts with Amoxicillin prescription.',
      clinicalEventDate: '2026-11-10',
      supportingPassages: [
        '[01_Admission_Note_Rahul.txt] Penicillin allergy (documented on intake; prior urticarial reaction reported)',
      ],
      contradictoryPassages: [
        '[04_Prescription_Rahul.txt] Amoxicillin (oral beta-lactam antibiotic)',
        '[05_Discharge_Summary_Rahul.txt] Allergy Information: Not mentioned',
      ],
    },
    {
      id: 'fact_r3',
      patientId: DEMO_PATIENT_ID,
      documentId: 'doc_rahul_02_lab',
      category: 'LaboratoryFinding',
      factValue: 'Elevated white blood cell count (14.8 x 10^9/L)',
      normalizedValue: 'WBC Elevated',
      sourceDocument: '02_Laboratory_Report_Rahul.txt',
      sourceLocation: 'Page 1, Hematology Findings',
      sourcePassage: 'White Blood Cell (WBC) Count: Elevated white blood cell count (14.8 x 10^9/L; Reference: 4.0-11.0 x 10^9/L)',
      verificationStatus: 'Partially supported',
      verificationNotes:
        'Clinical test date is 11 Nov 2026, but system upload date is 13 Nov 2026 (2-day upload lag).',
      clinicalEventDate: '2026-11-11',
      supportingPassages: [
        '[02_Laboratory_Report_Rahul.txt] Clinical Test Date: 11 November 2026 | System Upload Date: 13 November 2026',
      ],
      contradictoryPassages: [],
    },
    {
      id: 'fact_r4',
      patientId: DEMO_PATIENT_ID,
      documentId: 'doc_rahul_02_lab',
      category: 'LaboratoryFinding',
      factValue: 'Sputum culture ordered — result not available',
      normalizedValue: 'Sputum culture (Missing Result)',
      sourceDocument: '02_Laboratory_Report_Rahul.txt',
      sourceLocation: 'Page 1, Pending / Additional Orders',
      sourcePassage: 'Sputum culture ordered; result not available in this report.',
      verificationStatus: 'Requires human review',
      verificationNotes: 'Ordered test without available result. Must NOT be interpreted as negative.',
      clinicalEventDate: '2026-11-11',
      supportingPassages: ['[02_Laboratory_Report_Rahul.txt] Sputum culture ordered; result not available in this report.'],
      contradictoryPassages: [],
    },
    {
      id: 'fact_r5',
      patientId: DEMO_PATIENT_ID,
      documentId: 'doc_rahul_03_progress',
      category: 'Diagnosis',
      factValue: 'Suspected pneumonia',
      normalizedValue: 'Pneumonia (Suspected)',
      sourceDocument: '03_Progress_Note_Rahul.txt',
      sourceLocation: 'Page 1, Working Diagnosis',
      sourcePassage: 'Suspected pneumonia (awaiting confirmatory diagnostic correlation).',
      verificationStatus: 'Partially supported',
      verificationNotes: 'Documented as suspected on 12 Nov; upgraded to unqualified "Pneumonia" on 14 Nov Discharge Summary without imaging/culture confirmation.',
      clinicalEventDate: '2026-11-12',
      supportingPassages: [
        '[03_Progress_Note_Rahul.txt] Suspected pneumonia (awaiting confirmatory diagnostic correlation).',
        '[05_Discharge_Summary_Rahul.txt] Final Documented Diagnosis: Pneumonia',
      ],
      contradictoryPassages: [],
    },
    {
      id: 'fact_r6',
      patientId: DEMO_PATIENT_ID,
      documentId: 'doc_rahul_03_progress',
      category: 'Symptom',
      factValue: 'Fever reduced',
      normalizedValue: 'Fever improved',
      sourceDocument: '03_Progress_Note_Rahul.txt',
      sourceLocation: 'Page 1, Clinical Observations',
      sourcePassage: 'Fever reduced compared to admission baseline.',
      verificationStatus: 'Verified',
      verificationNotes: 'Verbatim clinical observation documented on 12 Nov 2026.',
      clinicalEventDate: '2026-11-12',
      supportingPassages: ['[03_Progress_Note_Rahul.txt] Fever reduced compared to admission baseline.'],
      contradictoryPassages: [],
    },
    {
      id: 'fact_r7',
      patientId: DEMO_PATIENT_ID,
      documentId: 'doc_rahul_04_prescription',
      category: 'Medication',
      factValue: 'Amoxicillin prescribed',
      normalizedValue: 'Amoxicillin',
      sourceDocument: '04_Prescription_Rahul.txt',
      sourceLocation: 'Page 1, Prescribed Medication',
      sourcePassage: 'Amoxicillin (oral beta-lactam antibiotic; dosage and duration not explicitly specified in summary extract)',
      verificationStatus: 'Conflicting',
      verificationNotes:
        'CRITICAL: Amoxicillin is a penicillin-class beta-lactam antibiotic prescribed despite Penicillin allergy in Admission Note. Dosage/duration also absent.',
      clinicalEventDate: '2026-11-12',
      supportingPassages: ['[04_Prescription_Rahul.txt] Amoxicillin (oral beta-lactam antibiotic)'],
      contradictoryPassages: [
        '[01_Admission_Note_Rahul.txt] Penicillin allergy (documented on intake; prior urticarial reaction reported)',
      ],
    },
    {
      id: 'fact_r8',
      patientId: DEMO_PATIENT_ID,
      documentId: 'doc_rahul_05_discharge',
      category: 'Diagnosis',
      factValue: 'Pneumonia',
      normalizedValue: 'Pneumonia',
      sourceDocument: '05_Discharge_Summary_Rahul.txt',
      sourceLocation: 'Page 1, Final Documented Diagnosis',
      sourcePassage: 'Final Documented Diagnosis: Pneumonia',
      verificationStatus: 'Partially supported',
      verificationNotes: 'Recorded at discharge (14 Nov), progressing from "Suspected pneumonia" (12 Nov) without documented radiological or microbiological confirmation.',
      clinicalEventDate: '2026-11-14',
      supportingPassages: [
        '[05_Discharge_Summary_Rahul.txt] Final Documented Diagnosis: Pneumonia',
        '[02_Laboratory_Report_Rahul.txt] Elevated white blood cell count (14.8 x 10^9/L)',
      ],
      contradictoryPassages: [],
    },
    {
      id: 'fact_r9',
      patientId: DEMO_PATIENT_ID,
      documentId: 'doc_rahul_05_discharge',
      category: 'Medication',
      factValue: 'Antibiotics (agent and dosage unspecified)',
      normalizedValue: 'Antibiotics (Unspecified)',
      sourceDocument: '05_Discharge_Summary_Rahul.txt',
      sourceLocation: 'Page 1, Discharge Medications',
      sourcePassage: 'Antibiotics (specific agent, dose, and duration not documented)',
      verificationStatus: 'Requires human review',
      verificationNotes:
        'Generic term "Antibiotics" does not clarify whether Amoxicillin was continued or switched after allergy check.',
      clinicalEventDate: '2026-11-14',
      supportingPassages: ['[05_Discharge_Summary_Rahul.txt] Antibiotics (specific agent, dose, and duration not documented)'],
      contradictoryPassages: ['[04_Prescription_Rahul.txt] Amoxicillin'],
    },
    {
      id: 'fact_r10',
      patientId: DEMO_PATIENT_ID,
      documentId: 'doc_rahul_05_discharge',
      category: 'DischargeInfo',
      factValue: 'Allergy information: Not mentioned',
      normalizedValue: 'Missing Allergy Documentation',
      sourceDocument: '05_Discharge_Summary_Rahul.txt',
      sourceLocation: 'Page 1, Allergy Information',
      sourcePassage: 'Allergy Information: Not mentioned',
      verificationStatus: 'Conflicting',
      verificationNotes: 'Omission conflicts with Penicillin allergy documented in Admission Note.',
      clinicalEventDate: '2026-11-14',
      supportingPassages: ['[05_Discharge_Summary_Rahul.txt] Allergy Information: Not mentioned'],
      contradictoryPassages: ['[01_Admission_Note_Rahul.txt] Penicillin allergy'],
    },
  ];

  const timeline: TimelineEvent[] = [
    {
      id: 'tl_r1',
      patientId: DEMO_PATIENT_ID,
      documentId: 'doc_rahul_01_admission',
      clinicalEventDate: '2026-11-10',
      uploadDate: '2026-11-10',
      dateStatus: 'Confirmed',
      eventCategory: 'Admission',
      title: 'Hospital Admission & Allergy Intake',
      description: 'Admitted with fever, persistent cough, and weakness. Penicillin allergy documented on intake.',
      sourceDocument: '01_Admission_Note_Rahul.txt',
      sourceLocation: 'Page 1',
      sourcePassage: 'Admission Date: 10 November 2026 · Fever, Cough, Weakness · Penicillin allergy',
      verificationStatus: 'Verified',
      orderConfidence: 'Chronological',
      sequenceIndex: 1,
    },
    {
      id: 'tl_r2',
      patientId: DEMO_PATIENT_ID,
      documentId: 'doc_rahul_02_lab',
      clinicalEventDate: '2026-11-11',
      uploadDate: '2026-11-13',
      dateStatus: 'Upload Lag Detected',
      eventCategory: 'Laboratory Test',
      title: 'WBC Count Elevated (Delayed Upload: 13 Nov)',
      description:
        'Clinical test performed 11 Nov showing elevated WBC (14.8 x 10^9/L). Sputum culture ordered without result. Uploaded to system 2 days later on 13 Nov.',
      sourceDocument: '02_Laboratory_Report_Rahul.txt',
      sourceLocation: 'Page 1',
      sourcePassage: 'Clinical Test Date: 11 November 2026 · System Upload Date: 13 November 2026',
      verificationStatus: 'Partially supported',
      orderConfidence: 'Chronological',
      sequenceIndex: 2,
    },
    {
      id: 'tl_r3',
      patientId: DEMO_PATIENT_ID,
      documentId: 'doc_rahul_03_progress',
      clinicalEventDate: '2026-11-12',
      uploadDate: '2026-11-12',
      dateStatus: 'Confirmed',
      eventCategory: 'Progress Note',
      title: 'Fever Reduced · Suspected Pneumonia',
      description: 'Clinical note records fever reduction and working diagnosis of suspected pneumonia.',
      sourceDocument: '03_Progress_Note_Rahul.txt',
      sourceLocation: 'Page 1',
      sourcePassage: 'Fever reduced compared to admission baseline. Working Diagnosis: Suspected pneumonia.',
      verificationStatus: 'Supported',
      orderConfidence: 'Chronological',
      sequenceIndex: 3,
    },
    {
      id: 'tl_r4',
      patientId: DEMO_PATIENT_ID,
      documentId: 'doc_rahul_04_prescription',
      clinicalEventDate: '2026-11-12',
      uploadDate: '2026-11-12',
      dateStatus: 'Confirmed',
      eventCategory: 'Medication Change',
      title: 'Amoxicillin Prescribed (Allergy Conflict Flagged)',
      description: 'Oral Amoxicillin prescribed on 12 Nov despite documented Penicillin allergy on 10 Nov Admission Note.',
      sourceDocument: '04_Prescription_Rahul.txt',
      sourceLocation: 'Page 1',
      sourcePassage: 'Prescribed Medication: Amoxicillin',
      verificationStatus: 'Conflicting',
      orderConfidence: 'Chronological',
      sequenceIndex: 4,
    },
    {
      id: 'tl_r5',
      patientId: DEMO_PATIENT_ID,
      documentId: 'doc_rahul_05_discharge',
      clinicalEventDate: '2026-11-14',
      uploadDate: '2026-11-14',
      dateStatus: 'Confirmed',
      eventCategory: 'Discharge',
      title: 'Discharge Summary — Pneumonia & Unspecified Antibiotics',
      description:
        'Discharged with diagnosis "Pneumonia" and generic "Antibiotics". Allergy status omitted ("Not mentioned").',
      sourceDocument: '05_Discharge_Summary_Rahul.txt',
      sourceLocation: 'Page 1',
      sourcePassage: 'Final Documented Diagnosis: Pneumonia · Discharge Medications: Antibiotics · Allergy Information: Not mentioned',
      verificationStatus: 'Requires human review',
      orderConfidence: 'Chronological',
      sequenceIndex: 5,
    },
  ];

  const diagnoses: DiagnosisRecord[] = [
    {
      id: 'diag_r1',
      patientId: DEMO_PATIENT_ID,
      diagnosisName: 'Pneumonia',
      status: 'Suspected',
      firstSeenDate: '2026-11-12',
      latestDate: '2026-11-14',
      sourceDocuments: ['03_Progress_Note_Rahul.txt', '05_Discharge_Summary_Rahul.txt'],
      statements: [
        {
          documentName: '03_Progress_Note_Rahul.txt',
          date: '2026-11-12',
          statusInDoc: 'Suspected',
          passage: 'Suspected pneumonia (awaiting confirmatory diagnostic correlation).',
          location: 'Page 1, Working Diagnosis',
        },
        {
          documentName: '05_Discharge_Summary_Rahul.txt',
          date: '2026-11-14',
          statusInDoc: 'Mentioned / Final Discharge Entry',
          passage: 'Final Documented Diagnosis: Pneumonia',
          location: 'Page 1, Final Documented Diagnosis',
        },
      ],
      verificationStatus: 'Partially supported',
      notes:
        'Initially documented as "Suspected pneumonia" on 12 Nov and recorded as "Pneumonia" at discharge on 14 Nov; no chest imaging or microbiology confirmation is present in the uploaded records.',
    },
  ];

  const medications: MedicationRecord[] = [
    {
      id: 'med_r1',
      patientId: DEMO_PATIENT_ID,
      medicationName: 'Amoxicillin',
      dosage: null,
      frequency: null,
      reconciliationStatus: 'Allergy Cross-Reactivity Alert',
      sourceContext: 'Prescription',
      sourceDocuments: ['04_Prescription_Rahul.txt'],
      passages: [
        {
          documentName: '04_Prescription_Rahul.txt',
          date: '2026-11-12',
          statement: 'Amoxicillin (oral beta-lactam antibiotic; dosage and duration not explicitly specified in summary extract)',
          location: 'Page 1, Prescribed Medication',
        },
      ],
      verificationStatus: 'Conflicting',
      safetyFlag:
        'CRITICAL: Amoxicillin is a penicillin-class antibiotic prescribed despite documented Penicillin allergy in 01_Admission_Note_Rahul.txt. Dosage is also missing.',
    },
    {
      id: 'med_r2',
      patientId: DEMO_PATIENT_ID,
      medicationName: 'Antibiotics (Unspecified Agent)',
      dosage: null,
      frequency: null,
      reconciliationStatus: 'Missing Details',
      sourceContext: 'Discharge Summary',
      sourceDocuments: ['05_Discharge_Summary_Rahul.txt'],
      passages: [
        {
          documentName: '05_Discharge_Summary_Rahul.txt',
          date: '2026-11-14',
          statement: 'Antibiotics (specific agent, dose, and duration not documented)',
          location: 'Page 1, Discharge Medications',
        },
      ],
      verificationStatus: 'Requires human review',
      safetyFlag:
        'Generic "Antibiotics" omits drug name, dose, and duration; cannot confirm whether Amoxicillin was continued or replaced.',
    },
  ];

  const labFindings: LabFinding[] = [
    {
      id: 'lab_r1',
      patientId: DEMO_PATIENT_ID,
      testName: 'White Blood Cell (WBC) Count',
      resultValue: '14.8 x 10^9/L (Elevated)',
      interpretation: 'Elevated white blood cell count (Reference: 4.0-11.0 x 10^9/L)',
      clinicalTestDate: '2026-11-11',
      uploadDate: '2026-11-13',
      status: 'Delayed Upload',
      sourceDocument: '02_Laboratory_Report_Rahul.txt',
      sourceLocation: 'Page 1, Hematology Findings',
      sourcePassage: 'Elevated white blood cell count (14.8 x 10^9/L; Reference: 4.0-11.0 x 10^9/L)',
      verificationStatus: 'Partially supported',
    },
    {
      id: 'lab_r2',
      patientId: DEMO_PATIENT_ID,
      testName: 'Sputum Culture',
      resultValue: null,
      interpretation: 'Ordered without available result (not interpreted as negative)',
      clinicalTestDate: '2026-11-11',
      uploadDate: '2026-11-13',
      status: 'Ordered - Result Missing',
      sourceDocument: '02_Laboratory_Report_Rahul.txt',
      sourceLocation: 'Page 1, Pending / Additional Orders',
      sourcePassage: 'Sputum culture ordered; result not available in this report.',
      verificationStatus: 'Requires human review',
    },
  ];

  const missingItems: MissingInfoItem[] = [
    {
      id: 'miss_r1',
      patientId: DEMO_PATIENT_ID,
      category: 'Missing Allergy Record',
      description: 'Discharge summary lists Allergy Information as "Not mentioned" despite Penicillin allergy recorded at admission.',
      safetyNote: 'A missing allergy record must NEVER be interpreted as absence of allergy.',
      affectedDocuments: ['05_Discharge_Summary_Rahul.txt'],
      severity: 'High',
      verificationStatus: 'Requires human review',
    },
    {
      id: 'miss_r2',
      patientId: DEMO_PATIENT_ID,
      category: 'Missing Medication Details',
      description: 'Amoxicillin prescription (12 Nov) and Discharge "Antibiotics" (14 Nov) lack dosage, route frequency, and duration.',
      safetyNote: 'Unspecified medication details prevent safe medication reconciliation across transitions of care.',
      affectedDocuments: ['04_Prescription_Rahul.txt', '05_Discharge_Summary_Rahul.txt'],
      severity: 'High',
      verificationStatus: 'Requires human review',
    },
    {
      id: 'miss_r3',
      patientId: DEMO_PATIENT_ID,
      category: 'Missing Lab Result',
      description: 'Sputum culture ordered on 11 Nov has no available result in the record set.',
      safetyNote: 'A missing laboratory result must NEVER be interpreted as a normal or negative result.',
      affectedDocuments: ['02_Laboratory_Report_Rahul.txt'],
      severity: 'High',
      verificationStatus: 'Requires human review',
    },
    {
      id: 'miss_r4',
      patientId: DEMO_PATIENT_ID,
      category: 'Missing Diagnosis Confirmation',
      description: 'No chest X-ray or confirmatory microbiology report accompanies the transition from "Suspected pneumonia" to discharge "Pneumonia".',
      safetyNote: 'Diagnostic progression remains partially supported pending confirmatory records.',
      affectedDocuments: ['03_Progress_Note_Rahul.txt', '05_Discharge_Summary_Rahul.txt'],
      severity: 'Moderate',
      verificationStatus: 'Partially supported',
    },
  ];

  const conflicts: ClinicalConflict[] = [
    {
      id: 'conf_r1',
      patientId: DEMO_PATIENT_ID,
      category: 'Medication-Allergy Discrepancy',
      severity: 'Critical',
      title: 'Penicillin Allergy vs Amoxicillin Prescription',
      conflictingStatements: [
        {
          documentName: '01_Admission_Note_Rahul.txt',
          date: '2026-11-10',
          statement: 'Penicillin allergy (documented on intake; prior urticarial reaction reported)',
          location: 'Page 1, Allergy History',
        },
        {
          documentName: '04_Prescription_Rahul.txt',
          date: '2026-11-12',
          statement: 'Amoxicillin (oral beta-lactam antibiotic; dosage and duration not explicitly specified)',
          location: 'Page 1, Prescribed Medication',
        },
      ],
      sourceDocuments: ['01_Admission_Note_Rahul.txt', '04_Prescription_Rahul.txt'],
      explanation:
        'Amoxicillin is an aminopenicillin beta-lactam antibiotic. Prescribing Amoxicillin to a patient with a documented Penicillin allergy poses a serious hypersensitivity risk.',
      escalationReason:
        'System stopped automated medication clearance. Immediate clinician verification is required to confirm whether the allergy was misrecorded, desensitized, or if an alternative non-beta-lactam agent was intended.',
      systemStoppedConclusion: true,
      reviewStatus: 'Pending Human Review',
      reviewerName: null,
      resolutionNotes: null,
      reviewedAt: null,
    },
    {
      id: 'conf_r2',
      patientId: DEMO_PATIENT_ID,
      category: 'Missing Critical Discharge Information',
      severity: 'High',
      title: 'Admission Penicillin Allergy Omitted in Discharge Summary',
      conflictingStatements: [
        {
          documentName: '01_Admission_Note_Rahul.txt',
          date: '2026-11-10',
          statement: 'Penicillin allergy (documented on intake; prior urticarial reaction reported)',
          location: 'Page 1, Allergy History',
        },
        {
          documentName: '05_Discharge_Summary_Rahul.txt',
          date: '2026-11-14',
          statement: 'Allergy Information: Not mentioned',
          location: 'Page 1, Allergy Information',
        },
      ],
      sourceDocuments: ['01_Admission_Note_Rahul.txt', '05_Discharge_Summary_Rahul.txt'],
      explanation:
        'The Admission Note documents a Penicillin allergy, whereas the Discharge Summary records "Not mentioned". Omitting allergies at discharge risks unsafe outpatient prescribing.',
      escalationReason:
        'System halted discharge completeness approval until allergy status is explicitly reconciled in the discharge record.',
      systemStoppedConclusion: true,
      reviewStatus: 'Pending Human Review',
      reviewerName: null,
      resolutionNotes: null,
      reviewedAt: null,
    },
    {
      id: 'conf_r3',
      patientId: DEMO_PATIENT_ID,
      category: 'Medication Specificity / Change Gap',
      severity: 'High',
      title: 'Amoxicillin (12 Nov) vs Generic "Antibiotics" at Discharge (14 Nov)',
      conflictingStatements: [
        {
          documentName: '04_Prescription_Rahul.txt',
          date: '2026-11-12',
          statement: 'Amoxicillin (oral beta-lactam antibiotic)',
          location: 'Page 1, Prescribed Medication',
        },
        {
          documentName: '05_Discharge_Summary_Rahul.txt',
          date: '2026-11-14',
          statement: 'Antibiotics (specific agent, dose, and duration not documented)',
          location: 'Page 1, Discharge Medications',
        },
      ],
      sourceDocuments: ['04_Prescription_Rahul.txt', '05_Discharge_Summary_Rahul.txt'],
      explanation:
        'The Discharge Summary specifies only generic "Antibiotics" without drug name or dosage, making it impossible to verify whether Amoxicillin was continued or switched to a safe alternative.',
      escalationReason:
        'System stopped discharge medication reconciliation due to missing agent identity and dosage.',
      systemStoppedConclusion: true,
      reviewStatus: 'Pending Human Review',
      reviewerName: null,
      resolutionNotes: null,
      reviewedAt: null,
    },
    {
      id: 'conf_r4',
      patientId: DEMO_PATIENT_ID,
      category: 'Diagnostic Progression / Conflict',
      severity: 'Moderate',
      title: 'Diagnostic Certainty Shift: "Suspected pneumonia" (12 Nov) to "Pneumonia" (14 Nov)',
      conflictingStatements: [
        {
          documentName: '03_Progress_Note_Rahul.txt',
          date: '2026-11-12',
          statement: 'Suspected pneumonia (awaiting confirmatory diagnostic correlation).',
          location: 'Page 1, Working Diagnosis',
        },
        {
          documentName: '05_Discharge_Summary_Rahul.txt',
          date: '2026-11-14',
          statement: 'Final Documented Diagnosis: Pneumonia',
          location: 'Page 1, Final Documented Diagnosis',
        },
      ],
      sourceDocuments: ['03_Progress_Note_Rahul.txt', '05_Discharge_Summary_Rahul.txt'],
      explanation:
        'Pneumonia was initially recorded as suspected on 12 Nov and listed as the final diagnosis at discharge on 14 Nov, but no chest radiograph or completed sputum culture appears in the chart.',
      escalationReason:
        'Flagged for clinician verification of diagnostic confirmation evidence.',
      systemStoppedConclusion: false,
      reviewStatus: 'Pending Human Review',
      reviewerName: null,
      resolutionNotes: null,
      reviewedAt: null,
    },
    {
      id: 'conf_r5',
      patientId: DEMO_PATIENT_ID,
      category: 'Date / Upload Lag Discrepancy',
      severity: 'Moderate',
      title: 'Lab Test Date (11 Nov) vs Upload Date (13 Nov) Timeline Discrepancy',
      conflictingStatements: [
        {
          documentName: '02_Laboratory_Report_Rahul.txt',
          date: '2026-11-11',
          statement: 'Clinical Test Date: 11 November 2026 | System Upload Date: 13 November 2026',
          location: 'Page 1, Report Header',
        },
      ],
      sourceDocuments: ['02_Laboratory_Report_Rahul.txt'],
      explanation:
        'The elevated WBC result (14.8 x 10^9/L) was collected on 11 Nov but uploaded on 13 Nov — after the 12 Nov Progress Note and Amoxicillin prescription.',
      escalationReason:
        'Timeline engine separated clinical event date from upload date to preserve true medical chronology.',
      systemStoppedConclusion: false,
      reviewStatus: 'Pending Human Review',
      reviewerName: null,
      resolutionNotes: null,
      reviewedAt: null,
    },
  ];

  const workflowRun: WorkflowRun = {
    id: 'wf_rahul_initial',
    patientId: DEMO_PATIENT_ID,
    startedAt: '2026-11-14T16:29:55.000Z',
    completedAt: now,
    routeDecision: 'ESCALATED_HUMAN_REVIEW_REQUIRED',
    haltedAtNode: 'UNCERTAINTY_ASSESSMENT',
    haltReason:
      'Critical Penicillin-Amoxicillin discrepancy and missing discharge allergy/medication details require clinician review before sign-off.',
    retryCount: 0,
    steps: [
      {
        nodeName: 'DOCUMENT_INGESTION',
        label: 'Document Ingestion & Integrity Check',
        status: 'completed',
        durationMs: 18,
        summary: 'Validated 5 clinical records for synthetic patient Rahul (Age 45).',
        details: SYNTHETIC_RAHUL_DOCUMENTS.map((d) => `${d.documentName} (Clinical: ${d.documentDate}, Upload: ${d.uploadDate})`),
      },
      {
        nodeName: 'DOCUMENT_CLASSIFICATION',
        label: 'Clinical Document Classification',
        status: 'completed',
        durationMs: 14,
        summary: 'Classified Admission Note, Laboratory Report, Progress Note, Prescription, and Discharge Summary.',
        details: SYNTHETIC_RAHUL_DOCUMENTS.map((d) => `${d.documentName} -> ${d.documentType}`),
      },
      {
        nodeName: 'CLINICAL_EXTRACTION',
        label: 'Structured Clinical Extraction & Grounding Check',
        status: 'completed',
        durationMs: 420,
        summary: 'Extracted 10 source-grounded facts and 2 laboratory records with zero fabricated values.',
        details: ['All extracted passages strictly matched against source text.', 'Missing fields preserved as null/unknown.'],
      },
      {
        nodeName: 'TIMELINE_RECONSTRUCTION',
        label: 'Chronological Timeline Reconstruction',
        status: 'completed',
        durationMs: 16,
        summary: 'Reconstructed 5 clinical events (10 Nov – 14 Nov) distinguishing test date (11 Nov) from upload date (13 Nov).',
        details: ['WBC test anchored at 11 Nov clinical date; 2-day upload lag flagged.'],
      },
      {
        nodeName: 'RECONCILIATION',
        label: 'Diagnosis & Medication Reconciliation',
        status: 'completed',
        durationMs: 22,
        summary: 'Reconciled Pneumonia progression (Suspected -> Final) and flagged Penicillin vs Amoxicillin beta-lactam overlap.',
        details: ['Penicillin allergy on 10 Nov crossed against Amoxicillin prescription on 12 Nov.'],
      },
      {
        nodeName: 'EVIDENCE_RETRIEVAL',
        label: 'Cross-Document Evidence Retrieval',
        status: 'completed',
        durationMs: 19,
        summary: 'Mapped supporting and contradictory passages across all 5 documents.',
        details: ['Cross-linked Admission Allergy, Prescription, and Discharge Allergy omission.'],
      },
      {
        nodeName: 'CONFLICT_DETECTION',
        label: 'Deterministic Conflict & Missing Data Detection',
        status: 'completed',
        durationMs: 15,
        summary: 'Detected 5 clinical conflicts (1 Critical, 2 High, 2 Moderate) and 4 missing information items.',
        details: conflicts.map((c) => `[${c.severity}] ${c.title}`),
      },
      {
        nodeName: 'UNCERTAINTY_ASSESSMENT',
        label: 'Uncertainty Assessment & Safety Gate',
        status: 'halted_for_review',
        durationMs: 11,
        summary: 'Safety gate halted automated clearance for medication safety and discharge allergy completeness.',
        details: [
          'Halted conclusion: Amoxicillin safety clearance.',
          'Halted conclusion: Discharge summary allergy & medication completeness.',
        ],
      },
      {
        nodeName: 'DECISION',
        label: 'Decision: Escalated Issue Report & Human-Review Gate',
        status: 'halted_for_review',
        durationMs: 120,
        summary: 'Generated structured Clinical Intelligence Report with explicit escalation stops for clinician review.',
        details: ['Route: ESCALATED_HUMAN_REVIEW_REQUIRED', '5 items queued in Clinical Conflict Center'],
      },
    ],
  };

  const report: ClinicalReport = {
    id: 'rep_rahul_initial',
    patientId: DEMO_PATIENT_ID,
    generatedAt: now,
    overallStatus: 'Requires human review',
    haltedConclusions: [
      'Halted medication safety clearance for Amoxicillin (12 Nov) due to documented Penicillin allergy (10 Nov).',
      'Halted discharge completeness verification due to omitted allergy status and unspecified "Antibiotics" in Discharge Summary (14 Nov).',
    ],
    sections: {
      patientOverview: {
        documentedFacts: [
          'Patient Identifier: Rahul (SYN-PT-0451, Synthetic Research Record)',
          'Age: 45 years (Source: 01_Admission_Note_Rahul.txt, 02_Laboratory_Report_Rahul.txt, 04_Prescription_Rahul.txt, 05_Discharge_Summary_Rahul.txt)',
          'Admission Date: 10 November 2026 | Discharge Date: 14 November 2026',
          'Documented Intake Allergy: Penicillin allergy with prior urticarial reaction (01_Admission_Note_Rahul.txt)',
        ],
        aiInterpretations: [
          'Five fragmented records span a 5-day hospitalization (10–14 Nov). While fever improvement is documented, critical safety gaps prevent automated sign-off.',
        ],
      },
      reconstructedTimelineSummary: {
        documentedFacts: [
          '10 Nov 2026 — Admission: Fever, cough, weakness; Penicillin allergy recorded (01_Admission_Note_Rahul.txt)',
          '11 Nov 2026 (Uploaded 13 Nov 2026) — Laboratory Test: Elevated WBC count 14.8 x 10^9/L; sputum culture ordered without result (02_Laboratory_Report_Rahul.txt)',
          '12 Nov 2026 — Progress Note: Fever reduced; working diagnosis of Suspected pneumonia (03_Progress_Note_Rahul.txt)',
          '12 Nov 2026 — Prescription: Amoxicillin prescribed (04_Prescription_Rahul.txt)',
          '14 Nov 2026 — Discharge Summary: Diagnosis listed as Pneumonia; medications listed as "Antibiotics"; allergy "Not mentioned" (05_Discharge_Summary_Rahul.txt)',
        ],
        aiInterpretations: [
          'The 11 Nov laboratory report entered the system on 13 Nov, indicating a 2-day upload lag relative to clinical decisions made on 12 Nov.',
        ],
      },
      currentDiagnoses: {
        documentedFacts: [
          'Pneumonia — Documented as "Suspected pneumonia" on 12 Nov (Progress Note) and "Pneumonia" at discharge on 14 Nov (Discharge Summary).',
        ],
        aiInterpretations: [
          'Diagnostic progression from suspected to final discharge documentation is partially supported by elevated WBC (14.8 x 10^9/L), but confirmatory chest imaging or sputum culture results are absent from the chart.',
        ],
      },
      medicationReconciliation: {
        documentedFacts: [
          'Amoxicillin — Prescribed 12 Nov (04_Prescription_Rahul.txt); dosage and duration not specified.',
          'Antibiotics (unspecified agent) — Listed at discharge 14 Nov (05_Discharge_Summary_Rahul.txt); agent, dose, and duration omitted.',
        ],
        aiInterpretations: [
          'CRITICAL SAFETY ESCALATION: Amoxicillin is a beta-lactam antibiotic in the penicillin family and conflicts with the documented Penicillin allergy. The system cannot determine whether discharge "Antibiotics" continued Amoxicillin or switched to an alternative.',
        ],
      },
      laboratoryFindings: {
        documentedFacts: [
          'White Blood Cell (WBC) Count: 14.8 x 10^9/L (Elevated; Clinical Test Date: 11 Nov, Upload Date: 13 Nov).',
          'Sputum Culture: Ordered on 11 Nov; result not available in uploaded records.',
        ],
        aiInterpretations: [
          'Missing sputum culture result is explicitly treated as unavailable and must not be interpreted as negative for bacterial pathogens.',
        ],
      },
      missingInformation: missingItems.map((m) => `[${m.category}] ${m.description} — ${m.safetyNote}`),
      conflictingInformation: conflicts.map((c) => `[${c.severity}] ${c.title}: ${c.explanation}`),
      evidenceReferences: facts.map((f) => ({
        claim: `${f.category}: ${f.factValue}`,
        documentName: f.sourceDocument,
        location: f.sourceLocation,
        status: f.verificationStatus,
      })),
      unresolvedIssues: conflicts.map((c) => `${c.title} — ${c.escalationReason}`),
      humanReviewRecommendations: [
        'Verify Penicillin allergy history with patient/admission team and immediately audit the 12 Nov Amoxicillin prescription.',
        'Amend the 14 Nov Discharge Summary to explicitly document the Penicillin allergy status.',
        'Specify exact discharge antibiotic agent, dose, route, and duration instead of generic "Antibiotics".',
        'Retrieve pending sputum culture and any chest imaging reports to confirm the Pneumonia diagnosis.',
      ],
    },
  };

  saveAnalysisResults({
    patientId: DEMO_PATIENT_ID,
    age: 45,
    overallStatus: 'Requires human review',
    facts,
    timeline,
    diagnoses,
    medications,
    labFindings,
    missingItems,
    conflicts,
    workflowRun,
    report,
  });
}
