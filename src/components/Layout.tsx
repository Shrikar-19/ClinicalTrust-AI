import {
  Activity,
  AlertTriangle,
  FileCheck2,
  FileSearch,
  FolderKanban,
  GitBranch,
  LayoutDashboard,
  Menu,
  Play,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { Patient } from '../types/clinical';

export type NavPage = 'dashboard' | 'workspace' | 'conflicts' | 'evidence' | 'summary';

interface LayoutProps {
  activePage: NavPage;
  onNavigate: (page: NavPage) => void;
  patients: Patient[];
  activePatientId: string | null;
  onSelectPatient: (id: string) => void;
  pendingConflictsCount: number;
  onOpenUpload: () => void;
  onOpenWorkflow: () => void;
  onRunAnalysis: () => void;
  isAnalyzing: boolean;
  children: ReactNode;
}

const NAV_ITEMS: Array<{ id: NavPage; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'workspace', label: 'Patient Workspace', icon: FolderKanban },
  { id: 'conflicts', label: 'Clinical Conflict Center', icon: AlertTriangle },
  { id: 'evidence', label: 'Evidence Explorer', icon: FileSearch },
  { id: 'summary', label: 'Clinical Summary', icon: FileCheck2 },
];

export function Layout({
  activePage,
  onNavigate,
  patients,
  activePatientId,
  onSelectPatient,
  pendingConflictsCount,
  onOpenUpload,
  onOpenWorkflow,
  onRunAnalysis,
  isAnalyzing,
  children,
}: LayoutProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const activePatient = patients.find((p) => p.id === activePatientId) ?? patients[0] ?? null;
  const activeNavLabel = NAV_ITEMS.find((n) => n.id === activePage)?.label ?? 'Dashboard';

  const sidebarContent = (
    <div className="flex flex-col h-full bg-white border-r border-slate-200">
      <div className="px-5 py-5 border-b border-slate-200">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-teal-700 text-white flex items-center justify-center shrink-0">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <span className="font-display text-base font-bold tracking-tight text-slate-900 whitespace-nowrap">
            ClinicalTrust AI
          </span>
        </div>
        <p className="mt-2 text-xs text-slate-500 leading-relaxed">
          Evidence-Anchored Clinical Record Verification
        </p>
      </div>

      <div className="px-4 py-4 border-b border-slate-200">
        <label htmlFor="patient-switcher" className="block text-xs font-medium text-slate-500 mb-1.5">
          Active Patient Record
        </label>
        <select
          id="patient-switcher"
          value={activePatient?.id ?? ''}
          onChange={(e) => onSelectPatient(e.target.value)}
          className="w-full px-3 py-2 text-sm font-medium text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-teal-600"
        >
          {patients.length === 0 ? (
            <option value="">No patients loaded</option>
          ) : (
            patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.displayName} ({p.patientIdentifier})
              </option>
            ))
          )}
        </select>
        {activePatient && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
            <span>Age {activePatient.age ?? 'Unknown'}</span>
            <span aria-hidden="true">·</span>
            <span>{activePatient.isSynthetic ? 'Synthetic Dataset' : 'Research Case'}</span>
          </div>
        )}
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" aria-label="Primary Navigation">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activePage === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onNavigate(item.id);
                setMobileNavOpen(false);
              }}
              className={`w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-teal-50 text-teal-800'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <span className="flex items-center gap-2.5 truncate">
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-teal-700' : 'text-slate-400'}`} />
                <span className="truncate">{item.label}</span>
              </span>
              {item.id === 'conflicts' && pendingConflictsCount > 0 && (
                <span className="font-mono tabular-nums text-xs font-semibold text-red-700 ml-2">
                  {pendingConflictsCount}
                </span>
              )}
            </button>
          );
        })}

        <div className="pt-4 mt-4 border-t border-slate-200 space-y-1">
          <button
            type="button"
            onClick={() => {
              onOpenWorkflow();
              setMobileNavOpen(false);
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 rounded-lg transition-colors whitespace-nowrap"
          >
            <GitBranch className="w-4 h-4 text-slate-400 shrink-0" />
            <span>Agent Workflow Trace</span>
          </button>
          <button
            type="button"
            onClick={() => {
              onOpenUpload();
              setMobileNavOpen(false);
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 rounded-lg transition-colors whitespace-nowrap"
          >
            <Upload className="w-4 h-4 text-slate-400 shrink-0" />
            <span>Upload Documents</span>
          </button>
        </div>
      </nav>

      <div className="p-4 border-t border-slate-200 bg-slate-50">
        <div className="flex items-start gap-2 text-xs text-slate-600 leading-relaxed">
          <Activity className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-slate-800">Research & Educational Prototype</p>
            <p className="mt-0.5 text-slate-500">
              For record organization & clinician-assisted review only. Not clinically validated for autonomous diagnosis or prescribing.
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 sticky top-0 h-screen">
        {sidebarContent}
      </aside>

      {/* Mobile Sidebar Overlay */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden="true"
          />
          <div className="relative w-72 max-w-[85vw] h-full z-10">
            <button
              type="button"
              onClick={() => setMobileNavOpen(false)}
              aria-label="Close navigation menu"
              className="absolute top-4 right-4 p-2 text-slate-500 hover:text-slate-900 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
            {sidebarContent}
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar Contract: Breadcrumb / Context on left, single primary CTA on right */}
        <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-4 sm:px-8 py-3.5 flex items-center justify-between gap-8">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-2 -ml-2 text-slate-600 hover:text-slate-900 rounded-lg"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="font-medium text-slate-500 whitespace-nowrap shrink-0">ClinicalTrust</span>
              <span className="text-slate-300" aria-hidden="true">/</span>
              <span className="font-semibold text-slate-900 truncate">{activeNavLabel}</span>
              {activePatient && (
                <>
                  <span className="hidden sm:inline text-slate-300" aria-hidden="true">·</span>
                  <span className="hidden sm:inline text-slate-500 truncate">
                    {activePatient.displayName} ({activePatient.patientIdentifier})
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={onRunAnalysis}
              disabled={isAnalyzing || !activePatient}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Play className="w-3.5 h-3.5 shrink-0" />
              <span>{isAnalyzing ? 'Running Verification...' : 'Run Agentic Analysis'}</span>
            </button>
          </div>
        </header>

        <main className="flex-1 px-4 sm:px-8 py-6 max-w-[1360px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
