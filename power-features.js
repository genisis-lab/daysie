/* Daysie feature suite: security, sync history, family planning, search, routines,
   trash, import preview, storage insights, accessibility, and performance. */
(() => {
  const byId = (id) => document.getElementById(id);
  const safe = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character],
    );
  const auth = () => ({ Authorization: `Bearer ${settings.authToken}` });
  const featureRequest = async (path, options = {}) => {
    const response = await daysieAuthenticatedFetch(`${API}${path}`, {
      ...options,
      credentials: "include",
      headers: {
        ...auth(),
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {}),
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(response.status === 401 ? "Your session expired. Sign in again to continue." : data.error || data.message || "Request failed");
    return data;
  };
  const authGet = async (path) => {
    const response = await daysieAuthenticatedFetch(`${API}/api/auth${path}`, {
      credentials: "include",
      headers: auth(),
    });
    const data = await response.json().catch(() => ([]));
    if (!response.ok) throw new Error(data.message || data.error || "Request failed");
    return data;
  };
  const bytes = (value) => {
    const size = Number(value || 0);
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(size > 10240 ? 0 : 1)} KB`;
    return `${(size / 1024 / 1024).toFixed(1)} MB`;
  };
  const dateTime = (value) => new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  let accountOverview = null;
  let twoFactorUri = "";
  let familyDashboard = null;
  let searchKind = "all";
  const sentMetrics = new Set();

  function captureReplacementToken(result) {
    const token = result?.data?.token || result?.response?.headers?.get?.("set-auth-token");
    if (token) {
      settings.authToken = token;
      saveSettings();
    }
  }

  async function loadPasskeys() {
    const list = byId("passkeyList");
    if (!settings.authToken || !list) return;
    try {
      const result = await authGet("/passkey/list-user-passkeys");
      const passkeys = Array.isArray(result) ? result : result.passkeys || [];
      list.innerHTML = passkeys.length
        ? passkeys
            .map(
              (passkey) => `<div class="feature-row"><div><b>${safe(passkey.name || "Passkey")}</b><small>${passkey.deviceType === "multiDevice" ? "Synced passkey" : "This device"} · added ${new Date(passkey.createdAt || Date.now()).toLocaleDateString()}</small></div><div class="row-actions"><button type="button" class="text-button" data-rename-passkey="${safe(passkey.id)}">Rename</button><button type="button" class="text-button danger-text" data-delete-passkey="${safe(passkey.id)}">Remove</button></div></div>`,
            )
            .join("")
        : "<small>No passkeys yet. Add one for quick, phishing-resistant sign-in.</small>";
      list.querySelectorAll("[data-rename-passkey]").forEach((button) => {
        button.onclick = async () => {
          const name = prompt("Passkey name", "My device")?.trim();
          if (!name) return;
          try {
            await authRequest(
              "/passkey/update-passkey",
              { id: button.dataset.renamePasskey, name: name.slice(0, 48) },
              settings.authToken,
            );
            await loadPasskeys();
            toast("Passkey renamed", name);
          } catch (error) {
            toast("Could not rename passkey", error.message);
          }
        };
      });
      list.querySelectorAll("[data-delete-passkey]").forEach((button) => {
        button.onclick = async () => {
          if (passkeys.length === 1 && !accountOverview?.hasPassword) {
            return toast("Keep one sign-in method", "Add a password or another passkey before removing this one.");
          }
          if (!confirm("Remove this passkey? You will no longer be able to sign in with it.")) return;
          try {
            await authRequest(
              "/passkey/delete-passkey",
              { id: button.dataset.deletePasskey },
              settings.authToken,
            );
            await loadAccountProtection();
            toast("Passkey removed", "Your other sign-in methods still work.");
          } catch (error) {
            toast("Could not remove passkey", error.message);
          }
        };
      });
    } catch (error) {
      list.innerHTML = `<small>${safe(error.message)}</small>`;
    }
  }

  function renderTwoFactorStatus() {
    const enabled = Boolean(accountOverview?.twoFactorEnabled);
    byId("twoFactorStatus").textContent = enabled
      ? "On — password sign-ins require an authenticator or backup code."
      : "Off — add an authenticator for an extra sign-in check.";
    byId("enableTwoFactorForm")?.classList.toggle("hidden", enabled);
    byId("disableTwoFactorForm")?.classList.toggle("hidden", !enabled);
    if (enabled) byId("twoFactorSetupResult")?.classList.add("hidden");
  }

  async function loadAccountProtection() {
    if (!settings.authToken) return;
    try {
      accountOverview = await featureRequest("/features/account/overview");
      renderTwoFactorStatus();
      await loadPasskeys();
    } catch (error) {
      byId("twoFactorStatus").textContent = error.message;
    }
  }

  byId("enableTwoFactorForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = byId("enableTwoFactorBtn");
    setButtonBusy(button, true, "Preparing…");
    try {
      const result = await authRequest(
        "/two-factor/enable",
        { password: byId("twoFactorPassword").value, issuer: "Daysie" },
        settings.authToken,
      );
      twoFactorUri = result.data.totpURI;
      const codes = result.data.backupCodes || [];
      byId("twoFactorSetupResult").classList.remove("hidden");
      byId("twoFactorBackupCodes").innerHTML = `<p><b>Save these backup codes now</b></p>${codes.map((code) => `<code>${safe(code)}</code>`).join("")}`;
      if (window.daysieQRCode) {
        await window.daysieQRCode.toCanvas(byId("twoFactorQr"), twoFactorUri, {
          width: 180,
          margin: 1,
          color: { dark: "#332b24", light: "#ffffff" },
        });
      }
      byId("twoFactorSetupCode")?.focus();
    } catch (error) {
      toast("Could not start two-step setup", error.message);
    } finally {
      setButtonBusy(button, false);
    }
  });
  byId("copyTwoFactorUriBtn")?.addEventListener("click", async () => {
    if (!twoFactorUri) return;
    await navigator.clipboard.writeText(twoFactorUri);
    toast("Setup key copied", "Paste it into your authenticator app.");
  });
  byId("confirmTwoFactorBtn")?.addEventListener("click", async (event) => {
    setButtonBusy(event.currentTarget, true, "Confirming…");
    try {
      const result = await authRequest(
        "/two-factor/verify-totp",
        { code: byId("twoFactorSetupCode").value.trim() },
        settings.authToken,
      );
      captureReplacementToken(result);
      byId("enableTwoFactorForm").reset();
      byId("twoFactorSetupResult").classList.add("hidden");
      await loadAccountProtection();
      toast("Two-step verification is on", "Save your backup codes in a safe place.");
    } catch (error) {
      toast("Code was not accepted", error.message);
    } finally {
      setButtonBusy(event.currentTarget, false);
    }
  });
  byId("disableTwoFactorForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!confirm("Turn off two-step verification for password sign-in?")) return;
    const button = byId("disableTwoFactorBtn");
    setButtonBusy(button, true, "Turning off…");
    try {
      const result = await authRequest(
        "/two-factor/disable",
        { password: byId("disableTwoFactorPassword").value },
        settings.authToken,
      );
      captureReplacementToken(result);
      event.currentTarget.reset();
      await loadAccountProtection();
      toast("Two-step verification is off", "You can turn it on again any time.");
    } catch (error) {
      toast("Could not turn off two-step verification", error.message);
    } finally {
      setButtonBusy(button, false);
    }
  });
  byId("addPasskeyBtn")?.addEventListener("click", () => setTimeout(loadAccountProtection, 1600));

  async function loadSyncHistory() {
    const list = byId("syncHistoryList");
    if (!settings.authToken || !list) return;
    try {
      const data = await featureRequest("/features/sync/history");
      list.innerHTML = data.versions.length
        ? data.versions
            .map(
              (version) => `<div class="feature-row"><div><b>Revision ${version.revision}</b><small>${safe(version.source)} · ${dateTime(version.createdAt)} · ${bytes(version.size)}</small></div><button type="button" class="text-button" data-restore-version="${safe(version.id)}">Restore</button></div>`,
            )
            .join("")
        : "<small>Your first cloud version will appear after the next sync.</small>";
      list.querySelectorAll("[data-restore-version]").forEach((button) => {
        button.onclick = async () => {
          if (!confirm("Restore this cloud version? Daysie will keep your current version in history.")) return;
          try {
            const restored = await featureRequest(
              `/features/sync/history/${encodeURIComponent(button.dataset.restoreVersion)}/restore`,
              { method: "POST", body: "{}" },
            );
            applyCloudPayload({ ...restored.data, _sync: { revision: restored.revision, updatedAt: Date.now() } });
            await loadSyncHistory();
            toast("Cloud version restored", "Your previous state is available in history if you change your mind.");
          } catch (error) {
            toast("Could not restore version", error.message);
          }
        };
      });
    } catch (error) {
      list.innerHTML = `<small>${safe(error.message)}</small>`;
    }
  }
  byId("refreshSyncHistoryBtn")?.addEventListener("click", loadSyncHistory);

  async function loadSecurityActivity() {
    const list = byId("securityActivityList");
    if (!settings.authToken || !list) return;
    const labels = {
      "account-created": "Account created",
      "signed-in": "Signed in",
      "two-factor-sign-in": "Two-step sign-in completed",
      "passkey-sign-in": "Passkey sign-in completed",
    };
    try {
      const data = await featureRequest("/features/security/events");
      list.innerHTML = data.events.length
        ? data.events
            .map(
              (item) => `<div class="feature-row"><div><b>${safe(labels[item.event] || item.event.replaceAll("-", " "))}</b><small>${dateTime(item.createdAt)}${item.ip ? ` · ${safe(item.ip)}` : ""}</small></div></div>`,
            )
            .join("")
        : "<small>No security activity recorded yet.</small>";
    } catch (error) {
      list.innerHTML = `<small>${safe(error.message)}</small>`;
    }
  }

  async function loadStorage() {
    const target = byId("storageDashboard");
    if (!target || !settings.authToken) return;
    try {
      const cloud = await featureRequest("/features/account/storage");
      const localBytes = new Blob([localStorage.getItem(KEY) || ""]).size;
      const values = [
        ["This device", bytes(localBytes)],
        ["Cloud sync", bytes(cloud.syncBytes)],
        [`${cloud.photos.count} photos`, bytes(cloud.photos.bytes)],
        [`${cloud.backups.count} backups`, bytes(cloud.backups.bytes)],
        [`${cloud.history.count} versions`, bytes(cloud.history.bytes)],
        ["Family records", `${cloud.familyEvents} events · ${cloud.comments} comments`],
      ];
      target.innerHTML = values.map(([label, value]) => `<div class="storage-stat"><b>${safe(value)}</b><small>${safe(label)}</small></div>`).join("");
    } catch (error) {
      target.innerHTML = `<small>${safe(error.message)}</small>`;
    }
  }

  function renderTrash() {
    const list = byId("trashList");
    if (!list) return;
    db.trash ||= [];
    list.innerHTML = db.trash.length
      ? db.trash
          .map((item) => {
            const title = item.value?.title || item.value?.name || item.value?.text || "Deleted item";
            return `<div class="feature-row"><div><b>${safe(title)}</b><small>${safe(item.type)} · deleted ${dateTime(item.deletedAt)}</small></div><div class="row-actions"><button type="button" class="text-button" data-restore-trash="${safe(item.id)}">Restore</button><button type="button" class="text-button danger-text" data-delete-trash="${safe(item.id)}">Delete now</button></div></div>`;
          })
          .join("")
      : "<small>Trash is empty.</small>";
    list.querySelectorAll("[data-restore-trash]").forEach((button) => {
      button.onclick = () => {
        const item = db.trash.find((candidate) => candidate.id === button.dataset.restoreTrash);
        restoreTrashItem(item);
        renderTrash();
        toast("Restored", "Your item is back.");
      };
    });
    list.querySelectorAll("[data-delete-trash]").forEach((button) => {
      button.onclick = () => {
        db.trash = db.trash.filter((item) => item.id !== button.dataset.deleteTrash);
        save();
        renderTrash();
      };
    });
  }
  byId("emptyTrashBtn")?.addEventListener("click", () => {
    if (!db.trash?.length || !confirm("Permanently delete everything in Recently deleted?")) return;
    db.trash = [];
    save();
    renderTrash();
  });
  window.addEventListener("daysie:trash-changed", renderTrash);

  function renderFamilyCalendarMarkers() {
    if (!familyDashboard?.events?.length) return;
    document.querySelectorAll("#calGrid [data-date]").forEach((cell) => {
      const count = familyDashboard.events.filter((event) => day(new Date(event.startsAt)) === cell.dataset.date).length;
      if (count && !cell.querySelector(".family-event-marker")) {
        const marker = document.createElement("span");
        marker.className = "family-event-marker";
        marker.textContent = count === 1 ? "👪" : `👪${count}`;
        marker.title = `${count} family event${count === 1 ? "" : "s"}`;
        cell.append(marker);
      }
    });
  }

  async function addFamilyComment(itemId, reaction = null) {
    const comment = reaction ? "" : prompt("Add a family comment")?.trim();
    if (!reaction && !comment) return;
    await featureRequest("/features/family/comments", {
      method: "POST",
      body: JSON.stringify({ itemId, body: comment, reaction }),
    });
    toast(reaction ? "Reaction added" : "Comment added", "Your family can see it now.");
  }

  async function openFamilyDiscussion(itemId) {
    let dialog = byId("familyDiscussionDialog");
    if (!dialog) {
      dialog = document.createElement("dialog");
      dialog.id = "familyDiscussionDialog";
      dialog.innerHTML = `<div class="modal"><div class="modal-head"><h2>Family discussion</h2><button type="button" class="modal-close" aria-label="Close discussion">✕</button></div><div id="familyDiscussionList" class="feature-list"></div><form id="familyDiscussionForm" class="auth-form"><label for="familyDiscussionText">Add a comment</label><textarea id="familyDiscussionText" maxlength="500" required></textarea><button type="submit" class="primary wide">Send comment</button></form><div class="row-actions" aria-label="Add a reaction"><button type="button" class="soft" data-discuss-reaction="👍">👍</button><button type="button" class="soft" data-discuss-reaction="❤️">❤️</button><button type="button" class="soft" data-discuss-reaction="🎉">🎉</button><button type="button" class="soft" data-discuss-reaction="✅">✅</button></div></div>`;
      document.body.append(dialog);
      dialog.querySelector(".modal-close").onclick = () => dialog.close();
    }
    const render = async () => {
      const data = await featureRequest(`/features/family/comments?itemId=${encodeURIComponent(itemId)}`);
      byId("familyDiscussionList").innerHTML = data.comments.length
        ? data.comments.map((comment) => `<div class="feature-row"><div><b>${safe(comment.emoji)} ${safe(comment.name)} ${comment.reaction ? safe(comment.reaction) : ""}</b>${comment.body ? `<p>${safe(comment.body)}</p>` : ""}<small>${dateTime(comment.createdAt)}</small></div>${comment.isMe ? `<button type="button" class="text-button danger-text" data-delete-comment="${safe(comment.id)}">Delete</button>` : ""}</div>`).join("")
        : "<small>No comments yet. Start the conversation.</small>";
      byId("familyDiscussionList").querySelectorAll("[data-delete-comment]").forEach((button) => {
        button.onclick = async () => {
          await featureRequest(`/features/family/comments/${encodeURIComponent(button.dataset.deleteComment)}`, { method: "DELETE" });
          await render();
        };
      });
    };
    byId("familyDiscussionForm").onsubmit = async (event) => {
      event.preventDefault();
      const comment = byId("familyDiscussionText").value.trim();
      if (!comment) return;
      await featureRequest("/features/family/comments", { method: "POST", body: JSON.stringify({ itemId, body: comment }) });
      event.currentTarget.reset();
      await render();
    };
    dialog.querySelectorAll("[data-discuss-reaction]").forEach((button) => {
      button.onclick = async () => {
        await featureRequest("/features/family/comments", { method: "POST", body: JSON.stringify({ itemId, reaction: button.dataset.discussReaction }) });
        await render();
      };
    });
    await render();
    dialog.showModal();
    byId("familyDiscussionText")?.focus();
  }

  async function loadFamilyDashboard() {
    const target = byId("familyDashboard");
    if (!target || !settings.authToken) return;
    try {
      familyDashboard = await featureRequest("/features/family/dashboard");
      if (!familyDashboard.familyId) {
        target.innerHTML = "<small>Invite a family member to start a shared dashboard and calendar.</small>";
        return;
      }
      const upcoming = familyDashboard.events.slice(0, 6);
      const assignments = familyDashboard.assignments.slice(0, 6);
      const listItems = familyDashboard.lists.reduce((sum, list) => sum + (list.items || []).filter((item) => !item.done).length, 0);
      target.innerHTML = `
        <div class="family-summary"><h4>Who’s available</h4>${familyDashboard.members.map((member) => `<p><span class="availability-dot ${safe(member.availability)}"></span>${safe(member.emoji)} ${safe(member.name)} · ${safe(member.availability)}${member.availabilityNote ? ` · ${safe(member.availabilityNote)}` : ""}${member.availabilityUntil ? ` until ${dateTime(member.availabilityUntil)}` : ""}</p>`).join("")}</div>
        <div class="family-summary"><h4>Coming up</h4>${upcoming.length ? upcoming.map((event) => `<p><b>${safe(event.title)}</b><br><small>${dateTime(event.startsAt)}${event.recurrence !== "none" ? ` · ${safe(event.recurrence)}` : ""}</small> <button type="button" class="text-button" data-delete-family-event="${safe(event.id)}">Delete</button></p>`).join("") : "<p>No family events yet.</p>"}</div>
        <div class="family-summary"><h4>Household pulse</h4><p>${assignments.length} open assignment${assignments.length === 1 ? "" : "s"} · ${listItems} list item${listItems === 1 ? "" : "s"} left</p>${assignments.map((item) => `<p><b>${safe(item.payload?.title || item.kind)}</b><br><button type="button" class="text-button" data-discuss-item="${safe(item.id)}">Open discussion</button> <button type="button" class="text-button" data-react-item="${safe(item.id)}">👍</button></p>`).join("")}</div>`;
      target.querySelectorAll("[data-delete-family-event]").forEach((button) => {
        button.onclick = async () => {
          if (!confirm("Delete this family event?")) return;
          await featureRequest(`/features/family/events/${encodeURIComponent(button.dataset.deleteFamilyEvent)}`, { method: "DELETE" });
          await loadFamilyDashboard();
        };
      });
      target.querySelectorAll("[data-discuss-item]").forEach((button) => {
        button.onclick = () => openFamilyDiscussion(button.dataset.discussItem).catch((error) => toast("Could not open discussion", error.message));
      });
      target.querySelectorAll("[data-react-item]").forEach((button) => {
        button.onclick = () => addFamilyComment(button.dataset.reactItem, "👍").catch((error) => toast("Could not react", error.message));
      });
      const me = familyDashboard.members.find((member) => member.isMe);
      if (me) byId("familyAvailability").value = me.availability || "free";
      renderFamilyCalendarMarkers();
    } catch (error) {
      target.innerHTML = `<small>${safe(error.message)}</small>`;
    }
  }
  byId("familyAvailability")?.addEventListener("change", async (event) => {
    try {
      await featureRequest("/features/family/availability", {
        method: "PUT",
        body: JSON.stringify({ availability: event.target.value }),
      });
      await loadFamilyDashboard();
    } catch (error) {
      toast("Could not update availability", error.message);
    }
  });
  byId("familyEventForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const start = new Date(byId("familyEventStart").value).getTime();
    try {
      await featureRequest("/features/family/events", {
        method: "POST",
        body: JSON.stringify({
          title: byId("familyEventTitle").value,
          startsAt: start,
          note: byId("familyEventNote").value,
          recurrence: byId("familyEventRecurrence").value,
        }),
      });
      event.currentTarget.reset();
      event.currentTarget.closest("details").open = false;
      await loadFamilyDashboard();
      toast("Family event added", "It is now on your shared calendar.");
    } catch (error) {
      toast("Could not add event", error.message);
    }
  });
  byId("profileBtn")?.addEventListener("click", () => setTimeout(loadFamilyDashboard, 80));

  function quickPreview(input, target) {
    if (!input || !target || typeof parseQuickAdd !== "function") return;
    const update = () => {
      if (!input.value.trim()) return target.classList.add("hidden");
      const parsed = parseQuickAdd(input.value);
      const bits = [parsed.title, parsed.due ? dateTime(parsed.due) : "No date", parsed.repeat !== "none" ? `Repeats ${parsed.repeat}` : "", parsed.priority === "high" ? "Important" : ""].filter(Boolean);
      target.textContent = bits.join(" · ");
      target.classList.remove("hidden");
    };
    input.addEventListener("input", update);
    input.addEventListener("blur", () => setTimeout(() => target.classList.add("hidden"), 150));
  }
  quickPreview(byId("quickAddToday"), byId("quickAddTodayPreview"));
  quickPreview(byId("quickAddTasks"), byId("quickAddTasksPreview"));

  function renderRoutines() {
    const list = byId("routineList");
    if (!list) return;
    db.routines ||= [];
    list.innerHTML = db.routines.length
      ? db.routines.map((routine) => `<div class="feature-row"><div><b>${safe(routine.name)}</b><small>${routine.steps.length} steps · ${safe(routine.repeat)}</small></div><div class="row-actions"><button type="button" class="text-button" data-start-routine="${safe(routine.id)}">Start</button><button type="button" class="text-button danger-text" data-delete-routine="${safe(routine.id)}">Delete</button></div></div>`).join("")
      : "<small>No custom routines yet.</small>";
    list.querySelectorAll("[data-start-routine]").forEach((button) => {
      button.onclick = () => {
        const routine = db.routines.find((item) => item.id === button.dataset.startRoutine);
        if (!routine) return;
        const now = Date.now();
        routine.steps.forEach((title, index) => getProfile().tasks.push({ id: id(), title, note: `Part of ${routine.name}`, due: now + (index + 1) * 60000, repeat: routine.repeat, priority: "low", category: "chores", subtasks: [], done: false, notified: false, created: now, updatedAt: now }));
        routine.lastStartedAt = now;
        save();
        renderAll();
        byId("listDialog")?.close();
        toast("Routine started", `${routine.steps.length} reminders are ready.`);
      };
    });
    list.querySelectorAll("[data-delete-routine]").forEach((button) => {
      button.onclick = () => {
        db.routines = db.routines.filter((item) => item.id !== button.dataset.deleteRoutine);
        save();
        renderRoutines();
      };
    });
  }
  byId("routineForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const steps = byId("routineSteps").value.split("\n").map((step) => step.trim()).filter(Boolean).slice(0, 30);
    if (!steps.length) return;
    db.routines ||= [];
    db.routines.push({ id: id(), name: byId("routineName").value.trim(), steps, repeat: byId("routineRepeat").value, createdAt: Date.now(), updatedAt: Date.now() });
    event.currentTarget.reset();
    save();
    renderRoutines();
    toast("Routine saved", "Start it whenever your household is ready.");
  });
  byId("manageListsBtn")?.addEventListener("click", () => setTimeout(renderRoutines, 0));

  function allSearchRecords() {
    const records = [];
    (db.profiles || []).forEach((profile) => {
      (profile.tasks || []).forEach((item) => records.push({ kind: "tasks", title: item.title, detail: [item.note, item.category].filter(Boolean).join(" · "), tab: "tasks" }));
      (profile.entries || []).forEach((item) => records.push({ kind: "journal", title: item.text || "Journal entry", detail: (item.tags || []).join(" · "), tab: "journal" }));
    });
    (db.lists || []).filter((list) => !list.deleted).forEach((list) => {
      records.push({ kind: "lists", title: list.name, detail: `${(list.items || []).length} items`, tab: "today" });
      (list.items || []).forEach((item) => records.push({ kind: "lists", title: item.text, detail: list.name, tab: "today" }));
    });
    (db.routines || []).forEach((routine) => records.push({ kind: "lists", title: routine.name, detail: `${routine.steps.length} routine steps`, tab: "today" }));
    (familyDashboard?.events || []).forEach((event) => records.push({ kind: "family", title: event.title, detail: dateTime(event.startsAt), family: true }));
    return records;
  }
  function renderSearch() {
    const query = byId("globalSearchInput").value.trim().toLowerCase();
    const target = byId("globalSearchResults");
    if (!query) return void (target.innerHTML = "<small>Search across everything you keep in Daysie.</small>");
    const matches = allSearchRecords().filter((item) => (searchKind === "all" || item.kind === searchKind) && `${item.title} ${item.detail}`.toLowerCase().includes(query)).slice(0, 60);
    target.innerHTML = matches.length ? matches.map((item, index) => `<button type="button" class="search-result" data-search-index="${index}"><b>${safe(item.title)}</b><small>${safe(item.kind)}${item.detail ? ` · ${safe(item.detail)}` : ""}</small></button>`).join("") : "<small>No matching Daysie items.</small>";
    target.querySelectorAll("[data-search-index]").forEach((button) => {
      button.onclick = () => {
        const item = matches[Number(button.dataset.searchIndex)];
        byId("globalSearchDialog").close();
        if (item.family) byId("profileBtn").click();
        else if (item.tab) go(item.tab);
      };
    });
  }
  byId("globalSearchBtn")?.addEventListener("click", async () => {
    byId("globalSearchDialog").showModal();
    byId("globalSearchInput").value = "";
    renderSearch();
    byId("globalSearchInput").focus();
    if (settings.authToken && !familyDashboard) await loadFamilyDashboard();
  });
  byId("closeGlobalSearch")?.addEventListener("click", () => byId("globalSearchDialog").close());
  byId("globalSearchInput")?.addEventListener("input", renderSearch);
  document.querySelectorAll("#globalSearchFilters [data-search-kind]").forEach((button) => {
    button.onclick = () => {
      searchKind = button.dataset.searchKind;
      document.querySelectorAll("#globalSearchFilters [data-search-kind]").forEach((item) => item.classList.toggle("active", item === button));
      renderSearch();
    };
  });
  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      byId("globalSearchBtn")?.click();
    }
  });

  function finishImport(imported) {
    db = imported;
    activeProfileId = db.profiles[0].id;
    saveActiveProfile();
    save();
    renderAll();
    if (typeof clearFamilyLocal === "function") clearFamilyLocal();
    if (typeof familyBoot === "function") familyBoot();
    byId("importPreviewDialog").close();
    pendingImport = null;
  }
  byId("closeImportPreview")?.addEventListener("click", () => byId("importPreviewDialog").close());
  byId("replaceImportBtn")?.addEventListener("click", () => {
    if (!pendingImport) return;
    finishImport(pendingImport);
    toast("Backup imported", "Daysie replaced this device’s data.");
  });
  byId("mergeImportBtn")?.addEventListener("click", () => {
    if (!pendingImport) return;
    finishImport(mergeCloudPayload(db, pendingImport));
    toast("Backup merged", "Daysie kept unique items from both versions.");
  });

  function addPasswordToggles() {
    document.querySelectorAll('input[type="password"]').forEach((input) => {
      if (input.dataset.hasToggle) return;
      input.dataset.hasToggle = "true";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "text-button password-toggle";
      button.textContent = "Show password";
      button.setAttribute("aria-controls", input.id);
      button.onclick = () => {
        const showing = input.type === "text";
        input.type = showing ? "password" : "text";
        button.textContent = showing ? "Show password" : "Hide password";
      };
      input.insertAdjacentElement("afterend", button);
    });
  }

  function sendMetric(metric, value) {
    if (!settings.authToken || !Number.isFinite(value) || sentMetrics.has(metric)) return;
    sentMetrics.add(metric);
    fetch(`${API}/features/metrics`, {
      method: "POST",
      keepalive: true,
      headers: { ...auth(), "Content-Type": "application/json" },
      body: JSON.stringify({ metric, value, path: location.pathname }),
    }).catch(() => {});
  }
  try {
    new PerformanceObserver((list) => list.getEntries().forEach((entry) => sendMetric("LCP", entry.startTime))).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((list) => {
      let cls = 0;
      list.getEntries().forEach((entry) => { if (!entry.hadRecentInput) cls += entry.value; });
      sendMetric("CLS", cls);
    }).observe({ type: "layout-shift", buffered: true });
    new PerformanceObserver((list) => list.getEntries().forEach((entry) => sendMetric("INP", entry.duration))).observe({ type: "event", buffered: true, durationThreshold: 40 });
  } catch {}

  const previousUpdateAccountUI = updateAccountUI;
  updateAccountUI = function powerUpdateAccountUI() {
    previousUpdateAccountUI();
    addPasswordToggles();
    renderTrash();
    if (settings.authToken) {
      loadAccountProtection();
      loadSyncHistory();
      loadSecurityActivity();
      loadStorage();
    }
  };
  const previousRenderCalendar = typeof renderCalendar === "function" ? renderCalendar : null;
  if (previousRenderCalendar) {
    renderCalendar = function powerRenderCalendar() {
      previousRenderCalendar();
      renderFamilyCalendarMarkers();
    };
  }
  addPasswordToggles();
  renderTrash();
  renderRoutines();
  setTimeout(() => settings.authToken && updateAccountUI(), 1200);
})();
