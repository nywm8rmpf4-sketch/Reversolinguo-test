import { describe, expect, it } from 'vitest'
import canonicalEntries from '../../catalogs/fr-es/a1/catalog.json'
import manifest from '../../catalogs/fr-es/a1/manifest.json'
import {
  a1MacroPromotedEntryIds,
  pack6BAdultPacks,
  pack6BPromotedEntryIds,
  pack6BRuntimePacks,
  pack6BSchoolPacks,
  pack6BThemePacks,
  validatePack6BRuntime
} from '../../src/content/pack6Runtime'
import { legacyPack6School6eAssignments, legacyPack6VoyageA1EntryIds } from '../../src/content/legacyPack6Projection'
import { adultPackId } from '../../src/content/adultReference'
import { resolveLearningPack } from '../../src/content/packs'
import { boundRuntimeProjection, hasBoundRuntimeProjection } from '../../src/content/runtimeProjection'
import { voyagePackId } from '../../src/content/themePaths'

const activeCanonical = canonicalEntries.filter((entry) => entry.status !== 'withdrawn')

describe('A1 canonical runtime promotion invariants', () => {
  it('derives runtime volume from the current canonical data instead of a hard-coded corpus size', () => {
    expect(manifest.entry_count).toBe(canonicalEntries.length)
    const adult = pack6BAdultPacks.find((pack) => pack.pack_id === adultPackId('A1'))
    expect(adult?.entries).toHaveLength(activeCanonical.length)
    expect(new Set(adult?.entries.map((entry) => entry.entry_id))).toEqual(new Set(activeCanonical.map((entry) => entry.entry_id)))
    expect(resolveLearningPack(adultPackId('A1'), pack6BAdultPacks)).toHaveLength(activeCanonical.length)
  })

  it('derives promotion groups from immutable review metadata and keeps them disjoint', () => {
    const pack6 = new Set(pack6BPromotedEntryIds)
    const macro = new Set(a1MacroPromotedEntryIds)
    expect(pack6.size).toBe(pack6BPromotedEntryIds.length)
    expect(macro.size).toBe(a1MacroPromotedEntryIds.length)
    expect([...pack6].some((entryId) => macro.has(entryId))).toBe(false)
  })

  it('keeps the historical placeholder projection frozen until a hash-bound projection is present', () => {
    if (hasBoundRuntimeProjection()) return
    for (const track of ['LVA', 'LVB'] as const) {
      const school = pack6BSchoolPacks.find((pack) => pack.grade === '6e' && pack.track === track)
      expect(school?.entries).toHaveLength(legacyPack6School6eAssignments.length)
    }
    const voyage = pack6BThemePacks.find((pack) => pack.pack_id === voyagePackId('A1'))
    expect(voyage?.entries).toHaveLength(legacyPack6VoyageA1EntryIds.length)
  })

  it('uses only hash-bound projection data when the manifest binds a projection', () => {
    const projection = boundRuntimeProjection()
    if (!projection) return
    expect(projection.catalog_id).toBe('fr-es-a1')
    expect(projection.catalog_version).toBe(manifest.catalog_version)
  })

  it('validates the complete runtime graph without volume-specific constants', () => {
    expect(pack6BRuntimePacks.length).toBeGreaterThan(0)
    expect(validatePack6BRuntime()).toEqual({ valid: true, errors: [] })
  })
})
