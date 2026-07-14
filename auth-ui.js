const PENDING_FAMILY_INVITE_KEY = "daysie.pendingFamilyInvite";

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
}

async function authRequest(path, body, token) {
  const response = await fetch(`${API}/api/auth${path}`, {
    method: "POST",
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
    window.turnstile.reset(widget);
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
  const token = result.response.headers.get("set-auth-token");
  const user = result.data.user || result.data.data?.user;
  if (!token || !user?.id) {
    throw new Error("Daysie could not start your secure session. Please try again.");
  }
  settings.authToken = token;
  settings.userId = user.id;
  settings.authProvider = "better-auth";
  settings.authEmail = user.email || email;
  saveSettings();
  updateAccountUI();
  updateSyncStatus();
  setAuthStatus("");
  toast("Welcome to Daysie", isNewAccount ? "Your account is ready." : "You’re signed in.");
  if (isNewAccount) await syncToCloud();
  else await pullFromCloud();
  await joinPendingFamilyInvite();
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
$("#forgotPasswordBtn")?.addEventListener("click", () => {
  $("#resetEmail").value = $("#signInEmail").value;
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
    const email = $("#signInEmail").value.trim().toLowerCase();
    const result = await authRequest("/sign-in/email", {
      email,
      password: $("#signInPassword").value,
      rememberMe: true,
      turnstileToken,
    });
    await finishEmailAuth(result, email, false);
  } catch (error) {
    setAuthStatus(error.message, true);
  } finally {
    resetTurnstile(form);
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
