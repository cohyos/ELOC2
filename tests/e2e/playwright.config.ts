import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  timeout: 60_000,
  retries: 1,
  reporter: [
    ['list'],
    ['./reporting/json-reporter.ts'],
  ],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3001',
  },
  projects: [
    {
      name: 'api',
      testMatch: 'api/**/*.test.ts',
    },
    {
      name: 'desktop',
      testMatch: 'ui/desktop/**/*.test.ts',
      use: { viewport: { width: 1920, height: 1080 } },
    },
    {
      name: 'mobile',
      testMatch: 'ui/mobile/**/*.test.ts',
      use: { viewport: { width: 375, height: 812 } },
    },
    {
      name: 'gcp',
      testMatch: 'gcp/**/*.test.ts',
    },
    {
      name: 'scenarios',
      testMatch: 'scenarios/**/*.test.ts',
      timeout: 120_000,
      fullyParallel: false,
    },
  ],
  workers: 1,
});
