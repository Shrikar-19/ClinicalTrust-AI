import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type { DocumentClassification } from '../types.ts';

const PRIMARY_MODEL = 'gemini-3.5-flash-lite';
const FALLBACK_MODEL = 'gemini-3.8-flash';

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'GEMINI_API_KEY is not configured in server environment secrets. Add it in Settings > Secrets to run AI extraction.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export interface GeminiDocumentExtraction {
  documentId?: string;
  documentType: DocumentClassification;
  documentDate: string | null;
  patientIdentifier: string | null;
  age: number | null;
  sex: string | null;
  facts: Array<{
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
    sourceLocation: string;
    sourcePassage: string;
    clinicalEventDate: string | null;
    explicitlyNegatedOrMissing: boolean;
  }>;
  diagnosesMentioned: Array<{
    name: string;
    statusInDoc: 'Confirmed' | 'Suspected' | 'Ruled Out' | 'Mentioned';
    date: string | null;
    location: string;
    passage: string;
  }>;
  medicationsMentioned: Array<{
    name: string;
    dosage: string | null;
    frequency: string | null;
    context: 'Admission' | 'Prescription' | 'Progress Note' | 'Discharge Summary';
    action: 'Prescribed' | 'Continued' | 'Discontinued' | 'Mentioned';
    location: string;
    passage: string;
  }>;
  allergiesMentioned: Array<{
    allergen: string | null;
    status: 'Documented Allergy' | 'No Known Allergies' | 'Not Mentioned';
    location: string;
    passage: string;
  }>;
  labsMentioned: Array<{
    testName: string;
    resultValue: string | null;
    interpretation: string | null;
    clinicalTestDate: string | null;
    orderedWithoutResult: boolean;
    location: string;
    passage: string;
  }>;
  timelineEvents: Array<{
    clinicalEventDate: string | null;
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
    location: string;
    passage: string;
  }>;
}

const EXTRACTION_SYSTEM_INSTRUCTION = `You are a strict Clinical Information Extraction engine for ClinicalTrust AI.
Extract EVERY clinical detail explicitly present in the document into the JSON schema fields:
1. Extract ONLY facts explicitly stated in the provided medical document text.
2. NEVER invent, infer, or fabricate missing clinical details (if age, dosage, allergy, or date is absent, return null or explicitly record it as Not Mentioned / Missing).
3. A missing allergy mention (or "Not mentioned") MUST NEVER be recorded as "No Known Allergies" — record status as "Not Mentioned" in allergiesMentioned AND add a DischargeInfo/Allergy fact for it.
4. A lab test mentioned as ordered without a result MUST have orderedWithoutResult=true and resultValue=null — NEVER interpret missing results as normal/negative.
5. Distinguish the clinical event date (when the exam/test/event happened) from the upload date. Format dates as YYYY-MM-DD when day, month, and year are known.
6. Every extracted item MUST include an exact verbatim quote from the text in sourcePassage/passage and a sourceLocation (e.g., "Page 1, Line 4" or "Section: Medications").
7. Populate ALL relevant arrays: facts, diagnosesMentioned, medicationsMentioned, allergiesMentioned, labsMentioned, and timelineEvents.`;

function formatFriendlyGeminiError(err: unknown): Error {
  const raw = err instanceof Error ? err.message : String(err);
  try {
    const parsed = JSON.parse(raw) as { error?: { code?: number; message?: string; status?: string } };
    if (parsed?.error?.message) {
      return new Error(`Gemini service notice (${parsed.error.code ?? parsed.error.status ?? 'API'}): ${parsed.error.message}`);
    }
  } catch {
    // Not raw JSON
  }
  if (raw.includes('503') || raw.includes('UNAVAILABLE')) {
    return new Error('Gemini models are temporarily experiencing high demand (503). Please retry in a few moments.');
  }
  return err instanceof Error ? err : new Error(raw);
}

function isTransientError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('503') ||
    msg.includes('UNAVAILABLE') ||
    msg.includes('429') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('DEADLINE_EXCEEDED') ||
    msg.includes('ECONNRESET')
  );
}

/**
 * Executes a Gemini generation call using gemini-3.1-flash-lite first (fast, low latency),
 * with automatic fallback to gemini-4-hydrogen and exponential backoff on transient 503/429 spikes.
 */
async function generateWithModelFallback(
  ai: GoogleGenAI,
  buildRequest: (model: string) => Parameters<typeof ai.models.generateContent>[0]
): Promise<{ text: string; modelUsed: string; retriesUsed: number }> {
  const attempts = [
    { model: PRIMARY_MODEL, delayBeforeMs: 0 },
    { model: PRIMARY_MODEL, delayBeforeMs: 500 },
    { model: FALLBACK_MODEL, delayBeforeMs: 250 },
    { model: FALLBACK_MODEL, delayBeforeMs: 900 },
  ];

  let lastError: unknown;
  let retriesUsed = 0;

  for (let i = 0; i < attempts.length; i++) {
    const { model, delayBeforeMs } = attempts[i];
    if (delayBeforeMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayBeforeMs));
    }
    try {
      const response = await ai.models.generateContent(buildRequest(model));
      return {
        text: (response.text ?? '{}').trim(),
        modelUsed: model,
        retriesUsed,
      };
    } catch (err) {
      lastError = err;
      retriesUsed += 1;
      if (!isTransientError(err) && i === 0) {
        if (attempts[i + 1]?.model === PRIMARY_MODEL) {
          i += 1;
        }
      } else if (!isTransientError(err)) {
        break;
      }
    }
  }

  throw formatFriendlyGeminiError(lastError);
}

const SINGLE_DOCUMENT_SCHEMA = {
  type: Type.OBJECT,
  required: [
    'documentType',
    'documentDate',
    'facts',
    'diagnosesMentioned',
    'medicationsMentioned',
    'allergiesMentioned',
    'labsMentioned',
    'timelineEvents',
  ],
  properties: {
    documentType: {
      type: Type.STRING,
      description:
        'One of: Admission Note, Laboratory Report, Progress Note, Prescription, Discharge Summary, Consultation Note, Unclassified Clinical Record',
    },
    documentDate: { type: Type.STRING, nullable: true },
    patientIdentifier: { type: Type.STRING, nullable: true },
    age: { type: Type.INTEGER, nullable: true },
    sex: { type: Type.STRING, nullable: true },
    facts: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ['category', 'factValue', 'sourceLocation', 'sourcePassage'],
        properties: {
          category: {
            type: Type.STRING,
            enum: [
              'PatientIdentifier',
              'Age',
              'DocumentDate',
              'ClinicalEventDate',
              'Symptom',
              'Diagnosis',
              'DiagnosisStatus',
              'Medication',
              'Dosage',
              'Allergy',
              'LaboratoryFinding',
              'TreatmentChange',
              'DischargeInfo',
            ],
          },
          factValue: { type: Type.STRING },
          normalizedValue: { type: Type.STRING, nullable: true },
          sourceLocation: { type: Type.STRING },
          sourcePassage: { type: Type.STRING },
          clinicalEventDate: { type: Type.STRING, nullable: true },
          explicitlyNegatedOrMissing: { type: Type.BOOLEAN },
        },
      },
    },
    diagnosesMentioned: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ['name', 'statusInDoc', 'location', 'passage'],
        properties: {
          name: { type: Type.STRING },
          statusInDoc: {
            type: Type.STRING,
            enum: ['Confirmed', 'Suspected', 'Ruled Out', 'Mentioned'],
          },
          date: { type: Type.STRING, nullable: true },
          location: { type: Type.STRING },
          passage: { type: Type.STRING },
        },
      },
    },
    medicationsMentioned: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ['name', 'context', 'action', 'location', 'passage'],
        properties: {
          name: { type: Type.STRING },
          dosage: { type: Type.STRING, nullable: true },
          frequency: { type: Type.STRING, nullable: true },
          context: {
            type: Type.STRING,
            enum: ['Admission', 'Prescription', 'Progress Note', 'Discharge Summary'],
          },
          action: {
            type: Type.STRING,
            enum: ['Prescribed', 'Continued', 'Discontinued', 'Mentioned'],
          },
          location: { type: Type.STRING },
          passage: { type: Type.STRING },
        },
      },
    },
    allergiesMentioned: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ['status', 'location', 'passage'],
        properties: {
          allergen: { type: Type.STRING, nullable: true },
          status: {
            type: Type.STRING,
            enum: ['Documented Allergy', 'No Known Allergies', 'Not Mentioned'],
          },
          location: { type: Type.STRING },
          passage: { type: Type.STRING },
        },
      },
    },
    labsMentioned: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ['testName', 'orderedWithoutResult', 'location', 'passage'],
        properties: {
          testName: { type: Type.STRING },
          resultValue: { type: Type.STRING, nullable: true },
          interpretation: { type: Type.STRING, nullable: true },
          clinicalTestDate: { type: Type.STRING, nullable: true },
          orderedWithoutResult: { type: Type.BOOLEAN },
          location: { type: Type.STRING },
          passage: { type: Type.STRING },
        },
      },
    },
    timelineEvents: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ['eventCategory', 'title', 'description', 'location', 'passage'],
        properties: {
          clinicalEventDate: { type: Type.STRING, nullable: true },
          eventCategory: { type: Type.STRING },
          title: { type: Type.STRING },
          description: { type: Type.STRING },
          location: { type: Type.STRING },
          passage: { type: Type.STRING },
        },
      },
    },
  },
};

export async function extractClinicalDocumentWithGemini(params: {
  documentName: string;
  uploadDate: string;
  rawText: string;
}): Promise<{ extraction: GeminiDocumentExtraction; modelUsed: string; retriesUsed: number }> {
  const ai = getAiClient();

  const { text, modelUsed, retriesUsed } = await generateWithModelFallback(ai, (model) => ({
    model,
    contents: `Document Name: ${params.documentName}
System Upload Date: ${params.uploadDate}

--- BEGIN DOCUMENT TEXT ---
${params.rawText}
--- END DOCUMENT TEXT ---

Extract all structured clinical facts (symptoms, allergies, diagnoses, medications, dosages, lab findings, discharge details), diagnosesMentioned, medicationsMentioned, allergiesMentioned, labsMentioned, and timelineEvents strictly grounded in the text above.`,
    config: {
      systemInstruction: EXTRACTION_SYSTEM_INSTRUCTION,
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: 'application/json',
      responseSchema: SINGLE_DOCUMENT_SCHEMA,
    },
  }));

  return {
    extraction: JSON.parse(text) as GeminiDocumentExtraction,
    modelUsed,
    retriesUsed,
  };
}

export async function generateClinicalSynthesisWithGemini(contextSummary: {
  patientDisplayName: string;
  age: number | null;
  documentedFacts: string[];
  conflicts: string[];
  missingItems: string[];
}): Promise<{
  overviewInterpretation: string;
  timelineInterpretation: string;
  diagnosisInterpretation: string;
  medicationInterpretation: string;
  labInterpretation: string;
  humanReviewRecommendations: string[];
  modelUsed: string;
  retriesUsed: number;
}> {
  const ai = getAiClient();

  const { text, modelUsed, retriesUsed } = await generateWithModelFallback(ai, (model) => ({
    model,
    contents: `Patient: ${contextSummary.patientDisplayName}, Age: ${contextSummary.age ?? 'Unknown'}
Documented Facts:
${contextSummary.documentedFacts.map((f) => `- ${f}`).join('\n')}

Detected Conflicts (System Halted Conclusions):
${contextSummary.conflicts.length ? contextSummary.conflicts.map((c) => `- ${c}`).join('\n') : '- None'}

Missing Clinical Information:
${contextSummary.missingItems.length ? contextSummary.missingItems.map((m) => `- ${m}`).join('\n') : '- None'}

Provide cautious, non-prescriptive, evidence-anchored clinical intelligence commentary clearly separating verified facts from uncertainty. Never recommend specific treatment changes or resolve contradictions automatically.`,
    config: {
      systemInstruction:
        'You are an evidence-verification clinical intelligence assistant. Never invent facts, never claim clinical validation, never prescribe or recommend medication changes, and explicitly highlight where conclusions must pause for human clinician review.',
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        required: [
          'overviewInterpretation',
          'timelineInterpretation',
          'diagnosisInterpretation',
          'medicationInterpretation',
          'labInterpretation',
          'humanReviewRecommendations',
        ],
        properties: {
          overviewInterpretation: { type: Type.STRING },
          timelineInterpretation: { type: Type.STRING },
          diagnosisInterpretation: { type: Type.STRING },
          medicationInterpretation: { type: Type.STRING },
          labInterpretation: { type: Type.STRING },
          humanReviewRecommendations: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
        },
      },
    },
  }));

  const parsed = JSON.parse(text) as {
    overviewInterpretation: string;
    timelineInterpretation: string;
    diagnosisInterpretation: string;
    medicationInterpretation: string;
    labInterpretation: string;
    humanReviewRecommendations: string[];
  };

  return { ...parsed, modelUsed, retriesUsed };
}
