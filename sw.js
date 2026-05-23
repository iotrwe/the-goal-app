/* --------------------------------------------------
   The Goal - Self-Destroying PWA Service Worker
   Forces active caches to clear and reloads to the latest code.
-------------------------------------------------- */

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => caches.delete(key))
      );
    }).then(() => {
      return self.registration.unregister();
    }).then(() => {
      return self.clients.matchAll();
    }).then((clients) => {
      clients.forEach((client) => {
        if (client.url) {
          try {
            client.navigate(client.url);
          } catch (err) {
            console.error('Failed to force navigate client:', err);
          }
        }
      });
    })
  );
});
