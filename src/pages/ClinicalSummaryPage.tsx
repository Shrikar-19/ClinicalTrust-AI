import { Download, ShieldAlert } from 'lucide-react';
import { VerificationLabel } from '../components/StatusIndicator';
import type { PatientWorkspaceResponse } from '../types/clinical';
import { exportClinicalReportToPdf } from '../utils/pdfExport';

interface ClinicalSummaryPageProps {
  workspace: PatientWorkspaceResponse | null;
  isLoading: boolean;
}

function DualSection({
  title,
  documentedFacts,
  aiInterpretations,
}: {
  title: string;
  documentedFacts: string[];
  aiInterpretations: string[];
}) {
  return (
    <section className="p-6 bg-white border border-slate-200 rounded-xl space-y-4">
      <h2 className="font-display text-base font-semibold text-slate-900">{title}</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
          <p className="text-xs font-semibold text-slate-800">
            Documented Source Facts (Traceable)
          </p>
          {documentedFacts.length === 0 ? (
            <p className="text-xs text-slate-500">No documented facts recorded.</p>
          ) : (
            <ul className="space-y-1.5 text-xs text-slate-700 list-disc pl-4 leading-relaxed">
              {documentedFacts.map((fact, idx) => (
                <li key={idx}>{fact}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="p-4 bg-teal-50/40 border border-teal-200 rounded-lg space-y-2">
          <p className="text-xs font-semibold text-teal-900">
            AI Analytical Commentary (Non-Diagnostic)
          </p>
          {aiInterpretations.length === 0 ? (
            <p className="text-xs text-slate-500">No additional commentary.</p>
          ) : (
            <ul className="space-y-1.5 text-xs text-slate-800 list-disc pl-4 leading-relaxed">
              {aiInterpretations.map((note, idx) => (
                <li key={idx}>{note}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

export function ClinicalSummaryPage({ workspace, isLoading }: ClinicalSummaryPageProps) {
  if (isLoading) {
    return <div className="h-96 bg-white border border-slate-200 rounded-xl animate-pulse" />;
  }

  if (!workspace || !workspace.report) {
    return (
      <div className="p-10 bg-white border border-slate-200 rounded-xl text-center">
        <p className="text-sm font-medium text-slate-700">No Clinical Intelligence Report generated yet.</p>
        <p className="text-xs text-slate-500 mt-1">
          Click "Run Agentic Analysis" in the top bar to generate the structured report.
        </p>
      </div>
    );
  }

  const { patient, report } = workspace;
  const { sections } = report;

  return (
    <div className="space-y-6">
      {/* Header & Export PDF */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
              Clinical Intelligence Report
            </h1>
            <VerificationLabel status={report.overallStatus} />
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Patient: {patient.displayName} ({patient.patientIdentifier}) · Generated{' '}
            <span className="font-mono">{new Date(report.generatedAt).toLocaleString()}</span> · Research Prototype
          </p>
        </div>

        <button
          type="button"
          onClick={() => exportClinicalReportToPdf(patient, report)}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
        >
          <Download className="w-4 h-4" />
          <span>Export Report as PDF</span>
        </button>
      </div>

      {/* Halted Conclusions Escalation Alert */}
      {report.haltedConclusions.length > 0 && (
        <section className="p-5 bg-red-50/70 border border-red-200 rounded-xl space-y-2">
          <div className="flex items-center gap-2 text-red-900">
            <ShieldAlert className="w-5 h-5 text-red-700 shrink-0" />
            <h2 className="font-display text-sm font-semibold">
              System Safety Stops — Conclusions Halted Pending Human Review
            </h2>
          </div>
          <ul className="space-y-1 text-xs text-red-900 list-disc pl-6">
            {report.haltedConclusions.map((stop, idx) => (
              <li key={idx}>{stop}</li>
            ))}
          </ul>
        </section>
      )}

      <DualSection
        title="01. Patient Overview"
        documentedFacts={sections.patientOverview.documentedFacts}
        aiInterpretations={sections.patientOverview.aiInterpretations}
      />

      <DualSection
        title="02. Reconstructed Medical Timeline"
        documentedFacts={sections.reconstructedTimelineSummary.documentedFacts}
        aiInterpretations={sections.reconstructedTimelineSummary.aiInterpretations}
      />

      <DualSection
        title="03. Current Documented Diagnoses"
        documentedFacts={sections.currentDiagnoses.documentedFacts}
        aiInterpretations={sections.currentDiagnoses.aiInterpretations}
      />

      <DualSection
        title="04. Medication Reconciliation"
        documentedFacts={sections.medicationReconciliation.documentedFacts}
        aiInterpretations={sections.medicationReconciliation.aiInterpretations}
      />

      <DualSection
        title="05. Laboratory Findings"
        documentedFacts={sections.laboratoryFindings.documentedFacts}
        aiInterpretations={sections.laboratoryFindings.aiInterpretations}
      />

      {/* Sections 6 & 7: Missing & Conflicting Information */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="p-6 bg-white border border-slate-200 rounded-xl space-y-3">
          <h2 className="font-display text-base font-semibold text-slate-900">
            06. Missing Information
          </h2>
          {sections.missingInformation.length === 0 ? (
            <p className="text-xs text-slate-500">None detected.</p>
          ) : (
            <ul className="space-y-2 text-xs text-slate-700 list-disc pl-4 leading-relaxed">
              {sections.missingInformation.map((item, idx) => (
                <li key={idx}>{item}</li>
              ))}
            </ul>
          )}
        </section>

        <section className="p-6 bg-white border border-slate-200 rounded-xl space-y-3">
          <h2 className="font-display text-base font-semibold text-slate-900">
            07. Conflicting Information
          </h2>
          {sections.conflictingInformation.length === 0 ? (
            <p className="text-xs text-slate-500">No conflicting records detected.</p>
          ) : (
            <ul className="space-y-2 text-xs text-red-900 list-disc pl-4 leading-relaxed">
              {sections.conflictingInformation.map((item, idx) => (
                <li key={idx}>{item}</li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Section 8: Evidence References */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="font-display text-base font-semibold text-slate-900">
            08. Evidence References
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-medium">
                <th className="py-2.5 px-6">Extracted Clinical Claim</th>
                <th className="py-2.5 px-4">Source Document</th>
                <th className="py-2.5 px-4">Location</th>
                <th className="py-2.5 px-6">Verification Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {sections.evidenceReferences.map((ref, idx) => (
                <tr key={idx}>
                  <td className="py-2.5 px-6 text-slate-800 font-medium">{ref.claim}</td>
                  <td className="py-2.5 px-4 text-slate-600">{ref.documentName}</td>
                  <td className="py-2.5 px-4 font-mono text-slate-500">{ref.location}</td>
                  <td className="py-2.5 px-6">
                    <VerificationLabel status={ref.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Sections 9 & 10: Unresolved Issues & Human-Review Recommendations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="p-6 bg-white border border-slate-200 rounded-xl space-y-3">
          <h2 className="font-display text-base font-semibold text-slate-900">
            09. Unresolved Issues
          </h2>
          {sections.unresolvedIssues.length === 0 ? (
            <p className="text-xs text-slate-500">All flagged issues have been resolved by a clinician.</p>
          ) : (
            <ul className="space-y-2 text-xs text-slate-700 list-disc pl-4 leading-relaxed">
              {sections.unresolvedIssues.map((issue, idx) => (
                <li key={idx}>{issue}</li>
              ))}
            </ul>
          )}
        </section>

        <section className="p-6 bg-white border border-slate-200 rounded-xl space-y-3">
          <h2 className="font-display text-base font-semibold text-slate-900">
            10. Human-Review Recommendations
          </h2>
          {sections.humanReviewRecommendations.length === 0 ? (
            <p className="text-xs text-slate-500">No clinician follow-up actions listed.</p>
          ) : (
            <ul className="space-y-2 text-xs text-slate-700 list-disc pl-4 leading-relaxed">
              {sections.humanReviewRecommendations.map((rec, idx) => (
                <li key={idx}>{rec}</li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
