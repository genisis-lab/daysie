import { betterAuth } from "better-auth";
import { bearer, username } from "better-auth/plugins";
import { passkey } from "@better-auth/passkey";
import { sendEmail as sendInfraEmail } from "@better-auth/infra";
import { withCloudflare } from "better-auth-cloudflare";

const cleanOrigin = (value) => {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
};

const escapeHtml = (value) =>
  String(value || "").replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[character],
  );

export async function sendDaysieEmail(env, message) {
  if (env.BETTER_AUTH_API_KEY && message.template) {
    const result = await sendInfraEmail(
      {
        template: message.template,
        to: message.to,
        variables: message.variables,
        ...(message.subject ? { subject: message.subject } : {}),
      },
      { apiKey: env.BETTER_AUTH_API_KEY },
    );
    if (!result.success) throw new Error(result.error || "Email delivery failed.");
    return;
  }
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    throw new Error("Email is not configured.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [message.to],
      subject: message.subject,
      html: message.html,
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Email provider returned ${response.status}: ${details.slice(0, 240)}`);
  }
}

export function createDaysieAuth(env, request, executionContext) {
  const requestUrl = new URL(request.url);
  const appOrigin = cleanOrigin(env.APP_URL);
  const requestOrigin = cleanOrigin(request.headers.get("Origin"));
  const trustedOrigins = [
    appOrigin,
    "http://localhost:8787",
    "http://localhost:3000",
  ].filter(Boolean);

  return betterAuth({
    baseURL: requestUrl.origin,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [...new Set(trustedOrigins)],
    ...withCloudflare(
      {
        d1Native: env.DB,
        autoDetectIpAddress: false,
        geolocationTracking: false,
      },
      {
        emailAndPassword: {
          enabled: true,
          minPasswordLength: 8,
          sendResetPassword: async ({ user, token }) => {
            const resetOrigin = appOrigin || requestOrigin;
            if (!resetOrigin) throw new Error("APP_URL must be configured for password resets.");
            const resetUrl = `${resetOrigin}/?resetToken=${encodeURIComponent(token)}`;
            const emailPromise = sendDaysieEmail(env, {
              to: user.email,
              template: "reset-password",
              variables: {
                resetLink: resetUrl,
                userEmail: user.email,
                userName: user.name || "there",
                appName: "Daysie",
                expirationMinutes: "60",
              },
              subject: "Reset your Daysie password",
              html: `
                <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#332b24;line-height:1.6">
                  <h1 style="color:#b36d08">Reset your Daysie password</h1>
                  <p>Hi ${escapeHtml(user.name || "there")},</p>
                  <p>Use the button below to choose a new password. This link expires soon.</p>
                  <p><a href="${escapeHtml(resetUrl)}" style="display:inline-block;padding:12px 20px;border-radius:12px;background:#b36d08;color:white;text-decoration:none;font-weight:700">Choose a new password</a></p>
                  <p style="color:#6f655d;font-size:14px">If you did not request this, you can safely ignore this email.</p>
                </div>`,
            });
            if (executionContext) executionContext.waitUntil(emailPromise);
            else await emailPromise;
          },
        },
        user: {
          changeEmail: {
            enabled: true,
            updateEmailWithoutVerification: true,
          },
        },
        plugins: [
          bearer(),
          passkey({
            rpID: new URL(appOrigin || "https://daysie.pages.dev").hostname,
            rpName: "Daysie",
            origin: appOrigin || "https://daysie.pages.dev",
          }),
          username({
            minUsernameLength: 3,
            maxUsernameLength: 30,
          }),
        ],
      },
    ),
    advanced: {
      defaultCookieAttributes: {
        secure: true,
        sameSite: "none",
        partitioned: true,
      },
      cookies: {
        "better-auth-passkey": {
          attributes: {
            secure: true,
            sameSite: "none",
            partitioned: true,
          },
        },
      },
    },
  });
}

export function familyInviteEmail({ appUrl, code, inviterName, inviteeEmail }) {
  const inviteUrl = `${appUrl}/?familyInvite=${encodeURIComponent(code)}`;
  return {
    template: "application-invite",
    variables: {
      inviteLink: inviteUrl,
      inviterName: inviterName || "A family member",
      inviterEmail: "family@daysie.app",
      inviteeEmail: inviteeEmail || "family member",
      appName: "Daysie",
      expirationDays: "1",
    },
    subject: `${inviterName || "Someone"} invited you to their Daysie family`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#332b24;line-height:1.6">
        <div style="font-size:42px">🌼</div>
        <h1 style="color:#b36d08">Join your family on Daysie</h1>
        <p><strong>${escapeHtml(inviterName || "A family member")}</strong> invited you to share reminders, tasks, and family lists.</p>
        <p><a href="${escapeHtml(inviteUrl)}" style="display:inline-block;padding:12px 20px;border-radius:12px;background:#b36d08;color:white;text-decoration:none;font-weight:700">Accept family invite</a></p>
        <p>Or open Daysie and enter this code:</p>
        <p style="font-size:28px;letter-spacing:6px;font-weight:800">${escapeHtml(code)}</p>
        <p style="color:#6f655d;font-size:14px">This invite expires in 15 minutes. If you were not expecting it, you can ignore this email.</p>
      </div>`,
  };
}
