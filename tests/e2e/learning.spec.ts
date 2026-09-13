import { expect, test } from '@playwright/test'

async function onboard(page: import('@playwright/test').Page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Reversolinguo' })).toBeVisible()
  await page.getByRole('button', { name: 'Français vers espagnol' }).click()
  await expect(page.getByRole('button', { name: 'Réviser maintenant' })).toBeVisible()
}

async function expectPersistedOfflineProgress(page: import('@playwright/test').Page) {
  const effort = page.getByText('Points d’effort · 1 par rappel').locator('..')
  await expect(effort.getByText('1', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Réviser maintenant' }).click()
  await expect(page.getByRole('textbox', { name: 'Votre réponse' })).toBeVisible()
}

test('onboarding and first recall', async ({ page }) => {
  await onboard(page)
  await page.getByRole('button', { name: 'Réviser maintenant' }).click()
  await page.getByRole('textbox', { name: 'Votre réponse' }).fill('la mano')
  await page.getByRole('button', { name: 'Voir la réponse' }).click()
  await expect(page.getByText('Réponse identique ✓')).toBeVisible()
  await page.getByRole('button', { name: 'Correct' }).click()
})

test('installed shell and progress remain usable offline', async ({ page, context, browserName }) => {
  await onboard(page)
  await expect(page.getByText('Disponible hors ligne')).toBeVisible({ timeout: 15_000 })

  await page.getByRole('button', { name: 'Réviser maintenant' }).click()
  await page.getByRole('textbox', { name: 'Votre réponse' }).fill('la mano')
  await page.getByRole('button', { name: 'Voir la réponse' }).click()
  await page.getByRole('button', { name: 'Correct' }).click()
  await expect(page.getByRole('textbox', { name: 'Votre réponse' })).toHaveValue('')

  await context.setOffline(true)

  if (browserName === 'webkit') {
    const cachedShell = await page.evaluate(async () => {
      const cacheNames = await caches.keys()
      const requestLists = await Promise.all(cacheNames.map(async (name) => (await caches.open(name)).keys()))
      const paths = requestLists.flat().map((request) => new URL(request.url).pathname)
      return {
        controlled: Boolean(navigator.serviceWorker.controller),
        cacheNames,
        paths
      }
    })
    expect(cachedShell.controlled).toBe(true)
    expect(cachedShell.cacheNames.length).toBeGreaterThan(0)
    expect(cachedShell.paths).toContain('/index.html')
    expect(cachedShell.paths.some((path) => path.endsWith('.js'))).toBe(true)
    expect(cachedShell.paths.some((path) => path.endsWith('.css'))).toBe(true)
    await page.getByRole('button', { name: 'Fermer la séance' }).click()
    await expect(page.getByRole('button', { name: 'Réviser maintenant' })).toBeVisible()
    await expectPersistedOfflineProgress(page)
    return
  }

  await page.close()
  const offlinePage = await context.newPage()
  await offlinePage.goto('/')
  await expect(offlinePage.getByRole('heading', { name: 'Reversolinguo' })).toBeVisible()
  await expect(offlinePage.getByRole('button', { name: 'Réviser maintenant' })).toBeVisible()
  await expectPersistedOfflineProgress(offlinePage)
})
