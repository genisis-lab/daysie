/* Account, recovery, backup, device, family-invite, and PWA controls. */
(() => {
  const byId = (id) => document.getElementById(id);
  const headers = (json = false) => ({ Authorization: `Bearer ${settings.authToken}`, ...(json ? { "Content-Type": "application/json" } : {}) });
  const request = async (path, options = {}) => {
    const response = await fetch(`${API}${path}`, { ...options, headers: { ...headers(Boolean(options.body)), ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || data.message || "Request failed");
    return data;
  };
  const safe = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const relative = (value) => value ? new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(Math.round((Number(value) - Date.now()) / 60000), "minute") : "unknown";
  const base64 = (bytes) => btoa(String.fromCharCode(...bytes));
  const unbase64 = (value) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
  const BACKUP_KEY = "daysie.encryptedBackupKey.v1";

  async function finishRecoveredSession(token, user) {
    settings.authToken = token;
    settings.userId = user.id;
    settings.authProvider = "better-auth";
    settings.authEmail = user.email;
    settings.authUsername = user.username || null;
    saveSettings();
    updateAccountUI();
    updateSyncStatus();
    await pullFromCloud();
    byId("settingsDialog")?.close();
    toast("Welcome back", "Your Daysie account is connected.");
  }

  byId("passkeySignInBtn")?.addEventListener("click", async () => {
    try {
      if (!window.PublicKeyCredential || !window.daysieAuthClient) throw new Error("Passkeys are not supported in this browser.");
      const result = await window.daysieAuthClient.signIn.passkey();
      if (result.error) throw new Error(result.error.message || "Passkey sign-in failed");
      const token = window.__daysieLatestAuthToken;
      if (!token || !result.data?.user) throw new Error("Could not start the passkey session.");
      await finishRecoveredSession(token, result.data.user);
    } catch (error) { setAuthStatus(error.message, true); }
  });

  byId("showRecoveryBtn")?.addEventListener("click", () => {
    showAuthPanel("recovery");
  });
  byId("backFromRecoveryBtn")?.addEventListener("click", () => {
    showAuthPanel("signIn");
  });
  byId("recoverySignInForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const response = await fetch(`${API}/account/recover`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: byId("recoveryEmail").value, code: byId("recoveryCode").value }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Recovery failed");
      await finishRecoveredSession(data.token, data.user);
    } catch (error) { setAuthStatus(error.message, true); }
  });

  byId("addPasskeyBtn")?.addEventListener("click", async () => {
    try {
      const suggested = /iPhone|iPad/.test(navigator.userAgent) ? "My Apple device" : /Android/.test(navigator.userAgent) ? "My Android device" : "My computer";
      const name = prompt("Name this passkey", suggested);
      if (!name) return;
      const result = await window.daysieAuthClient.passkey.addPasskey({ name: name.slice(0, 48) });
      if (result.error) throw new Error(result.error.message || "Could not add passkey");
      toast("Passkey added", "You can now sign in without typing your password.");
    } catch (error) { toast("Could not add passkey", error.message); }
  });

  byId("generateRecoveryCodesBtn")?.addEventListener("click", async () => {
    try {
      if (!confirm("Generate new recovery codes? Any old codes will stop working.")) return;
      const data = await request("/account/recovery-codes", { method: "POST", body: "{}" });
      const box = byId("recoveryCodesResult");
      box.innerHTML = `<p><b>Save these now. They are shown only once.</b></p><pre>${safe(data.codes.join("\n"))}</pre><button type="button" class="soft wide" id="copyRecoveryCodesBtn">Copy codes</button>`;
      box.classList.remove("hidden");
      byId("copyRecoveryCodesBtn").onclick = () => navigator.clipboard.writeText(data.codes.join("\n")).then(() => toast("Copied", "Recovery codes copied."));
    } catch (error) { toast("Could not generate codes", error.message); }
  });

  async function loadDevices() {
    if (!settings.authToken) return;
    const list = byId("deviceSessionList");
    try {
      const data = await request("/account/sessions");
      list.innerHTML = data.sessions.length ? data.sessions.map((session) => `<div class="feature-row"><div><b>${safe(session.name)}${session.current ? " · This device" : ""}</b><small>${safe(session.userAgent)} · expires ${new Date(session.expiresAt).toLocaleDateString()}</small></div><div class="row-actions"><button class="text-button" data-rename-session="${safe(session.id)}">Rename</button>${session.current ? "" : `<button class="text-button danger-text" data-delete-session="${safe(session.id)}">Log out</button>`}</div></div>`).join("") : "<small>No active sessions.</small>";
      list.querySelectorAll("[data-rename-session]").forEach((button) => button.onclick = async () => { const name = prompt("Device name"); if (!name) return; await request("/account/sessions/name", { method: "POST", body: JSON.stringify({ sessionId: button.dataset.renameSession, name }) }); await loadDevices(); });
      list.querySelectorAll("[data-delete-session]").forEach((button) => button.onclick = async () => { if (!confirm("Log out this device?")) return; await request(`/account/sessions/${encodeURIComponent(button.dataset.deleteSession)}`, { method: "DELETE" }); await loadDevices(); });
    } catch (error) { list.innerHTML = `<small>${safe(error.message)}</small>`; }
  }
  byId("refreshDevicesBtn")?.addEventListener("click", loadDevices);

  async function loadInvitesAndActivity() {
    if (!settings.authToken) return;
    try {
      const [invites, activity] = await Promise.all([request("/family/invites"), request("/family/activity")]);
      const inviteList = byId("pendingInviteList");
      inviteList.innerHTML = invites.invites.length ? `<small class="section-caption">Pending invites</small>${invites.invites.map((invite) => `<div class="feature-row"><div><b>${safe(invite.email || invite.code)}</b><small>${safe(invite.code)} · expires ${relative(invite.expiresAt)}</small></div><div class="row-actions">${invite.email ? `<button class="text-button" data-resend-invite="${safe(invite.code)}">Resend</button>` : ""}<button class="text-button danger-text" data-revoke-invite="${safe(invite.code)}">Revoke</button></div></div>`).join("")}` : "";
      inviteList.querySelectorAll("[data-resend-invite]").forEach((button) => button.onclick = async () => { try { await request("/family/invites/resend", { method: "POST", body: JSON.stringify({ code: button.dataset.resendInvite }) }); toast("Invite resent", "A fresh email is on its way."); await loadInvitesAndActivity(); } catch (error) { toast("Could not resend", error.message); } });
      inviteList.querySelectorAll("[data-revoke-invite]").forEach((button) => button.onclick = async () => { if (!confirm("Revoke this invite?")) return; await request(`/family/invites/${encodeURIComponent(button.dataset.revokeInvite)}`, { method: "DELETE" }); await loadInvitesAndActivity(); });
      const activityList = byId("familyActivityList");
      const actionText = { "invite-created": "created an invite", "invite-resent": "resent an invite", "invite-revoked": "revoked an invite", "member-joined": "joined the family", "member-left": "left the family" };
      activityList.innerHTML = activity.activity.length ? activity.activity.map((item) => `<div class="feature-row"><div><b>${safe(item.emoji)} ${safe(item.name)} ${safe(actionText[item.action] || item.action)}</b><small>${new Date(item.createdAt).toLocaleString()}</small></div></div>`).join("") : "<small>No family activity yet.</small>";
    } catch (error) { console.error("Family settings load failed", error); }
  }

  async function getBackupKey(create = false) {
    let encoded = localStorage.getItem(BACKUP_KEY);
    if (!encoded && create) { const bytes = crypto.getRandomValues(new Uint8Array(32)); encoded = base64(bytes); localStorage.setItem(BACKUP_KEY, encoded); }
    return encoded;
  }
  async function encryptedEnvelope() {
    const encoded = await getBackupKey(true);
    const key = await crypto.subtle.importKey("raw", unbase64(encoded), "AES-GCM", false, ["encrypt"]);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode(JSON.stringify(db));
    const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext));
    return { version: 1, algorithm: "AES-GCM", iv: base64(iv), ciphertext: base64(ciphertext) };
  }
  async function backupNow(silent = false) {
    if (!settings.authToken || !localStorage.getItem(BACKUP_KEY)) return;
    try { await request("/backups", { method: "POST", body: JSON.stringify({ envelope: await encryptedEnvelope() }) }); localStorage.setItem("daysie.lastEncryptedBackup", String(Date.now())); if (!silent) toast("Backup saved", "Your encrypted backup was uploaded."); await loadBackups(); }
    catch (error) { if (!silent) toast("Backup failed", error.message); }
  }
  async function restoreBackup(id) {
    const encoded = prompt("Enter your Daysie backup recovery key", localStorage.getItem(BACKUP_KEY) || "");
    if (!encoded || !confirm("Replace this device's Daysie data with this backup?")) return;
    const data = await request(`/backups/${encodeURIComponent(id)}`);
    const key = await crypto.subtle.importKey("raw", unbase64(encoded.trim()), "AES-GCM", false, ["decrypt"]);
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unbase64(data.envelope.iv) }, key, unbase64(data.envelope.ciphertext));
    const restored = normalizeImport(JSON.parse(new TextDecoder().decode(plaintext)));
    Object.assign(db, restored); localStorage.setItem(KEY, JSON.stringify(db)); renderAll(); await syncToCloud(true); toast("Backup restored", "This device now uses the restored data.");
  }
  async function loadBackups() {
    if (!settings.authToken) return;
    const list = byId("backupList");
    try { const data = await request("/backups"); list.innerHTML = data.backups.length ? data.backups.map((backup) => `<div class="feature-row"><div><b>${new Date(backup.createdAt).toLocaleString()}</b><small>${Math.max(1, Math.round(backup.size / 1024))} KB · client-side encrypted</small></div><button class="text-button" data-restore-backup="${safe(backup.id)}">Restore</button></div>`).join("") : "<small>No encrypted backups yet.</small>"; list.querySelectorAll("[data-restore-backup]").forEach((button) => button.onclick = () => restoreBackup(button.dataset.restoreBackup).catch((error) => toast("Restore failed", error.message))); }
    catch (error) { list.innerHTML = `<small>${safe(error.message)}</small>`; }
  }
  byId("enableBackupsBtn")?.addEventListener("click", async () => { await getBackupKey(true); byId("enableBackupsBtn").textContent = "Encrypted backups enabled"; await backupNow(); });
  byId("backupNowBtn")?.addEventListener("click", () => backupNow());
  byId("copyBackupKeyBtn")?.addEventListener("click", async () => { const key = await getBackupKey(false); if (!key) return toast("Backups are off", "Enable encrypted backups first."); await navigator.clipboard.writeText(key); toast("Recovery key copied", "Store it somewhere safe. Daysie cannot recover it for you."); });

  async function loadNotificationPreferences() {
    if (!settings.authToken) return;
    try {
      const prefs = await request("/notification-preferences");
      byId("notifyReminders").checked = prefs.categories.reminders;
      byId("notifyFamily").checked = prefs.categories.family;
      byId("notifyLists").checked = prefs.categories.lists;
      byId("quietStart").value = prefs.quietStart || "22:00";
      byId("quietEnd").value = prefs.quietEnd || "07:00";
      byId("notificationTone").value = prefs.tone || "system";
      byId("notificationVibration").value = prefs.vibration || "system";
      settings.notificationTone = prefs.tone || "system";
      settings.notificationVibration = prefs.vibration || "system";
      saveSettings();
    } catch (error) { console.error(error); }
    byId("timezoneLabel").textContent = `Timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`;
    const appleMobile = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const vibrationSupported = "vibrate" in navigator;
    byId("notificationPlatformNote").textContent = appleMobile
      ? "On iPhone and iPad, iOS controls the background notification sound and vibration. Your chosen Daysie tone plays while the app is open."
      : vibrationSupported
        ? "Custom tones play while Daysie is open. Background notifications use your system sound; vibration patterns are requested where supported."
        : "Custom tones play while Daysie is open. Background sound and vibration are controlled by your operating system.";
  }
  byId("saveNotificationPrefsBtn")?.addEventListener("click", async () => {
    try {
      const tone = byId("notificationTone").value;
      const vibration = byId("notificationVibration").value;
      await request("/notification-preferences", { method: "PUT", body: JSON.stringify({ quietStart: byId("quietStart").value, quietEnd: byId("quietEnd").value, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, tone, vibration, categories: { reminders: byId("notifyReminders").checked, family: byId("notifyFamily").checked, lists: byId("notifyLists").checked } }) });
      settings.notificationTone = tone;
      settings.notificationVibration = vibration;
      saveSettings();
      toast("Preferences saved", "Notification choices apply across your account.");
    } catch (error) { toast("Could not save", error.message); }
  });

  const deliveryText = (device) => {
    if (device.lastSuccessAt) return `Last delivered ${new Date(device.lastSuccessAt).toLocaleString()}`;
    if (device.lastFailureAt) return `Last attempt failed${device.lastStatus ? ` · status ${device.lastStatus}` : ""}`;
    return "Connected · waiting for its first delivery";
  };
  async function loadPushStatus() {
    if (!settings.authToken) return;
    const list = byId("notificationDeviceList");
    try {
      const status = await request("/push/status");
      list.innerHTML = status.devices.length
        ? status.devices.map((device) => `<div class="notification-device-status"><span>${device.lastSuccessAt ? "✅" : device.lastFailureAt ? "⚠️" : "🔔"}</span><b>${safe(device.name)}</b><small>${safe(deliveryText(device))}</small></div>`).join("")
        : "<small>No devices are connected for closed-app notifications yet.</small>";
    } catch (error) { list.innerHTML = `<small>${safe(error.message)}</small>`; }
  }
  byId("previewNotificationToneBtn")?.addEventListener("click", () => {
    settings.notificationTone = byId("notificationTone").value;
    settings.notificationVibration = byId("notificationVibration").value;
    playNotificationTone(settings.notificationTone);
    vibrateReminder(settings.notificationVibration);
  });
  byId("sendTestNotificationBtn")?.addEventListener("click", async () => {
    const button = byId("sendTestNotificationBtn");
    button.disabled = true;
    try {
      if (!("Notification" in window)) throw new Error("Notifications are not supported in this browser.");
      if (isIOS() && !isStandalone()) throw new Error('On iPhone or iPad, add Daysie to your Home Screen, open it there, then enable notifications.');
      if (Notification.permission !== "granted") await enableNotifications();
      if (Notification.permission !== "granted") throw new Error("Allow notifications first, then try again.");
      await refreshPushSubscription();
      const result = await request("/push/test", { method: "POST", body: "{}" });
      toast("Test sent", `Delivered to ${result.sent} of ${result.attempted} connected device${result.attempted === 1 ? "" : "s"}.`);
      await loadPushStatus();
    } catch (error) { toast("Test notification failed", error.message); }
    finally { button.disabled = false; }
  });

  async function refreshHealth() {
    const list = byId("pwaHealthList"); if (!list) return;
    const permission = "Notification" in window ? Notification.permission : "unsupported";
    const checks = [{ label: "Online", ok: navigator.onLine }, { label: "Offline app", ok: "serviceWorker" in navigator && Boolean(await navigator.serviceWorker.getRegistration()) }, { label: "Notifications", ok: permission === "granted", detail: permission }, { label: "Installed", ok: matchMedia("(display-mode: standalone)").matches || navigator.standalone === true }];
    try { const health = await (await fetch(`${API}/health`)).json(); checks.push({ label: "Cloud database", ok: health.storage?.d1 }, { label: "Push service", ok: health.services?.push }, { label: "Cloud photos", ok: health.storage?.photos }, { label: "Transactional email", ok: health.services?.email }, { label: "Passkeys", ok: health.services?.passkeys }); } catch { checks.push({ label: "Daysie API", ok: false }); }
    list.innerHTML = checks.map((check) => `<div><span>${check.ok ? "✅" : "⚠️"}</span><b>${safe(check.label)}</b>${check.detail ? `<small>${safe(check.detail)}</small>` : ""}</div>`).join("");
  }
  byId("refreshHealthBtn")?.addEventListener("click", refreshHealth);

  byId("deleteAccountBtn")?.addEventListener("click", async () => {
    const password = byId("deleteAccountPassword").value;
    if (!password || !confirm("Permanently delete your account and all cloud data? This cannot be undone.")) return;
    try { await request("/account/delete", { method: "POST", body: JSON.stringify({ password }) }); localStorage.removeItem(SETTINGS_KEY); localStorage.removeItem(BACKUP_KEY); settings.authToken = null; settings.userId = null; settings.authEmail = null; settings.authUsername = null; saveSettings(); updateAccountUI(); byId("settingsDialog")?.close(); toast("Account deleted", "Cloud data and sessions were permanently removed."); }
    catch (error) { toast("Could not delete account", error.message); }
  });

  const originalUpdateAccountUI = updateAccountUI;
  updateAccountUI = function enhancedUpdateAccountUI() {
    originalUpdateAccountUI();
    if (settings.authToken) { loadDevices(); loadInvitesAndActivity(); loadBackups(); loadNotificationPreferences(); loadPushStatus(); refreshHealth(); byId("enableBackupsBtn").textContent = localStorage.getItem(BACKUP_KEY) ? "Encrypted backups enabled" : "Enable encrypted backups"; }
  };
  setTimeout(() => settings.authToken && updateAccountUI(), 900);
  setInterval(() => { const last = Number(localStorage.getItem("daysie.lastEncryptedBackup") || 0); if (settings.authToken && localStorage.getItem(BACKUP_KEY) && Date.now() - last > 6 * 60 * 60 * 1000) backupNow(true); }, 5 * 60 * 1000);
})();
