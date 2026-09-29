// Offline support for flaky classroom wifi (network-first, see the fetch handler).
// Bump CACHE on releases so old cached copies are cleared.
const CACHE = 'kit-forge-v12';
const SHELL = ['./', './index.html', './style.css', './app.js', './model.js', './render.js', './project.js', './store.js', './icons.js', './gallery.js', './version.js', './icon.svg', './manifest.webmanifest', './manual.html'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // let CDN (JSZip) requests pass through normally
  // Network-first: online, always the newest files (so releases show up on the next load);
  // offline, the last good copy from the cache.
  const req = e.request;
  e.respondWith(fetch(req.mode === 'navigate' ? req.url : req, { cache: 'no-cache' }).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true })));
});
