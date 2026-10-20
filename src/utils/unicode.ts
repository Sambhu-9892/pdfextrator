// Unicode and text utilities for Nepali (Devanagari) + English extraction.

// Devanagari Unicode block range: U+0900–U+097F
export const DEVANAGARI_BLOCK_START = 0x0900;
export const DEVANAGARI_BLOCK_END = 0x097F;

export const DEVANAGARI_DIGITS = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];

export function isDevanagari(ch: string): boolean {
  if (!ch || ch.length !== 1) return false;
  const cp = ch.codePointAt(0);
  return cp !== undefined && cp >= DEVANAGARI_BLOCK_START && cp <= DEVANAGARI_BLOCK_END;
}

export function isDevanagariDigit(ch: string): boolean {
  return DEVANAGARI_DIGITS.includes(ch);
}

// Combine a text run of PDF.js TextItem objects into a single string.
// PDF.js gives text items with optional str and dir. We join with spaces
// only between items, then normalize. We deliberately avoid inserting
// spaces inside a single item (which may contain combining marks).
export function joinTextItems(items: ArrayLike<{ str?: string; dir?: string }>): string {
  const parts: string[] = [];
  for (let i = 0; i < items.length; i++) {
    const str = items[i]?.str;
    if (str !== undefined && str !== null) {
      parts.push(String(str));
    }
  }
  return parts.join(' ');
}

// Normalize text to NFC (canonical composition) which preserves Devanagari
// vowel signs/conjuncts while giving a stable representation. Does not
// discard any original content.
export function normalizeNFC(text: string): string {
  return text.normalize('NFC');
}

// Strip only leading/trailing whitespace; preserve internal structure.
export function trimText(text: string): string {
  return text.replace(/^\s+|\s+$/g, '');
}

// Collapse runs of whitespace (3+ newlines) into a max of two newlines
// to preserve paragraph breaks without runaway vertical space.
export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

// Sanitize a filename for safe download.
export function sanitizeFilename(name: string, fallback = 'extracted-text'): string {
  let safe = name
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!safe || safe === '.' || safe === '..') safe = fallback;
  // cap length
  if (safe.length > 120) safe = safe.slice(0, 120);
  return safe;
}

export function isEmptyText(text: string | null | undefined): boolean {
  return text == null || text.trim().length === 0;
}

// Heuristic: detect text that was extracted from a PDF with a broken or
// legacy font encoding (e.g. Preeti/Kantipur Nepali fonts or subset fonts
// without a ToUnicode map). Such text is usually a mix of random Latin
// letters and symbol characters rather than real words. When this is true,
// OCR is the reliable way to recover the actual Devanagari/English text.
export function looksLikeGarbledText(text: string): boolean {
  if (!text) return false;
  const visible = text.replace(/\s+/g, '');
  if (visible.length < 60) return false;

  const lettersAndMarks = (text.match(/[\p{L}\p{M}]/gu) ?? []).length;
  const symbolChars = (text.match(/[<>{}$*+=|~^`\\]/g) ?? []).length;
  const symbolRatio = symbolChars / visible.length;
  const letterRatio = lettersAndMarks / visible.length;

  // Garbled legacy-font extractions are symbol-heavy and word-poor.
  return symbolChars >= 4 && (symbolRatio > 0.025 || letterRatio < 0.55);
}

