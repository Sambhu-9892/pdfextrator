"use strict";
(() => {
  // src/utils/url.ts
  function isPdfUrl(url) {
    if (!url) return false;
    try {
      return new URL(url).pathname.toLowerCase().endsWith(".pdf");
    } catch {
      return url.toLowerCase().split("?")[0].endsWith(".pdf");
    }
  }
  function isProbablyPdfUrl(url) {
    if (isPdfUrl(url)) return true;
    try {
      const u = new URL(url);
      const lower = (u.pathname + u.search).toLowerCase();
      return lower.includes(".pdf") || /(?:^|[?&])format=pdf(?:&|$)/.test(lower);
    } catch {
      return false;
    }
  }

  // src/content/content.ts
  function discoverPdfLinks() {
    const links = [];
    const seen = /* @__PURE__ */ new Set();
    const anchors = document.querySelectorAll("a[href]");
    for (const anchor of anchors) {
      const el = anchor;
      const href = el.getAttribute("href");
      if (!href) continue;
      let absolute;
      try {
        absolute = new URL(href, document.baseURI).href;
      } catch {
        continue;
      }
      if (!isProbablyPdfUrl(absolute)) continue;
      if (seen.has(absolute)) continue;
      seen.add(absolute);
      const text = (el.textContent ?? "").trim() || absolute;
      const title = el.title ?? void 0;
      links.push({ url: absolute, text, title });
    }
    for (const el of document.querySelectorAll("embed[src], iframe[src]")) {
      const src = el.getAttribute("src");
      if (!src) continue;
      let absolute;
      try {
        absolute = new URL(src, document.baseURI).href;
      } catch {
        continue;
      }
      if (!isProbablyPdfUrl(absolute)) continue;
      if (seen.has(absolute)) continue;
      seen.add(absolute);
      links.push({ url: absolute, text: el.getAttribute("alt") || "PDF", title: void 0 });
    }
    return links;
  }
  browser.runtime.onMessage.addListener((message) => {
    if (message?.type !== "NEE_REQUEST_PDF_LINKS") return void 0;
    return Promise.resolve({
      links: discoverPdfLinks(),
      pageUrl: document.location.href,
      pageTitle: document.title
    });
  });
})();
//# sourceMappingURL=content.js.map
