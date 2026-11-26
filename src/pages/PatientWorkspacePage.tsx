import {
  AlertTriangle,
  Calendar,
  Clock,
  Download,
  Eye,
  FileText,
  FlaskConical,
  Pill,
  ShieldAlert,
  Stethoscope,
  Trash2,
  Upload,
} from 'lucide-react';
import { useState } from 'react';
import { SeverityLabel, VerificationLabel } from '../components/StatusIndicator';
import type { ClinicalDocument, PatientWorkspaceResponse } from '../types/clinical';

interface PatientWorkspacePageProps {
  workspace: PatientWorkspaceResponse | null;
  isLoading: boolean;
  onOpenUpload: () => void;
  onDeletePatient: (patientId: string) => void;
  onOpenConflictCenter: () => void;
}

export function PatientWorkspacePage({
  workspace,
  isLoading,
  onOpenUpload,
  onDeletePatient,
  onOpenConflictCenter,
}: PatientWorkspacePageProps) {
  const [selectedDoc, setSelectedDoc] = useState<ClinicalDocument | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (isLoading) {
    return <div className="h-96 bg-white border border-slate-200 rounded-xl animate-pulse" />;
  }

  if (!workspace) {
    return (
      <div className="p-10 bg-white border border-slate-200 rounded-xl text-center">
        <p className="text-sm font-medium text-slate-700">No active patient selected.</p>
        <p className="text-xs text-slate-500 mt-1">Upload documents or select a patient from the sidebar.</p>
      </div>
    );
  }

  const { patient, documents, timeline, diagnoses, medications, labFindings, missingItems, conflicts } = workspace;
  const pendingConflicts = conflicts.filter((c) => c.reviewStatus !== 'Resolved by Clinician');

  return (
    <div className="space-y-6">
      {/* Patient Overview Header */}
      <section className="p-6 bg-white border border-slate-200 rounded-xl flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-2xl font-bold text-slate-900">{patient.displayName}</h1>
            <VerificationLabel status={patient.overallStatus} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="font-mono">{patient.patientIdentifier}</span>
            <span aria-hidden="true">·</span>
            <span>Age: {patient.age ?? 'Not documented'}</span>
            <span aria-hidden="true">·</span>
            <span>{documents.length} Document(s)</span>
            <span aria-hidden="true">·</span>
            <span>{pendingConflicts.length} Pending Review(s)</span>
            <span aria-hidden="true">·</span>
            <span>Synthetic Research Record</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {pendingConflicts.length > 0 && (
            <button
              type="button"
              onClick={onOpenConflictCenter}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 hover:bg-red-100 rounded-lg transition-colors whitespace-nowrap"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>{pendingConflicts.length} Escalated Issue(s)</span>
            </button>
          )}
          <button
            type="button"
            onClick={onOpenUpload}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-teal-800 bg-teal-50 border border-teal-200 hover:bg-teal-100 rounded-lg transition-colors whitespace-nowrap"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Add Documents</span>
          </button>

          {!confirmDelete ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 hover:text-red-700 hover:border-red-200 rounded-lg transition-colors whitespace-nowrap"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Patient Data</span>
            </button>
          ) : (
            <div className="inline-flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setConfirmDelete(false);
                  onDeletePatient(patient.id);
                }}
                className="px-3 py-2 text-xs font-semibold text-white bg-red-700 hover:bg-red-800 rounded-lg transition-colors whitespace-nowrap"
              >
                Confirm Delete
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Document List & Raw Text Preview */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-teal-700" />
            <h2 className="font-display text-base font-semibold text-slate-900">
              Source Clinical Documents
            </h2>
          </div>
          <span className="text-xs text-slate-500">
            Clinical dates are tracked separately from system upload dates
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                <th className="py-3 px-6">Document Name</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Clinical Date</th>
                <th className="py-3 px-4">Upload Date</th>
                <th className="py-3 px-4">Processing</th>
                <th className="py-3 px-4">Extraction</th>
                <th className="py-3 px-6 text-right">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs sm:text-sm">
              {documents.map((doc) => {
                const isDelayed =
                  doc.documentDate && doc.uploadDate && doc.uploadDate > doc.documentDate;
                return (
                  <tr key={doc.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-6">
                      <div className="font-medium text-slate-900">{doc.documentName}</div>
                      <div className="text-xs text-slate-500">
                        {doc.fileType} · {doc.pageCount} page(s) · {(doc.fileSizeBytes / 1024).toFixed(1)} KB
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-700">{doc.documentType}</td>
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-700">
                      {doc.documentDate ?? 'Not specified'}
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-700">
                      <span>{doc.uploadDate}</span>
                      {isDelayed && (
                        <span className="block text-xs font-sans font-medium text-amber-700">
                          Delayed upload
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-700">{doc.processingStatus}</td>
                    <td className="py-3 px-4 text-slate-700">{doc.extractionStatus}</td>
                    <td className="py-3 px-6 text-right">
                      <div className="inline-flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setSelectedDoc(selectedDoc?.id === doc.id ? null : doc)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:underline whitespace-nowrap"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>{selectedDoc?.id === doc.id ? 'Hide Text' : 'View Source'}</span>
                        </button>
                        {doc.id.startsWith('doc_rahul_') && (
                          <a
                            href={`/api/demo/sample-files/${doc.id}`}
                            className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 whitespace-nowrap"
                            title="Download sample TXT record"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {selectedDoc && (
          <div className="p-6 bg-slate-50 border-t border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-800">
                Extracted Plain Text — {selectedDoc.documentName}
              </span>
              <button
                type="button"
                onClick={() => setSelectedDoc(null)}
                className="text-xs text-slate-500 hover:text-slate-900"
              >
                Close
              </button>
            </div>
            <pre className="p-4 bg-white border border-slate-200 rounded-lg text-xs font-mono text-slate-800 whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
              {selectedDoc.rawText}
            </pre>
          </div>
        )}
      </section>

      {/* Reconstructed Patient Timeline */}
      <section className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-5">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-teal-700" />
            <h2 className="font-display text-base font-semibold text-slate-900">
              Reconstructed Chronological Patient Timeline
            </h2>
          </div>
          <span className="text-xs text-slate-500">
            Ordered strictly by Clinical Event Date · Missing dates are never fabricated
          </span>
        </div>

        {timeline.length === 0 ? (
          <p className="text-sm text-slate-500">No timeline events extracted yet.</p>
        ) : (
          <ol className="relative space-y-4">
            {timeline.map((event) => (
              <li
                key={event.id}
                className="p-4 border border-slate-200 rounded-lg bg-slate-50/40 flex flex-col lg:flex-row lg:items-start justify-between gap-4"
              >
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="font-mono tabular-nums font-semibold text-slate-900">
                      {event.clinicalEventDate ?? 'Clinical Date Missing'}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>Uploaded {event.uploadDate}</span>
                    <span aria-hidden="true">·</span>
                    <span>{event.eventCategory}</span>
                    {event.dateStatus === 'Upload Lag Detected' && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="inline-flex items-center gap-1 font-medium text-amber-700">
                          <Clock className="w-3 h-3" />
                          Upload Lag Detected
                        </span>
                      </>
                    )}
                    {event.orderConfidence === 'Uncertain Order' && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-semibold text-red-700">Uncertain Chronological Order</span>
                      </>
                    )}
                  </div>

                  <h3 className="text-sm font-semibold text-slate-900">{event.title}</h3>
                  <p className="text-xs text-slate-700 leading-relaxed">{event.description}</p>
                  <p className="text-xs text-slate-500 font-mono">
                    Source: {event.sourceDocument} ({event.sourceLocation}) — "{event.sourcePassage}"
                  </p>
                </div>

                <div className="shrink-0">
                  <VerificationLabel status={event.verificationStatus} />
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* Diagnoses & Medications Split */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Diagnoses Reconciliation */}
        <section className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Stethoscope className="w-4 h-4 text-teal-700" />
            <h2 className="font-display text-base font-semibold text-slate-900">
              Diagnosis Reconciliation
            </h2>
          </div>

          {diagnoses.length === 0 ? (
            <p className="text-sm text-slate-500">No diagnoses extracted.</p>
          ) : (
            <div className="space-y-4">
              {diagnoses.map((diag) => (
                <div key={diag.id} className="p-4 border border-slate-200 rounded-lg space-y-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">{diag.diagnosisName}</h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Reconciled Status: <span className="font-medium text-slate-800">{diag.status}</span> · First seen{' '}
                        <span className="font-mono">{diag.firstSeenDate ?? 'Unknown'}</span>
                      </p>
                    </div>
                    <VerificationLabel status={diag.verificationStatus} />
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">{diag.notes}</p>
                  <div className="pt-2 border-t border-slate-100 space-y-1.5">
                    {diag.statements.map((st, idx) => (
                      <div key={idx} className="text-xs text-slate-600">
                        <span className="font-medium text-slate-800">{st.documentName}</span>{' '}
                        <span className="font-mono text-slate-500">({st.date ?? 'No Date'})</span>: "{st.passage}"
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Medication Reconciliation */}
        <section className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Pill className="w-4 h-4 text-teal-700" />
            <h2 className="font-display text-base font-semibold text-slate-900">
              Medication Reconciliation
            </h2>
          </div>

          {medications.length === 0 ? (
            <p className="text-sm text-slate-500">No medications extracted.</p>
          ) : (
            <div className="space-y-4">
              {medications.map((med) => (
                <div
                  key={med.id}
                  className={`p-4 border rounded-lg space-y-2 ${
                    med.verificationStatus === 'Conflicting'
                      ? 'border-red-200 bg-red-50/40'
                      : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">{med.medicationName}</h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {med.reconciliationStatus} · Dosage: {med.dosage ?? 'Not documented'}
                      </p>
                    </div>
                    <VerificationLabel status={med.verificationStatus} />
                  </div>
                  {med.safetyFlag && (
                    <p className="text-xs font-medium text-red-700 leading-relaxed">
                      {med.safetyFlag}
                    </p>
                  )}
                  <div className="pt-2 border-t border-slate-200/70 space-y-1">
                    {med.passages.map((p, idx) => (
                      <div key={idx} className="text-xs text-slate-600">
                        <span className="font-medium text-slate-800">{p.documentName}</span>{' '}
                        <span className="font-mono text-slate-500">({p.date ?? 'No Date'})</span>: "{p.statement}"
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Laboratory Findings & Missing Information */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <section className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <FlaskConical className="w-4 h-4 text-teal-700" />
            <h2 className="font-display text-base font-semibold text-slate-900">
              Laboratory Findings
            </h2>
          </div>

          {labFindings.length === 0 ? (
            <p className="text-sm text-slate-500">No laboratory findings documented.</p>
          ) : (
            <div className="space-y-3">
              {labFindings.map((lab) => (
                <div key={lab.id} className="p-4 border border-slate-200 rounded-lg space-y-1.5">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-sm font-semibold text-slate-900">{lab.testName}</h3>
                    <VerificationLabel status={lab.verificationStatus} />
                  </div>
                  <p className="text-xs font-mono text-slate-800">
                    Result: {lab.resultValue ?? 'Result Unavailable (Ordered without result)'}
                  </p>
                  <p className="text-xs text-slate-600">{lab.interpretation}</p>
                  <p className="text-xs text-slate-500">
                    Clinical Test Date: <span className="font-mono">{lab.clinicalTestDate ?? 'Unknown'}</span> · Upload Date:{' '}
                    <span className="font-mono">{lab.uploadDate}</span> · Source: {lab.sourceDocument}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <h2 className="font-display text-base font-semibold text-slate-900">
              Missing Information Registry
            </h2>
          </div>

          {missingItems.length === 0 ? (
            <p className="text-sm text-slate-500">No missing clinical gaps detected.</p>
          ) : (
            <div className="space-y-3">
              {missingItems.map((item) => (
                <div key={item.id} className="p-4 border border-slate-200 rounded-lg space-y-1.5">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-sm font-semibold text-slate-900">{item.category}</h3>
                    <SeverityLabel severity={item.severity} />
                  </div>
                  <p className="text-xs text-slate-700 leading-relaxed">{item.description}</p>
                  <p className="text-xs font-medium text-amber-800">{item.safetyNote}</p>
                  <p className="text-xs text-slate-500">
                    Affected: {item.affectedDocuments.join(', ')}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
