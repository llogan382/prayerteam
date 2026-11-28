import { defineConfig, devices } from "@playwright/test";

const port = 4173;
const apiPort = 4174;

export default defineConfig({
  testDir: "./e2e",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: [
    // The real API, started from source like production (no build step).
    // Both native minimums are far above any app version, which the web
    // must ignore (e2e/app-version.spec.ts).
    {
      command: "node ../server/src/main.ts",
      env: {
        PORT: String(apiPort),
        HOST: "127.0.0.1",
        LOG_LEVEL: "warn",
        MIN_VERSION_IOS: "99.0.0",
        MIN_VERSION_ANDROID: "99.0.0",
      },
      url: `http://127.0.0.1:${apiPort}/api/health`,
      reuseExistingServer: !process.env.CI,
    },
    // Serves the static export the way CloudFront will: every path falls
    // back to index.html, and /api/* goes to the API (ADR 0005).
    {
      command: `node e2e/serve.mts dist ${port} http://127.0.0.1:${apiPort}`,
      url: `http://localhost:${port}`,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
