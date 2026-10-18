import { config as loadEnv } from "dotenv";
import { defineConfig } from "@playwright/test";

loadEnv();

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  outputDir: "/tmp/playwright-results",
  use: {
    baseURL: "http://127.0.0.1:3847",
    headless: true,
  },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:3847/login",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});