import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E test configuration.
 * Tests against the Vite dev server at http://127.0.0.1:5176
 */
export default defineConfig({
  testDir: './e2e',
  /* Maximum time one test can run for */
  timeout: 30 * 1000,
  expect: {
    /* Maximum time expect() should wait for conditions */
    timeout: 5000,
  },
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI if needed */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
  ],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://127.0.0.1:5176',

    /* Launch options for Chromium browser */
    launchOptions: {
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--no-zygote',
        '--disable-web-security',
        '--allow-insecure-localhost',
        '--disable-features=IsolateOrigins,site-per-process',
        '--proxy-server=direct://',
        '--proxy-bypass-list=*',
      ],
    },

    /* Collect trace when retrying the failed test or retain on failure. */
    trace: 'retain-on-failure',

    /* Capture screenshot on test failure */
    screenshot: 'only-on-failure',

    /* Run browser in headless mode */
    headless: true,
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        headless: true,
        launchOptions: {
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--no-zygote',
            '--disable-web-security',
            '--allow-insecure-localhost',
            '--disable-features=IsolateOrigins,site-per-process',
            '--proxy-server=direct://',
            '--proxy-bypass-list=*',
          ],
        },
      },
    },
  ],

  /* Run local dev server before starting the tests */
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:5176',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
