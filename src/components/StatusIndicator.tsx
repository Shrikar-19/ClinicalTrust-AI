import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Clock,
  HelpCircle,
  ShieldAlert,
} from 'lucide-react';
import type { ConflictSeverity, ReviewStatus, VerificationStatus } from '../types/clinical';

export function VerificationLabel({ status }: { status: VerificationStatus }) {
  switch (status) {
    case 'Verified':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 whitespace-nowrap">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span>Verified</span>
        </span>
      );
    case 'Supported':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-teal-700 whitespace-nowrap">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span>Supported</span>
        </span>
      );
    case 'Partially supported':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 whitespace-nowrap">
          <Clock className="w-3.5 h-3.5 shrink-0" />
          <span>Partially supported</span>
        </span>
      );
    case 'Conflicting':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 whitespace-nowrap">
          <AlertOctagon className="w-3.5 h-3.5 shrink-0" />
          <span>Conflicting</span>
        </span>
      );
    case 'Requires human review':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 whitespace-nowrap">
          <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
          <span>Requires human review</span>
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 whitespace-nowrap">
          <HelpCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{status}</span>
        </span>
      );
  }
}

export function SeverityLabel({ severity }: { severity: ConflictSeverity }) {
  switch (severity) {
    case 'Critical':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 whitespace-nowrap">
          <AlertOctagon className="w-3.5 h-3.5 shrink-0" />
          <span>Critical</span>
        </span>
      );
    case 'High':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 whitespace-nowrap">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>High</span>
        </span>
      );
    case 'Moderate':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-700 whitespace-nowrap">
          <Clock className="w-3.5 h-3.5 shrink-0" />
          <span>Moderate</span>
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 whitespace-nowrap">
          <HelpCircle className="w-3.5 h-3.5 shrink-0" />
          <span>Low</span>
        </span>
      );
  }
}

export function ReviewStatusLabel({ status }: { status: ReviewStatus }) {
  if (status === 'Resolved by Clinician') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 whitespace-nowrap">
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
        <span>Resolved by Clinician</span>
      </span>
    );
  }
  if (status === 'Escalated') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 whitespace-nowrap">
        <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
        <span>Escalated</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 whitespace-nowrap">
      <Clock className="w-3.5 h-3.5 shrink-0" />
      <span>Pending Human Review</span>
    </span>
  );
}
