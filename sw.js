/* 오프라인 지원: 앱 파일을 캐시하고, 네트워크가 없어도 실행되게 한다. */
const CACHE = 'stopwatch-v1.0.0';
const ASSETS = [
  './',
  './index.html',
  './css/app.css',
  './js/core.js',
  './js/i18n.js',
  './js/track.js',
  './js/app.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 캐시 우선, 없으면 네트워크. 페이지 이동은 오프라인일 때 index.html로.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(hit => {
      if (hit) return hit;
      return fetch(req).catch(() => (req.mode === 'navigate' ? caches.match('./index.html') : undefined));
    })
  );
});
