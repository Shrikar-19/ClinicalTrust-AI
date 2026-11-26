import { FileText, Plus, Upload, X } from 'lucide-react';
import { useState, type ChangeEvent, type FormEvent } from 'react';
import { createPatientRecord, uploadPatientDocuments } from '../services/api';
import type { Patient } from '../types/clinical';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  patients: Patient[];
  activePatientId: string | null;
  onUploadComplete: (patientId: string, runAnalysisNow: boolean) => void;
}

const ALLOWED_EXT = ['.pdf', '.txt', '.docx'];
const MAX_SIZE_BYTES = 10 * 1024 * 1024;

export function UploadModal({
  isOpen,
  onClose,
  patients,
  activePatientId,
  onUploadComplete,
}: UploadModalProps) {
  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [targetPatientId, setTargetPatientId] = useState<string>(activePatientId ?? patients[0]?.id ?? '');
  const [newPatientName, setNewPatientName] = useState('');
  const [newPatientAge, setNewPatientAge] = useState('');
  const [uploadDate, setUploadDate] = useState(new Date().toISOString().slice(0, 10));
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [runAfterUpload, setRunAfterUpload] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const files = Array.from(e.target.files || []);
    const validated: File[] = [];
    for (const file of files) {
      const lower = file.name.toLowerCase();
      const validExt = ALLOWED_EXT.some((ext) => lower.endsWith(ext));
      if (!validExt) {
        setError(`"${file.name}" is not a supported file type. Allowed: PDF, TXT, DOCX.`);
        return;
      }
      if (file.size > MAX_SIZE_BYTES) {
        setError(`"${file.name}" exceeds the 10 MB maximum file size.`);
        return;
      }
      validated.push(file);
    }
    setSelectedFiles(validated);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (selectedFiles.length === 0) {
      setError('Select at least one PDF, TXT, or DOCX medical record.');
      return;
    }

    setIsSubmitting(true);
    try {
      let patientId = targetPatientId || activePatientId || patients[0]?.id || '';
      if (mode === 'new' || !patientId) {
        if (!newPatientName.trim()) {
          setError('Enter a synthetic patient name.');
          setIsSubmitting(false);
          return;
        }
        const parsedAge = newPatientAge.trim() ? Number(newPatientAge) : null;
        const created = await createPatientRecord({
          displayName: newPatientName.trim(),
          age: parsedAge !== null && Number.isFinite(parsedAge) ? parsedAge : null,
        });
        patientId = created.id;
      }

      const result = await uploadPatientDocuments(patientId, selectedFiles, uploadDate);
      if (result.warnings && result.warnings.length > 0) {
        setError(result.warnings.join(' | '));
      }
      setSelectedFiles([]);
      setNewPatientName('');
      setNewPatientAge('');
      onUploadComplete(patientId, runAfterUpload);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45">
      <div className="bg-white border border-slate-200 rounded-xl shadow-lg w-full max-w-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-900">
              Upload Medical Documents
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Supported formats: PDF, TXT, DOCX (max 10 MB per file · synthetic records only)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close upload dialog"
            className="p-2 text-slate-400 hover:text-slate-700 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
              {error}
            </div>
          )}

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setMode('existing')}
              className={`flex-1 py-2 px-3 text-xs font-medium rounded-md transition-colors ${
                mode === 'existing' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Add to Existing Patient
            </button>
            <button
              type="button"
              onClick={() => setMode('new')}
              className={`flex-1 py-2 px-3 text-xs font-medium rounded-md transition-colors inline-flex items-center justify-center gap-1.5 ${
                mode === 'new' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create New Synthetic Patient</span>
            </button>
          </div>

          {mode === 'existing' ? (
            <div>
              <label htmlFor="upload-patient-select" className="block text-xs font-medium text-slate-700 mb-1.5">
                Patient Record
              </label>
              <select
                id="upload-patient-select"
                value={targetPatientId || activePatientId || patients[0]?.id || ''}
                onChange={(e) => setTargetPatientId(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              >
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.displayName} ({p.patientIdentifier})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="new-pt-name" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Synthetic Patient Name
                </label>
                <input
                  id="new-pt-name"
                  type="text"
                  value={newPatientName}
                  onChange={(e) => setNewPatientName(e.target.value)}
                  placeholder="e.g., Priya (Synthetic)"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>
              <div>
                <label htmlFor="new-pt-age" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Age (Optional)
                </label>
                <input
                  id="new-pt-age"
                  type="number"
                  min={0}
                  max={120}
                  value={newPatientAge}
                  onChange={(e) => setNewPatientAge(e.target.value)}
                  placeholder="e.g., 52"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>
            </div>
          )}

          <div>
            <label htmlFor="upload-date" className="block text-xs font-medium text-slate-700 mb-1.5">
              System Upload Date (Separate from Clinical Event Date)
            </label>
            <input
              id="upload-date"
              type="date"
              value={uploadDate}
              onChange={(e) => setUploadDate(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Select Clinical Documents (Multiple Allowed)
            </label>
            <label className="flex flex-col items-center justify-center px-4 py-6 border border-dashed border-slate-300 rounded-lg bg-slate-50 hover:bg-slate-100 cursor-pointer transition-colors">
              <Upload className="w-6 h-6 text-teal-700 mb-2" />
              <span className="text-sm font-medium text-slate-800">
                Choose PDF, TXT, or DOCX files
              </span>
              <span className="text-xs text-slate-500 mt-1">
                Files are validated and parsed safely as text only
              </span>
              <input
                type="file"
                multiple
                accept=".pdf,.txt,.docx"
                onChange={handleFileChange}
                className="sr-only"
              />
            </label>

            {selectedFiles.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {selectedFiles.map((file) => (
                  <li
                    key={file.name}
                    className="flex items-center justify-between px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-md"
                  >
                    <span className="flex items-center gap-2 text-slate-800 font-medium truncate">
                      <FileText className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                      <span className="truncate">{file.name}</span>
                    </span>
                    <span className="font-mono tabular-nums text-slate-500 ml-3 shrink-0">
                      {(file.size / 1024).toFixed(1)} KB
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={runAfterUpload}
              onChange={(e) => setRunAfterUpload(e.target.checked)}
              className="rounded border-slate-300 text-teal-700 focus:ring-teal-600"
            />
            <span>Run the 9-node Agentic Clinical Verification Workflow immediately after upload</span>
          </label>

          <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg transition-colors"
            >
              {isSubmitting ? 'Uploading...' : 'Upload Records'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
