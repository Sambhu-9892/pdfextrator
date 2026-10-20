import { sanitizeFilename } from '../utils/unicode';
import type { ExtractionResult } from '../types';

const DEVANAGARI_FONT = 'Noto Sans Devanagari';

export interface ExportOptions {
  fileName?: string;
  includeMetadata?: boolean;
}

function blobToDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = sanitizeFilename(fileName);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportTxt(result: ExtractionResult, opts: ExportOptions = {}): void {
  const safeName = opts.fileName || result.title || 'extracted-text';
  const lines: string[] = [];
  if (opts.includeMetadata !== false) {
    lines.push(`Title: ${result.title}`);
    lines.push(`Source: ${result.sourceUrl ?? 'Local file'}`);
    lines.push(`Pages: ${result.totalPages}`);
    lines.push(`Method: ${result.method}`);
    lines.push(`Extracted: ${new Date(result.extractedAt).toISOString()}`);
    lines.push('='.repeat(60));
    lines.push('');
  }
  lines.push(result.fullText);
  const content = lines.join('\n');
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  blobToDownload(blob, `${safeName}.txt`);
}

export function exportJson(result: ExtractionResult, opts: ExportOptions = {}): void {
  const safeName = opts.fileName || result.title || 'extracted-text';
  const payload = {
    title: result.title,
    sourceUrl: result.sourceUrl,
    totalPages: result.totalPages,
    method: result.method,
    extractedAt: result.extractedAt,
    fullText: result.fullText,
    pages: result.pages.map((p) => ({
      page: p.page,
      text: p.text,
      textLength: p.textLength,
      hasText: p.hasText,
      source: p.source,
      error: p.error,
    })),
    metadata: opts.includeMetadata !== false ? result.metadata : {},
  };
  const content = JSON.stringify(payload, null, 2);
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  blobToDownload(blob, `${safeName}.json`);
}

export async function exportDocx(result: ExtractionResult, opts: ExportOptions = {}): Promise<void> {
  const { Document, Packer, Paragraph, TextRun, AlignmentType } = await import('docx');
  const safeName = opts.fileName || result.title || 'extracted-text';

  const children: any[] = [];

  if (opts.includeMetadata !== false) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.LEFT,
        children: [new TextRun({ text: `Title: ${result.title}`, bold: true })],
      }),
      new Paragraph({
        children: [new TextRun({ text: `Source: ${result.sourceUrl ?? 'Local file'}` })],
      }),
      new Paragraph({
        children: [new TextRun({ text: `Pages: ${result.totalPages}` })],
      }),
      new Paragraph({
        children: [new TextRun({ text: `Method: ${result.method}` })],
      }),
      new Paragraph({ children: [new TextRun({ text: '' })] })
    );
  }

  for (const page of result.pages) {
    if (!page.text) continue;
    const paraText = page.text.split('\n').map((line: string) => line).join('\n');
    children.push(
      new Paragraph({
        children: [new TextRun({ text: `--- Page ${page.page} ---`, bold: true })],
      }),
      new Paragraph({
        children: [new TextRun({ text: paraText, font: DEVANAGARI_FONT })],
      })
    );
  }

  const doc = new Document({
    sections: [{ children }],
    styles: {
      default: {
        document: {
          run: {
            font: DEVANAGARI_FONT,
            size: 22,
          },
        },
      },
    },
  });

  const blob = await Packer.toBlob(doc);
  blobToDownload(blob, `${safeName}.docx`);
}

export type ExportFormat = 'txt' | 'json' | 'docx';

export async function exportResult(
  result: ExtractionResult,
  format: ExportFormat,
  opts: ExportOptions = {}
): Promise<void> {
  switch (format) {
    case 'txt':
      exportTxt(result, opts);
      return;
    case 'json':
      exportJson(result, opts);
      return;
    case 'docx':
      await exportDocx(result, opts);
      return;
    default:
      throw new Error(`Unsupported export format: ${format}`);
  }
}
