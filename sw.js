// Daysie Service Worker - update-friendly caching + push notifications
const CACHE_NAME = "daysie-v31";
const API = "https://daysie-api.neil27.workers.dev";
const VAPID_PUBLIC_KEY =
  "BCbfGHSDEXclbsTnL3DjwZxyaLTXhlge4D6wNonqGwOfkLgA19fFyfz7j0nmBD0GxQJp4MNDPfWigOzFvLCyinU";
const CORE = [
  "./",
  "./styles.css",
  "./app.js",
  "./app2.js",
  "./app3.js",
  "./auth-ui.js",
  "./auth-client.bundle.js",
  "./account-features.js",
  "./power-features.js",
  "./reliability-features.js",
  "./favicon.svg",
  "./site.webmanifest",
];
const safeClientUrl = (value) => {
  try {
    const url = new URL(value || "./", self.location.origin);
    return url.origin === self.location.origin ? url.href : "./";
  } catch (e) {
    return "./";
  }
};
const urlBase64ToUint8Array = (value) => {
  const base64 = (value + "=".repeat((4 - (value.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
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

// Every page load is the same app shell, and URLs with a query string (version
// checks, notification links) are one-offs. Caching those under their full URL
// grew the cache without bound during long use, so pages share one entry and
// query-string requests are never stored.
const APP_SHELL_PATH = new URL("./", self.location.href).pathname;
const cacheKeyFor = (req, url) => {
  if (req.mode === "navigate")
    return url.pathname === APP_SHELL_PATH || url.pathname === `${APP_SHELL_PATH}index.html` ? "./" : null;
  return url.search ? null : req;
};

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Cross-origin requests (the API, CDN, Turnstile) go straight to the network.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req, { cache: "no-store" })
      .then((res) => {
        const key = cacheKeyFor(req, url);
        if (key && res && res.status === 200 && res.type === "basic" && !res.redirected) {
          const copy = res.clone();
          const stored = caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(key, copy))
            .catch(() => {});
          try {
            event.waitUntil(stored);
          } catch (e) {}
        }
        return res;
      })
      .catch(async () => {
        if (req.mode === "navigate")
          return (await caches.match("./")) || Response.error();
        return (await caches.match(req, { ignoreSearch: true })) || Response.error();
      }),
  );
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
  const vibrationPatterns = {
    light: [80],
    standard: [140, 70, 140],
    strong: [220, 90, 220, 90, 280],
  };
  const options = {
    body,
    icon: "./favicon.svg",
    badge: "./favicon.svg",
    tag: data.tag || "daysie-reminder",
    renotify: true,
    requireInteraction: !!data.requireInteraction,
    data: {
      url: safeClientUrl(data.url),
      assignmentId: data.assignmentId || null,
      taskId: data.taskId || null,
    },
  };
  if (data.assignmentId || data.taskId) {
    options.actions = [
      { action: "complete", title: "Complete" },
      { action: "snooze", title: "Snooze 1 hour" },
    ];
  }
  if (data.tone === "none") options.silent = true;
  else if (vibrationPatterns[data.vibration])
    options.vibrate = vibrationPatterns[data.vibration];
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
      // The open app may already have shown this exact reminder; replace it
      // quietly instead of buzzing a second time.
      try {
        const shown = await self.registration.getNotifications({ tag: options.tag });
        if (shown.length) options.renotify = false;
      } catch (e) {}
      if ("setAppBadge" in navigator)
        await navigator.setAppBadge(Math.max(1, Number(data.badgeCount) || 1)).catch(() => {});
      // Always show a notification: browsers revoke push permission from apps
      // that receive a push without displaying anything.
      await self.registration.showNotification(title, options);
    })(),
  );
});

// Browsers occasionally rotate or expire a push subscription. When that happens
// while Daysie is closed, re-subscribe here and tell the server which device the
// new connection replaces, so reminders keep arriving without opening the app.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const oldSubscription = event.oldSubscription || null;
      let subscription = event.newSubscription || null;
      if (!subscription)
        subscription = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey:
            oldSubscription?.options?.applicationServerKey ||
            urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      if (oldSubscription?.endpoint && subscription)
        await fetch(`${API}/push/resubscribe`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            oldEndpoint: oldSubscription.endpoint,
            subscription: subscription.toJSON(),
          }),
        });
      const wins = await clients.matchAll({ type: "window", includeUncontrolled: true });
      wins.forEach((w) => w.postMessage({ type: "push-subscription-changed" }));
    })().catch(() => {}),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      if ("clearAppBadge" in navigator) await navigator.clearAppBadge().catch(() => {});
      const notificationData = event.notification.data || {};
      const target = new URL(
        safeClientUrl(typeof notificationData === "string" ? notificationData : notificationData.url),
      );
      if (notificationData.assignmentId) target.searchParams.set("assignment", notificationData.assignmentId);
      if (notificationData.taskId) target.searchParams.set("task", notificationData.taskId);
      if (event.action) target.searchParams.set("notificationAction", event.action);
      const wins = await clients.matchAll({ type: "window", includeUncontrolled: true });
      // Reuse an open Daysie window: focus it and let the page apply the action
      // without a full reload. navigate() is not allowed on windows this worker
      // does not control, which used to leave the tap doing nothing.
      for (const w of wins) {
        if (new URL(w.url).origin !== self.location.origin) continue;
        try {
          if ("focus" in w) await w.focus();
          w.postMessage({ type: "notification-click", url: target.href });
          return;
        } catch (e) {}
      }
      if (clients.openWindow) await clients.openWindow(target.href);
    })(),
  );
});
