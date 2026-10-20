// src/utils/storage.ts
var STORAGE_KEY_PREFIX = "nee_";
async function storageArea() {
  if (typeof browser === "undefined" || !browser.storage) {
    return null;
  }
  return browser.storage.local;
}
async function saveExtraction(data) {
  const area = await storageArea();
  if (!area) return "";
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const entry = { ...data, id, createdAt: Date.now() };
  const key = STORAGE_KEY_PREFIX + id;
  const existing = await area.get(null);
  const updated = { ...existing, [key]: entry };
  await area.set(updated);
  return id;
}
async function listSavedExtractions() {
  const area = await storageArea();
  if (!area) return [];
  const all = await area.get(null);
  return Object.entries(all).filter(([k]) => k.startsWith(STORAGE_KEY_PREFIX)).map(([, v]) => v).sort((a, b) => b.createdAt - a.createdAt);
}
async function getExtraction(id) {
  const area = await storageArea();
  if (!area) return null;
  const all = await area.get(null);
  return all[STORAGE_KEY_PREFIX + id] ?? null;
}
async function removeExtraction(id) {
  const area = await storageArea();
  if (!area) return;
  await area.remove(STORAGE_KEY_PREFIX + id);
}
async function clearSavedExtractions() {
  const area = await storageArea();
  if (!area) return;
  const all = await area.get(null);
  const keys = Object.keys(all).filter((k) => k.startsWith(STORAGE_KEY_PREFIX));
  if (keys.length) await area.remove(keys);
}

export {
  saveExtraction,
  listSavedExtractions,
  getExtraction,
  removeExtraction,
  clearSavedExtractions
};
//# sourceMappingURL=chunk-YIOVUUPR.js.map
