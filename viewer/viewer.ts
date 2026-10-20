// Viewer extension page: full-page extraction workspace.
// Loads extraction results passed via runtime message or storage id.
// Renders per-page text with search, export, copy, and page navigation.

import { exportResult, type ExportFormat } from '../src/export/index';
import { sanitizeFilename, looksLikeGarbledText } from '../src/utils/unicode';
import { extractDocument, fetchPdfBytes } from '../src/pdf/extractor';
import { extractPdfWithOcr } from '../src/ocr/pdfOcr';
import { ocrCancel, ocrWarningHtml, getOcrStatus } from '../src/ocr/index';
import type { ExtractionResult } from '../src/types';

const $ = (id: string) => document.getElementById(id) as HTMLElement;
const $all = (sel: string) => Array.from(document.querySelectorAll(sel));

let result: ExtractionResult | null = null;
let currentPage = 1;
let matches: { page: number; index: number }[] = [];
let currentMatchIdx = -1;
let searchTerm = '';
let abortController: AbortController | null;
let sourceBytes: ArrayBuffer | null = null;
let sourceName = 'document.pdf';

const els = {
  docMeta: $('doc-meta'),
  pageLabel: $('page-label'),
  pageNum: $('page-num'),
  pageTotal: $('page-total'),
  pages: $('pages'),
  placeholder: $('page-placeholder'),
  viewport: $('pages-viewport'),
  search: $('search') as HTMLInputElement,
  searchCount: $('search-count'),
  btnPrev: $('btn-prev') as HTMLButtonElement,
  btnNext: $('btn-next') as HTMLButtonElement,
  btnExtractNative: $('btn-extract-native'),
  btnExtractOcr: $('btn-extract-ocr'),
  ocrStatus: $('ocr-status'),
  selAll: $('sel-all') as HTMLInputElement,
  selCustom: $('sel-custom'),
  selPages: $('sel-pages') as HTMLInputElement,
  sourceFile: $('source-file') as HTMLInputElement,
  btnChooseFile: $('btn-choose-file'),
  sourceHint: $('source-hint'),
  exportTxt: $('btn-export-txt'),
  exportJson: $('btn-export-json'),
  exportDocx: $('btn-export-docx'),
  copyAll: $('btn-copy-all'),
  copyPage: $('btn-copy-page'),
  clear: $('btn-clear'),
  errorPanel: $('error-panel'),
  errorTitle: $('error-title'),
  errorMessage: $('error-message'),
  errorSuggestion: $('error-suggestion'),
  errorDismiss: $('error-dismiss'),
  progress: $('progress-panel'),
  progressLabel: $('progress-label'),
  progressFill: $('progress-fill'),
  btnCancel: $('btn-cancel-progress'),
  title: $('viewer-title'),
  savedList: $('saved-list'),
  btnRefreshSaved: $('btn-refresh-saved'),
  footer: $('footer-text'),
  themeToggle: $('theme-toggle') as HTMLElement,
};

function setTheme(dark: boolean) {
  document.body.classList.toggle('dark', dark);
  localStorage.setItem('nee_theme', dark ? '1' : '0');
  els.themeToggle.setAttribute('aria-checked', String(dark));
}

els.themeToggle.addEventListener('click', () => setTheme(document.body.classList.toggle('dark', !document.body.classList.contains('dark'))));
if (localStorage.getItem('nee_theme') === '1') setTheme(true);

function showError(title: string, message: string, suggestion?: string) {
  els.errorPanel.classList.remove('hidden');
  els.errorTitle.textContent = title;
  els.errorMessage.textContent = message;
  els.errorSuggestion.textContent = suggestion || '';
  els.errorSuggestion.classList.toggle('hidden', !suggestion);
}
els.errorDismiss.addEventListener('click', () => els.errorPanel.classList.add('hidden'));

function showProgress(show: boolean, label = 'Processing…') {
  els.progress.classList.toggle('hidden', !show);
  els.progressLabel.textContent = label;
  if (show) els.progressFill.style.width = '0%';
}
function setProgress(pct: number) {
  els.progressFill.style.width = Math.max(0, Math.min(100, pct)) + '%';
}
void setProgress;

function hydrateResult(saved: any): ExtractionResult {
  const rawPages = Array.isArray(saved?.pages) ? saved.pages : [];
  const pages = rawPages.map((p: any) => {
    const text = typeof p.text === 'string' ? p.text : '';
    return {
      page: p.page,
      text,
      textLength: typeof p.textLength === 'number' ? p.textLength : text.length,
      hasText: typeof p.hasText === 'boolean' ? p.hasText : text.trim().length > 0,
      source: p.source === 'ocr' ? 'ocr' : 'native',
      error: p.error,
    };
  });
  const fullText =
    typeof saved?.fullText === 'string'
      ? saved.fullText
      : pages.map((p: { text: string }) => p.text).filter(Boolean).join('\n\n---\n\n');
  return {
    docId: saved?.docId ?? saved?.id ?? `local-${Date.now()}`,
    title: saved?.title ?? 'Extracted Text',
    sourceUrl: saved?.sourceUrl,
    totalPages: typeof saved?.totalPages === 'number' ? saved.totalPages : pages.length,
    pages,
    fullText,
    metadata: saved?.metadata ?? {},
    extractedAt: saved?.extractedAt ?? saved?.createdAt ?? Date.now(),
    method: saved?.method === 'ocr' || saved?.method === 'mixed' ? saved.method : 'native',
  };
}

function renderMeta() {
  if (!result) return;
  const meta = result.metadata || {};
  const parts: string[] = [];
  if (result.sourceUrl) parts.push(`Source: ${result.sourceUrl}`);
  parts.push(`Pages: ${result.totalPages}`);
  parts.push(`Method: ${result.method === 'ocr' ? 'OCR' : result.method === 'mixed' ? 'Native + OCR' : 'Native'}`);
  parts.push(`Extracted: ${new Date(result.extractedAt).toLocaleString()}`);
  if (meta.title) parts.unshift(`Title: ${meta.title}`);
  els.docMeta.textContent = parts.join(' · ');
  els.title.textContent = result.title || 'Extracted Text';
  document.title = `${result.title} · PDF Workspace`;
}

function paginateText(text: string): string[] {
  return text.split('\n\n---\n\n').filter((s) => s.length > 0);
}

function renderPages() {
  if (!result) {
    els.pages.innerHTML = '';
    els.pageTotal.textContent = '0';
    els.pageNum.textContent = '0';
    return;
  }
  const pageTexts = paginateText(result.fullText);
  const pages = result.pages;
  els.pageTotal.textContent = String(result.totalPages);
  els.pages.innerHTML = '';

  let displayed = 0;
  for (const page of pages) {
    const text = pageTexts[page.page - 1] ?? page.text;
    const card = document.createElement('div');
    card.className = 'page-card';
    const header = document.createElement('div');
    header.className = 'header';
    const badge = document.createElement('span');
    badge.className = 'page-badge';
    badge.textContent = `Page ${page.page}`;
    const tag = document.createElement('span');
    tag.className = `source-tag ${page.source === 'ocr' ? 'ocr' : ''}`;
    tag.textContent = page.source === 'ocr' ? 'OCR' : 'Native';
    header.appendChild(badge);
    header.appendChild(tag);

    const textDiv = document.createElement('div');
    textDiv.className = `page-text ${page.hasText ? '' : 'empty'}`;
    textDiv.setAttribute('aria-label', `Page ${page.page} text`);
    if (page.error) {
      textDiv.textContent = '';
      const err = document.createElement('div');
      err.className = 'page-error';
      err.textContent = `Error: ${page.error}`;
      textDiv.appendChild(err);
    } else if (text) {
      textDiv.textContent = text;
    } else {
      textDiv.textContent = '(No extractable text on this page)';
    }
    card.appendChild(header);
    card.appendChild(textDiv);
    els.pages.appendChild(card);
    displayed++;
  }

  // show placeholder if no pages
  els.placeholder.classList.toggle('hidden', displayed > 0);

  goToPage(currentPage, false);
}

function goToPage(page: number, scroll = true) {
  if (!result) return;
  currentPage = Math.max(1, Math.min(result.totalPages, page));
  els.pageNum.textContent = String(currentPage);
  els.btnPrev.disabled = currentPage <= 1;
  els.btnNext.disabled = currentPage >= result.totalPages;
  els.selAll.checked = false;

  if (scroll) {
    const cards = els.pages.querySelectorAll('.page-card');
    const card = cards[currentPage - 1];
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  highlightSearch();
}

els.btnPrev.addEventListener('click', () => goToPage(currentPage - 1));
els.btnNext.addEventListener('click', () => goToPage(currentPage + 1));

// Search
function highlightSearch() {
  if (!result) return;
  const term = searchTerm.trim();
  els.searchCount.textContent = term ? '0 matches' : '';
  if (!term) {
    // remove any inline marks
    $all('.match-mark').forEach((m) => {
      const parent = m.parentNode as HTMLElement;
      m.replaceWith(document.createTextNode(m.textContent ?? ''));
      parent.normalize();
    });
    return;
  }

  // build matches
  matches = [];
  const cards = els.pages.querySelectorAll('.page-card');
  let total = 0;
  cards.forEach((card, i) => {
    const textDiv = card.querySelector('.page-text');
    if (!textDiv) return;
    // unmark first
    card.querySelectorAll('.match-mark').forEach((m) => {
      const parent = m.parentNode as HTMLElement;
      m.replaceWith(document.createTextNode(m.textContent ?? ''));
      parent.normalize();
    });
    const html = textDiv.textContent ?? '';
    const re = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) {
      matches.push({ page: i + 1, index: m.index });
      total++;
    }
    // re-render with marks
    const marked = markHtml(html, term);
    textDiv.innerHTML = marked;
  });
  els.searchCount.textContent = total ? `${total} match${total !== 1 ? 'es' : ''}` : '0 matches';
  currentMatchIdx = -1;
}

function markHtml(html: string, term: string): string {
  const re = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  return html.replace(re, (match) => `<mark class="match-mark">${match}</mark>`);
}

els.search.addEventListener('input', (e) => {
  searchTerm = (e.target as HTMLInputElement).value;
  highlightSearch();
  currentMatchIdx = -1;
});
els.search.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    jumpToNextMatch();
  }
});
$('btn-search-clear')?.addEventListener('click', () => {
  els.search.value = '';
  searchTerm = '';
  highlightSearch();
});

function jumpToNextMatch() {
  if (!matches.length) return;
  currentMatchIdx = (currentMatchIdx + 1) % matches.length;
  const match = matches[currentMatchIdx];
  goToPage(match.page, false);
  // scroll the specific card into view
  setTimeout(() => {
    const cards = els.pages.querySelectorAll('.page-card');
    const card = cards[match.page - 1];
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 50);
}

// Page selection for extraction (stored for future re-extraction flows).
function getSelectedPages(): number[] | undefined {  if (els.selAll.checked) return undefined;
  const raw = els.selPages.value.trim();
  if (!raw) return undefined;
  const pages: number[] = [];
  const parts = raw.split(',');
  for (const part of parts) {
    const rng = part.trim().split('-');
    if (rng.length === 2) {
      const a = parseInt(rng[0], 10);
      const b = parseInt(rng[1], 10);
      if (!isNaN(a) && !isNaN(b) && a <= b) {
        for (let p = a; p <= b; p++) pages.push(p);
      }
    } else {
      const n = parseInt(rng[0], 10);
      if (!isNaN(n)) pages.push(n);
    }
  }
  return pages.length ? pages : undefined;
}

els.selAll.addEventListener('change', () => {
  els.selCustom.classList.toggle('hidden', els.selAll.checked);
});

// Extraction
async function onSourceFileChosen() {
  const file = els.sourceFile.files?.[0];
  if (!file) return;
  try {
    els.sourceHint.textContent = `Reading ${file.name}…`;
    sourceBytes = await file.arrayBuffer();
    sourceName = file.name || 'document.pdf';
    els.sourceHint.textContent = `Loaded: ${sourceName} (${formatBytes(sourceBytes.byteLength)})`;
    els.errorPanel.classList.add('hidden');
  } catch (err) {
    els.sourceHint.textContent = 'Could not read the selected file.';
    showError('File error', String(err));
  } finally {
    els.sourceFile.value = '';
  }
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

async function ensureSourceBytes(): Promise<boolean> {
  if (sourceBytes) return true;
  if (result?.sourceUrl) {
    try {
      els.sourceHint.textContent = 'Downloading source PDF…';
      sourceBytes = await fetchPdfBytes(result.sourceUrl, { credentials: 'include' });
      sourceName = `${result.title || 'document'}.pdf`;
      els.sourceHint.textContent = `Loaded: ${sourceName} (${formatBytes(sourceBytes.byteLength)})`;
      return true;
    } catch {
      els.sourceHint.textContent = 'Could not download the source PDF — choose the file instead.';
    }
  }
  showError(
    'Choose the PDF file',
    'Re-extraction and OCR need the original PDF file.',
    'Click "Choose PDF file…" in the sidebar, then click "Extract with OCR" again. The file is processed locally and never uploaded.'
  );
  return false;
}

function maybeSuggestOcr(extraction: ExtractionResult) {
  if (extraction.method !== 'native') return;
  const pages = extraction.pages;
  const empty = pages.filter((p) => !p.hasText).length;
  const garbled = pages.filter((p) => looksLikeGarbledText(p.text)).length;
  if (garbled > 0) {
    showError(
      'Text looks garbled',
      'This PDF likely uses a legacy or non-Unicode Nepali font (e.g. Preeti/Kantipur), so native extraction produces gibberish.',
      'Click "Extract with OCR" to recognize the Devanagari text visually (slower, needs network on first use).'
    );
    return;
  }
  if (pages.length === 0 || empty < pages.length) return;
  showError(
    'No text layer found',
    'This PDF appears to be scanned or image-based.',
    'Click "Extract with OCR" to recognize Nepali/English text (slower).'
  );
}

async function persistExtraction(extraction: ExtractionResult): Promise<void> {
  try {
    const { saveExtraction } = await import('../src/utils/storage');
    await saveExtraction({
      title: extraction.title,
      sourceUrl: extraction.sourceUrl,
      totalPages: extraction.totalPages,
      pages: extraction.pages.map((p) => ({
        page: p.page,
        text: p.text,
        extractedAt: Date.now(),
        hasText: p.hasText,
        textLength: p.textLength,
        source: p.source,
      })),
      fullText: extraction.fullText,
      method: extraction.method,
      metadata: extraction.metadata,
    });
    els.btnRefreshSaved?.click();
  } catch {
    /* storage is best-effort; the result is still shown */
  }
}

async function runExtraction(useOcr: boolean) {
  if (useOcr) {
    const status = await getOcrStatus();
    if (!status.available) {
      showError('OCR unavailable', 'Tesseract.js requires a browser environment with Worker support.');
      return;
    }
    els.ocrStatus.innerHTML = ocrWarningHtml();
  }
  if (!(await ensureSourceBytes())) return;

  const pages = getSelectedPages();
  abortController = new AbortController();
  const signal = abortController.signal;
  showProgress(true, useOcr ? 'Starting OCR…' : 'Extracting text…');
  els.errorPanel.classList.add('hidden');

  const onProgress = (p: { page: number; total: number; text?: string; status?: string; percent?: number }) => {
    const pct = p.total ? (p.page / p.total) * 100 : (p.percent ?? 0);
    setProgress(pct);
    els.progressLabel.textContent = p.status
      ? p.status
      : `Extracting page ${p.page} of ${p.total}…`;
  };

  try {
    const extraction = useOcr
      ? await extractPdfWithOcr(sourceBytes as ArrayBuffer, {
          fileName: sourceName,
          sourceUrl: result?.sourceUrl,
          pages,
          signal,
          onProgress: (p) => {
            setProgress(p.total ? ((p.page - 1 + p.percent / 100) / p.total) * 100 : p.percent);
            els.progressLabel.textContent = p.status || `OCR page ${p.page} of ${p.total}…`;
          },
        })
      : await extractDocument(sourceBytes as ArrayBuffer, {
          fileName: sourceName,
          sourceUrl: result?.sourceUrl,
          normalizeUnicode: true,
          pages,
          abortSignal: signal,
          onProgress: (p) => onProgress(p),
        });

    result = extraction;
    if (useOcr) await persistExtraction(extraction);
    renderMeta();
    renderPages();
    setProgress(100);
    maybeSuggestOcr(extraction);
    const empty = extraction.pages.filter((p) => !p.hasText).length;
    if (empty > 0 && extraction.pages.length > 0) {
      els.footer.textContent = `${empty} page(s) had little or no text. OCR may help for those pages.`;
    }
  } catch (err) {
    const e = err as any;
    if (e?.code === 'cancelled') {
      els.footer.textContent = 'Extraction cancelled.';
    } else {
      showError(
        e?.code === 'password-required' ? 'Password required' : 'Extraction failed',
        e?.userFriendly || e?.message || String(err),
        e?.suggestion
      );
    }
  } finally {
    abortController = null;
    showProgress(false);
  }
}

els.btnExtractNative.addEventListener('click', () => runExtraction(false));
els.btnExtractOcr.addEventListener('click', () => runExtraction(true));
els.btnChooseFile.addEventListener('click', () => els.sourceFile.click());
els.sourceFile.addEventListener('change', () => void onSourceFileChosen());

// Export
async function doExport(fmt: ExportFormat) {
  if (!result) { showError('Nothing to export', 'Extract a document first.'); return; }
  showProgress(true, `Exporting ${fmt.toUpperCase()}…`);
  try {
    await exportResult(result, fmt, {
      fileName: sanitizeFilename(result.title || 'extracted'),
      includeMetadata: true,
    });
  } catch (err) {
    showError('Export failed', String(err));
  } finally {
    showProgress(false);
  }
}
els.exportTxt.addEventListener('click', () => doExport('txt'));
els.exportJson.addEventListener('click', () => doExport('json'));
els.exportDocx.addEventListener('click', () => doExport('docx'));

// Copy
els.copyAll.addEventListener('click', () => {
  if (!result) return;
  navigator.clipboard.writeText(result.fullText).then(() => {
    const btn = els.copyAll;
    const old = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = old, 1200);
  });
});
els.copyPage.addEventListener('click', () => {
  if (!result) return;
  const pageTexts = paginateText(result.fullText);
  const text = pageTexts[currentPage - 1] || '';
  navigator.clipboard.writeText(text);
});

els.clear.addEventListener('click', () => {
  result = null;
  els.pages.innerHTML = '';
  els.placeholder.classList.remove('hidden');
  els.docMeta.textContent = 'No document loaded.';
  els.pageNum.textContent = '0';
  els.pageTotal.textContent = '0';
  els.search.value = '';
  searchTerm = '';
  els.searchCount.textContent = '';
});

// Load result passed via runtime message or query param ?id=
async function loadInitial() {
  const params = new URLSearchParams(location.search);
  const id = params.get('id');
  if (id) {
    try {
      const { getExtraction } = await import('../src/utils/storage');
      const saved = await getExtraction(id);
      if (saved) {
        result = hydrateResult(saved);
        renderMeta();
        renderPages();
        maybeSuggestOcr(result);
      } else {
        showError('Not found', `Saved extraction ${id} not found.`);
      }
    } catch (err) {
      showError('Load failed', String(err));
    }
  }
}

// Listen for messages from background/popup passing a result directly.
browser.runtime.onMessage.addListener((message: any) => {
  if (message?.type === 'NEE_VIEW_RESULT' && message.result) {
    result = hydrateResult(message.result);
    renderMeta();
    renderPages();
    maybeSuggestOcr(result);
  }
  return true;
});

els.btnRefreshSaved.addEventListener('click', async () => {
  try {
    const { listSavedExtractions } = await import('../src/utils/storage');
    const list = await listSavedExtractions();
    if (!list.length) { els.savedList.textContent = 'No saved extractions.'; return; }
    els.savedList.innerHTML = '';
    for (const item of list.slice(0, 10)) {
      const div = document.createElement('div');
      div.className = 'saved-item';
      div.textContent = `${item.title} (${item.totalPages} pages)`;
      div.addEventListener('click', async () => {
        const { getExtraction } = await import('../src/utils/storage');
        const saved = await getExtraction(item.id);
        if (saved) { result = hydrateResult(saved); renderMeta(); renderPages(); maybeSuggestOcr(result); }
      });
      els.savedList.appendChild(div);
    }
  } catch {
    els.savedList.textContent = 'Unable to load saved items.';
  }
});

els.btnCancel.addEventListener('click', () => {
  if (abortController) {
    abortController.abort();
    abortController = null;
  }
  void ocrCancel();
  showProgress(false);
});

loadInitial();
els.btnRefreshSaved?.click();

export {};
