/// <reference types="vitest/globals" />
import { describe, it, expect } from 'vitest';
import { extractPageText, itemsToLineGroups } from '../src/pdf/extractor';

// Mock PDF.js page that returns a known TextContent.
function makePage(items: Array<{ str: string; transform: number[] }>) {
  return {
    getTextContent: async () => ({
      items: items.map((it) => ({
        str: it.str,
        dir: 'ltr',
        transform: it.transform,
        width: 0,
        height: 0,
      })),
    }),
  } as any;
}

describe('pdf text extraction', () => {
  it('extracts English text line by line', async () => {
    const page = makePage([
      { str: 'Hello', transform: [1, 0, 0, 1, 10, 100] },
      { str: 'World', transform: [1, 0, 0, 1, 60, 100] },
      { str: 'Line two', transform: [1, 0, 0, 1, 10, 80] },
    ]);
    const text = await extractPageText(page, { pageNumber: 1, normalizeUnicode: true });
    expect(text).toContain('Hello World');
    expect(text).toContain('Line two');
  });

  it('extracts Nepali Devanagari text preserving characters', async () => {
    const page = makePage([
      { str: 'नमस्ते', transform: [1, 0, 0, 1, 10, 100] },
      { str: 'नेपाली', transform: [1, 0, 0, 1, 60, 100] },
    ]);
    const text = await extractPageText(page, { pageNumber: 1, normalizeUnicode: true });
    expect(text).toContain('नमस्ते');
    expect(text).toContain('नेपाली');
  });

  it('extracts mixed Nepali-English content', async () => {
    const page = makePage([
      { str: 'Name: राम', transform: [1, 0, 0, 1, 10, 100] },
      { str: 'Address: काठमाडौं', transform: [1, 0, 0, 1, 10, 80] },
    ]);
    const text = await extractPageText(page, { pageNumber: 1, normalizeUnicode: true });
    expect(text).toContain('Name: राम');
    expect(text).toContain('Address: काठमाडौं');
  });

  it('preserves Devanagari digits and combining marks', async () => {
    const page = makePage([
      { str: '२०७९', transform: [1, 0, 0, 1, 10, 100] },
      { str: 'क्‍ष', transform: [1, 0, 0, 1, 50, 100] }, // conjunct ksha
    ]);
    const text = await extractPageText(page, { pageNumber: 1, normalizeUnicode: true });
    expect(text).toContain('२०७९');
    expect(text).toContain('क्‍ष');
  });

  it('groups items into lines by y position', () => {
    const lines = itemsToLineGroups([
      { str: 'A', transform: [1, 0, 0, 1, 10, 100] },
      { str: 'B', transform: [1, 0, 0, 1, 30, 100] },
      { str: 'C', transform: [1, 0, 0, 1, 10, 80] },
    ]);
    expect(lines.length).toBe(2);
    // C (y=80) sorts above A/B (y=100)
    expect(lines[0].str).toBe('C');
    expect(lines[1].str).toBe('A B');
  });

  it('returns empty string for no items', async () => {
    const page = makePage([]);
    const text = await extractPageText(page, { pageNumber: 1, normalizeUnicode: true });
    expect(text).toBe('');
  });
});
