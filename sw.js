/* --------------------------------------------------
   The Goal - PWA Service Worker for Offline access
-------------------------------------------------- */

const CACHE_NAME = 'the-goal-v3';
const ASSETS_TO_CACHE = [
  'index.html',
  'style.css',
  'app.js',
  'manifest.json'
];

// Install Event
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event
self.addEventListener('fetch', (e) => {
  // Exclude Fireworks API calls from caching
  if (e.request.url.includes('api.fireworks.ai')) {
    return;
  }

  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(e.request).then((networkResponse) => {
        // Cache new static request responses dynamically if needed
        return networkResponse;
      });
    }).catch(() => {
      // Offline fallback can be defined here if necessary
    })
  );
});
