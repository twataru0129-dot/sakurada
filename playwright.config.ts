import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  use: { baseURL: 'http://localhost:5179/typing/', locale: 'ja-JP' },
  webServer: { command: 'npx vite build && node e2e/serve.mjs', url: 'http://localhost:5179/typing/', reuseExistingServer: false, timeout: 120_000 },
  projects: [
    { name: 'pc', use: { browserName: 'chromium', viewport: { width: 1366, height: 820 } } },
    { name: 'tablet', use: { browserName: 'chromium', viewport: { width: 820, height: 1180 }, hasTouch: true } },
    { name: 'phone', use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } },
  ],
});
