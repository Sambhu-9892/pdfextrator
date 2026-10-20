// src/utils/url.ts
function isPdfUrl(url) {
  if (!url) return false;
  try {
    return new URL(url).pathname.toLowerCase().endsWith(".pdf");
  } catch {
    return url.toLowerCase().split("?")[0].endsWith(".pdf");
  }
}
function isPdfMime(mime) {
  return mime === "application/pdf" || mime === "application/x-pdf";
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
function originPattern(url) {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return null;
    return `${u.origin}/*`;
  } catch {
    return null;
  }
}

export {
  isPdfUrl,
  isPdfMime,
  isProbablyPdfUrl,
  originPattern
};
//# sourceMappingURL=chunk-ZIWOL2OZ.js.map
