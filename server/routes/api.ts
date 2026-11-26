import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import {
  createPatient,
  deletePatientData,
  getDashboardSummary,
  getDocumentsForPatient,
  getPatientById,
  getPatientWorkspace,
  insertDocument,
  listPatients,
  resolveConflictReview,
} from '../db/database.ts';
import { runAgenticClinicalWorkflow } from '../agent/clinicalWorkflow.ts';
import { MAX_FILE_SIZE_BYTES, parseUploadedDocument } from '../services/documentParser.ts';
import { seedRahulDemoIfEmpty, SYNTHETIC_RAHUL_DOCUMENTS } from '../services/seedDemo.ts';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: 10,
  },
});

router.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'ClinicalTrust AI Research Prototype' });
});

router.get('/dashboard', (_req, res) => {
  try {
    const summary = getDashboardSummary();
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load dashboard summary.' });
  }
});

router.get('/patients', (_req, res) => {
  try {
    res.json({ patients: listPatients() });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to list patients.' });
  }
});

router.post('/patients', (req, res) => {
  try {
    const { displayName, patientIdentifier, age, sex } = req.body as {
      displayName?: string;
      patientIdentifier?: string;
      age?: number | null;
      sex?: string | null;
    };

    if (!displayName || typeof displayName !== 'string' || !displayName.trim()) {
      res.status(400).json({ error: 'Patient displayName is required.' });
      return;
    }

    const now = new Date().toISOString();
    const patient = {
      id: `pt_${crypto.randomUUID().slice(0, 8)}`,
      patientIdentifier:
        patientIdentifier && patientIdentifier.trim()
          ? patientIdentifier.trim().slice(0, 40)
          : `SYN-PT-${Math.floor(1000 + Math.random() * 9000)}`,
      displayName: displayName.trim().slice(0, 80),
      age: typeof age === 'number' && Number.isFinite(age) && age >= 0 && age <= 120 ? Math.round(age) : null,
      sex: typeof sex === 'string' && sex.trim() ? sex.trim().slice(0, 30) : null,
      isSynthetic: true,
      overallStatus: 'Unresolved' as const,
      createdAt: now,
      updatedAt: now,
    };

    createPatient(patient);
    res.status(201).json({ patient });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to create patient.' });
  }
});

router.get('/patients/:id/workspace', (req, res) => {
  try {
    const workspace = getPatientWorkspace(req.params.id);
    if (!workspace) {
      res.status(404).json({ error: 'Patient record not found.' });
      return;
    }
    res.json(workspace);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load patient workspace.' });
  }
});

router.delete('/patients/:id', (req, res) => {
  try {
    const deleted = deletePatientData(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Patient record not found.' });
      return;
    }
    res.json({ deleted: true, patientId: req.params.id });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to delete patient data.' });
  }
});

router.post('/patients/:id/documents', (req, res) => {
  upload.array('documents', 10)(req, res, async (uploadErr) => {
    if (uploadErr) {
      res.status(400).json({ error: uploadErr.message || 'File upload rejected.' });
      return;
    }

    try {
      const patient = getPatientById(req.params.id);
      if (!patient) {
        res.status(404).json({ error: 'Target patient not found.' });
        return;
      }

      const files = req.files as Express.Multer.File[] | undefined;
      if (!files || files.length === 0) {
        res.status(400).json({ error: 'Please attach at least one PDF, TXT, or DOCX document.' });
        return;
      }

      const customUploadDate =
        typeof req.body?.uploadDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.body.uploadDate)
          ? req.body.uploadDate
          : new Date().toISOString().slice(0, 10);

      const inserted = [];
      const errors: string[] = [];

      for (const file of files) {
        try {
          const parsed = await parseUploadedDocument(file.originalname, file.buffer, file.size);
          const doc = {
            id: `doc_${crypto.randomUUID().slice(0, 8)}`,
            patientId: patient.id,
            documentName: parsed.safeFileName,
            fileType: parsed.fileType,
            documentType: 'Unclassified Clinical Record' as const,
            documentDate: null,
            uploadDate: customUploadDate,
            fileSizeBytes: file.size,
            pageCount: parsed.pageCount,
            processingStatus: 'Processed' as const,
            extractionStatus: 'Pending' as const,
            rawText: parsed.rawText,
            errorMessage: null,
          };
          insertDocument(doc);
          inserted.push(doc);
        } catch (fileErr) {
          errors.push(fileErr instanceof Error ? fileErr.message : `Failed to parse ${file.originalname}`);
        }
      }

      if (inserted.length === 0 && errors.length > 0) {
        res.status(400).json({ error: errors.join(' | ') });
        return;
      }

      res.status(201).json({ documents: inserted, warnings: errors });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Document ingestion failed.' });
    }
  });
});

router.post('/patients/:id/analyze', async (req, res) => {
  try {
    const patient = getPatientById(req.params.id);
    if (!patient) {
      res.status(404).json({ error: 'Patient not found.' });
      return;
    }

    const documents = getDocumentsForPatient(patient.id);
    if (documents.length === 0) {
      res.status(400).json({ error: 'Upload at least one document before running the clinical workflow.' });
      return;
    }

    await runAgenticClinicalWorkflow({ patient, documents });
    const updatedWorkspace = getPatientWorkspace(patient.id);
    res.json(updatedWorkspace);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Clinical workflow execution failed.';
    res.status(500).json({ error: message });
  }
});

router.post('/conflicts/:conflictId/resolve', (req, res) => {
  try {
    const { reviewerName, resolutionNotes, decision } = req.body as {
      reviewerName?: string;
      resolutionNotes?: string;
      decision?: 'Resolved by Clinician' | 'Escalated';
    };

    if (!reviewerName || !reviewerName.trim()) {
      res.status(400).json({ error: 'Clinician reviewer name is required.' });
      return;
    }
    if (!resolutionNotes || !resolutionNotes.trim()) {
      res.status(400).json({ error: 'Clinical verification notes are required before updating status.' });
      return;
    }

    const validDecision = decision === 'Escalated' ? 'Escalated' : 'Resolved by Clinician';
    const updated = resolveConflictReview(
      req.params.conflictId,
      reviewerName.trim().slice(0, 80),
      resolutionNotes.trim().slice(0, 1000),
      validDecision
    );

    if (!updated) {
      res.status(404).json({ error: 'Conflict item not found.' });
      return;
    }

    res.json({ conflict: updated });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to update review status.' });
  }
});

router.post('/demo/reset', (_req, res) => {
  try {
    seedRahulDemoIfEmpty(true);
    res.json({ reset: true, message: 'Synthetic patient Rahul (Age 45) restored.' });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to reset demo dataset.' });
  }
});

router.get('/demo/sample-files/:docId', (req, res) => {
  const doc = SYNTHETIC_RAHUL_DOCUMENTS.find((d) => d.id === req.params.docId);
  if (!doc) {
    res.status(404).json({ error: 'Sample document not found.' });
    return;
  }
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${doc.documentName}"`);
  res.send(doc.rawText);
});

const EXCLUDED_DIRS = new Set(['node_modules', 'dist', 'data', '.venv', '.git', '__pycache__', 'build']);
const EXCLUDED_FILES = new Set(['ClinicalTrust_AI_Project.zip', '.DS_Store', 'bun.lock']);

function collectSourceFiles(
  rootDir: string,
  currentDir: string,
  out: Array<{ path: string; size: number; content: string }>
): void {
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.resolve(currentDir, entry.name);
    if (!fullPath.startsWith(rootDir + path.sep)) continue;

    const relPath = path.relative(rootDir, fullPath).replace(/\\/g, '/');
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      if (relPath === 'public/assets/aistudio' || relPath.startsWith('public/assets/aistudio/')) continue;
      collectSourceFiles(rootDir, fullPath, out);
    } else if (entry.isFile()) {
      if (EXCLUDED_FILES.has(entry.name)) continue;
      if (entry.name.startsWith('.env') && entry.name !== '.env.example') continue;
      if (entry.name.endsWith('.zip') || entry.name.endsWith('.png') || entry.name.endsWith('.jpg')) continue;
      const content = fs.readFileSync(fullPath, 'utf8');
      out.push({
        path: relPath,
        size: Buffer.byteLength(content, 'utf8'),
        content,
      });
    }
  }
}

router.get('/source-files', (_req, res) => {
  try {
    const rootDir = path.resolve(process.cwd());
    const files: Array<{ path: string; size: number; content: string }> = [];
    collectSourceFiles(rootDir, rootDir, files);
    files.sort((a, b) => a.path.localeCompare(b.path));
    res.json({ projectName: 'ClinicalTrust-AI', files });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to list source files.' });
  }
});

router.get('/project-archive.zip', (_req, res) => {
  const zipPath = path.resolve(process.cwd(), 'public', 'ClinicalTrust_AI_Project.zip');
  if (!fs.existsSync(zipPath)) {
    res.status(404).json({ error: 'Project archive not found.' });
    return;
  }
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename="ClinicalTrust_AI_Project.zip"');
  res.sendFile(zipPath);
});

export default router;
