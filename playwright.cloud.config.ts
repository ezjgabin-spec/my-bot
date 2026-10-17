import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser-cloud",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:8788",
    headless: true,
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {},
  },
  webServer: {
    command:
      "npx wrangler dev --port 8788 --var APP_ORIGIN:http://127.0.0.1:8788",
    url: "http://127.0.0.1:8788/login",
    reuseExistingServer: false,
    timeout: 60000,
  },
});
