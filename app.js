// Daysie - Complete application with all features
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

// Constants
const KEY = 'daysie.v3';
const PROFILE_KEY = 'daysie.activeProfile';
const SETTINGS_KEY = 'daysie.settings';

const moods = [
  ['5', '😄', 'Great'],
  ['4', '😊', 'Good'],
  ['3', '😐', 'Okay'],
  ['2', '😕', 'Meh'],
  ['1', '😢', 'Tough'],
];

const tags = ['Family', 'Friends', 'Work', 'School', 'Health', 'Gratitude', 'Fun', 'Rest', 'Win', 'Worry'];

const prompts = [
  'What made you smile today?',
  'Name one thing you\'re grateful for right now.',
  'What\'s something kind you did or saw today?',
  'Describe a small win from today.',
  'What would make tomorrow easier?',
  'What is one worry you can set down for now?',
  'Who are you thankful for, and why?',
  'Describe today using three words.',
  'What did you learn today?',
  'How did you take care of yourself today?',
];

const quotes = [
  'Small steps every day add up to big journeys. 🌱',
  'Progress, not perfection. 💛',
  'Every sunrise is a fresh page. ☀️',
  'Celebrate the tiny wins. They count too.',
  'You do not have to do it all today — just the next kind thing.',
];

const categories = [
  { id: 'none', emoji: '📌', label: 'General' },
  { id: 'meds', emoji: '💊', label: 'Medicine' },
  { id: 'chores', emoji: '🧹', label: 'Chores' },
  { id: 'birthday', emoji: '🎂', label: 'Birthday' },
  { id: 'call', emoji: '📞', label: 'Call' },
  { id: 'appointment', emoji: '🩺', label: 'Appointment' },
];

const profileColors = [
  { id: 'sun', color: '#ffcd57' },
  { id: 'pink', color: '#ff8c9a' },
  { id: 'green', color: '#7fc989' },
  { id: 'blue', color: '#79c8ce' },
  { id: 'lav', color: '#ad97e8' },
  { id: 'orange', color: '#ff9f5a' },
];

const profileEmojis = ['🌼', '👵', '👴', '👨', '👩', '👧', '👦', '🐶', '🐱', '🦊', '🐻', '🐼'];

// State
let db = {
  profiles: [
    { id: 'default', name: 'Me', emoji: '🌼', color: 'sun', tasks: [], entries: [], streak: 0, lastCheck: '', prompt: 0 },
  ],
  onboarded: false,
};

let settings = {
  theme: 'light',
  font: 'normal',
  authToken: null,
  userEmail: null,
  pushSubscription: null,
};

let activeProfileId = 'default';
let selectedMood = null;
let selectedTags = [];
let selectedPhotos = [];
let priority = 'low';
let repeat = 'none';
let category = 'none';
let editing = null;
let editingEntry = null;
let timer = null;
let calendarDate = new Date();
let taskFilter = 'all';
let renagTimer = null;

// Utility functions
const save = () => {
  localStorage.setItem(KEY, JSON.stringify(db));
  if (settings.authToken) syncToCloud();
};

const saveSettings = () => localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
const saveActiveProfile = () => localStorage.setItem(PROFILE_KEY, activeProfileId);

const load = () => {
  try {
    const data = localStorage.getItem(KEY);
    if (data) Object.assign(db, JSON.parse(data));
    // Migrate old data
    if (!db.profiles) {
      db.profiles = [{ id: 'default', name: db.user || 'Me', emoji: '🌼', color: 'sun', tasks: db.tasks || [], entries: db.entries || [], streak: db.streak || 0, lastCheck: db.lastCheck || '', prompt: db.prompt || 0 }];
      delete db.user;
      delete db.tasks;
      delete db.entries;
      delete db.streak;
      delete db.lastCheck;
      delete db.prompt;
    }
  } catch (e) {
    console.error('Load error:', e);
  }

  try {
    const s = localStorage.getItem(SETTINGS_KEY);
    if (s) Object.assign(settings, JSON.parse(s));
  } catch (e) {}

  try {
    const p = localStorage.getItem(PROFILE_KEY);
    if (p && db.profiles.find((pr) => pr.id === p)) activeProfileId = p;
  } catch (e) {}
};

const getProfile = () => db.profiles.find((p) => p.id === activeProfileId) || db.profiles[0];

const id = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const day = (d) => (d || new Date()).toISOString().slice(0, 10);
const esc = (s) => (s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function toast(title, body = '') {
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = `${title}<small>${body}</small>`;
  $('#toastHost').append(t);
  setTimeout(() => {
    t.style.opacity = 0;
    t.style.transform = 'translateY(-8px)';
    setTimeout(() => t.remove(), 300);
  }, 4500);
}

function applyTheme() {
  document.body.dataset.theme = settings.theme;
  document.body.dataset.font = settings.font;
  const meta = $('#themeColorMeta');
  if (settings.theme === 'dark') meta.content = '#1a1820';
  else if (settings.theme === 'hc') meta.content = '#000';
  else meta.content = '#fff7ed';
}

// Boot
function boot() {
  load();
  applyTheme();
  buildPickers();
  $('#dailyQuote').textContent = quotes[Math.floor(Math.random() * quotes.length)];
  if (db.onboarded) showApp();
  else $('#welcome').classList.remove('hidden');

  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

function showApp() {
  $('#welcome').classList.add('hidden');
  $('#app').classList.remove('hidden');
  $('#tabs').classList.remove('hidden');
  $('#fab').classList.remove('hidden');

  const prof = getProfile();
  const h = new Date().getHours();
  $('#helloText').textContent = `${h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'}, ${prof.name}!`;
  $('#dateText').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  $('#profileName').textContent = prof.name;
  $('#profileEmoji').textContent = prof.emoji;

  showNotifyBanner();
  updateSyncStatus();
  renderAll();
  startClock();
  startRenag();
}

$('#startBtn').onclick = () => {
  const name = $('#nameInput').value.trim() || 'friend';
  db.profiles[0].name = name;
  db.onboarded = true;
  save();
  showApp();
};

function go(tab) {
  ['today', 'tasks', 'calendar', 'journal', 'insights'].forEach((v) => {
    $(`#${v}View`).classList.toggle('hidden', v !== tab);
    $(`[data-tab="${v}"]`)?.classList.toggle('active', v === tab);
  });
  if (tab === 'calendar') renderCalendar();
  if (tab === 'journal') renderEntries();
  if (tab === 'insights') renderInsights();
  scrollTo({ top: 0, behavior: 'smooth' });
}

$$('[data-tab]').forEach((b) => (b.onclick = () => go(b.dataset.tab)));

function showNotifyBanner() {
  if (!('Notification' in window)) return;
  $('#notifyBanner').classList.toggle('hidden', Notification.permission === 'granted');
}

$('#notifyBtn').onclick = async () => {
  if (!('Notification' in window)) return toast('Notifications unavailable', 'This browser does not support them.');
  const p = await Notification.requestPermission();
  showNotifyBanner();
  toast(p === 'granted' ? '🔔 Reminders on!' : 'No problem', 'In-app alerts will still show while Daysie is open.');
};

function buildPickers() {
  // Mood picker (journal)
  $('#moodPicker').innerHTML = moods.map((m) => `<button class="mood" data-mood="${m[0]}"><span>${m[1]}</span>${m[2]}</button>`).join('');
  $$('#moodPicker button').forEach((b) => {
    b.onclick = () => {
      selectedMood = +b.dataset.mood;
      $$('#moodPicker button').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
    };
  });

  // Edit mood picker
  $('#editMoodPicker').innerHTML = moods.map((m) => `<button class="mood" data-mood="${m[0]}"><span>${m[1]}</span>${m[2]}</button>`).join('');
  $$('#editMoodPicker button').forEach((b) => {
    b.onclick = () => {
      selectedMood = +b.dataset.mood;
      $$('#editMoodPicker button').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
    };
  });

  // Tag picker
  $('#tagPicker').innerHTML = tags.map((t) => `<button class="chip" data-tag="${t}">${t}</button>`).join('');
  $$('#tagPicker button').forEach((b) => {
    b.onclick = () => {
      b.classList.toggle('on');
      selectedTags = b.classList.contains('on') ? [...selectedTags, b.dataset.tag] : selectedTags.filter((x) => x !== b.dataset.tag);
    };
  });

  // Prompt
  const prof = getProfile();
  $('#promptText').textContent = prompts[prof.prompt % prompts.length];
  $('#nextPrompt').onclick = () => {
    prof.prompt = (prof.prompt + 1) % prompts.length;
    save();
    $('#promptText').textContent = prompts[prof.prompt];
  };

  // Priority picker
  $$('#priorityPicker button').forEach((b) => {
    b.onclick = () => {
      priority = b.dataset.priority;
      $$('#priorityPicker button').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
    };
  });

  // Repeat picker
  $$('#repeatPicker button').forEach((b) => {
    b.onclick = () => {
      repeat = b.dataset.repeat;
      $$('#repeatPicker button').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
    };
  });

  // Category picker
  $('#categoryPicker').innerHTML = categories.map((c) => `<button type="button" class="chip" data-category="${c.id}">${c.emoji} ${c.label}</button>`).join('');
  $$('#categoryPicker button').forEach((b) => {
    b.onclick = () => {
      category = b.dataset.category;
      $$('#categoryPicker button').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
    };
  });

  // Theme picker
  $$('#themePicker button').forEach((b) => {
    b.onclick = () => {
      settings.theme = b.dataset.theme;
      saveSettings();
      applyTheme();
      $$('#themePicker button').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
    };
  });
  $$('#themePicker button').forEach((b) => b.classList.toggle('on', b.dataset.theme === settings.theme));

  // Font picker
  $$('#fontPicker button').forEach((b) => {
    b.onclick = () => {
      settings.font = b.dataset.font;
      saveSettings();
      applyTheme();
      $$('#fontPicker button').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
    };
  });
  $$('#fontPicker button').forEach((b) => b.classList.toggle('on', b.dataset.font === settings.font));

  // Profile colors
  $('#profileColorPicker').innerHTML = profileColors.map((c) => `<button type="button" data-color="${c.id}" style="background:${c.color}"></button>`).join('');

  // Profile emojis
  $('#profileEmojiPicker').innerHTML = profileEmojis.map((e) => `<button type="button" data-emoji="${e}">${e}</button>`).join('');
}

function bumpStreak() {
  const prof = getProfile();
  const today = day();
  if (prof.lastCheck === today) return;
  const y = new Date();
  y.setDate(y.getDate() - 1);
  prof.streak = prof.lastCheck === day(y) ? prof.streak + 1 : 1;
  prof.lastCheck = today;
  save();
}

// TASKS
function openTask(task = null) {
  editing = task?.id || null;
  $('#dialogTitle').textContent = task ? '✏️ Edit reminder' : '⏰ New reminder';
  $('#taskTitle').value = task?.title || '';
  $('#taskNote').value = task?.note || '';
  priority = task?.priority || 'low';
  repeat = task?.repeat || 'none';
  category = task?.category || 'none';

  // Default to today at a reasonable hour
  const due = task?.due ? new Date(task.due) : new Date();
  if (!task?.due) {
    due.setHours(due.getHours() + 1, 0, 0, 0);
  }
  $('#taskDate').value = day(due);
  $('#taskTime').value = due.toTimeString().slice(0, 5);

  $$('#priorityPicker button').forEach((b) => b.classList.toggle('on', b.dataset.priority === priority));
  $$('#repeatPicker button').forEach((b) => b.classList.toggle('on', b.dataset.repeat === repeat));
  $$('#categoryPicker button').forEach((b) => b.classList.toggle('on', b.dataset.category === category));

  $('#taskDialog').showModal();
}

$$('[data-open-task]').forEach((b) => (b.onclick = () => openTask()));

$('#saveTaskBtn').onclick = () => {
  const title = $('#taskTitle').value.trim();
  if (!title) return;

  const dateVal = $('#taskDate').value || day();
  const timeVal = $('#taskTime').value || '09:00';
  const due = new Date(dateVal + 'T' + timeVal).getTime();

  const prof = getProfile();
  const data = { title, due, note: $('#taskNote').value.trim(), priority, repeat, category, notified: false };

  if (editing) {
    Object.assign(
      prof.tasks.find((t) => t.id === editing),
      data
    );
  } else {
    prof.tasks.push({ id: id(), done: false, created: Date.now(), ...data });
  }
  save();
  $('#taskDialog').close();
  renderAll();
  toast('✅ Reminder saved', due ? 'Daysie will nudge you on time.' : 'Added to your list.');
};

$('#cancelTaskBtn').onclick = () => $('#taskDialog').close();

function nextDue(ms, rep) {
  const d = new Date(ms);
  if (rep === 'daily') d.setDate(d.getDate() + 1);
  if (rep === 'weekly') d.setDate(d.getDate() + 7);
  if (rep === 'monthly') d.setMonth(d.getMonth() + 1);
  if (rep === 'yearly') d.setFullYear(d.getFullYear() + 1);
  return d.getTime();
}

function completeTask(t) {
  t.done = !t.done;
  if (t.done) {
    t.completed = Date.now();
    bumpStreak();
    confetti();
    const prof = getProfile();
    if (t.repeat && t.repeat !== 'none' && t.due) {
      prof.tasks.push({ ...t, id: id(), done: false, completed: null, due: nextDue(t.due, t.repeat), notified: false });
    }
  }
  save();
  renderAll();
}

function delTask(idv) {
  confirm(
    '🗑️',
    'Delete reminder?',
    'This cannot be undone.',
    () => {
      const prof = getProfile();
      prof.tasks = prof.tasks.filter((t) => t.id !== idv);
      save();
      renderAll();
      toast('Deleted', '');
    },
    () => {}
  );
}

function snooze(t, min = 10) {
  t.due = Date.now() + min * 60000;
  t.notified = false;
  save();
  renderAll();
  toast('😴 Snoozed', `Back in ${min} minutes.`);
}

function fmt(ms) {
  const d = new Date(ms);
  const n = new Date();
  const tm = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (day(d) === day(n)) return tm;
  const x = new Date();
  x.setDate(x.getDate() + 1);
  if (day(d) === day(x)) return 'Tomorrow ' + tm;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + tm;
}

function taskHTML(t) {
  const late = t.due && !t.done && t.due < Date.now();
  const cat = categories.find((c) => c.id === t.category) || categories[0];
  return `<article class="task ${t.priority} ${t.done ? 'done' : ''} ${t.category}">
    <button class="check ${t.done ? 'on' : ''}" data-done="${t.id}">${t.done ? '✓' : ''}</button>
    <div class="task-body">
      <div class="task-title"><span class="task-category">${cat.emoji}</span>${esc(t.title)}</div>
      <div class="meta">
        ${t.due ? `<span class="${late ? 'late' : ''}">${late ? '⚠️ ' : '🕒 '}${fmt(t.due)}</span>` : ''}
        ${t.repeat && t.repeat !== 'none' ? `<span>🔁 ${t.repeat}</span>` : ''}
        ${t.priority === 'high' ? '<span>🌸 Important</span>' : ''}
      </div>
      ${t.note ? `<div class="note">${esc(t.note)}</div>` : ''}
    </div>
    <div class="actions">
      ${late && !t.done ? `<button class="icon" data-snooze="${t.id}">😴</button>` : ''}
      <button class="icon" data-edit="${t.id}">✏️</button>
      <button class="icon" data-delete="${t.id}">🗑️</button>
    </div>
  </article>`;
}

function renderTasks() {
  const prof = getProfile();
  let active = prof.tasks.filter((t) => !t.done);
  const done = prof.tasks
    .filter((t) => t.done)
    .sort((a, b) => (b.completed || 0) - (a.completed || 0))
    .slice(0, 10);

  // Filter
  if (taskFilter === 'today') {
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    active = active.filter((t) => t.due && t.due <= end.getTime());
  } else if (taskFilter === 'high') {
    active = active.filter((t) => t.priority === 'high');
  } else if (taskFilter === 'birthday') {
    active = active.filter((t) => t.category === 'birthday');
  }

  const now = Date.now();
  const end = new Date();
  end.setHours(23, 59, 59, 999);

  const groups = [
    ['⚠️ Overdue', active.filter((t) => t.due && t.due < now)],
    ['☀️ Today', active.filter((t) => t.due && t.due >= now && t.due <= end.getTime())],
    ['📅 Upcoming', active.filter((t) => t.due && t.due > end.getTime())],
    ['💫 Someday', active.filter((t) => !t.due)],
    ['✅ Recently done', done],
  ];

  let html = '';
  groups.forEach(([g, arr]) => {
    arr.sort((a, b) => (a.due || 9e15) - (b.due || 9e15));
    if (arr.length) html += `<div class="group">${g} · ${arr.length}</div>` + arr.map(taskHTML).join('');
  });

  $('#taskList').innerHTML = html || empty('🌼', 'No reminders yet', 'Tap + to add one.');

  // Today view
  const today = groups[1][1].concat(groups[0][1]).sort((a, b) => (a.due || 0) - (b.due || 0));
  $('#todayTasks').innerHTML = today.length ? today.map(taskHTML).join('') : empty('✨', 'Nothing due today', 'Enjoy your day, or add something new.');

  bindTaskButtons();
}

function bindTaskButtons() {
  const prof = getProfile();
  $$('[data-done]').forEach((b) => (b.onclick = () => completeTask(prof.tasks.find((t) => t.id === b.dataset.done))));
  $$('[data-delete]').forEach((b) => (b.onclick = () => delTask(b.dataset.delete)));
  $$('[data-edit]').forEach((b) => (b.onclick = () => openTask(prof.tasks.find((t) => t.id === b.dataset.edit))));
  $$('[data-snooze]').forEach((b) => (b.onclick = () => snooze(prof.tasks.find((t) => t.id === b.dataset.snooze))));
}

// Task filter
$$('.chip-filter').forEach((b) => {
  b.onclick = () => {
    taskFilter = b.dataset.filter;
    $$('.chip-filter').forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    renderTasks();
  };
});

// WEEK AGENDA
function renderWeekAgenda() {
  const prof = getProfile();
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    days.push(d);
  }

  let html = '';
  days.forEach((d) => {
    const dayStr = day(d);
    const tasks = prof.tasks.filter((t) => !t.done && t.due && day(new Date(t.due)) === dayStr);
    if (tasks.length === 0 && d > new Date(Date.now() + 86400000 * 2)) return; // Skip future empty days after tomorrow

    const isToday = dayStr === day();
    html += `<div class="week-day">
      <div class="week-day-header">
        <b>${isToday ? '☀️ Today' : d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</b>
        <small>${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'}</small>
      </div>
      <div class="week-day-tasks">${tasks.length ? tasks.map((t) => `<div class="week-task">${categories.find((c) => c.id === t.category)?.emoji || '📌'} ${esc(t.title)}</div>`).join('') : '<div class="week-task" style="opacity:0.5">Free day!</div>'}</div>
    </div>`;
  });

  $('#weekAgenda').innerHTML = html;
}

// ON THIS DAY
function renderOnThisDay() {
  const prof = getProfile();
  const now = new Date();
  const thisMonth = now.getMonth();
  const thisDay = now.getDate();

  const memories = prof.entries.filter((e) => {
    const d = new Date(e.ts);
    return d.getMonth() === thisMonth && d.getDate() === thisDay && d.getFullYear() < now.getFullYear();
  });

  if (memories.length === 0) {
    $('#onThisDaySection').classList.add('hidden');
    return;
  }

  $('#onThisDaySection').classList.remove('hidden');
  $('#onThisDayList').innerHTML = memories
    .map((e) => {
      const d = new Date(e.ts);
      const m = moods.find((x) => +x[0] === e.mood);
      return `<article class="entry">
      <div class="entry-head">
        <span class="face">${m ? m[1] : '📝'}</span>
        <div><b>${d.getFullYear()}</b><br><small>${m ? m[2] : ''}</small></div>
      </div>
      ${e.text ? `<p class="entry-text">${esc(e.text)}</p>` : ''}
    </article>`;
    })
    .join('');
}

// CALENDAR
function renderCalendar() {
  const prof = getProfile();
  const y = calendarDate.getFullYear();
  const m = calendarDate.getMonth();
  $('#calTitle').textContent = new Date(y, m).toLocaleDateString([], { month: 'long', year: 'numeric' });

  const firstDay = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const prevMonthDays = new Date(y, m, 0).getDate();

  let html = ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d) => `<div class="cal-day-label">${d}</div>`).join('');

  // Previous month days
  for (let i = firstDay - 1; i >= 0; i--) {
    html += `<div class="cal-day other-month">${prevMonthDays - i}</div>`;
  }

  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(y, m, d);
    const dateStr = day(date);
    const isToday = dateStr === day();
    const hasTasks = prof.tasks.some((t) => t.due && day(new Date(t.due)) === dateStr);
    html += `<div class="cal-day ${isToday ? 'today' : ''} ${hasTasks ? 'has-tasks' : ''}" data-date="${dateStr}">${d}</div>`;
  }

  // Next month days
  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;
  let nextDay = 1;
  for (let i = firstDay + daysInMonth; i < totalCells; i++) {
    html += `<div class="cal-day other-month">${nextDay++}</div>`;
  }

  $('#calGrid').innerHTML = html;

  $$('.cal-day[data-date]').forEach((el) => {
    el.onclick = () => {
      const dateStr = el.dataset.date;
      const tasks = prof.tasks.filter((t) => t.due && day(new Date(t.due)) === dateStr);
      if (tasks.length === 0) {
        $('#calDayDetail').classList.add('hidden');
        return;
      }
      $('#calDayDetail').classList.remove('hidden');
      $('#calDayDetail').innerHTML = `<h3>${new Date(dateStr).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</h3>${tasks.map(taskHTML).join('')}`;
      bindTaskButtons();
    };
  });
}

$('#calPrev').onclick = () => {
  calendarDate.setMonth(calendarDate.getMonth() - 1);
  renderCalendar();
};

$('#calNext').onclick = () => {
  calendarDate.setMonth(calendarDate.getMonth() + 1);
  renderCalendar();
};

function empty(e, h, s) {
  return `<div class="empty"><div style="font-size:42px">${e}</div><b>${h}</b><p>${s}</p></div>`;
}

// JOURNAL
$('#photoInput').onchange = (e) => {
  const files = Array.from(e.target.files || []);
  files.forEach((f) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      selectedPhotos.push(ev.target.result);
      renderPhotoPreview();
    };
    reader.readAsDataURL(f);
  });
};

function renderPhotoPreview() {
  $('#photoPreview').innerHTML = selectedPhotos.map((p, i) => `<img src="${p}" alt="Photo ${i + 1}" />`).join('');
}

$('#saveEntry').onclick = () => {
  const text = $('#journalText').value.trim();
  if (!text && !selectedMood && selectedPhotos.length === 0) return toast('📝 Add a little something', 'Pick a mood, write, or add a photo.');

  const prof = getProfile();
  prof.entries.unshift({
    id: id(),
    text,
    mood: selectedMood,
    tags: [...new Set(selectedTags)],
    prompt: prompts[prof.prompt],
    photos: [...selectedPhotos],
    ts: Date.now(),
  });
  bumpStreak();
  save();

  $('#journalText').value = '';
  $('#photoInput').value = '';
  selectedMood = null;
  selectedTags = [];
  selectedPhotos = [];
  $$('#moodPicker button, #tagPicker button').forEach((b) => b.classList.remove('on'));
  $('#photoPreview').innerHTML = '';

  renderAll();
  confetti();
  toast('💛 Entry saved', 'Thanks for checking in today.');
};

$('#searchEntries').oninput = renderEntries;

function renderEntries() {
  const prof = getProfile();
  const q = $('#searchEntries').value.toLowerCase();
  const list = prof.entries.filter((e) => (e.text || '').toLowerCase().includes(q) || (e.tags || []).join(' ').toLowerCase().includes(q));

  $('#entries').innerHTML = list.length
    ? list
        .map((e) => {
          const m = moods.find((x) => +x[0] === e.mood);
          const d = new Date(e.ts);
          return `<article class="entry">
        <div class="entry-head">
          <span class="face">${m ? m[1] : '📝'}</span>
          <div><b>${d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</b><br><small>${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}${m ? ' · ' + m[2] : ''}</small></div>
          <button class="icon" data-edit-entry="${e.id}">✏️</button>
          <button class="icon" data-delete-entry="${e.id}">🗑️</button>
        </div>
        ${e.text ? `<p class="entry-text">${esc(e.text)}</p>` : ''}
        ${e.photos && e.photos.length ? `<div class="entry-photos">${e.photos.map((p) => `<img src="${p}" />`).join('')}</div>` : ''}
        <div class="tags">${(e.tags || []).map((t) => `<span>${esc(t)}</span>`).join('')}</div>
      </article>`;
        })
        .join('')
    : empty('📖', 'Your journal awaits', 'Write your first entry above.');

  $$('[data-delete-entry]').forEach((b) => {
    b.onclick = () => {
      confirm(
        '🗑️',
        'Delete entry?',
        'This cannot be undone.',
        () => {
          prof.entries = prof.entries.filter((e) => e.id !== b.dataset.deleteEntry);
          save();
          renderEntries();
          toast('Deleted', '');
        },
        () => {}
      );
    };
  });

  $$('[data-edit-entry]').forEach((b) => {
    b.onclick = () => {
      const e = prof.entries.find((x) => x.id === b.dataset.editEntry);
      if (!e) return;
      editingEntry = e.id;
      selectedMood = e.mood || null;
      $('#editEntryText').value = e.text || '';
      $$('#editMoodPicker button').forEach((btn) => btn.classList.toggle('on', +btn.dataset.mood === selectedMood));
      $('#editEntryDialog').showModal();
    };
  });
}

$('#saveEditEntry').onclick = () => {
  const prof = getProfile();
  const e = prof.entries.find((x) => x.id === editingEntry);
  if (!e) return;
  e.text = $('#editEntryText').value.trim();
  e.mood = selectedMood;
  save();
  $('#editEntryDialog').close();
  renderEntries();
  toast('✏️ Entry updated', '');
};

$('#cancelEditEntry').onclick = () => $('#editEntryDialog').close();

// INSIGHTS
function renderInsights() {
  const prof = getProfile();
  const done = prof.tasks.filter((t) => t.done).length;

  $('#stats').innerHTML = [
    ['🔥', prof.streak, 'Day streak'],
    ['✅', done, 'Tasks done'],
    ['📖', prof.entries.length, 'Entries'],
    ['📋', prof.tasks.filter((t) => !t.done).length, 'To do'],
  ]
    .map((s) => `<div class="stat"><div>${s[0]}</div><b>${s[1]}</b><span>${s[2]}</span></div>`)
    .join('');

  let days = [];
  for (let i = 6; i >= 0; i--) {
    let d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d);
  }

  $('#moodBars').innerHTML = days
    .map((d) => {
      let es = prof.entries.filter((e) => day(new Date(e.ts)) === day(d) && e.mood);
      let avg = es.length ? es.reduce((a, e) => a + e.mood, 0) / es.length : 0;
      let m = moods.find((x) => +x[0] === Math.round(avg));
      return `<div class="bar"><span>${m ? m[1] : '·'}</span><i style="height:${avg ? (avg / 5) * 100 : 4}%"></i><small>${d.toLocaleDateString([], { weekday: 'short' }).slice(0, 1)}</small></div>`;
    })
    .join('');

  const badges = [
    ['🌱', 'First step', 'Add your first reminder', prof.tasks.length >= 1],
    ['✅', 'Getting things done', 'Complete 5 tasks', done >= 5],
    ['✍️', 'Dear diary', 'Write 3 entries', prof.entries.length >= 3],
    ['🔥', 'On a roll', 'Reach a 3-day streak', prof.streak >= 3],
    ['🌟', 'Bright week', 'Reach a 7-day streak', prof.streak >= 7],
  ];

  $('#badges').innerHTML = badges.map((b) => `<div class="badge ${b[3] ? '' : 'locked'}"><b>${b[0]}</b><div><strong>${b[1]}</strong><br><small>${b[2]}</small></div></div>`).join('');
}

function renderAll() {
  renderTasks();
  renderEntries();
  renderInsights();
  renderWeekAgenda();
  renderOnThisDay();

  const prof = getProfile();
  $('#streakNum').textContent = prof.streak;
  $('#streakText').textContent = prof.lastCheck === day() ? 'You showed up today — amazing!' : 'Finish a task or journal to keep it glowing.';
}

// REMINDERS
function startClock() {
  clearInterval(timer);
  checkReminders();
  timer = setInterval(checkReminders, 15000);
}

function checkReminders() {
  const prof = getProfile();
  const now = Date.now();
  let changed = false;
  prof.tasks.forEach((t) => {
    if (!t.done && t.due && t.due <= now && !t.notified) {
      t.notified = true;
      changed = true;
      notify(t);
    }
  });
  if (changed) save();
}

function notify(t) {
  beep();
  toast('⏰ ' + esc(t.title), t.note || 'Reminder time!');
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('⏰ ' + t.title, {
      body: t.note || 'Reminder time!',
      tag: t.id,
      requireInteraction: t.priority === 'high',
    });
  }
}

// RE-NAG for overdue high-priority
function startRenag() {
  clearInterval(renagTimer);
  renagTimer = setInterval(() => {
    const prof = getProfile();
    const now = Date.now();
    prof.tasks.forEach((t) => {
      if (!t.done && t.priority === 'high' && t.due && t.due < now - 300000 && t.notified) {
        // Re-nag every 5 minutes
        const mins = Math.floor((now - t.due) / 60000);
        if (mins % 5 === 0) {
          beep();
          toast('⚠️ Still pending: ' + esc(t.title), `${mins} minutes overdue`);
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('⚠️ Important: ' + t.title, {
              body: `Still pending (${mins} min overdue)`,
              tag: t.id + '-renag',
              requireInteraction: true,
            });
          }
        }
      }
    });
  }, 60000);
}

function beep() {
  try {
    let C = window.AudioContext || window.webkitAudioContext;
    let c = new C();
    [660, 880, 660].forEach((f, i) => {
      let o = c.createOscillator();
      let g = c.createGain();
      o.frequency.value = f;
      o.connect(g);
      g.connect(c.destination);
      let s = c.currentTime + i * 0.15;
      g.gain.setValueAtTime(0.001, s);
      g.gain.exponentialRampToValueAtTime(0.15, s + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, s + 0.13);
      o.start(s);
      o.stop(s + 0.14);
    });
  } catch (e) {}
}

function confetti() {
  for (let i = 0; i < 28; i++) {
    let p = document.createElement('i');
    p.textContent = ['🌼', '✨', '💛', '🌿'][i % 4];
    p.style.cssText = `position:fixed;z-index:98;left:${50 + Math.random() * 20 - 10}%;top:38%;font-style:normal;font-size:${18 + Math.random() * 12}px;transition:1s ease;pointer-events:none`;
    document.body.append(p);
    requestAnimationFrame(() => {
      p.style.transform = `translate(${(Math.random() - 0.5) * 420}px,${120 + Math.random() * 260}px) rotate(${Math.random() * 360}deg)`;
      p.style.opacity = 0;
    });
    setTimeout(() => p.remove(), 1100);
  }
}

// EXPORT
$('#exportBtn').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' }));
  a.download = 'daysie-backup-' + day() + '.json';
  a.click();
};

$('#exportPdfBtn').onclick = async () => {
  toast('📄 Generating PDF...', 'This may take a moment.');
  try {
    const prof = getProfile();
    let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Daysie Journal</title><style>body{font-family:sans-serif;margin:40px;line-height:1.6}h1{color:#f3ad32}h2{margin-top:30px;border-bottom:2px solid #efe3d7;padding-bottom:5px}.entry{margin:20px 0;padding:15px;border-left:4px solid #ad97e8;background:#fff7ed}.meta{color:#716c80;font-size:0.9em;margin-bottom:10px}</style></head><body>`;
    html += `<h1>🌼 Daysie Journal - ${prof.name}</h1>`;
    html += `<p><strong>Exported:</strong> ${new Date().toLocaleDateString()}</p>`;
    html += `<h2>📖 Journal Entries (${prof.entries.length})</h2>`;
    prof.entries.slice(0, 100).forEach((e) => {
      const d = new Date(e.ts);
      const m = moods.find((x) => +x[0] === e.mood);
      html += `<div class="entry"><div class="meta">${d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} at ${d.toLocaleTimeString()} ${m ? '· ' + m[1] + ' ' + m[2] : ''}</div>${e.text ? `<p>${esc(e.text)}</p>` : ''}</div>`;
    });
    html += `</body></html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `daysie-journal-${day()}.html`;
    a.click();
    toast('✅ Exported!', 'Open the HTML file and print to PDF.');
  } catch (e) {
    toast('❌ Export failed', 'Please try again.');
  }
};

// PROFILES
$('#profileBtn').onclick = () => {
  renderProfileList();
  $('#profileDialog').showModal();
};

function renderProfileList() {
  $('#profileList').innerHTML = db.profiles
    .map(
      (p) => `<div class="profile-item ${p.id === activeProfileId ? 'active' : ''}" data-profile="${p.id}">
    <div class="profile-avatar" style="background:${profileColors.find((c) => c.id === p.color)?.color || '#ffcd57'}">${p.emoji}</div>
    <div class="profile-info"><b>${esc(p.name)}</b><small>${p.tasks.filter((t) => !t.done).length} tasks · ${p.entries.length} entries</small></div>
  </div>`
    )
    .join('');

  $$('.profile-item').forEach((el) => {
    el.onclick = () => {
      activeProfileId = el.dataset.profile;
      saveActiveProfile();
      showApp();
      $('#profileDialog').close();
      renderAll();
    };
  });
}

let newProfileColor = 'sun';
let newProfileEmoji = '🌼';

$$('#profileColorPicker button').forEach((b) => {
  b.onclick = () => {
    newProfileColor = b.dataset.color;
    $$('#profileColorPicker button').forEach((x) => x.classList.remove('on'));
    b.classList.add('on');
  };
});

$$('#profileEmojiPicker button').forEach((b) => {
  b.onclick = () => {
    newProfileEmoji = b.dataset.emoji;
    $$('#profileEmojiPicker button').forEach((x) => x.classList.remove('on'));
    b.classList.add('on');
  };
});

$('#addProfileBtn').onclick = () => {
  const name = $('#newProfileName').value.trim();
  if (!name) return toast('Name required', 'Please enter a name for this profile.');

  db.profiles.push({
    id: id(),
    name,
    emoji: newProfileEmoji,
    color: newProfileColor,
    tasks: [],
    entries: [],
    streak: 0,
    lastCheck: '',
    prompt: 0,
  });
  save();
  $('#newProfileName').value = '';
  renderProfileList();
  toast('✨ Profile added!', `${newProfileEmoji} ${name} is ready.`);
};

$('#closeProfileDialog').onclick = () => $('#profileDialog').close();

// SETTINGS
$('#settingsBtn').onclick = () => {
  updateAccountUI();
  $('#settingsDialog').showModal();
};

$('#closeSettings').onclick = () => $('#settingsDialog').close();

// SYNC & AUTH
function updateSyncStatus() {
  if (settings.authToken) {
    $('#syncStatus').classList.remove('hidden');
    $('#syncStatus').textContent = '☁️ Synced';
  } else {
    $('#syncStatus').classList.add('hidden');
  }
}

function updateAccountUI() {
  if (settings.authToken && settings.userEmail) {
    $('#loggedOutSection').classList.add('hidden');
    $('#loggedInSection').classList.remove('hidden');
    $('#accountEmail').textContent = settings.userEmail;
  } else {
    $('#loggedOutSection').classList.remove('hidden');
    $('#loggedInSection').classList.add('hidden');
    $('#magicCodeSection').classList.add('hidden');
  }
}

$('#sendMagicLink').onclick = async () => {
  const email = $('#authEmail').value.trim();
  if (!email || !email.includes('@')) return toast('Invalid email', 'Please enter a valid email address.');

  toast('📧 Sending magic link...', 'Check your inbox!');

  try {
    // Call Cloudflare Worker auth endpoint
    const res = await fetch('https://daysie-api.neil27.workers.dev/auth/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });

    if (res.ok) {
      $('#magicCodeSection').classList.remove('hidden');
      toast('✅ Code sent!', 'Check your email for a 6-digit code.');
    } else {
      toast('❌ Failed', 'Could not send code. Check the Worker URL.');
    }
  } catch (e) {
    console.error(e);
    toast('❌ Network error', 'Make sure the Cloudflare Worker is deployed.');
  }
};

$('#verifyCode').onclick = async () => {
  const email = $('#authEmail').value.trim();
  const code = $('#magicCode').value.trim();
  if (!code || code.length !== 6) return toast('Invalid code', 'Enter the 6-digit code.');

  toast('🔑 Verifying...', '');

  try {
    const res = await fetch('https://daysie-api.neil27.workers.dev/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code }),
    });

    if (res.ok) {
      const data = await res.json();
      settings.authToken = data.token;
      settings.userEmail = email;
      saveSettings();
      updateAccountUI();
      updateSyncStatus();
      toast('🎉 Signed in!', 'Your data will now sync across devices.');
      syncToCloud();
      pullFromCloud();
    } else {
      toast('❌ Invalid code', 'Please try again.');
    }
  } catch (e) {
    console.error(e);
    toast('❌ Error', 'Could not verify code.');
  }
};

$('#signOutBtn').onclick = () => {
  confirm(
    '☁️',
    'Sign out?',
    'Local data will remain on this device.',
    () => {
      settings.authToken = null;
      settings.userEmail = null;
      settings.pushSubscription = null;
      saveSettings();
      updateAccountUI();
      updateSyncStatus();
      toast('👋 Signed out', '');
    },
    () => {}
  );
};

$('#syncNowBtn').onclick = async () => {
  toast('🔄 Syncing...', '');
  await syncToCloud();
  await pullFromCloud();
  toast('✅ Synced!', '');
};

async function syncToCloud() {
  if (!settings.authToken) return;
  try {
    await fetch('https://daysie-api.neil27.workers.dev/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.authToken}` },
      body: JSON.stringify({ profiles: db.profiles }),
    });
  } catch (e) {
    console.error('Sync error:', e);
  }
}

async function pullFromCloud() {
  if (!settings.authToken) return;
  try {
    const res = await fetch('https://daysie-api.neil27.workers.dev/data', {
      headers: { Authorization: `Bearer ${settings.authToken}` },
    });
    if (res.ok) {
      const data = await res.json();
      if (data.profiles && data.profiles.length > 0) {
        // Merge (simple last-write-wins for now)
        db.profiles = data.profiles;
        save();
        renderAll();
      }
    }
  } catch (e) {
    console.error('Pull error:', e);
  }
}

// PUSH NOTIFICATIONS
$('#subscribePushBtn').onclick = async () => {
  if (!settings.authToken) return toast('Sign in first', 'You need an account to use push notifications.');
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return toast('Not supported', 'Your browser does not support push notifications.');

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array('BCbfGHSDEXclbsTnL3DjwZxyaLTXhlge4D6wNonqGwOfkLgA19fFyfz7j0nmBD0GxQJp4MNDPfWigOzFvLCyinU'),
    });

    // Send subscription to Worker
    const res = await fetch('https://daysie-api.neil27.workers.dev/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.authToken}` },
      body: JSON.stringify(subscription),
    });

    if (res.ok) {
      settings.pushSubscription = subscription;
      saveSettings();
      toast('🔔 Push enabled!', 'You\'ll get reminders even when Daysie is closed.');
    } else {
      toast('❌ Failed', 'Could not register push subscription.');
    }
  } catch (e) {
    console.error(e);
    toast('❌ Error', 'Could not subscribe to push.');
  }
};

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

// CONFIRM DIALOG
let confirmCallback = null;
let cancelCallback = null;

function confirm(icon, title, msg, onYes, onNo) {
  $('#confirmIcon').textContent = icon;
  $('#confirmTitle').textContent = title;
  $('#confirmMsg').textContent = msg;
  confirmCallback = onYes;
  cancelCallback = onNo;
  $('#confirmDialog').showModal();
}

$('#confirmYes').onclick = () => {
  $('#confirmDialog').close();
  if (confirmCallback) confirmCallback();
};

$('#confirmNo').onclick = () => {
  $('#confirmDialog').close();
  if (cancelCallback) cancelCallback();
};

// THREE.JS BACKGROUND
function three() {
  if (!window.THREE) return;
  const c = $('#garden');
  const r = new THREE.WebGLRenderer({ canvas: c, alpha: true, antialias: true });
  r.setPixelRatio(Math.min(devicePixelRatio, 2));
  let scene = new THREE.Scene();
  let cam = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 100);
  cam.position.z = 18;
  let g = new THREE.Group();
  scene.add(g);
  let colors = [0xffcd57, 0xff8c9a, 0x7fc989, 0x79c8ce, 0xad97e8, 0xffffff];
  for (let i = 0; i < 34; i++) {
    let mesh = new THREE.Mesh(
      new THREE.SphereGeometry(Math.random() * 0.55 + 0.18, 16, 16),
      new THREE.MeshBasicMaterial({ color: colors[i % colors.length], transparent: true, opacity: 0.45 })
    );
    mesh.position.set((Math.random() - 0.5) * 34, (Math.random() - 0.5) * 26, (Math.random() - 0.5) * 10);
    mesh.userData = { x: mesh.position.x, y: mesh.position.y, s: Math.random() * 0.5 + 0.2, p: Math.random() * 9 };
    g.add(mesh);
  }
  function resize() {
    r.setSize(innerWidth, innerHeight);
    cam.aspect = innerWidth / innerHeight;
    cam.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();
  let t = 0;
  (function loop() {
    t += 0.01;
    g.children.forEach((m) => {
      m.position.x = m.userData.x + Math.sin(t * m.userData.s + m.userData.p) * 1.2;
      m.position.y = m.userData.y + Math.cos(t * m.userData.s + m.userData.p) * 1.1;
    });
    g.rotation.y = Math.sin(t * 0.25) * 0.08;
    r.render(scene, cam);
    requestAnimationFrame(loop);
  })();
}

setTimeout(three, 500);
boot();
