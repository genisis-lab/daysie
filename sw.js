// Daysie Service Worker - update-friendly caching + push notifications
//
// Strategy:
//  - Same-origin app files (HTML/JS/CSS): NETWORK-FIRST. When online, the user
//    always gets the freshly deployed files on reload, so updates apply without
//    clearing site data (which used to wipe the saved name/profile). Falls back
//    to cache when offline.
//  - Cross-origin assets (e.g. the three.js CDN): cache-first (they're immutable).
//  - We do NOT auto-skipWaiting; the page shows an update banner and asks this
//    worker to activate only when the user taps "Refresh".
const CACHE_NAME = 'daysie-v4';
const CORE = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './favicon.svg',
  './site.webmanifest',
  './version.json',
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
];

// Install - pre-cache the app shell for offline use.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE)).catch(() => {})
  );
  // Intentionally NOT calling self.skipWaiting() here.
});

// Activate - clean old caches and take control.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.map((n) => (n !== CACHE_NAME ? caches.delete(n) : null))))
      .then(() => self.clients.claim())
  );
});

// Allow the page to activate a waiting worker on demand.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Network-first for our own files so new deploys load on a normal reload.
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() =>
          caches.match(req).then((cached) => cached || caches.match('./index.html'))
        )
    );
    return;
  }

  // Cache-first for cross-origin assets (CDN libraries, etc.).
  event.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req)
          .then((res) => {
            if (res && res.status === 200) {
              const copy = res.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
            }
            return res;
          })
          .catch(() => cached)
    )
  );
});

// Push notifications - show the reminder even when Daysie is closed.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { body: event.data ? event.data.text() : '' };
  }
  const title = data.title || '⏰ Daysie Reminder';
  const options = {
    body: data.body || 'You have a reminder!',
    icon: './favicon.svg',
    badge: './favicon.svg',
    tag: data.tag || 'daysie-reminder',
    requireInteraction: !!data.requireInteraction,
    data: data.url || './',
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Notification click - focus an existing tab or open the app.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ('focus' in w) return w.focus();
      }
      return clients.openWindow(event.notification.data || './');
    })
  );
});
