import { defineConfig } from '@playwright/test'
import base from './playwright.config'
export default defineConfig({
  ...base,
  use: { ...base.use, baseURL: 'http://127.0.0.1:5177' },
  projects: [{ name: 'chromium', use: { ...base.projects![0].use, headless: false } }],
  webServer: { command: 'npm run dev -- --port 5177', url: 'http://127.0.0.1:5177', reuseExistingServer: false },
})
