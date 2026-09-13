import { defineConfig, devices } from '@playwright/test'

const configuredBase = process.env.REVERSOLINGUO_BASE ?? '/'
const base = configuredBase.startsWith('/') && configuredBase.endsWith('/')
  ? configuredBase
  : `/${configuredBase.replace(/^\/+|\/+$/g, '')}/`

export default defineConfig({
  testDir: './tests/e2e',
  webServer: { command: 'npm run preview -- --port 4173', port: 4173, reuseExistingServer: true },
  use: { baseURL: `http://127.0.0.1:4173${base}`, trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium-mobile', use: { ...devices['Pixel 7'] } },
    { name: 'webkit-mobile', use: { ...devices['iPhone 15'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } }
  ]
})
