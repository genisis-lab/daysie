const $ = (e) => document.querySelector(e),
  $$ = (e) => [...document.querySelectorAll(e)],
  KEY = "daysie.v3",
  PROFILE_KEY = "daysie.activeProfile",
  SETTINGS_KEY = "daysie.settings",
  moods = [
    ["5", "😄", "Great"],
    ["4", "😊", "Good"],
    ["3", "😐", "Okay"],
    ["2", "😕", "Meh"],
    ["1", "😢", "Tough"],
  ],
  tags = [
    "Family",
    "Friends",
    "Work",
    "School",
    "Health",
    "Gratitude",
    "Fun",
    "Rest",
    "Win",
    "Worry",
  ],
  prompts = [
    "What made you smile today?",
    "Name one thing you're grateful for right now.",
    "What's something kind you did or saw today?",
    "Describe a small win from today.",
    "What would make tomorrow easier?",
    "What is one worry you can set down for now?",
    "Who are you thankful for, and why?",
    "Describe today using three words.",
    "What did you learn today?",
    "How did you take care of yourself today?",
  ],
  quotes = [
    "Small steps every day add up to big journeys. 🌱",
    "Progress, not perfection. 💛",
    "Every sunrise is a fresh page. ☀️",
    "Celebrate the tiny wins. They count too.",
    "You do not have to do it all today — just the next kind thing.",
  ],
  categories = [
    { id: "none", emoji: "📌", label: "General" },
    { id: "meds", emoji: "💊", label: "Medicine" },
    { id: "chores", emoji: "🧹", label: "Chores" },
    { id: "birthday", emoji: "🎂", label: "Birthday" },
    { id: "call", emoji: "📞", label: "Call" },
    { id: "appointment", emoji: "🩺", label: "Appointment" },
  ],
  profileColors = [
    { id: "sun", color: "#ffcd57" },
    { id: "pink", color: "#ff8c9a" },
    { id: "green", color: "#7fc989" },
    { id: "blue", color: "#79c8ce" },
    { id: "lav", color: "#ad97e8" },
    { id: "orange", color: "#ff9f5a" },
  ],
  profileEmojis = [
    "🌼",
    "👵",
    "👴",
    "👨",
    "👩",
    "👧",
    "👦",
    "🐶",
    "🐱",
    "🦊",
    "🐻",
    "🐼",
  ];
let db = {
    profiles: [
      {
        id: "default",
        name: "Me",
        emoji: "🌼",
        color: "sun",
        tasks: [],
        entries: [],
        streak: 0,
        lastCheck: "",
        prompt: 0,
        habits: [],
      },
    ],
    onboarded: !1,
    lists: [],
    tourDone: !1,
  },
  settings = {
    theme: "light",
    font: "normal",
    authToken: null,
    userId: null,
    authProvider: null,
    authEmail: null,
    authUsername: null,
    pushSubscription: null,
    syncRevision: 0,
    syncPending: false,
    syncState: "idle",
  },
  activeProfileId = "default",
  selectedMood = null,
  selectedTags = [],
  selectedPhotos = [],
  priority = "low",
  repeat = "none",
  category = "none",
  editing = null,
  editingEntry = null,
  editingPhotos = [],
  editingSubtasks = [],
  entryTagFilterValue = null,
  snoozeTaskId = null,
  timer = null,
  calendarDate = new Date(),
  taskFilter = "all",
  renagTimer = null,
  assignee = null;
const APP_VERSION = "2026.07.17-24";
let swRegistration = null,
  updateBannerShown = !1;
const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
    } catch (e) {
      (console.error("Save error:", e),
        toast(
          "⚠️ Storage is full",
          "Turn on sync in Settings, or remove some photos to free up space.",
        ));
    }
    settings.authToken && scheduleCloudSync();
  },
  saveSettings = () =>
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)),
  saveActiveProfile = () => localStorage.setItem(PROFILE_KEY, activeProfileId),
  load = () => {
    try {
      const e = localStorage.getItem(KEY);
      (e && Object.assign(db, JSON.parse(e)),
        db.profiles ||
          ((db.profiles = [
            {
              id: "default",
              name: db.user || "Me",
              emoji: "🌼",
              color: "sun",
              tasks: db.tasks || [],
              entries: db.entries || [],
              streak: db.streak || 0,
              lastCheck: db.lastCheck || "",
              prompt: db.prompt || 0,
            },
          ]),
          delete db.user,
          delete db.tasks,
          delete db.entries,
          delete db.streak,
          delete db.lastCheck,
          delete db.prompt));
    } catch (e) {
      console.error("Load error:", e);
    }
    try {
      const e = localStorage.getItem(SETTINGS_KEY);
      e && Object.assign(settings, JSON.parse(e));
    } catch (e) {}
    try {
      const e = localStorage.getItem(PROFILE_KEY);
      e && db.profiles.find((t) => t.id === e) && (activeProfileId = e);
    } catch (e) {}
    (Array.isArray(db.lists) || (db.lists = []),
      "boolean" != typeof db.tourDone && (db.tourDone = !1),
      (db.profiles || []).forEach((e) => {
        Array.isArray(e.habits) || (e.habits = []);
      }),
      collapseProfiles());
  };
function collapseProfiles() {
  if (!Array.isArray(db.profiles) || 0 === db.profiles.length)
    return (
      (db.profiles = [
        {
          id: "me",
          name: "Me",
          emoji: "🌼",
          color: "sun",
          tasks: [],
          entries: [],
          streak: 0,
          lastCheck: "",
          prompt: 0,
          habits: [],
        },
      ]),
      void (activeProfileId = db.profiles[0].id)
    );
  const e = db.profiles.find((e) => e.id === activeProfileId) || db.profiles[0];
  (db.profiles.length > 1 &&
    (db.profiles.forEach((t) => {
      t !== e &&
        ((e.tasks = (e.tasks || []).concat(t.tasks || [])),
        (e.entries = (e.entries || []).concat(t.entries || [])),
        (e.habits = (e.habits || []).concat(t.habits || [])));
    }),
    e.entries.sort((e, t) => (t.ts || 0) - (e.ts || 0))),
    (e.tasks || []).forEach((t) => {
      t.assignee && t.assignee !== e.id && (t.assignee = null);
    }),
    (db.profiles = [e]),
    (activeProfileId = e.id));
}
const getProfile = () =>
    db.profiles.find((e) => e.id === activeProfileId) || db.profiles[0],
  findTaskOwner = (e) => {
    for (const t of db.profiles) {
      const o = (t.tasks || []).find((t) => t.id === e);
      if (o) return { task: o, profile: t };
    }
    return null;
  },
  profileById = (e) => db.profiles.find((t) => t.id === e) || null,
  id = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
  day = (value) => {
    const date = value || new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const dateOfMonth = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${dateOfMonth}`;
  },
  isIOS = () =>
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    ("MacIntel" === navigator.platform && navigator.maxTouchPoints > 1),
  isStandalone = () =>
    window.matchMedia("(display-mode: standalone)").matches ||
    !0 === navigator.standalone,
  esc = (e) =>
    (e || "").replace(
      /[&<>"']/g,
      (e) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[e],
    );
const safeDomId = (e, t = "") =>
    /^[A-Za-z0-9_-]{1,80}$/.test(String(e || "")) ? String(e) : t,
  safePhotoSrc = (e) => {
    const t = String(e || "");
    if (
      /^data:image\/(?:png|jpe?g|gif|webp|avif);base64,[A-Za-z0-9+/=]+$/i.test(
        t,
      )
    )
      return esc(t);
    try {
      const e = new URL(t, location.href);
      if (e.href.startsWith(`${API}/photo/`)) return esc(e.href);
    } catch (e) {}
    return "";
  };
function toast(e, t = "") {
  const o = document.createElement("div");
  o.className = "toast";
  const n = document.createElement("span");
  n.textContent = e;
  const a = document.createElement("small");
  ((a.textContent = t), o.append(n, a));
  const s = document.querySelector("dialog[open]");
  let i;
  (s
    ? ((i = s.querySelector(".dialog-toast-host")),
      i ||
        ((i = document.createElement("div")),
        (i.className = "dialog-toast-host"),
        s.appendChild(i)))
    : (i = $("#toastHost")),
    i.append(o),
    setTimeout(() => {
      ((o.style.opacity = 0),
        (o.style.transform = "translateY(-8px)"),
        setTimeout(() => o.remove(), 300));
    }, 4500));
}
function applyTheme() {
  ((document.body.dataset.theme = settings.theme),
    (document.body.dataset.font = settings.font));
  const e = $("#themeColorMeta");
  "dark" === settings.theme
    ? (e.content = "#1a1820")
    : "hc" === settings.theme
      ? (e.content = "#000")
      : (e.content = "#fff7ed");
}
function boot() {
  (load(),
    applyTheme(),
    buildPickers(),
    ($("#dailyQuote").textContent =
      quotes[Math.floor(Math.random() * quotes.length)]),
    db.onboarded
      ? showApp()
      : ($("#app").classList.add("hidden"),
        $("#tabs").classList.add("hidden"),
        $("#fab").classList.add("hidden"),
        $("#welcome").classList.remove("hidden")),
    setupServiceWorker(),
    refreshPushSubscription());
}
function setupServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  let e = !1;
  (navigator.serviceWorker.addEventListener("controllerchange", () => {
    e || ((e = !0), window.location.reload());
  }),
    navigator.serviceWorker
      .register("./sw.js")
      .then((e) => {
        ((swRegistration = e),
          e.waiting && navigator.serviceWorker.controller && showUpdateBanner(),
          e.addEventListener("updatefound", () => {
            const t = e.installing;
            t &&
              t.addEventListener("statechange", () => {
                "installed" === t.state &&
                  navigator.serviceWorker.controller &&
                  showUpdateBanner();
              });
          }),
          setInterval(() => e.update().catch(() => {}), 36e5));
      })
      .catch(() => {}),
    checkVersion(),
    setInterval(checkVersion, 18e5),
    document.addEventListener("visibilitychange", () => {
      document.hidden || checkVersion();
    }));
}
async function checkVersion() {
  try {
    const e = await fetch("./version.json?ts=" + Date.now(), {
      cache: "no-store",
    });
    if (!e.ok) return;
    const t = await e.json();
    if (!t || !t.version) return;
    t.version !== APP_VERSION ? showUpdateBanner() : hideUpdateBanner();
  } catch (e) {}
}
function showUpdateBanner() {
  updateBannerShown ||
    ((updateBannerShown = !0), $("#updateBanner")?.classList.remove("hidden"));
}
function hideUpdateBanner() {
  ((updateBannerShown = !1), $("#updateBanner")?.classList.add("hidden"));
}
function showApp() {
  ($("#welcome").classList.add("hidden"),
    $("#app").classList.remove("hidden"),
    $("#tabs").classList.remove("hidden"),
    $("#fab").classList.remove("hidden"));
  const e = getProfile(),
    t = new Date().getHours();
  (($("#helloText").textContent =
    `${t < 12 ? "Good morning" : t < 18 ? "Good afternoon" : "Good evening"}, ${e.name}!`),
    ($("#dateText").textContent = new Date().toLocaleDateString(void 0, {
      weekday: "long",
      month: "short",
      day: "numeric",
    })),
    ($("#profileName").textContent = e.name),
    ($("#profileEmoji").textContent = e.emoji),
    showNotifyBanner(),
    updateSyncStatus(),
    renderAll(),
    startClock(),
    startRenag());
}
function go(e) {
  (["today", "tasks", "calendar", "journal", "insights"].forEach((t) => {
    ($(`#${t}View`).classList.toggle("hidden", t !== e),
      $$(`[data-tab="${t}"]`).forEach((o) =>
        o.classList.toggle("active", t === e),
      ));
  }),
    $("#fab").classList.toggle("hidden", !["today", "tasks"].includes(e)),
    "calendar" === e && renderCalendar(),
    "journal" === e && renderEntries(),
    "insights" === e && renderInsights(),
    scrollTo({ top: 0, behavior: "smooth" }));
}
function showNotifyBanner() {
  "Notification" in window &&
    $("#notifyBanner").classList.toggle(
      "hidden",
      "granted" === Notification.permission,
    );
}
function buildPickers() {
  (($("#moodPicker").innerHTML = moods
    .map(
      (e) =>
        `<button class="mood" data-mood="${e[0]}"><span>${e[1]}</span>${e[2]}</button>`,
    )
    .join("")),
    $$("#moodPicker button").forEach((e) => {
      e.onclick = () => {
        ((selectedMood = +e.dataset.mood),
          $$("#moodPicker button").forEach((e) => e.classList.remove("on")),
          e.classList.add("on"));
      };
    }),
    ($("#editMoodPicker").innerHTML = moods
      .map(
        (e) =>
          `<button class="mood" data-mood="${e[0]}"><span>${e[1]}</span>${e[2]}</button>`,
      )
      .join("")),
    $$("#editMoodPicker button").forEach((e) => {
      e.onclick = () => {
        ((selectedMood = +e.dataset.mood),
          $$("#editMoodPicker button").forEach((e) => e.classList.remove("on")),
          e.classList.add("on"));
      };
    }),
    ($("#tagPicker").innerHTML = tags
      .map((e) => `<button class="chip" data-tag="${e}">${e}</button>`)
      .join("")),
    $$("#tagPicker button").forEach((e) => {
      e.onclick = () => {
        (e.classList.toggle("on"),
          (selectedTags = e.classList.contains("on")
            ? [...selectedTags, e.dataset.tag]
            : selectedTags.filter((t) => t !== e.dataset.tag)));
      };
    }));
  const e = getProfile();
  (($("#promptText").textContent = prompts[e.prompt % prompts.length]),
    ($("#nextPrompt").onclick = () => {
      ((e.prompt = (e.prompt + 1) % prompts.length),
        save(),
        ($("#promptText").textContent = prompts[e.prompt]));
    }),
    $$("#priorityPicker button").forEach((e) => {
      e.onclick = () => {
        ((priority = e.dataset.priority),
          $$("#priorityPicker button").forEach((e) => e.classList.remove("on")),
          e.classList.add("on"));
      };
    }),
    $$("#repeatPicker button").forEach((e) => {
      e.onclick = () => {
        ((repeat = e.dataset.repeat),
          $$("#repeatPicker button").forEach((e) => e.classList.remove("on")),
          e.classList.add("on"),
          toggleRepeatUntil());
      };
    }),
    ($("#categoryPicker").innerHTML = categories
      .map(
        (e) =>
          `<button type="button" class="chip" data-category="${e.id}">${e.emoji} ${e.label}</button>`,
      )
      .join("")),
    $$("#categoryPicker button").forEach((e) => {
      e.onclick = () => {
        ((category = e.dataset.category),
          $$("#categoryPicker button").forEach((e) => e.classList.remove("on")),
          e.classList.add("on"));
      };
    }),
    $$("#themePicker button").forEach((e) => {
      e.onclick = () => {
        ((settings.theme = e.dataset.theme),
          saveSettings(),
          applyTheme(),
          $$("#themePicker button").forEach((e) => e.classList.remove("on")),
          e.classList.add("on"));
      };
    }),
    $$("#themePicker button").forEach((e) =>
      e.classList.toggle("on", e.dataset.theme === settings.theme),
    ),
    $$("#fontPicker button").forEach((e) => {
      e.onclick = () => {
        ((settings.font = e.dataset.font),
          saveSettings(),
          applyTheme(),
          $$("#fontPicker button").forEach((e) => e.classList.remove("on")),
          e.classList.add("on"));
      };
    }),
    $$("#fontPicker button").forEach((e) =>
      e.classList.toggle("on", e.dataset.font === settings.font),
    ));
}
function bumpStreak() {
  const e = getProfile(),
    t = day();
  if (e.lastCheck === t) return;
  const o = new Date();
  (o.setDate(o.getDate() - 1),
    (e.streak = e.lastCheck === day(o) ? e.streak + 1 : 1),
    (e.lastCheck = t),
    save());
}
function buildAssigneePicker() {
  const e = $("#assigneePicker");
  if (!e) return;
  const t = window.family && window.family.members ? window.family.members : [],
    o = t.find((e) => e.isMe),
    n = [{ id: "", emoji: (o && o.emoji) || "🙂", name: "Me" }].concat(
      t
        .filter((e) => !e.isMe)
        .map((e) => ({ id: e.userId, emoji: e.emoji, name: e.name })),
    );
  ((e.innerHTML = n
    .map(
      (e) =>
        `<button type="button" class="chip ${(assignee || "") === e.id ? "on" : ""}" data-assignee="${safeDomId(e.id)}">${esc(e.emoji)} ${esc(e.name)}</button>`,
    )
    .join("")),
    $$("#assigneePicker button").forEach(
      (e) =>
        (e.onclick = () => {
          ((assignee = e.dataset.assignee || null),
            $$("#assigneePicker button").forEach((e) =>
              e.classList.remove("on"),
            ),
            e.classList.add("on"));
        }),
    ));
}
function openTask(e = null) {
  ((editing = e?.id || null),
    ($("#dialogTitle").textContent = e
      ? "✏️ Edit reminder"
      : "⏰ New reminder"),
    ($("#taskTitle").value = e?.title || ""),
    ($("#taskNote").value = e?.note || ""),
    (priority = e?.priority || "low"),
    (repeat = e?.repeat || "none"),
    (category = e?.category || "none"),
    (assignee = e?.assignee || null),
    buildAssigneePicker());
  const t = e?.due ? new Date(e.due) : new Date();
  (e?.due || t.setHours(t.getHours() + 1, 0, 0, 0),
    ($("#taskDate").value = day(t)),
    ($("#taskTime").value = t.toTimeString().slice(0, 5)),
    $$("#priorityPicker button").forEach((e) =>
      e.classList.toggle("on", e.dataset.priority === priority),
    ),
    $$("#repeatPicker button").forEach((e) =>
      e.classList.toggle("on", e.dataset.repeat === repeat),
    ),
    $$("#categoryPicker button").forEach((e) =>
      e.classList.toggle("on", e.dataset.category === category),
    ));
  const o = $("#taskRepeatUntil");
  (o && (o.value = e?.repeatUntil || ""),
    toggleRepeatUntil(),
    (editingSubtasks = e?.subtasks ? e.subtasks.map((e) => ({ ...e })) : []),
    renderSubtaskEdit(),
    $("#taskDialog").showModal());
}
function toggleRepeatUntil() {
  const e = $("#repeatUntilWrap");
  e && e.classList.toggle("hidden", "none" === repeat);
}
function renderSubtaskEdit() {
  const e = $("#subtaskList");
  e &&
    ((e.innerHTML = editingSubtasks
      .map(
        (e, t) =>
          `<div class="subtask-edit"><span>${esc(e.text)}</span><button type="button" class="photo-remove" data-rmsub="${t}" aria-label="Remove step">✕</button></div>`,
      )
      .join("")),
    $$("#subtaskList [data-rmsub]").forEach(
      (e) =>
        (e.onclick = () => {
          (editingSubtasks.splice(+e.dataset.rmsub, 1), renderSubtaskEdit());
        }),
    ));
}
function nextDue(e, t) {
  const o = new Date(e);
  if ("daily" === t) o.setDate(o.getDate() + 1);
  else if ("weekly" === t) o.setDate(o.getDate() + 7);
  else if ("monthly" === t) {
    const n = o.getDate();
    (o.setDate(1),
      o.setMonth(o.getMonth() + 1),
      o.setDate(
        Math.min(n, new Date(o.getFullYear(), o.getMonth() + 1, 0).getDate()),
      ));
  } else if ("yearly" === t) {
    const n = o.getDate();
    (o.setDate(1),
      o.setFullYear(o.getFullYear() + 1),
      o.setDate(
        Math.min(n, new Date(o.getFullYear(), o.getMonth() + 1, 0).getDate()),
      ));
  }
  return o.getTime();
}
function completeTask(e) {
  if (((e.done = !e.done), e.done)) {
    ((e.completed = Date.now()), bumpStreak(), confetti());
    const t = findTaskOwner(e.id),
      o = t ? t.profile : getProfile();
    if (e.repeat && "none" !== e.repeat && e.due) {
      const t = nextDue(e.due, e.repeat),
        n = e.repeatUntil
          ? new Date(e.repeatUntil + "T23:59:59").getTime()
          : null;
      (!n || t <= n) &&
        o.tasks.push({
          ...e,
          id: id(),
          done: !1,
          completed: null,
          due: t,
          notified: !1,
        });
    }
  }
  (save(), renderAll());
}
function delTask(e) {
  confirm(
    "🗑️",
    "Delete reminder?",
    "This cannot be undone.",
    () => {
      const t = findTaskOwner(e),
        o = t ? t.profile : getProfile();
      ((o.tasks = o.tasks.filter((t) => t.id !== e)),
        save(),
        renderAll(),
        toast("Deleted", ""));
    },
    () => {},
  );
}
function snooze(e, t = 10) {
  ((e.due = Date.now() + 6e4 * t), (e.notified = !1), save(), renderAll());
  toast(
    "😴 Snoozed",
    `Back in ${t >= 60 && t % 60 == 0 ? `${t / 60} hour${60 === t ? "" : "s"}` : `${t} minutes`}.`,
  );
}
function snoozeUntilTomorrow(e) {
  const t = new Date();
  (t.setDate(t.getDate() + 1),
    t.setHours(9, 0, 0, 0),
    (e.due = t.getTime()),
    (e.notified = !1),
    save(),
    renderAll(),
    toast("🌅 Snoozed to tomorrow", "Reminder set for 9:00 AM."));
}
function openSnooze(e) {
  e && ((snoozeTaskId = e.id), $("#snoozeDialog").showModal());
}
function fmt(e) {
  const t = new Date(e),
    o = new Date(),
    n = t.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (day(t) === day(o)) return n;
  const a = new Date();
  return (
    a.setDate(a.getDate() + 1),
    day(t) === day(a)
      ? "Tomorrow " + n
      : t.toLocaleDateString([], { month: "short", day: "numeric" }) + " " + n
  );
}
function assigneeBadge(e) {
  if (!e.assignee) return "";
  const t =
    window.family && window.family.members
      ? window.family.members.find((t) => t.userId === e.assignee)
      : null;
  return t
    ? `<span class="assignee-badge">${esc(t.emoji)} ${esc(t.name)}</span>`
    : "";
}
function taskHTML(e) {
  const t = e.due && !e.done && e.due < Date.now(),
    o = safeDomId(e.category, "none"),
    n = categories.find((e) => e.id === o) || categories[0],
    a = safeDomId(e.id),
    s = safeDomId(e.priority, "low");
  return `<article class="task ${s} ${e.done ? "done" : ""} ${o}">\n    <button class="check ${e.done ? "on" : ""}" data-done="${a}">${e.done ? "✓" : ""}</button>\n    <div class="task-body">\n      <div class="task-title"><span class="task-category">${n.emoji}</span>${esc(e.title)}</div>\n      <div class="meta">\n        ${e.due ? `<span class="${t ? "late" : ""}">${t ? "⚠️ " : "🕒 "}${fmt(e.due)}</span>` : ""}\n        ${e.repeat && "none" !== e.repeat ? `<span>🔁 ${esc(e.repeat)}${e.repeatUntil ? " · until " + new Date(e.repeatUntil + "T00:00:00").toLocaleDateString([], { month: "short", day: "numeric" }) : ""}</span>` : ""}\n        ${"high" === s ? "<span>🌸 Important</span>" : ""}\n        ${assigneeBadge(e)}\n        ${e.subtasks && e.subtasks.length ? `<span>☑️ ${e.subtasks.filter((e) => e.done).length}/${e.subtasks.length}</span>` : ""}\n      </div>\n      ${e.note ? `<div class="note">${esc(e.note)}</div>` : ""}\n      ${e.subtasks && e.subtasks.length ? `<div class="subtasks">${e.subtasks.map((t) => `<button type="button" class="subtask ${t.done ? "done" : ""}" data-subtask="${safeDomId(t.id)}" data-parent="${a}"><span class="subcheck">${t.done ? "✓" : ""}</span><span class="subtext">${esc(t.text)}</span></button>`).join("")}</div>` : ""}\n    </div>\n    <div class="actions">\n      ${t && !e.done ? `<button class="icon" data-snooze="${a}">😴</button>` : ""}\n      <button class="icon" data-edit="${a}">✏️</button>\n      <button class="icon" data-delete="${a}">🗑️</button>\n    </div>\n  </article>`;
}
function renderTasks() {
  const e = getProfile(),
    t =
      "everyone" === taskFilter
        ? db.profiles.flatMap((e) => e.tasks || [])
        : e.tasks;
  let o = t.filter((e) => !e.done);
  const n = t
    .filter((e) => e.done)
    .sort((e, t) => (t.completed || 0) - (e.completed || 0))
    .slice(0, 10);
  if ("today" === taskFilter) {
    const e = new Date();
    (e.setHours(23, 59, 59, 999),
      (o = o.filter((t) => t.due && t.due <= e.getTime())));
  } else
    "high" === taskFilter
      ? (o = o.filter((e) => "high" === e.priority))
      : "birthday" === taskFilter &&
        (o = o.filter((e) => "birthday" === e.category));
  const a = Date.now(),
    s = new Date();
  s.setHours(23, 59, 59, 999);
  const i = [
    ["⚠️ Overdue", o.filter((e) => e.due && e.due < a)],
    ["☀️ Today", o.filter((e) => e.due && e.due >= a && e.due <= s.getTime())],
    ["📅 Upcoming", o.filter((e) => e.due && e.due > s.getTime())],
    ["💫 Someday", o.filter((e) => !e.due)],
    ["✅ Recently done", n],
  ];
  let r = "";
  (i.forEach(([e, t]) => {
    (t.sort((e, t) => (e.due || 9e15) - (t.due || 9e15)),
      t.length &&
        (r +=
          `<div class="group">${e} · ${t.length}</div>` +
          t.map(taskHTML).join("")));
  }),
    ($("#taskList").innerHTML =
      r || empty("🌼", "No reminders yet", "Tap + to add one.")));
  const l = new Date();
  l.setHours(23, 59, 59, 999);
  const d = e.tasks
    .filter((e) => !e.done && e.due && e.due <= l.getTime())
    .sort((e, t) => (e.due || 0) - (t.due || 0));
  (($("#todayTasks").innerHTML = d.length
    ? d.map(taskHTML).join("")
    : empty(
        "✨",
        "Nothing due today",
        "Enjoy your day, or add something new.",
      )),
    bindTaskButtons());
}
function bindTaskButtons() {
  const e = (e) => {
    const t = findTaskOwner(e);
    return t ? t.task : null;
  };
  ($$("[data-done]").forEach(
    (t) =>
      (t.onclick = () => {
        const o = e(t.dataset.done);
        o && completeTask(o);
      }),
  ),
    $$("[data-delete]").forEach(
      (e) => (e.onclick = () => delTask(e.dataset.delete)),
    ),
    $$("[data-edit]").forEach(
      (t) =>
        (t.onclick = () => {
          const o = e(t.dataset.edit);
          o && openTask(o);
        }),
    ),
    $$("[data-snooze]").forEach(
      (t) =>
        (t.onclick = () => {
          const o = e(t.dataset.snooze);
          o && openSnooze(o);
        }),
    ),
    $$("[data-subtask]").forEach(
      (t) =>
        (t.onclick = () => {
          const o = e(t.dataset.parent),
            n =
              o && o.subtasks
                ? o.subtasks.find((e) => e.id === t.dataset.subtask)
                : null;
          n && ((n.done = !n.done), save(), renderAll());
        }),
    ));
}
function renderWeekAgenda() {
  const e = getProfile(),
    t = [];
  for (let e = 0; e < 7; e++) {
    const o = new Date();
    (o.setDate(o.getDate() + e), t.push(o));
  }
  let o = "";
  (t.forEach((t) => {
    const n = day(t),
      a = e.tasks.filter((e) => !e.done && e.due && day(new Date(e.due)) === n);
    if (0 === a.length && t > new Date(Date.now() + 1728e5)) return;
    const s = n === day();
    o += `<div class="week-day">\n      <div class="week-day-header">\n        <b>${s ? "☀️ Today" : t.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}</b>\n        <small>${a.length} ${1 === a.length ? "task" : "tasks"}</small>\n      </div>\n      <div class="week-day-tasks">${a.length ? a.map((e) => `<div class="week-task">${categories.find((t) => t.id === e.category)?.emoji || "📌"} ${esc(e.title)}</div>`).join("") : '<div class="week-task" style="opacity:0.5">Free day!</div>'}</div>\n    </div>`;
  }),
    ($("#weekAgenda").innerHTML = o));
}
function renderOnThisDay() {
  const e = getProfile(),
    t = new Date(),
    o = t.getMonth(),
    n = t.getDate(),
    a = e.entries.filter((e) => {
      const a = new Date(e.ts);
      return (
        a.getMonth() === o &&
        a.getDate() === n &&
        a.getFullYear() < t.getFullYear()
      );
    });
  0 !== a.length
    ? ($("#onThisDaySection").classList.remove("hidden"),
      ($("#onThisDayList").innerHTML = a
        .map((e) => {
          const t = new Date(e.ts),
            o = moods.find((t) => +t[0] === e.mood);
          return `<article class="entry">\n      <div class="entry-head">\n        <span class="face">${o ? o[1] : "📝"}</span>\n        <div><b>${t.getFullYear()}</b><br><small>${o ? o[2] : ""}</small></div>\n      </div>\n      ${e.text ? `<p class="entry-text">${esc(e.text)}</p>` : ""}\n      ${e.photos && e.photos.length ? `<div class="entry-photos">${e.photos.map((e, t) => `<img src="${safePhotoSrc(e)}" class="entry-photo" tabindex="0" alt="Memory photo ${t + 1}" />`).join("")}</div>` : ""}\n    </article>`;
        })
        .join("")))
    : $("#onThisDaySection").classList.add("hidden");
}
function renderCalendar() {
  const e = getProfile(),
    t = calendarDate.getFullYear(),
    o = calendarDate.getMonth();
  $("#calTitle").textContent = new Date(t, o).toLocaleDateString([], {
    month: "long",
    year: "numeric",
  });
  const n = new Date(t, o, 1).getDay(),
    a = new Date(t, o + 1, 0).getDate(),
    s = new Date(t, o, 0).getDate();
  let i = ["S", "M", "T", "W", "T", "F", "S"]
    .map((e) => `<div class="cal-day-label">${e}</div>`)
    .join("");
  for (let e = n - 1; e >= 0; e--)
    i += `<div class="cal-day other-month">${s - e}</div>`;
  for (let n = 1; n <= a; n++) {
    const a = new Date(t, o, n),
      s = day(a),
      r = s === day(),
      l = e.tasks.some((e) => e.due && day(new Date(e.due)) === s),
      d = e.entries.find(
        (e) => day(new Date(e.ts)) === s && e.photos && e.photos.length,
      ),
      c = d
        ? `<img class="cal-thumb" src="${safePhotoSrc(d.photos[0])}" alt="" />`
        : "";
    i += `<div class="cal-day ${r ? "today" : ""} ${l ? "has-tasks" : ""} ${c ? "has-photo" : ""}" data-date="${s}">${c}<span class="cal-num">${n}</span></div>`;
  }
  const r = 7 * Math.ceil((n + a) / 7);
  let l = 1;
  for (let e = n + a; e < r; e++)
    i += `<div class="cal-day other-month">${l++}</div>`;
  (($("#calGrid").innerHTML = i),
    $$(".cal-day[data-date]").forEach((t) => {
      t.onclick = () => {
        const o = t.dataset.date,
          n = e.tasks.filter((e) => e.due && day(new Date(e.due)) === o),
          a = e.entries.filter(
            (e) => day(new Date(e.ts)) === o && e.photos && e.photos.length,
          );
        if (0 === n.length && 0 === a.length)
          return void $("#calDayDetail").classList.add("hidden");
        let s = `<h3>${new Date(o).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}</h3>`;
        if (
          ((s += n.length
            ? n.map(taskHTML).join("")
            : '<p style="color:var(--soft);font-weight:700">No reminders this day.</p>'),
          a.length)
        ) {
          s += `<div class="cal-photos-head">📷 Memories</div><div class="entry-photos">${a
            .flatMap((e) => e.photos)
            .map(
              (e, t) =>
                `<img src="${safePhotoSrc(e)}" class="entry-photo" tabindex="0" alt="Memory ${t + 1}" />`,
            )
            .join("")}</div>`;
        }
        ($("#calDayDetail").classList.remove("hidden"),
          ($("#calDayDetail").innerHTML = s),
          bindTaskButtons());
      };
    }));
}
function empty(e, t, o) {
  return `<div class="empty"><div style="font-size:42px">${e}</div><b>${t}</b><p>${o}</p></div>`;
}
function renderPhotoPreview() {
  $("#photoPreview").innerHTML = selectedPhotos
    .map((e, t) => `<img src="${safePhotoSrc(e)}" alt="Photo ${t + 1}" />`)
    .join("");
}
function renderEntries() {
  const e = getProfile(),
    t = $("#searchEntries").value.toLowerCase(),
    o = [...new Set(e.entries.flatMap((e) => e.tags || []))],
    n = $("#entryTagFilter");
  n &&
    ((n.innerHTML = o.length
      ? o
          .map(
            (e) =>
              `<button class="chip-filter ${entryTagFilterValue === e ? "active" : ""}" data-etag="${esc(e)}">${esc(e)}</button>`,
          )
          .join("")
      : ""),
    $$("#entryTagFilter [data-etag]").forEach(
      (e) =>
        (e.onclick = () => {
          ((entryTagFilterValue =
            entryTagFilterValue === e.dataset.etag ? null : e.dataset.etag),
            renderEntries());
        }),
    ));
  const a = e.entries.filter((e) => {
    const o =
        (e.text || "").toLowerCase().includes(t) ||
        (e.tags || []).join(" ").toLowerCase().includes(t),
      n = !entryTagFilterValue || (e.tags || []).includes(entryTagFilterValue);
    return o && n;
  });
  (($("#entries").innerHTML = a.length
    ? a
        .map((e) => {
          const t = moods.find((t) => +t[0] === e.mood),
            o = new Date(e.ts);
          return `<article class="entry">\n        <div class="entry-head">\n          <span class="face">${t ? t[1] : "📝"}</span>\n          <div><b>${o.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}</b><br><small>${o.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}${t ? " · " + t[2] : ""}</small></div>\n          <button class="icon" data-edit-entry="${safeDomId(e.id)}">✏️</button>\n          <button class="icon" data-delete-entry="${safeDomId(e.id)}">🗑️</button>\n        </div>\n        ${e.text ? `<p class="entry-text">${esc(e.text)}</p>` : ""}\n        ${e.photos && e.photos.length ? `<div class="entry-photos">${e.photos.map((e, t) => `<img src="${safePhotoSrc(e)}" class="entry-photo" tabindex="0" alt="Journal photo ${t + 1}" />`).join("")}</div>` : ""}\n        <div class="tags">${(e.tags || []).map((e) => `<span>${esc(e)}</span>`).join("")}</div>\n      </article>`;
        })
        .join("")
    : empty("📖", "Your journal awaits", "Write your first entry above.")),
    $$("[data-delete-entry]").forEach((t) => {
      t.onclick = () => {
        confirm(
          "🗑️",
          "Delete entry?",
          "This cannot be undone.",
          () => {
            ((e.entries = e.entries.filter(
              (e) => e.id !== t.dataset.deleteEntry,
            )),
              save(),
              renderEntries(),
              toast("Deleted", ""));
          },
          () => {},
        );
      };
    }),
    $$("[data-edit-entry]").forEach((t) => {
      t.onclick = () => {
        const o = e.entries.find((e) => e.id === t.dataset.editEntry);
        o &&
          ((editingEntry = o.id),
          (selectedMood = o.mood || null),
          ($("#editEntryText").value = o.text || ""),
          (editingPhotos = [...(o.photos || [])]),
          renderEditPhotos(),
          $$("#editMoodPicker button").forEach((e) =>
            e.classList.toggle("on", +e.dataset.mood === selectedMood),
          ),
          $("#editEntryDialog").showModal());
      };
    }));
}
($("#updateReloadBtn")?.addEventListener("click", () => {
  swRegistration && swRegistration.waiting
    ? (swRegistration.waiting.postMessage({ type: "SKIP_WAITING" }),
      setTimeout(() => window.location.reload(), 1500))
    : window.location.replace(
        window.location.pathname + "?v=" + Date.now() + window.location.hash,
      );
}),
  $("#updateDismissBtn")?.addEventListener("click", () => {
    $("#updateBanner")?.classList.add("hidden");
  }),
  ($("#startBtn").onclick = () => {
    const e = $("#nameInput").value.trim() || "friend";
    ((db.profiles[0].name = e),
      (db.onboarded = !0),
      save(),
      showApp(),
      db.tourDone || setTimeout(startTour, 400));
  }),
  $$("[data-tab]").forEach((e) => (e.onclick = () => go(e.dataset.tab))),
  ($("#notifyBtn").onclick = () => enableNotifications()),
  $("#addSubtaskBtn")?.addEventListener("click", () => {
    const e = $("#subtaskInput"),
      t = (e.value || "").trim();
    t &&
      (editingSubtasks.push({ id: id(), text: t, done: !1 }),
      (e.value = ""),
      renderSubtaskEdit(),
      e.focus());
  }),
  $("#subtaskInput")?.addEventListener("keydown", (e) => {
    "Enter" === e.key && (e.preventDefault(), $("#addSubtaskBtn").click());
  }),
  $$("[data-open-task]").forEach((e) => (e.onclick = () => openTask())),
  ($("#saveTaskBtn").onclick = () => {
    const e = $("#taskTitle").value.trim();
    if (!e) return;
    const t = $("#taskDate").value || day(),
      o = $("#taskTime").value || "09:00",
      n = new Date(t + "T" + o).getTime(),
      a = getProfile(),
      s = ("none" !== repeat && $("#taskRepeatUntil").value) || null,
      i = {
        title: e,
        due: n,
        note: $("#taskNote").value.trim(),
        priority: priority,
        repeat: repeat,
        repeatUntil: s,
        category: category,
        assignee: assignee,
        subtasks: editingSubtasks.map((e) => ({ ...e })),
        notified: !1,
      };
    if (
      !editing &&
      assignee &&
      window.family &&
      (window.family.members || []).some(
        (e) => e.userId === assignee && !e.isMe,
      ) &&
      "function" == typeof assignTaskToMember
    )
      return ($("#taskDialog").close(), void assignTaskToMember(assignee, i));
    if (editing) {
      const e = findTaskOwner(editing);
      e && Object.assign(e.task, i);
    } else a.tasks.push({ id: id(), done: !1, created: Date.now(), ...i });
    (save(),
      $("#taskDialog").close(),
      renderAll(),
      toast(
        "✅ Reminder saved",
        n ? "Daysie will nudge you on time." : "Added to your list.",
      ));
  }),
  ($("#cancelTaskBtn").onclick = () => $("#taskDialog").close()),
  ($("#closeTaskTop").onclick = () => $("#taskDialog").close()),
  $$("#snoozeDialog [data-snooze-min]").forEach(
    (e) =>
      (e.onclick = () => {
        const t = findTaskOwner(snoozeTaskId),
          o = t ? t.task : null;
        ($("#snoozeDialog").close(), o && snooze(o, +e.dataset.snoozeMin));
      }),
  ),
  $("#snoozeDialog [data-snooze-tomorrow]")?.addEventListener("click", () => {
    const e = findTaskOwner(snoozeTaskId),
      t = e ? e.task : null;
    ($("#snoozeDialog").close(), t && snoozeUntilTomorrow(t));
  }),
  $("#closeSnoozeTop")?.addEventListener("click", () =>
    $("#snoozeDialog").close(),
  ),
  $$(".chip-filter").forEach((e) => {
    e.onclick = () => {
      ((taskFilter = e.dataset.filter),
        $$(".chip-filter").forEach((e) => e.classList.remove("active")),
        e.classList.add("active"),
        renderTasks());
    };
  }),
  ($("#calPrev").onclick = () => {
    (calendarDate.setMonth(calendarDate.getMonth() - 1), renderCalendar());
  }),
  ($("#calNext").onclick = () => {
    (calendarDate.setMonth(calendarDate.getMonth() + 1), renderCalendar());
  }),
  ($("#photoInput").onchange = (e) => {
    Array.from(e.target.files || []).forEach((e) => {
      const t = new FileReader();
      ((t.onload = (e) => {
        (selectedPhotos.push(e.target.result), renderPhotoPreview());
      }),
        t.readAsDataURL(e));
    });
  }),
  ($("#saveEntry").onclick = async () => {
    const e = $("#journalText").value.trim();
    if (!e && !selectedMood && 0 === selectedPhotos.length)
      return toast(
        "📝 Add a little something",
        "Pick a mood, write, or add a photo.",
      );
    const t = getProfile();
    let o = [...selectedPhotos];
    (settings.authToken &&
      o.some((e) => String(e).startsWith("data:")) &&
      (toast("☁️ Saving photos…", "Uploading to your cloud."),
      (o = await uploadPhotosToR2(o))),
      t.entries.unshift({
        id: id(),
        text: e,
        mood: selectedMood,
        tags: [...new Set(selectedTags)],
        prompt: prompts[t.prompt],
        photos: o,
        ts: Date.now(),
      }),
      bumpStreak(),
      save(),
      ($("#journalText").value = ""),
      ($("#photoInput").value = ""),
      (selectedMood = null),
      (selectedTags = []),
      (selectedPhotos = []),
      $$("#moodPicker button, #tagPicker button").forEach((e) =>
        e.classList.remove("on"),
      ),
      ($("#photoPreview").innerHTML = ""),
      renderAll(),
      confetti(),
      toast("💛 Entry saved", "Thanks for checking in today."));
  }),
  ($("#searchEntries").oninput = renderEntries));
let lightboxItems = [],
  lightboxIndex = 0;
function openLightbox(e, t) {
  ((lightboxItems = e),
    (lightboxIndex = t),
    renderLightbox(),
    $("#lightbox").classList.remove("hidden"),
    (document.body.style.overflow = "hidden"));
}
function renderLightbox() {
  if (!lightboxItems.length) return;
  $("#lightboxImg").src = lightboxItems[lightboxIndex];
  const e = lightboxItems.length > 1;
  ($("#lightboxPrev").classList.toggle("hidden", !e),
    $("#lightboxNext").classList.toggle("hidden", !e),
    ($("#lightboxCount").textContent = e
      ? `${lightboxIndex + 1} / ${lightboxItems.length}`
      : ""));
}
function closeLightbox() {
  ($("#lightbox").classList.add("hidden"),
    ($("#lightboxImg").src = ""),
    (document.body.style.overflow = ""));
}
function lightboxStep(e) {
  lightboxItems.length &&
    ((lightboxIndex =
      (lightboxIndex + e + lightboxItems.length) % lightboxItems.length),
    renderLightbox());
}
async function shareLightboxPhoto() {
  const e = lightboxItems[lightboxIndex];
  if (e)
    try {
      const t = await (await fetch(e)).blob(),
        o = (t.type && t.type.split("/")[1]) || "png",
        n = new File([t], `daysie-photo-${Date.now()}.${o}`, {
          type: t.type || "image/png",
        });
      if (navigator.canShare && navigator.canShare({ files: [n] }))
        return void (await navigator.share({
          files: [n],
          title: "Daysie photo",
        }));
      const a = document.createElement("a");
      ((a.href = URL.createObjectURL(t)),
        (a.download = n.name),
        a.click(),
        setTimeout(() => URL.revokeObjectURL(a.href), 1e3),
        toast("⬇️ Photo saved", ""));
    } catch (e) {
      toast("❌ Could not share photo", "Please try again.");
    }
}
(document.addEventListener("click", (e) => {
  const t = e.target.closest && e.target.closest(".entry-photo");
  if (!t) return;
  const o = t.closest(".entry-photos");
  if (!o) return;
  const n = [...o.querySelectorAll("img")];
  openLightbox(
    n.map((e) => e.src),
    n.indexOf(t),
  );
}),
  document.addEventListener("keydown", (e) => {
    if ("Enter" !== e.key && " " !== e.key) return;
    const t = e.target.closest && e.target.closest(".entry-photo");
    if (!t) return;
    const o = t.closest(".entry-photos");
    if (!o) return;
    e.preventDefault();
    const n = [...o.querySelectorAll("img")];
    openLightbox(
      n.map((e) => e.src),
      n.indexOf(t),
    );
  }),
  $("#lightboxShare")?.addEventListener("click", (e) => {
    (e.stopPropagation(), shareLightboxPhoto());
  }),
  ($("#lightboxClose").onclick = closeLightbox),
  ($("#lightboxPrev").onclick = (e) => {
    (e.stopPropagation(), lightboxStep(-1));
  }),
  ($("#lightboxNext").onclick = (e) => {
    (e.stopPropagation(), lightboxStep(1));
  }),
  $("#lightbox").addEventListener("click", (e) => {
    "lightbox" === e.target.id && closeLightbox();
  }),
  document.addEventListener("keydown", (e) => {
    $("#lightbox").classList.contains("hidden") ||
      ("Escape" === e.key
        ? closeLightbox()
        : "ArrowLeft" === e.key
          ? lightboxStep(-1)
          : "ArrowRight" === e.key && lightboxStep(1));
  }));
let lbTouchX = null;
function renderEditPhotos() {
  const e = $("#editPhotos");
  e &&
    ((e.innerHTML = editingPhotos
      .map(
        (e, t) =>
          `<div class="edit-photo-wrap"><img src="${safePhotoSrc(e)}" alt="Photo ${t + 1}" /><button type="button" class="photo-remove" data-rmphoto="${t}" aria-label="Remove photo">✕</button></div>`,
      )
      .join("")),
    $$("#editPhotos [data-rmphoto]").forEach(
      (e) =>
        (e.onclick = () => {
          (editingPhotos.splice(+e.dataset.rmphoto, 1), renderEditPhotos());
        }),
    ));
}
function renderMoodTrend() {
  const e = $("#moodTrend");
  if (!e) return;
  const t = getProfile(),
    o = [];
  for (let e = 29; e >= 0; e--) {
    const t = new Date();
    (t.setDate(t.getDate() - e), o.push(t));
  }
  const n = {
    1: "#ff8c9a",
    2: "#ffa279",
    3: "#ffcd57",
    4: "#9bd385",
    5: "#7fc989",
  };
  e.innerHTML = o
    .map((e) => {
      const o = t.entries.filter(
          (t) => day(new Date(t.ts)) === day(e) && t.mood,
        ),
        a = o.length ? o.reduce((e, t) => e + t.mood, 0) / o.length : 0,
        s = a ? n[Math.round(a)] : "var(--line)",
        i = a ? (a / 5) * 100 : 8,
        r = e.toLocaleDateString([], { month: "short", day: "numeric" }),
        l = 1 === e.getDate() || e.getDate() % 7 == 0 ? e.getDate() : "";
      return `<div class="trend-col" title="${r}${a ? " · " + a.toFixed(1) : ""}"><i style="height:${i}%;background:${s}"></i><small>${l}</small></div>`;
    })
    .join("");
}
function renderInsights() {
  const e = getProfile(),
    t = e.tasks.filter((e) => e.done).length;
  $("#stats").innerHTML = [
    ["🔥", e.streak, "Day streak"],
    ["✅", t, "Tasks done"],
    ["📖", e.entries.length, "Entries"],
    ["📋", e.tasks.filter((e) => !e.done).length, "To do"],
  ]
    .map(
      (e) =>
        `<div class="stat"><div>${e[0]}</div><b>${e[1]}</b><span>${e[2]}</span></div>`,
    )
    .join("");
  let o = [];
  for (let e = 6; e >= 0; e--) {
    let t = new Date();
    (t.setDate(t.getDate() - e), o.push(t));
  }
  (($("#moodBars").innerHTML = o
    .map((t) => {
      let o = e.entries.filter((e) => day(new Date(e.ts)) === day(t) && e.mood),
        n = o.length ? o.reduce((e, t) => e + t.mood, 0) / o.length : 0,
        a = moods.find((e) => +e[0] === Math.round(n));
      return `<div class="bar"><span>${a ? a[1] : "·"}</span><i style="height:${n ? (n / 5) * 100 : 4}%"></i><small>${t.toLocaleDateString([], { weekday: "short" }).slice(0, 1)}</small></div>`;
    })
    .join("")),
    renderMoodTrend());
  const n = [
    ["🌱", "First step", "Add your first reminder", e.tasks.length >= 1],
    ["✅", "Getting things done", "Complete 5 tasks", t >= 5],
    ["✍️", "Dear diary", "Write 3 entries", e.entries.length >= 3],
    ["🔥", "On a roll", "Reach a 3-day streak", e.streak >= 3],
    ["🌟", "Bright week", "Reach a 7-day streak", e.streak >= 7],
  ];
  (($("#badges").innerHTML = n
    .map(
      (e) =>
        `<div class="badge ${e[3] ? "" : "locked"}"><b>${e[0]}</b><div><strong>${e[1]}</strong><br><small>${e[2]}</small></div></div>`,
    )
    .join("")),
    renderHabitInsights());
}
function renderAll() {
  (renderTasks(),
    renderEntries(),
    renderInsights(),
    renderWeekAgenda(),
    renderOnThisDay(),
    renderHabits(),
    renderLists());
  const e = getProfile();
  (($("#streakNum").textContent = e.streak),
    ($("#streakText").textContent =
      e.lastCheck === day()
        ? "You showed up today — amazing!"
        : "Finish a task or journal to keep it glowing."));
}
function startClock() {
  (clearInterval(timer),
    checkReminders(),
    (timer = setInterval(checkReminders, 15e3)));
}
function checkReminders() {
  const e = getProfile(),
    t = Date.now();
  let o = !1;
  (e.tasks.forEach((e) => {
    !e.done &&
      e.due &&
      e.due <= t &&
      !e.notified &&
      ((e.notified = !0), (o = !0), notify(e));
  }),
    o && save());
}
function notify(e) {
  (beep(),
    toast("⏰ " + e.title, e.note || "Reminder time!"),
    "visible" !== document.visibilityState &&
      "Notification" in window &&
      "granted" === Notification.permission &&
      new Notification("⏰ " + e.title, {
        body: e.note || "Reminder time!",
        tag: e.id,
        requireInteraction: "high" === e.priority,
      }));
}
function startRenag() {
  (clearInterval(renagTimer),
    (renagTimer = setInterval(() => {
      const e = getProfile(),
        t = Date.now();
      e.tasks.forEach((e) => {
        if (
          !e.done &&
          "high" === e.priority &&
          e.due &&
          e.due < t - 3e5 &&
          e.notified
        ) {
          const o = Math.floor((t - e.due) / 6e4);
          o % 5 == 0 &&
            (beep(),
            toast("⚠️ Still pending: " + e.title, `${o} minutes overdue`),
            "visible" !== document.visibilityState &&
              "Notification" in window &&
              "granted" === Notification.permission &&
              new Notification("⚠️ Important: " + e.title, {
                body: `Still pending (${o} min overdue)`,
                tag: e.id + "-renag",
                requireInteraction: !0,
              }));
        }
      });
    }, 6e4)));
}
let audioCtx = null;
function beep() {
  try {
    (audioCtx ||
      (audioCtx = new (window.AudioContext || window.webkitAudioContext)()),
      "suspended" === audioCtx.state && audioCtx.resume());
    let e = audioCtx;
    [660, 880, 660].forEach((t, o) => {
      let n = e.createOscillator(),
        a = e.createGain();
      ((n.frequency.value = t), n.connect(a), a.connect(e.destination));
      let s = e.currentTime + 0.15 * o;
      (a.gain.setValueAtTime(0.001, s),
        a.gain.exponentialRampToValueAtTime(0.15, s + 0.03),
        a.gain.exponentialRampToValueAtTime(0.001, s + 0.13),
        n.start(s),
        n.stop(s + 0.14));
    });
  } catch (e) {}
}
function confetti() {
  for (let e = 0; e < 28; e++) {
    let t = document.createElement("i");
    ((t.textContent = ["🌼", "✨", "💛", "🌿"][e % 4]),
      (t.style.cssText = `position:fixed;z-index:98;left:${50 + 20 * Math.random() - 10}%;top:38%;font-style:normal;font-size:${18 + 12 * Math.random()}px;transition:1s ease;pointer-events:none`),
      document.body.append(t),
      requestAnimationFrame(() => {
        ((t.style.transform = `translate(${420 * (Math.random() - 0.5)}px,${120 + 260 * Math.random()}px) rotate(${360 * Math.random()}deg)`),
          (t.style.opacity = 0));
      }),
      setTimeout(() => t.remove(), 1100));
  }
}
($("#lightbox").addEventListener(
  "touchstart",
  (e) => {
    lbTouchX = e.touches[0].clientX;
  },
  { passive: !0 },
),
  $("#lightbox").addEventListener("touchend", (e) => {
    if (null === lbTouchX) return;
    const t = e.changedTouches[0].clientX - lbTouchX;
    (Math.abs(t) > 50 && lightboxStep(t < 0 ? 1 : -1), (lbTouchX = null));
  }),
  ($("#saveEditEntry").onclick = async () => {
    const e = getProfile().entries.find((e) => e.id === editingEntry);
    if (!e) return;
    ((e.text = $("#editEntryText").value.trim()), (e.mood = selectedMood));
    let t = [...editingPhotos];
    (settings.authToken &&
      t.some((e) => String(e).startsWith("data:")) &&
      (toast("☁️ Saving photos…", "Uploading to your cloud."),
      (t = await uploadPhotosToR2(t))),
      (e.photos = t),
      save(),
      $("#editEntryDialog").close(),
      renderEntries(),
      toast("✏️ Entry updated", ""));
  }),
  ($("#cancelEditEntry").onclick = () => $("#editEntryDialog").close()),
  ($("#exportBtn").onclick = () => {
    const e = document.createElement("a");
    ((e.href = URL.createObjectURL(
      new Blob([JSON.stringify(db, null, 2)], { type: "application/json" }),
    )),
      (e.download = "daysie-backup-" + day() + ".json"),
      e.click());
  }),
  ($("#importBtn").onclick = () => $("#importFile").click()),
  ($("#importFile").onchange = async (e) => {
    const t = e.target.files && e.target.files[0];
    if (!t) return;
    try {
      const e = normalizeImport(JSON.parse(await t.text()));
      confirm(
        "⬆️",
        "Import this backup?",
        "This replaces the data on this device. Your current cloud account stays connected.",
        () => {
          ((db = e),
            (activeProfileId = db.profiles[0].id),
            saveActiveProfile(),
            save(),
            renderAll(),
            "function" == typeof clearFamilyLocal && clearFamilyLocal(),
            "function" == typeof familyBoot && familyBoot(),
            toast(
              "✅ Backup imported",
              "Daysie has refreshed your local data.",
            ));
        },
        () => {},
      );
    } catch (e) {
      toast("❌ Import failed", "Choose a valid Daysie JSON backup.");
    } finally {
      e.target.value = "";
    }
  }),
  ($("#exportPdfBtn").onclick = async () => {
    toast("📄 Generating PDF...", "This may take a moment.");
    try {
      const e = getProfile();
      let t =
        '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Daysie Journal</title><style>body{font-family:sans-serif;margin:40px;line-height:1.6}h1{color:#f3ad32}h2{margin-top:30px;border-bottom:2px solid #efe3d7;padding-bottom:5px}.entry{margin:20px 0;padding:15px;border-left:4px solid #ad97e8;background:#fff7ed}.meta{color:#716c80;font-size:0.9em;margin-bottom:10px}.photos{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}.photos img{max-width:220px;max-height:220px;border-radius:8px;border:1px solid #efe3d7}</style></head><body>';
      ((t += `<h1>🌼 Daysie Journal - ${esc(e.name)}</h1>`),
        (t += `<p><strong>Exported:</strong> ${new Date().toLocaleDateString()}</p>`),
        (t += `<h2>📖 Journal Entries (${e.entries.length})</h2>`),
        e.entries.slice(0, 100).forEach((e) => {
          const o = new Date(e.ts),
            n = moods.find((t) => +t[0] === e.mood),
            a =
              e.photos && e.photos.length
                ? `<div class="photos">${e.photos.map((e) => `<img src="${safePhotoSrc(e)}" />`).join("")}</div>`
                : "";
          t += `<div class="entry"><div class="meta">${o.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" })} at ${o.toLocaleTimeString()} ${n ? "· " + n[1] + " " + n[2] : ""}</div>${e.text ? `<p>${esc(e.text)}</p>` : ""}${a}</div>`;
        }),
        (t += "</body></html>"));
      const o = new Blob([t], { type: "text/html" }),
        n = URL.createObjectURL(o),
        a = document.createElement("a");
      ((a.href = n),
        (a.download = `daysie-journal-${day()}.html`),
        a.click(),
        toast("✅ Exported!", "Open the HTML file and print to PDF."));
    } catch (e) {
      toast("❌ Export failed", "Please try again.");
    }
  }));
let newProfileColor = "sun",
  newProfileEmoji = "🌼";
(($("#settingsBtn").onclick = () => {
  (updateAccountUI(), $("#settingsDialog").showModal());
}),
  ($("#closeSettings").onclick = () => $("#settingsDialog").close()),
  ($("#closeSettingsTop").onclick = () => $("#settingsDialog").close()));
const API = "https://daysie-api.neil27.workers.dev";
let pairPoll = null,
  statusPoll = null;
function stopPairPolling() {
  pairPoll && (clearInterval(pairPoll), (pairPoll = null));
}
function stopStatusPolling() {
  statusPoll && (clearInterval(statusPoll), (statusPoll = null));
}
function updateSyncStatus() {
  settings.authToken
    ? ($("#syncStatus").classList.remove("hidden"),
      ($("#syncStatus").textContent =
        !navigator.onLine || settings.syncPending
          ? "☁️ Changes waiting"
          : settings.syncState === "syncing"
            ? "☁️ Syncing…"
            : settings.syncState === "conflict"
              ? "⚠️ Choose sync version"
              : "☁️ Synced"))
    : $("#syncStatus").classList.add("hidden");
}
function updateAccountUI() {
  settings.authToken
    ? ($("#loggedOutSection").classList.add("hidden"),
      $("#loggedInSection").classList.remove("hidden"),
      $("#accountEmail") &&
        ($("#accountEmail").textContent = [
          settings.authUsername ? `@${settings.authUsername}` : "",
          settings.authEmail || "",
        ]
          .filter(Boolean)
          .join(" · "),
        $("#accountEmail").classList.toggle(
          "hidden",
          !settings.authEmail && !settings.authUsername,
        )),
      $("#deviceUserId") &&
        ($("#deviceUserId").textContent = settings.userId
          ? "Account: " + settings.userId.slice(0, 8) + "…"
          : "Account connected"),
      refreshAccountDetails())
    : ($("#loggedOutSection").classList.remove("hidden"),
      $("#loggedInSection").classList.add("hidden"),
      $("#enterCodeSection")?.classList.add("hidden"),
      $("#linkCodeSection")?.classList.add("hidden"));
}
async function refreshAccountDetails() {
  if (!settings.authToken) return;
  const e = $("#sessionStatus"),
    t = $("#photoStorageStatus"),
    o = { Authorization: `Bearer ${settings.authToken}` };
  e && (e.textContent = "Checking linked devices…");
  t && (t.textContent = "Checking cloud photos…");
  try {
    const t = await fetch(
      settings.authProvider === "better-auth"
        ? `${API}/api/auth/list-sessions`
        : `${API}/sessions`,
      { headers: o },
    );
    if (t.ok && e) {
      const o = await t.json(),
        n = Array.isArray(o) ? o : o.sessions || [],
        a = n.length,
        s = n.find((e) => e.current);
      e.textContent = `${a} signed-in device${1 === a ? "" : "s"}${s && s.expires ? " · this one ends " + new Date(s.expires).toLocaleDateString() : ""}`;
    }
  } catch (t) {
    e && (e.textContent = "Could not check linked devices");
  }
  try {
    const e = await fetch(`${API}/photos`, { headers: o });
    if (e.ok && t) {
      const o = await e.json(),
        n = (o.photos || []).length;
      t.textContent = `${n} cloud photo${1 === n ? "" : "s"} stored`;
    }
  } catch (e) {
    t && (t.textContent = "Could not check cloud photos");
  }
}
function normalizeImport(e) {
  if (!e || !Array.isArray(e.profiles) || !e.profiles.length)
    throw new Error("Backup is missing profiles");
  const t = e.profiles.map((e, t) => ({
    id: safeDomId(e.id, `profile-${t + 1}`) || `profile-${t + 1}`,
    name: String(e.name || "Me").slice(0, 48),
    emoji: String(e.emoji || "🌼").slice(0, 8),
    color: safeDomId(e.color, "sun"),
    tasks: Array.isArray(e.tasks) ? e.tasks : [],
    entries: Array.isArray(e.entries) ? e.entries : [],
    streak: Number.isFinite(+e.streak) ? +e.streak : 0,
    lastCheck: String(e.lastCheck || ""),
    prompt: Number.isFinite(+e.prompt) ? +e.prompt : 0,
    habits: Array.isArray(e.habits) ? e.habits : [],
  }));
  return {
    profiles: t,
    onboarded: !0,
    lists: Array.isArray(e.lists) ? e.lists : [],
    tourDone: !!e.tourDone,
  };
}
function stripPhotosForSync(e) {
  return (e || []).map((e) => ({
    ...e,
    entries: (e.entries || []).map((e) => {
      if (!e.photos || !e.photos.length) return e;
      const t = e.photos.filter((e) => !String(e).startsWith("data:"));
      return t.length === e.photos.length ? e : { ...e, photos: t };
    }),
  }));
}
function mergeLocalPhotos(e) {
  const t = {};
  return (
    (db.profiles || []).forEach((e) => {
      const o = {};
      ((e.entries || []).forEach((e) => {
        const t = (e.photos || []).filter((e) => String(e).startsWith("data:"));
        t.length && (o[e.id] = t);
      }),
        (t[e.id] = o));
    }),
    (e || []).forEach((e) => {
      const o = t[e.id] || {};
      (e.entries || []).forEach((e) => {
        const t = (e.photos || []).filter(
            (e) => !String(e).startsWith("data:"),
          ),
          n = o[e.id] || [];
        n.length && (e.photos = [...t, ...n]);
      });
    }),
    e
  );
}
async function uploadPhotosToR2(e) {
  if (!e || !e.length) return e || [];
  if (!settings.authToken) return e;
  const t = [];
  for (const o of e)
    if (String(o).startsWith("data:"))
      try {
        const e = await (await fetch(o)).blob(),
          n = await fetch(`${API}/photo`, {
            method: "POST",
            headers: {
              "Content-Type": e.type || "image/jpeg",
              Authorization: `Bearer ${settings.authToken}`,
            },
            body: e,
          });
        if (n.ok) {
          const e = await n.json();
          t.push(
            `${API}/photo/${encodeURIComponent(e.key)}${e.token ? `?token=${encodeURIComponent(e.token)}` : ""}`,
          );
        } else t.push(o);
      } catch (e) {
        t.push(o);
      }
    else t.push(o);
  return t;
}
let cloudSyncTimer = null,
  cloudSyncActive = false,
  cloudSyncAgain = false;
function scheduleCloudSync() {
  settings.syncPending = true;
  updateSyncStatus();
  saveSettings();
  clearTimeout(cloudSyncTimer);
  cloudSyncTimer = setTimeout(() => syncToCloud(), 650);
}
async function syncToCloud(force = false) {
  if (!settings.authToken) return;
  if (!navigator.onLine) {
    settings.syncPending = true;
    settings.syncState = "offline";
    saveSettings();
    return updateSyncStatus();
  }
  if (cloudSyncActive) {
    cloudSyncAgain = true;
    return;
  }
  cloudSyncActive = true;
  settings.syncState = "syncing";
  updateSyncStatus();
  try {
      const response = await fetch("https://daysie-api.neil27.workers.dev/data", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${settings.authToken}`,
        },
        body: JSON.stringify({
          profiles: stripPhotosForSync(db.profiles),
          lists: db.lists || [],
          tourDone: !!db.tourDone,
          _baseRevision: Number(settings.syncRevision || 0),
          _force: force,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (response.status === 409 && result.conflict) {
        settings.syncState = "conflict";
        settings.syncPending = true;
        saveSettings();
        updateSyncStatus();
        const keepDevice = confirm("Daysie found newer changes from another device. Choose OK to keep this device's version, or Cancel to use the cloud version.");
        if (keepDevice) {
          settings.syncRevision = result.revision;
          saveSettings();
          setTimeout(() => syncToCloud(true), 0);
          return;
        }
        applyCloudPayload({ ...result.cloud, _sync: { revision: result.revision, updatedAt: result.updatedAt } });
        return;
      }
      if (!response.ok) throw new Error(result.error || "Sync failed");
      settings.syncRevision = Number(result.revision || settings.syncRevision || 0);
      settings.syncPending = false;
      settings.syncState = "idle";
      saveSettings();
    } catch (error) {
      settings.syncPending = true;
      settings.syncState = "offline";
      saveSettings();
      console.error("Sync error:", error);
    } finally {
      cloudSyncActive = false;
      updateSyncStatus();
      if (cloudSyncAgain) {
        cloudSyncAgain = false;
        scheduleCloudSync();
      }
    }
}
function applyCloudPayload(payload) {
  if (!payload) return;
  if (!payload.lists || (window.family && window.family.familyId)) {
    // Family lists are synced by the family endpoint.
  } else db.lists = payload.lists;
  if (typeof payload.tourDone === "boolean") db.tourDone = db.tourDone || payload.tourDone;
  if (payload.profiles?.length) {
    db.profiles = mergeLocalPhotos(payload.profiles);
    db.profiles.forEach((profile) => { if (!Array.isArray(profile.habits)) profile.habits = []; });
    collapseProfiles();
  }
  settings.syncRevision = Number(payload._sync?.revision || 0);
  settings.syncPending = false;
  settings.syncState = "idle";
  localStorage.setItem(KEY, JSON.stringify(db));
  saveSettings();
  renderAll();
  updateSyncStatus();
}
async function pullFromCloud() {
  if (settings.authToken)
    try {
      const e = await fetch("https://daysie-api.neil27.workers.dev/data", {
        headers: { Authorization: `Bearer ${settings.authToken}` },
      });
      if (e.ok) {
        const t = await e.json();
        applyCloudPayload(t);
      }
    } catch (e) {
      console.error("Pull error:", e);
    }
}
window.addEventListener("online", () => settings.authToken && settings.syncPending && syncToCloud());
window.addEventListener("offline", () => { if (settings.authToken) { settings.syncState = "offline"; updateSyncStatus(); } });
($("#enableSyncBtn") && ($("#enableSyncBtn").onclick = async () => {
  toast("☁️ Turning on sync...", "");
  (await ensureAccount())
    ? (updateAccountUI(),
      updateSyncStatus(),
      toast("🎉 Sync is on!", "Now link your other devices with a code."),
      syncToCloud())
    : toast(
        "❌ Could not turn on sync",
        "Check your connection and try again.",
      );
}),
  ($("#haveCodeBtn").onclick = () => {
    ($("#enterCodeSection").classList.toggle("hidden"),
      $("#pairCodeInput")?.focus());
  }),
  ($("#redeemCodeBtn").onclick = async () => {
    const e = ($("#pairCodeInput").value || "")
      .trim()
      .toUpperCase()
      .replace(/\s/g, "");
    if (e.length < 6)
      return toast(
        "Invalid code",
        "Enter the code shown on your other device.",
      );
    const t = $("#redeemStatus");
    (t.classList.remove("hidden"),
      (t.textContent = "⏳ Waiting for the other device to approve…"));
    try {
      const o = await fetch(`${API}/pair/redeem`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: e }),
      });
      if (429 === o.status)
        return void (t.textContent =
          "⛔ Too many attempts. Wait a minute and try again.");
      if (!o.ok)
        return void (t.textContent =
          "❌ That code didn’t work. Double-check it and try again.");
      const a = await o.json(),
        n = a.nonce,
        s = Date.now();
      if (!n)
        return void (t.textContent =
          "❌ Pairing could not start. Ask for a fresh code.");
      (stopStatusPolling(),
        (statusPoll = setInterval(async () => {
          if (Date.now() - s > 18e4)
            return (
              stopStatusPolling(),
              void (t.textContent = "⌛ Code expired. Ask for a fresh one.")
            );
          try {
            const o = await fetch(`${API}/pair/status`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code: e, nonce: n }),
              }),
              a = await o.json();
            "approved" === a.status
              ? (stopStatusPolling(),
                (settings.authToken = a.token),
                (settings.userId = a.userId),
                (settings.authProvider = "device-code"),
                (settings.authEmail = null),
                (settings.authUsername = null),
                saveSettings(),
                updateAccountUI(),
                updateSyncStatus(),
                (t.textContent = ""),
                toast("🎉 Connected!", "This device is now synced."),
                await pullFromCloud())
              : "expired" === a.status
                ? (stopStatusPolling(),
                  (t.textContent = "⌛ Code expired. Ask for a fresh one."))
                : "gone" === a.status &&
                  (stopStatusPolling(),
                  (t.textContent =
                    "🚫 Request denied or the code is no longer valid."));
          } catch (e) {}
        }, 3e3)));
    } catch (e) {
      (console.error(e), (t.textContent = "❌ Network error. Try again."));
    }
  }),
  ($("#linkDeviceBtn").onclick = async () => {
    try {
      const e = await fetch(`${API}/pair/create`, {
        method: "POST",
        headers: { Authorization: `Bearer ${settings.authToken}` },
      });
      if (!e.ok) return toast("❌ Could not create a code", "Try again.");
      const t = await e.json();
      $("#linkCodeDisplay").textContent = t.code;
      const o = Math.max(1, Math.round((t.expires - Date.now()) / 6e4));
      (($("#linkCodeExpiry").textContent = `Code expires in about ${o} min`),
        $("#linkCodeSection").classList.remove("hidden"));
      const n = Date.now();
      (stopPairPolling(),
        (pairPoll = setInterval(async () => {
          if (Date.now() - n > 18e4)
            return (
              stopPairPolling(),
              void $("#linkCodeSection").classList.add("hidden")
            );
          try {
            const e = await fetch(`${API}/pair/pending`, {
                method: "POST",
                headers: { Authorization: `Bearer ${settings.authToken}` },
              }),
              t = await e.json();
            t.pending &&
              t.code &&
              (stopPairPolling(),
              confirm(
                "🔗",
                "New device wants to connect",
                "Someone just entered your code on another device. Approve only if it’s you or someone you trust.",
                async () => {
                  (await fetch(`${API}/pair/approve`, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: `Bearer ${settings.authToken}`,
                    },
                    body: JSON.stringify({ code: t.code }),
                  }),
                    $("#linkCodeSection").classList.add("hidden"),
                    toast(
                      "✅ Device approved!",
                      "Your other device is now syncing.",
                    ));
                },
                async () => {
                  (await fetch(`${API}/pair/deny`, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: `Bearer ${settings.authToken}`,
                    },
                    body: JSON.stringify({ code: t.code }),
                  }),
                    $("#linkCodeSection").classList.add("hidden"),
                    toast("🚫 Request denied", ""));
                },
              ));
          } catch (e) {}
        }, 3e3)));
    } catch (e) {
      (console.error(e), toast("❌ Network error", "Try again."));
    }
  }),
  ($("#signOutBtn").onclick = () => {
    confirm(
      "☁️",
      "Log out on this device?",
      "Your data stays on this device. Other linked devices keep syncing.",
      async () => {
        (settings.authProvider === "better-auth" &&
          (await fetch(`${API}/api/auth/sign-out`, {
            method: "POST",
            headers: { Authorization: `Bearer ${settings.authToken}` },
          }).catch(() => null)),
          stopPairPolling(),
          stopStatusPolling(),
          (settings.authToken = null),
          (settings.userId = null),
          (settings.authProvider = null),
          (settings.authEmail = null),
          (settings.authUsername = null),
          (settings.pushSubscription = null),
          saveSettings(),
          updateAccountUI(),
          updateSyncStatus(),
          toast("👋 Logged out", "Sync is off on this device."));
      },
      () => {},
    );
  }),
  $("#revokeOtherDevicesBtn") &&
    ($("#revokeOtherDevicesBtn").onclick = () => {
      confirm(
        "🔒",
        "Log out all other devices?",
        "This keeps this device connected and removes every other linked session from your account.",
        async () => {
          try {
            if (
              !(
                await fetch(
                  settings.authProvider === "better-auth"
                    ? `${API}/api/auth/revoke-other-sessions`
                    : `${API}/sessions/revoke-others`,
                  {
                  method: "POST",
                  headers: { Authorization: `Bearer ${settings.authToken}` },
                  },
                )
              ).ok
            )
              throw new Error("revoke failed");
            toast(
              "🔒 Other devices logged out",
              "They will need a new pairing code to reconnect.",
            );
          } catch (e) {
            toast(
              "Could not log out other devices",
              "Check your connection and try again.",
            );
          }
        },
        () => {},
      );
    }),
  $("#cleanupPhotosBtn") &&
    ($("#cleanupPhotosBtn").onclick = () => {
      if (!settings.authToken)
        return toast("Turn on sync first", "Cloud photo cleanup needs sync.");
      confirm(
        "🧹",
        "Clean unused cloud photos?",
        "Daysie will delete cloud photos that are no longer referenced by your synced journal.",
        async () => {
          try {
            const e = await fetch(`${API}/photos/prune-unused`, {
              method: "POST",
              headers: { Authorization: `Bearer ${settings.authToken}` },
            });
            if (!e.ok) throw new Error("cleanup failed");
            const t = await e.json();
            (toast(
              "🧹 Cloud photos cleaned",
              `${t.deleted || 0} unused photo${1 === t.deleted ? "" : "s"} removed.`,
            ),
              refreshAccountDetails());
          } catch (e) {
            toast(
              "Could not clean photos",
              "Check your connection and try again.",
            );
          }
        },
        () => {},
      );
    }),
  ($("#syncNowBtn").onclick = async () => {
    (toast("🔄 Syncing...", ""),
      await syncToCloud(),
      await pullFromCloud(),
      toast("✅ Synced!", ""));
  }),
  $("#settingsDialog")?.addEventListener("close", () => {
    (stopPairPolling(), stopStatusPolling());
  }));
let accountCreationPromise = null;
async function ensureAccount() {
  if (settings.authToken) return !0;
  updateAccountUI();
  $("#settingsDialog")?.showModal();
  $("#signInEmail")?.focus();
  return !1;
}
async function enableNotifications() {
  if (isIOS() && !isStandalone())
    return toast(
      "📲 Add Daysie to your Home Screen",
      'On iPhone, notifications only work after you add Daysie to your Home Screen (tap Share, then "Add to Home Screen") and open it from there.',
    );
  if (!("Notification" in window))
    return toast(
      "Notifications unavailable",
      "This browser does not support them.",
    );
  let e = Notification.permission;
  if (
    ("default" === e && (e = await Notification.requestPermission()),
    showNotifyBanner(),
    "denied" === e)
  )
    return toast(
      "🔔 Notifications are blocked",
      "Allow them for Daysie in your browser settings, then try again.",
    );
  if ("granted" !== e)
    return toast(
      "No problem",
      "In-app alerts will still show while Daysie is open.",
    );
  if (!("serviceWorker" in navigator) || !("PushManager" in window))
    return toast("🔔 Reminders on!", "Alerts will show while Daysie is open.");
  if (!settings.authToken)
    return toast(
      "🔔 Reminders on for this device",
      "Turn on sync to get reminders when Daysie is closed.",
    );
  toast("🔔 Setting up notifications…", "");
  try {
    const e = await navigator.serviceWorker.ready,
      t = await e.pushManager.subscribe({
        userVisibleOnly: !0,
        applicationServerKey: urlBase64ToUint8Array(
          "BCbfGHSDEXclbsTnL3DjwZxyaLTXhlge4D6wNonqGwOfkLgA19fFyfz7j0nmBD0GxQJp4MNDPfWigOzFvLCyinU",
        ),
      });
    (
      await fetch(`${API}/push/subscribe`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${settings.authToken}`,
        },
        body: JSON.stringify(t),
      })
    ).ok
      ? ((settings.pushSubscription = t),
        saveSettings(),
        await syncToCloud(),
        toast(
          "🔔 Notifications on!",
          "You'll get reminders even when Daysie is closed.",
        ))
      : toast(
          "🔔 Reminders on for this device",
          "Closed-app reminders couldn't be registered, but alerts show while Daysie is open.",
        );
  } catch (e) {
    (console.error(e),
      toast(
        "🔔 Reminders on for this device",
        "Closed-app reminders couldn't be set up, but alerts show while Daysie is open.",
      ));
  }
}
async function refreshPushSubscription() {
  try {
    if (!settings.authToken) return;
    if (!("Notification" in window) || "granted" !== Notification.permission)
      return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    if (isIOS() && !isStandalone()) return;
    const e = await navigator.serviceWorker.ready;
    let t = await e.pushManager.getSubscription();
    (t ||
      (t = await e.pushManager.subscribe({
        userVisibleOnly: !0,
        applicationServerKey: urlBase64ToUint8Array(
          "BCbfGHSDEXclbsTnL3DjwZxyaLTXhlge4D6wNonqGwOfkLgA19fFyfz7j0nmBD0GxQJp4MNDPfWigOzFvLCyinU",
        ),
      })),
      (settings.pushSubscription = t),
      saveSettings(),
      await fetch(`${API}/push/subscribe`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${settings.authToken}`,
        },
        body: JSON.stringify(t),
      }),
      await syncToCloud());
  } catch (e) {
    console.error("Push refresh error:", e);
  }
}
function urlBase64ToUint8Array(e) {
  const t = (e + "=".repeat((4 - (e.length % 4)) % 4))
      .replace(/-/g, "+")
      .replace(/_/g, "/"),
    o = window.atob(t);
  return Uint8Array.from([...o].map((e) => e.charCodeAt(0)));
}
$("#subscribePushBtn").onclick = () => enableNotifications();
let confirmCallback = null,
  cancelCallback = null;
function confirm(e, t, o, n, a) {
  (($("#confirmIcon").textContent = e),
    ($("#confirmTitle").textContent = t),
    ($("#confirmMsg").textContent = o),
    (confirmCallback = n),
    (cancelCallback = a),
    $("#confirmDialog").showModal());
}
function three() {
  if (!window.THREE) return;
  const e = $("#garden"),
    t = new THREE.WebGLRenderer({ canvas: e, alpha: !0, antialias: !0 });
  t.setPixelRatio(Math.min(devicePixelRatio, 2));
  let o = new THREE.Scene(),
    n = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 100);
  n.position.z = 18;
  let a = new THREE.Group();
  o.add(a);
  let s = [16764247, 16747674, 8374665, 7981262, 11376616, 16777215];
  for (let e = 0; e < 34; e++) {
    let t = new THREE.Mesh(
      new THREE.SphereGeometry(0.55 * Math.random() + 0.18, 16, 16),
      new THREE.MeshBasicMaterial({
        color: s[e % s.length],
        transparent: !0,
        opacity: 0.45,
      }),
    );
    (t.position.set(
      34 * (Math.random() - 0.5),
      26 * (Math.random() - 0.5),
      10 * (Math.random() - 0.5),
    ),
      (t.userData = {
        x: t.position.x,
        y: t.position.y,
        s: 0.5 * Math.random() + 0.2,
        p: 9 * Math.random(),
      }),
      a.add(t));
  }
  function i() {
    (t.setSize(innerWidth, innerHeight),
      (n.aspect = innerWidth / innerHeight),
      n.updateProjectionMatrix());
  }
  (addEventListener("resize", i), i());
  let r = 0,
    raf = null;
  function frame() {
    ((r += 0.01),
      a.children.forEach((e) => {
        ((e.position.x =
          e.userData.x + 1.2 * Math.sin(r * e.userData.s + e.userData.p)),
          (e.position.y =
            e.userData.y + 1.1 * Math.cos(r * e.userData.s + e.userData.p)));
      }),
      (a.rotation.y = 0.08 * Math.sin(0.25 * r)),
      t.render(o, n),
      (raf = requestAnimationFrame(frame)));
  }
  function startLoop() {
    null === raf && (raf = requestAnimationFrame(frame));
  }
  function stopLoop() {
    null !== raf && (cancelAnimationFrame(raf), (raf = null));
  }
  (document.addEventListener("visibilitychange", () => {
    document.hidden ? stopLoop() : startLoop();
  }),
    document.hidden || startLoop());
}
(($("#confirmYes").onclick = () => {
  ($("#confirmDialog").close(), confirmCallback && confirmCallback());
}),
  ($("#confirmNo").onclick = () => {
    ($("#confirmDialog").close(), cancelCallback && cancelCallback());
  }));
