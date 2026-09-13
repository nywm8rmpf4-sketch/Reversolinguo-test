import { expect, test, type Page } from '@playwright/test'

interface AxeViolation {
  id: string
  impact: string | null
  help: string
  nodes: Array<{ target: string[] }>
}

interface AxeResult {
  violations: AxeViolation[]
}

const axePath = process.env.AXE_CORE_PATH
const wcagTags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']

async function audit(page: Page, label: string) {
  const result = await page.evaluate(async (tags): Promise<AxeResult> => {
    const axe = (globalThis as unknown as {
      axe: {
        run: (context: Document, options: unknown) => Promise<AxeResult>
      }
    }).axe
    return axe.run(document, { runOnly: { type: 'tag', values: tags } })
  }, wcagTags)

  const summary = result.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    targets: violation.nodes.flatMap((node) => node.target)
  }))

  expect(summary, `${label}: violations WCAG automatisables`).toEqual([])
}

test('key screens have no axe WCAG A/AA violations', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Axe audit is executed once; cross-browser behavior is covered by the functional matrix.')
  test.skip(!axePath, 'AXE_CORE_PATH is required by the controlled public QA harness.')

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Reversolinguo' })).toBeVisible()
  await page.addScriptTag({ path: axePath! })
  await audit(page, 'onboarding')

  await page.getByRole('button', { name: 'Français vers espagnol' }).click()
  await expect(page.getByRole('button', { name: 'Réviser maintenant' })).toBeVisible()
  await audit(page, 'home')

  await page.getByRole('button', { name: 'Données et réglages' }).click()
  await expect(page.getByRole('heading', { name: 'Données et réglages' })).toBeVisible()
  await audit(page, 'settings')

  await page.locator('#daily-new').fill('1')
  await page.getByRole('button', { name: /Retour/ }).click()
  await page.getByRole('button', { name: 'Réviser maintenant' }).click()
  await expect(page.getByRole('textbox', { name: 'Votre réponse' })).toBeVisible()
  await audit(page, 'session-before-reveal')

  await page.getByRole('textbox', { name: 'Votre réponse' }).fill('la mano')
  await page.getByRole('button', { name: 'Voir la réponse' }).click()
  await expect(page.getByText('Réponse identique ✓')).toBeVisible()
  await audit(page, 'session-after-reveal')

  await page.getByRole('button', { name: 'Correct' }).click()
  await expect(page.getByRole('heading', { name: 'Séance terminée' })).toBeVisible()
  await audit(page, 'complete')
})
