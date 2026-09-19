import { describe, expect, it } from 'vitest'
import { canonicalCatalogEntries, catalogManifest } from '../../src/content/catalog'
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

const activeCanonical = canonicalCatalogEntries.filter((entry) => entry.status !== 'withdrawn')
const activeA1 = activeCanonical.filter((entry) => entry.cefr_level === 'A1')
const activeA2 = activeCanonical.filter((entry) => entry.cefr_level === 'A2')
const activeB1 = activeCanonical.filter((entry) => entry.cefr_level === 'B1')

describe('cumulative A1-B1 canonical runtime promotion invariants', () => {
  it('derives runtime volume from the current canonical data instead of a hard-coded corpus size', () => {
    expect(catalogManifest.entry_count).toBe(canonicalCatalogEntries.length)
    const a1 = pack6BAdultPacks.find((pack) => pack.pack_id === adultPackId('A1'))
    const a2 = pack6BAdultPacks.find((pack) => pack.pack_id === adultPackId('A2'))
    const b1 = pack6BAdultPacks.find((pack) => pack.pack_id === adultPackId('B1'))
    expect(a1?.entries).toHaveLength(activeA1.length)
    expect(a2?.entries).toHaveLength(activeA2.length)
    expect(b1?.entries).toHaveLength(activeB1.length)
    expect(new Set(a1?.entries.map((entry) => entry.entry_id))).toEqual(new Set(activeA1.map((entry) => entry.entry_id)))
    expect(new Set(a2?.entries.map((entry) => entry.entry_id))).toEqual(new Set(activeA2.map((entry) => entry.entry_id)))
    expect(new Set(b1?.entries.map((entry) => entry.entry_id))).toEqual(new Set(activeB1.map((entry) => entry.entry_id)))
    expect(resolveLearningPack(adultPackId('A1'), pack6BAdultPacks)).toHaveLength(activeA1.length)
    expect(resolveLearningPack(adultPackId('A2'), pack6BAdultPacks)).toHaveLength(new Set([...activeA1, ...activeA2].map((entry) => entry.entry_id)).size)
    expect(resolveLearningPack(adultPackId('B1'), pack6BAdultPacks)).toHaveLength(new Set([...activeA1, ...activeA2, ...activeB1].map((entry) => entry.entry_id)).size)
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
    expect(projection.catalog_id).toBe(catalogManifest.catalog_id)
    expect(projection.catalog_version).toBe(catalogManifest.catalog_version)
  })

  it('validates the complete runtime graph without volume-specific constants', () => {
    expect(pack6BRuntimePacks.length).toBeGreaterThan(0)
    expect(validatePack6BRuntime()).toEqual({ valid: true, errors: [] })
  })
})
