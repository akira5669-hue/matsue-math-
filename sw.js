const CACHE_NAME = 'seifukazu-quiz-v45';
// index.html側の?v=...と必ず揃えること(揃っていないとオフライン時に古い
// app.jsが使われ、HTMLとJSがちぐはぐになる)。
const ASSETS = [
  './',
  './index.html',
  './style.css?v=20260827y',
  './app.js?v=20260827y',
  './japan-map-data.js?v=20260827y',
  './avatar-data.js?v=20260827y',
  './world-data.js?v=20260827y',
  './world-data-2.js?v=20260827y',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ネットワークがあれば常に最新を取りに行き（更新の取りこぼしを防ぐ）、
// オフライン時のみキャッシュにフォールバックする。
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request, { cache: 'no-store' })
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html')))
  );
});
