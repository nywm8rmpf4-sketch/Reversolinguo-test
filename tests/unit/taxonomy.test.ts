import { describe, expect, it } from 'vitest'
import canonicalEntries from '../../catalogs/fr-es/a1/catalog.json'
import { validateLearningPackGraph, type LearningPack } from '../../src/content/packs'
import {
  canonicalThemeIds,
  canonicalThemes,
  themeIdsForEntry,
  validateTaxonomyAssignments,
  v1_0_1ThemeAssignments
} from '../../src/content/taxonomy'
import { validateExternalThemeMapping, type ExternalThemeMapping } from '../../src/content/themeMappings'

interface CatalogEntry {
  entry_id: string
  status: 'draft' | 'reviewed' | 'validated' | 'withdrawn'
}

const activeEntryIds = new Set(
  (canonicalEntries as CatalogEntry[])
    .filter((entry) => entry.status !== 'withdrawn')
    .map((entry) => entry.entry_id)
)
const historicalEntryIds = new Set((canonicalEntries as CatalogEntry[]).slice(0, 24).map((entry) => entry.entry_id))

function adultPack(theme: string): LearningPack {
  return {
    pack_id: 'adult-a1-taxonomy-check',
    pack_version: '2026.1',
    audience: 'adult',
    language_pair: 'fr-es',
    framework: 'CEFR',
    framework_version: 'Companion Volume 2020',
    cefr_target: 'A1',
    inherits_from: [],
    themes: [theme],
    entries: [{
      entry_id: '69046998-47e6-5570-b469-5a5cc961a97e',
      role: 'core',
      priority: 1,
      theme
    }],
    sources: ['https://www.coe.int/en/web/common-european-framework-reference-languages'],
    status: 'draft',
    human_review: 'NOT_EXECUTED'
  }
}

describe('canonical thematic taxonomy', () => {
  it('uses unique stable ASCII identifiers', () => {
    const ids = canonicalThemes.map((theme) => theme.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.every((id) => /^[a-z0-9-]+$/.test(id))).toBe(true)
    expect(ids).toContain('description')
    expect(ids).toContain('espace-orientation')
  })

  it('preserves the qualified mappings for exactly the 24 historical UUIDs', () => {
    expect(historicalEntryIds.size).toBe(24)
    expect(v1_0_1ThemeAssignments).toHaveLength(24)
    expect(validateTaxonomyAssignments(v1_0_1ThemeAssignments, historicalEntryIds)).toEqual({ valid: true, errors: [] })
    expect(new Set(v1_0_1ThemeAssignments.map((assignment) => assignment.entry_id))).toEqual(historicalEntryIds)
  })

  it('resolves a non-empty canonical taxonomy for all 60 active entries', () => {
    expect(activeEntryIds.size).toBe(60)
    for (const entryId of activeEntryIds) {
      const themes = themeIdsForEntry(entryId)
      expect(themes.length, entryId).toBeGreaterThan(0)
      expect(themes.every((theme) => canonicalThemeIds.has(theme))).toBe(true)
    }
  })

  it('resolves ambiguous historical tags by lexical identity instead of a lossy global conversion', () => {
    expect(themeIdsForEntry('b4e18613-8478-5b0a-8f0b-4e1a626b38f4')).toEqual(['alimentation'])
    expect(themeIdsForEntry('97cccb34-ce0e-520f-9c02-081b30a17e2f')).toEqual(['identite', 'espace-orientation'])
    expect(themeIdsForEntry('214eddb7-23b0-5176-9fe0-eb915002c79a')).toEqual(['ecole-etudes', 'travail-metiers'])
  })

  it('reads PACK-6B themes directly from the human-reviewed canonical lexical entry', () => {
    expect(themeIdsForEntry('7578519f-22d5-5ccd-9ca1-038c97977078')).toEqual(['vetements', 'sports'])
    expect(themeIdsForEntry('fe984172-dd41-546e-ac2e-18f679281f6b')).toEqual(['maison', 'ville-services'])
  })

  it('reports orphan entry and theme references', () => {
    const result = validateTaxonomyAssignments([
      { entry_id: 'missing-entry', theme_ids: ['communication'] },
      { entry_id: '69046998-47e6-5570-b469-5a5cc961a97e', theme_ids: ['not-a-theme' as never] }
    ], historicalEntryIds)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('unknown-entry-assignment:missing-entry')
    expect(result.errors).toContain('unknown-theme:69046998-47e6-5570-b469-5a5cc961a97e:not-a-theme')
  })
})

describe('external framework theme mappings', () => {
  it('keeps framework/version/source metadata separate from the stable taxonomy', () => {
    const mapping: ExternalThemeMapping = {
      mapping_id: 'test-fr-school-2025',
      framework: 'Education nationale FR',
      framework_version: 'BO-2025-22',
      scope: 'test-only',
      source_urls: ['https://www.education.gouv.fr/bo/2025/Hebdo22/'],
      mappings: [{
        theme_id: 'communication',
        external_axis_id: 'axis-test',
        external_axis_label: 'Axe de test'
      }]
    }
    expect(validateExternalThemeMapping(mapping)).toEqual({ valid: true, errors: [] })
    expect(validateExternalThemeMapping({ ...mapping, framework_version: '' }).errors).toContain('missing-framework-version')
  })
})

describe('LearningPack taxonomy guard', () => {
  it('accepts canonical theme ids and rejects undeclared taxonomy ids when the guard is enabled', () => {
    expect(validateLearningPackGraph([adultPack('corps-sante')], activeEntryIds, canonicalThemeIds)).toEqual({ valid: true, errors: [] })

    const invalid = validateLearningPackGraph([adultPack('corps')], activeEntryIds, canonicalThemeIds)
    expect(invalid.valid).toBe(false)
    expect(invalid.errors).toContain('unknown-pack-theme:adult-a1-taxonomy-check:corps')
    expect(invalid.errors).toContain('unknown-entry-theme:adult-a1-taxonomy-check:69046998-47e6-5570-b469-5a5cc961a97e:corps')
  })
})
