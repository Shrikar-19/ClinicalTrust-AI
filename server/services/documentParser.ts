import mammoth from 'mammoth';
import path from 'path';
import { extractText, getDocumentProxy } from 'unpdf';

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB limit
export const ALLOWED_EXTENSIONS = new Set(['.pdf', '.txt', '.docx']);

export interface ParsedDocumentResult {
  safeFileName: string;
  fileType: 'PDF' | 'TXT' | 'DOCX';
  pageCount: number;
  rawText: string;
}

/**
 * Sanitizes an uploaded filename and verifies it cannot traverse directories.
 */
export function sanitizeDocumentName(originalName: string): string {
  const base = path.basename(originalName).replace(/[^a-zA-Z0-9._-]/g, '_');
  if (!base || base === '.' || base === '..') {
    throw new Error('Invalid document filename.');
  }
  const safeBaseDir = path.resolve(process.cwd(), 'data', 'uploads');
  const resolved = path.resolve(safeBaseDir, base);
  if (!resolved.startsWith(safeBaseDir + path.sep)) {
    throw new Error('Path traversal rejected.');
  }
  return base;
}

/**
 * Validates file extension, MIME/buffer constraints, and extracts plain text
 * from PDF, TXT, or DOCX without executing any embedded scripts or macros.
 */
export async function parseUploadedDocument(
  originalName: string,
  buffer: Buffer,
  declaredSize: number
): Promise<ParsedDocumentResult> {
  if (declaredSize <= 0 || buffer.length === 0) {
    throw new Error(`Document "${originalName}" is empty.`);
  }
  if (declaredSize > MAX_FILE_SIZE_BYTES || buffer.length > MAX_FILE_SIZE_BYTES) {
    throw new Error(`Document "${originalName}" exceeds the 10 MB file size limit.`);
  }

  const safeFileName = sanitizeDocumentName(originalName);
  const ext = path.extname(safeFileName).toLowerCase();

  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error(`Unsupported file type "${ext}". Allowed types: PDF, TXT, DOCX.`);
  }

  if (ext === '.txt') {
    const text = buffer.toString('utf8').replace(/\0/g, '').trim();
    if (!text) {
      throw new Error(`Text file "${safeFileName}" contains no readable content.`);
    }
    return {
      safeFileName,
      fileType: 'TXT',
      pageCount: 1,
      rawText: text,
    };
  }

  if (ext === '.docx') {
    // Verify ZIP signature (PK) for DOCX
    if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
      throw new Error(`File "${safeFileName}" is not a valid DOCX archive.`);
    }
    const result = await mammoth.extractRawText({ buffer });
    const text = (result.value || '').trim();
    if (!text) {
      throw new Error(`DOCX file "${safeFileName}" contains no extractable text.`);
    }
    return {
      safeFileName,
      fileType: 'DOCX',
      pageCount: Math.max(1, Math.ceil(text.length / 2800)),
      rawText: text,
    };
  }

  // ext === '.pdf'
  if (buffer.length < 5 || buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
    throw new Error(`File "${safeFileName}" is not a valid PDF document.`);
  }

  const uint8 = new Uint8Array(buffer);
  const pdf = await getDocumentProxy(uint8);
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  const pages = Array.isArray(text) ? text : [String(text || '')];
  const formattedPages = pages
    .map((pageText, idx) => `[Page ${idx + 1}]\n${pageText.trim()}`)
    .filter((p) => p.length > 10)
    .join('\n\n');

  if (!formattedPages.trim()) {
    throw new Error(
      `PDF "${safeFileName}" contains no extractable text layer (scanned image PDFs require OCR text layer).`
    );
  }

  return {
    safeFileName,
    fileType: 'PDF',
    pageCount: totalPages || pages.length || 1,
    rawText: formattedPages,
  };
}
