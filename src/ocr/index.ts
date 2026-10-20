// OCR module using Tesseract.js (vendored UMD) with Nepali (nep) + English (eng).
// Language data is loaded on demand from the Tesseract CDN (network required).
// The worker script and core WASM are bundled locally so OCR works under the
// extension CSP (script-src 'self').

export interface OcrOptions {
  lang?: string;
  onProgress?: (progress: { status: string; percent: number }) => void;
  signal?: AbortSignal;
}

export interface OcrResult {
  text: string;
  lang: string;
  confidence?: number;
  source: 'ocr';
}

let workerInstance: any = null;
let loadingPromise: Promise<any> | null = null;
let currentLang: string | null = null;
let tesseractPromise: Promise<any> | null = null;
let progressSink: ((progress: { status: string; percent: number }) => void) | null = null;

function emitProgress(message: any): void {
  try {
    progressSink?.({
      status: String(message?.status ?? ''),
      percent: Math.round((message?.progress ?? 0) * 100),
    });
  } catch {
    /* ignore listener errors */
  }
}

export function isOcrAvailable(): boolean {
  return typeof window !== 'undefined' && typeof Worker !== 'undefined';
}

function runtimeUrl(path: string): string {
  const g: any = globalThis;
  const runtime = g.browser?.runtime ?? g.chrome?.runtime;
  if (runtime?.getURL) return runtime.getURL(path);
  return path;
}

function loadTesseract(): Promise<any> {
  const g: any = globalThis;
  if (g.Tesseract) return Promise.resolve(g.Tesseract);
  if (tesseractPromise) return tesseractPromise;
  tesseractPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = runtimeUrl('vendor/tesseract.min.js');
    script.onload = () => {
      if (g.Tesseract) resolve(g.Tesseract);
      else reject(new Error('Tesseract.js failed to initialize.'));
    };
    script.onerror = () => reject(new Error('Could not load vendor/tesseract.min.js. Run `npm run build` first.'));
    document.head.appendChild(script);
  });
  return tesseractPromise;
}

export async function ensureOcrWorker(opts: OcrOptions = {}): Promise<void> {
  const lang = opts.lang ?? 'nep+eng';
  progressSink = opts.onProgress ?? null;
  if (workerInstance && currentLang === lang) return;
  if (loadingPromise) {
    await loadingPromise;
    if (workerInstance && currentLang === lang) return;
  }

  loadingPromise = (async () => {
    const Tesseract = await loadTesseract();
    const options: Record<string, unknown> = {
      workerPath: runtimeUrl('vendor/tesseract-worker.min.js'),
      corePath: runtimeUrl('vendor'),
      langPath: 'https://tessdata.projectnaptha.com/4.0.0',
      workerBlobURL: false,
      gzip: true,
      logger: emitProgress,
    };
    // OEM 1 = LSTM only (required for the standard traineddata).
    const worker = await Tesseract.createWorker(lang, 1, options);
    // AUTO layout handles single- and multi-column pages; preserving spaces
    // keeps Devanagari words from being glued together.
    try {
      await worker.setParameters({
        tessedit_pageseg_mode: '3',
        preserve_interword_spaces: '1',
      });
    } catch {
      /* parameter tuning is best-effort */
    }
    workerInstance = worker;
    currentLang = lang;
  })();
  try {
    await loadingPromise;
  } catch (err) {
    loadingPromise = null;
    workerInstance = null;
    currentLang = null;
    throw new Error(
      'OCR could not start. Nepali/English language data may be unavailable. ' +
        'Check your network connection and try again. (' + String(err) + ')'
    );
  }
}

export async function ocrPage(
  image: ImageData | string | HTMLCanvasElement,
  opts: OcrOptions = {}
): Promise<OcrResult> {
  const lang = opts.lang ?? 'nep+eng';
  await ensureOcrWorker(opts);
  progressSink = opts.onProgress ?? null;
  const worker = workerInstance;
  if (!worker) throw new Error('OCR worker failed to initialize.');
  const result: any = await worker.recognize(image);
  const data = result?.data ?? {};
  return {
    text: data.text ?? '',
    lang,
    confidence: data.confidence,
    source: 'ocr',
  };
}

export async function ocrCancel(): Promise<void> {
  if (workerInstance) {
    try {
      await workerInstance.terminate();
    } catch {
      /* ignore */
    }
  }
  workerInstance = null;
  currentLang = null;
  loadingPromise = null;
  progressSink = null;
}

export async function getOcrStatus(): Promise<{
  available: boolean;
  loaded: boolean;
  lang: string | null;
  needsNetwork: boolean;
}> {
  return {
    available: isOcrAvailable(),
    loaded: workerInstance != null && currentLang != null,
    lang: currentLang,
    needsNetwork: true,
  };
}

export function ocrWarningHtml(): string {
  return (
    '<p><strong>OCR notice:</strong> Best for scanned pages and garbled legacy fonts (Preeti/Kantipur).</p>' +
    '<p>Nepali (nep) + English (eng) language data (~6 MB) is downloaded from the Tesseract CDN on first use and cached. Pages are rendered locally; no PDF content is uploaded. OCR is CPU-intensive and slower than native extraction.</p>'
  );
}
