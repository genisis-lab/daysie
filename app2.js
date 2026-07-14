const WEEKDAYS = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};
function parseQuickAdd(t) {
  const e = (t || "").trim(),
    i = e.toLowerCase();
  let s = "low",
    a = "none",
    n = "none";
  const o = new Date();
  let r = !1,
    d = !1;
  const l = [];
  let c = i.match(/\b(important|urgent|high priority|asap)\b/);
  (c && ((s = "high"), l.push(c[0])),
    /\bevery day\b|\bdaily\b/.test(i)
      ? ((a = "daily"), l.push("every day", "daily"))
      : /\bevery week\b|\bweekly\b/.test(i)
        ? ((a = "weekly"), l.push("every week", "weekly"))
        : /\bevery month\b|\bmonthly\b/.test(i)
          ? ((a = "monthly"), l.push("every month", "monthly"))
          : /\bevery year\b|\byearly\b|\bannually\b/.test(i) &&
            ((a = "yearly"), l.push("every year", "yearly", "annually")));
  const u = [
    ["meds", /\b(meds?|medicine|medication|pill|pills)\b/],
    ["birthday", /\bbirthday\b/],
    ["call", /\bcall\b/],
    ["appointment", /\b(appointment|appt|doctor|dentist)\b/],
    ["chores", /\b(chore|chores|clean|laundry|dishes|trash|vacuum)\b/],
  ];
  for (const [t, e] of u)
    if (e.test(i)) {
      n = t;
      break;
    }
  if (((c = i.match(/\bin (\d+) (day|days|week|weeks)\b/)), c)) {
    const t = parseInt(c[1], 10);
    (o.setDate(o.getDate() + (0 === c[2].indexOf("week") ? 7 * t : t)),
      (r = !0),
      l.push(c[0]));
  }
  if (
    (/\btomorrow\b/.test(i)
      ? (o.setDate(o.getDate() + 1), (r = !0), l.push("tomorrow"))
      : /\btonight\b/.test(i)
        ? ((r = !0), l.push("tonight"), o.setHours(20, 0, 0, 0), (d = !0))
        : /\btoday\b/.test(i) && ((r = !0), l.push("today")),
    !r)
  )
    for (const t of Object.keys(WEEKDAYS)) {
      const e = new RegExp("\\b(next |on )?" + t + "\\b"),
        s = i.match(e);
      if (s) {
        let e = (WEEKDAYS[t] - o.getDay() + 7) % 7;
        (0 === e && (e = 7),
          o.setDate(o.getDate() + e),
          (r = !0),
          l.push(s[0]));
        break;
      }
    }
  if (((c = i.match(/\b(at )?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/)), c)) {
    let t = parseInt(c[2], 10) % 12;
    ("pm" === c[4] && (t += 12),
      o.setHours(t, c[3] ? parseInt(c[3], 10) : 0, 0, 0),
      (d = !0),
      l.push(c[0]));
  } else
    ((c = i.match(/\bat (\d{1,2}):(\d{2})\b/)),
      c
        ? (o.setHours(parseInt(c[1], 10), parseInt(c[2], 10), 0, 0),
          (d = !0),
          l.push(c[0]))
        : /\bnoon\b/.test(i)
          ? (o.setHours(12, 0, 0, 0), (d = !0), l.push("noon"))
          : /\bmidnight\b/.test(i)
            ? (o.setHours(0, 0, 0, 0), (d = !0), l.push("midnight"))
            : /\bmorning\b/.test(i)
              ? (o.setHours(9, 0, 0, 0),
                (d = !0),
                (r = !0),
                l.push("this morning", "morning"))
              : /\bafternoon\b/.test(i)
                ? (o.setHours(14, 0, 0, 0),
                  (d = !0),
                  (r = !0),
                  l.push("this afternoon", "afternoon"))
                : /\bevening\b/.test(i) &&
                  (o.setHours(18, 0, 0, 0),
                  (d = !0),
                  (r = !0),
                  l.push("this evening", "evening")));
  r && !d && o.setHours(9, 0, 0, 0);
  let b = e;
  (l
    .sort((t, e) => e.length - t.length)
    .forEach((t) => {
      t &&
        (b = b.replace(
          new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig"),
          " ",
        ));
    }),
    (b = b
      .replace(/\b(at|on|in|every|this)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim()),
    (b = b.replace(/^[-,:\s]+|[-,:\s]+$/g, "").trim()),
    b || (b = e),
    (b = b.charAt(0).toUpperCase() + b.slice(1)));
  const h = r || d ? o.getTime() : null;
  return { title: b, due: h, priority: s, repeat: a, category: n };
}
function quickAdd(t) {
  const e = (t || "").trim();
  if (!e) return;
  const i = parseQuickAdd(e);
  (getProfile().tasks.push({
    id: id(),
    done: !1,
    created: Date.now(),
    title: i.title,
    due: i.due,
    note: "",
    priority: i.priority,
    repeat: i.repeat,
    repeatUntil: null,
    category: i.category,
    assignee: null,
    subtasks: [],
    notified: !1,
  }),
    save(),
    renderAll(),
    confetti(),
    toast("✅ " + i.title, i.due ? "📅 " + fmt(i.due) : "Added to your list."));
}
function bindQuickAdd(t, e) {
  const i = $(t),
    s = $(e);
  if (!i) return;
  const a = () => {
    i.value.trim() && (quickAdd(i.value), (i.value = ""));
  };
  (s && (s.onclick = a),
    i.addEventListener("keydown", (t) => {
      "Enter" === t.key && (t.preventDefault(), a());
    }));
}
(bindQuickAdd("#quickAddToday", "#quickAddTodayBtn"),
  bindQuickAdd("#quickAddTasks", "#quickAddTasksBtn"));
const habitColors = [
    "#ffcd57",
    "#ff8c9a",
    "#7fc989",
    "#79c8ce",
    "#ad97e8",
    "#ff9f5a",
  ],
  habitEmojis = [
    "✅",
    "💧",
    "🏃",
    "🧘",
    "📚",
    "💊",
    "🪥",
    "🥗",
    "😴",
    "🌳",
    "🎯",
    "🙏",
  ];
let newHabitColor = habitColors[0],
  newHabitEmoji = habitEmojis[0];
function habitStreak(t) {
  const e = t.history || {};
  let i = 0;
  const s = new Date();
  for (e[day(s)] || s.setDate(s.getDate() - 1); e[day(s)]; )
    (i++, s.setDate(s.getDate() - 1));
  return i;
}
function renderHabits() {
  const t = $("#habitsList");
  if (!t) return;
  const e = getProfile().habits || [],
    i = day();
  e.length
    ? ((t.innerHTML = e
        .map((t) => {
          const e = !(!t.history || !t.history[i]),
            s = habitStreak(t);
          return `<button type="button" class="habit-pill ${e ? "on" : ""}" data-habit="${safeDomId(t.id)}" style="--hc:${esc(t.color || "#ffcd57")}">\n      <span class="habit-emoji">${esc(t.emoji || "✅")}</span>\n      <span class="habit-name">${esc(t.name)}</span>\n      <span class="habit-streak">${s > 0 ? "🔥 " + s : e ? "✓" : ""}</span>\n    </button>`;
        })
        .join("")),
      $$("#habitsList [data-habit]").forEach(
        (t) => (t.onclick = () => toggleHabit(t.dataset.habit)),
      ))
    : (t.innerHTML =
        '<div class="habit-empty">No habits yet. Tap “Manage” to add one. 🌱</div>');
}
function toggleHabit(t) {
  const e = (getProfile().habits || []).find((e) => e.id === t);
  if (!e) return;
  e.history || (e.history = {});
  const i = day();
  (e.history[i] ? delete e.history[i] : ((e.history[i] = !0), confetti()),
    save(),
    renderHabits(),
    renderHabitInsights());
}
function renderHabitInsights() {
  const t = $("#habitInsights");
  if (!t) return;
  const e = getProfile().habits || [];
  if (!e.length) return void (t.innerHTML = "");
  const i = [];
  for (let t = 6; t >= 0; t--) {
    const e = new Date();
    (e.setDate(e.getDate() - t), i.push(e));
  }
  t.innerHTML = e
    .map((t) => {
      const e = i
        .map(
          (e) =>
            `<i class="${t.history && t.history[day(e)] ? "on" : ""}" style="--hc:${esc(t.color || "#ffcd57")}"></i>`,
        )
        .join("");
      return `<div class="habit-row"><span class="habit-row-name">${esc(t.emoji || "✅")} ${esc(t.name)}</span><div class="habit-dots">${e}</div></div>`;
    })
    .join("");
}
function renderHabitManageList() {
  const t = $("#habitManageList");
  if (!t) return;
  const e = getProfile(),
    i = e.habits || [];
  ((t.innerHTML = i.length
    ? i
        .map(
          (t) =>
            `<div class="manage-item"><span>${esc(t.emoji || "✅")} ${esc(t.name)} ${habitStreak(t) ? "· 🔥 " + habitStreak(t) : ""}</span><button type="button" class="photo-remove" data-delhabit="${safeDomId(t.id)}" aria-label="Delete habit">✕</button></div>`,
        )
        .join("")
    : '<p style="color:var(--soft);font-weight:700">No habits yet.</p>'),
    $$("#habitManageList [data-delhabit]").forEach(
      (t) =>
        (t.onclick = () => {
          ((e.habits = (e.habits || []).filter(
            (e) => e.id !== t.dataset.delhabit,
          )),
            save(),
            renderHabitManageList(),
            renderHabits(),
            renderHabitInsights());
        }),
    ));
}
function openHabitDialog() {
  const t = $("#habitColorPicker");
  t &&
    ((t.innerHTML = habitColors
      .map(
        (t) =>
          `<button type="button" data-hcolor="${t}" style="background:${t}"></button>`,
      )
      .join("")),
    $$("#habitColorPicker button").forEach(
      (t) =>
        (t.onclick = () => {
          ((newHabitColor = t.dataset.hcolor),
            $$("#habitColorPicker button").forEach((t) =>
              t.classList.remove("on"),
            ),
            t.classList.add("on"));
        }),
    ));
  const e = $("#habitEmojiPicker");
  (e &&
    ((e.innerHTML = habitEmojis
      .map((t) => `<button type="button" data-hemoji="${t}">${t}</button>`)
      .join("")),
    $$("#habitEmojiPicker button").forEach(
      (t) =>
        (t.onclick = () => {
          ((newHabitEmoji = t.dataset.hemoji),
            $$("#habitEmojiPicker button").forEach((t) =>
              t.classList.remove("on"),
            ),
            t.classList.add("on"));
        }),
    )),
    renderHabitManageList(),
    $("#habitDialog").showModal());
}
($("#manageHabitsBtn") && ($("#manageHabitsBtn").onclick = openHabitDialog),
  $("#closeHabitDialog") &&
    ($("#closeHabitDialog").onclick = () => $("#habitDialog").close()),
  $("#addHabitBtn") &&
    ($("#addHabitBtn").onclick = () => {
      const t = ($("#newHabitName").value || "").trim();
      if (!t) return toast("Name your habit", "e.g. Drink water, Walk 20 min");
      const e = getProfile();
      (e.habits || (e.habits = []),
        e.habits.push({
          id: id(),
          name: t,
          emoji: newHabitEmoji,
          color: newHabitColor,
          history: {},
          created: Date.now(),
        }),
        save(),
        ($("#newHabitName").value = ""),
        renderHabitManageList(),
        renderHabits(),
        renderHabitInsights(),
        toast("🌱 Habit added", newHabitEmoji + " " + t));
    }));
const listEmojis = ["📝", "🛒", "🧺", "🎁", "✈️", "🍽️", "🏠", "📚", "🎬", "💡"];
let newListEmoji = listEmojis[0];
function hasFamilyListSync() {
  return !!(
    window.family &&
    window.family.familyId &&
    (window.family.members || []).length > 1 &&
    "function" == typeof saveFamilyLists
  );
}
async function syncSharedLists(t) {
  if (hasFamilyListSync()) {
    window.familyLists = db.lists || [];
    try {
      await saveFamilyLists(t || "updated a shared list");
    } catch (t) {}
  }
}
function renderLists() {
  const t = $("#listsList");
  if (!t) return;
  const e = (db.lists || []).filter((t) => !t.deleted);
  if (!e.length)
    return void (t.innerHTML =
      '<div class="habit-empty">No shared lists yet. Tap “Manage” to create one. 📝</div>');
  ((t.innerHTML = e
    .map((t) => {
      const e = t.items || [],
        i = e.filter((t) => !t.done).length;
      return `<article class="list-card">\n      <div class="list-head"><b>${esc(t.emoji || "📝")} ${esc(t.name)}</b><small>${i} left</small></div>\n      <div class="list-items">${e.map((e) => `<button type="button" class="list-item ${e.done ? "done" : ""}" data-list="${safeDomId(t.id)}" data-item="${safeDomId(e.id)}"><span class="subcheck">${e.done ? "✓" : ""}</span><span>${esc(e.text)}</span></button>`).join("")}</div>\n      <div class="list-add-row"><input class="list-add-input" data-listadd="${safeDomId(t.id)}" maxlength="80" placeholder="Add item…" /><button type="button" class="soft small" data-listaddbtn="${safeDomId(t.id)}">+</button></div>\n    </article>`;
    })
    .join("")),
    $$("#listsList [data-item]").forEach(
      (t) =>
        (t.onclick = () => {
          const e = (db.lists || []).find((e) => e.id === t.dataset.list),
            i =
              e && e.items
                ? e.items.find((e) => e.id === t.dataset.item)
                : null;
          i &&
            ((i.done = !i.done),
            (i.updatedAt = Date.now()),
            i.done && (i.by = getProfile().name),
            (e.updatedAt = Date.now()),
            save(),
            renderLists(),
            syncSharedLists(
              i.done
                ? "checked off a shared-list item"
                : "reopened a shared-list item",
            ));
        }),
    ));
  const i = (t, e) => {
    const i = (e.value || "").trim();
    if (!i) return;
    const s = (db.lists || []).find((e) => e.id === t);
    s &&
      (s.items || (s.items = []),
      s.items.push({
        id: id(),
        text: i,
        done: !1,
        by: getProfile().name,
        updatedAt: Date.now(),
      }),
      (s.updatedAt = Date.now()),
      (e.value = ""),
      save(),
      renderLists(),
      syncSharedLists("added “" + i + "” to a shared list"));
  };
  ($$("#listsList [data-listaddbtn]").forEach(
    (t) =>
      (t.onclick = () =>
        i(
          t.dataset.listaddbtn,
          document.querySelector(
            '[data-listadd="' + t.dataset.listaddbtn + '"]',
          ),
        )),
  ),
    $$("#listsList [data-listadd]").forEach((t) =>
      t.addEventListener("keydown", (e) => {
        "Enter" === e.key && (e.preventDefault(), i(t.dataset.listadd, t));
      }),
    ));
}
function renderListManageList() {
  const t = $("#listManageList");
  if (!t) return;
  const e = (db.lists || []).filter((t) => !t.deleted);
  ((t.innerHTML = e.length
    ? e
        .map(
          (t) =>
            `<div class="manage-item"><span>${esc(t.emoji || "📝")} ${esc(t.name)} · ${(t.items || []).length} items</span><button type="button" class="photo-remove" data-dellist="${safeDomId(t.id)}" aria-label="Delete list">✕</button></div>`,
        )
        .join("")
    : '<p style="color:var(--soft);font-weight:700">No lists yet.</p>'),
    $$("#listManageList [data-dellist]").forEach(
      (t) =>
        (t.onclick = () => {
          confirm(
            "🗑️",
            "Delete list?",
            "This removes it for everyone.",
            () => {
              const e = (db.lists || []).find(
                (e) => e.id === t.dataset.dellist,
              );
              (e && ((e.deleted = !0), (e.updatedAt = Date.now())),
                save(),
                renderListManageList(),
                renderLists(),
                syncSharedLists("deleted a shared list"));
            },
            () => {},
          );
        }),
    ));
}
function openListDialog() {
  const t = $("#listEmojiPicker");
  (t &&
    ((t.innerHTML = listEmojis
      .map((t) => `<button type="button" data-lemoji="${t}">${t}</button>`)
      .join("")),
    $$("#listEmojiPicker button").forEach(
      (t) =>
        (t.onclick = () => {
          ((newListEmoji = t.dataset.lemoji),
            $$("#listEmojiPicker button").forEach((t) =>
              t.classList.remove("on"),
            ),
            t.classList.add("on"));
        }),
    )),
    renderListManageList(),
    $("#listDialog").showModal());
}
($("#manageListsBtn") && ($("#manageListsBtn").onclick = openListDialog),
  $("#closeListDialog") &&
    ($("#closeListDialog").onclick = () => $("#listDialog").close()),
  $("#addListBtn") &&
    ($("#addListBtn").onclick = () => {
      const t = ($("#newListName").value || "").trim();
      if (!t) return toast("Name your list", "e.g. Groceries, Packing");
      (db.lists || (db.lists = []),
        db.lists.push({
          id: id(),
          name: t,
          emoji: newListEmoji,
          items: [],
          updatedAt: Date.now(),
        }),
        save(),
        ($("#newListName").value = ""),
        renderListManageList(),
        renderLists(),
        syncSharedLists("created the “" + t + "” shared list"),
        toast("📝 List created", newListEmoji + " " + t));
    }));
const tourSlides = [
  {
    icon: "🌼",
    title: "Welcome to Daysie!",
    body: "Your gentle family helper for reminders, journaling, habits, and shared lists. Here is a quick tour.",
  },
  {
    icon: "☀️",
    title: "Today",
    body: "Your home base shows your day, this week’s plan, habits, and shared lists — all in one calm place.",
  },
  {
    icon: "⚡",
    title: "Quick add",
    body: "Type naturally like “Call mom tomorrow at 5pm” and Daysie figures out the date, time, and repeat for you.",
  },
  {
    icon: "⏰",
    title: "Reminders",
    body: "Add tasks with a time, repeat, and priority. Assign them to a family member and get notified — even when Daysie is closed.",
  },
  {
    icon: "🌱",
    title: "Habits",
    body: "Build gentle daily habits and watch your streaks grow. Tap a habit pill on Today to check it off.",
  },
  {
    icon: "📝",
    title: "Shared lists",
    body: "Groceries, packing, chores — make lists everyone in the family can add to and check off together.",
  },
  {
    icon: "📖",
    title: "Journal & insights",
    body: "Capture moods, photos, and memories. Insights show your streaks, moods, and little wins over time.",
  },
  {
    icon: "☁️",
    title: "Sync your devices",
    body: "Open Settings → Create an account to keep everything in step across phones and tablets.",
  },
];
let tourIndex = 0;
function renderTour() {
  const t = tourSlides[tourIndex];
  (($("#tourIcon").textContent = t.icon),
    ($("#tourTitle").textContent = t.title),
    ($("#tourBody").textContent = t.body),
    ($("#tourDots").innerHTML = tourSlides
      .map((t, e) => `<i class="${e === tourIndex ? "on" : ""}"></i>`)
      .join("")),
    $("#tourBack").classList.toggle("hidden", 0 === tourIndex),
    ($("#tourNext").textContent =
      tourIndex === tourSlides.length - 1 ? "Get started ✨" : "Next →"));
}
function startTour() {
  $("#tourOverlay") &&
    ((tourIndex = 0),
    renderTour(),
    $("#tourOverlay").classList.remove("hidden"));
}
function endTour() {
  ($("#tourOverlay").classList.add("hidden"), (db.tourDone = !0), save());
}
($("#tourNext") &&
  ($("#tourNext").onclick = () => {
    tourIndex === tourSlides.length - 1
      ? endTour()
      : (tourIndex++, renderTour());
  }),
  $("#tourBack") &&
    ($("#tourBack").onclick = () => {
      tourIndex > 0 && (tourIndex--, renderTour());
    }),
  $("#tourSkip") && ($("#tourSkip").onclick = endTour),
  $("#replayTourBtn") &&
    ($("#replayTourBtn").onclick = () => {
      ($("#settingsDialog").close(), setTimeout(startTour, 250));
    }),
  setTimeout(three, 500),
  boot());
