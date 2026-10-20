# Nepali English PDF Extractor

Firefox extension (Manifest V3) that extracts Nepali (Devanagari) and English text from PDF documents opened in Firefox or linked from websites. All processing happens **locally in the browser** — no external server, no API keys, no document uploads.

## Features

- Extract text from the current PDF tab (native PDF.js text layer).
- Discover and extract PDF links from an ordinary webpage.
- Import a local PDF file for extraction.
- Preserve Nepali Devanagari Unicode (vowel signs, conjunct consonants, diacritics, Devanagari digits) and English Latin text.
- Mixed Nepali-English paragraph support, page-level text, document metadata.
- Search extracted text (Nepali/English) with match highlighting and per-page navigation.
- Copy all text / copy current page.
- Download TXT (UTF-8), JSON (metadata + page-level text), and optional DOCX (Devanagari font).
- OCR mode (Tesseract.js, Nepali `nep` + English `eng`) for scanned pages and legacy-font PDFs (Preeti/Kantipur).
- Full-page extraction workspace in a dedicated extension tab (not a cramped popup).
- Dark/light themes, keyboard navigation, accessible labels, responsive layout.
- Local storage of saved extractions (`storage.local` only).

## Architecture

```
manifest.json            # Firefox Manifest V3
src/background.ts        # Background script: tab coordination, PDF fetching, extraction
src/pdf/extractor.ts     # PDF.js-based native text extraction
src/ocr/index.ts         # Optional Tesseract.js OCR (nep + eng)
src/export/index.ts      # TXT / JSON / DOCX export
src/utils/unicode.ts     # Devanagari helpers, NFC normalization, filename sanitizing
src/utils/storage.ts     # browser.storage.local saved extractions
src/content/content.ts   # Content script: discover PDF links on webpages
popup/*.{ts,html,css}    # Popup: quick actions (extract current PDF, page PDFs, import)
viewer/*.{ts,html,css}   # Full-page extraction workspace (extension tab)
tests/*.test.ts          # Vitest tests
scripts/copy-assets.js   # Copies PDF.js worker/assets + icons locally
scripts/package-zip.js   # Packages installable .zip
```

## Technology stack

- Firefox WebExtensions API (Manifest V3)
- TypeScript
- PDF.js (`pdfjs-dist@4.8.69`) — worker + assets bundled locally
- Tesseract.js (`tesseract.js@5.1.1`) — optional OCR (nep + eng)
- docx (`docx@9.3.0`) — optional DOCX export
- Vitest + jsdom — testing

## Prerequisites

- Node.js (v18+) and npm
- Firefox (tested on desktop; Manifest V3)

## Install dependencies

```bash
cd /home/spy/Desktop/pdfextractor
npm install
```

## Build

Typecheck, bundle the TypeScript with esbuild, and copy PDF.js/Tesseract assets into the extension root:

```bash
npm run build
```

esbuild emits self-contained ES modules (`src/background.js`, `popup/popup.js`, `viewer/viewer.js`, `viewer/settings.js`), a shared `chunks/` directory, and a classic IIFE `src/content/content.js`. It also populates `pdf/` (worker, cmaps, fonts) and `vendor/` (Tesseract worker/core). The extension root is then loadable directly in Firefox.

Individual steps:

```bash
npm run typecheck   # tsc --noEmit
npm run build:js    # esbuild bundles only
npm run build:assets
```

Run tests:

```bash
npm test       # vitest run
```

## Load the extension temporarily in Firefox

1. Build: `npm run build`.
2. Open Firefox and go to `about:debugging#/addons/this-firefox`.
3. Click **Load Temporary Add-on…**.
4. Select the `manifest.json` file in this project root.
5. The extension icon appears in the toolbar.

Because this is a temporary add-on, it will be unloaded when Firefox restarts. For persistent use, package and install, or reload after restart.

## How to use

1. Open a PDF in Firefox (direct `.pdf` URL or Firefox's built-in viewer).
2. Click the extension icon.
3. Choose **Extract Current PDF** (opens the full workspace) or **Import File** for a local PDF.
4. In the workspace:
   - Select pages (all or custom range, e.g. `1,3,5-7`).
   - Click **Extract Text (Native)**.
   - Use Search to find Nepali or English words (matches highlight across pages).
   - Navigate pages with Previous/Next.
   - Copy all text, copy current page, or export TXT/JSON/DOCX.
5. If the text is empty or looks like gibberish (legacy Nepali fonts such as Preeti/Kantipur), click **Extract with OCR**. If the source PDF is not available, click **Choose PDF file…** first.
6. For a webpage with PDF links: click **Page PDFs** → **Discover PDF Links**, then select and extract.

## PDF access notes

- The extension fetches PDF bytes itself and parses them with PDF.js; it does **not** rely on Firefox's built-in PDF viewer exposing internal objects.
- Cross-origin PDFs: if the extension lacks `<all_urls>`/downloads permission or the server blocks the request, extraction reports an error with a suggestion (e.g., download the PDF first and use **Import File**).
- The extension never bypasses authentication, CORS, or site restrictions.
- Password-protected PDFs: PDF.js will prompt/report a password requirement; the extension surfaces a clear error.

## OCR (scanned/image/legacy-font PDFs)

Some Nepali PDFs embed text in legacy fonts (Preeti, Kantipur, etc.) without a Unicode map. Native extraction then returns gibberish even though the page looks correct. OCR renders each page locally and recognizes the visible Devanagari/English text, producing proper Unicode.

OCR requires Tesseract.js language data (`nep` + `eng`, about 6 MB), downloaded from the Tesseract.js CDN on first use and cached. PDF pages are rendered locally; no PDF content is uploaded. OCR is CPU/memory-intensive and slower than native extraction. The worker, core WASM, and the Tesseract script are bundled in `vendor/` so the extension CSP does not need remote code.

Open **Settings** → **Check OCR status** to verify availability. OCR results are marked as `source: "ocr"` in the JSON export so they remain distinguishable from native text.

## Export formats

- **TXT** — UTF-8 plain text, page-separated.
- **JSON** — document metadata + per-page text and source (`native`/`ocr`).
- **DOCX** — sets `Noto Sans Devanagari` font so Devanagari renders correctly.

Filenames are sanitized before download. Native extraction and exports stay on your device; only OCR language data is downloaded.

## Privacy

- PDF content is processed locally in your browser.
- Nothing is uploaded to a backend.
- No analytics or telemetry.
- Saved extractions live in `browser.storage.local` only and are cleared when you remove them or clear storage.

## Testing

```bash
npm test
```

Tests cover:
- Nepali/English/mixed Unicode extraction, Devanagari digits & combining marks.
- Multi-page and empty/image-only page handling.
- TXT/JSON export content and UTF-8 preservation.
- Filename sanitization.

The extension is designed to be loaded in Firefox via `about:debugging#/addons/this-firefox` for end-to-end verification.

## Packaging (installable ZIP)

```bash
npm run package:zip
```

Produces `nepali-pdf-extractor.zip` containing the loadable extension files (suitable for local testing or submission).

## Submitting to Mozilla Add-ons (AMO)

1. Package the extension: `npm run package:zip`.
2. Go to https://addons.mozilla.org/en-US/developers/ and log in.
3. Submit the `.zip` through the developer hub.
4. Provide the required metadata (name, description, category, privacy policy).
5. Mozilla reviews the add-on before public listing.

**Note:** This repository has not been submitted to or published on AMO. The submission guidance above is informational only; no claim of AMO publication or successful review is made.

## Debugging

- Open the Browser Console (`Ctrl+Shift+J`) to see background-script errors.
- Open the extension-page console for the viewer: right-click the viewer page → Inspect, or use `about:debugging` → Inspect on the extension's background page.
- Permission failures (e.g., cross-origin PDF) surface in the workspace error panel with a user-friendly message and suggestion.
- If PDF.js worker fails to load, ensure `pdf/pdf.worker.min.mjs` exists after `npm run build`.

## License

MIT
