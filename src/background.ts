// Background script: coordinates tab access, PDF fetching, and messaging.
// Uses minimal permissions (tabs, storage) plus optional <all_urls> /
// downloads when granted by the user.

import type { ExtractionResult } from '../src/types';
import { isProbablyPdfUrl } from '../src/pdf/extractor';
import { makePdfError } from '../src/types';

type Message = {
  type: string;
  [key: string]: unknown;
};

type Response = { ok?: boolean; error?: string; [key: string]: unknown };

const STATE = new Map<string, { abortController: AbortController }>();

function sendError(
  sendResponse: (resp: Response) => void,
  code: string,
  message: string,
  userFriendly?: string
): void {
  sendResponse({
    ok: false,
    error: code,
    message,
    userFriendly: userFriendly ?? message,
  });
}

async function getActiveTab(): Promise<any> {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

function handleMessage(message: Message, sendResponse: (resp: Response) => void): boolean | void {
  const { type } = message;

  switch (type) {
    case 'NEE_GET_ACTIVE_TAB_INFO': {
      (async () => {
        try {
          const tab = await getActiveTab();
          if (!tab) {
            return sendError(sendResponse, 'no-tab', 'No active tab found.');
          }
          sendResponse({
            ok: true,
            tab: {
              id: tab.id,
              url: tab.url,
              title: tab.title,
              status: tab.status,
            },
            isPdf: isProbablyPdfUrl(tab.url ?? ''),
          });
        } catch (err) {
          sendError(sendResponse, 'unknown', String(err));
        }
      })();
      return true;
    }

    case 'NEE_OPEN_VIEWER': {
      const { result } = message;
      (async () => {
        try {
          const { saveExtraction } = await import('../src/utils/storage');
          const id = await saveExtraction({
            title: (result as any).title,
            sourceUrl: (result as any).sourceUrl,
            totalPages: (result as any).totalPages,
            pages: (result as any).pages?.map((p: any) => ({
              page: p.page,
              text: p.text,
              extractedAt: Date.now(),
              hasText: p.hasText,
              textLength: p.textLength,
              source: p.source,
            })) ?? [],
            fullText: (result as any).fullText,
            method: (result as any).method,
            metadata: (result as any).metadata,
          });
          sendResponse({ ok: true, id, viewerUrl: browser.runtime.getURL('viewer/viewer.html?id=' + id) });
        } catch (err) {
          sendError(sendResponse, 'unknown', String(err));
        }
      })();
      return true;
    }

    case 'NEE_EXTRACT_PDF_URL': {
      const { url } = message;
      (async () => {
        try {
          const pdfUrl = String(url);
          if (!isProbablyPdfUrl(pdfUrl)) {
            return sendError(
              sendResponse,
              'not-pdf',
              'Not a PDF URL.',
              'The selected link does not look like a PDF.'
            );
          }
          const bytes = await fetchPdfBytesWithTabAccess(pdfUrl);
          const result = await extractDocumentFromBytes(bytes, {
            fileName: fileNameFromUrl(pdfUrl),
            sourceUrl: pdfUrl,
            normalizeUnicode: true,
            signal: message.signal as AbortSignal | undefined,
          });
          sendResponse({ ok: true, result });
        } catch (err) {
          const e = err as any;
          sendError(sendResponse, e.code ?? 'unknown', e.message ?? String(err), e.userFriendly);
        }
      })();
      return true;
    }

    case 'NEE_EXTRACT_CURRENT_PDF': {
      const { tabId } = message;
      (async () => {
        try {
          let tab = await browser.tabs.get(tabId as number);
          const url = tab.url;
          if (!url || !isProbablyPdfUrl(url)) {
            return sendError(
              sendResponse,
              'not-pdf',
              'Active tab is not a PDF.',
              'The current tab does not show a PDF document.'
            );
          }
          // Request download of the PDF bytes so we can parse locally.
          const bytes = await fetchPdfBytesWithTabAccess(url);
          const result = await extractDocumentFromBytes(bytes, {
            fileName: (tab.title || 'document') + '.pdf',
            sourceUrl: url,
            normalizeUnicode: true,
            signal: message.signal as AbortSignal | undefined,
          });
          sendResponse({ ok: true, result });
        } catch (err) {
          const e = err as any;
          sendError(sendResponse, e.code ?? 'unknown', e.message, e.userFriendly);
        }
      })();
      return true;
    }

    case 'NEE_DISCOVER_PDF_LINKS': {
      const { tabId } = message;
      (async () => {
        try {
          const results = await browser.tabs.sendMessage(tabId as number, {
            type: 'NEE_REQUEST_PDF_LINKS',
          });
          sendResponse({ ok: true, links: results.links, pageUrl: results.pageUrl });
        } catch (err) {
          sendError(
            sendResponse,
            'script-error',
            'Could not access page to discover PDF links.',
            'This page restricts extension access. Try opening the PDF directly.'
          );
        }
      })();
      return true;
    }

    case 'NEE_CANCEL_EXTRACTION': {
      const id = String(message.extractionId);
      const state = STATE.get(id);
      if (state) {
        state.abortController.abort();
        STATE.delete(id);
        sendResponse({ ok: true });
      } else {
        sendResponse({ ok: false, error: 'not-found' });
      }
      return true;
    }

    default:
      sendResponse({ ok: false, error: 'unknown-message' });
      return false;
  }
}

async function fetchPdfBytesWithTabAccess(
  url: string
): Promise<ArrayBuffer> {
  // Cross-origin fetching requires the user to have granted host permission
  // for the PDF's origin (requested from the popup on click). Cookies are
  // included so authenticated PDFs work when the user is logged in.
  let response: any;
  try {
    response = await fetch(url, {
      credentials: 'include',
      redirect: 'follow',
    });
  } catch (err) {
    throw makePdfError('cors-blocked', `Fetch failed: ${String(err)}`, {
      userFriendly: 'The browser blocked access to this PDF (permission or CORS restriction).',
      retryable: false,
      suggestion: 'Grant site access when prompted, or download the PDF and use "Import local PDF file".',
    });
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw makePdfError('auth-required', `HTTP ${response.status}`, {
        userFriendly: 'This PDF requires authentication.',
        retryable: false,
        suggestion: 'Log in to the site, then try again, or download the PDF and import it.',
      });
    }
    throw makePdfError('fetch-failed', `HTTP ${response.status}`, {
      userFriendly: `Could not load the PDF (HTTP ${response.status}).`,
      retryable: true,
    });
  }
  return response.arrayBuffer();
}

async function extractDocumentFromBytes(
  bytes: ArrayBuffer,
  opts: { fileName: string; sourceUrl?: string; normalizeUnicode?: boolean; signal?: AbortSignal }
): Promise<ExtractionResult> {
  const { extractDocument } = await import('../src/pdf/extractor');
  return extractDocument(bytes, {
    fileName: opts.fileName,
    sourceUrl: opts.sourceUrl,
    normalizeUnicode: opts.normalizeUnicode,
    abortSignal: opts.signal,
    onProgress: undefined,
  });
}

function fileNameFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname;
    const base = decodeURIComponent(path.split('/').pop() || 'document.pdf');
    return base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`;
  } catch {
    return 'document.pdf';
  }
}

// Listen for messages from popup/viewer/content scripts.
browser.runtime.onMessage.addListener(handleMessage as any);

export {};
