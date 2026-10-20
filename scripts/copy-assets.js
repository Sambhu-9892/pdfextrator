/**
 * Build script: copies PDF.js worker/assets and icons into the extension root
 * so the extension loads entirely from local files (no remote code).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PDFJS_BUILD = path.resolve(ROOT, 'node_modules', 'pdfjs-dist', 'build');
const PDFJS_CMAPS = path.resolve(ROOT, 'node_modules', 'pdfjs-dist', 'cmaps');
const PDFJS_STD = path.resolve(ROOT, 'node_modules', 'pdfjs-dist', 'standard_fonts');
const PDFJS_IMG = path.resolve(ROOT, 'node_modules', 'pdfjs-dist', 'image_decoders');

function mkdir(p) { fs.mkdirSync(p, { recursive: true }); }
function cp(src, dest) { fs.copyFileSync(src, dest); }
function cpDir(src, dest) {
  mkdir(dest);
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) cpDir(s, d);
    else cp(s, d);
  }
}

mkdir(path.join(ROOT, 'pdf'));

// PDF.js worker (self-contained) + support assets
cp(path.join(PDFJS_BUILD, 'pdf.worker.min.mjs'), path.join(ROOT, 'pdf', 'pdf.worker.min.mjs'));
cpDir(PDFJS_CMAPS, path.join(ROOT, 'pdf', 'cmaps'));
cpDir(PDFJS_STD, path.join(ROOT, 'pdf', 'standard_fonts'));
cpDir(PDFJS_IMG, path.join(ROOT, 'pdf', 'image_decoders'));

// Tesseract.js: vendor the UMD build, worker, and core (wasm/js) locally so
// OCR works under the extension CSP (script-src 'self'). Language data is
// still fetched on demand from the Tesseract CDN (allowed via fetch).
const TESSERACT_DIST = path.resolve(ROOT, 'node_modules', 'tesseract.js', 'dist');
const TESSERACT_CORE = path.resolve(ROOT, 'node_modules', 'tesseract.js-core');
const VENDOR = path.join(ROOT, 'vendor');
mkdir(VENDOR);
if (fs.existsSync(path.join(TESSERACT_DIST, 'tesseract.min.js'))) {
  cp(path.join(TESSERACT_DIST, 'tesseract.min.js'), path.join(VENDOR, 'tesseract.min.js'));
}
if (fs.existsSync(path.join(TESSERACT_DIST, 'worker.min.js'))) {
  cp(path.join(TESSERACT_DIST, 'worker.min.js'), path.join(VENDOR, 'tesseract-worker.min.js'));
}
if (fs.existsSync(TESSERACT_CORE)) {
  // The worker resolves the core wasm relative to its own directory
  // (vendor/tesseract-worker.min.js), so keep the core files flat in vendor/.
  for (const entry of fs.readdirSync(TESSERACT_CORE)) {
    if (/\.(js|wasm)$/.test(entry)) {
      cp(path.join(TESSERACT_CORE, entry), path.join(VENDOR, entry));
    }
  }
}

// Icons: create fallback SVG icons if none provided
const ICONS_DIR = path.join(ROOT, 'icons');
mkdir(ICONS_DIR);
const needed = ['icon-16.svg', 'icon-48.svg', 'icon-128.svg'];
const missing = needed.filter((f) => !fs.existsSync(path.join(ICONS_DIR, f)));
if (missing.length) {
  const svg16 = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" rx="3" fill="%232563eb"/><text x="8" y="11" font-size="10" text-anchor="middle" fill="%23fff" font-family="sans-serif" font-weight="bold">NE</text></svg>`;
  const svg48 = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><rect width="48" height="48" rx="8" fill="%232563eb"/><text x="24" y="30" font-size="24" text-anchor="middle" fill="%23fff" font-family="sans-serif" font-weight="bold">NE</text></svg>`;
  const svg128 = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><rect width="128" height="128" rx="20" fill="%232563eb"/><text x="64" y="72" font-size="56" text-anchor="middle" fill="%23fff" font-family="sans-serif" font-weight="bold">NE</text></svg>`;
  const map = { 'icon-16.svg': svg16, 'icon-48.svg': svg48, 'icon-128.svg': svg128 };
  for (const f of missing) fs.writeFileSync(path.join(ICONS_DIR, f), map[f]);
}

console.log('Assets copied to extension root.');
