import { createAuthClient } from "better-auth/client";
import { twoFactorClient } from "better-auth/client/plugins";
import { passkeyClient } from "@better-auth/passkey/client";
import QRCode from "qrcode";

const client = createAuthClient({
  baseURL: "https://daysie-api.neil27.workers.dev",
  plugins: [passkeyClient(), twoFactorClient()],
  fetchOptions: {
    auth: {
      type: "Bearer",
      token: () => {
        try { return JSON.parse(localStorage.getItem("daysie.settings") || "{}").authToken || ""; }
        catch { return ""; }
      },
    },
    onResponse(context) {
      const token = context.response.headers.get("set-auth-token");
      if (token) window.__daysieLatestAuthToken = token;
    },
  },
});

window.daysieAuthClient = client;
window.daysieQRCode = QRCode;
