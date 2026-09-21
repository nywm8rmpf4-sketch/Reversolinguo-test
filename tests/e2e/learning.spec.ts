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
  await page.getByRole('button', { name: 'Français (fr-FR) → Espagnol d’Espagne (es-ES)' }).click()
  await expect(page.getByRole('button', { name: 'Découvrir maintenant' })).toBeVisible()
}

async function expectPersistedOfflineProgress(page: import('@playwright/test').Page) {
  const effort = page.getByText('Points d’effort · 1 par rappel').locator('..')
  await expect(effort.getByText('1', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Découvrir maintenant' }).click()
  await expect(page.getByRole('textbox', { name: 'Votre réponse' })).toBeVisible()
}

async function openExactDueCard(page: import('@playwright/test').Page, entryId: string) {
  await page.evaluate(async (requestedEntryId) => {
    const request = indexedDB.open('reversolinguo')
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })

    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(['schedules', 'settings'], 'readwrite')
      const schedules = transaction.objectStore('schedules')
      const scheduleRequest = schedules.get(`${requestedEntryId}:fr-es`)
      scheduleRequest.onsuccess = () => {
        if (!scheduleRequest.result) {
          transaction.abort()
          reject(new Error(`Missing schedule for ${requestedEntryId}`))
          return
        }
        schedules.put({
          ...scheduleRequest.result,
          state: 'REVIEW',
          intervalDays: 3,
          dueAt: new Date(Date.now() - 60_000).toISOString(),
          updatedAt: new Date().toISOString()
        })
      }

      const settings = transaction.objectStore('settings')
      const settingsRequest = settings.get('settings')
      settingsRequest.onsuccess = () => settings.put({
        ...settingsRequest.result,
        soundMode: 'off',
        motionEnabled: false
      })
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'))
    })
    database.close()
  }, entryId)

  await page.reload()
  await page.getByRole('button', { name: 'Réviser maintenant' }).click()
  await expect(page.locator('.flashcard')).toBeVisible()
}

async function expectStableResponsiveCard(page: import('@playwright/test').Page, expectedTheme: string) {
  const card = page.locator('.flashcard')
  await expect(card).toHaveAttribute('data-theme', expectedTheme)
  const rectoBackground = await card.evaluate((element) => getComputedStyle(element).backgroundImage)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

  await page.getByRole('button', { name: 'Je ne sais pas' }).click()
  await expect(page.locator('.correction')).toBeVisible()
  await expect(card).toHaveAttribute('data-theme', expectedTheme)
  expect(await card.evaluate((element) => getComputedStyle(element).backgroundImage)).toBe(rectoBackground)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
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
  await page.getByRole('button', { name: 'Espagnol d’Espagne (es-ES) → Français (fr-FR)' }).click()
  await expect(page.getByRole('button', { name: 'Espagnol d’Espagne (es-ES) → Français (fr-FR)' })).toHaveAttribute('aria-pressed', 'true')

  await page.getByRole('button', { name: 'Découvrir maintenant' }).click()
  await expect(page.getByText('Espagnol d’Espagne (es-ES) → Français (fr-FR)')).toBeVisible()
  await expect(page.getByRole('button', { name: /Changer de sens/u })).toHaveCount(0)
})

test('a multitheme card uses its deterministic primary theme on both faces without audio', async ({ page }) => {
  await onboard(page)
  await openExactDueCard(page, '97cccb34-ce0e-520f-9c02-081b30a17e2f')

  await expect(page.getByRole('heading', { name: 'être' })).toBeVisible()
  await expect(page.getByText('Thème : Identité')).toBeVisible()
  await expectStableResponsiveCard(page, 'identite')
})

test('the longest representative card wraps without horizontal overflow on both faces', async ({ page }) => {
  await onboard(page)
  await openExactDueCard(page, '9da47870-240d-54dc-a24e-54bb1ed6f656')

  await expect(page.getByRole('heading', { name: 'activer la vérification en deux étapes' })).toBeVisible()
  await expect(page.getByText('Thème : Numérique')).toBeVisible()
  await expectStableResponsiveCard(page, 'numerique')
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


test('FR-EN temporary pair switches outside session, learns and survives offline reload', async ({ page, context }) => {
  await onboard(page)
  await page.getByRole('group', { name: 'Langues' }).getByRole('button', { name: 'Français – anglais' }).click()
  await expect(page.getByText('Mini-catalogue FR–EN · test temporaire')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Français (fr-FR) → Anglais (en-GB)' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('30 nouveaux mots')).toBeVisible()
  await page.getByRole('button', { name: 'Découvrir maintenant' }).click()
  await expect(page.getByRole('heading', { name: 'bonjour' })).toBeVisible()
  await page.getByRole('textbox', { name: 'Votre réponse' }).fill('hello')
  await page.getByRole('button', { name: 'Voir la réponse' }).click()
  await expect(page.getByText('Réponse identique ✓')).toBeVisible()
  await page.getByRole('button', { name: 'Correct' }).click()
  await page.getByRole('button', { name: 'Fermer la séance' }).click()
  await expect(page.getByText('Disponible hors ligne')).toBeVisible({ timeout: 15_000 })
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByText('Mini-catalogue FR–EN · test temporaire')).toBeVisible()
  await context.setOffline(false)
  await page.getByRole('group', { name: 'Langues' }).getByRole('button', { name: 'Français – espagnol' }).click()
  await expect(page.getByRole('button', { name: 'Français (fr-FR) → Espagnol d’Espagne (es-ES)' })).toBeVisible()
})
