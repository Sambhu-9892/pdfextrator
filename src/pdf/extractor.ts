import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import {
  normalizeNFC,
  trimText,
} from '../utils/unicode';
import { isPdfMime, isPdfUrl, isProbablyPdfUrl } from '../utils/url';
import type {
  ExtractionResult,
  ExtractedPage,
  PageTextOptions,
} from '../types';
import { MAX_PAGES, MAX_FILE_SIZE_BYTES, makePdfError } from '../types';

export { isPdfMime, isPdfUrl, isProbablyPdfUrl };

export interface ExtractOptions {
  fileName?: string;
  sourceUrl?: string;
  normalizeUnicode?: boolean;
  pages?: number[];
  abortSignal?: AbortSignal;
  onProgress?: (progress: { page: number; total: number; text: string }) => void;
}

export interface PdfPageLike {
  getTextContent(opts?: any): Promise<{
    items: Array<{ str?: string; dir?: string; transform?: number[] }>;
  }>;
}

export interface PDFDocLike {
  numPages: number;
  getPage(n: number): Promise<PdfPageLike>;
  destroy?(): void;
}

let pdfJsInitialized = false;

export function initPdfJs(workerUrl: string): void {
  if (pdfJsInitialized) return;
  GlobalWorkerOptions.workerSrc = workerUrl;
  pdfJsInitialized = true;
}

export async function fetchPdfBytes(
  url: string,
  opts?: { signal?: AbortSignal; credentials?: RequestCredentials }
): Promise<ArrayBuffer> {
  const response = await fetch(url, {
    signal: opts?.signal,
    credentials: opts?.credentials ?? 'same-origin',
    redirect: 'follow',
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw makePdfError('auth-required', `HTTP ${response.status}`, {
        userFriendly: 'Access to this PDF requires authentication.',
        retryable: false,
        suggestion: 'Log in to the site in a Firefox tab, then try again, or download the PDF and import it.',
      });
    }
    throw makePdfError('fetch-failed', `HTTP ${response.status}`, {
      userFriendly: `Could not download the PDF (HTTP ${response.status}).`,
      retryable: true,
      suggestion: 'Check your internet connection and try again.',
    });
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!isPdfMime(contentType) && !isPdfUrl(url)) {
    if (!isPdfUrl(url)) {
      throw makePdfError('unsupported', `Not a PDF: ${contentType}`, {
        userFriendly: 'The linked URL does not appear to be a PDF document.',
        retryable: false,
      });
    }
  }

  return response.arrayBuffer();
}

export function validatePdfBytes(bytes: ArrayBuffer, fileName: string): void {
  const size = bytes.byteLength;
  if (size === 0) {
    throw makePdfError('malformed', 'Empty PDF file.', {
      userFriendly: 'The PDF file is empty.',
      retryable: false,
    });
  }
  if (size > MAX_FILE_SIZE_BYTES) {
    throw makePdfError('size-limit', `File ${size} bytes exceeds limit ${MAX_FILE_SIZE_BYTES}.`, {
      userFriendly: 'The PDF file is too large to process.',
      retryable: false,
      suggestion: 'Try a smaller document or extract a subset of pages.',
    });
  }
  const header = new Uint8Array(bytes.slice(0, 8));
  const startsWithPdf =
    header[0] === 0x25 &&
    header[1] === 0x50 &&
    header[2] === 0x44 &&
    header[3] === 0x46; // %PDF
  if (!startsWithPdf) {
    throw makePdfError('unsupported', `File ${fileName} does not appear to be a PDF.`, {
      userFriendly: 'The file does not appear to be a valid PDF document.',
      retryable: false,
    });
  }
}

function extensionUrl(path: string): string | undefined {
  const g: any = globalThis;
  const runtime = g.browser?.runtime ?? g.chrome?.runtime;
  if (runtime?.getURL) {
    try {
      return runtime.getURL(path);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function ensurePdfWorkerConfigured(): void {
  if (GlobalWorkerOptions.workerSrc) return;
  const workerUrl = extensionUrl('pdf/pdf.worker.min.mjs');
  if (workerUrl) GlobalWorkerOptions.workerSrc = workerUrl;
}

export async function loadPdfDocument(bytes: ArrayBuffer): Promise<PDFDocLike> {
  ensurePdfWorkerConfigured();
  // PDF.js transfers the input buffer to its worker, detaching it on the main
  // thread. Copy so callers can reuse the bytes (e.g. native extract then OCR).
  const data = bytes.byteLength > 0 ? bytes.slice(0) : bytes;
  if (!data.byteLength) {
    throw makePdfError('empty-file', 'The PDF file is empty.', {
      userFriendly: 'The PDF file is empty.',
      retryable: false,
      suggestion: 'Choose a valid PDF file and try again.',
    });
  }
  const params: Record<string, unknown> = { data };
  const cmapUrl = extensionUrl('pdf/cmaps/');
  const fontUrl = extensionUrl('pdf/standard_fonts/');
  if (cmapUrl) {
    params.cMapUrl = cmapUrl;
    params.cMapPacked = true;
  }
  if (fontUrl) params.standardFontDataUrl = fontUrl;
  const loadingTask = getDocument(params);
  const doc = (await loadingTask.promise) as unknown as PDFDocLike;
  return doc;
}

export function itemsToLineGroups(
  items: Array<{ str?: string; transform?: number[] }>,
  lineTolerance: number = 1.5
): { x: number; y: number; str: string }[] {
  const normalized = items
    .map((it) => ({
      str: it.str ?? '',
      x: it.transform?.[4] ?? 0,
      y: it.transform?.[5] ?? 0,
    }))
    .filter((it) => it.str.length > 0)
    .sort((a, b) => {
      const dy = a.y - b.y;
      if (Math.abs(dy) > lineTolerance) return dy;
      return a.x - b.x;
    });

  const lines: { items: { x: number; str: string }[]; y: number }[] = [];
  for (const it of normalized) {
    let placed = false;
    for (const line of lines) {
      if (Math.abs(line.y - it.y) <= lineTolerance) {
        line.items.push(it);
        placed = true;
        break;
      }
    }
    if (!placed) {
      lines.push({ y: it.y, items: [{ x: it.x, str: it.str }] });
    }
  }
  return lines.map((line) => ({
    x: Math.min(...line.items.map((i) => i.x)),
    y: line.y,
    str: line.items.map((i) => i.str).join(' '),
  }));
}

function textContentToText(
  content: { items: Array<{ str?: string; transform?: number[] }> },
  normalizeUnicode: boolean
): string {
  const lines = itemsToLineGroups(content.items);
  const lineStrings = lines.map((l) => trimText(l.str));
  let text = lineStrings.filter((s) => s.length > 0).join('\n');
  if (normalizeUnicode) {
    text = normalizeNFC(text);
  }
  return text;
}

export async function extractPageText(
  page: PdfPageLike,
  opts: PageTextOptions & { normalizeUnicode?: boolean }
): Promise<string> {
  const content = await page.getTextContent({
    normalizeWhitespace: true,
    combineTextNormals: true,
  });
  return textContentToText(content, opts.normalizeUnicode !== false);
}

export async function extractDocument(
  bytes: ArrayBuffer,
  options: ExtractOptions = {}
): Promise<ExtractionResult> {
  const {
    fileName = 'document.pdf',
    sourceUrl,
    normalizeUnicode = true,
    pages,
    abortSignal,
    onProgress,
  } = options;

  validatePdfBytes(bytes, fileName);

  const doc = await loadPdfDocument(bytes);
  const totalPages = doc.numPages;
  if (totalPages > MAX_PAGES) {
    throw makePdfError('size-limit', `Document has ${totalPages} pages (max ${MAX_PAGES}).`, {
      userFriendly: 'This PDF has too many pages to extract at once.',
      retryable: false,
      suggestion: 'Extract a smaller range of pages.',
    });
  }

  const targetPages = pages?.filter((p) => p >= 1 && p <= totalPages) ||
    Array.from({ length: totalPages }, (_, i) => i + 1);

  const extractedPages: ExtractedPage[] = [];
  const fullTextParts: string[] = [];

  for (let i = 0; i < targetPages.length; i++) {
    if (abortSignal?.aborted) {
      throw makePdfError('cancelled', 'Extraction cancelled by user.', {
        userFriendly: 'Extraction was cancelled.',
        retryable: true,
      });
    }

    const pageNum = targetPages[i];
    let page: PdfPageLike;
    try {
      page = await doc.getPage(pageNum);
    } catch (err) {
      extractedPages.push({
        page: pageNum,
        text: '',
        textLength: 0,
        hasText: false,
        source: 'native',
        error: `Failed to load page ${pageNum}: ${err}`,
      });
      continue;
    }

    let text = '';
    let hasText = false;
    let pageError: string | undefined;
    try {
      text = await extractPageText(page, { normalizeUnicode });
      text = trimText(text);
      hasText = text.length > 0;
    } catch (err) {
      pageError = err instanceof Error ? err.message : String(err);
      text = '';
      hasText = false;
    }

    if (hasText) fullTextParts.push(text);
    extractedPages.push({
      page: pageNum,
      text,
      textLength: text.length,
      hasText,
      source: 'native',
      error: pageError,
    });

    onProgress?.({ page: pageNum, total: totalPages, text: fullTextParts.join('\n') });
  }

  const fullText = fullTextParts.join('\n\n---\n\n');

  return {
    docId: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    title: fileName.replace(/\.pdf$/i, ''),
    sourceUrl,
    totalPages,
    pages: extractedPages,
    fullText,
    metadata: {},
    extractedAt: Date.now(),
    method: 'native',
  };
}

export async function extractFromFile(
  file: File,
  options: ExtractOptions = {}
): Promise<ExtractionResult> {
  const arrayBuffer = await file.arrayBuffer();
  return extractDocument(arrayBuffer, {
    ...options,
    fileName: file.name,
  });
}

export function releaseDocument(doc: PDFDocLike): void {
  try {
    doc.destroy?.();
  } catch {
    // ignore
  }
}
