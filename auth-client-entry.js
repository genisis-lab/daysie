import { createAuthClient } from "better-auth/client";
import { passkeyClient } from "@better-auth/passkey/client";

const client = createAuthClient({
  baseURL: "https://daysie-api.neil27.workers.dev",
  plugins: [passkeyClient()],
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
