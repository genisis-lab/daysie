const PENDING_FAMILY_INVITE_KEY = "daysie.pendingFamilyInvite";
const turnstileWidgets = new WeakMap();
let pendingTwoFactorEmail = "";
let pendingFamilyInvite = null;

function renderTurnstile(form) {
  const widget = form?.querySelector(".cf-turnstile");
  if (
    !widget ||
    !$("#settingsDialog")?.open ||
    form.offsetParent === null ||
    form.classList.contains("hidden") ||
    turnstileWidgets.has(widget) ||
    !window.turnstile
  )
    return false;
  const widgetId = window.turnstile.render(widget, {
    sitekey: widget.dataset.sitekey,
    action: widget.dataset.action,
    theme: widget.dataset.theme || "auto",
    appearance: widget.dataset.appearance || "always",
  });
  turnstileWidgets.set(widget, widgetId);
  return true;
}

function renderVisibleTurnstile() {
  return renderTurnstile($("#signInForm")) || renderTurnstile($("#signUpForm"));
}

function scheduleTurnstileRender() {
  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    if (renderVisibleTurnstile() || attempts >= 40) clearInterval(timer);
  }, 125);
}

function setAuthStatus(message, isError = false) {
  const status = $("#authFormStatus");
  if (!status) return;
  status.textContent = message || "";
  status.classList.toggle("hidden", !message);
  status.classList.toggle("error", !!isError);
}

function setButtonBusy(button, busy, busyLabel) {
  if (!button) return;
  if (busy) {
    button.dataset.label = button.textContent;
    button.textContent = busyLabel;
  } else if (button.dataset.label) {
    button.textContent = button.dataset.label;
  }
  button.disabled = !!busy;
}

function showAuthPanel(panel) {
  const panels = {
    signIn: $("#signInForm"),
    signUp: $("#signUpForm"),
    reset: $("#passwordResetRequestForm"),
    newPassword: $("#newPasswordForm"),
    recovery: $("#recoverySignInForm"),
    twoFactor: $("#twoFactorSignInForm"),
  };
  Object.entries(panels).forEach(([name, element]) =>
    element?.classList.toggle("hidden", name !== panel),
  );
  const inTabs = panel === "signIn" || panel === "signUp";
  $(".auth-tabs")?.classList.toggle("hidden", !inTabs);
  $("#showSignInBtn")?.setAttribute(
    "aria-selected",
    String(panel === "signIn"),
  );
  $("#showSignUpBtn")?.setAttribute(
    "aria-selected",
    String(panel === "signUp"),
  );
  setAuthStatus("");
  setTimeout(scheduleTurnstileRender, 0);
}

function openAuthEntry(panel) {
  updateAccountUI();
  showAuthPanel(panel);
  const dialog = $("#settingsDialog");
  if (!dialog?.open) dialog?.showModal();
  setTimeout(() => {
    $("#loggedOutSection")?.scrollIntoView({ block: "start" });
    scheduleTurnstileRender();
    (panel === "signUp" ? $("#signUpName") : $("#signInIdentifier"))?.focus();
  }, 50);
}

async function authRequest(path, body, token) {
  const response = await fetch(`${API}/api/auth${path}`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body || {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      data.message || data.error || "Something went wrong. Please try again.";
    throw new Error(message.replace(/_/g, " "));
  }
  return { response, data };
}

function resetTurnstile(form) {
  const widget = form?.querySelector(".cf-turnstile");
  if (!widget || !window.turnstile) return;
  try {
    window.turnstile.reset(turnstileWidgets.get(widget));
  } catch {
    // The widget may not have rendered yet while its auth tab was hidden.
  }
}

function getTurnstileToken(form) {
  const token = new FormData(form).get("cf-turnstile-response");
  if (!token) {
    throw new Error("Please complete the security check and try again.");
  }
  return token;
}

async function finishEmailAuth(result, email, isNewAccount) {
  const token =
    result.data?.token ||
    result.data?.data?.token ||
    result.response.headers.get("set-auth-token");
  const user = result.data.user || result.data.data?.user;
  if (!token || !user?.id) {
    throw new Error("Daysie could not start your secure session. Please try again.");
  }
  settings.authToken = token;
  settings.userId = user.id;
  settings.authProvider = "better-auth";
  settings.authEmail = user.email || email;
  settings.authUsername = user.username || null;
  authExpiredNoticeShown = false;
  const wasFirstRun = !db.onboarded;
  saveSettings();
  updateAccountUI();
  updateSyncStatus();
  setAuthStatus("");
  toast("Welcome to Daysie", isNewAccount ? "Your account is ready." : "You’re signed in.");
  if (isNewAccount) {
    if (wasFirstRun) {
      db.profiles[0].name = user.name || "friend";
      db.onboarded = true;
      localStorage.setItem(KEY, JSON.stringify(db));
    }
    await syncToCloud();
  } else {
    await pullFromCloud();
    if (wasFirstRun) {
      db.onboarded = true;
      if (db.profiles?.[0]) db.profiles[0].name ||= user.name || "friend";
      localStorage.setItem(KEY, JSON.stringify(db));
    }
  }
  await joinPendingFamilyInvite();
  if (wasFirstRun) {
    showApp();
    if (!db.tourDone) setTimeout(startTour, 400);
  }
  $("#settingsDialog")?.close();
}

async function createFamilyInviteFromSettings(email = "") {
  if (!settings.authToken) {
    showAuthPanel("signIn");
    return setAuthStatus("Sign in before inviting a family member.", true);
  }
  const profile = meProfile();
  const response = await fetch(`${API}/family/invite`, {
    method: "POST",
    headers: authHeaders(true),
    body: JSON.stringify({
      email: email.trim(),
      name: profile.name,
      emoji: profile.emoji,
      color: profile.color,
      expiresMinutes: Number($("#settingsFamilyInviteDuration")?.value || 1440),
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Could not create the invite.");

  const result = $("#settingsFamilyInviteResult");
  const message = $("#settingsFamilyInviteMessage");
  const code = $("#copyFamilyInviteCode");
  const expiry = $("#settingsFamilyInviteExpiry");
  result?.classList.remove("hidden");
  if (message)
    message.textContent = data.emailSent
      ? `Invite sent to ${data.invitedEmail}. They can also use this code:`
      : "Share this code with your family member:";
  if (code) code.textContent = data.code;
  if (expiry)
    expiry.textContent = `Expires in about ${Math.max(1, Math.round((data.expires - Date.now()) / 60000))} minutes · Tap the code to copy`;
  pendingFamilyInvite = data;
  const inviteUrl = `${location.origin}${location.pathname}?familyInvite=${encodeURIComponent(data.code)}`;
  if (window.daysieQRCode && $("#familyInviteQr")) {
    window.daysieQRCode.toCanvas($("#familyInviteQr"), inviteUrl, {
      width: 180,
      margin: 1,
      color: { dark: "#332b24", light: "#ffffff" },
    }).catch(() => {});
  }
  if (email) $("#settingsFamilyEmail").value = "";
  if (typeof loadFamily === "function") await loadFamily();
  return data;
}

async function joinPendingFamilyInvite() {
  const code = localStorage.getItem(PENDING_FAMILY_INVITE_KEY);
  if (!code || !settings.authToken) return;
  const profile = meProfile();
  try {
    const response = await fetch(`${API}/family/join`, {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify({
        code,
        name: profile.name,
        emoji: profile.emoji,
        color: profile.color,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "This invite is no longer valid.");
    localStorage.removeItem(PENDING_FAMILY_INVITE_KEY);
    window.family = { familyId: data.familyId, members: data.members || [] };
    cacheFamily(window.family);
    renderFamily();
    if (typeof loadFamilyLists === "function") await loadFamilyLists();
    toast("Family joined", "You can now share reminders and lists.");
  } catch (error) {
    toast("Could not join family", error.message);
  }
}

$("#showSignInBtn")?.addEventListener("click", () => showAuthPanel("signIn"));
$("#showSignUpBtn")?.addEventListener("click", () => showAuthPanel("signUp"));
$("#settingsBtn")?.addEventListener("click", () =>
  setTimeout(scheduleTurnstileRender, 0),
);
$("#welcomeSignInBtn")?.addEventListener("click", () => openAuthEntry("signIn"));
$("#welcomeCreateAccountBtn")?.addEventListener("click", () => {
  $("#signUpName").value = $("#nameInput").value.trim();
  openAuthEntry("signUp");
});
$("#forgotPasswordBtn")?.addEventListener("click", () => {
  const identifier = $("#signInIdentifier").value.trim();
  $("#resetEmail").value = identifier.includes("@") ? identifier : "";
  showAuthPanel("reset");
  $("#resetEmail")?.focus();
});
$("#backToSignInBtn")?.addEventListener("click", () => showAuthPanel("signIn"));

$("#signInForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = $("#signInBtn");
  setButtonBusy(button, true, "Signing in…");
  setAuthStatus("");
  try {
    const turnstileToken = getTurnstileToken(form);
    const identifier = $("#signInIdentifier").value.trim().toLowerCase();
    const useEmail = identifier.includes("@");
    const result = await authRequest(useEmail ? "/sign-in/email" : "/sign-in/username", {
      [useEmail ? "email" : "username"]: identifier,
      password: $("#signInPassword").value,
      rememberMe: true,
      turnstileToken,
    });
    if (result.data?.twoFactorRedirect) {
      pendingTwoFactorEmail = useEmail ? identifier : "";
      showAuthPanel("twoFactor");
      setTimeout(() => $("#twoFactorSignInCode")?.focus(), 0);
      return;
    }
    await finishEmailAuth(result, useEmail ? identifier : "", false);
  } catch (error) {
    setAuthStatus(error.message, true);
  } finally {
    resetTurnstile(form);
    setButtonBusy(button, false);
  }
});

$("#backFromTwoFactorBtn")?.addEventListener("click", () => {
  pendingTwoFactorEmail = "";
  showAuthPanel("signIn");
});

$("#useTwoFactorBackupBtn")?.addEventListener("click", (event) => {
  const form = $("#twoFactorSignInForm");
  const usingBackup = form?.dataset.method !== "backup";
  if (form) form.dataset.method = usingBackup ? "backup" : "totp";
  event.currentTarget.textContent = usingBackup
    ? "Use an authenticator code instead"
    : "Use this as a backup code";
  const input = $("#twoFactorSignInCode");
  if (input) {
    input.value = "";
    input.maxLength = usingBackup ? 32 : 12;
    input.inputMode = usingBackup ? "text" : "numeric";
    input.focus();
  }
});

$("#twoFactorSignInForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = $("#verifyTwoFactorSignInBtn");
  setButtonBusy(button, true, "Verifying…");
  setAuthStatus("");
  try {
    const backup = form.dataset.method === "backup";
    const result = await authRequest(
      backup ? "/two-factor/verify-backup-code" : "/two-factor/verify-totp",
      {
        code: $("#twoFactorSignInCode").value.trim(),
        trustDevice: $("#trustTwoFactorDevice").checked,
      },
    );
    await finishEmailAuth(result, pendingTwoFactorEmail, false);
    pendingTwoFactorEmail = "";
    form.reset();
  } catch (error) {
    setAuthStatus(error.message, true);
  } finally {
    setButtonBusy(button, false);
  }
});

$("#signUpForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = $("#signUpBtn");
  setButtonBusy(button, true, "Creating account…");
  setAuthStatus("");
  try {
    const turnstileToken = getTurnstileToken(form);
    const email = $("#signUpEmail").value.trim().toLowerCase();
    const result = await authRequest("/sign-up/email", {
      name: $("#signUpName").value.trim(),
      username: $("#signUpUsername").value.trim().toLowerCase(),
      email,
      password: $("#signUpPassword").value,
      turnstileToken,
    });
    await finishEmailAuth(result, email, true);
  } catch (error) {
    setAuthStatus(error.message, true);
  } finally {
    resetTurnstile(form);
    setButtonBusy(button, false);
  }
});

$("#changeEmailForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = $("#changeEmailBtn");
  const email = $("#changeEmailInput").value.trim().toLowerCase();
  setButtonBusy(button, true, "Changing…");
  try {
    await authRequest("/change-email", { newEmail: email }, settings.authToken);
    settings.authEmail = email;
    saveSettings();
    updateAccountUI();
    $("#changeEmailForm").reset();
    toast("Email updated", `You can now sign in with ${email}.`);
  } catch (error) {
    toast("Could not change email", error.message);
  } finally {
    setButtonBusy(button, false);
  }
});

$("#changePasswordForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = $("#changePasswordBtn");
  const revokeOtherSessions = $("#revokeOtherPasswordSessions").checked;
  setButtonBusy(button, true, "Updating…");
  try {
    const result = await authRequest(
      "/change-password",
      {
        currentPassword: $("#currentPassword").value,
        newPassword: $("#changeNewPassword").value,
        revokeOtherSessions,
      },
      settings.authToken,
    );
    const replacementToken =
      result.data?.token || result.response.headers.get("set-auth-token");
    if (replacementToken) {
      settings.authToken = replacementToken;
      saveSettings();
    }
    form.reset();
    toast(
      "Password updated",
      revokeOtherSessions
        ? "Other devices were logged out."
        : "Your password is ready to use.",
    );
  } catch (error) {
    toast("Could not update password", error.message);
  } finally {
    setButtonBusy(button, false);
  }
});

$("#sendPasswordResetBtn")?.addEventListener("click", async () => {
  const button = $("#sendPasswordResetBtn");
  if (!settings.authEmail)
    return toast("No email available", "Add an email address before requesting a reset link.");
  setButtonBusy(button, true, "Sending…");
  try {
    await authRequest("/request-password-reset", {
      email: settings.authEmail,
      redirectTo: `${location.origin}${location.pathname}`,
    });
    toast("Reset link requested", "Check your email for a secure password reset link.");
  } catch (error) {
    toast("Could not send reset link", error.message);
  } finally {
    setButtonBusy(button, false);
  }
});

$("#passwordResetRequestForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = $("#sendResetBtn");
  setButtonBusy(button, true, "Sending…");
  try {
    await authRequest("/request-password-reset", {
      email: $("#resetEmail").value.trim().toLowerCase(),
      redirectTo: `${location.origin}${location.pathname}`,
    });
    setAuthStatus("If that email has a Daysie account, a reset link is on its way.");
  } catch (error) {
    setAuthStatus(error.message, true);
  } finally {
    setButtonBusy(button, false);
  }
});

$("#newPasswordForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const token = new URLSearchParams(location.search).get("resetToken");
  const button = $("#saveNewPasswordBtn");
  setButtonBusy(button, true, "Saving…");
  try {
    if (!token) throw new Error("This reset link is incomplete. Request a new one.");
    await authRequest("/reset-password", {
      token,
      newPassword: $("#newPassword").value,
    });
    history.replaceState({}, "", location.pathname);
    showAuthPanel("signIn");
    setAuthStatus("Password updated. You can sign in now.");
  } catch (error) {
    setAuthStatus(error.message, true);
  } finally {
    setButtonBusy(button, false);
  }
});

$("#settingsFamilyInviteForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = $("#settingsFamilyInviteBtn");
  setButtonBusy(button, true, "Sending…");
  try {
    const invite = await createFamilyInviteFromSettings(
      $("#settingsFamilyEmail").value,
    );
    toast(
      invite.emailSent ? "Invite sent" : "Invite code ready",
      invite.emailSent
        ? "Your family member should receive it shortly."
        : invite.emailError || "Share the displayed code with your family member.",
    );
  } catch (error) {
    toast("Could not send invite", error.message);
  } finally {
    setButtonBusy(button, false);
  }
});

$("#settingsFamilyCodeBtn")?.addEventListener("click", async (event) => {
  setButtonBusy(event.currentTarget, true, "Creating code…");
  try {
    await createFamilyInviteFromSettings();
  } catch (error) {
    toast("Could not create code", error.message);
  } finally {
    setButtonBusy(event.currentTarget, false);
  }
});

$("#copyFamilyInviteCode")?.addEventListener("click", async (event) => {
  const code = event.currentTarget.textContent.trim();
  if (!code) return;
  try {
    await navigator.clipboard.writeText(code);
    toast("Code copied", "Share it with your family member.");
  } catch {
    toast("Invite code", code);
  }
});

$("#shareFamilyInviteBtn")?.addEventListener("click", async () => {
  if (!pendingFamilyInvite?.code) return;
  const url = `${location.origin}${location.pathname}?familyInvite=${encodeURIComponent(pendingFamilyInvite.code)}`;
  const share = {
    title: "Join my family on Daysie",
    text: `Use code ${pendingFamilyInvite.code} to join my Daysie family.`,
    url,
  };
  try {
    if (navigator.share) await navigator.share(share);
    else {
      await navigator.clipboard.writeText(`${share.text} ${url}`);
      toast("Invite copied", "Share it with your family member.");
    }
  } catch (error) {
    if (error?.name !== "AbortError") toast("Could not share", error.message);
  }
});

(function handleAuthLinks() {
  const params = new URLSearchParams(location.search);
  const familyInvite = (params.get("familyInvite") || "").trim().toUpperCase();
  const resetToken = params.get("resetToken");
  if (familyInvite) {
    localStorage.setItem(PENDING_FAMILY_INVITE_KEY, familyInvite);
    params.delete("familyInvite");
    history.replaceState({}, "", `${location.pathname}${params.size ? `?${params}` : ""}`);
    if (settings.authToken) joinPendingFamilyInvite();
    else {
      updateAccountUI();
      $("#settingsDialog")?.showModal();
      showAuthPanel("signUp");
      setAuthStatus("Create an account or sign in to accept your family invite.");
    }
  } else if (resetToken) {
    updateAccountUI();
    $("#loggedOutSection")?.classList.remove("hidden");
    $("#loggedInSection")?.classList.add("hidden");
    $("#settingsDialog")?.showModal();
    showAuthPanel("newPassword");
  }
})();

scheduleTurnstileRender();
