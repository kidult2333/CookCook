// db.js — minimal IndexedDB wrapper (no dependencies, works offline on iOS Safari)
const DB_NAME = 'cookcook';
const DB_VERSION = 1;

let _db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    if (_db) return resolve(_db);
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('recipes'))   db.createObjectStore('recipes',   { keyPath: 'id' });
      if (!db.objectStoreNames.contains('mealPlans'))  db.createObjectStore('mealPlans',  { keyPath: 'date' });
      if (!db.objectStoreNames.contains('pantry'))     db.createObjectStore('pantry',     { keyPath: 'id' });
      if (!db.objectStoreNames.contains('shopping'))   db.createObjectStore('shopping',   { keyPath: 'id' });
      if (!db.objectStoreNames.contains('meta'))      db.createObjectStore('meta',      { keyPath: 'key' });
    };
    req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
    req.onerror = (e) => reject(e.target.error);
  });
}

async function _store(name, mode = 'readonly') {
  const db = await openDB();
  return db.transaction(name, mode).objectStore(name);
}

async function dbPut(store, value) {
  const os = await _store(store, 'readwrite');
  return new Promise((res, rej) => {
    const r = os.put(value);
    r.onsuccess = () => res(value);
    r.onerror = () => rej(r.error);
  });
}
async function dbGet(store, key) {
  const os = await _store(store);
  return new Promise((res, rej) => {
    const r = os.get(key);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function dbAll(store) {
  const os = await _store(store);
  return new Promise((res, rej) => {
    const r = os.getAll();
    r.onsuccess = () => res(r.result || []);
    r.onerror = () => rej(r.error);
  });
}
async function dbDel(store, key) {
  const os = await _store(store, 'readwrite');
  return new Promise((res, rej) => {
    const r = os.delete(key);
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
}
async function dbClear(store) {
  const os = await _store(store, 'readwrite');
  return new Promise((res, rej) => {
    const r = os.clear();
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
}

// Generate a unique id (crypto.randomUUID if available, else fallback)
function uid() {
  if (crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}
