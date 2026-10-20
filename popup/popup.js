import {
  originPattern
} from "../chunks/chunk-ZIWOL2OZ.js";
import {
  saveExtraction
} from "../chunks/chunk-YIOVUUPR.js";
import "../chunks/chunk-M7PQRUNY.js";

// popup/popup.ts
var $ = (id) => document.getElementById(id);
var $$ = (sel) => Array.from(document.querySelectorAll(sel));
var currentResult = null;
var currentTabId = null;
function setStatus(text, kind = "info") {
  const el = $("status");
  el.textContent = text;
  el.className = "status " + kind;
  el.style.color = kind === "error" ? "var(--danger)" : kind === "success" ? "var(--success)" : "var(--muted)";
}
function showPanel(name) {
  $$(".panel").forEach((p) => p.classList.remove("visible"));
  $$(".tab").forEach((t) => t.classList.remove("active"));
  const panel = $(`panel-${name}`);
  const tab = $(`[data-tab="${name}"]`);
  if (panel) panel.classList.add("visible");
  if (tab) tab.classList.add("active");
}
$$(".tab").forEach((t) => {
  t.addEventListener("click", () => showPanel(t.dataset.tab));
});
async function getTabInfo() {
  try {
    const resp = await browser.runtime.sendMessage({ type: "NEE_GET_ACTIVE_TAB_INFO" });
    if (resp.ok) {
      currentTabId = resp.tab.id;
      return resp;
    }
    setStatus(resp.userFriendly || resp.message, "error");
    return null;
  } catch (err) {
    setStatus("Unable to read tab info.", "error");
    return null;
  }
}
async function ensureHostPermission(url) {
  try {
    const pattern = originPattern(url);
    if (!pattern) return false;
    if (!browser.permissions?.request) return false;
    const has = await browser.permissions.contains({ origins: [pattern] });
    if (has) return true;
    return await browser.permissions.request({ origins: [pattern] });
  } catch (err) {
    return false;
  }
}
async function extractCurrent() {
  const info = await getTabInfo();
  if (!info) return;
  if (!info.isPdf) {
    setStatus('This tab is not a PDF. Open a PDF or use "Page PDFs".', "error");
    return;
  }
  setStatus("Extracting text\u2026", "info");
  const btn = $("btn-extract");
  btn.disabled = true;
  btn.textContent = "Extracting\u2026";
  try {
    const tabUrl = info.tab?.url;
    const granted = await ensureHostPermission(tabUrl);
    if (!granted) {
      setStatus("Site access not granted \u2014 trying anyway\u2026", "info");
    }
    const resp = await browser.runtime.sendMessage({
      type: "NEE_EXTRACT_CURRENT_PDF",
      tabId: currentTabId
    });
    if (!resp.ok) {
      setStatus(resp.userFriendly || resp.message, "error");
      return;
    }
    currentResult = resp.result;
    setStatus(`Extracted ${currentResult.pages.length} page(s).`, "success");
    openViewer(currentResult);
  } catch (err) {
    setStatus(String(err), "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Extract Current PDF";
  }
}
async function openViewer(result) {
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
        source: p.source
      })),
      fullText: result.fullText,
      method: result.method,
      metadata: result.metadata
    });
    const viewerUrl = browser.runtime.getURL("viewer/viewer.html?id=" + id);
    window.open(viewerUrl, "_blank");
  } catch {
    const viewerUrl = browser.runtime.getURL("viewer/viewer.html");
    window.open(viewerUrl, "_blank");
  }
}
$("btn-extract")?.addEventListener("click", extractCurrent);
var linkList = $("link-list");
var discoverBtn = $("btn-discover");
var extractSelectedBtn = $("btn-extract-selected");
var selectedLinks = /* @__PURE__ */ new Map();
discoverBtn?.addEventListener("click", async () => {
  const info = await getTabInfo();
  if (!info) return;
  setStatus("Discovering PDF links\u2026", "info");
  try {
    const resp = await browser.runtime.sendMessage({
      type: "NEE_DISCOVER_PDF_LINKS",
      tabId: currentTabId
    });
    if (!resp.ok) {
      setStatus(resp.userFriendly || resp.message, "error");
      return;
    }
    renderLinks(resp.links);
    setStatus(`${resp.links.length} PDF link(s) found.`, "success");
  } catch (err) {
    setStatus(String(err), "error");
  }
});
function renderLinks(links) {
  linkList.innerHTML = "";
  if (!links.length) {
    linkList.innerHTML = '<div class="placeholder">No PDF links found on this page.</div>';
    return;
  }
  for (const link of links) {
    const div = document.createElement("div");
    div.className = "link-item";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.className = "link-checkbox";
    cb.value = link.url;
    cb.addEventListener("change", () => {
      if (cb.checked) selectedLinks.set(link.url, link);
      else selectedLinks.delete(link.url);
      div.classList.toggle("selected", cb.checked);
    });
    const info = document.createElement("div");
    info.className = "link-text";
    info.textContent = link.text;
    const url = document.createElement("div");
    url.className = "link-url";
    url.textContent = link.url;
    info.appendChild(url);
    div.appendChild(cb);
    div.appendChild(info);
    linkList.appendChild(div);
  }
}
extractSelectedBtn?.addEventListener("click", async () => {
  if (!selectedLinks.size) {
    setStatus("Select at least one PDF link.", "error");
    return;
  }
  const first = [...selectedLinks.values()][0];
  setStatus("Extracting selected PDF\u2026", "info");
  const btn = extractSelectedBtn;
  btn.disabled = true;
  try {
    await ensureHostPermission(first.url);
    const resp = await browser.runtime.sendMessage({
      type: "NEE_EXTRACT_PDF_URL",
      url: first.url
    });
    if (!resp.ok) {
      setStatus(resp.userFriendly || resp.message, "error");
      return;
    }
    const result = resp.result;
    setStatus(`Extracted ${result.pages.length} page(s).`, "success");
    openViewer(result);
  } catch (err) {
    setStatus(String(err), "error");
  } finally {
    btn.disabled = false;
  }
});
var fileInput = $("file-input");
fileInput?.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  setStatus("Importing file\u2026", "info");
  try {
    const arrayBuffer = await file.arrayBuffer();
    const { extractDocument } = await import("../chunks/extractor-GRGEENOW.js");
    const result = await extractDocument(arrayBuffer, {
      fileName: file.name,
      sourceUrl: void 0,
      normalizeUnicode: true
    });
    currentResult = result;
    setStatus(`Extracted ${result.pages.length} page(s).`, "success");
    openViewer(result);
  } catch (err) {
    const e2 = err;
    setStatus(e2.userFriendly || e2.message || String(err), "error");
  } finally {
    fileInput.value = "";
  }
});
$("btn-open-viewer")?.addEventListener("click", () => {
  const viewerUrl = browser.runtime.getURL("viewer/viewer.html");
  window.open(viewerUrl, "_blank");
});
$("btn-settings")?.addEventListener("click", () => {
  const settingsUrl = browser.runtime.getURL("viewer/settings.html");
  window.open(settingsUrl, "_blank");
});
showPanel("extract");
getTabInfo();
//# sourceMappingURL=popup.js.map
