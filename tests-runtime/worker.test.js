import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("Daysie Worker runtime", () => {
  it("boots in the Workers runtime and reports bound storage", async () => {
    const response = await SELF.fetch("https://daysie.test/health");
    expect(response.status).toBe(200);
    const health = await response.json();
    expect(health.ok).toBe(true);
    expect(health.storage).toEqual({ d1: true, photos: true });
    expect(health.services.passkeys).toBe(true);
  });

  it("requires authentication before reading or writing sync data", async () => {
    const read = await SELF.fetch("https://daysie.test/data");
    const write = await SELF.fetch("https://daysie.test/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profiles: [] }),
    });
    expect(read.status).toBe(401);
    expect(write.status).toBe(401);
  });

  it("rejects password sign-in before auth when Turnstile is missing", async () => {
    const response = await SELF.fetch("https://daysie.test/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://daysie.pages.dev" },
      body: JSON.stringify({ email: "test@example.com", password: "password123" }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Complete the security check" });
  });
});
