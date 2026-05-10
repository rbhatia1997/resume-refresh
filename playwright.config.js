import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 90_000,
  expect: {
    timeout: 15_000
  },
  use: {
    baseURL: process.env.E2E_BASE_URL || "https://resume-refresh-ten.vercel.app",
    trace: "on-first-retry"
  }
});
