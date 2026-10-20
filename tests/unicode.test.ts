/// <reference types="vitest/globals" />
import { describe, it, expect } from 'vitest';
import {
  isDevanagari,
  isDevanagariDigit,
  joinTextItems,
  normalizeNFC,
  trimText,
  normalizeWhitespace,
  sanitizeFilename,
  looksLikeGarbledText,
  DEVANAGARI_DIGITS,
} from '../src/utils/unicode';

describe('unicode utilities', () => {
  it('detects Devanagari characters', () => {
    expect(isDevanagari('न')).toBe(true);
    expect(isDevanagari('ा')).toBe(true); // vowel sign aa
    expect(isDevanagari('A')).toBe(false);
    expect(isDevanagari(' ')).toBe(false);
    expect(isDevanagari('')).toBe(false);
  });

  it('detects Devanagari digits', () => {
    expect(DEVANAGARI_DIGITS).toContain('०');
    expect(DEVANAGARI_DIGITS).toContain('९');
    expect(isDevanagariDigit('५')).toBe(true);
    expect(isDevanagariDigit('5')).toBe(false);
  });

  it('joins text items without inserting spaces inside items', () => {
    const items = [
      { str: 'नमस्ते', dir: 'ltr' },
      { str: ' world', dir: 'ltr' },
      { str: 'अनुच्छेद', dir: 'ltr' },
    ];
    expect(joinTextItems(items)).toBe('नमस्ते  world अनुच्छेद');
  });

  it('normalizes to NFC', () => {
    // composed form stays composed
    expect(normalizeNFC('नमस्ते')).toBe('नमस्ते');
  });

  it('trims leading/trailing whitespace only', () => {
    expect(trimText('  नमस्ते  ')).toBe('नमस्ते');
    expect(trimText('नमस्ते world')).toBe('नमस्ते world');
  });

  it('collapses whitespace', () => {
    expect(normalizeWhitespace('a    b\n\n\nc')).toBe('a b c');
  });

  it('sanitizes filenames', () => {
    expect(sanitizeFilename('my report.pdf')).toBe('my_report.pdf');
    expect(sanitizeFilename('../../etc/passwd')).toBe('.._.._etc_passwd');
    expect(sanitizeFilename('')).toBe('extracted-text');
  });
});

describe('looksLikeGarbledText', () => {
  it('flags legacy-font gibberish', () => {
    const gibberish =
      'friuT-r, tsq loBE<,\nla qRqq\nSfr-dT\nil. {tia Rr+<rcn$-r, ani\' lEtss\n8t\nio. {qgsq 1orsl i orfffi+.\n*ft q:qRr q*ft-c,\n*+rfr 1qs,bY errgEr\n?a rrrG qrgzr-Y,\n* $ +.qp6 qft-cr+6\'c, 1tq10';
    expect(looksLikeGarbledText(gibberish)).toBe(true);
  });

  it('does not flag normal Nepali or English text', () => {
    const nepali =
      'नेपालको संविधानले प्रत्येक नागरिकलाई शिक्षाको अधिकार दिएको छ। ' +
      'यो पाठ्यपुस्तक कक्षा दसमा अध्ययन गर्ने विद्यार्थीका लागि तयार गरिएको हो। ' +
      'अभ्यास गर्नुहोस् र आफ्नो उत्तर शिक्षकसँग जाँच्नुहोस्।';
    const english =
      'The Constitution of Nepal guarantees every citizen the right to education. ' +
      'This textbook is prepared for students studying in grade ten. Practise the ' +
      'exercises and check your answers with your teacher.';
    expect(looksLikeGarbledText(nepali)).toBe(false);
    expect(looksLikeGarbledText(english)).toBe(false);
    expect(looksLikeGarbledText('')).toBe(false);
    expect(looksLikeGarbledText('short * text')).toBe(false);
  });
});
