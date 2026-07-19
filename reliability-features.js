/* Reliability center: notification diagnostics, delivery receipts, rotating chores,
   availability, account migration, calendar transfer, and notification actions. */
(() => {
  const byId = (id) => document.getElementById(id);
  const safe = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  const request = async (path, options = {}) => {
    const response = await daysieAuthenticatedFetch(`${API}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${settings.authToken}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {}),
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || data.message || "Request failed");
    return data;
  };
  const dateTime = (value) => value ? new Date(value).toLocaleString() : "Not yet";
  let dashboard = null;

  window.migrateDaysieLegacyAccount = async (legacyToken) => {
    if (!legacyToken || !settings.authToken) return null;
    const result = await request("/reliability/account/claim-legacy", {
      method: "POST",
      body: JSON.stringify({ legacyToken }),
    });
    if (result.migrated) {
      localStorage.removeItem("daysie.pendingLegacyToken");
      localStorage.setItem("daysie.pendingLegacyMigrationId", result.legacyUserId);
      toast("Device history connected", "Notifications, family sharing, and cloud history now belong to your account.");
    }
    return result;
  };

  const permissionLabel = () => {
    if (!("Notification" in window)) return { ok: false, text: "Not supported" };
    if (Notification.permission === "granted") return { ok: true, text: "Allowed" };
    if (Notification.permission === "denied") return { ok: false, text: "Blocked in system settings" };
    return { ok: false, text: "Not requested" };
  };

  async function loadNotificationDiagnostics() {
    if (!settings.authToken || !byId("notificationDiagnostics")) return;
    const target = byId("notificationDiagnostics");
    try {
      const data = await request("/reliability/notifications/diagnostics");
      const registration = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : null;
      const currentSubscription = registration?.pushManager ? await registration.pushManager.getSubscription() : null;
      const permission = permissionLabel();
      const installed = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
      const active = data.devices.filter((device) => device.enabled).length;
      target.innerHTML = [
        [permission.ok, "Permission", permission.text],
        [installed || !/iPhone|iPad|iPod/.test(navigator.userAgent), "App install", installed ? "Installed" : "Browser tab"],
        [data.authenticated, "Session", data.accountType === "account" ? "Secure account" : "Legacy device"],
        [data.pushConfigured, "Push service", data.pushConfigured ? "Online" : "Unavailable"],
        [active > 0, "Connected devices", `${active} active`],
      ].map(([ok, label, detail]) => `<div><span aria-hidden="true">${ok ? "✅" : "⚠️"}</span><b>${safe(label)}</b><small>${safe(detail)}</small></div>`).join("");
      const list = byId("notificationDeviceList");
      list.innerHTML = data.devices.length ? data.devices.map((device) => `
        <div class="notification-device-card" data-device-id="${safe(device.id)}">
          <div><b>${device.enabled ? "🔔" : "🔕"} ${safe(device.name)}</b><small>${device.lastSuccessAt ? `Delivered ${dateTime(device.lastSuccessAt)}` : device.lastFailureAt ? `Failed ${dateTime(device.lastFailureAt)}${device.lastStatus ? ` · ${device.lastStatus}` : ""}` : "Waiting for first delivery"}</small></div>
          <div class="row-actions"><button type="button" class="text-button" data-device-rename>Rename</button><button type="button" class="text-button" data-device-toggle>${device.enabled ? "Pause" : "Resume"}</button><button type="button" class="text-button danger-text" data-device-remove>Remove</button></div>
        </div>`).join("") : "<small>No closed-app notification device is connected.</small>";
      list.querySelectorAll("[data-device-id]").forEach((card) => {
        const device = data.devices.find((item) => item.id === card.dataset.deviceId);
        card.querySelector("[data-device-rename]").onclick = async () => {
          const name = prompt("Name this notification device", device.name);
          if (!name?.trim()) return;
          await request(`/reliability/notifications/devices/${encodeURIComponent(device.id)}`, { method: "PATCH", body: JSON.stringify({ name, enabled: device.enabled }) });
          await loadNotificationDiagnostics();
        };
        card.querySelector("[data-device-toggle]").onclick = async () => {
          await request(`/reliability/notifications/devices/${encodeURIComponent(device.id)}`, { method: "PATCH", body: JSON.stringify({ enabled: !device.enabled }) });
          await loadNotificationDiagnostics();
        };
        card.querySelector("[data-device-remove]").onclick = async () => {
          if (!confirm(`Remove ${device.name} from notifications?`)) return;
          await request(`/reliability/notifications/devices/${encodeURIComponent(device.id)}`, { method: "DELETE" });
          if (currentSubscription?.endpoint === device.endpoint) {
            await currentSubscription.unsubscribe();
            settings.pushSubscription = null;
            saveSettings();
          }
          await loadNotificationDiagnostics();
        };
      });
    } catch (error) {
      target.innerHTML = `<small class="danger-text">${safe(error.message)}</small>`;
    }
  }
  window.loadDaysieNotificationDiagnostics = loadNotificationDiagnostics;

  function renderChoreMembers() {
    const target = byId("familyChoreMembers");
    if (!target || !dashboard) return;
    target.innerHTML = dashboard.members.map((member) => `<label class="check-row"><input type="checkbox" value="${safe(member.userId)}" checked /><span>${safe(member.emoji)} ${safe(member.name)}</span></label>`).join("");
  }

  async function loadChores() {
    if (!settings.authToken || !byId("familyChoreList")) return;
    try {
      const data = await request("/reliability/family/chores");
      byId("familyChoreList").innerHTML = data.chores.length ? data.chores.map((chore) => {
        const nextMember = dashboard?.members.find((member) => member.userId === chore.assigneeOrder[chore.nextAssigneeIndex]);
        return `<div class="feature-row"><div><b>🧹 ${safe(chore.title)}</b><small>${safe(chore.recurrence)} · next ${dateTime(chore.nextDueAt)}${nextMember ? ` · ${safe(nextMember.emoji)} ${safe(nextMember.name)}` : ""}</small></div><button type="button" class="text-button danger-text" data-delete-chore="${safe(chore.id)}">Stop</button></div>`;
      }).join("") : "<small>No rotating chores yet.</small>";
      byId("familyChoreList").querySelectorAll("[data-delete-chore]").forEach((button) => button.onclick = async () => {
        if (!confirm("Stop this recurring chore? Existing assignments stay available.")) return;
        await request(`/reliability/family/chores/${encodeURIComponent(button.dataset.deleteChore)}`, { method: "DELETE" });
        await loadChores();
      });
    } catch (error) {
      byId("familyChoreList").innerHTML = `<small>${safe(error.message)}</small>`;
    }
  }

  async function loadReceipts() {
    if (!settings.authToken || !byId("familyReceiptList")) return;
    try {
      const data = await request("/reliability/family/receipts");
      const state = (receipt) => receipt.completedAt ? ["✅", `Completed ${dateTime(receipt.completedAt)}`] : receipt.seenAt ? ["👀", `Seen ${dateTime(receipt.seenAt)}`] : receipt.pushDeliveredAt ? ["📲", `Delivered ${dateTime(receipt.pushDeliveredAt)}`] : ["📥", "Waiting in their Daysie inbox"];
      byId("familyReceiptList").innerHTML = data.receipts.length ? data.receipts.map((receipt) => {
        const [icon, label] = state(receipt);
        return `<div class="receipt-row"><span aria-hidden="true">${icon}</span><div><b>${safe(receipt.payload?.title || receipt.kind)}</b><small>${safe(receipt.recipientEmoji)} ${safe(receipt.recipientName)} · ${safe(label)}</small></div></div>`;
      }).join("") : "<small>No sent family tasks yet.</small>";
    } catch (error) {
      byId("familyReceiptList").innerHTML = `<small>${safe(error.message)}</small>`;
    }
  }

  async function loadFamilyReliability() {
    if (!settings.authToken || !byId("familyDashboard")) return;
    try {
      dashboard = await request("/features/family/dashboard");
      if (!dashboard.familyId) return;
      renderChoreMembers();
      const me = dashboard.members.find((member) => member.isMe);
      if (me) {
        byId("familyAvailabilityNote").value = me.availabilityNote || "";
        byId("familyAvailabilityUntil").value = me.availabilityUntil ? new Date(me.availabilityUntil - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : "";
        byId("familyDnd").checked = Number(me.dndUntil || 0) > Date.now();
      }
      await Promise.all([loadChores(), loadReceipts()]);
    } catch (error) {
      console.error("Family reliability load failed", error);
    }
  }

  const openFamilyAuth = (panel) => {
    sessionStorage.setItem("daysie.returnAfterAuth", "family");
    byId("familyDialog")?.close();
    openAuthEntry(panel);
  };
  byId("familyGateSignIn")?.addEventListener("click", () => openFamilyAuth("signIn"));
  byId("familyGateCreate")?.addEventListener("click", () => openFamilyAuth("signUp"));
  byId("profileBtn")?.addEventListener("click", () => setTimeout(loadFamilyReliability, 100));
  byId("settingsBtn")?.addEventListener("click", () => setTimeout(loadNotificationDiagnostics, 150));
  byId("refreshHealthBtn")?.addEventListener("click", () => setTimeout(loadNotificationDiagnostics, 80));
  byId("reconnectNotificationsBtn")?.addEventListener("click", async () => {
    try {
      await enableNotifications();
      await refreshPushSubscription();
      await loadNotificationDiagnostics();
      toast("Notifications reconnected", "This device is ready for closed-app reminders.");
    } catch (error) { toast("Could not reconnect", error.message); }
  });

  byId("saveFamilyAvailability")?.addEventListener("click", async () => {
    try {
      const until = byId("familyAvailabilityUntil").value ? new Date(byId("familyAvailabilityUntil").value).getTime() : null;
      await request("/reliability/family/availability", { method: "PUT", body: JSON.stringify({ availability: byId("familyAvailability").value, note: byId("familyAvailabilityNote").value, until, dndUntil: byId("familyDnd").checked ? (until || Date.now() + 8 * 60 * 60_000) : null }) });
      toast("Availability updated", "Your family can see your current status.");
      await loadFamilyReliability();
    } catch (error) { toast("Could not update availability", error.message); }
  });

  byId("familyChoreForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const assigneeOrder = [...byId("familyChoreMembers").querySelectorAll("input:checked")].map((input) => input.value);
    try {
      await request("/reliability/family/chores", { method: "POST", body: JSON.stringify({ title: byId("familyChoreTitle").value, note: byId("familyChoreNote").value, recurrence: byId("familyChoreRecurrence").value, nextDueAt: new Date(byId("familyChoreDue").value).getTime(), assigneeOrder }) });
      event.currentTarget.reset();
      renderChoreMembers();
      toast("Rotating chore created", "Daysie will assign it automatically at the due time.");
      await loadChores();
    } catch (error) { toast("Could not create chore", error.message); }
  });

  const icsEscape = (value) => String(value || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
  const icsDate = (timestamp) => new Date(timestamp).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  byId("exportFamilyCalendar")?.addEventListener("click", async () => {
    try {
      dashboard ||= await request("/features/family/dashboard");
      const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Daysie//Family Calendar//EN", "CALSCALE:GREGORIAN"];
      dashboard.events.forEach((item) => lines.push("BEGIN:VEVENT", `UID:${icsEscape(item.id)}@daysie`, `DTSTAMP:${icsDate(Date.now())}`, `DTSTART:${icsDate(item.startsAt)}`, ...(item.endsAt ? [`DTEND:${icsDate(item.endsAt)}`] : []), `SUMMARY:${icsEscape(item.title)}`, ...(item.note ? [`DESCRIPTION:${icsEscape(item.note)}`] : []), "END:VEVENT"));
      lines.push("END:VCALENDAR");
      const link = document.createElement("a");
      link.href = URL.createObjectURL(new Blob([lines.join("\r\n")], { type: "text/calendar" }));
      link.download = `daysie-family-${new Date().toISOString().slice(0, 10)}.ics`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    } catch (error) { toast("Calendar export failed", error.message); }
  });
  byId("importFamilyCalendar")?.addEventListener("click", () => byId("familyCalendarFile").click());
  byId("familyCalendarFile")?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 1_000_000) throw new Error("Choose an .ics file smaller than 1 MB.");
      const text = (await file.text()).replace(/\r?\n[ \t]/g, "");
      const events = [...text.matchAll(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/g)].slice(0, 100).map((match) => {
        const value = (key) => match[1].match(new RegExp(`\\r?\\n${key}(?:;[^:]*)?:([^\\r\\n]+)`))?.[1]?.replace(/\\n/g, "\n").replace(/\\([,;\\])/g, "$1") || "";
        const parseDate = (raw) => /^\d{8}T\d{6}Z$/.test(raw) ? Date.UTC(Number(raw.slice(0, 4)), Number(raw.slice(4, 6)) - 1, Number(raw.slice(6, 8)), Number(raw.slice(9, 11)), Number(raw.slice(11, 13)), Number(raw.slice(13, 15))) : /^\d{8}T\d{6}$/.test(raw) ? new Date(Number(raw.slice(0, 4)), Number(raw.slice(4, 6)) - 1, Number(raw.slice(6, 8)), Number(raw.slice(9, 11)), Number(raw.slice(11, 13)), Number(raw.slice(13, 15))).getTime() : /^\d{8}$/.test(raw) ? new Date(`${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T09:00`).getTime() : new Date(raw).getTime();
        return { title: value("SUMMARY"), note: value("DESCRIPTION"), startsAt: parseDate(value("DTSTART")), endsAt: parseDate(value("DTEND")) };
      }).filter((item) => item.title && Number.isFinite(item.startsAt));
      if (!events.length) throw new Error("No readable calendar events were found.");
      if (!confirm(`Import ${events.length} event${events.length === 1 ? "" : "s"} into the family calendar?`)) return;
      for (const item of events) await request("/features/family/events", { method: "POST", body: JSON.stringify(item) });
      toast("Calendar imported", `${events.length} event${events.length === 1 ? "" : "s"} added.`);
      await loadFamilyReliability();
    } catch (error) { toast("Calendar import failed", error.message); }
    finally { event.target.value = ""; }
  });

  async function handleNotificationAction() {
    const url = new URL(location.href);
    const assignmentId = url.searchParams.get("assignment");
    const taskId = url.searchParams.get("task");
    if (!assignmentId && taskId) {
      const task = (db.profiles || []).flatMap((profile) => profile.tasks || []).find((item) => item.id === taskId);
      const taskAction = url.searchParams.get("notificationAction");
      if (task && taskAction === "complete") {
        task.done = true;
        task.completedAt = Date.now();
        task.updatedAt = Date.now();
        save();
        renderAll();
        if (settings.authToken) syncToCloud();
        toast("Reminder completed", task.title);
      } else if (task && taskAction === "snooze") {
        task.due = Date.now() + 60 * 60_000;
        task.notified = false;
        task.updatedAt = Date.now();
        save();
        renderAll();
        if (settings.authToken) syncToCloud();
        toast("Reminder snoozed", "Daysie will nudge you in one hour.");
      }
      url.searchParams.delete("task");
      url.searchParams.delete("notificationAction");
      history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
      return;
    }
    if (!assignmentId || !settings.authToken) return;
    const action = url.searchParams.get("notificationAction") || "seen";
    try {
      await request(`/reliability/family/assignments/${encodeURIComponent(assignmentId)}/${action === "complete" ? "complete" : action === "snooze" ? "snooze" : "seen"}`, { method: "POST", body: action === "snooze" ? JSON.stringify({ until: Date.now() + 60 * 60_000 }) : "{}" });
      if (action === "complete") toast("Task completed", "Your family can see the update.");
      if (action === "snooze") toast("Task snoozed", "Daysie will remind you in one hour.");
      url.searchParams.delete("assignment"); url.searchParams.delete("notificationAction");
      history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    } catch (error) { console.error("Notification action failed", error); }
  }

  setTimeout(() => {
    if (settings.authToken) {
      loadNotificationDiagnostics();
      handleNotificationAction();
      const pendingLegacy = localStorage.getItem("daysie.pendingLegacyToken");
      if (pendingLegacy && settings.authProvider === "better-auth") window.migrateDaysieLegacyAccount(pendingLegacy).catch((error) => console.error("Legacy migration failed", error));
      const pendingCleanup = localStorage.getItem("daysie.pendingLegacyMigrationId");
      if (pendingCleanup && settings.authProvider === "better-auth") request("/reliability/account/finalize-legacy", { method: "POST", body: JSON.stringify({ legacyUserId: pendingCleanup }) }).then(() => localStorage.removeItem("daysie.pendingLegacyMigrationId")).catch((error) => console.error("Legacy cleanup retry failed", error));
    }
  }, 1300);
})();
