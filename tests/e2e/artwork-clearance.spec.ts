import { expect, test } from '@playwright/test'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const directory = resolve('documentation/design/assets/v2.0-theme-backgrounds-fr-en-uk-r1')
const artworks = readdirSync(directory).filter(name => name.endsWith('.svg')).map(name => ({ name, svg: readFileSync(resolve(directory, name), 'utf8') }))

test('UK painted pixels remain clear of learning content before and after reveal', async ({ page }, testInfo) => {
  test.setTimeout(90_000)
  await page.goto('./')
  await page.getByRole('button', { name: 'Français (fr-FR) → Espagnol d’Espagne (es-ES)' }).click()
  await page.getByRole('group', { name: 'Langues' }).getByRole('button', { name: 'Français – anglais' }).click()
  await page.getByRole('button', { name: 'Découvrir maintenant' }).click()
  await expect(page.locator('.flashcard')).toBeVisible()
  const viewports = [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 1180, height: 820 }]
  const paintedSizes = new Map<number, number[]>()
  for (const face of ['question', 'correction', 'free-correction', 'unknown']) {
    if (face === 'correction') {
      await page.getByRole('textbox', { name: 'Votre réponse' }).fill('hello')
      await page.getByRole('button', { name: 'Voir la réponse' }).click()
      await expect(page.getByText('Réponse identique ✓')).toBeVisible()
    }
    if (face === 'free-correction') {
      await page.getByRole('button', { name: 'Correct', exact: true }).click()
      await page.getByRole('button', { name: 'Fermer la séance' }).click()
      await page.getByRole('button', { name: 'Réviser librement' }).click()
      await page.getByRole('textbox', { name: 'Votre réponse' }).fill('hello')
      await page.getByRole('button', { name: 'Voir la réponse' }).click()
      await expect(page.getByText('Cette révision libre n’a modifié ni vos échéances ni vos statistiques.')).toBeVisible()
    }
    if (face === 'unknown') {
      await page.getByRole('button', { name: 'Fermer la séance' }).click()
      await page.getByRole('button', { name: 'Découvrir maintenant' }).click()
      await page.getByRole('button', { name: 'Je ne sais pas' }).click()
      await expect(page.locator('.correction')).toBeVisible()
    }
    for (const viewport of viewports) {
      await page.setViewportSize(viewport)
      const measurements = await page.locator('.flashcard').evaluate(async (card, assets) => {
        const style = getComputedStyle(card)
        const rect = card.getBoundingClientRect()
        const width = rect.width - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth)
        const height = rect.height - parseFloat(style.borderTopWidth) - parseFloat(style.borderBottomWidth)
        const left = rect.left + parseFloat(style.borderLeftWidth)
        const top = rect.top + parseFloat(style.borderTopWidth)
        const contentTop = Math.min(...Array.from(card.children).map(child => child.getBoundingClientRect().top))
        const results = []
        for (const asset of assets) {
          const documentSvg = new DOMParser().parseFromString(asset.svg, 'image/svg+xml').documentElement
          const box = documentSvg.getAttribute('viewBox')!.split(/\s+/).map(Number)
          documentSvg.setAttribute('width', String(box[2]))
          documentSvg.setAttribute('height', String(box[3]))
          const image = new Image()
          image.src = `data:image/svg+xml,${encodeURIComponent(new XMLSerializer().serializeToString(documentSvg))}`
          await image.decode()
          const canvas = document.createElement('canvas')
          canvas.width = box[2]; canvas.height = box[3]
          const context = canvas.getContext('2d')!
          context.drawImage(image, 0, 0)
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
          let minX = canvas.width, maxX = -1, minY = canvas.height, maxY = -1
          for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
            if (pixels[(y * canvas.width + x) * 4 + 3] > 8) {
              minX = Math.min(minX, x); maxX = Math.max(maxX, x)
              minY = Math.min(minY, y); maxY = Math.max(maxY, y)
            }
          }
          const size = style.backgroundSize.split(',').at(-1)!.trim()
          const position = style.backgroundPosition.split(',').at(-1)!.trim()
          if (!['cover', '100% auto'].includes(size)) throw new Error(`Unsupported background size ${size}`)
          if (!['50% 50%', '50% 0%'].includes(position)) throw new Error(`Unsupported position ${position}`)
          const scale = size === 'cover' ? Math.max(width / box[2], height / box[3]) : width / box[2]
          const offsetX = (width - box[2] * scale) / 2
          const offsetY = position === '50% 0%' ? 0 : (height - box[3] * scale) / 2
          results.push({ name: asset.name, nonempty: maxX >= minX, gap: contentTop - (top + offsetY + (maxY + 1) * scale), left: left + offsetX + minX * scale - rect.left, right: rect.right - (left + offsetX + (maxX + 1) * scale), paintedHeight: (maxY - minY + 1) * scale })
        }
        return results
      }, artworks)
      expect(measurements).toHaveLength(20)
      for (const result of measurements) {
        expect(result.nonempty, result.name).toBe(true)
        expect(result.gap, `${face} ${viewport.width} ${result.name}: painted pixels vs first text`).toBeGreaterThanOrEqual(16)
        expect(result.left, result.name).toBeGreaterThan(0)
        expect(result.right, result.name).toBeGreaterThan(0)
      }
      if (face === 'question') paintedSizes.set(viewport.width, measurements.map(m => m.paintedHeight))
      else measurements.forEach((m, i) => expect(m.paintedHeight).toBeCloseTo(paintedSizes.get(viewport.width)![i], 1))
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.screenshot({ path: `qa-visual/${testInfo.project.name}-${viewport.width}-${face}.png`, fullPage: true })
    }
  }
})
