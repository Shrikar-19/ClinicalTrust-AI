import { jsPDF } from 'jspdf';
import type { ClinicalReport, Patient } from '../types/clinical';

export function exportClinicalReportToPdf(patient: Patient, report: ClinicalReport): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 44;
  const contentWidth = pageWidth - margin * 2;
  let y = 50;

  const ensureSpace = (needed = 24) => {
    if (y + needed > pageHeight - 50) {
      doc.addPage();
      y = 50;
    }
  };

  const addHeading = (title: string) => {
    ensureSpace(32);
    y += 8;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.text(title, margin, y);
    y += 6;
    doc.setDrawColor(203, 213, 225);
    doc.line(margin, y, pageWidth - margin, y);
    y += 14;
  };

  const addSubLabel = (label: string, color: [number, number, number] = [15, 118, 110]) => {
    ensureSpace(20);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(color[0], color[1], color[2]);
    doc.text(label, margin, y);
    y += 13;
  };

  const addParagraphs = (items: string[], prefix = '- ') => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(51, 65, 85);
    if (items.length === 0) {
      ensureSpace(16);
      doc.text('None recorded.', margin + 8, y);
      y += 14;
      return;
    }
    for (const item of items) {
      const lines = doc.splitTextToSize(`${prefix}${item}`, contentWidth - 10) as string[];
      ensureSpace(lines.length * 13 + 4);
      doc.text(lines, margin + 6, y);
      y += lines.length * 13 + 3;
    }
  };

  // Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  doc.text('ClinicalTrust AI — Structured Clinical Intelligence Report', margin, y);
  y += 18;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Patient: ${patient.displayName} (${patient.patientIdentifier}) · Age: ${patient.age ?? 'Unknown'} · Status: ${report.overallStatus}`,
    margin,
    y
  );
  y += 13;
  doc.text(
    `Generated: ${new Date(report.generatedAt).toLocaleString()} · Research & Educational Decision Support Prototype (Not Clinically Validated)`,
    margin,
    y
  );
  y += 18;

  if (report.haltedConclusions.length > 0) {
    addSubLabel('SYSTEM ESCALATION STOPS (HALTED CONCLUSIONS)', [185, 28, 28]);
    addParagraphs(report.haltedConclusions, '[STOP] ');
  }

  addHeading('1. Patient Overview');
  addSubLabel('Documented Facts');
  addParagraphs(report.sections.patientOverview.documentedFacts);
  addSubLabel('AI-Generated Contextual Interpretation');
  addParagraphs(report.sections.patientOverview.aiInterpretations, '');

  addHeading('2. Reconstructed Medical Timeline');
  addSubLabel('Documented Facts (Anchored by Clinical Event Date)');
  addParagraphs(report.sections.reconstructedTimelineSummary.documentedFacts);
  addSubLabel('AI-Generated Timeline Commentary');
  addParagraphs(report.sections.reconstructedTimelineSummary.aiInterpretations, '');

  addHeading('3. Current Documented Diagnoses');
  addSubLabel('Documented Facts');
  addParagraphs(report.sections.currentDiagnoses.documentedFacts);
  addSubLabel('AI-Generated Reconciliation Commentary');
  addParagraphs(report.sections.currentDiagnoses.aiInterpretations, '');

  addHeading('4. Medication Reconciliation');
  addSubLabel('Documented Facts');
  addParagraphs(report.sections.medicationReconciliation.documentedFacts);
  addSubLabel('AI-Generated Safety & Reconciliation Commentary');
  addParagraphs(report.sections.medicationReconciliation.aiInterpretations, '');

  addHeading('5. Laboratory Findings');
  addSubLabel('Documented Facts');
  addParagraphs(report.sections.laboratoryFindings.documentedFacts);
  addSubLabel('AI-Generated Laboratory Commentary');
  addParagraphs(report.sections.laboratoryFindings.aiInterpretations, '');

  addHeading('6. Missing Information');
  addParagraphs(report.sections.missingInformation);

  addHeading('7. Conflicting Information');
  addParagraphs(report.sections.conflictingInformation);

  addHeading('8. Evidence References');
  addParagraphs(
    report.sections.evidenceReferences.map(
      (r) => `[${r.status}] ${r.claim} — Source: ${r.documentName} (${r.location})`
    )
  );

  addHeading('9. Unresolved Issues');
  addParagraphs(report.sections.unresolvedIssues);

  addHeading('10. Human-Review Recommendations');
  addParagraphs(report.sections.humanReviewRecommendations);

  const safeName = patient.displayName.replace(/[^a-zA-Z0-9_-]/g, '_');
  doc.save(`ClinicalTrust_Report_${safeName}.pdf`);
}
