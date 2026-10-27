import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  use: {
    baseURL: "http://localhost:8081",
    viewport: { width: 1440, height: 1000 },
    launchOptions: {
      ...(process.env.CHROMIUM_PATH
        ? { executablePath: process.env.CHROMIUM_PATH }
        : {}),
      args: ["--no-sandbox"],
    },
  },
  webServer: {
    command: "EXPO_NO_TELEMETRY=1 EXPO_OFFLINE=1 npm run web -- --port 8081",
    url: "http://localhost:8081",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
