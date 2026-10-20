import { loadPdfDocument } from '../pdf/extractor';
import { ocrPage } from './index';
import { normalizeNFC, trimText } from '../utils/unicode';
import type { ExtractionResult, ExtractedPage } from '../types';
import { MAX_PAGES, makePdfError } from '../types';

export interface PdfOcrOptions {
  fileName?: string;
  sourceUrl?: string;
  pages?: number[];
  scale?: number;
  lang?: string;
  signal?: AbortSignal;
  onProgress?: (progress: {
    status: string;
    percent: number;
    page: number;
    total: number;
    text: string;
  }) => void;
}

/**
 * Render each selected PDF page to a canvas and OCR it with Nepali + English.
 * This is only used for scanned/image PDFs where the native text layer is empty.
 */
export async function extractPdfWithOcr(
  bytes: ArrayBuffer,
  options: PdfOcrOptions = {}
): Promise<ExtractionResult> {
  const {
    fileName = 'scanned-document.pdf',
    sourceUrl,
    pages,
    // ~216 DPI; Devanagari matras need more resolution than Latin text.
    scale = 3,
    signal,
    lang = 'nep+eng',
    onProgress,
  } = options;

  const doc: any = await loadPdfDocument(bytes);
  const totalPages: number = doc.numPages;
  if (totalPages > MAX_PAGES) {
    throw makePdfError('size-limit', `Document has ${totalPages} pages (max ${MAX_PAGES}).`, {
      userFriendly: 'This PDF has too many pages to OCR at once.',
      suggestion: 'OCR a smaller range of pages.',
    });
  }

  const targetPages = pages?.filter((p) => p >= 1 && p <= totalPages) ||
    Array.from({ length: totalPages }, (_, i) => i + 1);

  const extractedPages: ExtractedPage[] = [];
  const fullTextParts: string[] = [];

  for (let i = 0; i < targetPages.length; i++) {
    if (signal?.aborted) {
      throw makePdfError('cancelled', 'OCR cancelled by user.', {
        userFriendly: 'OCR was cancelled.',
        retryable: true,
      });
    }
    const pageNum = targetPages[i];
    onProgress?.({ status: `Rendering page ${pageNum}…`, percent: 0, page: pageNum, total: totalPages, text: '' });

    try {
      const page = await doc.getPage(pageNum);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D context unavailable');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;

      const result = await ocrPage(canvas, {
        lang,
        onProgress: (p) =>
          onProgress?.({
            status: `Recognizing page ${pageNum}…`,
            percent: p.percent,
            page: pageNum,
            total: totalPages,
            text: fullTextParts.join('\n'),
          }),
      });

      let text = normalizeNFC(trimText(result.text));
      // Tesseract often returns spaced-out Devanagari; collapse redundant spaces.
      text = text.replace(/[ \t]{2,}/g, ' ');
      const hasText = text.length > 0;
      if (hasText) fullTextParts.push(text);
      extractedPages.push({
        page: pageNum,
        text,
        textLength: text.length,
        hasText,
        source: 'ocr',
      });
      onProgress?.({
        status: `Page ${pageNum} done`,
        percent: 100,
        page: pageNum,
        total: totalPages,
        text: fullTextParts.join('\n'),
      });
      // Give the UI a chance to paint between heavy pages.
      await new Promise((r) => setTimeout(r, 0));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      extractedPages.push({
        page: pageNum,
        text: '',
        textLength: 0,
        hasText: false,
        source: 'ocr',
        error: message,
      });
    }
  }

  const successful = extractedPages.filter((p) => p.hasText).length;
  const failed = extractedPages.filter((p) => p.error);
  if (successful === 0 && failed.length > 0) {
    const reason = failed[0].error ?? 'Unknown OCR error';
    throw makePdfError('unsupported', `OCR failed: ${reason}`, {
      userFriendly:
        'OCR could not read this PDF. The Nepali/English language data may not have downloaded, or the pages could not be rendered.',
      retryable: true,
      suggestion: 'Check your internet connection, then try again. You can also try a smaller page range.',
    });
  }

  return {
    docId: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    title: fileName.replace(/\.pdf$/i, ''),
    sourceUrl,
    totalPages,
    pages: extractedPages,
    fullText: fullTextParts.join('\n\n---\n\n'),
    metadata: {},
    extractedAt: Date.now(),
    method: 'ocr',
  };
}
