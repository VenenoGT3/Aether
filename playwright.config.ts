import { defineConfig, devices } from "@playwright/test";

/**
 * E2E smoke suite. Runs against the local dev server with the env pulled from
 * Vercel (.env.local) — real Supabase, test-mode Stripe. Tests that need an
 * authenticated session use the /api/test-login route and self-skip when test
 * login is not configured, so the suite stays green on machines without creds.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
