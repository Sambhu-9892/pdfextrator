/// <reference types="vitest/globals" />
import { describe, it, expect } from 'vitest';
import { isPdfMime, isPdfUrl, isProbablyPdfUrl, originPattern } from '../src/utils/url';

describe('isPdfUrl', () => {
  it('accepts .pdf paths', () => {
    expect(isPdfUrl('https://example.com/report.pdf')).toBe(true);
    expect(isPdfUrl('https://example.com/docs/report.PDF')).toBe(true);
    expect(isPdfUrl('file:///home/user/report.pdf')).toBe(true);
  });

  it('rejects non-PDF URLs', () => {
    expect(isPdfUrl('https://example.com/page.html')).toBe(false);
    expect(isPdfUrl('https://example.com/download?file=doc.pdf')).toBe(false);
    expect(isPdfUrl(undefined)).toBe(false);
    expect(isPdfUrl('')).toBe(false);
  });
});

describe('isProbablyPdfUrl', () => {
  it('accepts PDF hints in path and query', () => {
    expect(isProbablyPdfUrl('https://example.com/report.pdf?x=1')).toBe(true);
    expect(isProbablyPdfUrl('https://example.com/download?file=doc.pdf')).toBe(true);
    expect(isProbablyPdfUrl('https://example.com/export?format=pdf')).toBe(true);
  });

  it('rejects unrelated URLs', () => {
    expect(isProbablyPdfUrl('https://example.com/article')).toBe(false);
    expect(isProbablyPdfUrl('not a url')).toBe(false);
  });
});

describe('isPdfMime', () => {
  it('recognizes PDF MIME types', () => {
    expect(isPdfMime('application/pdf')).toBe(true);
    expect(isPdfMime('application/x-pdf')).toBe(true);
    expect(isPdfMime('text/html')).toBe(false);
    expect(isPdfMime(null)).toBe(false);
  });
});

describe('originPattern', () => {
  it('builds a host permission pattern', () => {
    expect(originPattern('https://example.com/a/b.pdf')).toBe('https://example.com/*');
    expect(originPattern('http://localhost:8080/x.pdf')).toBe('http://localhost:8080/*');
  });

  it('rejects non-http(s) schemes', () => {
    expect(originPattern('file:///tmp/x.pdf')).toBeNull();
    expect(originPattern('moz-extension://abc/x.pdf')).toBeNull();
    expect(originPattern('nonsense')).toBeNull();
  });
});
