import { getOcrStatus, isOcrAvailable } from '../src/ocr/index';
import { listSavedExtractions, removeExtraction, clearSavedExtractions } from '../src/utils/storage';

const $ = (id: string) => document.getElementById(id) as HTMLElement;

function setTheme(dark: boolean) {
  document.body.classList.toggle('dark', dark);
  localStorage.setItem('nee_theme', dark ? '1' : '0');
}
const toggle = document.querySelector('.theme-toggle') as HTMLElement;
if (toggle) toggle.addEventListener('click', () => setTheme(document.body.classList.toggle('dark', !document.body.classList.contains('dark'))));
if (localStorage.getItem('nee_theme') === '1') setTheme(true);

// OCR status
$('btn-ocr-status')?.addEventListener('click', async () => {
  const el = $('ocr-status');
  el.textContent = 'Checking…';
  try {
    const status = await getOcrStatus();
    el.innerHTML = `<div>Available: ${status.available}</div><div>Loaded: ${status.loaded} (${status.lang ?? 'none'})</div><div>Needs network: ${status.needsNetwork}</div>`;
  } catch (err) {
    el.textContent = `Error: ${err}`;
  }
});
if (!isOcrAvailable()) {
  $('ocr-hint')!.textContent = 'Tesseract.js OCR is not available in this environment.';
  $('ocr-status')!.textContent = 'OCR unavailable';
}

// Saved extractions
async function listSaved() {
  const list = await listSavedExtractions();
  const el = $('saved-list');
  if (!list.length) { el.textContent = 'No saved extractions.'; return; }
  el.innerHTML = '';
  for (const item of list) {
    const div = document.createElement('div');
    div.className = 'saved-item';
    div.textContent = `${item.title} — ${item.totalPages} pages — ${new Date(item.createdAt).toLocaleString()}`;
    div.style.cursor = 'pointer';
    div.addEventListener('click', async () => {
      if (confirm(`Remove "${item.title}"?`)) {
        await removeExtraction(item.id);
        listSaved();
      }
    });
    el.appendChild(div);
  }
}
$('btn-list-saved')?.addEventListener('click', listSaved);

$('btn-clear-saved')?.addEventListener('click', async () => {
  if (confirm('Clear all saved extractions?')) {
    await clearSavedExtractions();
    listSaved();
  }
});

listSaved();

export {};
