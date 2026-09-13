import { defineConfig, devices } from '@playwright/test'

const qaDeploymentBase = '/Reversolinguo-test/'

export default defineConfig({
  testDir: './tests/e2e',
  // The artifact itself is built with Vite base './'. Preview mounts that
  // unchanged build under the same nested path used by the public QA site.
  webServer: {
    command: `npm run preview -- --port 4173 --base=${qaDeploymentBase}`,
    port: 4173,
    reuseExistingServer: true
  },
  use: {
    baseURL: `http://127.0.0.1:4173${qaDeploymentBase}`,
    trace: 'retain-on-failure'
  },
  projects: [
    { name: 'chromium-mobile', use: { ...devices['Pixel 7'] } },
    { name: 'webkit-mobile', use: { ...devices['iPhone 15'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } }
  ]
})
