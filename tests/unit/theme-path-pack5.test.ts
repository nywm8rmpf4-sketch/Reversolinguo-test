import { describe, expect, it } from 'vitest'
import { validateLearningPackGraph, type LearningPack, type PackEntry } from '../../src/content/packs'
import { canonicalThemeIds } from '../../src/content/taxonomy'
import {
  resolveThemeScopeEntries,
  validateVoyageThemePath,
  voyageLevels,
  voyagePackForLevel,
  voyagePackId,
  voyageThemePacks
} from '../../src/content/themePaths'

const entryA = '69046998-47e6-5570-b469-5a5cc961a97e'
const entryB = '36e27c44-5b63-5024-bd41-81546b1e9191'
const entryC = '6d9f4fb0-63d0-5e4b-b364-5308faba9ef4'

function relation(entry_id: string, theme: string, priority: number): PackEntry {
  return { entry_id, role: 'core', priority, theme }
}

function currentAdultPack(): LearningPack {
  return {
    pack_id: 'fixture-current-adult-a2',
    pack_version: 'test',
    audience: 'adult',
    language_pair: 'fr-es',
    framework: 'CEFR',
    framework_version: 'test',
    cefr_target: 'A2',
    inherits_from: [],
    themes: ['voyage', 'alimentation'],
    entries: [relation(entryA, 'voyage', 10), relation(entryB, 'alimentation', 20)],
    sources: ['test'],
    status: 'draft',
    human_review: 'NOT_EXECUTED'
  }
}

function populatedVoyagePacks(): LearningPack[] {
  return voyageThemePacks.map((pack) => {
    if (pack.cefr_target === 'A1') return { ...pack, entries: [relation(entryA, 'voyage', 30)] }
    if (pack.cefr_target === 'A2') return { ...pack, entries: [relation(entryC, 'voyage', 20)] }
    if (pack.cefr_target === 'B1') return { ...pack, entries: [relation(entryB, 'voyage', 10)] }
    return { ...pack }
  })
}

describe('PACK-5 autonomous theme paths', () => {
  it('materializes exactly Voyage A1 to B2 as structural theme manifests', () => {
    expect(voyageLevels).toEqual(['A1', 'A2', 'B1', 'B2'])
    expect(voyageThemePacks).toHaveLength(4)
    expect(voyageThemePacks.map((pack) => pack.cefr_target)).toEqual(['A1', 'A2', 'B1', 'B2'])

    for (const pack of voyageThemePacks) {
      expect(pack.audience).toBe('theme')
      expect(pack.themes).toEqual(['voyage'])
      expect(pack.entries).toEqual([])
      expect(pack.status).toBe('draft')
      expect(pack.human_review).toBe('NOT_EXECUTED')
    }

    expect(validateVoyageThemePath()).toEqual({ valid: true, errors: [] })
    expect(validateLearningPackGraph(voyageThemePacks, undefined, canonicalThemeIds)).toEqual({ valid: true, errors: [] })
  })

  it('builds deterministic cumulative Voyage inheritance A1 -> A2 -> B1 -> B2', () => {
    expect(voyagePackForLevel('A1')?.inherits_from).toEqual([])
    expect(voyagePackForLevel('A2')?.inherits_from).toEqual([voyagePackId('A1')])
    expect(voyagePackForLevel('B1')?.inherits_from).toEqual([voyagePackId('A2')])
    expect(voyagePackForLevel('B2')?.inherits_from).toEqual([voyagePackId('B1')])
  })

  it('keeps current-path filtering distinct from the autonomous theme-path', () => {
    const current = currentAdultPack()
    const themePacks = populatedVoyagePacks()
    const packs = [current, ...themePacks]

    const currentPath = resolveThemeScopeEntries({
      scope: 'current-path',
      themeId: 'voyage',
      currentPackId: current.pack_id,
      packs
    })
    const themePath = resolveThemeScopeEntries({
      scope: 'theme-path',
      themeId: 'voyage',
      themePackId: voyagePackId('B1'),
      packs
    })

    expect(currentPath.map((entry) => entry.entry_id)).toEqual([entryA])
    expect(themePath.map((entry) => entry.entry_id)).toEqual([entryB, entryC, entryA])
    expect(themePath.filter((entry) => entry.entry_id === entryA)).toHaveLength(1)
  })

  it('does not leak non-travel entries from the current path', () => {
    const current = currentAdultPack()
    const selected = resolveThemeScopeEntries({
      scope: 'current-path',
      themeId: 'voyage',
      currentPackId: current.pack_id,
      packs: [current]
    })

    expect(selected.map((entry) => entry.entry_id)).not.toContain(entryB)
    expect(selected.every((entry) => entry.theme === 'voyage')).toBe(true)
  })

  it('rejects a non-theme pack when theme-path scope is requested', () => {
    const current = currentAdultPack()
    expect(() => resolveThemeScopeEntries({
      scope: 'theme-path',
      themeId: 'voyage',
      themePackId: current.pack_id,
      packs: [current]
    })).toThrow(/audience=theme/)
  })

  it('rejects missing scope identifiers instead of silently falling back', () => {
    expect(() => resolveThemeScopeEntries({ scope: 'current-path', themeId: 'voyage', packs: [] })).toThrow(/currentPackId/)
    expect(() => resolveThemeScopeEntries({ scope: 'theme-path', themeId: 'voyage', packs: [] })).toThrow(/themePackId/)
  })
})
