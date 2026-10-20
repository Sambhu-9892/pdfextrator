import {
  clearSavedExtractions,
  listSavedExtractions,
  removeExtraction
} from "../chunks/chunk-YIOVUUPR.js";
import {
  getOcrStatus,
  isOcrAvailable
} from "../chunks/chunk-XQ7HA5KY.js";
import "../chunks/chunk-M7PQRUNY.js";

// viewer/settings.ts
var $ = (id) => document.getElementById(id);
function setTheme(dark) {
  document.body.classList.toggle("dark", dark);
  localStorage.setItem("nee_theme", dark ? "1" : "0");
}
var toggle = document.querySelector(".theme-toggle");
if (toggle) toggle.addEventListener("click", () => setTheme(document.body.classList.toggle("dark", !document.body.classList.contains("dark"))));
if (localStorage.getItem("nee_theme") === "1") setTheme(true);
$("btn-ocr-status")?.addEventListener("click", async () => {
  const el = $("ocr-status");
  el.textContent = "Checking\u2026";
  try {
    const status = await getOcrStatus();
    el.innerHTML = `<div>Available: ${status.available}</div><div>Loaded: ${status.loaded} (${status.lang ?? "none"})</div><div>Needs network: ${status.needsNetwork}</div>`;
  } catch (err) {
    el.textContent = `Error: ${err}`;
  }
});
if (!isOcrAvailable()) {
  $("ocr-hint").textContent = "Tesseract.js OCR is not available in this environment.";
  $("ocr-status").textContent = "OCR unavailable";
}
async function listSaved() {
  const list = await listSavedExtractions();
  const el = $("saved-list");
  if (!list.length) {
    el.textContent = "No saved extractions.";
    return;
  }
  el.innerHTML = "";
  for (const item of list) {
    const div = document.createElement("div");
    div.className = "saved-item";
    div.textContent = `${item.title} \u2014 ${item.totalPages} pages \u2014 ${new Date(item.createdAt).toLocaleString()}`;
    div.style.cursor = "pointer";
    div.addEventListener("click", async () => {
      if (confirm(`Remove "${item.title}"?`)) {
        await removeExtraction(item.id);
        listSaved();
      }
    });
    el.appendChild(div);
  }
}
$("btn-list-saved")?.addEventListener("click", listSaved);
$("btn-clear-saved")?.addEventListener("click", async () => {
  if (confirm("Clear all saved extractions?")) {
    await clearSavedExtractions();
    listSaved();
  }
});
listSaved();
//# sourceMappingURL=settings.js.map
