import {
  MAX_PAGES,
  extractDocument,
  fetchPdfBytes,
  loadPdfDocument,
  looksLikeGarbledText,
  makePdfError,
  normalizeNFC,
  sanitizeFilename,
  trimText
} from "../chunks/chunk-NUD2Q7JX.js";
import "../chunks/chunk-ZIWOL2OZ.js";
import {
  getOcrStatus,
  ocrCancel,
  ocrPage,
  ocrWarningHtml
} from "../chunks/chunk-XQ7HA5KY.js";
import "../chunks/chunk-M7PQRUNY.js";

// src/export/index.ts
var DEVANAGARI_FONT = "Noto Sans Devanagari";
function blobToDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = sanitizeFilename(fileName);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
function exportTxt(result2, opts = {}) {
  const safeName = opts.fileName || result2.title || "extracted-text";
  const lines = [];
  if (opts.includeMetadata !== false) {
    lines.push(`Title: ${result2.title}`);
    lines.push(`Source: ${result2.sourceUrl ?? "Local file"}`);
    lines.push(`Pages: ${result2.totalPages}`);
    lines.push(`Method: ${result2.method}`);
    lines.push(`Extracted: ${new Date(result2.extractedAt).toISOString()}`);
    lines.push("=".repeat(60));
    lines.push("");
  }
  lines.push(result2.fullText);
  const content = lines.join("\n");
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  blobToDownload(blob, `${safeName}.txt`);
}
function exportJson(result2, opts = {}) {
  const safeName = opts.fileName || result2.title || "extracted-text";
  const payload = {
    title: result2.title,
    sourceUrl: result2.sourceUrl,
    totalPages: result2.totalPages,
    method: result2.method,
    extractedAt: result2.extractedAt,
    fullText: result2.fullText,
    pages: result2.pages.map((p) => ({
      page: p.page,
      text: p.text,
      textLength: p.textLength,
      hasText: p.hasText,
      source: p.source,
      error: p.error
    })),
    metadata: opts.includeMetadata !== false ? result2.metadata : {}
  };
  const content = JSON.stringify(payload, null, 2);
  const blob = new Blob([content], { type: "application/json;charset=utf-8" });
  blobToDownload(blob, `${safeName}.json`);
}
async function exportDocx(result2, opts = {}) {
  const { Document, Packer, Paragraph, TextRun, AlignmentType } = await import("../chunks/dist-X4BGVZAC.js");
  const safeName = opts.fileName || result2.title || "extracted-text";
  const children = [];
  if (opts.includeMetadata !== false) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.LEFT,
        children: [new TextRun({ text: `Title: ${result2.title}`, bold: true })]
      }),
      new Paragraph({
        children: [new TextRun({ text: `Source: ${result2.sourceUrl ?? "Local file"}` })]
      }),
      new Paragraph({
        children: [new TextRun({ text: `Pages: ${result2.totalPages}` })]
      }),
      new Paragraph({
        children: [new TextRun({ text: `Method: ${result2.method}` })]
      }),
      new Paragraph({ children: [new TextRun({ text: "" })] })
    );
  }
  for (const page of result2.pages) {
    if (!page.text) continue;
    const paraText = page.text.split("\n").map((line) => line).join("\n");
    children.push(
      new Paragraph({
        children: [new TextRun({ text: `--- Page ${page.page} ---`, bold: true })]
      }),
      new Paragraph({
        children: [new TextRun({ text: paraText, font: DEVANAGARI_FONT })]
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
            size: 22
          }
        }
      }
    }
  });
  const blob = await Packer.toBlob(doc);
  blobToDownload(blob, `${safeName}.docx`);
}
async function exportResult(result2, format, opts = {}) {
  switch (format) {
    case "txt":
      exportTxt(result2, opts);
      return;
    case "json":
      exportJson(result2, opts);
      return;
    case "docx":
      await exportDocx(result2, opts);
      return;
    default:
      throw new Error(`Unsupported export format: ${format}`);
  }
}

// src/ocr/pdfOcr.ts
async function extractPdfWithOcr(bytes, options = {}) {
  const {
    fileName = "scanned-document.pdf",
    sourceUrl,
    pages,
    // ~216 DPI; Devanagari matras need more resolution than Latin text.
    scale = 3,
    signal,
    lang = "nep+eng",
    onProgress
  } = options;
  const doc = await loadPdfDocument(bytes);
  const totalPages = doc.numPages;
  if (totalPages > MAX_PAGES) {
    throw makePdfError("size-limit", `Document has ${totalPages} pages (max ${MAX_PAGES}).`, {
      userFriendly: "This PDF has too many pages to OCR at once.",
      suggestion: "OCR a smaller range of pages."
    });
  }
  const targetPages = pages?.filter((p) => p >= 1 && p <= totalPages) || Array.from({ length: totalPages }, (_, i) => i + 1);
  const extractedPages = [];
  const fullTextParts = [];
  for (let i = 0; i < targetPages.length; i++) {
    if (signal?.aborted) {
      throw makePdfError("cancelled", "OCR cancelled by user.", {
        userFriendly: "OCR was cancelled.",
        retryable: true
      });
    }
    const pageNum = targetPages[i];
    onProgress?.({ status: `Rendering page ${pageNum}\u2026`, percent: 0, page: pageNum, total: totalPages, text: "" });
    try {
      const page = await doc.getPage(pageNum);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas 2D context unavailable");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      const result2 = await ocrPage(canvas, {
        lang,
        onProgress: (p) => onProgress?.({
          status: `Recognizing page ${pageNum}\u2026`,
          percent: p.percent,
          page: pageNum,
          total: totalPages,
          text: fullTextParts.join("\n")
        })
      });
      let text = normalizeNFC(trimText(result2.text));
      text = text.replace(/[ \t]{2,}/g, " ");
      const hasText = text.length > 0;
      if (hasText) fullTextParts.push(text);
      extractedPages.push({
        page: pageNum,
        text,
        textLength: text.length,
        hasText,
        source: "ocr"
      });
      onProgress?.({
        status: `Page ${pageNum} done`,
        percent: 100,
        page: pageNum,
        total: totalPages,
        text: fullTextParts.join("\n")
      });
      await new Promise((r) => setTimeout(r, 0));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      extractedPages.push({
        page: pageNum,
        text: "",
        textLength: 0,
        hasText: false,
        source: "ocr",
        error: message
      });
    }
  }
  const successful = extractedPages.filter((p) => p.hasText).length;
  const failed = extractedPages.filter((p) => p.error);
  if (successful === 0 && failed.length > 0) {
    const reason = failed[0].error ?? "Unknown OCR error";
    throw makePdfError("unsupported", `OCR failed: ${reason}`, {
      userFriendly: "OCR could not read this PDF. The Nepali/English language data may not have downloaded, or the pages could not be rendered.",
      retryable: true,
      suggestion: "Check your internet connection, then try again. You can also try a smaller page range."
    });
  }
  return {
    docId: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    title: fileName.replace(/\.pdf$/i, ""),
    sourceUrl,
    totalPages,
    pages: extractedPages,
    fullText: fullTextParts.join("\n\n---\n\n"),
    metadata: {},
    extractedAt: Date.now(),
    method: "ocr"
  };
}

// viewer/viewer.ts
var $ = (id) => document.getElementById(id);
var $all = (sel) => Array.from(document.querySelectorAll(sel));
var result = null;
var currentPage = 1;
var matches = [];
var currentMatchIdx = -1;
var searchTerm = "";
var abortController;
var sourceBytes = null;
var sourceName = "document.pdf";
var els = {
  docMeta: $("doc-meta"),
  pageLabel: $("page-label"),
  pageNum: $("page-num"),
  pageTotal: $("page-total"),
  pages: $("pages"),
  placeholder: $("page-placeholder"),
  viewport: $("pages-viewport"),
  search: $("search"),
  searchCount: $("search-count"),
  btnPrev: $("btn-prev"),
  btnNext: $("btn-next"),
  btnExtractNative: $("btn-extract-native"),
  btnExtractOcr: $("btn-extract-ocr"),
  ocrStatus: $("ocr-status"),
  selAll: $("sel-all"),
  selCustom: $("sel-custom"),
  selPages: $("sel-pages"),
  sourceFile: $("source-file"),
  btnChooseFile: $("btn-choose-file"),
  sourceHint: $("source-hint"),
  exportTxt: $("btn-export-txt"),
  exportJson: $("btn-export-json"),
  exportDocx: $("btn-export-docx"),
  copyAll: $("btn-copy-all"),
  copyPage: $("btn-copy-page"),
  clear: $("btn-clear"),
  errorPanel: $("error-panel"),
  errorTitle: $("error-title"),
  errorMessage: $("error-message"),
  errorSuggestion: $("error-suggestion"),
  errorDismiss: $("error-dismiss"),
  progress: $("progress-panel"),
  progressLabel: $("progress-label"),
  progressFill: $("progress-fill"),
  btnCancel: $("btn-cancel-progress"),
  title: $("viewer-title"),
  savedList: $("saved-list"),
  btnRefreshSaved: $("btn-refresh-saved"),
  footer: $("footer-text"),
  themeToggle: $("theme-toggle")
};
function setTheme(dark) {
  document.body.classList.toggle("dark", dark);
  localStorage.setItem("nee_theme", dark ? "1" : "0");
  els.themeToggle.setAttribute("aria-checked", String(dark));
}
els.themeToggle.addEventListener("click", () => setTheme(document.body.classList.toggle("dark", !document.body.classList.contains("dark"))));
if (localStorage.getItem("nee_theme") === "1") setTheme(true);
function showError(title, message, suggestion) {
  els.errorPanel.classList.remove("hidden");
  els.errorTitle.textContent = title;
  els.errorMessage.textContent = message;
  els.errorSuggestion.textContent = suggestion || "";
  els.errorSuggestion.classList.toggle("hidden", !suggestion);
}
els.errorDismiss.addEventListener("click", () => els.errorPanel.classList.add("hidden"));
function showProgress(show, label = "Processing\u2026") {
  els.progress.classList.toggle("hidden", !show);
  els.progressLabel.textContent = label;
  if (show) els.progressFill.style.width = "0%";
}
function setProgress(pct) {
  els.progressFill.style.width = Math.max(0, Math.min(100, pct)) + "%";
}
function hydrateResult(saved) {
  const rawPages = Array.isArray(saved?.pages) ? saved.pages : [];
  const pages = rawPages.map((p) => {
    const text = typeof p.text === "string" ? p.text : "";
    return {
      page: p.page,
      text,
      textLength: typeof p.textLength === "number" ? p.textLength : text.length,
      hasText: typeof p.hasText === "boolean" ? p.hasText : text.trim().length > 0,
      source: p.source === "ocr" ? "ocr" : "native",
      error: p.error
    };
  });
  const fullText = typeof saved?.fullText === "string" ? saved.fullText : pages.map((p) => p.text).filter(Boolean).join("\n\n---\n\n");
  return {
    docId: saved?.docId ?? saved?.id ?? `local-${Date.now()}`,
    title: saved?.title ?? "Extracted Text",
    sourceUrl: saved?.sourceUrl,
    totalPages: typeof saved?.totalPages === "number" ? saved.totalPages : pages.length,
    pages,
    fullText,
    metadata: saved?.metadata ?? {},
    extractedAt: saved?.extractedAt ?? saved?.createdAt ?? Date.now(),
    method: saved?.method === "ocr" || saved?.method === "mixed" ? saved.method : "native"
  };
}
function renderMeta() {
  if (!result) return;
  const meta = result.metadata || {};
  const parts = [];
  if (result.sourceUrl) parts.push(`Source: ${result.sourceUrl}`);
  parts.push(`Pages: ${result.totalPages}`);
  parts.push(`Method: ${result.method === "ocr" ? "OCR" : result.method === "mixed" ? "Native + OCR" : "Native"}`);
  parts.push(`Extracted: ${new Date(result.extractedAt).toLocaleString()}`);
  if (meta.title) parts.unshift(`Title: ${meta.title}`);
  els.docMeta.textContent = parts.join(" \xB7 ");
  els.title.textContent = result.title || "Extracted Text";
  document.title = `${result.title} \xB7 PDF Workspace`;
}
function paginateText(text) {
  return text.split("\n\n---\n\n").filter((s) => s.length > 0);
}
function renderPages() {
  if (!result) {
    els.pages.innerHTML = "";
    els.pageTotal.textContent = "0";
    els.pageNum.textContent = "0";
    return;
  }
  const pageTexts = paginateText(result.fullText);
  const pages = result.pages;
  els.pageTotal.textContent = String(result.totalPages);
  els.pages.innerHTML = "";
  let displayed = 0;
  for (const page of pages) {
    const text = pageTexts[page.page - 1] ?? page.text;
    const card = document.createElement("div");
    card.className = "page-card";
    const header = document.createElement("div");
    header.className = "header";
    const badge = document.createElement("span");
    badge.className = "page-badge";
    badge.textContent = `Page ${page.page}`;
    const tag = document.createElement("span");
    tag.className = `source-tag ${page.source === "ocr" ? "ocr" : ""}`;
    tag.textContent = page.source === "ocr" ? "OCR" : "Native";
    header.appendChild(badge);
    header.appendChild(tag);
    const textDiv = document.createElement("div");
    textDiv.className = `page-text ${page.hasText ? "" : "empty"}`;
    textDiv.setAttribute("aria-label", `Page ${page.page} text`);
    if (page.error) {
      textDiv.textContent = "";
      const err = document.createElement("div");
      err.className = "page-error";
      err.textContent = `Error: ${page.error}`;
      textDiv.appendChild(err);
    } else if (text) {
      textDiv.textContent = text;
    } else {
      textDiv.textContent = "(No extractable text on this page)";
    }
    card.appendChild(header);
    card.appendChild(textDiv);
    els.pages.appendChild(card);
    displayed++;
  }
  els.placeholder.classList.toggle("hidden", displayed > 0);
  goToPage(currentPage, false);
}
function goToPage(page, scroll = true) {
  if (!result) return;
  currentPage = Math.max(1, Math.min(result.totalPages, page));
  els.pageNum.textContent = String(currentPage);
  els.btnPrev.disabled = currentPage <= 1;
  els.btnNext.disabled = currentPage >= result.totalPages;
  els.selAll.checked = false;
  if (scroll) {
    const cards = els.pages.querySelectorAll(".page-card");
    const card = cards[currentPage - 1];
    if (card) card.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  highlightSearch();
}
els.btnPrev.addEventListener("click", () => goToPage(currentPage - 1));
els.btnNext.addEventListener("click", () => goToPage(currentPage + 1));
function highlightSearch() {
  if (!result) return;
  const term = searchTerm.trim();
  els.searchCount.textContent = term ? "0 matches" : "";
  if (!term) {
    $all(".match-mark").forEach((m) => {
      const parent = m.parentNode;
      m.replaceWith(document.createTextNode(m.textContent ?? ""));
      parent.normalize();
    });
    return;
  }
  matches = [];
  const cards = els.pages.querySelectorAll(".page-card");
  let total = 0;
  cards.forEach((card, i) => {
    const textDiv = card.querySelector(".page-text");
    if (!textDiv) return;
    card.querySelectorAll(".match-mark").forEach((m2) => {
      const parent = m2.parentNode;
      m2.replaceWith(document.createTextNode(m2.textContent ?? ""));
      parent.normalize();
    });
    const html = textDiv.textContent ?? "";
    const re = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    let m;
    while (m = re.exec(html)) {
      matches.push({ page: i + 1, index: m.index });
      total++;
    }
    const marked = markHtml(html, term);
    textDiv.innerHTML = marked;
  });
  els.searchCount.textContent = total ? `${total} match${total !== 1 ? "es" : ""}` : "0 matches";
  currentMatchIdx = -1;
}
function markHtml(html, term) {
  const re = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  return html.replace(re, (match) => `<mark class="match-mark">${match}</mark>`);
}
els.search.addEventListener("input", (e) => {
  searchTerm = e.target.value;
  highlightSearch();
  currentMatchIdx = -1;
});
els.search.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    jumpToNextMatch();
  }
});
$("btn-search-clear")?.addEventListener("click", () => {
  els.search.value = "";
  searchTerm = "";
  highlightSearch();
});
function jumpToNextMatch() {
  if (!matches.length) return;
  currentMatchIdx = (currentMatchIdx + 1) % matches.length;
  const match = matches[currentMatchIdx];
  goToPage(match.page, false);
  setTimeout(() => {
    const cards = els.pages.querySelectorAll(".page-card");
    const card = cards[match.page - 1];
    if (card) card.scrollIntoView({ behavior: "smooth", block: "center" });
  }, 50);
}
function getSelectedPages() {
  if (els.selAll.checked) return void 0;
  const raw = els.selPages.value.trim();
  if (!raw) return void 0;
  const pages = [];
  const parts = raw.split(",");
  for (const part of parts) {
    const rng = part.trim().split("-");
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
  return pages.length ? pages : void 0;
}
els.selAll.addEventListener("change", () => {
  els.selCustom.classList.toggle("hidden", els.selAll.checked);
});
async function onSourceFileChosen() {
  const file = els.sourceFile.files?.[0];
  if (!file) return;
  try {
    els.sourceHint.textContent = `Reading ${file.name}\u2026`;
    sourceBytes = await file.arrayBuffer();
    sourceName = file.name || "document.pdf";
    els.sourceHint.textContent = `Loaded: ${sourceName} (${formatBytes(sourceBytes.byteLength)})`;
    els.errorPanel.classList.add("hidden");
  } catch (err) {
    els.sourceHint.textContent = "Could not read the selected file.";
    showError("File error", String(err));
  } finally {
    els.sourceFile.value = "";
  }
}
function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
async function ensureSourceBytes() {
  if (sourceBytes) return true;
  if (result?.sourceUrl) {
    try {
      els.sourceHint.textContent = "Downloading source PDF\u2026";
      sourceBytes = await fetchPdfBytes(result.sourceUrl, { credentials: "include" });
      sourceName = `${result.title || "document"}.pdf`;
      els.sourceHint.textContent = `Loaded: ${sourceName} (${formatBytes(sourceBytes.byteLength)})`;
      return true;
    } catch {
      els.sourceHint.textContent = "Could not download the source PDF \u2014 choose the file instead.";
    }
  }
  showError(
    "Choose the PDF file",
    "Re-extraction and OCR need the original PDF file.",
    'Click "Choose PDF file\u2026" in the sidebar, then click "Extract with OCR" again. The file is processed locally and never uploaded.'
  );
  return false;
}
function maybeSuggestOcr(extraction) {
  if (extraction.method !== "native") return;
  const pages = extraction.pages;
  const empty = pages.filter((p) => !p.hasText).length;
  const garbled = pages.filter((p) => looksLikeGarbledText(p.text)).length;
  if (garbled > 0) {
    showError(
      "Text looks garbled",
      "This PDF likely uses a legacy or non-Unicode Nepali font (e.g. Preeti/Kantipur), so native extraction produces gibberish.",
      'Click "Extract with OCR" to recognize the Devanagari text visually (slower, needs network on first use).'
    );
    return;
  }
  if (pages.length === 0 || empty < pages.length) return;
  showError(
    "No text layer found",
    "This PDF appears to be scanned or image-based.",
    'Click "Extract with OCR" to recognize Nepali/English text (slower).'
  );
}
async function persistExtraction(extraction) {
  try {
    const { saveExtraction } = await import("../chunks/storage-4TT5OLCC.js");
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
        source: p.source
      })),
      fullText: extraction.fullText,
      method: extraction.method,
      metadata: extraction.metadata
    });
    els.btnRefreshSaved?.click();
  } catch {
  }
}
async function runExtraction(useOcr) {
  if (useOcr) {
    const status = await getOcrStatus();
    if (!status.available) {
      showError("OCR unavailable", "Tesseract.js requires a browser environment with Worker support.");
      return;
    }
    els.ocrStatus.innerHTML = ocrWarningHtml();
  }
  if (!await ensureSourceBytes()) return;
  const pages = getSelectedPages();
  abortController = new AbortController();
  const signal = abortController.signal;
  showProgress(true, useOcr ? "Starting OCR\u2026" : "Extracting text\u2026");
  els.errorPanel.classList.add("hidden");
  const onProgress = (p) => {
    const pct = p.total ? p.page / p.total * 100 : p.percent ?? 0;
    setProgress(pct);
    els.progressLabel.textContent = p.status ? p.status : `Extracting page ${p.page} of ${p.total}\u2026`;
  };
  try {
    const extraction = useOcr ? await extractPdfWithOcr(sourceBytes, {
      fileName: sourceName,
      sourceUrl: result?.sourceUrl,
      pages,
      signal,
      onProgress: (p) => {
        setProgress(p.total ? (p.page - 1 + p.percent / 100) / p.total * 100 : p.percent);
        els.progressLabel.textContent = p.status || `OCR page ${p.page} of ${p.total}\u2026`;
      }
    }) : await extractDocument(sourceBytes, {
      fileName: sourceName,
      sourceUrl: result?.sourceUrl,
      normalizeUnicode: true,
      pages,
      abortSignal: signal,
      onProgress: (p) => onProgress(p)
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
    const e = err;
    if (e?.code === "cancelled") {
      els.footer.textContent = "Extraction cancelled.";
    } else {
      showError(
        e?.code === "password-required" ? "Password required" : "Extraction failed",
        e?.userFriendly || e?.message || String(err),
        e?.suggestion
      );
    }
  } finally {
    abortController = null;
    showProgress(false);
  }
}
els.btnExtractNative.addEventListener("click", () => runExtraction(false));
els.btnExtractOcr.addEventListener("click", () => runExtraction(true));
els.btnChooseFile.addEventListener("click", () => els.sourceFile.click());
els.sourceFile.addEventListener("change", () => void onSourceFileChosen());
async function doExport(fmt) {
  if (!result) {
    showError("Nothing to export", "Extract a document first.");
    return;
  }
  showProgress(true, `Exporting ${fmt.toUpperCase()}\u2026`);
  try {
    await exportResult(result, fmt, {
      fileName: sanitizeFilename(result.title || "extracted"),
      includeMetadata: true
    });
  } catch (err) {
    showError("Export failed", String(err));
  } finally {
    showProgress(false);
  }
}
els.exportTxt.addEventListener("click", () => doExport("txt"));
els.exportJson.addEventListener("click", () => doExport("json"));
els.exportDocx.addEventListener("click", () => doExport("docx"));
els.copyAll.addEventListener("click", () => {
  if (!result) return;
  navigator.clipboard.writeText(result.fullText).then(() => {
    const btn = els.copyAll;
    const old = btn.textContent;
    btn.textContent = "Copied!";
    setTimeout(() => btn.textContent = old, 1200);
  });
});
els.copyPage.addEventListener("click", () => {
  if (!result) return;
  const pageTexts = paginateText(result.fullText);
  const text = pageTexts[currentPage - 1] || "";
  navigator.clipboard.writeText(text);
});
els.clear.addEventListener("click", () => {
  result = null;
  els.pages.innerHTML = "";
  els.placeholder.classList.remove("hidden");
  els.docMeta.textContent = "No document loaded.";
  els.pageNum.textContent = "0";
  els.pageTotal.textContent = "0";
  els.search.value = "";
  searchTerm = "";
  els.searchCount.textContent = "";
});
async function loadInitial() {
  const params = new URLSearchParams(location.search);
  const id = params.get("id");
  if (id) {
    try {
      const { getExtraction } = await import("../chunks/storage-4TT5OLCC.js");
      const saved = await getExtraction(id);
      if (saved) {
        result = hydrateResult(saved);
        renderMeta();
        renderPages();
        maybeSuggestOcr(result);
      } else {
        showError("Not found", `Saved extraction ${id} not found.`);
      }
    } catch (err) {
      showError("Load failed", String(err));
    }
  }
}
browser.runtime.onMessage.addListener((message) => {
  if (message?.type === "NEE_VIEW_RESULT" && message.result) {
    result = hydrateResult(message.result);
    renderMeta();
    renderPages();
    maybeSuggestOcr(result);
  }
  return true;
});
els.btnRefreshSaved.addEventListener("click", async () => {
  try {
    const { listSavedExtractions } = await import("../chunks/storage-4TT5OLCC.js");
    const list = await listSavedExtractions();
    if (!list.length) {
      els.savedList.textContent = "No saved extractions.";
      return;
    }
    els.savedList.innerHTML = "";
    for (const item of list.slice(0, 10)) {
      const div = document.createElement("div");
      div.className = "saved-item";
      div.textContent = `${item.title} (${item.totalPages} pages)`;
      div.addEventListener("click", async () => {
        const { getExtraction } = await import("../chunks/storage-4TT5OLCC.js");
        const saved = await getExtraction(item.id);
        if (saved) {
          result = hydrateResult(saved);
          renderMeta();
          renderPages();
          maybeSuggestOcr(result);
        }
      });
      els.savedList.appendChild(div);
    }
  } catch {
    els.savedList.textContent = "Unable to load saved items.";
  }
});
els.btnCancel.addEventListener("click", () => {
  if (abortController) {
    abortController.abort();
    abortController = null;
  }
  void ocrCancel();
  showProgress(false);
});
loadInitial();
els.btnRefreshSaved?.click();
//# sourceMappingURL=viewer.js.map
