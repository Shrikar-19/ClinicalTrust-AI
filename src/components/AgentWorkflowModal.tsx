import { CheckCircle2, GitBranch, RotateCcw, ShieldAlert, X } from 'lucide-react';
import type { WorkflowRun } from '../types/clinical';

interface AgentWorkflowModalProps {
  isOpen: boolean;
  onClose: () => void;
  workflowRun: WorkflowRun | null;
}

export function AgentWorkflowModal({ isOpen, onClose, workflowRun }: AgentWorkflowModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45">
      <div className="bg-white border border-slate-200 rounded-xl shadow-lg w-full max-w-3xl max-h-[88vh] flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <GitBranch className="w-5 h-5 text-teal-700" />
            <div>
              <h2 className="font-display text-lg font-semibold text-slate-900">
                Stateful Agentic Workflow Execution Trace
              </h2>
              <p className="text-xs text-slate-500">
                9-stage LangGraph-architecture verification pipeline with conditional human-review stops
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close workflow trace"
            className="p-2 text-slate-400 hover:text-slate-700 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5">
          {!workflowRun ? (
            <p className="text-sm text-slate-500">
              No workflow execution recorded for this patient yet. Click "Run Agentic Analysis" to inspect each stage.
            </p>
          ) : (
            <>
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-slate-500">Final Routing Decision</p>
                  <p className="text-sm font-semibold text-slate-900 mt-0.5">
                    {workflowRun.routeDecision === 'ESCALATED_HUMAN_REVIEW_REQUIRED'
                      ? 'Escalated — Human Clinician Review Required'
                      : 'Evidence-Supported Clinical Summary'}
                  </p>
                  {workflowRun.haltReason && (
                    <p className="text-xs text-red-700 mt-1">{workflowRun.haltReason}</p>
                  )}
                </div>
                <div className="text-xs text-slate-500 font-mono tabular-nums shrink-0">
                  <div>Completed: {new Date(workflowRun.completedAt).toLocaleString()}</div>
                  <div>Retries: {workflowRun.retryCount}</div>
                </div>
              </div>

              <ol className="space-y-3">
                {workflowRun.steps.map((step, idx) => {
                  const isHalted = step.status === 'halted_for_review';
                  const isRetried = step.status === 'retried';
                  return (
                    <li
                      key={step.nodeName}
                      className={`p-4 border rounded-lg ${
                        isHalted ? 'border-red-200 bg-red-50/40' : 'border-slate-200 bg-white'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                          <span className="font-mono tabular-nums text-xs font-semibold text-slate-400 mt-0.5">
                            0{idx + 1}
                          </span>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-sm font-semibold text-slate-900">{step.label}</h3>
                              {isHalted ? (
                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700">
                                  <ShieldAlert className="w-3.5 h-3.5" />
                                  Halted for Review
                                </span>
                              ) : isRetried ? (
                                <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700">
                                  <RotateCcw className="w-3.5 h-3.5" />
                                  Completed (Retried)
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  Completed
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-600 mt-1">{step.summary}</p>
                          </div>
                        </div>
                        <span className="font-mono tabular-nums text-xs text-slate-500 shrink-0">
                          {step.durationMs} ms
                        </span>
                      </div>

                      {step.details.length > 0 && (
                        <ul className="mt-2.5 pl-6 space-y-1 text-xs text-slate-600 list-disc">
                          {step.details.map((detail, i) => (
                            <li key={i}>{detail}</li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ol>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
