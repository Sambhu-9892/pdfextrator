import {
  makePdfError
} from "../chunks/chunk-NUD2Q7JX.js";
import {
  isProbablyPdfUrl
} from "../chunks/chunk-ZIWOL2OZ.js";
import "../chunks/chunk-M7PQRUNY.js";

// src/background.ts
var STATE = /* @__PURE__ */ new Map();
function sendError(sendResponse, code, message, userFriendly) {
  sendResponse({
    ok: false,
    error: code,
    message,
    userFriendly: userFriendly ?? message
  });
}
async function getActiveTab() {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}
function handleMessage(message, sendResponse) {
  const { type } = message;
  switch (type) {
    case "NEE_GET_ACTIVE_TAB_INFO": {
      (async () => {
        try {
          const tab = await getActiveTab();
          if (!tab) {
            return sendError(sendResponse, "no-tab", "No active tab found.");
          }
          sendResponse({
            ok: true,
            tab: {
              id: tab.id,
              url: tab.url,
              title: tab.title,
              status: tab.status
            },
            isPdf: isProbablyPdfUrl(tab.url ?? "")
          });
        } catch (err) {
          sendError(sendResponse, "unknown", String(err));
        }
      })();
      return true;
    }
    case "NEE_OPEN_VIEWER": {
      const { result } = message;
      (async () => {
        try {
          const { saveExtraction } = await import("../chunks/storage-4TT5OLCC.js");
          const id = await saveExtraction({
            title: result.title,
            sourceUrl: result.sourceUrl,
            totalPages: result.totalPages,
            pages: result.pages?.map((p) => ({
              page: p.page,
              text: p.text,
              extractedAt: Date.now(),
              hasText: p.hasText,
              textLength: p.textLength,
              source: p.source
            })) ?? [],
            fullText: result.fullText,
            method: result.method,
            metadata: result.metadata
          });
          sendResponse({ ok: true, id, viewerUrl: browser.runtime.getURL("viewer/viewer.html?id=" + id) });
        } catch (err) {
          sendError(sendResponse, "unknown", String(err));
        }
      })();
      return true;
    }
    case "NEE_EXTRACT_PDF_URL": {
      const { url } = message;
      (async () => {
        try {
          const pdfUrl = String(url);
          if (!isProbablyPdfUrl(pdfUrl)) {
            return sendError(
              sendResponse,
              "not-pdf",
              "Not a PDF URL.",
              "The selected link does not look like a PDF."
            );
          }
          const bytes = await fetchPdfBytesWithTabAccess(pdfUrl);
          const result = await extractDocumentFromBytes(bytes, {
            fileName: fileNameFromUrl(pdfUrl),
            sourceUrl: pdfUrl,
            normalizeUnicode: true,
            signal: message.signal
          });
          sendResponse({ ok: true, result });
        } catch (err) {
          const e = err;
          sendError(sendResponse, e.code ?? "unknown", e.message ?? String(err), e.userFriendly);
        }
      })();
      return true;
    }
    case "NEE_EXTRACT_CURRENT_PDF": {
      const { tabId } = message;
      (async () => {
        try {
          let tab = await browser.tabs.get(tabId);
          const url = tab.url;
          if (!url || !isProbablyPdfUrl(url)) {
            return sendError(
              sendResponse,
              "not-pdf",
              "Active tab is not a PDF.",
              "The current tab does not show a PDF document."
            );
          }
          const bytes = await fetchPdfBytesWithTabAccess(url);
          const result = await extractDocumentFromBytes(bytes, {
            fileName: (tab.title || "document") + ".pdf",
            sourceUrl: url,
            normalizeUnicode: true,
            signal: message.signal
          });
          sendResponse({ ok: true, result });
        } catch (err) {
          const e = err;
          sendError(sendResponse, e.code ?? "unknown", e.message, e.userFriendly);
        }
      })();
      return true;
    }
    case "NEE_DISCOVER_PDF_LINKS": {
      const { tabId } = message;
      (async () => {
        try {
          const results = await browser.tabs.sendMessage(tabId, {
            type: "NEE_REQUEST_PDF_LINKS"
          });
          sendResponse({ ok: true, links: results.links, pageUrl: results.pageUrl });
        } catch (err) {
          sendError(
            sendResponse,
            "script-error",
            "Could not access page to discover PDF links.",
            "This page restricts extension access. Try opening the PDF directly."
          );
        }
      })();
      return true;
    }
    case "NEE_CANCEL_EXTRACTION": {
      const id = String(message.extractionId);
      const state = STATE.get(id);
      if (state) {
        state.abortController.abort();
        STATE.delete(id);
        sendResponse({ ok: true });
      } else {
        sendResponse({ ok: false, error: "not-found" });
      }
      return true;
    }
    default:
      sendResponse({ ok: false, error: "unknown-message" });
      return false;
  }
}
async function fetchPdfBytesWithTabAccess(url) {
  let response;
  try {
    response = await fetch(url, {
      credentials: "include",
      redirect: "follow"
    });
  } catch (err) {
    throw makePdfError("cors-blocked", `Fetch failed: ${String(err)}`, {
      userFriendly: "The browser blocked access to this PDF (permission or CORS restriction).",
      retryable: false,
      suggestion: 'Grant site access when prompted, or download the PDF and use "Import local PDF file".'
    });
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw makePdfError("auth-required", `HTTP ${response.status}`, {
        userFriendly: "This PDF requires authentication.",
        retryable: false,
        suggestion: "Log in to the site, then try again, or download the PDF and import it."
      });
    }
    throw makePdfError("fetch-failed", `HTTP ${response.status}`, {
      userFriendly: `Could not load the PDF (HTTP ${response.status}).`,
      retryable: true
    });
  }
  return response.arrayBuffer();
}
async function extractDocumentFromBytes(bytes, opts) {
  const { extractDocument } = await import("../chunks/extractor-GRGEENOW.js");
  return extractDocument(bytes, {
    fileName: opts.fileName,
    sourceUrl: opts.sourceUrl,
    normalizeUnicode: opts.normalizeUnicode,
    abortSignal: opts.signal,
    onProgress: void 0
  });
}
function fileNameFromUrl(url) {
  try {
    const path = new URL(url).pathname;
    const base = decodeURIComponent(path.split("/").pop() || "document.pdf");
    return base.toLowerCase().endsWith(".pdf") ? base : `${base}.pdf`;
  } catch {
    return "document.pdf";
  }
}
browser.runtime.onMessage.addListener(handleMessage);
//# sourceMappingURL=background.js.map
