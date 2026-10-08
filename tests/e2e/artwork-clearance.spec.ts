import { expect, test } from '@playwright/test'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const pairs = [
  { id: 'fr-es', label: 'Français – espagnol', answer: 'la mano', directory: 'v1.3-theme-backgrounds-fr-es-r1', extension: '.webp', mime: 'image/webp' },
  { id: 'fr-en', label: 'Français – anglais', answer: 'hello', directory: 'v2.0-theme-backgrounds-fr-en-uk-r1', extension: '.svg', mime: 'image/svg+xml' }
]
for (const pair of pairs) {
  test(`${pair.id}: shared illustration region stays separate in every learning state`, async ({ page }, testInfo) => {
    test.setTimeout(120_000)
    const directory = resolve('documentation/design/assets', pair.directory)
    const assets = readdirSync(directory).filter(name => name.endsWith(pair.extension)).map(name => ({
      name, url: `data:${pair.mime};base64,${readFileSync(resolve(directory, name)).toString('base64')}`
    }))
    expect(assets).toHaveLength(20)
    await page.goto('./')
    await page.getByRole('button', { name: 'Français (fr-FR) → Espagnol d’Espagne (es-ES)' }).click()
    await page.getByRole('group', { name: 'Langues' }).getByRole('button', { name: pair.label }).click()
    await page.getByRole('button', { name: 'Découvrir maintenant' }).click()
    const card = page.locator('.flashcard')
    await expect(card).toHaveAttribute('data-pair', pair.id)
    const decoded = await page.evaluate(async resources => Promise.all(resources.map(async asset => {
      const img = new Image()
      img.src = asset.url
      await img.decode()
      return { name: asset.name, width: img.naturalWidth, height: img.naturalHeight }
    })), assets)
    decoded.forEach(asset => {
      expect(asset.width, asset.name).toBeGreaterThan(0)
      expect(asset.height, asset.name).toBeGreaterThan(0)
    })
    const sizes = new Map<number, { width: number; height: number }>()
    for (const face of ['question', 'correction', 'free-correction', 'unknown']) {
      if (face === 'correction') {
        await page.getByRole('textbox', { name: 'Votre réponse' }).fill(pair.answer)
        await page.getByRole('button', { name: 'Voir la réponse' }).click()
        await expect(page.getByText('Réponse identique ✓')).toBeVisible()
      }
      if (face === 'free-correction') {
        await page.getByRole('button', { name: 'Correct', exact: true }).click()
        await page.getByRole('button', { name: 'Fermer la séance' }).click()
        await page.getByRole('button', { name: 'Réviser librement' }).click()
        await page.getByRole('textbox', { name: 'Votre réponse' }).fill(pair.answer)
        await page.getByRole('button', { name: 'Voir la réponse' }).click()
        await expect(page.getByText('Cette révision libre n’a modifié ni vos échéances ni vos statistiques.')).toBeVisible()
      }
      if (face === 'unknown') {
        await page.getByRole('button', { name: 'Fermer la séance' }).click()
        await page.getByRole('button', { name: 'Découvrir maintenant' }).click()
        await page.getByRole('button', { name: 'Je ne sais pas' }).click()
        await expect(page.locator('.correction')).toBeVisible()
      }
      for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 1180, height: 820 }]) {
        await page.setViewportSize(viewport)
        const art = card.locator('.flashcard-art')
        await expect(art).toHaveCount(1)
        await expect(art).toHaveAttribute('aria-hidden', 'true')
        const measurement = await card.evaluate(node => {
          const art = node.querySelector('.flashcard-art')!
          const box = art.getBoundingClientRect()
          const style = getComputedStyle(art)
          const textBoxes = Array.from(node.children).filter(child => child !== art).map(child => child.getBoundingClientRect())
          return {
            width: box.width, height: box.height,
            gap: Math.min(...textBoxes.map(rect => rect.top - box.bottom)),
            background: getComputedStyle(node).backgroundImage,
            image: style.backgroundImage, size: style.backgroundSize,
            position: style.backgroundPosition, repeat: style.backgroundRepeat,
            overflow: document.documentElement.scrollWidth - innerWidth
          }
        })
        expect(measurement.background).toBe('none')
        expect(measurement.image).toContain('url(')
        expect(measurement.size).toBe('cover, contain')
        expect(measurement.position).toBe('50% 50%, 50% 50%')
        expect(measurement.repeat).toBe('no-repeat, no-repeat')
        expect(measurement.gap, `${pair.id} ${face} ${viewport.width}`).toBeGreaterThanOrEqual(15.9)
        expect(measurement.height).toBeGreaterThanOrEqual(112)
        expect(measurement.height).toBeLessThanOrEqual(160)
        // Contain fits the complete bounds of every asset, independent of card height.
        for (const asset of decoded) {
          const scale = Math.min(measurement.width / asset.width, measurement.height / asset.height)
          expect(asset.width * scale).toBeLessThanOrEqual(measurement.width + .01)
          expect(asset.height * scale).toBeLessThanOrEqual(measurement.height + .01)
        }
        if (face === 'question') sizes.set(viewport.width, { width: measurement.width, height: measurement.height })
        else {
          expect(measurement.width).toBeCloseTo(sizes.get(viewport.width)!.width, 1)
          expect(measurement.height).toBeCloseTo(sizes.get(viewport.width)!.height, 1)
        }
        await page.screenshot({ path: `qa-visual/${testInfo.project.name}-${pair.id}-${viewport.width}-${face}.png`, fullPage: true })
        expect(measurement.overflow, `${pair.id} ${face} ${viewport.width}`).toBeLessThanOrEqual(0)
      }
    }
    await page.emulateMedia({ forcedColors: 'active' })
    await expect(card.locator('.flashcard-art')).toBeHidden()
    await expect(page.getByRole('textbox', { name: 'Votre réponse' })).toBeVisible()
  })
}
