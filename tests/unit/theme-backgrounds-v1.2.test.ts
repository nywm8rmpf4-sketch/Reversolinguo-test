import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { canonicalThemes } from '../../src/content/taxonomy'
import { frEnUkThemeBackgrounds, frEsThemeBackgrounds, themeBackgroundFor, themeBackgrounds } from '../../src/ui/themeBackgrounds'

describe('v1.2 thematic flashcard backgrounds', () => {
  it('maps every canonical theme to one WebP asset', () => {
    expect(Object.keys(themeBackgrounds).sort()).toEqual(canonicalThemes.map((theme) => theme.id).sort())
    expect(Object.values(themeBackgrounds)).toHaveLength(20)
    expect(new Set(Object.values(themeBackgrounds)).size).toBe(20)
    expect(Object.values(themeBackgrounds).every((asset) => asset.includes('.webp'))).toBe(true)
  })

  it('selects backgrounds by pair without cross-pair fallback', () => {
    expect(Object.keys(frEsThemeBackgrounds)).toHaveLength(20)
    expect(Object.keys(frEnUkThemeBackgrounds)).toHaveLength(20)
    expect(new Set(Object.values(frEnUkThemeBackgrounds)).size).toBe(20)
    expect(themeBackgroundFor('alimentation', 'fr-es')).toContain('v1.3-theme-backgrounds-fr-es-r1')
    expect(themeBackgroundFor('alimentation', 'fr-en')).toBe(frEnUkThemeBackgrounds.alimentation)
    expect(themeBackgroundFor('alimentation', 'fr-en')).not.toBe(themeBackgroundFor('alimentation', 'fr-es'))
    expect(themeBackgroundFor('alimentation', 'unknown-pair')).toBeNull()
  })

  it('uses a neutral fallback for absent or unknown themes', () => {
    expect(themeBackgroundFor(undefined, 'fr-es')).toBeNull()
    expect(themeBackgroundFor('unknown-theme', 'fr-es')).toBeNull()
  })

  it('keeps a visible French label available for every illustrated theme', () => {
    expect(canonicalThemes.every((theme) => theme.label_fr.trim().length > 0)).toBe(true)
    expect(new Set(canonicalThemes.map((theme) => theme.label_fr)).size).toBe(20)
  })

  it('keeps the validated palette visible through a bounded paper wash', () => {
    const styles = readFileSync(resolve(process.cwd(), 'src/ui/styles.css'), 'utf8')
    expect(styles).toContain("--flashcard-theme-wash, rgba(255, 253, 248, .8)")
  })
  it('keeps all 20 UK SVG artworks in a shared upper decorative band without changing the ES renderer', () => {
    const directory = resolve(process.cwd(), 'documentation/design/assets/v2.0-theme-backgrounds-fr-en-uk-r1')
    const files = readdirSync(directory).filter((name) => name.endsWith('.svg')).sort()
    expect(files).toHaveLength(20)
    const viewBox = 'viewBox="-160 -130 680 540"'
    const artworkTransform = 'transform="translate(90 -142) scale(0.5)"'
    for (const file of files) {
      const svg = readFileSync(resolve(directory, file), 'utf8')
      expect(svg).toContain(viewBox)
      expect(svg).toContain(artworkTransform)
      expect(svg.match(/<g\b/g)).toHaveLength(1)
      expect(svg).not.toMatch(/<script\b|<foreignObject\b|<image\b|\bhref=/i)
    }
    // Source drawings occupy approximately x=18..342 and y=37..257.
    // Under the common transform, their envelope is x=99..261 and y=-123.5..-13.5,
    // inside the 680x540 viewBox and above the learning controls on tall cards.
    expect(90 + 0.5 * 18).toBeGreaterThan(-160)
    expect(90 + 0.5 * 342).toBeLessThan(520)
    expect(-142 + 0.5 * 37).toBeGreaterThan(-130)
    expect(-142 + 0.5 * 257).toBeLessThan(-10)
    const app = readFileSync(resolve(process.cwd(), 'src/app/App.tsx'), 'utf8')
    expect(app).toContain("'--flashcard-theme-size': 'cover'")
    expect(app).toContain("'--flashcard-theme-position': 'center'")
  })

})
