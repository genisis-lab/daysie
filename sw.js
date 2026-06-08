// Daysie Service Worker - update-friendly caching + UI hotfixes
const CACHE_NAME = 'daysie-v8';
const CORE = [
  './', './index.html', './styles.css', './app.js', './app2.js', './app3.js',
  './favicon.svg', './site.webmanifest', './version.json',
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
];

const MODAL_CSS = `
html,body{max-width:100%!important;overflow-x:hidden!important;overscroll-behavior-x:none!important}
dialog{max-width:min(560px,calc(100vw - 24px))!important;overflow:hidden!important}
.modal{overflow-x:hidden!important;touch-action:pan-y!important}
#familyDialog,#listDialog{max-width:min(560px,calc(100vw - 24px))!important}
#familyDialog .modal,#listDialog .modal{width:100%!important;max-width:100%!important;overflow-x:hidden!important}
#familyDialog label,#familyDialog input,#familyDialog select{min-width:0!important;max-width:100%!important;box-sizing:border-box!important}
#familyDialog .profile-emojis{max-width:100%!important;overflow-x:hidden!important}
#familyListsSection{display:none!important}
#remindWhen{display:block!important;width:100%!important;max-width:100%!important;box-sizing:border-box!important;appearance:none!important;-webkit-appearance:none!important}
`;

const APP2_HOTFIX = `
;(() => {
  function hasFamilyListSync() {
    return !!(window.family && window.family.familyId && (window.family.members || []).length > 1 && typeof saveFamilyLists === 'function');
  }
  async function syncSharedLists(actionText) {
    if (!hasFamilyListSync()) return;
    window.familyLists = db.lists || [];
    try { await saveFamilyLists(actionText || 'updated a shared list'); } catch (e) {}
  }
  window.syncSharedLists = syncSharedLists;

  renderLists = function() {
    const host = $('#listsList');
    if (!host) return;
    const lists = db.lists || [];
    if (!lists.length) { host.innerHTML = '<div class="habit-empty">No shared lists yet. Tap “Manage” to create one. 📝</div>'; return; }
    host.innerHTML = lists.map((l) => {
      const items = l.items || [];
      const open = items.filter((i) => !i.done).length;
      return '<article class="list-card">'
        + '<div class="list-head"><b>' + (l.emoji || '📝') + ' ' + esc(l.name) + '</b><small>' + open + ' left</small></div>'
        + '<div class="list-items">' + items.map((i) => '<button type="button" class="list-item ' + (i.done ? 'done' : '') + '" data-list="' + l.id + '" data-item="' + i.id + '"><span class="subcheck">' + (i.done ? '✓' : '') + '</span><span>' + esc(i.text) + (i.by ? ' · <small>' + esc(i.by) + '</small>' : '') + '</span></button>').join('') + '</div>'
        + '<div class="list-add-row"><input class="list-add-input" data-listadd="' + l.id + '" maxlength="80" placeholder="Add item…" /><button type="button" class="soft small" data-listaddbtn="' + l.id + '">+</button></div>'
        + '</article>';
    }).join('');

    $$('#listsList [data-item]').forEach((b) => (b.onclick = () => {
      const l = (db.lists || []).find((x) => x.id === b.dataset.list);
      const it = l && l.items ? l.items.find((x) => x.id === b.dataset.item) : null;
      if (!it) return;
      it.done = !it.done;
      if (it.done) it.by = getProfile().name;
      save(); renderLists(); syncSharedLists(it.done ? 'checked off a shared-list item' : 'reopened a shared-list item');
    }));
    const addItem = (lid, input) => {
      const v = (input.value || '').trim();
      if (!v) return;
      const l = (db.lists || []).find((x) => x.id === lid);
      if (!l) return;
      if (!l.items) l.items = [];
      l.items.push({ id: id(), text: v, done: false, by: getProfile().name });
      input.value = '';
      save(); renderLists(); syncSharedLists('added “' + v + '” to a shared list');
    };
    $$('#listsList [data-listaddbtn]').forEach((b) => (b.onclick = () => addItem(b.dataset.listaddbtn, document.querySelector('[data-listadd="' + b.dataset.listaddbtn + '"]'))));
    $$('#listsList [data-listadd]').forEach((inp) => inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addItem(inp.dataset.listadd, inp); } }));
  };

  renderListManageList = function() {
    const host = $('#listManageList');
    if (!host) return;
    const lists = db.lists || [];
    host.innerHTML = lists.length ? lists.map((l) => '<div class="manage-item"><span>' + (l.emoji || '📝') + ' ' + esc(l.name) + ' · ' + ((l.items || []).length) + ' items</span><button type="button" class="photo-remove" data-dellist="' + l.id + '" aria-label="Delete list">✕</button></div>').join('') : '<p style="color:var(--soft);font-weight:700">No lists yet.</p>';
    $$('#listManageList [data-dellist]').forEach((b) => (b.onclick = () => {
      confirm('🗑️', 'Delete list?', 'This removes it for everyone.', () => {
        db.lists = (db.lists || []).filter((x) => x.id !== b.dataset.dellist);
        save(); renderListManageList(); renderLists(); syncSharedLists('deleted a shared list');
      }, () => {});
    }));
  };

  openListDialog = function() {
    const ep = $('#listEmojiPicker');
    if (ep) {
      ep.innerHTML = listEmojis.map((e) => '<button type="button" data-lemoji="' + e + '">' + e + '</button>').join('');
      $$('#listEmojiPicker button').forEach((b) => (b.onclick = () => { newListEmoji = b.dataset.lemoji; $$('#listEmojiPicker button').forEach((x) => x.classList.remove('on')); b.classList.add('on'); }));
    }
    renderListManageList();
    $('#listDialog').showModal();
  };

  const manage = $('#manageListsBtn'); if (manage) manage.onclick = openListDialog;
  const close = $('#closeListDialog'); if (close) close.onclick = () => $('#listDialog').close();
  const add = $('#addListBtn'); if (add) add.onclick = () => {
    const name = ($('#newListName').value || '').trim();
    if (!name) return toast('Name your list', 'e.g. Groceries, Packing');
    if (!db.lists) db.lists = [];
    db.lists.push({ id: id(), name, emoji: newListEmoji, items: [] });
    save(); $('#newListName').value = '';
    renderListManageList(); renderLists(); syncSharedLists('created the “' + name + '” shared list');
    toast('📝 List created', newListEmoji + ' ' + name);
  };
  try { renderLists(); } catch (e) {}
})();
`;

const APP3_HOTFIX = `
;(() => {
  try {
    const style = document.createElement('style');
    style.id = 'familyStillHotfixStyles';
    style.textContent = ${JSON.stringify(MODAL_CSS)};
    document.head.appendChild(style);
  } catch (e) {}

  const DONE_KEY = 'daysie.familyInbox.done.v2';
  function readDoneInboxIds() { try { return new Set(JSON.parse(localStorage.getItem(DONE_KEY) || '[]')); } catch (e) { return new Set(); } }
  function rememberDoneInboxId(itemId) {
    try { const ids = readDoneInboxIds(); ids.add(itemId); localStorage.setItem(DONE_KEY, JSON.stringify([...ids].slice(-250))); } catch (e) {}
  }

  renderFamilyLists = function() { const sec = $('#familyListsSection'); if (sec) sec.classList.add('hidden'); };

  loadFamilyLists = async function() {
    if (!settings.authToken || !window.family || !window.family.familyId) { window.familyLists = []; return; }
    try {
      const res = await fetch(API + '/family/lists', { headers: authHeaders() });
      if (!res.ok) return;
      const d = await res.json();
      window.familyLists = d.lists || [];
      db.lists = window.familyLists;
      if (typeof renderLists === 'function') renderLists();
    } catch (e) {}
  };

  async function notifySharedListUpdate(actionText) {
    try {
      const members = (window.family && window.family.members || []).filter((m) => !m.isMe && m.userId);
      await Promise.allSettled(members.map((m) => fetch(API + '/family/remind', {
        method: 'POST', headers: authHeaders(true),
        body: JSON.stringify({ toUser: m.userId, title: 'Shared list updated', fireAt: Date.now() })
      })));
    } catch (e) {}
  }

  saveFamilyLists = async function(actionText) {
    if (!settings.authToken || !window.family || !window.family.familyId) return;
    window.familyLists = db.lists || window.familyLists || [];
    try {
      await fetch(API + '/family/lists', { method: 'PUT', headers: authHeaders(true), body: JSON.stringify({ lists: window.familyLists, action: actionText || 'updated a shared list' }) });
    } catch (e) {}
    await notifySharedListUpdate(actionText || 'updated a shared list');
  };

  loadFamilyInbox = async function() {
    if (!settings.authToken) return;
    try {
      const res = await fetch(API + '/family/inbox', { headers: authHeaders() });
      if (!res.ok) return;
      const d = await res.json();
      const done = readDoneInboxIds();
      window.familyInbox = (d.items || []).filter((it) => !done.has(it.id));
      renderFamilyInbox();
    } catch (e) {}
  };

  ackInbox = async function(itemId) {
    rememberDoneInboxId(itemId);
    window.familyInbox = (window.familyInbox || []).filter((x) => x.id !== itemId);
    renderFamilyInbox();
    try { await fetch(API + '/family/inbox/ack', { method: 'POST', headers: authHeaders(true), body: JSON.stringify({ id: itemId, status: 'done' }) }); } catch (e) {}
  };

  if ('serviceWorker' in navigator && !window.__daysieFamilyListMessageHotfix2) {
    window.__daysieFamilyListMessageHotfix2 = true;
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'family-list-updated') {
        try { if (typeof loadFamily === 'function') loadFamily(); } catch (e) {}
        try { loadFamilyLists(); } catch (e) {}
        try { if (typeof toast === 'function') toast('📝 Shared list updated', event.data.body || 'A family member changed a list.'); } catch (e) {}
      }
    });
  }
  setTimeout(() => { try { loadFamilyLists(); loadFamilyInbox(); } catch (e) {} }, 1200);
})();
`;

function withHeaders(text, type) {
  return new Response(text, { status: 200, statusText: 'OK', headers: { 'Content-Type': type, 'Cache-Control': 'no-store' } });
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE)).catch(() => {}));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((names) => Promise.all(names.map((n) => (n !== CACHE_NAME ? caches.delete(n) : null)))).then(() => self.clients.claim()));
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    const path = url.pathname;
    if (path.endsWith('/app.js')) {
      event.respondWith(fetch(req, { cache: 'no-store' }).then(async (res) => {
        let text = await res.text();
        text = text.replace("$(`[data-tab=\"${v}\"]`)?.classList.toggle('active', v === tab);", "$$(`[data-tab=\"${v}\"]`).forEach((btn) => btn.classList.toggle('active', v === tab));");
        return withHeaders(text, 'application/javascript; charset=utf-8');
      }).catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html'))));
      return;
    }
    if (path.endsWith('/app2.js')) {
      event.respondWith(fetch(req, { cache: 'no-store' }).then(async (res) => {
        const text = await res.text();
        return withHeaders(text.includes('hasFamilyListSync') ? text : text + '\n' + APP2_HOTFIX, 'application/javascript; charset=utf-8');
      }).catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html'))));
      return;
    }
    if (path.endsWith('/app3.js')) {
      event.respondWith(fetch(req, { cache: 'no-store' }).then(async (res) => {
        const text = await res.text();
        return withHeaders(text.includes('__daysieFamilyListMessageHotfix2') ? text : text + '\n' + APP3_HOTFIX, 'application/javascript; charset=utf-8');
      }).catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html'))));
      return;
    }
    if (path.endsWith('/styles.css')) {
      event.respondWith(fetch(req, { cache: 'no-store' }).then(async (res) => withHeaders(await res.text() + '\n' + MODAL_CSS, 'text/css; charset=utf-8')).catch(() => caches.match(req)));
      return;
    }
    if (path.endsWith('/index.html') || path === '/' || path.endsWith('/')) {
      event.respondWith(fetch(req, { cache: 'no-store' }).then(async (res) => {
        let text = await res.text();
        text = text.replace(/\s*<div id="familyListsSection" class="hidden">[\s\S]*?<div id="familyListsList" class="lists-list"><\/div>\s*<\/div>/, '');
        return withHeaders(text, 'text/html; charset=utf-8');
      }).catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html'))));
      return;
    }
    event.respondWith(fetch(req, { cache: 'no-store' }).then((res) => { if (res && res.status === 200 && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)); } return res; }).catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html'))));
    return;
  }

  event.respondWith(caches.match(req).then((cached) => cached || fetch(req).then((res) => { if (res && res.status === 200) { const copy = res.clone(); caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)); } return res; }).catch(() => cached)));
});

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { body: event.data ? event.data.text() : '' }; }
  const title = data.title || '⏰ Daysie Reminder';
  const body = data.body || 'You have a reminder!';
  const options = { body, icon: './favicon.svg', badge: './favicon.svg', tag: data.tag || 'daysie-reminder', requireInteraction: !!data.requireInteraction, data: data.url || './' };
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
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => { for (const w of wins) if ('focus' in w) return w.focus(); return clients.openWindow(event.notification.data || './'); }));
});
