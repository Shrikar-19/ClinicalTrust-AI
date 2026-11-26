import { CheckCircle2, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { ReviewStatusLabel, SeverityLabel } from '../components/StatusIndicator';
import { resolveClinicalConflict } from '../services/api';
import type { ClinicalConflict, ConflictSeverity, PatientWorkspaceResponse } from '../types/clinical';

interface ConflictCenterPageProps {
  workspace: PatientWorkspaceResponse | null;
  isLoading: boolean;
  onConflictUpdated: () => void;
}

export function ConflictCenterPage({
  workspace,
  isLoading,
  onConflictUpdated,
}: ConflictCenterPageProps) {
  const [severityFilter, setSeverityFilter] = useState<'All' | ConflictSeverity>('All');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Pending' | 'Resolved'>('All');
  const [activeReviewId, setActiveReviewId] = useState<string | null>(null);
  const [reviewerName, setReviewerName] = useState('');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  if (isLoading) {
    return <div className="h-96 bg-white border border-slate-200 rounded-xl animate-pulse" />;
  }

  if (!workspace) {
    return (
      <div className="p-10 bg-white border border-slate-200 rounded-xl text-center">
        <p className="text-sm text-slate-600">Select a patient record to inspect clinical conflicts.</p>
      </div>
    );
  }

  const filtered = workspace.conflicts.filter((c) => {
    if (severityFilter !== 'All' && c.severity !== severityFilter) return false;
    if (statusFilter === 'Pending' && c.reviewStatus === 'Resolved by Clinician') return false;
    if (statusFilter === 'Resolved' && c.reviewStatus !== 'Resolved by Clinician') return false;
    return true;
  });

  const handleSubmitReview = async (
    conflict: ClinicalConflict,
    decision: 'Resolved by Clinician' | 'Escalated'
  ) => {
    setReviewError(null);
    if (!reviewerName.trim() || !resolutionNotes.trim()) {
      setReviewError('Both clinician name and verification notes are required.');
      return;
    }
    setIsSaving(true);
    try {
      await resolveClinicalConflict(conflict.id, {
        reviewerName: reviewerName.trim(),
        resolutionNotes: resolutionNotes.trim(),
        decision,
      });
      setActiveReviewId(null);
      setReviewerName('');
      setResolutionNotes('');
      onConflictUpdated();
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : 'Failed to save review.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
            Clinical Conflict Center
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Contradictory records, medication-allergy safety discrepancies, and halted conclusions requiring clinician verification.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(['All', 'Pending', 'Resolved'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setStatusFilter(tab)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  statusFilter === tab
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <select
            aria-label="Filter by severity"
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value as 'All' | ConflictSeverity)}
            className="px-3 py-2 text-xs font-medium bg-white border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-600"
          >
            <option value="All">All Severities</option>
            <option value="Critical">Critical</option>
            <option value="High">High</option>
            <option value="Moderate">Moderate</option>
            <option value="Low">Low</option>
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="p-10 bg-white border border-slate-200 rounded-xl text-center">
          <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
          <p className="text-sm font-medium text-slate-800">No matching conflicts in this view</p>
          <p className="text-xs text-slate-500 mt-1">
            Adjust filters above or run the Agentic Clinical Workflow on new documents.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((conflict) => {
            const isReviewing = activeReviewId === conflict.id;
            return (
              <article
                key={conflict.id}
                className={`p-6 bg-white border rounded-xl space-y-4 ${
                  conflict.severity === 'Critical' && conflict.reviewStatus !== 'Resolved by Clinician'
                    ? 'border-red-300'
                    : 'border-slate-200'
                }`}
              >
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span>{conflict.category}</span>
                      <span aria-hidden="true">·</span>
                      <SeverityLabel severity={conflict.severity} />
                      <span aria-hidden="true">·</span>
                      <span>Sources: {conflict.sourceDocuments.join(', ')}</span>
                    </div>
                    <h2 className="font-display text-lg font-semibold text-slate-900 mt-1">
                      {conflict.title}
                    </h2>
                  </div>

                  <div className="shrink-0">
                    <ReviewStatusLabel status={conflict.reviewStatus} />
                  </div>
                </div>

                {/* Conflicting Statements Comparison */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {conflict.conflictingStatements.map((stmt, idx) => (
                    <div key={idx} className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-800">{stmt.documentName}</span>
                        <span className="font-mono text-slate-500">{stmt.date ?? 'Date Missing'}</span>
                      </div>
                      <p className="text-xs text-slate-700 leading-relaxed">"{stmt.statement}"</p>
                      <p className="text-xs text-slate-500 font-mono">{stmt.location}</p>
                    </div>
                  ))}
                </div>

                {/* Explanation & Escalation Stop */}
                <div className="space-y-2 text-xs leading-relaxed">
                  <p className="text-slate-700">
                    <span className="font-semibold text-slate-900">Verification Analysis: </span>
                    {conflict.explanation}
                  </p>
                  <div className="p-3.5 bg-red-50/70 border border-red-200 rounded-lg flex items-start gap-2.5 text-red-900">
                    <ShieldAlert className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold">
                        {conflict.systemStoppedConclusion ? 'System Halted Conclusion: ' : 'Escalation Flag: '}
                      </span>
                      <span>{conflict.escalationReason}</span>
                    </div>
                  </div>
                </div>

                {/* Existing Resolution Record or Interactive Review Action */}
                {conflict.reviewStatus === 'Resolved by Clinician' ? (
                  <div className="p-4 bg-emerald-50/60 border border-emerald-200 rounded-lg text-xs text-emerald-900 space-y-1">
                    <div className="font-semibold">
                      Reviewed & Resolved by {conflict.reviewerName} ·{' '}
                      <span className="font-mono">
                        {conflict.reviewedAt ? new Date(conflict.reviewedAt).toLocaleString() : ''}
                      </span>
                    </div>
                    <p>{conflict.resolutionNotes}</p>
                  </div>
                ) : (
                  <div className="pt-2 border-t border-slate-200">
                    {!isReviewing ? (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveReviewId(conflict.id);
                          setReviewError(null);
                        }}
                        className="px-4 py-2 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors"
                      >
                        Perform Clinician Review
                      </button>
                    ) : (
                      <div className="space-y-3 p-4 bg-slate-50 border border-slate-200 rounded-lg">
                        {reviewError && (
                          <p className="text-xs font-medium text-red-700">{reviewError}</p>
                        )}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">
                              Reviewer Name / Credentials
                            </label>
                            <input
                              type="text"
                              value={reviewerName}
                              onChange={(e) => setReviewerName(e.target.value)}
                              placeholder="e.g., Dr. A. Sharma, MD"
                              className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            Clinical Verification & Reconciliation Notes
                          </label>
                          <textarea
                            rows={2}
                            value={resolutionNotes}
                            onChange={(e) => setResolutionNotes(e.target.value)}
                            placeholder="Document verified allergy status, intended antibiotic regimen, or escalation outcome..."
                            className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                          />
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            disabled={isSaving}
                            onClick={() => handleSubmitReview(conflict, 'Resolved by Clinician')}
                            className="px-3.5 py-2 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 rounded-lg transition-colors"
                          >
                            {isSaving ? 'Saving...' : 'Mark Resolved by Clinician'}
                          </button>
                          <button
                            type="button"
                            disabled={isSaving}
                            onClick={() => handleSubmitReview(conflict, 'Escalated')}
                            className="px-3.5 py-2 text-xs font-medium text-red-700 bg-white border border-red-300 hover:bg-red-50 disabled:opacity-50 rounded-lg transition-colors"
                          >
                            Keep Escalated
                          </button>
                          <button
                            type="button"
                            onClick={() => setActiveReviewId(null)}
                            className="px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
