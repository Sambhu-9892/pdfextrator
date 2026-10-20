// src/ocr/index.ts
var workerInstance = null;
var loadingPromise = null;
var currentLang = null;
var tesseractPromise = null;
var progressSink = null;
function emitProgress(message) {
  try {
    progressSink?.({
      status: String(message?.status ?? ""),
      percent: Math.round((message?.progress ?? 0) * 100)
    });
  } catch {
  }
}
function isOcrAvailable() {
  return typeof window !== "undefined" && typeof Worker !== "undefined";
}
function runtimeUrl(path) {
  const g = globalThis;
  const runtime = g.browser?.runtime ?? g.chrome?.runtime;
  if (runtime?.getURL) return runtime.getURL(path);
  return path;
}
function loadTesseract() {
  const g = globalThis;
  if (g.Tesseract) return Promise.resolve(g.Tesseract);
  if (tesseractPromise) return tesseractPromise;
  tesseractPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = runtimeUrl("vendor/tesseract.min.js");
    script.onload = () => {
      if (g.Tesseract) resolve(g.Tesseract);
      else reject(new Error("Tesseract.js failed to initialize."));
    };
    script.onerror = () => reject(new Error("Could not load vendor/tesseract.min.js. Run `npm run build` first."));
    document.head.appendChild(script);
  });
  return tesseractPromise;
}
async function ensureOcrWorker(opts = {}) {
  const lang = opts.lang ?? "nep+eng";
  progressSink = opts.onProgress ?? null;
  if (workerInstance && currentLang === lang) return;
  if (loadingPromise) {
    await loadingPromise;
    if (workerInstance && currentLang === lang) return;
  }
  loadingPromise = (async () => {
    const Tesseract = await loadTesseract();
    const options = {
      workerPath: runtimeUrl("vendor/tesseract-worker.min.js"),
      corePath: runtimeUrl("vendor"),
      langPath: "https://tessdata.projectnaptha.com/4.0.0",
      workerBlobURL: false,
      gzip: true,
      logger: emitProgress
    };
    const worker = await Tesseract.createWorker(lang, 1, options);
    try {
      await worker.setParameters({
        tessedit_pageseg_mode: "3",
        preserve_interword_spaces: "1"
      });
    } catch {
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
      "OCR could not start. Nepali/English language data may be unavailable. Check your network connection and try again. (" + String(err) + ")"
    );
  }
}
async function ocrPage(image, opts = {}) {
  const lang = opts.lang ?? "nep+eng";
  await ensureOcrWorker(opts);
  progressSink = opts.onProgress ?? null;
  const worker = workerInstance;
  if (!worker) throw new Error("OCR worker failed to initialize.");
  const result = await worker.recognize(image);
  const data = result?.data ?? {};
  return {
    text: data.text ?? "",
    lang,
    confidence: data.confidence,
    source: "ocr"
  };
}
async function ocrCancel() {
  if (workerInstance) {
    try {
      await workerInstance.terminate();
    } catch {
    }
  }
  workerInstance = null;
  currentLang = null;
  loadingPromise = null;
  progressSink = null;
}
async function getOcrStatus() {
  return {
    available: isOcrAvailable(),
    loaded: workerInstance != null && currentLang != null,
    lang: currentLang,
    needsNetwork: true
  };
}
function ocrWarningHtml() {
  return "<p><strong>OCR notice:</strong> Best for scanned pages and garbled legacy fonts (Preeti/Kantipur).</p><p>Nepali (nep) + English (eng) language data (~6 MB) is downloaded from the Tesseract CDN on first use and cached. Pages are rendered locally; no PDF content is uploaded. OCR is CPU-intensive and slower than native extraction.</p>";
}

export {
  isOcrAvailable,
  ocrPage,
  ocrCancel,
  getOcrStatus,
  ocrWarningHtml
};
//# sourceMappingURL=chunk-XQ7HA5KY.js.map
