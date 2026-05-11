import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for MS365 auth-callback e2e tests.
 *
 * The dev server is started on a unique port (8090) so it does not clash
 * with the sandbox preview (8080). Tests intercept all Supabase network
 * calls — no real backend is contacted.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:8090",
    trace: "retain-on-failure",
    headless: true,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npx vite --port 8090 --host 127.0.0.1",
    url: "http://localhost:8090",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
