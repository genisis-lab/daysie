// ============================================================================
// Natural-language quick add
// ============================================================================
const WEEKDAYS = { sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2, tues: 2, wednesday: 3, wed: 3, thursday: 4, thu: 4, thurs: 4, friday: 5, fri: 5, saturday: 6, sat: 6 };

function parseQuickAdd(raw) {
  const original = (raw || '').trim();
  const lower = original.toLowerCase();
  let priority = 'low';
  let repeat = 'none';
  let category = 'none';
  const date = new Date();
  let hasDay = false;
  let hasTime = false;
  const strip = [];

  let m = lower.match(/\b(important|urgent|high priority|asap)\b/);
  if (m) { priority = 'high'; strip.push(m[0]); }

  if (/\bevery day\b|\bdaily\b/.test(lower)) { repeat = 'daily'; strip.push('every day', 'daily'); }
  else if (/\bevery week\b|\bweekly\b/.test(lower)) { repeat = 'weekly'; strip.push('every week', 'weekly'); }
  else if (/\bevery month\b|\bmonthly\b/.test(lower)) { repeat = 'monthly'; strip.push('every month', 'monthly'); }
  else if (/\bevery year\b|\byearly\b|\bannually\b/.test(lower)) { repeat = 'yearly'; strip.push('every year', 'yearly', 'annually'); }

  const catRules = [
    ['meds', /\b(meds?|medicine|medication|pill|pills)\b/],
    ['birthday', /\bbirthday\b/],
    ['call', /\bcall\b/],
    ['appointment', /\b(appointment|appt|doctor|dentist)\b/],
    ['chores', /\b(chore|chores|clean|laundry|dishes|trash|vacuum)\b/],
  ];
  for (const [cid, re] of catRules) { if (re.test(lower)) { category = cid; break; } }

  m = lower.match(/\bin (\d+) (day|days|week|weeks)\b/);
  if (m) {
    const n = parseInt(m[1], 10);
    date.setDate(date.getDate() + (m[2].indexOf('week') === 0 ? n * 7 : n));
    hasDay = true; strip.push(m[0]);
  }

  if (/\btomorrow\b/.test(lower)) { date.setDate(date.getDate() + 1); hasDay = true; strip.push('tomorrow'); }
  else if (/\btonight\b/.test(lower)) { hasDay = true; strip.push('tonight'); date.setHours(20, 0, 0, 0); hasTime = true; }
  else if (/\btoday\b/.test(lower)) { hasDay = true; strip.push('today'); }

  if (!hasDay) {
    for (const wd of Object.keys(WEEKDAYS)) {
      const re = new RegExp('\\b(next |on )?' + wd + '\\b');
      const mm = lower.match(re);
      if (mm) {
        let diff = (WEEKDAYS[wd] - date.getDay() + 7) % 7;
        if (diff === 0) diff = 7;
        date.setDate(date.getDate() + diff);
        hasDay = true; strip.push(mm[0]);
        break;
      }
    }
  }

  m = lower.match(/\b(at )?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  if (m) {
    let h = parseInt(m[2], 10) % 12;
    if (m[4] === 'pm') h += 12;
    date.setHours(h, m[3] ? parseInt(m[3], 10) : 0, 0, 0);
    hasTime = true; strip.push(m[0]);
  } else {
    m = lower.match(/\bat (\d{1,2}):(\d{2})\b/);
    if (m) { date.setHours(parseInt(m[1], 10), parseInt(m[2], 10), 0, 0); hasTime = true; strip.push(m[0]); }
    else if (/\bnoon\b/.test(lower)) { date.setHours(12, 0, 0, 0); hasTime = true; strip.push('noon'); }
    else if (/\bmidnight\b/.test(lower)) { date.setHours(0, 0, 0, 0); hasTime = true; strip.push('midnight'); }
    else if (/\bmorning\b/.test(lower)) { date.setHours(9, 0, 0, 0); hasTime = true; hasDay = true; strip.push('this morning', 'morning'); }
    else if (/\bafternoon\b/.test(lower)) { date.setHours(14, 0, 0, 0); hasTime = true; hasDay = true; strip.push('this afternoon', 'afternoon'); }
    else if (/\bevening\b/.test(lower)) { date.setHours(18, 0, 0, 0); hasTime = true; hasDay = true; strip.push('this evening', 'evening'); }
  }

  if (hasDay && !hasTime) { date.setHours(9, 0, 0, 0); }

  let title = original;
  strip.sort((a, b) => b.length - a.length).forEach((tok) => {
    if (!tok) return;
    title = title.replace(new RegExp(tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), ' ');
  });
  title = title.replace(/\b(at|on|in|every|this)\b/gi, ' ').replace(/\s+/g, ' ').trim();
  title = title.replace(/^[-,:\s]+|[-,:\s]+$/g, '').trim();
  if (!title) title = original;
  title = title.charAt(0).toUpperCase() + title.slice(1);

  const due = (hasDay || hasTime) ? date.getTime() : null;
  return { title, due, priority, repeat, category };
}

function quickAdd(raw) {
  const text = (raw || '').trim();
  if (!text) return;
  const parsed = parseQuickAdd(text);
  const prof = getProfile();
  prof.tasks.push({ id: id(), done: false, created: Date.now(), title: parsed.title, due: parsed.due, note: '', priority: parsed.priority, repeat: parsed.repeat, repeatUntil: null, category: parsed.category, assignee: null, subtasks: [], notified: false });
  save();
  renderAll();
  confetti();
  toast('\u2705 ' + parsed.title, parsed.due ? '📅 ' + fmt(parsed.due) : 'Added to your list.');
}

function bindQuickAdd(inputSel, btnSel) {
  const inp = $(inputSel);
  const btn = $(btnSel);
  if (!inp) return;
  const run = () => { if (inp.value.trim()) { quickAdd(inp.value); inp.value = ''; } };
  if (btn) btn.onclick = run;
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); run(); } });
}
bindQuickAdd('#quickAddToday', '#quickAddTodayBtn');
bindQuickAdd('#quickAddTasks', '#quickAddTasksBtn');

// ============================================================================
// Habit tracker (per profile)
// ============================================================================
const habitColors = ['#ffcd57', '#ff8c9a', '#7fc989', '#79c8ce', '#ad97e8', '#ff9f5a'];
const habitEmojis = ['\u2705', '💧', '🏃', '🧘', '📚', '💊', '🪥', '🥗', '😴', '🌳', '🎯', '🙏'];
let newHabitColor = habitColors[0];
let newHabitEmoji = habitEmojis[0];

function habitStreak(h) {
  const hist = h.history || {};
  let streak = 0;
  const d = new Date();
  if (!hist[day(d)]) d.setDate(d.getDate() - 1);
  while (hist[day(d)]) { streak++; d.setDate(d.getDate() - 1); }
  return streak;
}

function renderHabits() {
  const host = $('#habitsList');
  if (!host) return;
  const prof = getProfile();
  const habits = prof.habits || [];
  const today = day();
  if (!habits.length) {
    host.innerHTML = '<div class="habit-empty">No habits yet. Tap \u201cManage\u201d to add one. 🌱</div>';
    return;
  }
  host.innerHTML = habits.map((h) => {
    const on = !!(h.history && h.history[today]);
    const st = habitStreak(h);
    return `<button type="button" class="habit-pill ${on ? 'on' : ''}" data-habit="${h.id}" style="--hc:${h.color || '#ffcd57'}">
      <span class="habit-emoji">${h.emoji || '\u2705'}</span>
      <span class="habit-name">${esc(h.name)}</span>
      <span class="habit-streak">${st > 0 ? '🔥 ' + st : (on ? '\u2713' : '')}</span>
    </button>`;
  }).join('');
  $$('#habitsList [data-habit]').forEach((b) => (b.onclick = () => toggleHabit(b.dataset.habit)));
}

function toggleHabit(hid) {
  const prof = getProfile();
  const h = (prof.habits || []).find((x) => x.id === hid);
  if (!h) return;
  if (!h.history) h.history = {};
  const today = day();
  if (h.history[today]) delete h.history[today];
  else { h.history[today] = true; confetti(); }
  save();
  renderHabits();
  renderHabitInsights();
}

function renderHabitInsights() {
  const host = $('#habitInsights');
  if (!host) return;
  const prof = getProfile();
  const habits = prof.habits || [];
  if (!habits.length) { host.innerHTML = ''; return; }
  const days = [];
  for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push(d); }
  host.innerHTML = habits.map((h) => {
    const dots = days.map((d) => `<i class="${h.history && h.history[day(d)] ? 'on' : ''}" style="--hc:${h.color || '#ffcd57'}"></i>`).join('');
    return `<div class="habit-row"><span class="habit-row-name">${h.emoji || '\u2705'} ${esc(h.name)}</span><div class="habit-dots">${dots}</div></div>`;
  }).join('');
}

function renderHabitManageList() {
  const host = $('#habitManageList');
  if (!host) return;
  const prof = getProfile();
  const habits = prof.habits || [];
  host.innerHTML = habits.length ? habits.map((h) => `<div class="manage-item"><span>${h.emoji || '\u2705'} ${esc(h.name)} ${habitStreak(h) ? '\u00b7 🔥 ' + habitStreak(h) : ''}</span><button type="button" class="photo-remove" data-delhabit="${h.id}" aria-label="Delete habit">\u2715</button></div>`).join('') : '<p style="color:var(--soft);font-weight:700">No habits yet.</p>';
  $$('#habitManageList [data-delhabit]').forEach((b) => (b.onclick = () => {
    prof.habits = (prof.habits || []).filter((x) => x.id !== b.dataset.delhabit);
    save(); renderHabitManageList(); renderHabits(); renderHabitInsights();
  }));
}

function openHabitDialog() {
  const cp = $('#habitColorPicker');
  if (cp) {
    cp.innerHTML = habitColors.map((c) => `<button type="button" data-hcolor="${c}" style="background:${c}"></button>`).join('');
    $$('#habitColorPicker button').forEach((b) => (b.onclick = () => { newHabitColor = b.dataset.hcolor; $$('#habitColorPicker button').forEach((x) => x.classList.remove('on')); b.classList.add('on'); }));
  }
  const ep = $('#habitEmojiPicker');
  if (ep) {
    ep.innerHTML = habitEmojis.map((e) => `<button type="button" data-hemoji="${e}">${e}</button>`).join('');
    $$('#habitEmojiPicker button').forEach((b) => (b.onclick = () => { newHabitEmoji = b.dataset.hemoji; $$('#habitEmojiPicker button').forEach((x) => x.classList.remove('on')); b.classList.add('on'); }));
  }
  renderHabitManageList();
  $('#habitDialog').showModal();
}

$('#manageHabitsBtn') && ($('#manageHabitsBtn').onclick = openHabitDialog);
$('#closeHabitDialog') && ($('#closeHabitDialog').onclick = () => $('#habitDialog').close());
$('#addHabitBtn') && ($('#addHabitBtn').onclick = () => {
  const name = ($('#newHabitName').value || '').trim();
  if (!name) return toast('Name your habit', 'e.g. Drink water, Walk 20 min');
  const prof = getProfile();
  if (!prof.habits) prof.habits = [];
  prof.habits.push({ id: id(), name, emoji: newHabitEmoji, color: newHabitColor, history: {}, created: Date.now() });
  save();
  $('#newHabitName').value = '';
  renderHabitManageList(); renderHabits(); renderHabitInsights();
  toast('🌱 Habit added', newHabitEmoji + ' ' + name);
});

// ============================================================================
// Shared lists (family-wide; sync across devices)
// ============================================================================
const listEmojis = ['📝', '🛒', '🧺', '🎁', '\u2708\ufe0f', '🍽\ufe0f', '🏠', '📚', '🎬', '💡'];
let newListEmoji = listEmojis[0];

function renderLists() {
  const host = $('#listsList');
  if (!host) return;
  const lists = db.lists || [];
  if (!lists.length) { host.innerHTML = '<div class="habit-empty">No shared lists yet. Tap \u201cManage\u201d to create one. 📝</div>'; return; }
  host.innerHTML = lists.map((l) => {
    const items = l.items || [];
    const open = items.filter((i) => !i.done).length;
    return `<article class="list-card">
      <div class="list-head"><b>${l.emoji || '📝'} ${esc(l.name)}</b><small>${open} left</small></div>
      <div class="list-items">${items.map((i) => `<button type="button" class="list-item ${i.done ? 'done' : ''}" data-list="${l.id}" data-item="${i.id}"><span class="subcheck">${i.done ? '\u2713' : ''}</span><span>${esc(i.text)}</span></button>`).join('')}</div>
      <div class="list-add-row"><input class="list-add-input" data-listadd="${l.id}" maxlength="80" placeholder="Add item\u2026" /><button type="button" class="soft small" data-listaddbtn="${l.id}">+</button></div>
    </article>`;
  }).join('');

  $$('#listsList [data-item]').forEach((b) => (b.onclick = () => {
    const l = (db.lists || []).find((x) => x.id === b.dataset.list);
    const it = l && l.items ? l.items.find((x) => x.id === b.dataset.item) : null;
    if (!it) return;
    it.done = !it.done;
    if (it.done) it.by = getProfile().name;
    save(); renderLists();
  }));
  const addItem = (lid, input) => {
    const v = (input.value || '').trim();
    if (!v) return;
    const l = (db.lists || []).find((x) => x.id === lid);
    if (!l) return;
    if (!l.items) l.items = [];
    l.items.push({ id: id(), text: v, done: false, by: getProfile().name });
    input.value = '';
    save(); renderLists();
  };
  $$('#listsList [data-listaddbtn]').forEach((b) => (b.onclick = () => addItem(b.dataset.listaddbtn, document.querySelector('[data-listadd="' + b.dataset.listaddbtn + '"]'))));
  $$('#listsList [data-listadd]').forEach((inp) => inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addItem(inp.dataset.listadd, inp); } }));
}

function renderListManageList() {
  const host = $('#listManageList');
  if (!host) return;
  const lists = db.lists || [];
  host.innerHTML = lists.length ? lists.map((l) => `<div class="manage-item"><span>${l.emoji || '📝'} ${esc(l.name)} \u00b7 ${(l.items || []).length} items</span><button type="button" class="photo-remove" data-dellist="${l.id}" aria-label="Delete list">\u2715</button></div>`).join('') : '<p style="color:var(--soft);font-weight:700">No lists yet.</p>';
  $$('#listManageList [data-dellist]').forEach((b) => (b.onclick = () => {
    confirm('🗑\ufe0f', 'Delete list?', 'This removes it for everyone.', () => {
      db.lists = (db.lists || []).filter((x) => x.id !== b.dataset.dellist);
      save(); renderListManageList(); renderLists();
    }, () => {});
  }));
}

function openListDialog() {
  const ep = $('#listEmojiPicker');
  if (ep) {
    ep.innerHTML = listEmojis.map((e) => `<button type="button" data-lemoji="${e}">${e}</button>`).join('');
    $$('#listEmojiPicker button').forEach((b) => (b.onclick = () => { newListEmoji = b.dataset.lemoji; $$('#listEmojiPicker button').forEach((x) => x.classList.remove('on')); b.classList.add('on'); }));
  }
  renderListManageList();
  $('#listDialog').showModal();
}

$('#manageListsBtn') && ($('#manageListsBtn').onclick = openListDialog);
$('#closeListDialog') && ($('#closeListDialog').onclick = () => $('#listDialog').close());
$('#addListBtn') && ($('#addListBtn').onclick = () => {
  const name = ($('#newListName').value || '').trim();
  if (!name) return toast('Name your list', 'e.g. Groceries, Packing');
  if (!db.lists) db.lists = [];
  db.lists.push({ id: id(), name, emoji: newListEmoji, items: [] });
  save();
  $('#newListName').value = '';
  renderListManageList(); renderLists();
  toast('📝 List created', newListEmoji + ' ' + name);
});

// ============================================================================
// Guided onboarding tour
// ============================================================================
const tourSlides = [
  { icon: '🌼', title: 'Welcome to Daysie!', body: 'Your gentle family helper for reminders, journaling, habits, and shared lists. Here is a quick tour.' },
  { icon: '\u2600\ufe0f', title: 'Today', body: 'Your home base shows your day, this week\u2019s plan, habits, and shared lists \u2014 all in one calm place.' },
  { icon: '\u26a1', title: 'Quick add', body: 'Type naturally like \u201cCall mom tomorrow at 5pm\u201d and Daysie figures out the date, time, and repeat for you.' },
  { icon: '\u23f0', title: 'Reminders', body: 'Add tasks with a time, repeat, and priority. Assign them to a family member and get notified \u2014 even when Daysie is closed.' },
  { icon: '🌱', title: 'Habits', body: 'Build gentle daily habits and watch your streaks grow. Tap a habit pill on Today to check it off.' },
  { icon: '📝', title: 'Shared lists', body: 'Groceries, packing, chores \u2014 make lists everyone in the family can add to and check off together.' },
  { icon: '📖', title: 'Journal & insights', body: 'Capture moods, photos, and memories. Insights show your streaks, moods, and little wins over time.' },
  { icon: '\u2601\ufe0f', title: 'Sync your devices', body: 'Open Settings \u2192 Turn on sync to keep everything in step across phones and tablets \u2014 no email needed.' },
];
let tourIndex = 0;

function renderTour() {
  const s = tourSlides[tourIndex];
  $('#tourIcon').textContent = s.icon;
  $('#tourTitle').textContent = s.title;
  $('#tourBody').textContent = s.body;
  $('#tourDots').innerHTML = tourSlides.map((_, i) => `<i class="${i === tourIndex ? 'on' : ''}"></i>`).join('');
  $('#tourBack').classList.toggle('hidden', tourIndex === 0);
  $('#tourNext').textContent = tourIndex === tourSlides.length - 1 ? 'Get started \u2728' : 'Next \u2192';
}

function startTour() {
  if (!$('#tourOverlay')) return;
  tourIndex = 0;
  renderTour();
  $('#tourOverlay').classList.remove('hidden');
}

function endTour() {
  $('#tourOverlay').classList.add('hidden');
  db.tourDone = true;
  save();
}

$('#tourNext') && ($('#tourNext').onclick = () => {
  if (tourIndex === tourSlides.length - 1) endTour();
  else { tourIndex++; renderTour(); }
});
$('#tourBack') && ($('#tourBack').onclick = () => { if (tourIndex > 0) { tourIndex--; renderTour(); } });
$('#tourSkip') && ($('#tourSkip').onclick = endTour);
$('#replayTourBtn') && ($('#replayTourBtn').onclick = () => { $('#settingsDialog').close(); setTimeout(startTour, 250); });


setTimeout(three, 500);
boot();
