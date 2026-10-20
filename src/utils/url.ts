export function isPdfUrl(url: string | undefined | null): boolean {
  if (!url) return false;
  try {
    return new URL(url).pathname.toLowerCase().endsWith('.pdf');
  } catch {
    return url.toLowerCase().split('?')[0].endsWith('.pdf');
  }
}

export function isPdfMime(mime: string | null): boolean {
  return mime === 'application/pdf' || mime === 'application/x-pdf';
}

export function isProbablyPdfUrl(url: string): boolean {
  // Handles URLs with query strings, e.g. /download?file=doc.pdf
  if (isPdfUrl(url)) return true;
  try {
    const u = new URL(url);
    const lower = (u.pathname + u.search).toLowerCase();
    return lower.includes('.pdf') || /(?:^|[?&])format=pdf(?:&|$)/.test(lower);
  } catch {
    return false;
  }
}

export function originPattern(url: string): string | null {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return null;
    return `${u.origin}/*`;
  } catch {
    return null;
  }
}
