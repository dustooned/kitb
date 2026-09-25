// Offline-first cache for the app shell, so it keeps working on flaky classroom wifi.
// Bump CACHE when shipping a new version so clients pick up fresh files.
const CACHE = 'kit-forge-v3';
const SHELL = ['./', './index.html', './style.css', './app.js', './model.js', './render.js', './project.js', './store.js', './version.js', './icon.svg', './manifest.webmanifest'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
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
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
    const copy = res.clone();
    caches.open(CACHE).then(c => c.put(e.request, copy));
    return res;
  }).catch(() => hit)));
});
