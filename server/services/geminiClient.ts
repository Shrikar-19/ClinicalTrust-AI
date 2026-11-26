import type { DocumentClassification } from '../types.ts';

const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const LLM_BASE_URL = (env.LLM_BASE_URL || 'http://localhost:11434/v1').replace(/\/$/, '');
const LLM_API_KEY = env.LLM_API_KEY || 'ollama';
const PRIMARY_MODEL = env.LLM_MODEL || 'qwen2.5:3b';
const FALLBACK_MODEL = env.LLM_FALLBACK_MODEL || PRIMARY_MODEL;
const IS_LOCAL_OLLAMA = LLM_BASE_URL.includes('localhost') || LLM_BASE_URL.includes('127.0.0.1');

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
Extract clinical details explicitly stated in the document into a valid JSON object matching this exact schema:
{
  "documentType": "Admission Note | Laboratory Report | Progress Note | Prescription | Discharge Summary | Consultation Note | Unclassified Clinical Record",
  "documentDate": "YYYY-MM-DD or null",
  "patientIdentifier": "string or null",
  "age": "number or null",
  "sex": "string or null",
  "facts": [
    {
      "category": "PatientIdentifier | Age | DocumentDate | ClinicalEventDate | Symptom | Diagnosis | DiagnosisStatus | Medication | Dosage | Allergy | LaboratoryFinding | TreatmentChange | DischargeInfo",
      "factValue": "string",
      "normalizedValue": "string or null",
      "sourceLocation": "string",
      "sourcePassage": "short verbatim quote",
      "clinicalEventDate": "YYYY-MM-DD or null",
      "explicitlyNegatedOrMissing": false
    }
  ],
  "diagnosesMentioned": [
    {
      "name": "string",
      "statusInDoc": "Confirmed | Suspected | Ruled Out | Mentioned",
      "date": "YYYY-MM-DD or null",
      "location": "string",
      "passage": "short verbatim quote"
    }
  ],
  "medicationsMentioned": [
    {
      "name": "string",
      "dosage": "string or null",
      "frequency": "string or null",
      "context": "Admission | Prescription | Progress Note | Discharge Summary",
      "action": "Prescribed | Continued | Discontinued | Mentioned",
      "location": "string",
      "passage": "short verbatim quote"
    }
  ],
  "allergiesMentioned": [
    {
      "allergen": "string or null",
      "status": "Documented Allergy | No Known Allergies | Not Mentioned",
      "location": "string",
      "passage": "short verbatim quote"
    }
  ],
  "labsMentioned": [
    {
      "testName": "string",
      "resultValue": "string or null",
      "interpretation": "string or null",
      "clinicalTestDate": "YYYY-MM-DD or null",
      "orderedWithoutResult": false,
      "location": "string",
      "passage": "short verbatim quote"
    }
  ],
  "timelineEvents": [
    {
      "clinicalEventDate": "YYYY-MM-DD or null",
      "eventCategory": "Admission | Symptom | Laboratory Test | Diagnosis | Medication Change | Progress Note | Discharge",
      "title": "string",
      "description": "concise summary",
      "location": "string",
      "passage": "short verbatim quote"
    }
  ]
}

Rules:
1. Return ONLY raw valid JSON with no markdown fences, commentary, or extra text. All top-level keys must be present (use [] for empty arrays, null for missing scalars).
2. Extract ONLY facts explicitly stated in the text; do not invent or infer missing details.
3. Keep facts[] concise: only record key demographics, symptoms, allergy status, treatment changes, or discharge info not already duplicated across multiple entries.
4. A missing allergy mention must be recorded as "Not Mentioned" in allergiesMentioned (not "No Known Allergies") plus one Allergy fact.
5. A lab ordered without a result must have orderedWithoutResult=true and resultValue=null.
6. Format known dates as YYYY-MM-DD and keep verbatim quotes concise (under 20 words).`;

const SYNTHESIS_SYSTEM_INSTRUCTION = `You are an evidence-verification clinical intelligence assistant. Do not invent facts, claim clinical validation, or recommend medication changes, and highlight where conclusions must pause for human clinician review.
Return ONLY a raw valid JSON object (no markdown fences or commentary) matching this exact schema:
{
  "overviewInterpretation": "string",
  "timelineInterpretation": "string",
  "diagnosisInterpretation": "string",
  "medicationInterpretation": "string",
  "labInterpretation": "string",
  "humanReviewRecommendations": ["string"]
}`;

function cleanJsonResponse(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced) return fenced[1].trim();
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  return trimmed || '{}';
}

function isTransientError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('503') ||
    msg.includes('429') ||
    msg.includes('json_validate_failed') ||
    msg.includes('ECONNRESET') ||
    msg.includes('ETIMEDOUT') ||
    msg.includes('fetch failed')
  );
}

async function callOpenAiCompatibleJson(
  systemInstruction: string,
  userPrompt: string,
  localMaxTokens = 1400
): Promise<{ text: string; modelUsed: string; retriesUsed: number }> {
  const attempts = [
    { model: PRIMARY_MODEL, delayBeforeMs: 0 },
    { model: PRIMARY_MODEL, delayBeforeMs: 500 },
    { model: FALLBACK_MODEL, delayBeforeMs: 400 },
  ];

  let lastError: unknown;
  let retriesUsed = 0;

  for (let i = 0; i < attempts.length; i++) {
    const { model, delayBeforeMs } = attempts[i];
    if (delayBeforeMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayBeforeMs));
    }

    try {
      const requestBody: Record<string, unknown> = {
        model,
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: IS_LOCAL_OLLAMA ? localMaxTokens : 4096,
      };

      if (IS_LOCAL_OLLAMA) {
        requestBody.response_format = { type: 'json_object' };
      }

      const response = await fetch(`${LLM_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${LLM_API_KEY}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`LLM API error (${response.status}): ${errBody}`);
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };

      const rawText = data.choices?.[0]?.message?.content ?? '{}';
      const cleaned = cleanJsonResponse(rawText);
      JSON.parse(cleaned);

      return {
        text: cleaned,
        modelUsed: model,
        retriesUsed,
      };
    } catch (err) {
      lastError = err;
      retriesUsed += 1;
      if (!isTransientError(err)) {
        break;
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`LLM request failed at ${LLM_BASE_URL}: ${String(lastError)}`);
}

export async function extractClinicalDocumentWithGemini(params: {
  documentName: string;
  uploadDate: string;
  rawText: string;
}): Promise<{ extraction: GeminiDocumentExtraction; modelUsed: string; retriesUsed: number }> {
  const userPrompt = `Document Name: ${params.documentName}
System Upload Date: ${params.uploadDate}

--- BEGIN DOCUMENT TEXT ---
${params.rawText}
--- END DOCUMENT TEXT ---

Extract all structured clinical facts, diagnosesMentioned, medicationsMentioned, allergiesMentioned, labsMentioned, and timelineEvents strictly grounded in the text above. Return valid JSON only.`;

  const { text, modelUsed, retriesUsed } = await callOpenAiCompatibleJson(
    EXTRACTION_SYSTEM_INSTRUCTION,
    userPrompt,
    1400
  );

  const parsed = JSON.parse(text) as Partial<GeminiDocumentExtraction>;

  const facts = Array.isArray(parsed.facts)
    ? parsed.facts
      .filter((f) => f && typeof f.factValue === 'string' && f.factValue.trim().length > 0)
      .map((f) => ({
        category: f.category || 'DischargeInfo',
        factValue: f.factValue.trim(),
        normalizedValue: f.normalizedValue ?? null,
        sourceLocation: f.sourceLocation || 'Document Text',
        sourcePassage: f.sourcePassage || f.factValue.trim(),
        clinicalEventDate: f.clinicalEventDate ?? null,
        explicitlyNegatedOrMissing: Boolean(f.explicitlyNegatedOrMissing),
      }))
    : [];

  const diagnosesMentioned = Array.isArray(parsed.diagnosesMentioned)
    ? parsed.diagnosesMentioned
      .filter((d) => d && typeof d.name === 'string' && d.name.trim().length > 0)
      .map((d) => ({
        name: d.name.trim(),
        statusInDoc: d.statusInDoc || 'Mentioned',
        date: d.date ?? null,
        location: d.location || 'Document Text',
        passage: d.passage || d.name.trim(),
      }))
    : [];

  const medicationsMentioned = Array.isArray(parsed.medicationsMentioned)
    ? parsed.medicationsMentioned
      .filter((m) => m && typeof m.name === 'string' && m.name.trim().length > 0)
      .map((m) => ({
        name: m.name.trim(),
        dosage: m.dosage ?? null,
        frequency: m.frequency ?? null,
        context: m.context || 'Progress Note',
        action: m.action || 'Mentioned',
        location: m.location || 'Document Text',
        passage: m.passage || m.name.trim(),
      }))
    : [];

  const allergiesMentioned = Array.isArray(parsed.allergiesMentioned)
    ? parsed.allergiesMentioned
      .filter((a) => a && typeof a === 'object')
      .map((a) => ({
        allergen: a.allergen ?? null,
        status: a.status || 'Not Mentioned',
        location: a.location || 'Document Text',
        passage: a.passage || a.allergen || 'Allergy status not mentioned',
      }))
    : [];

  const labsMentioned = Array.isArray(parsed.labsMentioned)
    ? parsed.labsMentioned
      .map((l) => {
        const raw = l as Record<string, unknown>;
        const resolvedName =
          (typeof raw.testName === 'string' && raw.testName.trim()) ||
          (typeof raw.test_name === 'string' && raw.test_name.trim()) ||
          (typeof raw.name === 'string' && raw.name.trim()) ||
          '';
        return {
          testName: resolvedName,
          resultValue: typeof raw.resultValue === 'string' ? raw.resultValue : null,
          interpretation: typeof raw.interpretation === 'string' ? raw.interpretation : null,
          clinicalTestDate: typeof raw.clinicalTestDate === 'string' ? raw.clinicalTestDate : null,
          orderedWithoutResult: Boolean(raw.orderedWithoutResult),
          location: typeof raw.location === 'string' && raw.location.trim() ? raw.location : 'Document Text',
          passage: typeof raw.passage === 'string' && raw.passage.trim() ? raw.passage : resolvedName,
        };
      })
      .filter((l) => l.testName.length > 0)
    : [];

  const timelineEvents = Array.isArray(parsed.timelineEvents)
    ? parsed.timelineEvents
      .filter((e) => e && typeof e.title === 'string' && e.title.trim().length > 0)
      .map((e) => ({
        clinicalEventDate: e.clinicalEventDate ?? null,
        eventCategory: e.eventCategory || 'Progress Note',
        title: e.title.trim(),
        description: e.description || e.title.trim(),
        location: e.location || 'Document Text',
        passage: e.passage || e.title.trim(),
      }))
    : [];

  const extraction: GeminiDocumentExtraction = {
    documentType: parsed.documentType ?? 'Unclassified Clinical Record',
    documentDate: parsed.documentDate ?? null,
    patientIdentifier: parsed.patientIdentifier ?? null,
    age: typeof parsed.age === 'number' ? parsed.age : null,
    sex: parsed.sex ?? null,
    facts,
    diagnosesMentioned,
    medicationsMentioned,
    allergiesMentioned,
    labsMentioned,
    timelineEvents,
  };

  return { extraction, modelUsed, retriesUsed };
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
  const userPrompt = `Patient: ${contextSummary.patientDisplayName}, Age: ${contextSummary.age ?? 'Unknown'}
Documented Facts:
${contextSummary.documentedFacts.map((f) => `- ${f}`).join('\n')}

Detected Conflicts (System Halted Conclusions):
${contextSummary.conflicts.length ? contextSummary.conflicts.map((c) => `- ${c}`).join('\n') : '- None'}

Missing Clinical Information:
${contextSummary.missingItems.length ? contextSummary.missingItems.map((m) => `- ${m}`).join('\n') : '- None'}

Provide cautious, non-prescriptive, evidence-anchored clinical intelligence commentary clearly separating verified facts from uncertainty. Return valid JSON only.`;

  const { text, modelUsed, retriesUsed } = await callOpenAiCompatibleJson(
    SYNTHESIS_SYSTEM_INSTRUCTION,
    userPrompt,
    900
  );

  const parsed = JSON.parse(text) as Partial<{
    overviewInterpretation: string;
    timelineInterpretation: string;
    diagnosisInterpretation: string;
    medicationInterpretation: string;
    labInterpretation: string;
    humanReviewRecommendations: string[];
  }>;

  return {
    overviewInterpretation: parsed.overviewInterpretation ?? 'Insufficient structured output for overview.',
    timelineInterpretation: parsed.timelineInterpretation ?? 'Insufficient structured output for timeline.',
    diagnosisInterpretation: parsed.diagnosisInterpretation ?? 'Insufficient structured output for diagnoses.',
    medicationInterpretation: parsed.medicationInterpretation ?? 'Insufficient structured output for medications.',
    labInterpretation: parsed.labInterpretation ?? 'Insufficient structured output for labs.',
    humanReviewRecommendations: Array.isArray(parsed.humanReviewRecommendations)
      ? parsed.humanReviewRecommendations
      : ['Clinician review required to verify extracted records.'],
    modelUsed,
    retriesUsed,
  };
}