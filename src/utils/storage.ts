// Storage helpers using browser.storage.local (extension-scoped, no sync).

const STORAGE_KEY_PREFIX = 'nee_';

export interface SavedExtraction {
  id: string;
  title: string;
  sourceUrl?: string;
  totalPages: number;
  pages: Array<{
    page: number;
    text: string;
    extractedAt: number;
    hasText?: boolean;
    textLength?: number;
    source?: 'native' | 'ocr';
  }>;
  fullText?: string;
  method?: 'native' | 'ocr' | 'mixed';
  metadata: Record<string, unknown>;
  createdAt: number;
}

async function storageArea() {
  // Firefox: browser.storage.local. Fallback to in-memory for tests.
  if (typeof browser === 'undefined' || !browser.storage) {
    return null;
  }
  return browser.storage.local;
}

export async function saveExtraction(data: Omit<SavedExtraction, 'id' | 'createdAt'>): Promise<string> {
  const area = await storageArea();
  if (!area) return '';
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const entry: SavedExtraction = { ...data, id, createdAt: Date.now() };
  const key = STORAGE_KEY_PREFIX + id;
  const existing = (await area.get(null)) as Record<string, SavedExtraction>;
  const updated = { ...existing, [key]: entry };
  await area.set(updated);
  return id;
}

export async function listSavedExtractions(): Promise<SavedExtraction[]> {
  const area = await storageArea();
  if (!area) return [];
  const all = (await area.get(null)) as Record<string, SavedExtraction>;
  return Object.entries(all)
    .filter(([k]) => k.startsWith(STORAGE_KEY_PREFIX))
    .map(([, v]) => v)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function getExtraction(id: string): Promise<SavedExtraction | null> {
  const area = await storageArea();
  if (!area) return null;
  const all = (await area.get(null)) as Record<string, SavedExtraction>;
  return all[STORAGE_KEY_PREFIX + id] ?? null;
}

export async function removeExtraction(id: string): Promise<void> {
  const area = await storageArea();
  if (!area) return;
  await area.remove(STORAGE_KEY_PREFIX + id);
}

export async function clearSavedExtractions(): Promise<void> {
  const area = await storageArea();
  if (!area) return;
  const all = (await area.get(null)) as Record<string, SavedExtraction>;
  const keys = Object.keys(all).filter((k) => k.startsWith(STORAGE_KEY_PREFIX));
  if (keys.length) await area.remove(keys);
}
