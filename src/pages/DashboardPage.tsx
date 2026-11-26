import { AlertTriangle, FileText, FolderOpen, FolderTree, RotateCcw, ShieldAlert, Upload } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { VerificationLabel } from '../components/StatusIndicator';
import type { DashboardSummaryResponse } from '../types/clinical';

interface DashboardPageProps {
  dashboard: DashboardSummaryResponse | null;
  isLoading: boolean;
  onSelectPatientAndOpenWorkspace: (patientId: string) => void;
  onOpenConflicts: (patientId: string) => void;
  onOpenUpload: () => void;
  onResetDemo: () => void;
  onOpenSourceExplorer: () => void;
}

const VERIFICATION_COLORS: Record<string, string> = {
  Verified: '#15803d',
  Supported: '#0f766e',
  'Partially supported': '#b45309',
  Conflicting: '#b91c1c',
  'Requires human review': '#dc2626',
  Unresolved: '#64748b',
};

export function DashboardPage({
  dashboard,
  isLoading,
  onSelectPatientAndOpenWorkspace,
  onOpenConflicts,
  onOpenUpload,
  onResetDemo,
  onOpenSourceExplorer,
}: DashboardPageProps) {
  if (isLoading || !dashboard) {
    return (
      <div className="space-y-6">
        <div className="h-24 bg-white border border-slate-200 rounded-xl animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-72 bg-white border border-slate-200 rounded-xl animate-pulse" />
          <div className="h-72 bg-white border border-slate-200 rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  const { metrics, recentAnalyses, verificationDistribution, documentTimelineComparison } = dashboard;

  const kpiItems = [
    { label: 'Total Uploaded Documents', value: metrics.totalDocuments, tone: 'text-slate-900' },
    { label: 'Processed Documents', value: metrics.processedDocuments, tone: 'text-teal-700' },
    { label: 'Detected Conflicts', value: metrics.detectedConflicts, tone: 'text-red-700' },
    { label: 'Missing Information Gaps', value: metrics.missingInformationCount, tone: 'text-amber-700' },
    { label: 'Pending Human Reviews', value: metrics.pendingHumanReviews, tone: 'text-red-700' },
  ];

  return (
    <div className="space-y-6">
      {/* Header & Quick Actions */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
            Clinical Record Verification Overview
          </h1>
          <p className="mt-1 text-sm text-slate-600 max-w-2xl">
            Monitor fragmented medical record ingestion, cross-document conflicts, missing evidence flags, and cases halted for clinician review.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onResetDemo}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
            <span>Restore Demo (Rahul, 45)</span>
          </button>
          <button
            type="button"
            onClick={onOpenUpload}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-teal-800 bg-teal-50 border border-teal-200 hover:bg-teal-100 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload Records</span>
          </button>
        </div>
      </div>

      {/* 5-Column KPI Strip */}
      <section className="bg-white border border-slate-200 rounded-xl grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
        {kpiItems.map((item) => (
          <div key={item.label} className="p-5">
            <p className="text-xs font-medium text-slate-500">{item.label}</p>
            <p className={`mt-2 font-mono tabular-nums text-2xl font-semibold ${item.tone}`}>
              {item.value}
            </p>
          </div>
        ))}
      </section>

      {/* Analytical Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Clinical Event Day vs System Upload Day */}
        <section className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="mb-4">
            <h2 className="font-display text-base font-semibold text-slate-900">
              Clinical Event Date vs. Upload Date Lag
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Day-of-month comparison highlighting delayed laboratory upload relative to clinical decisions
            </p>
          </div>
          {documentTimelineComparison.length === 0 ? (
            <div className="h-60 flex items-center justify-center text-sm text-slate-500">
              No timeline date data available.
            </div>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={documentTimelineComparison}
                  margin={{ top: 8, right: 16, left: -12, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="documentName"
                    tick={{ fontSize: 11, fill: '#475569' }}
                    interval={0}
                    tickFormatter={(val: string) => (val.length > 14 ? `${val.slice(0, 14)}…` : val)}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#475569' }}
                    domain={[8, 16]}
                    label={{ value: 'Nov Day', angle: -90, position: 'insideLeft', style: { fontSize: 11, fill: '#64748b' } }}
                  />
                  <Tooltip
                    contentStyle={{
                      fontSize: '12px',
                      borderRadius: '8px',
                      border: '1px solid #e2e8f0',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Bar dataKey="clinicalDay" name="Clinical Event Day (Nov)" fill="#0f766e" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="uploadDay" name="System Upload Day (Nov)" fill="#64748b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        {/* Chart 2: Verification Status Breakdown */}
        <section className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="mb-4">
            <h2 className="font-display text-base font-semibold text-slate-900">
              Evidence Verification Distribution
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Extracted clinical facts classified by deterministic grounding and conflict checks
            </p>
          </div>
          {verificationDistribution.length === 0 ? (
            <div className="h-60 flex items-center justify-center text-sm text-slate-500">
              Run an analysis to inspect verification distribution.
            </div>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={verificationDistribution}
                  layout="vertical"
                  margin={{ top: 8, right: 20, left: 20, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#475569' }} />
                  <YAxis
                    type="category"
                    dataKey="status"
                    width={140}
                    tick={{ fontSize: 11, fill: '#334155' }}
                  />
                  <Tooltip
                    contentStyle={{
                      fontSize: '12px',
                      borderRadius: '8px',
                      border: '1px solid #e2e8f0',
                    }}
                  />
                  <Bar dataKey="count" name="Extracted Facts" radius={[0, 4, 4, 0]}>
                    {verificationDistribution.map((entry) => (
                      <Cell
                        key={entry.status}
                        fill={VERIFICATION_COLORS[entry.status] || '#0284c7'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      </div>

      {/* Recent Patient Analyses Table */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              Recent Patient Analyses
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Select a patient record to inspect reconstructed timeline, conflicts, or evidence citations
            </p>
          </div>
        </div>

        {recentAnalyses.length === 0 ? (
          <div className="p-10 text-center">
            <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-700">No patient records found</p>
            <p className="text-xs text-slate-500 mt-1">
              Restore the synthetic Rahul demonstration or upload medical documents to begin.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                  <th className="py-3 px-6">Patient</th>
                  <th className="py-3 px-4 text-right">Age</th>
                  <th className="py-3 px-4 text-right">Documents</th>
                  <th className="py-3 px-4 text-right">Conflicts</th>
                  <th className="py-3 px-4 text-right">Missing Gaps</th>
                  <th className="py-3 px-4 text-right">Pending Reviews</th>
                  <th className="py-3 px-4">Verification Gate</th>
                  <th className="py-3 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {recentAnalyses.map((row) => (
                  <tr key={row.patientId} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 px-6">
                      <div className="font-medium text-slate-900">{row.displayName}</div>
                      <div className="font-mono text-xs text-slate-500">{row.patientIdentifier}</div>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-700">
                      {row.age ?? '—'}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-700">
                      {row.documentCount}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums font-medium text-red-700">
                      {row.conflictCount}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-amber-700">
                      {row.missingCount}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums font-semibold text-red-700">
                      {row.pendingReviews}
                    </td>
                    <td className="py-3.5 px-4">
                      <VerificationLabel status={row.overallStatus} />
                    </td>
                    <td className="py-3.5 px-6 text-right">
                      <div className="inline-flex items-center gap-3">
                        {row.pendingReviews > 0 && (
                          <button
                            type="button"
                            onClick={() => onOpenConflicts(row.patientId)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-red-700 hover:underline whitespace-nowrap"
                          >
                            <ShieldAlert className="w-3.5 h-3.5" />
                            <span>Review Conflicts</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onSelectPatientAndOpenWorkspace(row.patientId)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:underline whitespace-nowrap"
                        >
                          <FolderOpen className="w-3.5 h-3.5" />
                          <span>Open Workspace</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Core Principle Banner */}
      <section className="p-5 bg-white border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Evidence-First Escalation Principle
            </h3>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
              ClinicalTrust AI never silently resolves contradictions, never interprets missing labs as negative, and never treats omitted allergies as absence of allergy. When safety conflicts arise, conclusions halt for human review.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
