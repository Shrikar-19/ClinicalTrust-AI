import JSZip from 'jszip';
import { Check, Copy, Download, FileCode2, FolderDown, FolderTree, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { fetchProjectSourceFiles, type SourceFileEntry } from '../services/api';

interface ProjectSourceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ProjectSourceModal({ isOpen, onClose }: ProjectSourceModalProps) {
  const [files, setFiles] = useState<SourceFileEntry[]>([]);
  const [selectedPath, setSelectedPath] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setError(null);
    setStatusMessage(null);
    fetchProjectSourceFiles()
      .then((res) => {
        setFiles(res.files);
        if (res.files.length > 0 && !selectedPath) {
          const readme = res.files.find((f) => f.path === 'README.md') ?? res.files[0];
          setSelectedPath(readme.path);
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load project source files.');
      })
      .finally(() => setLoading(false));
  }, [isOpen, selectedPath]);

  if (!isOpen) return null;

  const activeFile = files.find((f) => f.path === selectedPath) ?? files[0] ?? null;

  const handleDownloadClientZip = async () => {
    setError(null);
    setStatusMessage(null);
    try {
      const zip = new JSZip();
      const rootFolder = zip.folder('ClinicalTrust-AI');
      if (!rootFolder) throw new Error('Unable to initialize zip folder.');
      for (const file of files) {
        rootFolder.file(file.path, file.content);
      }
      const blob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'ClinicalTrust-AI-Source.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setStatusMessage(`Downloaded ClinicalTrust-AI-Source.zip (${files.length} files, ${(blob.size / 1024).toFixed(1)} KB).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate zip archive.');
    }
  };

  const handleSaveExtractedFolder = async () => {
    setError(null);
    setStatusMessage(null);
    const win = window as unknown as {
      showDirectoryPicker?: (opts?: { mode?: string }) => Promise<FileSystemDirectoryHandle>;
    };
    if (typeof win.showDirectoryPicker !== 'function') {
      setError(
        'Direct folder writing requires Chrome or Edge outside a restricted iframe. Use "Download Verified .zip" or download individual files below.'
      );
      return;
    }
    try {
      const dirHandle = await win.showDirectoryPicker({ mode: 'readwrite' });
      const rootHandle = await dirHandle.getDirectoryHandle('ClinicalTrust-AI', { create: true });

      for (const file of files) {
        const parts = file.path.split('/').filter(Boolean);
        const fileName = parts.pop();
        if (!fileName) continue;

        let currentDir = rootHandle;
        for (const folderName of parts) {
          currentDir = await currentDir.getDirectoryHandle(folderName, { create: true });
        }
        const fileHandle = await currentDir.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(file.content);
        await writable.close();
      }
      setStatusMessage(`Saved ${files.length} extracted files directly into ClinicalTrust-AI/.`);
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') return;
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to write folder directly in this browser context. Use "Download Verified .zip" instead.'
      );
    }
  };

  const handleDownloadSingleFile = (file: SourceFileEntry) => {
    const blob = new Blob([file.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.path.split('/').pop() || 'file.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleCopyFile = async () => {
    if (!activeFile) return;
    await navigator.clipboard.writeText(activeFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
      <div className="bg-white border border-slate-200 rounded-xl shadow-xl w-full max-w-5xl h-[86vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <FolderTree className="w-5 h-5 text-teal-700 shrink-0" />
            <div>
              <h2 className="font-display text-lg font-semibold text-slate-900">
                Extracted Project Source & Export ({files.length} Files)
              </h2>
              <p className="text-xs text-slate-500">
                Browse every extracted folder and file, save directly to disk, or download a browser-verified .zip archive
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleSaveExtractedFolder}
              disabled={loading || files.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-teal-800 bg-teal-50 border border-teal-200 hover:bg-teal-100 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
            >
              <FolderDown className="w-3.5 h-3.5" />
              <span>Save Extracted Folder</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadClientZip}
              disabled={loading || files.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Verified .zip</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close source explorer"
              className="p-2 text-slate-400 hover:text-slate-700 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Notices */}
        {error && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 shrink-0">
            {error}
          </div>
        )}
        {statusMessage && (
          <div className="mx-6 mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 shrink-0">
            {statusMessage}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 min-h-0 flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-slate-200">
          {/* File Tree List */}
          <aside className="w-full md:w-72 shrink-0 overflow-y-auto p-3 bg-slate-50 max-h-56 md:max-h-none">
            {loading ? (
              <p className="text-xs text-slate-500 p-2">Loading extracted files...</p>
            ) : (
              <ul className="space-y-0.5">
                {files.map((file) => {
                  const isActive = activeFile?.path === file.path;
                  return (
                    <li key={file.path}>
                      <button
                        type="button"
                        onClick={() => setSelectedPath(file.path)}
                        className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 text-left text-xs rounded-md transition-colors ${
                          isActive
                            ? 'bg-white text-teal-800 font-semibold border border-slate-200 shadow-sm'
                            : 'text-slate-700 hover:bg-white/70'
                        }`}
                      >
                        <span className="flex items-center gap-1.5 truncate">
                          <FileCode2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate font-mono">{file.path}</span>
                        </span>
                        <span className="font-mono tabular-nums text-[11px] text-slate-400 shrink-0">
                          {(file.size / 1024).toFixed(1)}k
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </aside>

          {/* File Content Viewer */}
          <div className="flex-1 min-w-0 flex flex-col overflow-hidden bg-white">
            {activeFile ? (
              <>
                <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between gap-4 shrink-0 bg-white">
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-semibold text-slate-900 truncate">
                      ClinicalTrust-AI/{activeFile.path}
                    </p>
                    <p className="font-mono text-[11px] text-slate-500">
                      {activeFile.size.toLocaleString()} bytes
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleCopyFile}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 hover:bg-slate-100 rounded-md transition-colors"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-700" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copied ? 'Copied' : 'Copy'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownloadSingleFile(activeFile)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-teal-800 bg-teal-50 border border-teal-200 hover:bg-teal-100 rounded-md transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download File</span>
                    </button>
                  </div>
                </div>
                <pre className="flex-1 overflow-auto p-5 text-xs font-mono text-slate-800 bg-slate-50/50 leading-relaxed">
                  {activeFile.content}
                </pre>
              </>
            ) : (
              <div className="p-8 text-sm text-slate-500">Select a file from the left tree to inspect or download.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
