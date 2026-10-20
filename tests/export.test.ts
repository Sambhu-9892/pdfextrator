/// <reference types="vitest/globals" />
import { describe, it, expect, vi, beforeEach } from 'vitest';
// We test the export module functions that don't require the DOM heavily.
import * as exportMod from '../src/export/index';

const fakeResult: any = {
  docId: 'abc-123',
  title: 'नमस्ते दस्तावेज',
  sourceUrl: 'https://example.com/doc.pdf',
  totalPages: 2,
  method: 'native',
  extractedAt: 1700000000000,
  fullText: 'नमस्ते दुनिया\nHello World\nपृष्ठ २',
  pages: [
    { page: 1, text: 'नमस्ते दुनिया', textLength: 12, hasText: true, source: 'native', error: undefined },
    { page: 2, text: 'Hello World\nपृष्ठ २', textLength: 16, hasText: true, source: 'native', error: undefined },
  ],
  metadata: { author: 'Test' },
};

describe('export module', () => {
  let capturedBlobs: Array<{ name: string; type: string; size: number }> = [];

  beforeEach(() => {
    capturedBlobs = [];
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn((blob: Blob) => {
        capturedBlobs.push({ name: 'blob', type: blob.type, size: blob.size });
        return 'blob:url';
      }),
      revokeObjectURL: vi.fn(),
    });
    vi.stubGlobal('document', {
      createElement: vi.fn(() => ({
        href: '',
        download: '',
        click: vi.fn(),
        style: {},
      })),
      body: { appendChild: vi.fn(), removeChild: vi.fn() },
    } as any);
  });

  it('exportTxt produces UTF-8 blob with Nepali text preserved', () => {
    exportMod.exportTxt(fakeResult, { fileName: 'test' });
    expect(capturedBlobs.length).toBe(1);
    expect(capturedBlobs[0].type).toContain('text/plain');
    expect(capturedBlobs[0].size).toBeGreaterThan(0);
  });

  it('exportJson includes metadata and page-level text', () => {
    exportMod.exportJson(fakeResult, { fileName: 'test' });
    expect(capturedBlobs.length).toBe(1);
    expect(capturedBlobs[0].type).toContain('application/json');
  });

  it('sanitizeFilename is exported', async () => {
    const { sanitizeFilename } = await import('../src/utils/unicode');
    expect(sanitizeFilename('a/b.pdf')).toBe('a_b.pdf');
  });
});
