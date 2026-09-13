import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const wcagTags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']

async function expectNoWcagViolations(page, screen) {
  const results = await new AxeBuilder({ page }).withTags(wcagTags).analyze()
  expect(results.violations, `${screen}: ${JSON.stringify(results.violations, null, 2)}`).toEqual([])
}

test('critical learning screens have no automated WCAG A/AA violations', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Reversolinguo' })).toBeVisible()
  await expectNoWcagViolations(page, 'onboarding')

  await page.getByRole('button', { name: 'Français vers espagnol' }).click()
  await expect(page.getByRole('button', { name: 'Découvrir maintenant' })).toBeVisible()
  await expectNoWcagViolations(page, 'home')

  await page.getByRole('button', { name: 'Réglages' }).click()
  await expect(page.getByRole('heading', { name: 'Réglages' })).toBeVisible()
  await expectNoWcagViolations(page, 'settings')

  const dailyNew = page.locator('#daily-new')
  await dailyNew.fill('1')
  await expect(dailyNew).toHaveValue('1')
  await page.getByRole('button', { name: /Retour/u }).click()
  await expect(page.getByRole('button', { name: 'Découvrir maintenant' })).toBeVisible()
  await page.getByRole('button', { name: 'Découvrir maintenant' }).click()
  await expect(page.getByRole('textbox', { name: 'Votre réponse' })).toBeVisible()
  await expectNoWcagViolations(page, 'session-before-reveal')

  await page.getByRole('textbox', { name: 'Votre réponse' }).fill('la mano')
  await page.getByRole('button', { name: 'Voir la réponse' }).click()
  await expect(page.getByText('Réponse identique ✓')).toBeVisible()
  await expectNoWcagViolations(page, 'session-after-reveal')

  await page.getByRole('button', { name: 'Correct' }).click()
  await expect(page.getByRole('heading', { name: 'Séance terminée' })).toBeVisible()
  await expectNoWcagViolations(page, 'complete')
})
