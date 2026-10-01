// The service worker (docs/DEVELOPING.md#the-app): what makes officebit an app
// you can install. Network first, checking with the server every time (not the
// browser's own short-lived cache), so you always get the latest when online;
// everything it fetches is kept, so the town still opens offline. Its cache is
// named after the release, so a new one starts afresh and clears out the last.
const CACHE = 'officebit-%VERSION%';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return;
  event.respondWith(
    fetch(request, { cache: 'no-cache' })
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then((kept) => kept ?? Response.error())),
  );
});
