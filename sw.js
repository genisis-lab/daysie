// Daysie Service Worker - update-friendly caching + push notifications
const CACHE_NAME = "daysie-v23";
const CORE = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./app2.js",
  "./app3.js",
  "./auth-ui.js",
  "./auth-client.bundle.js",
  "./account-features.js",
  "./favicon.svg",
  "./site.webmanifest",
  "./version.json",
];
const safeClientUrl = (value) => {
  try {
    const url = new URL(value || "./", self.location.origin);
    return url.origin === self.location.origin ? url.href : "./";
  } catch (e) {
    return "./";
  }
};

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE))
      .catch(() => {}),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names.map((n) => (n !== CACHE_NAME ? caches.delete(n) : null)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(req, { cache: "no-store" })
        .then((res) => {
          if (res && res.status === 200 && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() =>
          caches
            .match(req)
            .then((cached) => cached || caches.match("./index.html")),
        ),
    );
    return;
  }

  event.respondWith(fetch(req));
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "⏰ Daysie Reminder";
  const body = data.body || "You have a reminder!";
  const options = {
    body,
    icon: "./favicon.svg",
    badge: "./favicon.svg",
    tag: data.tag || "daysie-reminder",
    requireInteraction: !!data.requireInteraction,
    data: safeClientUrl(data.url),
  };
  event.waitUntil(
    (async () => {
      if (
        data.type === "family-list-updated" ||
        /shared list/i.test(title + " " + body)
      ) {
        const wins = await clients.matchAll({
          type: "window",
          includeUncontrolled: true,
        });
        wins.forEach((w) =>
          w.postMessage({ type: "family-list-updated", body }),
        );
      }
      await self.registration.showNotification(title, options);
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((wins) => {
        for (const w of wins) if ("focus" in w) return w.focus();
        return clients.openWindow(event.notification.data || "./");
      }),
  );
});
