import type {
  ClinicalConflict,
  DashboardSummaryResponse,
  Patient,
  PatientWorkspaceResponse,
} from '../types/clinical';

async function handleResponse<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  }
  return data as T;
}

export async function fetchDashboard(): Promise<DashboardSummaryResponse> {
  const res = await fetch('/api/dashboard');
  return handleResponse<DashboardSummaryResponse>(res);
}

export async function fetchPatients(): Promise<Patient[]> {
  const res = await fetch('/api/patients');
  const data = await handleResponse<{ patients: Patient[] }>(res);
  return data.patients;
}

export async function createPatientRecord(payload: {
  displayName: string;
  patientIdentifier?: string;
  age?: number | null;
  sex?: string | null;
}): Promise<Patient> {
  const res = await fetch('/api/patients', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await handleResponse<{ patient: Patient }>(res);
  return data.patient;
}

export async function fetchPatientWorkspace(patientId: string): Promise<PatientWorkspaceResponse> {
  const res = await fetch(`/api/patients/${encodeURIComponent(patientId)}/workspace`);
  return handleResponse<PatientWorkspaceResponse>(res);
}

export async function deletePatientRecord(patientId: string): Promise<void> {
  const res = await fetch(`/api/patients/${encodeURIComponent(patientId)}`, {
    method: 'DELETE',
  });
  await handleResponse<{ deleted: boolean }>(res);
}

export async function uploadPatientDocuments(
  patientId: string,
  files: File[],
  uploadDate?: string
): Promise<{ warnings: string[] }> {
  const form = new FormData();
  for (const file of files) {
    form.append('documents', file);
  }
  if (uploadDate) {
    form.append('uploadDate', uploadDate);
  }

  const res = await fetch(`/api/patients/${encodeURIComponent(patientId)}/documents`, {
    method: 'POST',
    body: form,
  });
  return handleResponse<{ warnings: string[] }>(res);
}

export async function runPatientAnalysis(patientId: string): Promise<PatientWorkspaceResponse> {
  const res = await fetch(`/api/patients/${encodeURIComponent(patientId)}/analyze`, {
    method: 'POST',
  });
  return handleResponse<PatientWorkspaceResponse>(res);
}

export async function resolveClinicalConflict(
  conflictId: string,
  payload: {
    reviewerName: string;
    resolutionNotes: string;
    decision: 'Resolved by Clinician' | 'Escalated';
  }
): Promise<ClinicalConflict> {
  const res = await fetch(`/api/conflicts/${encodeURIComponent(conflictId)}/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await handleResponse<{ conflict: ClinicalConflict }>(res);
  return data.conflict;
}

export async function resetDemoPatient(): Promise<void> {
  const res = await fetch('/api/demo/reset', { method: 'POST' });
  await handleResponse<{ reset: boolean }>(res);
}

export interface SourceFileEntry {
  path: string;
  size: number;
  content: string;
}

export async function fetchProjectSourceFiles(): Promise<{
  projectName: string;
  files: SourceFileEntry[];
}> {
  const res = await fetch('/api/source-files');
  return handleResponse<{ projectName: string; files: SourceFileEntry[] }>(res);
}
