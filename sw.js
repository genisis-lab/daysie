// Daysie Service Worker - update-friendly caching + family-list hotfix
const CACHE_NAME = 'daysie-v7';
const CORE = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './app2.js',
  './app3.js',
  './favicon.svg',
  './site.webmanifest',
  './version.json',
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
];

// This small patch is appended to app3.js at fetch time. It avoids another huge
// app3.js upload while still fixing the Family modal field width and making
// shared-list edits notify the rest of the family immediately.
const APP3_HOTFIX = `
;(() => {
  try {
    const style = document.createElement('style');
    style.id = 'familyHotfixStyles';
    style.textContent = '#familyDialog label,#familyDialog input,#familyDialog select{min-width:0!important;max-width:100%!important;box-sizing:border-box!important}#remindWhen{display:block!important;width:100%!important;max-width:100%!important;appearance:none!important;-webkit-appearance:none!important}';
    document.head.appendChild(style);
  } catch (e) {}

  async function notifySharedListUpdate(actionText) {
    try {
      if (!settings || !settings.authToken || !window.family || !window.family.familyId) return;
      const members = (window.family.members || []).filter((m) => !m.isMe && m.userId);
      if (!members.length) return;
      const title = 'Shared list updated';
      await Promise.allSettled(members.map((m) => fetch(API + '/family/remind', {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify({ toUser: m.userId, title: title, fireAt: Date.now() })
      })));
    } catch (e) {}
  }

  if (typeof saveFamilyLists === 'function' && !saveFamilyLists.__daysieHotfix) {
    const originalSaveFamilyLists = saveFamilyLists;
    saveFamilyLists = async function(actionText) {
      await originalSaveFamilyLists.apply(this, arguments);
      await notifySharedListUpdate(actionText || 'updated a shared list');
    };
    saveFamilyLists.__daysieHotfix = true;
  }

  if ('serviceWorker' in navigator && !window.__daysieFamilyListMessageHotfix) {
    window.__daysieFamilyListMessageHotfix = true;
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'family-list-updated') {
        try { if (typeof loadFamily === 'function') loadFamily(); } catch (e) {}
        try { if (typeof loadFamilyLists === 'function') loadFamilyLists(); } catch (e) {}
        try { if (typeof toast === 'function') toast('📝 Shared list updated', event.data.body || 'A family member changed a list.'); } catch (e) {}
      }
    });
  }
})();
`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE)).catch(() => {})
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.map((n) => (n !== CACHE_NAME ? caches.delete(n) : null))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    // Patch app3.js as it loads so family-list updates can notify everyone and
    // the When field gets the same width behavior as other fields.
    if (url.pathname.endsWith('/app3.js')) {
      event.respondWith(
        fetch(req, { cache: 'no-store' })
          .then(async (res) => {
            if (!res || !res.ok) throw new Error('app3 fetch failed');
            const text = await res.text();
            const patched = text.includes('__daysieFamilyListMessageHotfix') ? text : text + '\n' + APP3_HOTFIX;
            const out = new Response(patched, {
              status: 200,
              statusText: 'OK',
              headers: { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store' },
            });
            const copy = out.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
            return out;
          })
          .catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
      );
      return;
    }

    event.respondWith(
      fetch(req, { cache: 'no-store' })
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(
      (cached) => cached || fetch(req).then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return res;
      }).catch(() => cached)
    )
  );
});

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; }
  catch (e) { data = { body: event.data ? event.data.text() : '' }; }
  const title = data.title || '⏰ Daysie Reminder';
  const body = data.body || 'You have a reminder!';
  const options = {
    body,
    icon: './favicon.svg',
    badge: './favicon.svg',
    tag: data.tag || 'daysie-reminder',
    requireInteraction: !!data.requireInteraction,
    data: data.url || './',
  };
  event.waitUntil((async () => {
    if (data.type === 'family-list-updated' || /shared list/i.test(title + ' ' + body)) {
      const wins = await clients.matchAll({ type: 'window', includeUncontrolled: true });
      wins.forEach((w) => w.postMessage({ type: 'family-list-updated', body }));
    }
    await self.registration.showNotification(title, options);
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) if ('focus' in w) return w.focus();
      return clients.openWindow(event.notification.data || './');
    })
  );
});
