import { describe, expect, it } from 'vitest'
import canonicalEntries from '../../catalogs/fr-es/a1/catalog.json'
import { adultPackId } from '../../src/content/adultReference'
import {
  pack6BAdultPacks,
  pack6BPromotedEntryIds,
  pack6BRuntimePacks,
  pack6BSchoolPacks,
  pack6BThemePacks,
  pack6BVoyageA1EntryIds,
  validatePack6BRuntime
} from '../../src/content/pack6Runtime'
import { validateLearningPackGraph } from '../../src/content/packs'
import { canonicalThemeIds } from '../../src/content/taxonomy'
import { voyagePackId } from '../../src/content/themePaths'

describe('PACK-6B canonical lexical promotion', () => {
  it('promotes exactly the 36 human-approved UUIDs into the 60-entry canonical catalog', () => {
    const ids = new Set(canonicalEntries.map((entry) => entry.entry_id))
    expect(canonicalEntries).toHaveLength(60)
    expect(ids.size).toBe(60)
    expect(pack6BPromotedEntryIds).toHaveLength(36)
    expect(new Set(pack6BPromotedEntryIds).size).toBe(36)
    expect(pack6BPromotedEntryIds.every((entryId) => ids.has(entryId))).toBe(true)

    const promoted = canonicalEntries.filter((entry) => (pack6BPromotedEntryIds as readonly string[]).includes(entry.entry_id))
    expect(promoted).toHaveLength(36)
    expect(promoted.every((entry) => entry.status === 'reviewed')).toBe(true)
    expect(promoted.every((entry) => entry.provenance.reviewed_at === '2026-09-14')).toBe(true)
    expect(promoted.every((entry) => entry.provenance.license === 'CC BY 4.0')).toBe(true)
  })

  it('projects all 60 canonical UUIDs into Adult A1 without cloning lexical identities', () => {
    const adultA1 = pack6BAdultPacks.find((pack) => pack.pack_id === adultPackId('A1'))
    expect(adultA1).toBeDefined()
    expect(adultA1?.entries).toHaveLength(60)
    expect(new Set(adultA1?.entries.map((entry) => entry.entry_id)).size).toBe(60)
    expect(new Set(adultA1?.entries.map((entry) => entry.entry_id))).toEqual(new Set(canonicalEntries.map((entry) => entry.entry_id)))
  })

  it('materializes only the qualified 6e LVA/LVB thematic assignments over the structural references', () => {
    const sixieme = pack6BSchoolPacks.filter((pack) => pack.grade === '6e' && (pack.track === 'LVA' || pack.track === 'LVB'))
    expect(sixieme).toHaveLength(2)
    for (const pack of sixieme) {
      expect(pack.entries).toHaveLength(25)
      expect(new Set(pack.entries.map((entry) => entry.entry_id)).size).toBe(25)
      expect(pack.entries.every((entry) => new Set<string>(pack6BPromotedEntryIds).has(entry.entry_id))).toBe(true)
      expect(pack.entries.every((entry) => pack.themes.includes(entry.theme))).toBe(true)
    }
    expect(sixieme[0].entries).toEqual(sixieme[1].entries)
  })

  it('keeps Voyage A1 deliberately limited to the four approved relations', () => {
    const voyageA1 = pack6BThemePacks.find((pack) => pack.pack_id === voyagePackId('A1'))
    expect(voyageA1).toBeDefined()
    expect(voyageA1?.entries.map((entry) => entry.entry_id)).toEqual(pack6BVoyageA1EntryIds)
    expect(voyageA1?.entries.every((entry) => entry.theme === 'voyage')).toBe(true)
  })

  it('uses one canonical UUID across overlapping packs instead of creating a second SRS identity', () => {
    const sharedId = '4fa70eb3-8cff-57c8-abdc-3c9c397833dc'
    const adultA1 = pack6BAdultPacks.find((pack) => pack.pack_id === adultPackId('A1'))!
    const school6eLva = pack6BSchoolPacks.find((pack) => pack.grade === '6e' && pack.track === 'LVA')!
    const voyageA1 = pack6BThemePacks.find((pack) => pack.pack_id === voyagePackId('A1'))!
    expect(adultA1.entries.some((entry) => entry.entry_id === sharedId)).toBe(true)
    expect(school6eLva.entries.some((entry) => entry.entry_id === sharedId)).toBe(true)
    expect(voyageA1.entries.some((entry) => entry.entry_id === sharedId)).toBe(true)
  })

  it('passes the complete runtime graph and PACK-6B promotion validator', () => {
    const ids = new Set(canonicalEntries.map((entry) => entry.entry_id))
    expect(validateLearningPackGraph(pack6BRuntimePacks, ids, canonicalThemeIds)).toEqual({ valid: true, errors: [] })
    expect(validatePack6BRuntime()).toEqual({ valid: true, errors: [] })
  })
})
