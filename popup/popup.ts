// Popup UI: quick entry points for extraction.
import { saveExtraction } from '../src/utils/storage';
import { originPattern } from '../src/utils/url';
import type { ExtractionResult } from '../src/types';

const $ = (id: string) => document.getElementById(id) as HTMLElement;
const $$ = (sel: string) => Array.from(document.querySelectorAll(sel));

let currentResult: ExtractionResult | null = null;
let currentTabId: number | null = null;

function setStatus(text: string, kind: 'info' | 'error' | 'success' = 'info') {
  const el = $('status');
  el.textContent = text;
  el.className = 'status ' + kind;
  el.style.color = kind === 'error' ? 'var(--danger)' : kind === 'success' ? 'var(--success)' : 'var(--muted)';
}

function showPanel(name: string) {
  $$('.panel').forEach((p) => p.classList.remove('visible'));
  $$('.tab').forEach((t) => t.classList.remove('active'));
  const panel = $(`panel-${name}`);
  const tab = $(`[data-tab="${name}"]`);
  if (panel) panel.classList.add('visible');
  if (tab) tab.classList.add('active');
}

$$('.tab').forEach((t) => {
  t.addEventListener('click', () => showPanel((t as HTMLElement).dataset.tab!));
});

async function getTabInfo() {
  try {
    const resp = await browser.runtime.sendMessage({ type: 'NEE_GET_ACTIVE_TAB_INFO' });
    if (resp.ok) {
      currentTabId = resp.tab.id as number;
      return resp;
    }
    setStatus(resp.userFriendly || resp.message, 'error');
    return null;
  } catch (err) {
    setStatus('Unable to read tab info.', 'error');
    return null;
  }
}

async function ensureHostPermission(url: string): Promise<boolean> {
  try {
    const pattern = originPattern(url);
    if (!pattern) return false;
    if (!browser.permissions?.request) return false;
    const has = await browser.permissions.contains({ origins: [pattern] });
    if (has) return true;
    return await browser.permissions.request({ origins: [pattern] });
  } catch (err) {
    // Calling permissions.request outside a user gesture can throw; the fetch
    // may still succeed if the server allows CORS, so continue.
    return false;
  }
}

async function extractCurrent() {
  const info = await getTabInfo();
  if (!info) return;
  if (!info.isPdf) {
    setStatus('This tab is not a PDF. Open a PDF or use "Page PDFs".', 'error');
    return;
  }
  setStatus('Extracting text…', 'info');
  const btn = $('btn-extract') as HTMLButtonElement;
  btn.disabled = true;
  btn.textContent = 'Extracting…';
  try {
    const tabUrl = info.tab?.url as string;
    const granted = await ensureHostPermission(tabUrl);
    if (!granted) {
      setStatus('Site access not granted — trying anyway…', 'info');
    }
    const resp = await browser.runtime.sendMessage({
      type: 'NEE_EXTRACT_CURRENT_PDF',
      tabId: currentTabId,
    } as any);
    if (!resp.ok) {
      setStatus(resp.userFriendly || resp.message, 'error');
      return;
    }
    currentResult = resp.result as ExtractionResult;
    setStatus(`Extracted ${currentResult.pages.length} page(s).`, 'success');
    openViewer(currentResult);
  } catch (err) {
    setStatus(String(err), 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Extract Current PDF';
  }
}

async function openViewer(result: ExtractionResult) {
  try {
    const id = await saveExtraction({
      title: result.title,
      sourceUrl: result.sourceUrl,
      totalPages: result.totalPages,
      pages: result.pages.map((p) => ({
        page: p.page,
        text: p.text,
        extractedAt: Date.now(),
        hasText: p.hasText,
        textLength: p.textLength,
        source: p.source,
      })),
      fullText: result.fullText,
      method: result.method,
      metadata: result.metadata,
    });
    const viewerUrl = browser.runtime.getURL('viewer/viewer.html?id=' + id);
    window.open(viewerUrl, '_blank');
  } catch {
    const viewerUrl = browser.runtime.getURL('viewer/viewer.html');
    window.open(viewerUrl, '_blank');
  }
}

$('btn-extract')?.addEventListener('click', extractCurrent);

// Discover PDF links panel
const linkList = $('link-list');
const discoverBtn = $('btn-discover');
const extractSelectedBtn = $('btn-extract-selected');
const selectedLinks = new Map<string, { url: string; text: string }>();

discoverBtn?.addEventListener('click', async () => {
  const info = await getTabInfo();
  if (!info) return;
  setStatus('Discovering PDF links…', 'info');
  try {
    const resp = await browser.runtime.sendMessage({
      type: 'NEE_DISCOVER_PDF_LINKS',
      tabId: currentTabId,
    } as any);
    if (!resp.ok) {
      setStatus(resp.userFriendly || resp.message, 'error');
      return;
    }
    renderLinks(resp.links as Array<{ url: string; text: string }>);
    setStatus(`${resp.links.length} PDF link(s) found.`, 'success');
  } catch (err) {
    setStatus(String(err), 'error');
  }
});

function renderLinks(links: Array<{ url: string; text: string }>) {
  linkList.innerHTML = '';
  if (!links.length) {
    linkList.innerHTML = '<div class="placeholder">No PDF links found on this page.</div>';
    return;
  }
  for (const link of links) {
    const div = document.createElement('div');
    div.className = 'link-item';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'link-checkbox';
    cb.value = link.url;
    cb.addEventListener('change', () => {
      if (cb.checked) selectedLinks.set(link.url, link);
      else selectedLinks.delete(link.url);
      div.classList.toggle('selected', cb.checked);
    });
    const info = document.createElement('div');
    info.className = 'link-text';
    info.textContent = link.text;
    const url = document.createElement('div');
    url.className = 'link-url';
    url.textContent = link.url;
    info.appendChild(url);
    div.appendChild(cb);
    div.appendChild(info);
    linkList.appendChild(div);
  }
}

extractSelectedBtn?.addEventListener('click', async () => {
  if (!selectedLinks.size) {
    setStatus('Select at least one PDF link.', 'error');
    return;
  }
  const first = [...selectedLinks.values()][0];
  setStatus('Extracting selected PDF…', 'info');
  const btn = extractSelectedBtn as HTMLButtonElement;
  btn.disabled = true;
  try {
    await ensureHostPermission(first.url);
    const resp = await browser.runtime.sendMessage({
      type: 'NEE_EXTRACT_PDF_URL',
      url: first.url,
    } as any);
    if (!resp.ok) {
      setStatus(resp.userFriendly || resp.message, 'error');
      return;
    }
    const result = resp.result as ExtractionResult;
    setStatus(`Extracted ${result.pages.length} page(s).`, 'success');
    openViewer(result);
  } catch (err) {
    setStatus(String(err), 'error');
  } finally {
    btn.disabled = false;
  }
});

// Import file
const fileInput = $('file-input') as HTMLInputElement;
fileInput?.addEventListener('change', async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  setStatus('Importing file…', 'info');
  try {
    const arrayBuffer = await file.arrayBuffer();
    const { extractDocument } = await import('../src/pdf/extractor');
    const result = await extractDocument(arrayBuffer, {
      fileName: file.name,
      sourceUrl: undefined,
      normalizeUnicode: true,
    });
    currentResult = result;
    setStatus(`Extracted ${result.pages.length} page(s).`, 'success');
    openViewer(result);
  } catch (err) {
    const e = err as any;
    setStatus(e.userFriendly || e.message || String(err), 'error');
  } finally {
    fileInput.value = '';
  }
});

// Quick actions
$('btn-open-viewer')?.addEventListener('click', () => {
  const viewerUrl = browser.runtime.getURL('viewer/viewer.html');
  window.open(viewerUrl, '_blank');
});

$('btn-settings')?.addEventListener('click', () => {
  const settingsUrl = browser.runtime.getURL('viewer/settings.html');
  window.open(settingsUrl, '_blank');
});

showPanel('extract');
getTabInfo();

export {};
