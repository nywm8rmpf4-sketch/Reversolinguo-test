import { describe, expect, it } from 'vitest'
import { canonicalThemes } from '../../src/content/taxonomy'
import { themeBackgroundFor, themeBackgrounds } from '../../src/ui/themeBackgrounds'

describe('v1.2 thematic flashcard backgrounds', () => {
  it('maps every canonical theme to one WebP asset', () => {
    expect(Object.keys(themeBackgrounds).sort()).toEqual(canonicalThemes.map((theme) => theme.id).sort())
    expect(Object.values(themeBackgrounds)).toHaveLength(20)
    expect(new Set(Object.values(themeBackgrounds)).size).toBe(20)
    expect(Object.values(themeBackgrounds).every((asset) => asset.includes('.webp'))).toBe(true)
  })

  it('uses a neutral fallback for absent or unknown themes', () => {
    expect(themeBackgroundFor(undefined)).toBeNull()
    expect(themeBackgroundFor('unknown-theme')).toBeNull()
  })
})
