// sw.js — cache the app shell so it works offline on iPhone (CookCook)
const CACHE = 'cookcook-v23';
const SHELL = [
  './',
  './index.html',
  './style.css',
  './db.js',
  './store.js',
  './import.js',
  './calories.js',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL).catch(() => {})).then(() => self.skipWaiting()));
  // skipWaiting so the new SW activates immediately
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // Network-first for navigations (so HTML updates show), cache fallback.
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(r => { caches.open(CACHE).then(c => c.put('./index.html', r.clone())); return r; }).catch(() => caches.match('./index.html')));
    return;
  }
  // Cache-first for static assets.
  e.respondWith(caches.match(req).then(c => c || fetch(req).then(r => {
    if (r && r.status === 200 && req.url.startsWith(self.location.origin)) {
      const cl = r.clone(); caches.open(CACHE).then(ca => ca.put(req, cl));
    }
    return r;
  }).catch(() => c)));
});
