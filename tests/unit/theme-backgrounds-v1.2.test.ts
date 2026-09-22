import { readFileSync } from 'node:fs'
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
    expect(themeBackgroundFor('alimentation', 'fr-en')).toContain('v2.0-theme-backgrounds-fr-en-uk-r1/01-alimentation.svg')
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
    expect(styles).toMatch(/linear-gradient\(rgba\(255, 253, 248, \.8\), rgba\(255, 253, 248, \.8\)\)/u)
  })
})
