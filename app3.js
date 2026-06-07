// ============================================================================
// Family — link separate Daysie accounts so people can assign each other
// tasks, share lists, and send reminders. People come from linked ACCOUNTS
// (not local profiles). Relies on globals from app.js: $, $$, API, settings,
// db, save, esc, toast, confirm, id, fmt, getProfile, renderAll, ensureAccount,
// profileColors, profileEmojis, buildAssigneePicker.
// ============================================================================
window.family = { familyId: null, members: [] };
window.familyInbox = [];
window.familyLists = [];
let famNewEmoji = '🌼';
let famNewColor = 'sun';

function authHeaders(json) {
  const h = { Authorization: `Bearer ${settings.authToken}` };
  if (json) h['Content-Type'] = 'application/json';
  return h;
}

function meProfile() {
  return (db.profiles && db.profiles[0]) || { name: 'Me', emoji: '🌼', color: 'sun' };
}

function colorHex(cid) {
  return (profileColors.find((c) => c.id === cid) || {}).color || cid || '#ffcd57';
}

function inFamily() {
  return !!(window.family && window.family.familyId && (window.family.members || []).length > 1);
}

async function loadFamily() {
  if (!settings.authToken) { window.family = { familyId: null, members: [] }; renderFamily(); return; }
  try {
    const res = await fetch(`${API}/family`, { headers: authHeaders() });
    if (!res.ok) return;
    const d = await res.json();
    window.family = { familyId: d.familyId || null, members: d.members || [] };
    renderFamily();
    if (typeof buildAssigneePicker === 'function') buildAssigneePicker();
  } catch (e) { console.error('loadFamily', e); }
}

// Push my display profile (name/emoji/color) to the family record.
async function pushMyProfile() {
  if (!settings.authToken) return;
  const me = meProfile();
  try {
    await fetch(`${API}/family/profile`, {
      method: 'POST', headers: authHeaders(true),
      body: JSON.stringify({ name: me.name, emoji: me.emoji, color: me.color }),
    });
  } catch (e) {}
}

function renderFamily() {
  const fam = window.family || { members: [] };
  const host = $('#familyMembers');
  if (host) {
    host.innerHTML = (fam.members || []).length
      ? fam.members.map((m) => `<div class="family-member"><div class="profile-avatar" style="background:${colorHex(m.color)}">${m.emoji || '🙂'}</div><div class="profile-info"><b>${esc(m.name)}${m.isMe ? ' (you)' : ''}</b><small>${m.isMe ? 'This is you' : 'Linked account'}</small></div></div>`).join('')
      : '<p style="color:var(--soft);font-weight:700">No family linked yet. Invite someone below, or join with their code.</p>';
  }
  const leaveBtn = $('#familyLeaveBtn');
  if (leaveBtn) leaveBtn.classList.toggle('hidden', (fam.members || []).length <= 1);
  renderRemindMembers();
  renderFamilyInbox();
  renderFamilyLists();
}

function openFamilyDialog() {
  const dlg = $('#familyDialog');
  if (!dlg) return;
  const me = meProfile();
  famNewEmoji = me.emoji || '🌼';
  famNewColor = me.color || 'sun';
  const ni = $('#famMeName'); if (ni) ni.value = me.name || 'Me';
  const cp = $('#famColorPicker');
  if (cp) {
    cp.innerHTML = profileColors.map((c) => `<button type="button" data-fcolor="${c.id}" style="background:${c.color}" class="${c.id === famNewColor ? 'on' : ''}"></button>`).join('');
    $$('#famColorPicker button').forEach((b) => (b.onclick = () => { famNewColor = b.dataset.fcolor; $$('#famColorPicker button').forEach((x) => x.classList.remove('on')); b.classList.add('on'); }));
  }
  const ep = $('#famEmojiPicker');
  if (ep) {
    ep.innerHTML = profileEmojis.map((e) => `<button type="button" data-femoji="${e}" class="${e === famNewEmoji ? 'on' : ''}">${e}</button>`).join('');
    $$('#famEmojiPicker button').forEach((b) => (b.onclick = () => { famNewEmoji = b.dataset.femoji; $$('#famEmojiPicker button').forEach((x) => x.classList.remove('on')); b.classList.add('on'); }));
  }
  const gate = $('#familySyncGate');
  const body = $('#familyBody');
  if (settings.authToken) { gate && gate.classList.add('hidden'); body && body.classList.remove('hidden'); }
  else { gate && gate.classList.remove('hidden'); body && body.classList.add('hidden'); }
  loadFamily();
  dlg.showModal();
}

function wire(sel, handler, evt) {
  const el = $(sel);
  if (el) el[evt || 'onclick'] = handler;
}

wire('#famSaveMeBtn', async () => {
  const me = meProfile();
  me.name = ($('#famMeName').value || '').trim() || 'Me';
  me.emoji = famNewEmoji;
  me.color = famNewColor;
  save();
  const pn = $('#profileName'); if (pn) pn.textContent = me.name;
  const pe = $('#profileEmoji'); if (pe) pe.textContent = me.emoji;
  await pushMyProfile();
  await loadFamily();
  toast('💛 Saved', 'Your family profile is updated.');
});

wire('#famInviteBtn', async () => {
  if (!(await ensureAccount())) return toast('Could not turn on sync', 'Check your connection and try again.');
  const me = meProfile();
  try {
    const res = await fetch(`${API}/family/invite`, { method: 'POST', headers: authHeaders(true), body: JSON.stringify({ name: me.name, emoji: me.emoji, color: me.color }) });
    if (!res.ok) return toast('Could not create invite', 'Try again.');
    const d = await res.json();
    $('#famInviteCode').textContent = d.code;
    const mins = Math.max(1, Math.round((d.expires - Date.now()) / 60000));
    $('#famInviteExpiry').textContent = `Share this code \u2014 expires in about ${mins} min`;
    $('#famInviteWrap').classList.remove('hidden');
    await loadFamily();
  } catch (e) { toast('Network error', 'Try again.'); }
});

wire('#famJoinBtn', async () => {
  const code = ($('#famJoinCode').value || '').trim().toUpperCase().replace(/\s/g, '');
  if (code.length < 6) return toast('Enter a code', 'Ask your family member for their invite code.');
  if (!(await ensureAccount())) return toast('Could not turn on sync', 'Check your connection and try again.');
  const me = meProfile();
  try {
    const res = await fetch(`${API}/family/join`, { method: 'POST', headers: authHeaders(true), body: JSON.stringify({ code, name: me.name, emoji: me.emoji, color: me.color }) });
    if (res.status === 429) return toast('Too many tries', 'Wait a minute and try again.');
    if (!res.ok) return toast('That code did not work', 'Double-check it and try again.');
    const d = await res.json();
    window.family = { familyId: d.familyId, members: d.members || [] };
    $('#famJoinCode').value = '';
    renderFamily();
    if (typeof buildAssigneePicker === 'function') buildAssigneePicker();
    await loadFamilyLists();
    toast('🎉 Joined!', 'You are now linked with your family.');
  } catch (e) { toast('Network error', 'Try again.'); }
});

wire('#familyLeaveBtn', () => {
  confirm('👋', 'Leave this family?', 'You will stop sharing lists and assignments with them. Your own data stays.', async () => {
    try { await fetch(`${API}/family/leave`, { method: 'POST', headers: authHeaders() }); } catch (e) {}
    window.family = { familyId: null, members: [] };
    window.familyLists = [];
    renderFamily();
    if (typeof buildAssigneePicker === 'function') buildAssigneePicker();
    toast('You left the family', '');
  }, () => {});
});

wire('#profileBtn', openFamilyDialog);
wire('#closeFamilyDialog', () => $('#familyDialog').close());
wire('#closeFamily', () => $('#familyDialog').close());

// Send a task to a linked member's account (called from app.js save handler).
async function assignTaskToMember(userId, data) {
  const m = (window.family.members || []).find((x) => x.userId === userId);
  try {
    const res = await fetch(`${API}/family/assign`, {
      method: 'POST', headers: authHeaders(true),
      body: JSON.stringify({ toUser: userId, task: { title: data.title, note: data.note, due: data.due, priority: data.priority, category: data.category } }),
    });
    if (!res.ok) throw new Error('assign failed');
    toast('📋 Sent to ' + (m ? m.name : 'family'), 'It landed in their Daysie.');
  } catch (e) { toast('Could not assign', 'Check your connection and try again.'); }
}

// ---- Send a reminder to a member -----------------------------------------
function renderRemindMembers() {
  const sel = $('#remindMember');
  if (!sel) return;
  const others = (window.family.members || []).filter((m) => !m.isMe);
  sel.innerHTML = others.length
    ? others.map((m) => `<option value="${m.userId}">${m.emoji || '🙂'} ${esc(m.name)}</option>`).join('')
    : '<option value="">No family members yet</option>';
}

wire('#famRemindBtn', async () => {
  const sel = $('#remindMember');
  const toUser = sel ? sel.value : '';
  if (!toUser) return toast('Add a family member first', 'Invite someone to send reminders.');
  const title = ($('#remindText').value || '').trim();
  if (!title) return toast('What is the reminder?', 'Type a short message.');
  const dt = $('#remindWhen').value;
  const fireAt = dt ? new Date(dt).getTime() : Date.now();
  try {
    const res = await fetch(`${API}/family/remind`, { method: 'POST', headers: authHeaders(true), body: JSON.stringify({ toUser, title, fireAt }) });
    if (!res.ok) throw new Error();
    $('#remindText').value = '';
    $('#remindWhen').value = '';
    toast('🔔 Reminder sent', fireAt > Date.now() + 60000 ? 'It will arrive at the chosen time.' : 'Delivered now.');
  } catch (e) { toast('Could not send reminder', 'Try again.'); }
});

// ---- Inbox: tasks/reminders others sent me --------------------------------
async function loadFamilyInbox() {
  if (!settings.authToken) return;
  try {
    const res = await fetch(`${API}/family/inbox`, { headers: authHeaders() });
    if (!res.ok) return;
    const d = await res.json();
    window.familyInbox = d.items || [];
    renderFamilyInbox();
  } catch (e) {}
}

function renderFamilyInbox() {
  const sec = $('#familyInboxSection');
  const host = $('#familyInbox');
  if (!sec || !host) return;
  const items = window.familyInbox || [];
  if (!items.length) { sec.classList.add('hidden'); host.innerHTML = ''; return; }
  sec.classList.remove('hidden');
  host.innerHTML = items.map((it) => {
    const from = it.from || {};
    const p = it.payload || {};
    const isTask = it.kind === 'task';
    const icon = isTask ? '📋' : '🔔';
    const when = p.due ? ' \u00b7 ' + fmt(p.due) : (it.fireAt ? ' \u00b7 ' + fmt(it.fireAt) : '');
    return `<article class="inbox-card">
      <div class="inbox-head"><span class="inbox-icon">${icon}</span><div><b>${esc(p.title || (isTask ? 'New task' : 'Reminder'))}</b><small>From ${from.emoji || ''} ${esc(from.name || 'family')}${when}</small></div></div>
      ${p.note ? `<p class="inbox-note">${esc(p.note)}</p>` : ''}
      <div class="inbox-actions">
        ${isTask ? `<button type="button" class="primary small" data-inbox-accept="${it.id}">\u2795 Add to my tasks</button>` : `<button type="button" class="primary small" data-inbox-ack="${it.id}">\ud83d\udc4d Got it</button>`}
        <button type="button" class="soft small" data-inbox-dismiss="${it.id}">Dismiss</button>
      </div>
    </article>`;
  }).join('');
  $$('#familyInbox [data-inbox-accept]').forEach((b) => (b.onclick = () => acceptInboxTask(b.dataset.inboxAccept)));
  $$('#familyInbox [data-inbox-ack]').forEach((b) => (b.onclick = () => ackInbox(b.dataset.inboxAck)));
  $$('#familyInbox [data-inbox-dismiss]').forEach((b) => (b.onclick = () => ackInbox(b.dataset.inboxDismiss)));
}

function acceptInboxTask(itemId) {
  const it = (window.familyInbox || []).find((x) => x.id === itemId);
  if (!it) return;
  const p = it.payload || {};
  const prof = getProfile();
  prof.tasks.push({ id: id(), done: false, created: Date.now(), title: p.title || 'Task', due: p.due || null, note: p.note || '', priority: p.priority || 'low', repeat: 'none', repeatUntil: null, category: p.category || 'none', assignee: null, subtasks: [], notified: false });
  save();
  renderAll();
  ackInbox(itemId);
  toast('\u2795 Added', 'Saved to your reminders.');
}

async function ackInbox(itemId) {
  window.familyInbox = (window.familyInbox || []).filter((x) => x.id !== itemId);
  renderFamilyInbox();
  try { await fetch(`${API}/family/inbox/ack`, { method: 'POST', headers: authHeaders(true), body: JSON.stringify({ id: itemId, status: 'done' }) }); } catch (e) {}
}

// ---- Family shared lists --------------------------------------------------
async function loadFamilyLists() {
  if (!settings.authToken || !window.family.familyId) { window.familyLists = []; renderFamilyLists(); return; }
  try {
    const res = await fetch(`${API}/family/lists`, { headers: authHeaders() });
    if (!res.ok) return;
    const d = await res.json();
    window.familyLists = d.lists || [];
    renderFamilyLists();
  } catch (e) {}
}

async function saveFamilyLists() {
  if (!settings.authToken || !window.family.familyId) return;
  try { await fetch(`${API}/family/lists`, { method: 'PUT', headers: authHeaders(true), body: JSON.stringify({ lists: window.familyLists || [] }) }); } catch (e) {}
}

function renderFamilyLists() {
  const sec = $('#familyListsSection');
  const host = $('#familyListsList');
  if (!sec || !host) return;
  if (!inFamily()) { sec.classList.add('hidden'); return; }
  sec.classList.remove('hidden');
  const lists = window.familyLists || [];
  host.innerHTML = (lists.length ? lists.map((l) => {
    const items = l.items || [];
    const open = items.filter((i) => !i.done).length;
    return `<article class="list-card">
      <div class="list-head"><b>${l.emoji || '📝'} ${esc(l.name)}</b><small>${open} left</small></div>
      <div class="list-items">${items.map((i) => `<button type="button" class="list-item ${i.done ? 'done' : ''}" data-flist="${l.id}" data-fitem="${i.id}"><span class="subcheck">${i.done ? '\u2713' : ''}</span><span>${esc(i.text)}${i.by ? ` \u00b7 <small>${esc(i.by)}</small>` : ''}</span></button>`).join('')}</div>
      <div class="list-add-row"><input class="list-add-input" data-flistadd="${l.id}" maxlength="80" placeholder="Add item\u2026" /><button type="button" class="soft small" data-flistaddbtn="${l.id}">+</button></div>
    </article>`;
  }).join('') : '<div class="habit-empty">No family lists yet. Create one below. 📝</div>')
    + `<div class="list-add-row" style="margin-top:8px"><input id="newFamListName" maxlength="40" placeholder="New family list name\u2026" /><button type="button" id="addFamListBtn" class="primary small">Create</button></div>`;

  $$('#familyListsList [data-fitem]').forEach((b) => (b.onclick = () => {
    const l = (window.familyLists || []).find((x) => x.id === b.dataset.flist);
    const it = l && l.items ? l.items.find((x) => x.id === b.dataset.fitem) : null;
    if (!it) return;
    it.done = !it.done;
    if (it.done) it.by = meProfile().name;
    renderFamilyLists(); saveFamilyLists();
  }));
  const addItem = (lid, input) => {
    const v = (input.value || '').trim();
    if (!v) return;
    const l = (window.familyLists || []).find((x) => x.id === lid);
    if (!l) return;
    if (!l.items) l.items = [];
    l.items.push({ id: id(), text: v, done: false, by: meProfile().name });
    input.value = '';
    renderFamilyLists(); saveFamilyLists();
  };
  $$('#familyListsList [data-flistaddbtn]').forEach((b) => (b.onclick = () => addItem(b.dataset.flistaddbtn, document.querySelector('[data-flistadd="' + b.dataset.flistaddbtn + '"]'))));
  $$('#familyListsList [data-flistadd]').forEach((inp) => inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addItem(inp.dataset.flistadd, inp); } }));
  const addBtn = $('#addFamListBtn');
  if (addBtn) addBtn.onclick = () => {
    const inp = $('#newFamListName');
    const v = (inp.value || '').trim();
    if (!v) return;
    if (!window.familyLists) window.familyLists = [];
    window.familyLists.push({ id: id(), name: v, emoji: '📝', items: [] });
    inp.value = '';
    renderFamilyLists(); saveFamilyLists();
  };
}

// ---- Boot + polling -------------------------------------------------------
function familyBoot() {
  if (!settings.authToken) return;
  loadFamily();
  loadFamilyInbox();
  loadFamilyLists();
}
setTimeout(familyBoot, 900);
setInterval(() => { if (settings.authToken && document.visibilityState === 'visible') loadFamilyInbox(); }, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && settings.authToken) { loadFamilyInbox(); loadFamily(); } });
