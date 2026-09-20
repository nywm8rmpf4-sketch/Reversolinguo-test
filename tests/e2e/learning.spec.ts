import { expect, test } from '@playwright/test'

async function onboard(page: import('@playwright/test').Page) {
  const pageErrors: string[] = []
  const consoleErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.stack ?? error.message))
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()) })

  const response = await page.goto('./')
  await page.waitForTimeout(100)
  const diagnostics = {
    url: page.url(),
    status: response?.status() ?? null,
    body: await page.locator('body').innerText().catch(() => '<body unavailable>'),
    pageErrors,
    consoleErrors
  }
  await expect(page.getByRole('heading', { name: 'Reversolinguo' }), `startup diagnostics: ${JSON.stringify(diagnostics)}`).toBeVisible()
  await page.getByRole('button', { name: 'Français vers espagnol' }).click()
  await expect(page.getByRole('button', { name: 'Découvrir maintenant' })).toBeVisible()
}

async function expectPersistedOfflineProgress(page: import('@playwright/test').Page) {
  const effort = page.getByText('Points d’effort · 1 par rappel').locator('..')
  await expect(effort.getByText('1', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Découvrir maintenant' }).click()
  await expect(page.getByRole('textbox', { name: 'Votre réponse' })).toBeVisible()
}

test('onboarding and first recall', async ({ page }) => {
  await onboard(page)
  await page.getByRole('button', { name: 'Découvrir maintenant' }).click()
  await page.getByRole('textbox', { name: 'Votre réponse' }).fill('la mano')
  await page.getByRole('button', { name: 'Voir la réponse' }).click()
  await expect(page.getByText('Réponse identique ✓')).toBeVisible()
  await page.getByRole('button', { name: 'Correct' }).click()
})

test('learning direction can be reversed on home but not during a session', async ({ page }) => {
  await onboard(page)
  await expect(page.getByRole('group', { name: 'Sens d’apprentissage' })).toBeVisible()
  await page.getByRole('button', { name: 'Espagnol → français' }).click()
  await expect(page.getByRole('button', { name: 'Espagnol → français' })).toHaveAttribute('aria-pressed', 'true')

  await page.getByRole('button', { name: 'Découvrir maintenant' }).click()
  await expect(page.getByText('Espagnol d’Espagne (es-ES) → Français (fr-FR)')).toBeVisible()
  await expect(page.getByRole('button', { name: /Changer de sens/u })).toHaveCount(0)
})

test('installed shell and progress remain usable offline', async ({ page, context, browserName }) => {
  await onboard(page)
  await expect(page.getByText('Disponible hors ligne')).toBeVisible({ timeout: 15_000 })

  await page.getByRole('button', { name: 'Découvrir maintenant' }).click()
  await page.getByRole('textbox', { name: 'Votre réponse' }).fill('la mano')
  await page.getByRole('button', { name: 'Voir la réponse' }).click()
  await page.getByRole('button', { name: 'Correct' }).click()
  await expect(page.getByRole('textbox', { name: 'Votre réponse' })).toHaveValue('')

  await context.setOffline(true)

  if (browserName === 'webkit') {
    const cachedShell = await page.evaluate(async () => {
      const deploymentBase = new URL('./', window.location.href).pathname
      const cacheNames = await caches.keys()
      const requestLists = await Promise.all(cacheNames.map(async (name) => (await caches.open(name)).keys()))
      const paths = requestLists.flat().map((request) => new URL(request.url).pathname)
      return {
        controlled: Boolean(navigator.serviceWorker.controller),
        cacheNames,
        deploymentBase,
        paths
      }
    })
    expect(cachedShell.controlled).toBe(true)
    expect(cachedShell.cacheNames.length).toBeGreaterThan(0)
    expect(cachedShell.paths.some((path) => path === `${cachedShell.deploymentBase}index.html` || path === cachedShell.deploymentBase)).toBe(true)
    expect(cachedShell.paths.some((path) => path.startsWith(`${cachedShell.deploymentBase}assets/`) && path.endsWith('.js'))).toBe(true)
    expect(cachedShell.paths.some((path) => path.startsWith(`${cachedShell.deploymentBase}assets/`) && path.endsWith('.css'))).toBe(true)
    await page.getByRole('button', { name: 'Fermer la séance' }).click()
    await expect(page.getByRole('button', { name: 'Découvrir maintenant' })).toBeVisible()
    await expectPersistedOfflineProgress(page)
    return
  }

  await page.close()
  const offlinePage = await context.newPage()
  await offlinePage.goto('./')
  await expect(offlinePage.getByRole('heading', { name: 'Reversolinguo' })).toBeVisible()
  await expect(offlinePage.getByRole('button', { name: 'Découvrir maintenant' })).toBeVisible()
  await expectPersistedOfflineProgress(offlinePage)
})
