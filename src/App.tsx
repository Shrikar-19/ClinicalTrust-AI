/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AlertCircle, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { AgentWorkflowModal } from './components/AgentWorkflowModal';
import { Layout, type NavPage } from './components/Layout';
import { ProjectSourceModal } from './components/ProjectSourceModal';
import { UploadModal } from './components/UploadModal';
import { ClinicalSummaryPage } from './pages/ClinicalSummaryPage';
import { ConflictCenterPage } from './pages/ConflictCenterPage';
import { DashboardPage } from './pages/DashboardPage';
import { EvidenceExplorerPage } from './pages/EvidenceExplorerPage';
import { PatientWorkspacePage } from './pages/PatientWorkspacePage';
import {
  deletePatientRecord,
  fetchDashboard,
  fetchPatients,
  fetchPatientWorkspace,
  resetDemoPatient,
  runPatientAnalysis,
} from './services/api';
import type { DashboardSummaryResponse, Patient, PatientWorkspaceResponse } from './types/clinical';

export default function App() {
  const [activePage, setActivePage] = useState<NavPage>('dashboard');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [activePatientId, setActivePatientId] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<DashboardSummaryResponse | null>(null);
  const [workspace, setWorkspace] = useState<PatientWorkspaceResponse | null>(null);

  const [isLoadingDashboard, setIsLoadingDashboard] = useState(true);
  const [isLoadingWorkspace, setIsLoadingWorkspace] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [workflowOpen, setWorkflowOpen] = useState(false);
  const [sourceModalOpen, setSourceModalOpen] = useState(false);

  const loadPatientsAndDashboard = useCallback(async (preferredPatientId?: string | null) => {
    setIsLoadingDashboard(true);
    try {
      const [pts, dash] = await Promise.all([fetchPatients(), fetchDashboard()]);
      setPatients(pts);
      setDashboard(dash);

      const targetId =
        preferredPatientId && pts.some((p) => p.id === preferredPatientId)
          ? preferredPatientId
          : pts[0]?.id ?? null;

      setActivePatientId(targetId);
      return targetId;
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Failed to load clinical dashboard.');
      return null;
    } finally {
      setIsLoadingDashboard(false);
    }
  }, []);

  const loadWorkspace = useCallback(async (patientId: string | null) => {
    if (!patientId) {
      setWorkspace(null);
      return;
    }
    setIsLoadingWorkspace(true);
    try {
      const ws = await fetchPatientWorkspace(patientId);
      setWorkspace(ws);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Failed to load patient workspace.');
    } finally {
      setIsLoadingWorkspace(false);
    }
  }, []);

  useEffect(() => {
    loadPatientsAndDashboard().then((id) => {
      if (id) loadWorkspace(id);
    });
  }, [loadPatientsAndDashboard, loadWorkspace]);

  const handleSelectPatient = async (patientId: string) => {
    setActivePatientId(patientId);
    await loadWorkspace(patientId);
  };

  const handleRunAnalysis = async (patientIdOverride?: string) => {
    const targetId = patientIdOverride ?? activePatientId;
    if (!targetId) return;
    setErrorBanner(null);
    setIsAnalyzing(true);
    try {
      const updated = await runPatientAnalysis(targetId);
      setWorkspace(updated);
      await loadPatientsAndDashboard(targetId);
      setWorkflowOpen(true);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Agentic clinical workflow failed.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleUploadComplete = async (patientId: string, runAnalysisNow: boolean) => {
    setActivePatientId(patientId);
    await loadPatientsAndDashboard(patientId);
    if (runAnalysisNow) {
      await handleRunAnalysis(patientId);
      setActivePage('workspace');
    } else {
      await loadWorkspace(patientId);
      setActivePage('workspace');
    }
  };

  const handleDeletePatient = async (patientId: string) => {
    setErrorBanner(null);
    try {
      await deletePatientRecord(patientId);
      const nextId = await loadPatientsAndDashboard(null);
      await loadWorkspace(nextId);
      setActivePage('dashboard');
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Failed to delete patient data.');
    }
  };

  const handleResetDemo = async () => {
    setErrorBanner(null);
    try {
      await resetDemoPatient();
      const targetId = await loadPatientsAndDashboard('pt_rahul_demo');
      await loadWorkspace(targetId);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Failed to restore synthetic demo.');
    }
  };

  const handleConflictUpdated = async () => {
    if (!activePatientId) return;
    await Promise.all([loadWorkspace(activePatientId), loadPatientsAndDashboard(activePatientId)]);
  };

  const pendingConflictsCount =
    workspace?.conflicts.filter((c) => c.reviewStatus !== 'Resolved by Clinician').length ?? 0;

  return (
    <Layout
      activePage={activePage}
      onNavigate={setActivePage}
      patients={patients}
      activePatientId={activePatientId}
      onSelectPatient={handleSelectPatient}
      pendingConflictsCount={pendingConflictsCount}
      onOpenUpload={() => setUploadOpen(true)}
      onOpenWorkflow={() => setWorkflowOpen(true)}
      onRunAnalysis={() => handleRunAnalysis()}
      isAnalyzing={isAnalyzing}
    >
      {errorBanner && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start justify-between gap-3 text-xs text-red-800">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
            <span>{errorBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorBanner(null)}
            aria-label="Dismiss error"
            className="text-red-700 hover:text-red-900"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {activePage === 'dashboard' && (
        <DashboardPage
          dashboard={dashboard}
          isLoading={isLoadingDashboard}
          onSelectPatientAndOpenWorkspace={async (id) => {
            await handleSelectPatient(id);
            setActivePage('workspace');
          }}
          onOpenConflicts={async (id) => {
            await handleSelectPatient(id);
            setActivePage('conflicts');
          }}
          onOpenUpload={() => setUploadOpen(true)}
          onResetDemo={handleResetDemo}
          onOpenSourceExplorer={() => setSourceModalOpen(true)}
        />
      )}

      {activePage === 'workspace' && (
        <PatientWorkspacePage
          workspace={workspace}
          isLoading={isLoadingWorkspace}
          onOpenUpload={() => setUploadOpen(true)}
          onDeletePatient={handleDeletePatient}
          onOpenConflictCenter={() => setActivePage('conflicts')}
        />
      )}

      {activePage === 'conflicts' && (
        <ConflictCenterPage
          workspace={workspace}
          isLoading={isLoadingWorkspace}
          onConflictUpdated={handleConflictUpdated}
        />
      )}

      {activePage === 'evidence' && (
        <EvidenceExplorerPage workspace={workspace} isLoading={isLoadingWorkspace} />
      )}

      {activePage === 'summary' && (
        <ClinicalSummaryPage workspace={workspace} isLoading={isLoadingWorkspace} />
      )}

      <UploadModal
        isOpen={uploadOpen}
        onClose={() => setUploadOpen(false)}
        patients={patients}
        activePatientId={activePatientId}
        onUploadComplete={handleUploadComplete}
      />

      <AgentWorkflowModal
        isOpen={workflowOpen}
        onClose={() => setWorkflowOpen(false)}
        workflowRun={workspace?.workflowRun ?? null}
      />

      <ProjectSourceModal
        isOpen={sourceModalOpen}
        onClose={() => setSourceModalOpen(false)}
      />
    </Layout>
  );
}
