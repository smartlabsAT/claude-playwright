import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright Configuration for claude-playwright
 * Internal testing configuration for the toolkit itself
 */
export default defineConfig({
  testDir: './dist/tests',
  testMatch: '**/unit.*.js', // Only run unit tests, not example tests
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  
  use: {
    baseURL: 'https://example.com',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    }
  ],
});