import { FileSearch, Search } from 'lucide-react';
import { useState } from 'react';
import { VerificationLabel } from '../components/StatusIndicator';
import type { PatientWorkspaceResponse, VerificationStatus } from '../types/clinical';

interface EvidenceExplorerPageProps {
  workspace: PatientWorkspaceResponse | null;
  isLoading: boolean;
}

const STATUS_FILTERS: Array<'All' | VerificationStatus> = [
  'All',
  'Verified',
  'Supported',
  'Partially supported',
  'Conflicting',
  'Requires human review',
  'Unresolved',
];

export function EvidenceExplorerPage({ workspace, isLoading }: EvidenceExplorerPageProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | VerificationStatus>('All');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (isLoading) {
    return <div className="h-96 bg-white border border-slate-200 rounded-xl animate-pulse" />;
  }

  if (!workspace) {
    return (
      <div className="p-10 bg-white border border-slate-200 rounded-xl text-center">
        <p className="text-sm text-slate-600">Select a patient record to explore extracted clinical evidence.</p>
      </div>
    );
  }

  const query = searchQuery.trim().toLowerCase();
  const filteredFacts = workspace.facts.filter((fact) => {
    if (statusFilter !== 'All' && fact.verificationStatus !== statusFilter) return false;
    if (!query) return true;
    return (
      fact.factValue.toLowerCase().includes(query) ||
      fact.category.toLowerCase().includes(query) ||
      fact.sourceDocument.toLowerCase().includes(query) ||
      fact.sourcePassage.toLowerCase().includes(query)
    );
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
          Evidence Explorer
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Inspect every extracted clinical fact alongside its verbatim source passage, document page reference, and cross-document verification status.
        </p>
      </div>

      {/* Filter & Search Bar */}
      <div className="p-4 bg-white border border-slate-200 rounded-xl flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search facts, medications, source documents, or quotes..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 focus:bg-white"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
          {STATUS_FILTERS.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                statusFilter === status
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* Facts Evidence Table */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {filteredFacts.length === 0 ? (
          <div className="p-10 text-center">
            <FileSearch className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-700">No extracted facts match your filter</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {filteredFacts.map((fact) => {
              const isExpanded = expandedId === fact.id;
              return (
                <div key={fact.id} className="p-5 hover:bg-slate-50/50 transition-colors">
                  <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                    <div className="space-y-1.5 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span className="font-semibold text-slate-700">{fact.category}</span>
                        <span aria-hidden="true">·</span>
                        <span>{fact.sourceDocument}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono">{fact.sourceLocation}</span>
                        {fact.clinicalEventDate && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono">{fact.clinicalEventDate}</span>
                          </>
                        )}
                      </div>

                      <h3 className="text-sm font-semibold text-slate-900">{fact.factValue}</h3>
                      <p className="text-xs font-mono text-slate-700 bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
                        "{fact.sourcePassage}"
                      </p>
                      <p className="text-xs text-slate-600">{fact.verificationNotes}</p>
                    </div>

                    <div className="flex lg:flex-col items-center lg:items-end justify-between gap-2 shrink-0">
                      <VerificationLabel status={fact.verificationStatus} />
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : fact.id)}
                        className="text-xs font-medium text-teal-700 hover:underline whitespace-nowrap"
                      >
                        {isExpanded ? 'Hide Cross-References' : 'Inspect Cross-References'}
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                      <div className="p-3 bg-emerald-50/50 border border-emerald-200 rounded-lg space-y-1">
                        <p className="font-semibold text-emerald-900">Supporting Source Passages</p>
                        {fact.supportingPassages.length === 0 ? (
                          <p className="text-slate-500">None retrieved.</p>
                        ) : (
                          <ul className="space-y-1 text-slate-700 list-disc pl-4">
                            {fact.supportingPassages.map((p, i) => (
                              <li key={i}>{p}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div className="p-3 bg-red-50/50 border border-red-200 rounded-lg space-y-1">
                        <p className="font-semibold text-red-900">Contradictory Passages</p>
                        {fact.contradictoryPassages.length === 0 ? (
                          <p className="text-slate-500">No contradictory statements detected.</p>
                        ) : (
                          <ul className="space-y-1 text-red-900 list-disc pl-4">
                            {fact.contradictoryPassages.map((p, i) => (
                              <li key={i}>{p}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
