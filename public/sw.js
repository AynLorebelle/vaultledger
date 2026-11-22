// AYNLYTICS Offline-First Service Worker
const CACHE_NAME = 'aynlytics-clay-cache-v5';
const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // Only handle same-origin http(s) requests
  if (url.origin !== self.location.origin) return;
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  const isHtmlNavigation =
    request.mode === 'navigate' ||
    (request.headers.get('accept') || '').includes('text/html');

  if (isHtmlNavigation) {
    // Network-first with cache fallback for HTML navigations
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok && response.type === 'basic') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          return caches.match('./index.html');
        })
    );
    return;
  }

  // Cache-first with network fallback for static assets (JS, CSS, SVG, fonts, images)
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        // Revalidate quietly in the background for non-hashed public files
        if (!url.pathname.includes('/assets/')) {
          fetch(request)
            .then((fresh) => {
              if (fresh && fresh.ok && fresh.type === 'basic') {
                caches.open(CACHE_NAME).then((cache) => cache.put(request, fresh));
              }
            })
            .catch(() => {});
        }
        return cached;
      }

      return fetch(request).then((response) => {
        if (response && response.ok && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      });
    })
  );
});
