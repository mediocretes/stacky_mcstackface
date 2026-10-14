// What the page remembers, all of it in this browser only.
//   IndexedDB     the dataset parsed from your client files (a few hundred KB), and the
//                 spell names from your spellbook export
//   localStorage  your trio, level and view choices
// Either can be unavailable (private windows, blocked site data); the page then works for
// the visit and forgets afterwards.

const DB = 'stacky-mcstackface';
const STORE = 'kv';
const SETTINGS = 'stacky-mcstackface.settings';

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
  });
}

export async function loadDataset() {
  try { return (await tx('readonly', (s) => s.get('dataset'))) ?? null; } catch { return null; }
}

export async function saveDataset(ds) {
  try { await tx('readwrite', (s) => s.put(ds, 'dataset')); return true; } catch { return false; }
}

export async function forgetDataset() {
  try { await tx('readwrite', (s) => s.delete('dataset')); } catch { /* nothing stored */ }
}

export async function loadBook() {
  try { return (await tx('readonly', (s) => s.get('spellbook'))) ?? null; } catch { return null; }
}

export async function saveBook(book) {
  try { await tx('readwrite', (s) => s.put(book, 'spellbook')); return true; } catch { return false; }
}

export async function forgetBook() {
  try { await tx('readwrite', (s) => s.delete('spellbook')); } catch { /* nothing stored */ }
}

export function loadSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS)) ?? {}; } catch { return {}; }
}

export function saveSettings(settings) {
  try { localStorage.setItem(SETTINGS, JSON.stringify(settings)); } catch { /* not remembered */ }
}
