import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './server/tests/browser',
  workers: 1,
  timeout: 120000,
  expect: { timeout: 15000 },
  reporter: 'list',
  outputDir: '.test-results/browser',
  use: {
    headless: true,
    launchOptions: process.env.HRMS_BROWSER_PATH
      ? { executablePath: process.env.HRMS_BROWSER_PATH }
      : {},
    trace: 'retain-on-failure',
  },
});
