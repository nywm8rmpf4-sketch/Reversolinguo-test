import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const wcagTags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']

async function expectNoWcagViolations(page, screen) {
  const results = await new AxeBuilder({ page }).withTags(wcagTags).analyze()
  expect(results.violations, `${screen}: ${JSON.stringify(results.violations, null, 2)}`).toEqual([])
}

async function expectVerticalButtonGap(first, second, minPixels = 12) {
  await expect(first).toBeVisible()
  await expect(second).toBeVisible()
  const firstBox = await first.boundingBox()
  const secondBox = await second.boundingBox()
  expect(firstBox).not.toBeNull()
  expect(secondBox).not.toBeNull()
  const gap = secondBox.y - (firstBox.y + firstBox.height)
  expect(gap).toBeGreaterThanOrEqual(minPixels)
}

test('critical learning screens have no automated WCAG A/AA violations', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Reversolinguo' })).toBeVisible()
  await expectNoWcagViolations(page, 'onboarding')

  await page.getByRole('button', { name: 'Français vers espagnol' }).click()
  await expect(page.getByRole('button', { name: 'Découvrir maintenant' })).toBeVisible()
  await expectNoWcagViolations(page, 'home')

  await page.getByRole('button', { name: 'Modifier ma sélection' }).click()
  await expect(page.getByRole('heading', { name: 'Choisir mes mots' })).toBeVisible()
  await page.getByRole('checkbox', { name: 'A2' }).click()
  await page.getByRole('checkbox', { name: /École et études/u }).click()
  await page.getByRole('checkbox', { name: /Alimentation/u }).click()
  await page.getByRole('radio', { name: 'Uniquement ma sélection' }).click()
  await expectNoWcagViolations(page, 'multi-selection')
  await page.getByRole('button', { name: 'Retour' }).click()

  await page.getByRole('button', { name: 'Voir le vocabulaire' }).click()
  await expect(page.getByRole('heading', { name: 'Vocabulaire', exact: true })).toBeVisible()
  await expect(page.getByText('60 entrées uniques sélectionnées.')).toBeVisible()
  await expect(page.getByRole('listitem')).toHaveCount(60)
  await expect(page.getByRole('button', { name: 'Alphabétique' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'Français → espagnol' })).toHaveAttribute('aria-pressed', 'true')
  await expectNoWcagViolations(page, 'vocabulary-fr-es')
  await page.getByRole('button', { name: 'Espagnol → français' }).click()
  await expect(page.getByRole('button', { name: 'Espagnol → français' })).toHaveAttribute('aria-pressed', 'true')
  await expectNoWcagViolations(page, 'vocabulary-es-fr')
  await page.getByRole('button', { name: 'Par thèmes' }).click()
  await expect(page.getByRole('button', { name: 'Par thèmes' })).toHaveAttribute('aria-pressed', 'true')
  const themeZones = page.locator('details.vocabulary-level')
  expect(await themeZones.count()).toBeGreaterThan(0)
  await themeZones.first().locator('summary').click()
  await expect(themeZones.first()).toHaveAttribute('open', '')
  await expectNoWcagViolations(page, 'vocabulary-themes-open')
  await page.getByRole('button', { name: /Retour/u }).click()

  await page.getByRole('button', { name: 'Données et réglages' }).click()
  await expect(page.getByRole('heading', { name: 'Données et réglages' })).toBeVisible()
  await expectNoWcagViolations(page, 'settings')

  const dailyNew = page.locator('#daily-new')
  await dailyNew.fill('1')
  await expect(dailyNew).toHaveValue('1')
  await page.getByRole('button', { name: /Retour/u }).click()
  await expect(page.getByRole('button', { name: 'Découvrir maintenant' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Explorer au hasard' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Découvrir maintenant' }).click()
  await expect(page.getByRole('textbox', { name: 'Votre réponse' })).toBeVisible()
  const showAnswer = page.getByRole('button', { name: 'Voir la réponse' })
  const unknown = page.getByRole('button', { name: 'Je ne sais pas' })
  await expectVerticalButtonGap(showAnswer, unknown)
  await expectNoWcagViolations(page, 'session-before-reveal')

  await unknown.click()
  await expect(page.getByText('Réponse révélée')).toBeVisible()
  await expect(page.getByText('Ce rappel sera noté « Oublié » lorsque vous continuerez.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continuer' })).toBeVisible()
  await expectNoWcagViolations(page, 'session-unknown-reveal')

  await page.getByRole('button', { name: 'Continuer' }).click()
  await expect(page.getByRole('heading', { name: 'Séance terminée' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Explorer au hasard' })).toHaveCount(0)
  await expectNoWcagViolations(page, 'complete')

  await page.getByRole('button', { name: 'Retour à l’accueil' }).click()
  const freeReview = page.getByRole('button', { name: 'Réviser librement' })
  const explore = page.getByRole('button', { name: 'Explorer au hasard' })
  await expectVerticalButtonGap(freeReview, explore)
  await expectNoWcagViolations(page, 'home-after-daily-session')

  await explore.click()
  await expect(page.getByText(/Exploration · Traduisez en espagnol/u)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Je ne sais pas' })).toBeVisible()
  await expectNoWcagViolations(page, 'exploration-before-reveal')

  await page.getByRole('button', { name: 'Je ne sais pas' }).click()
  await expect(page.getByText('Exploration : vos réponses n’affectent ni les échéances ni les statistiques.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continuer' })).toBeVisible()
  await expectNoWcagViolations(page, 'exploration-unknown-reveal')
})
