import { expect, test } from '@playwright/test'

async function onboard(page: import('@playwright/test').Page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Reversolinguo' })).toBeVisible()
  await page.getByRole('button', { name: 'Français vers espagnol' }).click()
  await expect(page.getByRole('button', { name: 'Réviser maintenant' })).toBeVisible()
}

test('onboarding and first recall', async ({ page }) => {
  await onboard(page)
  await page.getByRole('button', { name: 'Réviser maintenant' }).click()
  await page.getByRole('textbox', { name: 'Votre réponse' }).fill('la mano')
  await page.getByRole('button', { name: 'Voir la réponse' }).click()
  await expect(page.getByText('Réponse identique ✓')).toBeVisible()
  await page.getByRole('button', { name: 'Correct' }).click()
})

test('installed shell and progress survive an offline reload', async ({ page, context }) => {
  await onboard(page)
  await expect(page.getByText('Disponible hors ligne')).toBeVisible({ timeout: 15_000 })

  await page.getByRole('button', { name: 'Réviser maintenant' }).click()
  await page.getByRole('textbox', { name: 'Votre réponse' }).fill('la mano')
  await page.getByRole('button', { name: 'Voir la réponse' }).click()
  await page.getByRole('button', { name: 'Correct' }).click()

  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Reversolinguo' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Réviser maintenant' })).toBeVisible()
  await page.getByRole('button', { name: 'Réviser maintenant' }).click()
  await expect(page.getByRole('textbox', { name: 'Votre réponse' })).toBeVisible()
})
