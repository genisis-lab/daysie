import { defineConfig } from "vitest/config";
import { cloudflarePool, cloudflareTest } from "@cloudflare/vitest-pool-workers";

const workers = { wrangler: { configPath: "./wrangler.test.toml" } };

export default defineConfig({
  plugins: [cloudflareTest(workers)],
  test: {
    include: ["tests-runtime/**/*.test.js"],
    pool: cloudflarePool(workers),
  },
});
