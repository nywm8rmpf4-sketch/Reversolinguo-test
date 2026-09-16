import { expect, test } from '@playwright/test'

async function onboard(page: import('@playwright/test').Page) {
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Reversolinguo' })).toBeVisible()
  await page.getByRole('button', { name: 'Français vers espagnol' }).click()
  await expect(page.getByRole('button', { name: 'Modifier ma sélection' })).toBeVisible()
}

async function openSelection(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Modifier ma sélection' }).click()
  await expect(page.getByRole('heading', { name: 'Choisir mes mots' })).toBeVisible()
}

test('International selection combines levels and themes and persists recall scope', async ({ page }) => {
  await onboard(page)
  await openSelection(page)

  expect(await page.getByRole('checkbox', { name: 'A1' }).isChecked()).toBe(true)
  await page.getByRole('checkbox', { name: 'A2' }).click()
  await expect(page.getByText('International · A1 + A2')).toBeVisible()

  const schoolTheme = page.getByRole('checkbox', { name: /École et études/u })
  const foodTheme = page.getByRole('checkbox', { name: /Alimentation/u })
  await schoolTheme.click()
  await foodTheme.click()
  await page.getByRole('radio', { name: 'Uniquement ma sélection' }).click()
  await page.getByRole('button', { name: 'Utiliser cette sélection' }).click()

  await expect(page.getByText('International · A1 + A2')).toBeVisible()
  await expect(page.getByText('Uniquement ma sélection')).toBeVisible()

  await page.reload()
  await expect(page.getByText('International · A1 + A2')).toBeVisible()
  await openSelection(page)
  await expect(page.getByRole('checkbox', { name: 'A1' })).toBeChecked()
  await expect(page.getByRole('checkbox', { name: 'A2' })).toBeChecked()
  await expect(page.getByRole('checkbox', { name: /École et études/u })).toBeChecked()
  await expect(page.getByRole('checkbox', { name: /Alimentation/u })).toBeChecked()
  await expect(page.getByRole('radio', { name: 'Uniquement ma sélection' })).toBeChecked()
})

test('R7 vocabulary follows saved A1+A2 themes and survives reload without all-due widening', async ({ page }) => {
  await onboard(page)
  await openSelection(page)

  await page.getByRole('checkbox', { name: 'A2' }).click()
  const availableCountText = page.getByText(/nouveautés disponibles avant filtre thématique/u)
  await expect(availableCountText).toBeVisible()
  const availableCount = Number((await availableCountText.textContent())?.match(/\d+/u)?.[0] ?? 0)
  expect(availableCount).toBeGreaterThan(0)

  await page.getByRole('checkbox', { name: /École et études/u }).click()
  await page.getByRole('checkbox', { name: /Alimentation/u }).click()
  await expect(page.getByRole('radio', { name: 'Conserver tous les rappels dus' })).toBeChecked()
  await page.getByRole('button', { name: 'Utiliser cette sélection' }).click()

  await expect(page.getByText('International · A1 + A2')).toBeVisible()
  const selectedCountText = page.getByText(/nouveaux mots dans votre sélection/u)
  await expect(selectedCountText).toBeVisible()
  const selectedCount = Number((await selectedCountText.textContent())?.match(/\d+/u)?.[0] ?? 0)
  expect(selectedCount).toBeGreaterThan(0)
  expect(selectedCount).toBeLessThan(availableCount)

  await page.getByRole('button', { name: 'Voir le vocabulaire' }).click()
  await expect(page.getByText(`${selectedCount} entrées uniques sélectionnées.`)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Alphabétique' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('listitem')).toHaveCount(selectedCount)
  const alphabeticalBeforeReload = await page.locator('.vocabulary-list > li').allTextContents()

  await page.getByRole('button', { name: 'Par thèmes' }).click()
  await expect(page.getByRole('button', { name: 'Par thèmes' })).toHaveAttribute('aria-pressed', 'true')
  const themeZones = page.locator('details.vocabulary-level')
  expect(await themeZones.count()).toBeGreaterThan(1)
  await themeZones.first().locator('summary').click()
  await expect(themeZones.first()).toHaveAttribute('open', '')

  await page.reload()
  await expect(page.getByText('International · A1 + A2')).toBeVisible()
  await openSelection(page)
  await expect(page.getByRole('checkbox', { name: 'A1' })).toBeChecked()
  await expect(page.getByRole('checkbox', { name: 'A2' })).toBeChecked()
  await expect(page.getByRole('checkbox', { name: /École et études/u })).toBeChecked()
  await expect(page.getByRole('checkbox', { name: /Alimentation/u })).toBeChecked()
  await expect(page.getByRole('radio', { name: 'Conserver tous les rappels dus' })).toBeChecked()
  await page.getByRole('button', { name: 'Retour' }).click()

  await page.getByRole('button', { name: 'Voir le vocabulaire' }).click()
  await expect(page.getByText(`${selectedCount} entrées uniques sélectionnées.`)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Alphabétique' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('listitem')).toHaveCount(selectedCount)
  expect(await page.locator('.vocabulary-list > li').allTextContents()).toEqual(alphabeticalBeforeReload)
})

test('school selection supports several classes and preserves them across LVA/LVB', async ({ page }) => {
  await onboard(page)
  await openSelection(page)
  await page.getByRole('button', { name: 'Scolaire' }).click()

  await expect(page.getByRole('checkbox', { name: '6e' })).toBeChecked()
  await page.getByRole('checkbox', { name: '5e' }).click()
  await expect(page.getByText('6e LVA + 5e LVA')).toBeVisible()

  await page.getByLabel('Langue').selectOption('LVB')
  await expect(page.getByRole('checkbox', { name: '6e' })).toBeChecked()
  await expect(page.getByRole('checkbox', { name: '5e' })).toBeChecked()
  await expect(page.getByText('6e LVB + 5e LVB')).toBeVisible()
})

test('Voyage path supports several CEFR levels without a second lexical identity', async ({ page }) => {
  await onboard(page)
  await openSelection(page)
  await page.getByRole('button', { name: 'Parcours thématique' }).click()

  await expect(page.getByRole('checkbox', { name: 'A1' })).toBeChecked()
  await page.getByRole('checkbox', { name: 'A2' }).click()
  await expect(page.getByText('Voyage · A1 + A2')).toBeVisible()
  await expect(page.getByRole('group', { name: 'Thèmes' })).toHaveCount(0)
})

test('legacy progress import remains usable under the strict browser CSP', async ({ page }) => {
  await onboard(page)
  await page.getByRole('button', { name: 'Données et réglages' }).click()
  await expect(page.getByRole('heading', { name: 'Données et réglages' })).toBeVisible()

  const backup = JSON.stringify({
    schemaVersion: 1,
    exportedAt: '2026-09-15T07:00:00.000Z',
    schedules: [],
    reviews: [],
    settings: [{ id: 'settings', onboarded: true, direction: 'fr-es', dailyNew: 5 }]
  })
  await page.locator('input[type="file"]').setInputFiles({
    name: 'reversolinguo-legacy.json',
    mimeType: 'application/json',
    buffer: Buffer.from(backup)
  })

  await page.waitForLoadState('domcontentloaded')
  await expect(page.getByRole('heading', { name: 'Reversolinguo' })).toBeVisible({ timeout: 5_000 })
  await expect(page.getByText('International · A1')).toBeVisible()
})
