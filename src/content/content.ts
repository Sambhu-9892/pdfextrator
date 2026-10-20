// Content script: discovers PDF links on ordinary webpages and answers
// on-demand requests from the background/popup.
import { isProbablyPdfUrl } from '../utils/url';

export interface PdfLink {
  url: string;
  text: string;
  title?: string;
}

export function discoverPdfLinks(): PdfLink[] {
  const links: PdfLink[] = [];
  const seen = new Set<string>();
  const anchors = document.querySelectorAll('a[href]');

  for (const anchor of anchors) {
    const el = anchor as HTMLAnchorElement;
    const href = el.getAttribute('href');
    if (!href) continue;
    let absolute: string;
    try {
      absolute = new URL(href, document.baseURI).href;
    } catch {
      continue;
    }
    if (!isProbablyPdfUrl(absolute)) continue;
    if (seen.has(absolute)) continue;
    seen.add(absolute);

    const text = (el.textContent ?? '').trim() || absolute;
    const title = el.title ?? undefined;
    links.push({ url: absolute, text, title });
  }

  // Also check <embed> and <iframe> pointing to PDFs
  for (const el of document.querySelectorAll('embed[src], iframe[src]')) {
    const src = el.getAttribute('src');
    if (!src) continue;
    let absolute: string;
    try {
      absolute = new URL(src, document.baseURI).href;
    } catch {
      continue;
    }
    if (!isProbablyPdfUrl(absolute)) continue;
    if (seen.has(absolute)) continue;
    seen.add(absolute);
    links.push({ url: absolute, text: el.getAttribute('alt') || 'PDF', title: undefined });
  }

  return links;
}

browser.runtime.onMessage.addListener((message: { type?: string }) => {
  if (message?.type !== 'NEE_REQUEST_PDF_LINKS') return undefined;
  return Promise.resolve({
    links: discoverPdfLinks(),
    pageUrl: document.location.href,
    pageTitle: document.title,
  });
});

export {};
